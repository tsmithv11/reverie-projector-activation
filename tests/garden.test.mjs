import test from 'node:test';
import assert from 'node:assert/strict';
import Garden from '../app/scenes/garden.js';

const empty = { motion: { points: [], calm: [] } };
const quiet = { motion: { points: [], calm: [], quiet: true } };
const moving = { motion: { points: [{ x: .5, y: .3, strength: .6 }], calm: [] } };
const stillPerson = { motion: { points: [], calm: [{ x: .5, y: .3, strength: .7 }] } };
function create() { const scene = new Garden(); scene.activate(); return scene; }
function step(scene, seconds, analysis = empty, quality = 2, intensity = .7) {
  for (let i = 0; i < Math.round(seconds * 30); i++) scene.update({ dt: 1 / 30, analysis, quality, intensity });
}

test('missing or stale analysis never generates butterflies or flowers', () => {
  const scene = create(); step(scene, 120);
  assert.equal(scene.plants.length, 0); assert(scene.butterflies.every(b => b.alpha === 0)); assert.equal(scene.activity, 0);
});

test('sustained motion grows ground-rooted plants near the movement, then the garden settles', () => {
  const scene = create(); step(scene, .066, moving); step(scene, .2);
  assert.equal(scene.plants.length, 0, 'brief noise cannot grow plants');
  step(scene, 12, moving);
  assert(scene.plants.length > 30);
  assert(scene.plants.every(p => p.y >= .86 && p.y <= 1.03 && p.x >= .45 && p.x <= .55));
  assert(scene.butterflies.every(b => b.alpha === 0));
  const existing = new Set(scene.plants); step(scene, 3);
  assert(scene.plants.every(p => existing.has(p)), 'stillness never grows new plants');
  step(scene, 55); assert.equal(scene.plants.length, 0); assert(scene.activity < .001);
});

test('a quiet scene attracts butterflies without any detected people', () => {
  const scene = create(); step(scene, 6, quiet);
  assert(scene.butterflies.filter(b => b.alpha > .8).length >= 5); assert.equal(scene.plants.length, 0);
  step(scene, 18); assert(scene.butterflies.every(b => b.alpha === 0), 'loss of sensing allows flights to finish without new births');
});

test('butterflies float away on the same schedule whether stillness continues or motion resumes', () => {
  const still = create(), resumed = create(), lost = create();
  for (const scene of [still, resumed, lost]) step(scene, 5, stillPerson);
  const initial = { ...still.butterflies[0] };
  assert(initial.alpha > .9); assert.equal(still.plants.length, 0);
  step(still, 3, stillPerson); step(resumed, 3, moving); step(lost, 3);
  assert.deepEqual(resumed.butterflies[0], still.butterflies[0], 'motion must not change an existing flight');
  assert.deepEqual(lost.butterflies[0], still.butterflies[0], 'camera loss must not cut a flight short');
  assert(still.butterflies[0].y < initial.y - .07, 'butterfly rises even while the person remains still');
  step(still, 2, stillPerson);
  assert(still.butterflies[0].alpha < initial.alpha, 'stillness cannot keep an old butterfly visible forever');
  step(still, 3, stillPerson);
  assert(still.butterflies[0].age < initial.age, 'continued stillness creates a fresh flight after the old one expires');
  step(resumed, 18, moving); step(lost, 18);
  assert(resumed.butterflies.every(b => b.alpha === 0)); assert(lost.butterflies.every(b => b.alpha === 0));
});

test('continuous movement blocks births, including lagging calm or quiet signals', () => {
  const scene = create();
  step(scene, 30, { motion: { ...moving.motion, calm: stillPerson.motion.calm, quiet: true } });
  assert(scene.butterflies.every(b => b.life === 0));
});

test('simultaneous motion and stillness in different regions support both interactions', () => {
  const scene = create();
  step(scene, 8, { motion: { points: [{ x: .1, y: .2, strength: .5 }], calm: [{ x: .8, y: .4 }] } });
  assert(scene.plants.length > 10); assert(scene.butterflies.some(b => b.alpha > .9));
});

test('quality and intensity bound growth; cleanup releases all effects', () => {
  const scene = create(); step(scene, 30, moving, 2, 1);
  assert.equal(scene.plants.length, 112);
  step(scene, .1, moving, 0, 1); assert(scene.plants.length <= 48);
  scene.cleanup(); assert.equal(scene.plants.length, 0); assert.equal(scene.butterflies.length, 0);
  scene.activate(); step(scene, 10, moving, 2, 0); step(scene, 10, stillPerson, 2, 0); step(scene, 10, quiet, 2, 0);
  assert.equal(scene.plants.length, 0); assert(scene.butterflies.every(b => b.alpha === 0));
});
