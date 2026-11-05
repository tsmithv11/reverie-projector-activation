import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { outputSize, outputArea, coverRect, fitCameraAnalysis } from '../app/core/display.js';
import { camera } from '../app/scenes/base.js';
const { sanitize } = createRequire(import.meta.url)('../app/core/settings.cjs');
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('display format survives saved settings and defaults older installations to widescreen', () => {
  assert.equal(sanitize().displayFormat, '16:9');
  assert.equal(sanitize({ displayFormat: 'invalid' }).displayFormat, '16:9');
  for (const displayFormat of ['4:3', '16:9', 'fill']) {
    assert.equal(sanitize(JSON.parse(JSON.stringify(sanitize({ displayFormat })))).displayFormat, displayFormat);
  }
});

test('fixed formats retain their proportions at every quality and ignore window shape', () => {
  for (const quality of [0, 1, 2]) {
    for (const [format, ratio] of [['4:3', 4 / 3], ['16:9', 16 / 9]]) {
      const size = outputSize(format, quality, 2560, 1080);
      close(size.width / size.height, ratio);
      assert.deepEqual(size, outputSize(format, quality, 800, 1000));
      assert.equal(size.width % 2, 0); assert.equal(size.height % 2, 0);
    }
  }
  assert.deepEqual(outputSize('4:3', 2), { width: 1392, height: 1044 });
  assert.deepEqual(outputSize('16:9', 2), { width: 1920, height: 1080 });
});

test('fill follows native 4:3 and widescreen outputs and caps larger or portrait displays', () => {
  assert.deepEqual(outputSize('fill', 2, 1392, 1044), { width: 1392, height: 1044 });
  assert.deepEqual(outputSize('fill', 2, 1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(outputSize('fill', 2, 3840, 2160), { width: 1920, height: 1080 });
  assert.deepEqual(outputSize('fill', 2, 1200, 1600), { width: 810, height: 1080 });
  assert.deepEqual(outputSize('fill', 0, 1392, 1044), { width: 960, height: 720 });
  for (const quality of [0, 1, 2]) {
    const size = outputSize('fill', quality, 3440, 1440);
    assert(size.width <= [1280, 1600, 1920][quality]);
    assert(size.height <= [720, 900, 1080][quality]);
    assert(Math.abs(size.height - size.width * 1440 / 3440) < 2);
  }
  assert.deepEqual(outputSize('fill', 1, 0, 0), { width: 1600, height: 900 });
});

test('LED wall uses its physical 1392×1044 region instead of the larger reported desktop', () => {
  const settings = sanitize({ outputMapping: 'wall-1392', outputExtraWidth: 0, displayFormat: '4:3' });
  for (const dpr of [1, 1.25, 2]) {
    const area = outputArea(settings, 1920 / dpr, 1600 / dpr, dpr);
    assert.equal(area.x, 0); assert.equal(area.y, 0);
    close(area.width * dpr, 1392); close(area.height * dpr, 1044);
    for (const quality of [0, 1, 2]) {
      const size = outputSize('4:3', quality, area.width * dpr, area.height * dpr);
      close(size.width / size.height, area.width / area.height);
    }
    assert.deepEqual(outputSize('fill', 2, area.width * dpr, area.height * dpr), { width: 1392, height: 1044 });
  }
  assert.deepEqual(outputArea(sanitize(), 1920, 1600), { x: 0, y: 0, width: 1920, height: 1600 });
});

test('wall offsets use physical pixels and keep the complete picture in bounds', () => {
  const settings = sanitize({ outputMapping: 'wall-1392', outputExtraWidth: 0, outputOffsetX: 264, outputOffsetY: 278 });
  assert.deepEqual(outputArea(settings, 1920, 1600), { x: 264, y: 278, width: 1392, height: 1044 });
  assert.deepEqual(outputArea(settings, 960, 800, 2), { x: 132, y: 139, width: 696, height: 522 });
  assert.deepEqual(outputArea({ ...settings, outputOffsetX: 9999, outputOffsetY: 9999 }, 1920, 1600), { x: 528, y: 556, width: 1392, height: 1044 });
  assert.deepEqual(outputArea({ ...settings, outputOffsetX: 0, outputOffsetY: 0 }, 800, 600), { x: 0, y: 0, width: 800, height: 600 });
  assert.deepEqual(outputArea(settings, 1392, 1044), { x: 0, y: 0, width: 1392, height: 1044 });
  assert.deepEqual(outputArea({ ...settings, outputMapping: 'screen' }, 800, 600), { x: 0, y: 0, width: 800, height: 600 });
});

test('wall mapping and offsets persist, with safe defaults for old or invalid settings', () => {
  const settings = sanitize({ outputMapping: 'wall-1392', outputExtraWidth: 0, outputOffsetX: 264, outputOffsetY: 278 });
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify(settings))), settings);
  assert.equal(sanitize().outputMapping, 'screen');
  const invalid = sanitize({ outputMapping: 'unknown', outputOffsetX: -10, outputOffsetY: Infinity });
  assert.equal(invalid.outputMapping, 'screen'); assert.equal(invalid.outputOffsetX, 0); assert.equal(invalid.outputOffsetY, 0);
  assert.equal(sanitize({ outputOffsetX: 99999 }).outputOffsetX, 16384);
  assert.equal(sanitize({ outputOffsetY: '23.6' }).outputOffsetY, 24);
});

