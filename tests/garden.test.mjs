import test from 'node:test';
import assert from 'node:assert/strict';
import Garden from '../app/scenes/garden.js';

const empty = { motion: { points: [], calm: [] } };
const moving = { motion: { points: [{ x: .5, y: .3, strength: .6 }], calm: [] } };
const stillPerson = { motion: { points: [], calm: [{ x: .5, y: .3, strength: .7 }] } };
function create() { const scene = new Garden(); scene.activate(); return scene; }
function step(scene, seconds, analysis = empty, quality = 2, intensity = .7) {
  for (let i = 0; i < Math.round(seconds * 30); i++) scene.update({ dt: 1 / 30, analysis, quality, intensity });
}

test('an empty or disconnected garden never grows flowers or attracts butterflies on its own', () => {
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

test('occupied stillness attracts butterflies, regional movement disperses them, and camera loss fades them', () => {
  const scene = create(); step(scene, 8, stillPerson);
  assert(scene.butterflies.every(b => b.alpha > .9)); assert.equal(scene.plants.length, 0);
  step(scene, 4, { motion: { points: moving.motion.points, calm: stillPerson.motion.calm } });
  assert(scene.butterflies.every(b => b.alpha < .01), 'lagging calm cells cannot attract butterflies through movement');
  step(scene, 6, stillPerson); assert(scene.butterflies.some(b => b.alpha > .8));
  step(scene, 8); assert(scene.butterflies.every(b => b.alpha < .001));
});

test('simultaneous motion and stillness in different regions support both interactions', () => {
  const scene = create();
  step(scene, 8, { motion: { points: [{ x: .1, y: .2, strength: .5 }], calm: [{ x: .8, y: .4 }] } });
  assert(scene.plants.length > 10); assert(scene.butterflies.every(b => b.alpha > .9));
});

test('quality and intensity bound growth; cleanup releases all effects', () => {
  const scene = create(); step(scene, 30, moving, 2, 1);
  assert.equal(scene.plants.length, 112);
  step(scene, .1, moving, 0, 1); assert(scene.plants.length <= 48);
  scene.cleanup(); assert.equal(scene.plants.length, 0); assert.equal(scene.butterflies.length, 0);
  scene.activate(); step(scene, 10, moving, 2, 0); step(scene, 10, stillPerson, 2, 0);
  assert.equal(scene.plants.length, 0); assert(scene.butterflies.every(b => b.alpha === 0));
});
