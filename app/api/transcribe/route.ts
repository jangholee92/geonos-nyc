import { getChatGPTUser } from '../../chatgpt-auth';
import { readVoiceUpload, transcribeVoice, VoiceTranscriptionError, VOICE_MODEL, VOICE_MAX_DURATION_MS, VOICE_MAX_UPLOAD_BYTES, VOICE_TIMEOUT_MS } from '../../../lib/voice-transcription';

type Binding = Record<string, unknown>;
// Request-budget metadata only; no audio, filenames or transcript retention.
const windows = new Map<string, { start: number; count: number }>();
const active = new Set<string>();
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
  return json({ configured: Boolean(key), approved, canRun: Boolean(key) && approved, model: VOICE_MODEL, maxDurationMs: VOICE_MAX_DURATION_MS, maxUploadBytes: VOICE_MAX_UPLOAD_BYTES,
    format: 'RIFF/WAVE, mono 16-bit integer PCM, 16000 or 24000 Hz', languages: ['English', 'Korean'], editable: true, autoSend: false, liveVerified: false });
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return fail('Sign in to transcribe a recording.', 'AUTH_REQUIRED', 401);
  const { key, approved } = await config();
  if (!approved) return fail('Meta API approval is pending. No recording was sent.', 'MODEL_APPROVAL_PENDING', 503);
  if (!key) return fail('Voice transcription is not connected. No recording was sent.', 'MODEL_NOT_CONFIGURED', 503);
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) return fail('Submit recordings from this application.', 'VOICE_ORIGIN_REJECTED', 403);
  const now = Date.now();
  for (const [id, value] of windows) if (now - value.start >= 60_000) windows.delete(id);
  const window = windows.get(user.userId) ?? { start: now, count: 0 };
  if (window.count >= 6 || active.has(user.userId) || (!windows.has(user.userId) && windows.size >= 2048)) return fail('Finish the current recording request or try again shortly.', 'RATE_LIMITED', 429);
  window.count++; windows.set(user.userId, window); active.add(user.userId);
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
    if (timedOut) return fail('Voice transcription timed out. No retry was made.', 'VOICE_TIMEOUT', 504);
    if (request.signal.aborted) return fail('Transcription was cancelled. No draft was accepted.', 'VOICE_CANCELLED', 499);
    if (error instanceof VoiceTranscriptionError) return fail(error.message, error.code, error.status);
    return fail('The recording could not be transcribed. No retry was made.', 'VOICE_REQUEST_FAILED', 502);
  } finally {
    clearTimeout(timer); request.signal.removeEventListener('abort', parentAbort); active.delete(user.userId);
  }
}
