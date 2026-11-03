import { AsyncLocalStorage } from 'node:async_hooks';

export type MetaPaidCall = { model: string; operation: 'chat' | 'sam_image' | 'image' | 'voice'; maxOutputTokens?: number };
type BudgetStub = Pick<DurableObjectStub, 'fetch'>;
type SpendEnvironment = { DEMO_BUDGET?: DurableObjectNamespace };
type Reservation = { stub: BudgetStub; requestId: string; call: MetaPaidCall; settled: boolean };
export type MetaSpendStatus = { status: 'available' | 'budget_exhausted' | 'unavailable' };
export class MetaSpendError extends Error {
  readonly status: number;
  constructor(public readonly code: 'META_SPEND_LIMIT' | 'META_SPEND_UNAVAILABLE') {
    super(code === 'META_SPEND_LIMIT'
      ? 'The shared AI demo budget has been reached. The map and public records remain available.'
      : 'The AI demo budget could not be verified. No new model request was sent. The map and public records remain available.');
    this.name = 'MetaSpendError'; this.status = code === 'META_SPEND_LIMIT' ? 429 : 503;
  }
}

const contexts = new AsyncLocalStorage<BudgetStub | null>();
const reservations = new WeakMap<Response, Reservation>();
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const unavailable = () => new MetaSpendError('META_SPEND_UNAVAILABLE');

/** Only the server binding is retained. No credentials or client budget values
 * enter this context, and a missing binding never enables unmetered inference. */
export function runWithMetaSpend<T>(env: SpendEnvironment, run: () => T): T {
  let stub: BudgetStub | null = null;
  try { if (env.DEMO_BUDGET) stub = env.DEMO_BUDGET.get(env.DEMO_BUDGET.idFromName('geonos-public-demo-v1')); } catch { /* Fail closed in the request context. */ }
  return contexts.run(stub, run);
}

async function budgetRequest(stub: BudgetStub, path: string, body: unknown, parentSignal?: AbortSignal): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 5_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { void reader?.cancel().catch(() => {}); };
  controller.signal.addEventListener('abort', cancel, { once: true });
  try {
    if (parentSignal?.aborted) controller.abort();
    if (controller.signal.aborted) throw unavailable();
    const response = await stub.fetch('https://budget.internal' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
    });
    if (response.status !== 200 || !response.body) { void response.body?.cancel().catch(() => {}); throw unavailable(); }
    reader = response.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
    while (true) {
      if (controller.signal.aborted) throw unavailable();
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 4096) throw unavailable(); chunks.push(part.value);
    }
    if (controller.signal.aborted) throw unavailable();
    const all = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all));
    if (!object(value)) throw unavailable();
    return value;
  } catch { throw unavailable(); }
  finally {
    clearTimeout(timer); parentSignal?.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', cancel);
    void reader?.cancel().catch(() => {}); reader?.releaseLock();
  }
}

export async function getMetaSpendStatus(call?: MetaPaidCall): Promise<MetaSpendStatus> {
  const stub = contexts.getStore(); if (!stub) return { status: 'unavailable' };
  try {
    const result = await budgetRequest(stub, '/spend-status', call ?? {});
    if (result.allowed === true) return { status: 'available' };
    return { status: result.allowed === false && result.code === 'META_SPEND_LIMIT' ? 'budget_exhausted' : 'unavailable' };
  } catch { return { status: 'unavailable' }; }
}

/** Bind each price reservation to its actual fixed Meta endpoint and request.
 * In particular, a new output cap or multiple images cannot use an old price. */
