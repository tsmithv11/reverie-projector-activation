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
  assert.deepEqual(scene.jumperPose(), start, 'the bay waits for camera motion');
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
  assert(Math.abs(scene.jumperPose().x - rest.x) < .003, 'it bobs near its home instead of chasing bubbles');
  assert(scene.bubbles.every(b => existing.has(b)), 'no new bubbles after motion stops');
  step(scene, 1);
  assert.equal(scene.jump, null); assert(scene.cooldown > 0);
  step(scene, 10);
  assert.equal(scene.bubbles.length, 0); assert.equal(scene.ripples.length, 0); assert.equal(scene.jump, null);
  assert.equal(scene.activity, 0);
  const settledTime = scene.animationTime;
  step(scene, 2); assert.equal(scene.animationTime, settledTime, 'water and painted creatures stop after settling');
});

test('sustained motion wakes the whole scene smoothly and stronger motion gives a stronger response', () => {
  const gentle = create(), lively = create();
  step(gentle, .05, movement); step(gentle, .2);
  assert.equal(gentle.activity, 0, 'brief noise cannot wake the artwork');
  const weak = { motion: { points: [{ x: .05, y: .9, strength: .06 }] } };
  step(gentle, 2, weak); step(lively, 2, movement);
  assert(gentle.activity > .25, 'even localized movement wakes all creatures');
  assert(lively.activity > gentle.activity * 1.5);
  assert(lively.animationTime > gentle.animationTime);
  const active = lively.activity;
  step(lively, .1); assert(lively.activity > 0 && lively.activity < active, 'motion eases out');
  step(lively, 10); assert.equal(lively.activity, 0);
});

test('zero intensity and invalid movement cannot wake creatures or water', () => {
  const scene = create();
  for (let i = 0; i < 60; i++) scene.update({ dt: 1 / 30, analysis: movement, intensity: 0 });
  assert.equal(scene.activity, 0); assert.equal(scene.animationTime, 0);
  assert.equal(scene.jump, null); assert.equal(scene.bubbles.length, 0);
  step(scene, 2, { motion: { points: [{ x: NaN, y: .4 }, { x: .5, y: Infinity }, { x: .4, y: .4, strength: .01 }] } });
  assert.equal(scene.activity, 0);
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
