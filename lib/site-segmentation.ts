import { fetchMetaPaid, MetaSpendError } from './meta-paid-fetch';
import { decodeMaskToRaster, decodeMaskToSVGPath, parseImageStream, recordsOfKind, type ImageSegmentationResult, type SegmentationMaskRecord } from '@meta-sam/parser';
import type { CityBuilding } from './city';
import { fetchSiteImagery, SiteImageryError, type SiteImagery } from './site-imagery';
import { crosscheckImagery, type ImageryCrosscheck } from './imagery-crosscheck';

export type ImageryConcept = 'roof' | 'trees';
export type ConceptSegmentation = { concept: ImageryConcept; status: 'detected' | 'not_detected' | 'error'; objectCount: number; paths: string[]; note: string };
export type SiteVisualEvidence = {
 kind: 'site_imagery'; id: string; buildingId: string; address: string;
 source: SiteImagery['source'];
 image: SiteImagery['image'] & { bounds: SiteImagery['bounds']['wgs84'] };
 bounds: SiteImagery['bounds'];
 footprint: { paths: string[]; source: string; editedAt: string | null; note: string };
 analysis: { model: 'sam-3.1'; status: 'completed' | 'partial' | 'unavailable'; note: string };
 concepts: ConceptSegmentation[]; limitations: string[];
 crosscheck?: ImageryCrosscheck;
};
export class SegmentationError extends Error { constructor(message: string) { super(message); this.name = 'SegmentationError'; } }
const ENDPOINT = 'https://api.meta.ai/v1/responses';
const MAX_STREAM_BYTES = 2_000_000, MAX_MASKS = 32, MAX_PATH_CHARS = 500_000, MAX_DECODED_PIXELS = 2_000_000;
export const siteImageryTool = { type: 'function', function: {
 name: 'inspect_site_imagery',
 description: 'Retrieve one fixed official 2024 aerial crop for a selected or already-retrieved native DOITT building, then run real SAM 3.1 roof and/or tree segmentation. Nonterminal: explain its compact summary with Muse; the application separately displays the image, native-footprint reference and masks. At most one building crop and two concepts per turn. Masks are visual hypotheses, never roof condition, usable area, cooling/solar capacity, compliance or flood-safety evidence.',
 parameters: { type: 'object', properties: { id: { type: 'string', description: 'Selected or current-turn native DOITT building ID, never BIN, parcel ID, URL or coordinates.' }, concepts: { type: 'array', items: { type: 'string', enum: ['roof', 'trees'] }, minItems: 1, maxItems: 2, uniqueItems: true, description: 'Omit to inspect both roof and trees. Each concept makes one SAM request.' } }, required: ['id'], additionalProperties: false },
} };

/** The transport accepts SSE JSON events only and caps bytes before the parser.
 * Completion, diagnostics and source dimensions are checked after parsing. */
