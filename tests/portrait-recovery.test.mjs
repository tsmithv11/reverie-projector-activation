import test from 'node:test';
import assert from 'node:assert/strict';
import { portraitCandidates, mergePortraitCandidates } from '../app/core/portrait-recovery.js';

const width = 100, height = 100, pixels = new Uint8ClampedArray(width * height * 4);
function region(left = 20, right = 80, top = 20, bottom = 100) {
  const mask = new Float32Array(width * height);
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) mask[y * width + x] = .95;
  return mask;
}
const box = { x: .2, y: .2, w: .6, h: .8, score: .8 };
const recover = (mask, boxes) => portraitCandidates(mask, pixels, width, height, boxes);

test('portrait recovery needs agreement between person detection and substantial foreground', () => {
  assert.equal(recover(region(), [box]).length, 1);
  assert.equal(recover(region(), []).length, 0);
  assert.equal(recover(region(), [{ ...box, score: .3 }]).length, 0);
  assert.equal(recover(region(20, 25, 20, 40), [box]).length, 0, 'a tiny patch does not establish a portrait');
  assert.equal(recover(region(0, 15), [box]).length, 0, 'an unrelated foreground region cannot confirm a detection');
  assert.equal(recover(new Float32Array(width * height).fill(NaN), [box]).length, 0);
});

test('separate portraits remain separate and ambiguous connected people are not merged', () => {
  const a = region(5, 40), b = region(60, 95), mask = a.map((v, i) => Math.max(v, b[i]));
  const boxes = [{ x: .05, y: .2, w: .35, h: .8, score: .8 }, { x: .6, y: .2, w: .35, h: .8, score: .8 }];
  const people = recover(mask, boxes);
  assert.equal(people.length, 2);
  assert(people.every(p => p.mask[50 * width + 50] === 0));
  for (let x = 39; x <= 60; x++) mask[50 * width + x] = 1;
  assert.equal(recover(mask, boxes).length, 0, 'connected semantic masks cannot be called one person');
});

test('a portrait replaces only its incomplete pose and never combines multiple pose tracks', () => {
  const portrait = recover(region(), [box])[0];
  const incomplete = { mask: region(30, 60, 25, 60) }, neighbor = { mask: region(0, 10) };
  assert.deepEqual(mergePortraitCandidates([incomplete, neighbor], [portrait]), [neighbor, portrait]);
  const other = { mask: region(65, 75, 30, 90) };
  assert.deepEqual(mergePortraitCandidates([incomplete, other], [portrait]), [incomplete, other]);
});
