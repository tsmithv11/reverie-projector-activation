import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PersonTracker, MAX_PEOPLE, TRACK_COLORS, TRACK_TTL } from '../app/core/person-tracker.js';
import { composePersonMasks, describePerson, maskContour } from '../app/core/person-masks.js';
import { registry } from '../app/scenes/index.js';
const require = createRequire(import.meta.url), { sanitize, SCENES } = require('../app/core/settings.cjs');
const { isLiveScene } = require('../app/core/live-scenes.cjs');
const person = (x, appearance = [.8, .1, .2, .1, .1, .1]) => ({ x, y: .5, top: .2, area: .1, appearance });

test('Afterglow is local and appends to saved playlists without altering choices', () => {
  const old = SCENES.filter(s => s.id !== 'afterglow').reverse().map(s => ({ id: s.id, enabled: s.id === 'garden' }));
  assert.deepEqual(sanitize({ scenes: old }).scenes, [...old, { id: 'afterglow', enabled: true }]);
  assert(registry.afterglow); assert.equal(isLiveScene('afterglow'), false);
});

test('colors survive detector reordering, movement, crossing, and a brief occlusion', () => {
  const tracker = new PersonTracker(), blue = [.1, .2, .9, .1, .1, .1];
  const first = tracker.update([person(.2), person(.8, blue)], 0);
  for (let step = 1; step <= 6; step++) {
    const result = tracker.update([person(.8 - step * .07, blue), person(.2 + step * .07)], step * 100);
    assert.deepEqual(result.map(p => [p.id, p.color]), [first[1], first[0]].map(p => [p.id, p.color]));
  }
  assert.deepEqual(tracker.update([], 800), [], 'missing people must not render ghosts');
  const returned = tracker.update([person(.73), person(.27, blue)], 1000);
  assert.deepEqual(returned.map(p => p.id), first.map(p => p.id));
  const expired = tracker.update([person(.73)], 1000 + TRACK_TTL + 1);
  assert.notEqual(expired[0].id, first[0].id);
});

test('global matching cannot give two people one track and new people get distinct colors', () => {
  const tracker = new PersonTracker(); tracker.update([person(.4), person(.6)], 0);
  const result = tracker.update([person(.51), person(.41), person(.9)], 100);
  assert.equal(new Set(result.map(p => p.id)).size, 3);
  assert.equal(new Set(result.map(p => p.color)).size, 3);
  assert.equal(result[1].id, 1);
  const empty = new PersonTracker();
  for (let i = 0; i < 100; i++) {
    empty.update(Array.from({ length: 30 }, (_, n) => person((n + 1) / 32, [i % 2, n % 3 / 3, i % 3 / 3, 0, 0, 0])), i * 100);
    assert(empty.tracks.length <= TRACK_COLORS.length);
  }
  assert.equal(empty.update(Array.from({ length: 30 }, (_, n) => person(n / 32)), 10001).length, MAX_PEOPLE);
  empty.reset(); assert.equal(empty.tracks.length, 0); assert.equal(empty.update([person(.5)], 0)[0].id, 1);
});

test('masks preserve holes and concave silhouettes and resolve overlap to a single color', () => {
  const w = 12, h = 10, a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) a[y * w + x] = .9;
  a[4 * w + 4] = 0; // a genuine hole, not a filled person rectangle
  for (let y = 3; y < 7; y++) for (let x = 6; x < 11; x++) b[y * w + x] = .95;
  const original = a.slice();
  const result = composePersonMasks([a, b], [{ id: 1, color: '#FAA0D0' }, { id: 2, color: '#7A9DDA' }], w, h);
  assert.equal(result.fill[(4 * w + 4) * 4 + 3], 0);
  assert.equal(result.fill[3], 0);
  assert.deepEqual([...result.fill.slice((4 * w + 6) * 4, (4 * w + 6) * 4 + 4)], [122, 157, 218, 255]);
  assert.deepEqual(a, original);
  for (const instance of result.instances) {
    assert(instance.contour.length > 24); assert.equal(instance.contour.length % 4, 0);
    assert([...instance.contour].every(Number.isFinite));
  }
  assert(result.instances[0].contour.some(v => !Number.isInteger(v)), 'contour interpolates subpixel confidence crossings');
  assert.equal(maskContour(new Float32Array(16), 4, 4).length, 0);
  assert.equal(composePersonMasks([], [], w, h).fill.some(v => v), false);
});

test('mask descriptors reject empty foreground and use actual pixels', () => {
  const w = 32, h = 24, mask = new Float32Array(w * h), rgba = new Uint8ClampedArray(w * h * 4);
  assert.equal(describePerson(mask, rgba, w, h), null);
  for (let y = 4; y < 22; y++) for (let x = 8; x < 24; x++) { mask[y * w + x] = 1; rgba[(y * w + x) * 4] = 255; }
  const d = describePerson(mask, rgba, w, h);
  assert(d.x > .4 && d.x < .6); assert(d.area > 0); assert.equal(d.top, 4 / 24);
  assert.deepEqual(d.appearance, [1, 0, 0, 0, 0, 0]);
});
