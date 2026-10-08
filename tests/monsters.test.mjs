import test from 'node:test';
import assert from 'node:assert/strict';
import Monsters from '../app/scenes/monsters.js';

const still = { motion: { points: [], amount: 0 } };
const movement = { motion: { points: [{ x: .5, y: .5, strength: .5 }], amount: .1 } };
function step(scene, seconds, analysis = still, quality = 2) {
  for (let i = 0; i < Math.round(seconds * 60); i++) scene.update({ dt: 1 / 60, analysis, quality, intensity: .7 });
}
function create() { const scene = new Monsters(); scene.activate(); return scene; }

test('a still room never spawns bubbles or jumps and the resting creature stays anchored', () => {
  const scene = create(), start = scene.jumperPose();
  step(scene, .7);
  assert.notEqual(scene.jumperPose().y, start.y, 'subtle idle breathing remains');
  step(scene, 120);
  assert.equal(scene.bubbles.length, 0); assert.equal(scene.jump, null);
  assert.equal(scene.jumperPose().x, start.x);
  assert(Math.abs(scene.jumperPose().y - start.y) < .003);
});

test('motion produces bubbles and one hop, then returns to rest without further motion', () => {
  const scene = create(), rest = scene.jumperPose();
  step(scene, .18, movement);
  assert(scene.bubbles.length > 0); assert(scene.jump);
  const existing = new Set(scene.bubbles);
  step(scene, .6);
  assert(scene.jumperPose().y < rest.y - .03, 'the pink creature clears the water');
  assert.equal(scene.jumperPose().x, rest.x, 'it does not chase bubbles');
  assert(scene.bubbles.every(b => existing.has(b)), 'no new bubbles after motion stops');
  step(scene, 1);
  assert.equal(scene.jump, null); assert(scene.cooldown > 0);
  step(scene, 10);
  assert.equal(scene.bubbles.length, 0); assert.equal(scene.ripples.length, 0); assert.equal(scene.jump, null);
});

test('brief noise cannot start a jump and continuing motion respects the landing cooldown', () => {
  const scene = create();
  step(scene, .05, movement); step(scene, .1);
  assert.equal(scene.jump, null);
  step(scene, .2, movement); assert(scene.jump);
  step(scene, 1.4, movement); assert.equal(scene.jump, null);
  step(scene, .8, movement); assert.equal(scene.jump, null);
  step(scene, 1, movement); assert(scene.jump);
});

test('quality changes bound particles and scene cleanup clears active effects', () => {
  const scene = create(); step(scene, 20, movement);
  assert(scene.bubbles.length > 36); assert(scene.bubbles.length <= 90);
  step(scene, .1, movement, 0); assert(scene.bubbles.length <= 36);
  scene.cleanup(); assert.equal(scene.bubbles.length, 0); assert.equal(scene.ripples.length, 0); assert.equal(scene.jump, null);
  scene.activate(); step(scene, 2); assert.equal(scene.bubbles.length, 0); assert.equal(scene.jump, null);
});