async function validateCall(url: string, init: RequestInit, call: MetaPaidCall): Promise<void> {
  if (init.method !== 'POST') throw unavailable();
  const endpoints = { chat: 'chat/completions', sam_image: 'responses', image: 'images/generations', voice: 'asr/transcribe' };
  if (url !== 'https://api.meta.ai/v1/' + endpoints[call.operation]) throw unavailable();
  if (call.operation === 'voice') {
    if (call.model !== 'muse-voice-transcribe-1.0' || call.maxOutputTokens !== undefined || !(init.body instanceof FormData)) throw unavailable();
    const request = init.body.get('request'), audio = init.body.get('audio');
    if (!(request instanceof Blob) || request.size > 4096 || !(audio instanceof Blob) || audio.size > 2_880_044) throw unavailable();
    const settings: unknown = JSON.parse(await request.text());
    if (!object(settings) || settings.model !== call.model || settings.audioEncoding !== 'WAV' || settings.mode !== 'PUSH_TO_TALK') throw unavailable();
    return;
  }
  if (typeof init.body !== 'string') throw unavailable();
  const body: unknown = JSON.parse(init.body);
  if (!object(body) || body.model !== call.model) throw unavailable();
  if (call.operation === 'chat') {
    if (!['muse-spark-1.3', 'muse-wonder-1.0'].includes(call.model) ||
      !Number.isSafeInteger(call.maxOutputTokens) || Number(call.maxOutputTokens) <= 0 || Number(call.maxOutputTokens) > (call.model === 'muse-wonder-1.0' ? 2200 : 2500) ||
      body.max_completion_tokens !== call.maxOutputTokens || body.max_tokens !== undefined || body.stream === true ||
      (body.n !== undefined && body.n !== 1) || body.web_search_options !== undefined || (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.some(tool =>
        !object(tool) || tool.type !== 'function' || !object(tool.function) || typeof tool.function.name !== 'string')))) throw unavailable();
  } else if (call.operation === 'image') {
    if (call.model !== 'muse-image-1.0' || call.maxOutputTokens !== undefined || body.n !== 1) throw unavailable();
  } else {
    if (call.model !== 'sam-3.1' || call.maxOutputTokens !== undefined || !Array.isArray(body.input) || body.input.length !== 1 || body.tools !== undefined || body.previous_response_id !== undefined || body.conversation !== undefined ||
      body.input.some(item => !object(item) || item.type !== 'message' || item.role !== 'user' || !Array.isArray(item.content))) throw unavailable();
    const content = body.input.flatMap(item => object(item) && Array.isArray(item.content) ? item.content : []);
    if (content.filter(item => object(item) && item.type === 'input_image').length !== 1 ||
      content.some(item => !object(item) || !['input_text', 'input_image'].includes(String(item.type)))) throw unavailable();
  }
}

/** Exactly one reservation and at most one upstream dispatch. An unknown
 * upstream outcome consumes its conservative reservation permanently. */
export async function fetchMetaPaid(input: string, init: RequestInit, call: MetaPaidCall): Promise<Response> {
  const stub = contexts.getStore(); if (!stub) throw unavailable();
  if (init.signal?.aborted) throw init.signal.reason ?? new DOMException('Aborted', 'AbortError');
  try { await validateCall(input, init, call); } catch { throw unavailable(); }
  const requestId = crypto.randomUUID();
  const reserved = await budgetRequest(stub, '/spend-reserve', { requestId, ...call }, init.signal ?? undefined);
  if (reserved.allowed !== true || reserved.reservationId !== requestId) {
    throw new MetaSpendError(reserved.allowed === false && reserved.code === 'META_SPEND_LIMIT' ? 'META_SPEND_LIMIT' : 'META_SPEND_UNAVAILABLE');
  }
  if (init.signal?.aborted) throw init.signal.reason ?? new DOMException('Aborted', 'AbortError');
  // Manual redirect is supported by Workers and cannot forward the key or
  // launch an unreserved redirected call. Provider bytes remain untouched.
  const response = await fetch(input, { ...init, redirect: 'manual', credentials: 'omit', cache: 'no-store' });
  if (call.operation === 'chat') reservations.set(response, { stub, requestId, call: { ...call }, settled: false });
  return response;
}

/** Called only after the existing bounded JSON reader. Invalid/missing usage,
 * errors and uncertain settlement keep the full reservation, never a refund. */
export async function settleMetaPaid(response: Response, payload: unknown): Promise<boolean> {
  const record = reservations.get(response);
  if (!record || record.settled || !response.ok || !object(payload) || payload.error !== undefined ||
    (payload.model !== undefined && payload.model !== record.call.model) || !object(payload.usage)) return false;
  const prompt = payload.usage.prompt_tokens, completion = payload.usage.completion_tokens;
  if (!Number.isSafeInteger(prompt) || Number(prompt) < 1 || Number(prompt) > 1_048_576 ||
    !Number.isSafeInteger(completion) || Number(completion) < 0 || Number(completion) > Number(record.call.maxOutputTokens) || Number(prompt) + Number(completion) > 1_048_576 ||
    (payload.usage.total_tokens !== undefined && payload.usage.total_tokens !== Number(prompt) + Number(completion))) return false;
  record.settled = true;
  try {
    const result = await budgetRequest(record.stub, '/spend-settle', { requestId: record.requestId, model: record.call.model,
      usage: { prompt_tokens: prompt, completion_tokens: completion } });
    return result.settled === true;
  } catch { return false; }
}
