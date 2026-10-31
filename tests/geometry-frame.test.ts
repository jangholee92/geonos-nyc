import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error Node 25 supports TypeScript source imports for these pure helpers.
import * as frame from '../lib/geometry-frame.ts';
import type { OutlineCandidate } from '../lib/geometry-frame';

function square(areaSqft: number, latitude = 40.7, longitude = -74): OutlineCandidate {
  const side = Math.sqrt(areaSqft / 10.7639104167);
  const dx = side / (111195 * Math.cos(latitude * Math.PI / 180)) / 2, dy = side / 111195 / 2;
  return { entity_type: 'building', feature_code: 2100, geometry_quality: 'source_geometry', geometry: { type: 'Polygon', coordinates: [[[longitude - dx, latitude - dy], [longitude + dx, latitude - dy], [longitude + dx, latitude + dy], [longitude - dx, latitude + dy], [longitude - dx, latitude - dy]]] } };
}
const viewport = { plotWidth: 550, plotHeight: 340, centerX: 340, centerY: 225 };
const width = (drawing: NonNullable<ReturnType<typeof frame.drawOutline>>) => {
  const points = drawing.outline.polygons.flat(2).map(drawing.xy);
  return Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]));
};

test('5,325 versus 40,557 sqft outlines retain their physical area ratio in a shared frame', () => {
  const small = square(5325), large = square(40557);
  const common = frame.commonOutlineFrame([small, large])!;
  const a = frame.drawOutline(small, viewport, common)!, b = frame.drawOutline(large, viewport, common)!;
  assert.equal(a.pixelsPerMeter, b.pixelsPerMeter);
  assert.ok(Math.abs((width(a) / width(b)) ** 2 - 5325 / 40557) < 1e-9);
  assert.ok(width(a) < width(b) * .37);
  assert.equal(a.scaleBarMeters, b.scaleBarMeters);
  // Individually fitted drawings would conceal that size difference.
  assert.ok(Math.abs(width(frame.drawOutline(small, viewport)!) - width(frame.drawOutline(large, viewport)!)) < 1e-8);
});

test('equal physical sizes remain equal at different NYC latitudes and distant centers', () => {
  const south = square(10000, 40.5, -74.2), north = square(10000, 40.9, -73.8);
  const common = frame.commonOutlineFrame([south, north])!;
  const a = frame.drawOutline(south, viewport, common)!, b = frame.drawOutline(north, viewport, common)!;
  assert.ok(Math.abs(width(a) - width(b)) < 1e-7);
  assert.ok(common.widthMeters < 40 && common.heightMeters < 40, 'Do not use citywide bounds between the two sites.');
  assert.ok(Math.abs(a.xy([-74.2, 40.5])[0] - viewport.centerX) < 1e-7);
  assert.ok(Math.abs(b.xy([-73.8, 40.9])[1] - viewport.centerY) < 1e-7);
});

test('multipart outlines retain separate components, holes and north-up source orientation', () => {
  const outer = square(40000).geometry.coordinates[0], hole = square(4000).geometry.coordinates[0];
  const other = square(2000, 40.7005, -73.999).geometry.coordinates[0];
  const building: OutlineCandidate = { ...square(40000), geometry: { type: 'MultiPolygon', coordinates: [[outer, hole], [other]] } };
  const drawing = frame.drawOutline(building, viewport)!;
  assert.equal((drawing.path.match(/M/g) || []).length, 3);
  assert.equal((drawing.path.match(/ Z/g) || []).length, 3);
  assert.equal(drawing.outline.polygons[0].length, 2);
  const origin = drawing.xy([-74, 40.7]);
  assert.ok(drawing.xy([-73.9999, 40.7])[0] > origin[0]);
  assert.ok(drawing.xy([-74, 40.7001])[1] < origin[1]);
});

test('parcel, placeholder, invalid, degenerate and malformed outlines never set the shared scale', () => {
  const a = square(5325), b = square(40557), huge = square(1e8);
  const excluded: OutlineCandidate[] = [
    { ...huge, entity_type: 'parcel' }, { ...huge, feature_code: 1003 }, { ...huge, geometry_quality: 'invalid_or_placeholder' },
    { ...huge, geometry: { type: 'Point', coordinates: [-74, 40.7] } },
    { ...huge, geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] } },
    { ...huge, geometry: { type: 'Polygon', coordinates: [[['<script>', 40], [-74, 40], [-74, 40.1], ['<script>', 40]]] } },
  ];
  assert.deepEqual(frame.commonOutlineFrame([a, b, ...excluded]), frame.commonOutlineFrame([a, b]));
  assert.equal(frame.commonOutlineFrame([a, ...excluded]), null);
  for (const building of excluded) assert.equal(frame.drawOutline(building, viewport), null);
});

test('every shared outline fits the drawable viewport with identical scale and sensible bar length', () => {
  const buildings = [square(5325), square(40557), square(12000, 40.8, -73.9)];
  const common = frame.commonOutlineFrame(buildings)!;
  for (const building of buildings) {
    const drawing = frame.drawOutline(building, viewport, common)!;
    for (const p of drawing.outline.polygons.flat(2)) {
      const [x, y] = drawing.xy(p);
      assert.ok(x >= 65 - 1e-7 && x <= 615 + 1e-7);
      assert.ok(y >= 55 - 1e-7 && y <= 395 + 1e-7);
    }
    const barPixels = drawing.scaleBarMeters * drawing.pixelsPerMeter;
    assert.ok(barPixels >= 32 && barPixels <= 80 + 1e-7);
  }
  assert.throws(() => frame.drawingPixelsPerMeter(500, 300, { widthMeters: 0, heightMeters: 100 }));
});

function geoScene() {
  const code = ts.transpileModule(readFileSync(new URL('../components/geo-scene.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} as any };
  new vm.Script(code).runInNewContext({ module, exports: module.exports, require: (id: string) => id === 'react' ? React : id === 'react/jsx-runtime' ? jsxRuntime : id === '@/lib/geometry-frame' ? frame : (() => { throw Error(id); })() });
  return module.exports.default;
}

test('GeoScene consumes the same frame, keeps even-odd holes, and labels the common scale', () => {
  const component = geoScene(), buildings = [square(5325), square(40557)];
  const common = frame.commonOutlineFrame(buildings)!;
  const html = buildings.map((building, index) => renderToStaticMarkup(React.createElement(component, { features: [{ id: String(index), geometry: building.geometry, color: '#315b54' }], physicalFrame: common, labels: false, caption: 'Outlines share one scale' })));
  const scales = html.map(value => Number(value.match(/data-pixels-per-meter="([^"]+)"/)![1]));
  assert.equal(scales[0], scales[1]);
  for (const value of html) {
    assert.match(value, /data-physical-frame="shared"/); assert.match(value, /Outlines share one scale/);
    assert.match(value, /scale bar · north up/); assert.match(value, /fill-rule="evenodd"/);
  }
});

test('existing geographic story bounds still determine their scale without a comparison frame', () => {
  const component = geoScene(), bounds = [-74.002, 40.698, -73.998, 40.702];
  const html = [square(5325), square(40557)].map(building => renderToStaticMarkup(React.createElement(component, { features: [{ id: 'outline', geometry: building.geometry, color: '#315b54' }], bounds, labels: false })));
  assert.equal(html[0].match(/data-pixels-per-meter="([^"]+)"/)![1], html[1].match(/data-pixels-per-meter="([^"]+)"/)![1]);
  assert.match(html[0], /data-physical-frame="individual"/);
});
