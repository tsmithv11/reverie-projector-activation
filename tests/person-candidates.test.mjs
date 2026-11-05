import test from 'node:test';
import assert from 'node:assert/strict';
import { describePose, selectPersonCandidates } from '../app/core/person-candidates.js';
import { PersonTracker, MAX_PEOPLE, CONFIRM_WINDOW } from '../app/core/person-tracker.js';
import { assignPeople } from '../app/core/person-assignment.js';

const width = 100, height = 100, pixels = new Uint8ClampedArray(width * height * 4);
function fixture(offset = 0) {
  const mask = new Float32Array(width * height), landmarks = [];
  for (let y = 10; y < 90; y++) for (let x = 20 + offset; x < 60 + offset; x++) mask[y * width + x] = .95;
  for (const [i, x, y] of [[0, .4, .15], [11, .3, .3], [12, .5, .3], [13, .25, .45], [14, .55, .45], [15, .25, .55], [16, .55, .55], [23, .32, .6], [24, .48, .6], [25, .32, .75], [26, .48, .75], [27, .32, .85], [28, .48, .85]]) {
    landmarks[i] = { x: x + offset / width, y, visibility: .95 };
  }
  return { mask, landmarks };
}
const describe = f => describePose(f.mask, pixels, width, height, f.landmarks);

test('foreground without reliable body evidence is rejected', () => {
  const f = fixture();
  assert(describe(f));
  assert.equal(describe({ ...f, landmarks: [] }), null);
  assert.equal(describe({ ...f, landmarks: f.landmarks.map(p => ({ ...p, visibility: .2 })) }), null);
  assert.equal(describe({ ...f, landmarks: f.landmarks.map(p => ({ ...p, x: .95 })) }), null, 'pose is off its mask');
  assert.equal(describe({ ...f, landmarks: f.landmarks.map(p => ({ ...p, x: .4, y: .4 })) }), null, 'collapsed joints are not a body');
  assert.equal(describe({ ...f, mask: new Float32Array(width * height).fill(NaN) }), null);
});

test('partial upper and lower bodies remain eligible without a face or full skeleton', () => {
  for (const visible of [[11, 12, 13, 14], [23, 24, 25, 26]]) {
    const f = fixture();
    f.landmarks = f.landmarks.map((p, i) => ({ ...p, visibility: visible.includes(i) ? .8 : .1 }));
    assert(describe(f));
  }
  const f = fixture();
  f.landmarks[23] = { x: NaN, y: Infinity, visibility: 1 };
  f.landmarks[24] = { x: .5, y: 1.2, visibility: 1 };
  const d = describe(f); assert(d); assert(Number.isFinite(d.x)); assert(d.y <= 1);
});

test('duplicate masks are removed but overlapping people with distinct joints survive', () => {
  const a = fixture(), copy = fixture(), neighbor = fixture(5);
  const candidates = [a, copy, neighbor].map(f => ({ ...f, description: describe(f) }));
  candidates[0].description.quality = .8;
  const selected = selectPersonCandidates(candidates, width, height);
  assert.equal(selected.length, 2);
  assert(selected.includes(candidates[1]), 'retain the stronger duplicate');
  assert(selected.includes(candidates[2]), 'retain the overlapping neighbor');
  neighbor.mask = copy.mask.slice();
  assert.equal(selectPersonCandidates([candidates[1], { ...neighbor, description: describe(neighbor) }], width, height).length, 2, 'even identical masks need matching joints before merging people');
});

test('new highlights need consecutive fresh captures; missing tracks never render ghosts', () => {
  const tracker = new PersonTracker(), d = describe(fixture());
  const first = tracker.update([d], 0)[0]; assert.equal(first.confirmed, false);
  assert.equal(tracker.update([d], 0)[0].confirmed, false, 'repeated timestamp is not evidence');
  assert.deepEqual(tracker.update([], 100), []);
  assert.equal(tracker.update([d], 200)[0].confirmed, false, 'isolated hits do not accumulate');
  const second = tracker.update([d], 300)[0]; assert(second.confirmed); assert.equal(second.id, first.id);
  assert.deepEqual(tracker.update([], 400), []);
  assert(tracker.update([d], 900)[0].confirmed, 'confirmed tracks survive brief occlusion');
  tracker.reset(); tracker.update([d], 0);
  assert.equal(tracker.update([d], CONFIRM_WINDOW + 1)[0].confirmed, false, 'stale candidates start over');
});

test('sixteen people confirm independently and keep unique identities when order reverses', () => {
  assert.equal(MAX_PEOPLE, 16);
  const tracker = new PersonTracker();
  const crowd = Array.from({ length: MAX_PEOPLE }, (_, i) => ({ x: .05 + (i % 8) * .12, y: .25 + Math.floor(i / 8) * .5, top: .1, area: .004, appearance: [i / 16, 0, 0, 0, 0, 0] }));
  const first = tracker.update(crowd, 0);
  const second = tracker.update([...crowd].reverse(), 100);
  assert(second.every(p => p.confirmed));
  assert.equal(new Set(second.map(p => p.id)).size, 16);
  assert.equal(new Set(second.map(p => p.color)).size, 16);
  assert.deepEqual(second.map(p => p.id), first.map(p => p.id).reverse());
});

test('assignment agrees with exhaustive optima including unmatched and forbidden pairs', () => {
  let seed = 71;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let sample = 0; sample < 50; sample++) {
    const rows = sample % 5, count = sample % 4;
    const costs = Array.from({ length: rows }, () => Array.from({ length: count }, () => random() < .2 ? Infinity : random()));
    const brute = (di, used) => {
      if (di === count) return 0;
      return Math.min(.85 + brute(di + 1, used), ...costs.map((row, ti) => used.has(ti) ? Infinity : row[di] + brute(di + 1, new Set([...used, ti]))));
    };
    const matched = assignPeople(costs, count);
    assert.equal(new Set(matched.values()).size, matched.size);
    const actual = [...matched].reduce((total, [di, ti]) => total + costs[ti][di], (count - matched.size) * .85);
    assert(Math.abs(actual - brute(0, new Set())) < 1e-9);
  }
});