async function* responseEvents(response: Response, width: number, height: number, signal: AbortSignal): AsyncGenerator<{ type: string; [key: string]: unknown }> {
 if (!response.body || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) throw new SegmentationError('SAM did not return a segmentation stream.');
 const reader = response.body.getReader(), decoder = new TextDecoder();
 const cancel = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener('abort', cancel, { once: true });
 let buffer = '', total = 0;
 const events: { type: string; [key: string]: unknown }[] = [];
 function event(block: string) {
  const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
  if (!data || data === '[DONE]') return null;
  let value: unknown; try { value = JSON.parse(data); } catch { throw new SegmentationError('SAM returned an invalid stream event.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as { type?: unknown }).type !== 'string') throw new SegmentationError('SAM returned an invalid stream event.');
  return value as { type: string; [key: string]: unknown };
 }
 try {
  while (true) {
   if (signal.aborted) throw new SegmentationError('SAM segmentation was canceled.');
   const { value, done } = await reader.read();
   if (done) break;
   total += value.byteLength; if (total > MAX_STREAM_BYTES) throw new SegmentationError('SAM output exceeded the bounded analysis size.');
   buffer += decoder.decode(value, { stream: true });
   let match: RegExpExecArray | null;
   while ((match = /\r?\n\r?\n/.exec(buffer))) {
    const parsed = event(buffer.slice(0, match.index)); buffer = buffer.slice(match.index + match[0].length);
    if (parsed) events.push(parsed);
   }
  }
  if (signal.aborted) throw new SegmentationError('SAM segmentation was canceled.');
  buffer += decoder.decode();
  if (buffer.trim()) { const parsed = event(buffer); if (parsed) events.push(parsed); }
 } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
 // The official parser decodes masks while parsing. Check dimensions before
 // supplying any events, including headers split across arbitrary deltas.
 const deltaText = events.filter(event => event.type === 'response.output_text.delta').map(event => {
  if (typeof event.delta !== 'string') throw new SegmentationError('SAM returned an invalid text event.');
  return event.delta;
 }).join('');
 const partTexts = events.filter(event => event.type === 'response.content_part.done').map(event => {
  const part = event.part as { type?: unknown; text?: unknown } | undefined;
  if (part?.type !== 'output_text') return '';
  if (typeof part.text !== 'string') throw new SegmentationError('SAM returned an invalid completed content part.');
  return part.text;
 });
 const texts = [deltaText, ...partTexts, ...events.filter(event => event.type === 'response.output_text.done').map(event => {
  if (typeof event.text !== 'string') throw new SegmentationError('SAM returned an invalid completed text event.');
  return event.text;
 })];
 for (const text of texts) {
  const headers = [...text.matchAll(/<\|mask;([^|]*)\|>/g)];
  let pixels = 0;
  if (headers.length > MAX_MASKS) throw new SegmentationError('SAM returned too many masks for one bounded crop.');
  for (const header of headers) for (const mask of header[1].matchAll(/\bdata\s*=\s*(\d+)\s*,\s*(\d+)\s*,/g)) {
   const h = Number(mask[1]), w = Number(mask[2]); pixels += w * h;
   if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || w > width || h > height || pixels > MAX_DECODED_PIXELS) throw new SegmentationError('SAM mask dimensions exceeded the bounded source image.');
  }
 }
 for (const event of events) yield event;
}

/** Official parser contours use pixel centres (edge -0.5). Shift by half a
 * pixel and place the crop-sized mask at its own source-pixel box. No SVG/XML
 * supplied by the provider is ever inserted into the document. */
function positionedPath(record: SegmentationMaskRecord, width: number, height: number): string {
 const { bounds: b, mask } = record;
 if ((record.frame !== undefined && record.frame.frameIndex !== 0) || ![b.left,b.top,b.right,b.bottom,mask.width,mask.height].every(Number.isSafeInteger) || b.left < 0 || b.top < 0 || b.right > width || b.bottom > height || b.right <= b.left || b.bottom <= b.top || mask.width !== b.right - b.left || mask.height !== b.bottom - b.top) throw new SegmentationError('SAM mask coordinates did not match the source image.');
 // SVG contour construction creates one object per boundary edge. Bound that
 // work before conversion, even for an unexpectedly fragmented valid raster.
 const raster = decodeMaskToRaster(mask); let edges = 0;
 for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
  const index = y * mask.width + x; if (!raster[index]) continue;
  edges += Number(x === 0 || !raster[index-1]) + Number(x === mask.width-1 || !raster[index+1]) + Number(y === 0 || !raster[index-mask.width]) + Number(y === mask.height-1 || !raster[index+mask.width]);
  if (edges > 12_000) throw new SegmentationError('SAM masks were too fragmented for the bounded display. No outline was approximated or substituted.');
 }
 const raw = decodeMaskToSVGPath(mask);
 if (raw.length > MAX_PATH_CHARS) throw new SegmentationError('SAM outlines exceeded the bounded display size.');
 if (!raw) return '';
 const commands = raw.match(/[ML]-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?|Z/g);
 if (!commands || commands.join('') !== raw || commands[0][0] !== 'M' || commands.at(-1) !== 'Z') throw new SegmentationError('SAM produced an unsupported mask outline.');
 return commands.map(command => {
  if (command === 'Z') return command;
  const [x,y] = command.slice(1).split(/\s+/).map(Number);
  if (x < -.5 || x > mask.width - .5 || y < -.5 || y > mask.height - .5) throw new SegmentationError('SAM outline coordinates exceeded the mask.');
  return `${command[0]}${x + .5 + b.left} ${y + .5 + b.top}`;
 }).join('');
}

