/** Meta file-ASR contract:
 * https://dev.meta.ai/docs/api-reference/voice/transcribe
 * https://dev.meta.ai/docs/api-reference/voice/schemas
 * Audio and transcripts are held only for the request; neither is logged/saved.
 */
export const VOICE_MODEL = 'muse-voice-transcribe-1.0' as const;
export const VOICE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const VOICE_MAX_DURATION_MS = 60_000;
export const VOICE_TIMEOUT_MS = 60_000;
const ENDPOINT = 'https://api.meta.ai/v1/asr/transcribe';
const MAX_RESPONSE_BYTES = 64_000;
const MAX_TRANSCRIPT_CHARS = 4_000;
type ObjectValue = Record<string, unknown>;
type VoiceCode = 'VOICE_INVALID_UPLOAD' | 'VOICE_TOO_LARGE' | 'VOICE_INVALID_AUDIO' | 'VOICE_TOO_LONG' | 'VOICE_CANCELLED' | 'VOICE_TIMEOUT' | 'VOICE_NOT_CONFIGURED' | 'VOICE_AUTH_FAILED' | 'VOICE_RATE_LIMITED' | 'VOICE_CONTENT_FILTERED' | 'VOICE_REQUEST_FAILED' | 'VOICE_INVALID_RESPONSE' | 'VOICE_NO_SPEECH';
export class VoiceTranscriptionError extends Error {
  constructor(public code: VoiceCode, message: string, public status = 400) {
    super(message); this.name = 'VoiceTranscriptionError';
  }
}
export type VoiceTranscript = {
  kind: 'voice_transcript'; model: typeof VOICE_MODEL; transcript: string;
  /** Duration measured from the validated PCM upload, not a transcript estimate. */
  audioDurationMs: number; editable: true; autoSend: false; isEvidence: false;
};
type CanonicalAudio = { wav: Uint8Array<ArrayBuffer>; audioDurationMs: number; sampleRate: 16_000 | 24_000 };
const object = (v: unknown): v is ObjectValue => !!v && typeof v === 'object' && !Array.isArray(v);
const cancelled = () => new VoiceTranscriptionError('VOICE_CANCELLED', 'Transcription was cancelled. No draft was accepted.', 499);
const invalidAudio = () => new VoiceTranscriptionError('VOICE_INVALID_AUDIO', 'Use a mono, 16-bit PCM WAV recording at 16 kHz or 24 kHz.');
const ascii = (bytes: Uint8Array, offset: number, size: number) => String.fromCharCode(...bytes.subarray(offset, offset + size));

/** Validate actual RIFF chunks, not file extension/MIME or client duration.
 * Rebuild a minimal WAV so filenames, ancillary metadata and trailing content
 * are never forwarded to the transcription service. No audio resampling occurs.
 */
