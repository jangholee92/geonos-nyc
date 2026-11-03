import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
type Obj = Record<string, any>;
class TestMetaSpendError extends Error { code='META_SPEND_LIMIT'; status=429; constructor(){super('The shared AI demo budget has been reached.');} }
function compile(path: string, require: (id: string) => unknown, extra: Obj = {}): Obj {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new vm.Script(code).runInContext(vm.createContext({ module, exports: module.exports, require:(id:string)=>id.endsWith('/meta-paid-fetch')?{MetaSpendError:TestMetaSpendError,fetchMetaPaid:(url:string,init:RequestInit)=>{if(extra.spendDenied)throw new TestMetaSpendError();return extra.fetch(url,init);},settleMetaPaid:async()=>false,getMetaSpendStatus:async()=>({status:extra.spendStatus??'available'})}:require(id), Response, Request, URL, Blob, FormData, Uint8Array, DataView, TextDecoder, TextEncoder, AbortController, AbortSignal, setTimeout, clearTimeout, ...extra }));
  return module.exports;
}
function wav(rate = 24_000, durationMs = 1000): Uint8Array<ArrayBuffer> {
  const count = Math.round(rate * durationMs / 1000), bytes = new Uint8Array(44 + count * 2), v = new DataView(bytes.buffer);
  const put = (at: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); v.setUint32(4, bytes.length - 8, true); put(8, 'WAVE'); put(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); put(36, 'data'); v.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) v.setInt16(44 + i * 2, (i % 200) - 100, true);
  return bytes;
}
function insertChunk(audio: Uint8Array, id: string, data: Uint8Array, at = 36) {
  const bytes = new Uint8Array(audio.length + 8 + data.length + (data.length & 1)), v = new DataView(bytes.buffer);
  bytes.set(audio.subarray(0, at)); for (let i = 0; i < 4; i++) bytes[at + i] = id.charCodeAt(i);
  v.setUint32(at + 4, data.length, true); bytes.set(data, at + 8); bytes.set(audio.subarray(at), at + 8 + data.length + (data.length & 1)); v.setUint32(4, bytes.length - 8, true); return bytes;
}
function upload(audio = wav(), options: Obj = {}): Request {
  const form = new FormData(); form.append('audio', new Blob([audio], { type: options.type ?? 'audio/wav' }), 'private-recording-name.wav');
  if (options.extra) form.append('prompt', 'Do not forward arbitrary settings');
  if (options.duplicate) form.append('audio', new Blob([audio]), 'second.wav');
  return new Request('https://example.test/api/transcribe', { method: 'POST', body: form, ...(options.init ?? {}) });
}
const success = (overrides: Obj = {}) => Response.json({ sessionId: 'provider-session', transcript: 'Compare these buildings. 이 건물을 비교해 주세요.', audioDurationMs: 1000, turns: [], ...overrides });
function harness(reply: (url: string, init: RequestInit) => Response | Promise<Response> = () => success(), options: Obj = {}): Obj {
  const calls: Obj[] = [], deadlines = new Set<() => void>();
  const timers = options.fakeTimers ? { setTimeout: (fn: () => void) => { deadlines.add(fn); return fn; }, clearTimeout: (fn: () => void) => deadlines.delete(fn) } : {};
  const api = compile('../lib/voice-transcription.ts', id => { throw Error(id); }, { ...timers, spendDenied: options.spendDenied, fetch: async (url: string, init: RequestInit) => { calls.push({ url, init }); return reply(url, init); } });
  const route = compile('../app/api/transcribe/route.ts', id => {
    if (id === '../../../lib/demo-access') return { getDemoActor: async () => options.user === false ? null : { userId: options.userId ?? 'authenticated-test-user' } };
    if (id === '../../../lib/voice-transcription') return api;
    if (id === 'cloudflare:workers') throw Error('No worker binding in test');
    throw Error(id);
  }, { ...timers, spendStatus: options.spendStatus, Date: options.clock ?? Date, process: { env: { ...(options.key === false ? {} : { MODEL_API_KEY: 'synthetic-voice-key' }), META_API_APPROVED: options.approved === false ? 'false' : 'true' } } });
  return { ...api, ...route, calls, deadlines };
}
const code = (expected: string) => (error: Obj) => error.code === expected;

