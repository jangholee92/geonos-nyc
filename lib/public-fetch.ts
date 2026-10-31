/** Public JSON GETs share four slots per JS runtime (browser tab or Worker isolate).
 * Queue waiting does not consume the network deadline. A slot remains occupied
 * until the response body is read, or the failed request has been canceled.
 */
const MAX_ACTIVE = 4;
let active = 0;
const waiting: (() => void)[] = [];
async function acquire(): Promise<() => void> {
  if (active < MAX_ACTIVE) active++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = waiting.shift();
    if (next) next(); // Hand the existing slot directly to the oldest waiter.
    else active--;
  };
}
export type PublicJsonOptions<T = unknown> = {
  timeoutMs?: number; label?: string; headers?: HeadersInit;
  /** Decode a public asset while retaining the shared request slot and deadline. */
  readResponse?: (response: Response) => Promise<T>;
};
export class PublicDataError extends Error {
  status?: number;
  code: 'PUBLIC_HTTP_ERROR' | 'PUBLIC_TIMEOUT' | 'PUBLIC_INVALID_JSON' | 'PUBLIC_NETWORK_ERROR';
  constructor(code: PublicDataError['code'], status?: number) {
    super(code === 'PUBLIC_TIMEOUT' ? 'The public-data request timed out. Please try again shortly.' : code === 'PUBLIC_HTTP_ERROR' ? `Public-data service error (${status}). Please try again shortly.` : code === 'PUBLIC_INVALID_JSON' ? 'The public-data response has an invalid format.' : 'The public-data connection failed. Please try again shortly.');
    this.name = 'PublicDataError'; this.code = code; this.status = status;
  }
}
export async function fetchPublicJson<T = unknown>(url: URL | string, options: PublicJsonOptions<T> = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 25_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new RangeError('Invalid public-data timeout.');
  const release = await acquire();
  const started = Date.now(), controller = new AbortController();
  let timedOut = false, phase: 'headers' | 'body' = 'headers', status: number | undefined;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    // Private-hosted local assets need the existing site session. Browser
    // same-origin mode never sends cookies to cross-origin official sources.
    const response = await fetch(url, { method: 'GET', credentials: 'same-origin', ...(options.headers ? { headers: options.headers } : {}), signal: controller.signal });
    status = response.status;
    if (!response.ok) {
      // Do not retain an unread response stream or expose an upstream body.
      await response.body?.cancel();
      throw new PublicDataError('PUBLIC_HTTP_ERROR', status);
    }
    phase = 'body';
    return options.readResponse ? await options.readResponse(response) : await response.json() as T;
  } catch (error) {
    const safeError = timedOut ? new PublicDataError('PUBLIC_TIMEOUT', status) : error instanceof PublicDataError ? error : new PublicDataError(phase === 'body' && error instanceof SyntaxError ? 'PUBLIC_INVALID_JSON' : 'PUBLIC_NETWORK_ERROR', status);
    // Only a fixed label and bounded metadata enter production logs. Never log
    // URLs, queries, source response text, headers, visitor data or credentials.
    if (typeof window === 'undefined') console.warn('[public-data]', { dataset: options.label && /^[a-z0-9_-]{1,64}$/i.test(options.label) ? options.label : 'public', phase, status: status ?? null, elapsed_ms: Date.now() - started, error: safeError.code });
    throw safeError;
  } finally {
    clearTimeout(timer);
    release();
  }
}
