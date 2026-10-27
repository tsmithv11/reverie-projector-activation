import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { outputSize, coverRect, fitCameraAnalysis } from '../app/core/display.js';
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