test('missing demo context cannot advertise a runnable paid upload', async () => {
  const h = harness(undefined, { user: false }), response = await h.GET(), status = await response.json();
  assert.equal(status.configured, true); assert.equal(status.approved, true); assert.equal(status.canRun, false); assert.equal(status.requiresSignIn, false);
  assert.equal(status.signInUrl, undefined);assert.equal(status.accessMode,'anonymous-demo'); assert.equal(response.headers.get('cache-control'), 'no-store');
  const denied = await h.POST(upload()); assert.equal(denied.status, 503); assert.equal((await denied.json()).code, 'DEMO_UNAVAILABLE'); assert.equal(h.calls.length, 0);
  const ready = await (await harness().GET()).json(); assert.equal(ready.canRun, true); assert.equal(ready.requiresSignIn, false);
});
test('cross-site voice writes do not consume an authenticated account allowance', async () => {
  const h = harness();
  for (let i = 0; i < 13; i++) {
    const denied = await h.POST(upload(wav(), { init: { headers: { Origin: 'https://example.test', 'Sec-Fetch-Site': 'cross-site' } } }));
    assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'VOICE_ORIGIN_REJECTED');
  }
  assert.equal(h.calls.length, 0); assert.equal((await h.POST(upload())).status, 200); assert.equal(h.calls.length, 1);
});
test('voice shared concurrency is capped at four accounts and failure releases the occupied slot', async () => {
  let release!: () => void, started = 0; const gate = new Promise<void>(resolve => { release = resolve; }), options: Obj = { userId: 'first' };
  const h = harness(async () => { const number = ++started; if (number <= 4) await gate; return number === 1 ? Response.json({ error: { code: 'internal' } }, { status: 500 }) : success(); }, options);
  const pending: Promise<Response>[] = [];
  for (let i = 0; i < 4; i++) {
    options.userId = 'account-' + i; pending.push(h.POST(upload()));
    for (let tick = 0; tick < 60 && h.calls.length < i + 1; tick++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls.length, i + 1);
  }
  options.userId = 'fifth'; assert.equal((await h.POST(upload())).status, 429); assert.equal(h.calls.length, 4);
  release(); const results = await Promise.all(pending); assert.equal(results[0].status, 502); for (const response of results.slice(1)) assert.equal(response.status, 200);
  options.userId = 'account-0'; assert.equal((await h.POST(upload())).status, 200); assert.equal(h.calls.length, 5);
});
test('voice daily account allowance spans minute windows and resets on the next UTC day', async () => {
  let now = Date.parse('2026-11-01T01:00:00Z'); class Clock extends Date { static now() { return now; } }
  const h = harness(undefined, { clock: Clock });
  for (let i = 0; i < 12; i++) { assert.equal((await h.POST(upload())).status, 200); now += 60_001; }
  const denied = await h.POST(upload()); assert.equal(denied.status, 429); assert.equal((await denied.json()).code, 'DAILY_LIMIT_REACHED'); assert.equal(h.calls.length, 12);
  now += 86_400_000; assert.equal((await h.POST(upload())).status, 200); assert.equal(h.calls.length, 13);
});
test('voice shared daily allowance caps eighty uploads across accounts in one isolate', async () => {
  const options: Obj = { userId: 'first' }, h = harness(undefined, options);
  for (let i = 0; i < 80; i++) { options.userId = 'account-' + i; assert.equal((await h.POST(upload())).status, 200); }
  options.userId = 'account-81'; const denied = await h.POST(upload()); assert.equal(denied.status, 429); assert.equal((await denied.json()).code, 'DAILY_LIMIT_REACHED'); assert.equal(h.calls.length, 80);
});

