import test from 'node:test';
import assert from 'node:assert/strict';
import Monsters from '../app/scenes/monsters.js';
import { CAST, CreatureAnimation } from '../app/scenes/creature-animation.js';

const still = { motion: { points: [], amount: 0 } };
const movement = x => ({ motion: { points: [{ x, y: .5, strength: .5 }] } });
function step(scene, seconds, analysis = still, quality = 2, intensity = .7) {
  for (let i = 0; i < Math.round(seconds * 60); i++) scene.update({ dt: 1 / 60, analysis, quality, intensity });
}
function create() { const scene = new Monsters(); scene.activate(); return scene; }

test('the six separated characters wait for sustained camera motion', () => {
  const scene = create(), start = scene.creatures.map(c => c.pose());
  step(scene, 20);
  assert.deepEqual(scene.creatures.map(c => c.pose()), start);
  assert.equal(scene.bubbles.length, 0); assert.equal(scene.activity, 0);
  step(scene, .05, movement(.5)); step(scene, .2);
  assert(scene.creatures.every(c => !c.action));
  assert.equal(scene.activity, 0);
});

test('every creature changes authored poses and position with independent timing', () => {
  const scene = create(), frames = CAST.map(() => new Set()), xs = CAST.map(() => new Set());
  step(scene, 3); // Waiting must preserve the entrance stagger.
  step(scene, .2, movement(.9));
  assert(scene.creatures[0].action); assert(!scene.creatures[4].action);
  for (let i = 0; i < 420; i++) {
    scene.update({ dt: 1 / 60, analysis: movement(.9), intensity: .8 });
    scene.creatures.forEach((c, index) => { frames[index].add(c.pose().frame); xs[index].add(c.pose().x.toFixed(4)); });
  }
  scene.creatures.forEach((c, i) => {
    assert(frames[i].size >= 6, c.spec.id + ' must use its actual pose drawings');
    assert(xs[i].size > 20, c.spec.id + ' must travel rather than deform in place');
    assert(c.completed > 0); assert(Math.abs(c.x - c.spec.x) <= c.spec.travel + .001);
  });
});

test('passing motion on opposite sides produces opposite travel and facing', () => {
  for (const spec of CAST) {
    const left = new CreatureAnimation(spec, 0), right = new CreatureAnimation(spec, 0);
    for (let i = 0; i < 65; i++) {
      left.update(1/60, { moving: true, focus: 0, strength: .7, intensity: .8 });
      right.update(1/60, { moving: true, focus: 1, strength: .7, intensity: .8 });
    }
    assert(left.x < spec.x, spec.id + ' should move left');
    assert(right.x > spec.x, spec.id + ' should move right');
    assert.equal(left.pose().direction, -1); assert.equal(right.pose().direction, 1);
  }
});

test('leaps clear the surface and settle at home after motion stops', () => {
  const scene = create(); step(scene, 1.3, movement(.8));
  const jumper = scene.creatures.find(c => c.spec.id === 'jumper');
  assert(jumper.pose().y < jumper.spec.y - .12, 'a real flight arc clears the bay');
  const existing = new Set(scene.bubbles);
  step(scene, .4);
  assert(scene.bubbles.every(b => existing.has(b)));
  step(scene, 15);
  assert(scene.creatures.every(c => !c.action && c.pose().frame === 0 && c.x === c.spec.x));
  assert.equal(scene.bubbles.length, 0); assert.equal(scene.ripples.length, 0); assert.equal(scene.splashes.length, 0);
  assert.equal(scene.activity, 0);
});

test('motion strength and intensity control water activation; invalid input remains idle', () => {
  const gentle = create(), lively = create();
  step(gentle, 2, { motion: { points: [{ x: .05, y: .9, strength: .06 }] } });
  step(lively, 2, movement(.5));
  assert(gentle.activity > .25); assert(lively.activity > gentle.activity * 1.5);
  const idle = create(); step(idle, 2, movement(.5), 2, 0);
  step(idle, 2, { motion: { points: [{ x: NaN, y: .4 }, { x: .5, y: Infinity }, { x: .4, y: .4, strength: .01 }] } });
  assert.equal(idle.activity, 0); assert.equal(idle.bubbles.length, 0); assert(idle.creatures.every(c => !c.action));
});

test('quality caps, cooldowns and cleanup bound active effects', () => {
  const scene = create(); step(scene, 30, movement(.5), 2, 1);
  assert(scene.bubbles.length <= 32); assert(scene.splashes.length <= 56); assert(scene.ripples.length <= 8);
  assert(scene.creatures.every(c => c.completed < 16), 'actions respect their rest periods');
  step(scene, .1, movement(.5), 0); assert(scene.bubbles.length <= 16);
  scene.cleanup(); assert.equal(scene.creatures.length, 0); assert.equal(scene.bubbles.length, 0);
  scene.activate(); step(scene, 2); assert.equal(scene.bubbles.length, 0); assert(scene.creatures.every(c => !c.action));
});