export function normalizeSegmentation(result: ImageSegmentationResult, concept: ImageryConcept, width: number, height: number): ConceptSegmentation {
 if (result.outcome.status !== 'completed' || result.diagnostics.length) throw new SegmentationError('SAM segmentation was incomplete or could not be validated.');
 const masks = recordsOfKind(result.records, 'mask'), boxes = recordsOfKind(result.records, 'box');
 if (masks.length > MAX_MASKS || masks.length !== boxes.length || recordsOfKind(result.records, 'text').some(row => row.text.trim())) throw new SegmentationError('SAM returned an unsupported segmentation result.');
 const sourceSizes = [...result.rawOutput.matchAll(/<\|box;([^|]*)\|>/g)].map(row => {
  const fields = row[1].split(';').map(field => field.split('=').map(part => part.trim()));
  const ws = fields.filter(([key]) => key === 'w'), hs = fields.filter(([key]) => key === 'h');
  return ws.length === 1 && hs.length === 1 && Number(ws[0][1]) === width && Number(hs[0][1]) === height;
 });
 if (sourceSizes.length !== boxes.length || sourceSizes.some(valid => !valid)) throw new SegmentationError('SAM source dimensions did not match the aerial image.');
 if (masks.reduce((sum, row) => sum + row.mask.width * row.mask.height, 0) > MAX_DECODED_PIXELS) throw new SegmentationError('SAM masks exceeded the bounded decoding size.');
 const paths = masks.map(mask => positionedPath(mask, width, height)).filter(Boolean);
 if (paths.reduce((sum, path) => sum + path.length, 0) > MAX_PATH_CHARS) throw new SegmentationError('SAM outlines exceeded the bounded display size.');
 return { concept, status: paths.length ? 'detected' : 'not_detected', objectCount: paths.length, paths,
  note: paths.length ? 'Model-detected regions anywhere in this crop; they are not verified identities, conditions or parcel measurements.' : 'SAM returned no visible region for this prompt. This does not establish that the object is absent.' };
}
function safeSegmentationMessage(error: unknown): string {
 let current = error;
 for (let depth = 0; depth < 4; depth++) {
  if (current instanceof SegmentationError) return current.message;
  if (!current || typeof current !== 'object' || !('cause' in current)) break;
  current = current.cause;
 }
 return 'SAM segmentation could not be validated. No mask was substituted.';
}
async function segmentConcept(image: SiteImagery, concept: ImageryConcept, key: string, signal: AbortSignal): Promise<ConceptSegmentation> {
 try {
  if (signal.aborted) throw new SegmentationError('SAM segmentation was canceled.');
  // Workers implement manual/follow, but not redirect:error. Never follow a
  // redirect carrying the server credential; a 3xx is an unavailable result.
  const response = await fetchMetaPaid(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, redirect: 'manual', signal,
   body: JSON.stringify({ model: 'sam-3.1', input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: concept === 'roof' ? 'building roof' : 'tree' }, { type: 'input_image', image_url: image.image.dataUrl }] }], stream: true, metadata: { mask_encoding: 'one_bit' } }) }, { model: 'sam-3.1', operation: 'sam_image' });
  if (!response.ok) { await response.body?.cancel(); throw new SegmentationError(`SAM segmentation was unavailable (HTTP ${response.status}). No mask was substituted.`); }
  return normalizeSegmentation(await parseImageStream(responseEvents(response, image.image.width, image.image.height, signal)).finalResult, concept, image.image.width, image.image.height);
 } catch (error) {
  if (error instanceof MetaSpendError) throw error;
  return { concept, status: 'error', objectCount: 0, paths: [], note: signal.aborted ? 'SAM segmentation timed out or was canceled. No mask was substituted.' : safeSegmentationMessage(error) };
 }
}
function footprintPaths(image: SiteImagery): string[] {
 return image.target.footprintPixels.map(polygon => polygon.map(ring => ring.map(([x,y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join('') + 'Z').join(''));
}
export async function inspectSiteImagery(building: CityBuilding, key: string, concepts: ImageryConcept[] = ['roof', 'trees'], signal?: AbortSignal): Promise<SiteVisualEvidence> {
 if (!key || !/^[1-9]\d{0,9}$/.test(building.id) || building.entity_type === 'parcel' || !concepts.length || concepts.length > 2 || new Set(concepts).size !== concepts.length || concepts.some(concept => !['roof','trees'].includes(concept))) throw new SegmentationError('A resolved building and one or two supported image concepts are required.');
 const image = await fetchSiteImagery(building, signal);
 if (signal?.aborted) throw new SegmentationError('The image analysis was canceled before segmentation.');
 const outlines = footprintPaths(image);
 if (outlines.reduce((sum, path) => sum + path.length, 0) > 20_000) throw new SegmentationError('The native reference outline exceeded the bounded display size.');
 const deadline = AbortSignal.timeout(60_000), boundedSignal = signal ? AbortSignal.any([deadline, signal]) : deadline;
 const results = await Promise.all(concepts.map(concept => segmentConcept(image, concept, key, boundedSignal)));
 const succeeded = results.filter(result => result.status !== 'error').length;
 const roof = results.find(result => result.concept === 'roof');
 const crosscheck = roof ? crosscheckImagery({ width: image.image.width, height: image.image.height, footprintPaths: outlines, roofPaths: roof.paths, roofStatus: roof.status }) : undefined;
 return { kind: 'site_imagery', id: `sam31:${building.id}:${image.source.imageSha256}`, buildingId: building.id, address: building.address,
  source: image.source, image: { ...image.image, bounds: image.bounds.wgs84 }, bounds: image.bounds,
  footprint: { paths: outlines, source: image.target.footprintSource, editedAt: image.target.footprintEditedAt, note: 'Current official building footprint, shown only as a geographic reference. It is not a SAM mask or a verified 2024 roof boundary.' },
  analysis: { model: 'sam-3.1', status: succeeded === results.length ? 'completed' : succeeded ? 'partial' : 'unavailable', note: `${succeeded === results.length ? 'SAM 3.1 completed the requested image analyses.' : succeeded ? 'SAM 3.1 completed only part of the requested image analysis.' : 'SAM 3.1 could not complete the requested image analysis.'} Muse explains the returned summary and public records; Muse has not been sent these image pixels.` },
  concepts: results, ...(crosscheck ? { crosscheck } : {}), limitations: [...image.limitations, 'Masks may include neighboring buildings and trees. Object counts describe this crop, not ownership or the selected building alone.', 'No mask areas, roof condition, tree shading benefit or engineering capacity are calculated.'] };
}
export function summarizeSiteImagery(visual: SiteVisualEvidence) {
 // Object identities and connected components are different quantities. Keep
 // those detailed counts in the typed display, not the prose-facing summary.
 const crosscheck = visual.crosscheck ? (({ regions: _regions, counts, limitations, ...summary }) => ({ ...summary,
  counts: { targetCells: counts.targetCells, overlapCells: counts.overlapCells, mapOnlyCells: counts.mapOnlyCells, roofOnlyCells: counts.roofOnlyCells },
  selectionRule: 'Only edge-connected roof-mask components sharing sampled cells with the selected footprint are included. Separate neighboring components are excluded; included regions can still extend over shared or neighboring roofs.',
  limitations: limitations.map(note => note.replace('4-connected', 'edge-connected')),
 }))(visual.crosscheck) : undefined;
 return { kind: visual.kind, buildingId: visual.buildingId, address: visual.address, source: visual.source,
  image: { width: visual.image.width, height: visual.image.height, bounds: visual.image.bounds }, bounds: visual.bounds,
  analysis: visual.analysis, concepts: visual.concepts.map(({ paths: _paths, objectCount: _objectCount, ...result }) => result), ...(crosscheck ? { crosscheck } : {}), limitations: visual.limitations,
  display: 'The user can inspect the actual source photograph, official footprint reference and SAM masks in the attached image. These pixels and mask paths are not in the Muse tool context.' };
}
export { SiteImageryError };