export function canonicalizeVoiceWav(bytes: Uint8Array): CanonicalAudio {
  if (bytes.byteLength > VOICE_MAX_UPLOAD_BYTES) throw new VoiceTranscriptionError('VOICE_TOO_LARGE', 'The recording upload must be 10 MiB or smaller.', 413);
  if (bytes.byteLength < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') throw invalidAudio();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.byteLength) throw invalidAudio();
  let offset = 12, chunks = 0, format: { sampleRate: 16_000 | 24_000 } | null = null;
  let samples: Uint8Array | null = null;
  while (offset < bytes.byteLength) {
    if (++chunks > 256 || offset + 8 > bytes.byteLength) throw invalidAudio();
    const id = ascii(bytes, offset, 4), size = view.getUint32(offset + 4, true), start = offset + 8;
    const next = start + size + (size & 1);
    if (next > bytes.byteLength) throw invalidAudio();
    if (id === 'fmt ') {
      if (format || size < 16) throw invalidAudio();
      const rate = view.getUint32(start + 4, true);
      if (view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1 ||
          (rate !== 16_000 && rate !== 24_000) || view.getUint32(start + 8, true) !== rate * 2 ||
          view.getUint16(start + 12, true) !== 2 || view.getUint16(start + 14, true) !== 16) throw invalidAudio();
      format = { sampleRate: rate };
    } else if (id === 'data') {
      if (samples || size === 0 || size % 2 !== 0) throw invalidAudio();
      samples = bytes.subarray(start, start + size);
    }
    offset = next;
  }
  if (offset !== bytes.byteLength || !format || !samples) throw invalidAudio();
  const audioDurationMs = samples.byteLength / (format.sampleRate * 2) * 1000;
  if (audioDurationMs > VOICE_MAX_DURATION_MS) throw new VoiceTranscriptionError('VOICE_TOO_LONG', 'Record up to 60 seconds at a time.');
  const wav = new Uint8Array(44 + samples.byteLength), out = new DataView(wav.buffer);
  const write = (at: number, value: string) => { for (let i = 0; i < value.length; i++) wav[at + i] = value.charCodeAt(i); };
  write(0, 'RIFF'); out.setUint32(4, wav.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, format.sampleRate, true); out.setUint32(28, format.sampleRate * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); write(36, 'data'); out.setUint32(40, samples.byteLength, true);
  wav.set(samples, 44);
  return { wav, audioDurationMs, sampleRate: format.sampleRate };
}

async function boundedBytes(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal, upload: boolean): Promise<Uint8Array<ArrayBuffer>> {
  if (signal.aborted) { void body?.cancel().catch(() => {}); throw cancelled(); }
  if (!body) throw new VoiceTranscriptionError(upload ? 'VOICE_INVALID_UPLOAD' : 'VOICE_INVALID_RESPONSE', upload ? 'Attach one WAV recording.' : 'Meta returned no readable transcript.', upload ? 400 : 502);
  const reader = body.getReader(), parts: Uint8Array[] = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw cancelled();
      const part = await reader.read();
      if (signal.aborted) throw cancelled();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw new VoiceTranscriptionError(upload ? 'VOICE_TOO_LARGE' : 'VOICE_INVALID_RESPONSE', upload ? 'The recording upload must be 10 MiB or smaller.' : 'Meta returned an oversized transcript response.', upload ? 413 : 502);
      parts.push(part.value);
    }
    const bytes = new Uint8Array(size); let at = 0;
    for (const part of parts) { bytes.set(part, at); at += part.byteLength; }
    return bytes;
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {}); reader.releaseLock();
  }
}

/** Cap the raw multipart stream before parsing. No user-controlled model,
 * language prompt, URL, history, filename or provider settings are accepted. */
export async function readVoiceUpload(request: Request, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const type = request.headers.get('content-type') ?? '';
  if (type.length > 256 || !/^multipart\/form-data\s*;/i.test(type)) throw new VoiceTranscriptionError('VOICE_INVALID_UPLOAD', 'Attach one WAV recording as multipart form data.');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) throw new VoiceTranscriptionError('VOICE_INVALID_UPLOAD', 'The upload length is invalid.');
  if (Number(length) > VOICE_MAX_UPLOAD_BYTES) throw new VoiceTranscriptionError('VOICE_TOO_LARGE', 'The recording upload must be 10 MiB or smaller.', 413);
  const bytes = await boundedBytes(request.body, VOICE_MAX_UPLOAD_BYTES, signal, true);
  let form: FormData;
  try { form = await new Response(bytes, { headers: { 'Content-Type': type } }).formData(); }
  catch { throw new VoiceTranscriptionError('VOICE_INVALID_UPLOAD', 'The recording upload could not be read.'); }
  if (signal.aborted) throw cancelled();
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0][0] !== 'audio' || typeof entries[0][1] === 'string') throw new VoiceTranscriptionError('VOICE_INVALID_UPLOAD', 'Attach exactly one WAV recording; other fields are not accepted.');
  const file = entries[0][1];
  if (!file.size) throw invalidAudio();
  const audio = new Uint8Array(await file.arrayBuffer());
  if (signal.aborted) throw cancelled();
  return audio;
}

/** One bounded provider request. Audio is transmitted only to the fixed Meta
 * endpoint. A transcript is returned as an editable draft, never chat evidence. */
