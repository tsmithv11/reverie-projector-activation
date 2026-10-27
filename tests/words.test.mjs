import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { WordField } from '../app/scenes/words.js';
import { fitCameraAnalysis } from '../app/core/display.js';
const require = createRequire(import.meta.url);
const { sanitize, SCENES } = require('../app/core/settings.cjs');
const moving = [{ x: .25, y: .5, strength: .7 }];
const peak = field => Math.max(...field.energy);
const step = (field, seconds, points = [], intensity = .7, fps = 30) => {
  for (let i = 0; i < seconds * fps; i++) field.update(1 / fps, points, intensity);
};

test('motion changes nearby words, leaves distant words quiet and fades after movement', () => {
  const field = new WordField(1920, 1080, 2);
  step(field, 2);
  assert.equal(peak(field), 0);
  step(field, .5, moving);
  assert(peak(field) > .8);
  assert.equal(field.energy[Math.floor(field.rows / 2) * field.cols + Math.floor(field.cols * .8)], 0);
  const active = peak(field);
  step(field, .3);
  assert(peak(field) > .3 && peak(field) < active, 'the trail should fade smoothly, not disappear abruptly');
  step(field, 7);
  assert(peak(field) < .001, 'empty or missing motion must leave no stuck highlights');
});

test('movement response is time based, respects intensity and resets on re-entry', () => {
  const slow = new WordField(1920, 1080), fast = new WordField(1920, 1080), quiet = new WordField(1920, 1080);
  step(slow, 1, moving, .7, 30); step(fast, 1, moving, .7, 60); step(quiet, 1, moving, 0);
  assert(Math.abs(peak(slow) - peak(fast)) < .00001);
  assert.equal(peak(quiet), 0);
  const softer = new WordField(1920, 1080); step(softer, 1, moving, .1);
  assert(peak(softer) > 0 && peak(softer) < peak(slow) / 2);
  slow.clear(); assert.equal(peak(slow), 0);
});

test('gentle walk-by motion reaches the pink range at default intensity', () => {
  const field = new WordField(1920, 1080, 2);
  step(field, 1, [{ x: .5, y: .5, strength: .06 }]);
  assert(peak(field) > .6);
});

test('cropped camera motion illuminates the matching location in a 4:3 output', () => {
  const analysis = fitCameraAnalysis({ boxes: [], motion: { points: moving, calm: [] } }, 1280, 720, 1392, 1044);
  const point = analysis.motion.points[0], field = new WordField(1392, 1044, 2);
  step(field, 1, analysis.motion.points);
  const index = field.energy.indexOf(peak(field));
  assert(Math.abs((index % field.cols + .5) / field.cols - point.x) < 1 / field.cols);
  assert(point.x < moving[0].x, 'the camera crop must move the point with the pixels');
});

test('crowded and invalid inputs stay bounded across quality levels and aspect ratios', () => {
  for (const [w, h, q] of [[1920,1080,2], [1392,1044,1], [960,720,0], [600,1080,2]]) {
    const field = new WordField(w, h, q), size = field.energy.length;
    const crowd = Array.from({ length: 1000 }, (_, i) => ({ x: (i % 10) / 10, y: (i % 7) / 7, strength: 100 }));
    step(field, 2, crowd);
    assert.equal(field.energy.length, size); assert(size <= 96 * 96);
    assert(field.energy.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    step(field, 8, [{ x: NaN, y: .5, strength: 1 }, { x: .5, y: .5, strength: Infinity }, { x: -1, y: .5, strength: 1 }]);
    assert(peak(field) < .001);
  }
});

test('existing playlists acquire the new local scene without losing order or disabled choices', () => {
  const old = SCENES.filter(scene => scene.id !== 'words').reverse().map((scene, i) => ({ id: scene.id, enabled: i !== 1 }));
  const settings = sanitize({ scenes: old });
  assert.deepEqual(settings.scenes.slice(0, old.length), old);
  assert.deepEqual(settings.scenes.at(-1), { id: 'words', enabled: true });
});
