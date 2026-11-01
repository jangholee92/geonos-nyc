/** Read only the pinned ground archive through the worker's own asset service.
 * No user URL, auth header or outbound public-origin request is accepted. */
export async function fetchGroundAsset(path: string, signal: AbortSignal): Promise<Response> {
  if (!/^\/data\/surroundings\/\d{1,3}\.json\.gz$/.test(path)) throw Error('Invalid ground asset path.');
  const { env } = await import('cloudflare:workers');
  const assets = (env as unknown as { ASSETS?: { fetch(request: Request): Promise<Response> } }).ASSETS;
  if (!assets) throw Error('Ground archive binding unavailable.');
  // The development asset binding re-enters Vite's host-checked middleware.
  // This fixed host is metadata for that binding, never an outbound fetch.
  return assets.fetch(new Request(`http://localhost${path}`, { signal }));
}
