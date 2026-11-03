import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
type Obj = Record<string, any>;
const URL_CHAT = 'https://api.meta.ai/v1/chat/completions';
const spec = { model: 'muse-spark-1.3', operation: 'chat', maxOutputTokens: 2500 };
const init = (more: RequestInit = {}): RequestInit => ({ method: 'POST', headers: { Authorization: 'Bearer synthetic-test-only' }, body: JSON.stringify({ model: spec.model, messages: [{ role: 'user', content: 'A public building question' }], max_completion_tokens: 2500 }), ...more });
const reply = () => Response.json({ model: spec.model, usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 }, choices: [] });
function harness(options: { budget?: (path: string, body: Obj, init: RequestInit) => Response | Promise<Response>; provider?: (url: string, init: RequestInit) => Response | Promise<Response> } = {}) {
  const providerCalls: Obj[] = [], budgetCalls: Obj[] = [];
  const stub = { fetch: async (url: string, request: RequestInit) => {
    const path = new URL(url).pathname, body = JSON.parse(String(request.body)); budgetCalls.push({ path, body, request });
    if (options.budget) return options.budget(path, body, request);
    return Response.json(path === '/spend-reserve' ? { allowed: true, reservationId: body.requestId } : path === '/spend-settle' ? { settled: true } : { allowed: true });
  } };
  const env = { DEMO_BUDGET: { idFromName: (name: string) => { assert.equal(name, 'geonos-public-demo-v1'); return 'fixed'; }, get: (id: string) => { assert.equal(id, 'fixed'); return stub; } } };
  const module = { exports: {} as Obj };
  const code = ts.transpileModule(readFileSync(new URL('../lib/meta-paid-fetch.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code).runInNewContext({ module, exports: module.exports, require: (id: string) => { assert.equal(id, 'node:async_hooks'); return { AsyncLocalStorage }; },
    Response, Request, Headers, URL, FormData, Blob, Uint8Array, TextDecoder, AbortController, AbortSignal, DOMException, crypto: webcrypto, setTimeout, clearTimeout,
    fetch: async (url: string, request: RequestInit) => { providerCalls.push({ url, request }); return options.provider ? options.provider(url, request) : reply(); },
  });
  return { api: module.exports, env, providerCalls, budgetCalls };
}
const denied = (code = 'META_SPEND_UNAVAILABLE') => (error: Obj) => error.code === code && !error.message.includes('synthetic');

test('missing or broken server context fails closed without inference or an implicit local bypass', async () => {
  const h = harness();
  assert.equal((await h.api.getMetaSpendStatus()).status, 'unavailable');
  await assert.rejects(() => h.api.fetchMetaPaid(URL_CHAT, init(), spec), denied());
  await h.api.runWithMetaSpend({}, async () => { await assert.rejects(() => h.api.fetchMetaPaid(URL_CHAT, init(), spec), denied()); });
  assert.equal(h.providerCalls.length, 0); assert.equal(h.budgetCalls.length, 0);
});

test('every call reserves before dispatch, preserves response bytes, and settles once from valid uncached accounting', async () => {
  const h = harness();
  await h.api.runWithMetaSpend(h.env, async () => {
    const response = await h.api.fetchMetaPaid(URL_CHAT, init(), spec), payload = await response.json();
    assert.equal(h.budgetCalls[0].path, '/spend-reserve'); assert.equal(h.providerCalls.length, 1);
    assert.equal(h.providerCalls[0].request.redirect, 'manual'); assert.equal(h.providerCalls[0].request.credentials, 'omit');
    assert.equal(h.providerCalls[0].request.body, init().body);
    payload.usage.prompt_tokens_details = { cached_tokens: 99 };
    assert.equal(await h.api.settleMetaPaid(response, payload), true);
    assert.equal(await h.api.settleMetaPaid(response, payload), false);
    const settled = h.budgetCalls.find(c => c.path === '/spend-settle')!.body;
    assert.equal(settled.requestId, h.budgetCalls[0].body.requestId); assert.deepEqual(settled.usage, { prompt_tokens: 100, completion_tokens: 40 });
    assert.equal(h.budgetCalls.filter(c => c.path === '/spend-settle').length, 1);
    assert.ok(!JSON.stringify(h.budgetCalls.map(c => c.body)).includes('synthetic-test-only'));
    assert.ok(!JSON.stringify(h.budgetCalls.map(c => c.body)).includes('building question'));
  });
});

test('budget denial, malformed authorization and storage errors cannot reach Meta or expose budget amounts', async () => {
  for (const make of [() => Response.json({ allowed: false, code: 'META_SPEND_LIMIT', remaining: 1 }), () => Response.json({ allowed: true, reservationId: 'wrong' }), () => new Response('x'.repeat(4097)), () => Response.json({ allowed: true }, { status: 500 }), () => { throw new Error('private storage detail'); }]) {
    const h = harness({ budget: make });
    await h.api.runWithMetaSpend(h.env, async () => {
      const status = await h.api.getMetaSpendStatus(spec); assert.ok(['unavailable', 'budget_exhausted', 'available'].includes(status.status)); assert.deepEqual(Object.keys(status), ['status']);
      await assert.rejects(() => h.api.fetchMetaPaid(URL_CHAT, init(), spec), (e: Obj) => ['META_SPEND_LIMIT', 'META_SPEND_UNAVAILABLE'].includes(e.code) && !e.message.includes('private'));
    });
    assert.equal(h.providerCalls.length, 0);
  }
});

test('outbound endpoint, model, output limit and fixed image count must match their reserved operation', async () => {
  const h = harness();
  await h.api.runWithMetaSpend(h.env, async () => {
    for (const [url, request, call] of [
      ['https://other.invalid/v1/chat/completions', init(), spec],
      [URL_CHAT + '?redirect=x', init(), spec],
      [URL_CHAT, init({ body: JSON.stringify({ model: spec.model, max_completion_tokens: 2500, web_search_options: {} }) }), spec],
      [URL_CHAT, init({ body: JSON.stringify({ model: spec.model, max_completion_tokens: 2500, n: 2 }) }), spec],
      [URL_CHAT, init({ body: JSON.stringify({ model: spec.model, max_completion_tokens: 2500, tools: [{ type: 'web_search' }] }) }), spec],
      [URL_CHAT, init({ body: JSON.stringify({ model: 'muse-wonder-1.0', max_completion_tokens: 2500 }) }), spec],
      [URL_CHAT, init({ body: JSON.stringify({ model: spec.model, max_completion_tokens: 2501 }) }), spec],
      ['https://api.meta.ai/v1/images/generations', init({ body: JSON.stringify({ model: 'muse-image-1.0', n: 2 }) }), { model: 'muse-image-1.0', operation: 'image' }],
      ['https://api.meta.ai/v1/responses', init({ body: JSON.stringify({ model: 'sam-3.1', input: [{ type: 'message', role: 'user', content: [{ type: 'input_video' }] }] }) }), { model: 'sam-3.1', operation: 'sam_image' }],
    ] as Array<[string, RequestInit, Obj]>) await assert.rejects(() => h.api.fetchMetaPaid(url, request, call), denied());
  });
  assert.equal(h.budgetCalls.length, 0); assert.equal(h.providerCalls.length, 0);
});

test('parallel calls cannot exceed ledger approval and each dispatch uses a distinct reservation', async () => {
  let reserved = 0;
  const h = harness({ budget: async (path, body) => {
    assert.equal(path, '/spend-reserve'); const allowed = ++reserved <= 2;
    await Promise.resolve(); return Response.json(allowed ? { allowed: true, reservationId: body.requestId } : { allowed: false, code: 'META_SPEND_LIMIT' });
  } });
  const results = await h.api.runWithMetaSpend(h.env, () => Promise.allSettled(Array.from({ length: 5 }, () => h.api.fetchMetaPaid(URL_CHAT, init(), spec))));
  assert.equal(results.filter((r: Obj) => r.status === 'fulfilled').length, 2); assert.equal(h.providerCalls.length, 2);
  assert.equal(new Set(h.budgetCalls.map(c => c.body.requestId)).size, 5);
});

test('non-OK responses, invalid/missing usage, network failures and uncertain settlements keep their reservation', async () => {
  for (const payload of [{}, { usage: { prompt_tokens: 0, completion_tokens: 0 } }, { usage: { prompt_tokens: -1, completion_tokens: 4 } }, { usage: { prompt_tokens: 10, completion_tokens: 2501 } }, { usage: { prompt_tokens: 1.5, completion_tokens: 4 } }, { model: 'other', usage: { prompt_tokens: 10, completion_tokens: 4 } }, { error: {}, usage: { prompt_tokens: 10, completion_tokens: 4 } }]) {
    const h = harness(); await h.api.runWithMetaSpend(h.env, async () => {
      const response = await h.api.fetchMetaPaid(URL_CHAT, init(), spec); assert.equal(await h.api.settleMetaPaid(response, payload), false);
    }); assert.equal(h.budgetCalls.length, 1);
  }
  const failed = harness({ provider: () => { throw new Error('network lost after dispatch'); } });
  await failed.api.runWithMetaSpend(failed.env, () => assert.rejects(() => failed.api.fetchMetaPaid(URL_CHAT, init(), spec)));
  assert.equal(failed.budgetCalls.length, 1); assert.equal(failed.providerCalls.length, 1);
  const nonOk = harness({ provider: () => Response.json({ usage: { prompt_tokens: 10, completion_tokens: 2 } }, { status: 500 }) });
  await nonOk.api.runWithMetaSpend(nonOk.env, async () => { const r = await nonOk.api.fetchMetaPaid(URL_CHAT, init(), spec); assert.equal(await nonOk.api.settleMetaPaid(r, await r.json()), false); });
  assert.equal(nonOk.budgetCalls.length, 1);
  const settlement = harness({ budget: (path, body) => { if (path === '/spend-settle') throw new Error('storage unavailable'); return Response.json({ allowed: true, reservationId: body.requestId }); } });
  await settlement.api.runWithMetaSpend(settlement.env, async () => { const r = await settlement.api.fetchMetaPaid(URL_CHAT, init(), spec), p = await r.json(); assert.equal(await settlement.api.settleMetaPaid(r, p), false); assert.equal(await settlement.api.settleMetaPaid(r, p), false); });
  assert.equal(settlement.budgetCalls.length, 2);
});

test('cancellation before or after reservation makes no unreserved dispatch or automatic refund', async () => {
  const before = new AbortController(); before.abort(); const h = harness();
  await h.api.runWithMetaSpend(h.env, () => assert.rejects(() => h.api.fetchMetaPaid(URL_CHAT, init({ signal: before.signal }), spec)));
  assert.equal(h.budgetCalls.length, 0);
  const after = new AbortController();
  const late = harness({ budget: (_path, body) => { after.abort(); return Response.json({ allowed: true, reservationId: body.requestId }); } });
  await late.api.runWithMetaSpend(late.env, () => assert.rejects(() => late.api.fetchMetaPaid(URL_CHAT, init({ signal: after.signal }), spec)));
  assert.equal(late.budgetCalls.length, 1); assert.equal(late.providerCalls.length, 0);
});

test('fixed-price SAM streams, image generation and canonical voice keep one complete reservation each', async () => {
  const h = harness({ provider: () => new Response('unchanged stream bytes') });
  const form = new FormData(); form.append('request', new Blob([JSON.stringify({ model: 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' })])); form.append('audio', new Blob([new Uint8Array(48044)]));
  await h.api.runWithMetaSpend(h.env, async () => {
    for (const [url, request, call] of [
      ['https://api.meta.ai/v1/responses', init({ body: JSON.stringify({ model: 'sam-3.1', input: [{ type: 'message', role: 'user', content: [{ type: 'input_text' }, { type: 'input_image' }] }], stream: true }) }), { model: 'sam-3.1', operation: 'sam_image' }],
      ['https://api.meta.ai/v1/images/generations', init({ body: JSON.stringify({ model: 'muse-image-1.0', n: 1 }) }), { model: 'muse-image-1.0', operation: 'image' }],
      ['https://api.meta.ai/v1/asr/transcribe', init({ body: form }), { model: 'muse-voice-transcribe-1.0', operation: 'voice' }],
    ] as Array<[string, RequestInit, Obj]>) { const r = await h.api.fetchMetaPaid(url, request, call); assert.equal(await r.text(), 'unchanged stream bytes'); assert.equal(await h.api.settleMetaPaid(r, { usage: { prompt_tokens: 1, completion_tokens: 1 } }), false); }
  });
  assert.deepEqual(h.budgetCalls.map(c => c.body.operation), ['sam_image', 'image', 'voice']); assert.equal(h.providerCalls.length, 3);
});

test('separate request contexts cannot borrow another request budget binding', async () => {
  const h = harness(); let otherCalls = 0;
  const otherEnv = { DEMO_BUDGET: { idFromName: () => 'other', get: () => ({ fetch: async () => { otherCalls++; return Response.json({ allowed: false, code: 'META_SPEND_LIMIT' }); } }) } };
  const results = await Promise.all([
    h.api.runWithMetaSpend(h.env, async () => { await Promise.resolve(); return h.api.fetchMetaPaid(URL_CHAT, init(), spec); }),
    h.api.runWithMetaSpend(otherEnv, async () => { await Promise.resolve(); await assert.rejects(() => h.api.fetchMetaPaid(URL_CHAT, init(), spec), denied('META_SPEND_LIMIT')); }),
  ]);
  assert.equal(results[0].status, 200); assert.equal(h.providerCalls.length, 1); assert.equal(otherCalls, 1);
});