test('right-edge correction adds 20 physical pixels without moving the left edge or changing height', () => {
  const settings = sanitize({ outputMapping: 'wall-1392', outputOffsetX: 264, outputOffsetY: 278 });
  assert.equal(settings.outputExtraWidth, 20, 'existing saved wall settings pick up the correction');
  for (const dpr of [1, 1.25, 2]) {
    const before = outputArea({ ...settings, outputExtraWidth: 0 }, 1920 / dpr, 1600 / dpr, dpr);
    const after = outputArea(settings, 1920 / dpr, 1600 / dpr, dpr);
    close(after.x, before.x); close(after.y, before.y); close(after.height, before.height);
    close((after.width - before.width) * dpr, 20);
    close(after.width * dpr, 1412); close(after.height * dpr, 1044);
  }
  assert.equal(sanitize(JSON.parse(JSON.stringify(settings))).outputExtraWidth, 20);
  assert.equal(sanitize({ outputExtraWidth: 0 }).outputExtraWidth, 0, 'zero restores exact native width');
  assert.equal(sanitize({ outputExtraWidth: -10 }).outputExtraWidth, 0);
  assert.equal(sanitize({ outputExtraWidth: 999 }).outputExtraWidth, 200);
  assert.equal(sanitize({ outputExtraWidth: NaN }).outputExtraWidth, 20);
  const preview = outputArea(settings, 800, 600);
  close(preview.width, 800); assert(preview.height <= 600); assert(preview.x >= 0 && preview.y >= 0);
});

test('camera, live video and contour pixels use a centered crop without stretching', () => {
  const source = { width: 960, height: 540 }, draws = [];
  const ctx = { save() {}, restore() {}, drawImage(...args) { draws.push(args); } };
  camera(ctx, source, 1392, 1044);
  const [frame, x, y, width, height] = draws[0];
  assert.equal(frame, source); close(width / height, 16 / 9);
  close(x + width / 2, 696); close(y + height / 2, 522);
  close(height, 1044); assert(x < 0);
  assert.deepEqual(coverRect(960, 540, 1920, 1080), { x: 0, y: 0, width: 1920, height: 1080 });
});

test('detection and motion overlays follow the camera crop, omitting offscreen detections', () => {
  const analysis = {
    boxes: [{ x: .25, y: .2, w: .5, h: .6, score: .9 }, { x: .01, y: .2, w: .05, h: .5 }],
    motion: { points: [{ x: .5, y: .4, strength: .8 }, { x: .05, y: .5 }], calm: [{ x: .25, y: .6 }], amount: .2, edges: new Uint8ClampedArray(4) }
  };
  const before = structuredClone(analysis), fitted = fitCameraAnalysis(analysis, 960, 540, 1392, 1044);
  assert.equal(fitted.boxes.length, 1);
  close(fitted.boxes[0].x, 1 / 6); close(fitted.boxes[0].w, 2 / 3);
  close(fitted.boxes[0].y, .2); close(fitted.boxes[0].h, .6);
  assert.equal(fitted.boxes[0].score, .9);
  assert.equal(fitted.motion.points.length, 1); close(fitted.motion.points[0].x, .5);
  close(fitted.motion.calm[0].x, 1 / 6);
  assert.equal(fitted.motion.edges, analysis.motion.edges);
  assert.deepEqual(analysis, before);
  assert.deepEqual(fitCameraAnalysis(analysis, 960, 540, 1920, 1080), analysis);
  const wide = fitCameraAnalysis(analysis, 960, 540, 1920, 800);
  close(wide.motion.points[0].y, .365); close(wide.boxes[0].h, .81);
});
