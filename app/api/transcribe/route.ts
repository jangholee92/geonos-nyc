import { getMetaSpendStatus, MetaSpendError } from '../../../lib/meta-paid-fetch';
import { getDemoActor } from '../../../lib/demo-access';
import { readVoiceUpload, transcribeVoice, VoiceTranscriptionError, VOICE_MODEL, VOICE_MAX_DURATION_MS, VOICE_MAX_UPLOAD_BYTES, VOICE_TIMEOUT_MS } from '../../../lib/voice-transcription';

type Binding = Record<string, unknown>;
// Request-budget metadata only; no audio, filenames or transcript retention.
const windows = new Map<string, { start: number; count: number }>();
const active = new Set<string>();
const dailyWindows = new Map<string, number>();
let sharedDay = -1, sharedDayCount = 0;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const fail = (error: string, code: string, status: number) => json({ error, code }, status);
async function config() {
  let bindings: Binding = {};
  try { const { env } = await import('cloudflare:workers'); bindings = env as unknown as Binding; }
  catch { /* Node development has no Worker bindings. */ }
  const rawKey = bindings.MODEL_API_KEY ?? process.env.MODEL_API_KEY;
  return { key: typeof rawKey === 'string' ? rawKey.trim() : '', approved: (bindings.META_API_APPROVED ?? process.env.META_API_APPROVED) === 'true' };
}
export async function GET() {
  const { key, approved } = await config();
  const user = await getDemoActor();
  const spend = key && approved && user ? await getMetaSpendStatus({model:VOICE_MODEL,operation:'voice'}) : {status:'unavailable' as const};
  return json({ configured: Boolean(key), approved, canRun: Boolean(key) && approved && Boolean(user) && spend.status === 'available', spendStatus: spend.status, requiresSignIn: false, accessMode: 'anonymous-demo', model: VOICE_MODEL, maxDurationMs: VOICE_MAX_DURATION_MS, maxUploadBytes: VOICE_MAX_UPLOAD_BYTES,
    format: 'RIFF/WAVE, mono 16-bit integer PCM, 16000 or 24000 Hz', languages: ['English', 'Korean'], editable: true, autoSend: false, liveVerified: false });
}
export async function POST(request: Request) {
  const user = await getDemoActor();
  if (!user) return fail('The public voice demo is temporarily unavailable.', 'DEMO_UNAVAILABLE', 503);
  const { key, approved } = await config();
  if (!approved) return fail('Meta API approval is pending. No recording was sent.', 'MODEL_APPROVAL_PENDING', 503);
  if (!key) return fail('Voice transcription is not connected. No recording was sent.', 'MODEL_NOT_CONFIGURED', 503);
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) return fail('Submit recordings from this application.', 'VOICE_ORIGIN_REJECTED', 403);
  const now = Date.now();
  const day = Math.floor(now / 86_400_000);
  if (sharedDay !== day) { sharedDay = day; sharedDayCount = 0; dailyWindows.clear(); }
  for (const [id, value] of windows) if (now - value.start >= 60_000) windows.delete(id);
  const window = windows.get(user.userId) ?? { start: now, count: 0 };
  if (window.count >= 6 || active.has(user.userId) || active.size >= 4 || (!dailyWindows.has(user.userId) && dailyWindows.size >= 2048)) return fail('Finish the current recording request or try again shortly.', 'RATE_LIMITED', 429);
  const daily = dailyWindows.get(user.userId) ?? 0;
  if (daily >= 12 || sharedDayCount >= 80) return fail('The daily voice allowance has been reached. You can still type a question.', 'DAILY_LIMIT_REACHED', 429);
  window.count++; windows.set(user.userId, window); active.add(user.userId);
  dailyWindows.set(user.userId, daily + 1); sharedDayCount++;
  const controller = new AbortController(); let timedOut = false;
  const parentAbort = () => controller.abort();
  request.signal.addEventListener('abort', parentAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, VOICE_TIMEOUT_MS);
  try {
    if (request.signal.aborted) controller.abort();
    const audio = await readVoiceUpload(request, controller.signal);
    const result = await transcribeVoice(audio, key, controller.signal);
    if (controller.signal.aborted) throw new VoiceTranscriptionError('VOICE_CANCELLED', 'Transcription was cancelled. No draft was accepted.', 499);
    return json(result);
  } catch (error) {
    if (error instanceof MetaSpendError) return fail(error.message,error.code,error.status);
    if (timedOut) return fail('Voice transcription timed out. No retry was made.', 'VOICE_TIMEOUT', 504);
    if (request.signal.aborted) return fail('Transcription was cancelled. No draft was accepted.', 'VOICE_CANCELLED', 499);
    if (error instanceof VoiceTranscriptionError) return fail(error.message, error.code, error.status);
    return fail('The recording could not be transcribed. No retry was made.', 'VOICE_REQUEST_FAILED', 502);
  } finally {
    clearTimeout(timer); request.signal.removeEventListener('abort', parentAbort); active.delete(user.userId);
  }
}