test('supported PCM rates are validated by bytes and preserved exactly in canonical WAV', () => {
  const h = harness();
  for (const rate of [16_000, 24_000]) { const source = wav(rate, 1250), result = h.canonicalizeVoiceWav(source); assert.equal(result.audioDurationMs, 1250); assert.equal(result.sampleRate, rate); assert.deepEqual(result.wav, source); }
});
test('odd-sized metadata is stripped without changing the actual PCM samples', () => {
  const h = harness(), source = wav(), withMetadata = insertChunk(source, 'LIST', new TextEncoder().encode('private-location-and-recorder'));
  assert.deepEqual(h.canonicalizeVoiceWav(withMetadata).wav, source);
});
test('invalid containers, duplicate chunks and contradictory PCM fields are rejected before upload', () => {
  const h = harness(); const variants: Uint8Array[] = [new Uint8Array(44), wav().subarray(0, 43)];
  for (const [offset, value, width] of [[0, 0, 32], [4, 100, 32], [20, 3, 16], [22, 2, 16], [24, 44100, 32], [28, 100, 32], [32, 4, 16], [34, 8, 16], [40, 0xffffffff, 32]] as const) { const b = wav(), v = new DataView(b.buffer); if (width === 16) v.setUint16(offset, value, true); else v.setUint32(offset, value, true); variants.push(b); }
  variants.push(insertChunk(wav(), 'fmt ', wav().subarray(20, 36)), insertChunk(wav(), 'data', new Uint8Array(2)));
  const oddData = wav(); new DataView(oddData.buffer).setUint32(40, oddData.length - 45, true); variants.push(oddData);
  for (const b of variants) assert.throws(() => h.canonicalizeVoiceWav(b), code('VOICE_INVALID_AUDIO'));
  assert.equal(h.calls.length, 0);
});
test('duration and upload byte limits use actual PCM length, with 60 seconds accepted exactly', () => {
  const h = harness(); assert.equal(h.canonicalizeVoiceWav(wav(24000, 60_000)).audioDurationMs, 60_000);
  assert.throws(() => h.canonicalizeVoiceWav(wav(24000, 60_001)), code('VOICE_TOO_LONG'));
  assert.throws(() => h.canonicalizeVoiceWav(new Uint8Array(h.VOICE_MAX_UPLOAD_BYTES + 1)), code('VOICE_TOO_LARGE'));
});
test('multipart accepts one audio only and does not trust filename or MIME instead of bytes', async () => {
  const h = harness(); const accepted = await h.readVoiceUpload(upload(wav(), { type: 'application/octet-stream' }), new AbortController().signal); assert.deepEqual(accepted, wav());
  for (const request of [upload(wav(), { extra: true }), upload(wav(), { duplicate: true }), new Request('https://example.test/api/transcribe', { method: 'POST', body: 'not multipart' })]) await assert.rejects(() => h.readVoiceUpload(request, new AbortController().signal), code('VOICE_INVALID_UPLOAD'));
  const text = new FormData(); text.append('audio', 'pretend.wav'); await assert.rejects(() => h.readVoiceUpload(new Request('https://example.test', { method: 'POST', body: text }), new AbortController().signal), code('VOICE_INVALID_UPLOAD'));
});
test('raw multipart size is bounded even without a Content-Length header', async () => {
  const h = harness(); let canceled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(h.VOICE_MAX_UPLOAD_BYTES + 1)); }, cancel() { canceled = true; } });
  const request = new Request('https://example.test', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=bounded' }, body: stream, duplex: 'half' } as RequestInit);
  await assert.rejects(() => h.readVoiceUpload(request, new AbortController().signal), code('VOICE_TOO_LARGE')); assert.equal(canceled, true); assert.equal(h.calls.length, 0);
});
test('one fixed provider call sends canonical WAV and fixed request settings; result remains an editable draft', async () => {
  const h = harness(); const result = await h.transcribeVoice(insertChunk(wav(), 'LIST', new TextEncoder().encode('private-metadata')), 'synthetic-voice-key');
  assert.equal(h.calls.length, 1); const call = h.calls[0]; assert.equal(call.url, 'https://api.meta.ai/v1/asr/transcribe'); assert.equal(call.init.redirect, 'manual'); assert.equal(call.init.headers.Authorization, 'Bearer synthetic-voice-key'); assert.equal(call.init.headers.Accept, 'application/json'); assert.equal(call.init.headers['Content-Type'], undefined);
  const form = call.init.body as FormData; assert.deepEqual([...form.keys()], ['request', 'audio']);
  assert.deepEqual(JSON.parse(await (form.get('request') as Blob).text()), { model: 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', mode: 'PUSH_TO_TALK', languageBias: ['English', 'Korean'] });
  assert.deepEqual(new Uint8Array(await (form.get('audio') as Blob).arrayBuffer()), wav());
  assert.equal(result.transcript, 'Compare these buildings. 이 건물을 비교해 주세요.'); assert.equal(result.audioDurationMs, 1000); assert.equal(result.editable, true); assert.equal(result.autoSend, false); assert.equal(result.isEvidence, false); assert.ok(!JSON.stringify(result).includes('synthetic-voice-key')); assert.equal(result.sessionId, undefined);
});
test('empty speech, malformed output and unexpected diarization are not accepted as a draft', async () => {
  const silent = harness(() => success({ transcript: '  ' })); await assert.rejects(() => silent.transcribeVoice(wav(), 'key'), code('VOICE_NO_SPEECH'));
  for (const overrides of [{ transcript: 'a'.repeat(4001) }, { transcript: 'bad\u0000value' }, { audioDurationMs: 60_001 }, { audioDurationMs: 1.2 }, { sessionId: '' }, { turns: [{ transcript: 'unexpected speaker turn' }] }, { transcript: null }]) { const h = harness(() => success(overrides)); await assert.rejects(() => h.transcribeVoice(wav(), 'key'), code('VOICE_INVALID_RESPONSE')); assert.equal(h.calls.length, 1); }
});
test('provider errors and redirects are safe, terminal and never retried', async () => {
  for (const [status, errorCode, expected] of [[400, 'content_policy_violation', 'VOICE_CONTENT_FILTERED'], [401, 'auth', 'VOICE_AUTH_FAILED'], [429, 'rate_limit', 'VOICE_RATE_LIMITED'], [302, 'redirect', 'VOICE_REQUEST_FAILED'], [500, 'internal', 'VOICE_REQUEST_FAILED']] as const) {
    const h = harness(() => Response.json({ error: { code: errorCode, message: 'synthetic-voice-key private-recording-name.wav' } }, { status, headers: { Location: 'https://never-follow.invalid' } }));
    await assert.rejects(() => h.transcribeVoice(wav(), 'synthetic-voice-key'), (error: Obj) => { assert.ok(!error.message.includes('synthetic-voice-key')); assert.ok(!error.message.includes('private-recording-name')); return error.code === expected; }); assert.equal(h.calls.length, 1);
  }
});
test('oversized and non-JSON provider bodies are rejected without a substitute transcript', async () => {
  for (const body of [new Response('x'.repeat(64_001)), new Response('not JSON')]) { const h = harness(() => body); await assert.rejects(() => h.transcribeVoice(wav(), 'key'), code('VOICE_INVALID_RESPONSE')); assert.equal(h.calls.length, 1); }
});
test('cancellation before sending makes no call; active fetch and stalled response reads stop', async () => {
  const before = new AbortController(); before.abort(); const first = harness(); await assert.rejects(() => first.transcribeVoice(wav(), 'key', before.signal), code('VOICE_CANCELLED')); assert.equal(first.calls.length, 0);
  const during = new AbortController(); const active = harness((_url, init) => new Promise((_resolve, reject) => { init.signal!.addEventListener('abort', () => reject(Error('secret')), { once: true }); during.abort(); })); await assert.rejects(() => active.transcribeVoice(wav(), 'key', during.signal), code('VOICE_CANCELLED')); assert.equal(active.calls.length, 1);
  const reading = new AbortController(); let streamCanceled = false; const body = harness(() => new Response(new ReadableStream({ start() { queueMicrotask(() => reading.abort()); }, cancel() { streamCanceled = true; } }))); await assert.rejects(() => body.transcribeVoice(wav(), 'key', reading.signal), code('VOICE_CANCELLED')); assert.equal(streamCanceled, true);
});
test('the provider deadline cancels once and timer metadata is cleaned after failure', async () => {
  let h: Obj; h = harness((_url, init) => new Promise((_resolve, reject) => { init.signal!.addEventListener('abort', () => reject(Error('timeout')), { once: true }); queueMicrotask(() => [...h.deadlines][0]()); }), { fakeTimers: true });
  await assert.rejects(() => h.transcribeVoice(wav(), 'key'), code('VOICE_TIMEOUT')); assert.equal(h.calls.length, 1); assert.equal(h.deadlines.size, 0);
});
test('route gates authentication, approval, configuration and cross-site uploads before provider work', async () => {
  for (const [options, expected, status] of [[{ user: false }, 'DEMO_UNAVAILABLE', 503], [{ approved: false }, 'MODEL_APPROVAL_PENDING', 503], [{ key: false }, 'MODEL_NOT_CONFIGURED', 503]] as const) { const h = harness(undefined, options); const r = await h.POST(upload()); assert.equal(r.status, status); assert.equal((await r.json()).code, expected); assert.equal(h.calls.length, 0); }
  const h = harness(); const rejected = await h.POST(upload(wav(), { init: { headers: { Origin: 'https://outside.invalid' } } })); assert.equal(rejected.status, 403); assert.equal(h.calls.length, 0);
});
test('route returns only the typed draft with no-store and discards malformed audio before provider work', async () => {
  const h = harness(); const result = await h.POST(upload(wav(), { init: { headers: { Origin: 'https://example.test' } } })); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store'); const body = await result.json(); assert.equal(body.kind, 'voice_transcript'); assert.equal(body.autoSend, false); assert.equal(body.isEvidence, false);
  const bad = harness(); assert.equal((await bad.POST(upload(new Uint8Array(64)))).status, 400); assert.equal(bad.calls.length, 0);
});
test('per-user rate and simultaneous request limits bound paid work and release after completion', async () => {
  const limited = harness(); for (let i = 0; i < 6; i++) assert.equal((await limited.POST(upload())).status, 200); assert.equal((await limited.POST(upload())).status, 429); assert.equal(limited.calls.length, 6);
  let release!: (r: Response) => void; const pending = harness(() => new Promise<Response>(resolve => { release = resolve; })); const first = pending.POST(upload());
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await pending.POST(upload())).status, 429); assert.equal(pending.calls.length, 1); release(success()); assert.equal((await first).status, 200);
  const next = pending.POST(upload()); await new Promise(resolve => setTimeout(resolve, 0)); release(success()); assert.equal((await next).status, 200);
});
test('route deadline also bounds a stalled incoming upload, with no provider call', async () => {
  const h = harness(undefined, { fakeTimers: true }); let stopped = false;
  const request = new Request('https://example.test/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=stall' }, body: new ReadableStream({ cancel() { stopped = true; } }), duplex: 'half' } as RequestInit);
  const pending = h.POST(request); while (h.deadlines.size === 0) await new Promise(resolve => setTimeout(resolve, 0)); [...h.deadlines][0]();
  const response = await pending; assert.equal(response.status, 504); assert.equal((await response.json()).code, 'VOICE_TIMEOUT'); assert.equal(stopped, true); assert.equal(h.calls.length, 0); assert.equal(h.deadlines.size, 0);
  assert.equal((await h.POST(upload())).status, 200); assert.equal(h.calls.length, 1); assert.equal(h.deadlines.size, 0);
});

test('monetary denial disables recording capability and remains distinct from a provider or audio failure',async()=>{
 const h=harness(()=>{throw Error('No paid transcription');},{spendStatus:'budget_exhausted',spendDenied:true});
 const ready=await(await h.GET()).json();assert.equal(ready.canRun,false);assert.equal(ready.spendStatus,'budget_exhausted');
 const response=await h.POST(upload());const payload=await response.json();assert.equal(response.status,429);assert.equal(payload.code,'META_SPEND_LIMIT');assert.equal(h.calls.length,0);
});