export async function transcribeVoice(audio: Uint8Array, key: string, parentSignal?: AbortSignal): Promise<VoiceTranscript> {
  if (parentSignal?.aborted) throw cancelled();
  const canonical = canonicalizeVoiceWav(audio);
  if (typeof key !== 'string' || !key.trim()) throw new VoiceTranscriptionError('VOICE_NOT_CONFIGURED', 'Voice transcription is not connected.', 503);
  const controller = new AbortController(); let timedOut = false;
  const parentAbort = () => controller.abort();
  parentSignal?.addEventListener('abort', parentAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, VOICE_TIMEOUT_MS);
  try {
    if (parentSignal?.aborted) throw cancelled();
    const body = new FormData();
    body.append('request', new Blob([JSON.stringify({ model: VOICE_MODEL, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK', languageBias: ['English', 'Korean'] })], { type: 'application/json' }), 'request.json');
    body.append('audio', new Blob([canonical.wav], { type: 'audio/wav' }), 'recording.wav');
    const response = await fetch(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, body, signal: controller.signal, redirect: 'manual' });
    if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
      void response.body?.cancel();
      throw new VoiceTranscriptionError('VOICE_INVALID_RESPONSE', 'Meta returned an oversized transcript response.', 502);
    }
    const bytes = await boundedBytes(response.body, MAX_RESPONSE_BYTES, controller.signal, false);
    let value: unknown;
    try { value = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new VoiceTranscriptionError('VOICE_INVALID_RESPONSE', 'Meta returned a transcript response that could not be read.', 502); }
    if (!response.ok) {
      const error = object(value) && object(value.error) ? value.error : {};
      if (error.code === 'content_policy_violation') throw new VoiceTranscriptionError('VOICE_CONTENT_FILTERED', 'Meta declined this recording under its content filter. No retry was made.', 422);
      if (response.status === 401 || response.status === 403) throw new VoiceTranscriptionError('VOICE_AUTH_FAILED', 'Meta could not authorize voice transcription.', 502);
      if (response.status === 429) throw new VoiceTranscriptionError('VOICE_RATE_LIMITED', 'Meta’s voice limit has been reached. No retry was made.', 429);
      throw new VoiceTranscriptionError('VOICE_REQUEST_FAILED', `Meta could not transcribe the recording (HTTP ${response.status}). No retry was made.`, 502);
    }
    if (!object(value) || typeof value.transcript !== 'string' || value.transcript.length > MAX_TRANSCRIPT_CHARS || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.transcript) ||
        typeof value.audioDurationMs !== 'number' || !Number.isSafeInteger(value.audioDurationMs) || value.audioDurationMs < 0 || value.audioDurationMs > VOICE_MAX_DURATION_MS ||
        typeof value.sessionId !== 'string' || value.sessionId.length === 0 || value.sessionId.length > 200 || !Array.isArray(value.turns) || value.turns.length !== 0) {
      throw new VoiceTranscriptionError('VOICE_INVALID_RESPONSE', 'Meta did not return a complete, valid transcript. No draft was accepted.', 502);
    }
    if (!value.transcript.trim()) throw new VoiceTranscriptionError('VOICE_NO_SPEECH', 'No speech was transcribed. You can record another short clip or type your question.', 422);
    return { kind: 'voice_transcript', model: VOICE_MODEL, transcript: value.transcript.trim(), audioDurationMs: canonical.audioDurationMs, editable: true, autoSend: false, isEvidence: false };
  } catch (error) {
    if (timedOut) throw new VoiceTranscriptionError('VOICE_TIMEOUT', 'Voice transcription timed out. No retry was made.', 504);
    if (parentSignal?.aborted || controller.signal.aborted) throw cancelled();
    if (error instanceof VoiceTranscriptionError) throw error;
    throw new VoiceTranscriptionError('VOICE_REQUEST_FAILED', 'Voice transcription could not complete. No retry was made.', 502);
  } finally {
    clearTimeout(timer); parentSignal?.removeEventListener('abort', parentAbort);
  }
}
