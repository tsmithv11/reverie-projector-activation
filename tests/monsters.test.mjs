import test from 'node:test';
import assert from 'node:assert/strict';
import Monsters from '../app/scenes/monsters.js';
import { CAST, CreatureAnimation } from '../app/scenes/creature-animation.js';

const still = { motion: { points: [], amount: 0 } };
const movement = x => ({ motion: { points: [{ x, y: .5, strength: .5 }] } });
const crowd = { motion: { points: CAST.map(s => ({ x: s.x + .04, y: .5, strength: .75 })) } };
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

test('loading artwork cannot consume the resting entrance before creatures appear', () => {
  const scene = create(), start = scene.creatures.map(c => c.pose());
  scene.background = { naturalWidth: 0 }; scene.sprites = {};
  step(scene, 2, crowd);
  assert.deepEqual(scene.creatures.map(c => c.pose()), start);
  assert.equal(scene.bubbles.length, 0);
  scene.background.naturalWidth = 1672;
  scene.sprites = Object.fromEntries(CAST.map(s => [s.id, {}]));
  step(scene, .15, crowd);
  assert.deepEqual(scene.creatures.map(c => c.pose()), start);
  step(scene, .2, crowd); assert(scene.creatures.some(c => c.action));
});

test('every creature changes authored poses and position with independent timing', () => {
  const scene = create(), frames = CAST.map(() => new Set()), xs = CAST.map(() => new Set());
  step(scene, 3); // Waiting must preserve the entrance stagger.
  step(scene, .32, crowd);
  assert(scene.creatures[0].action); assert(!scene.creatures[4].action);
  for (let i = 0; i < 420; i++) {
    scene.update({ dt: 1 / 60, analysis: crowd, intensity: .8 });
    scene.creatures.forEach((c, index) => { frames[index].add(c.pose().frame); xs[index].add(c.pose().x.toFixed(6)); });
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
  const scene = create(); step(scene, 1.3, movement(.4));
  const jumper = scene.creatures.find(c => c.spec.id === 'jumper');
  assert(jumper.pose().y < jumper.spec.y - .1, 'a real flight arc clears the bay');
  const existing = new Set(scene.bubbles);
  step(scene, .4);
  assert(scene.bubbles.every(b => existing.has(b)));
  step(scene, 15);
  assert(scene.creatures.every(c => !c.action && c.pose().frame === 0 && c.x === c.spec.x));
  assert.equal(scene.bubbles.length, 0); assert.equal(scene.ripples.length, 0); assert.equal(scene.splashes.length, 0);
  assert.equal(scene.activity, 0);
});

test('movement wakes nearby creatures and preserves separate moving groups', () => {
  const scene = create(); step(scene, 1, movement(.05));
  assert(scene.creatures.find(c => c.spec.id === 'antenna').action);
  assert(scene.creatures.find(c => c.spec.id === 'tall').action);
  for (const id of ['green', 'blue', 'pink', 'jumper']) assert(!scene.creatures.find(c => c.spec.id === id).action, id);
  scene.activate();
  step(scene, 1, { motion: { points: [{ x: .05, y: .3, strength: .7 }, { x: .95, y: .3, strength: .7 }] } });
  assert(scene.creatures.find(c => c.spec.id === 'antenna').action);
  assert(scene.creatures.find(c => c.spec.id === 'blue').action);
  assert(!scene.creatures.find(c => c.spec.id === 'jumper').action, 'no phantom activity at the average of two groups');
});

test('hops preserve the resting pose on activation and require motion through anticipation', () => {
  for (const spec of CAST.filter(s => ['bound', 'skip', 'leap'].includes(s.action))) {
    const creature = new CreatureAnimation(spec, 0), rest = creature.pose();
    const input = { moving: true, focus: 0, strength: .8, intensity: 1 };
    for (let i = 0; i < 60 && !creature.action; i++) creature.update(1/60, input);
    assert(creature.action); assert.deepEqual(creature.pose(), rest, spec.id + ' must not jump or flip on activation');
    for (let i = 0; i < 9; i++) creature.update(1/60, input);
    assert.equal(creature.pose().lift, 0, spec.id + ' anticipates before takeoff');
    creature.update(1/60, { ...input, moving: false });
    assert(!creature.action); assert.equal(creature.pose().lift, 0);
  }
});

test('live movement reversals steer an active action without automatic back-and-forth', () => {
  const spec = CAST[0], creature = new CreatureAnimation(spec, 0);
  const input = { moving: true, focus: 1, strength: .8, intensity: 1 };
  for (let i = 0; i < 60; i++) creature.update(1/60, input);
  const right = creature.x;
  for (let i = 0; i < 30; i++) creature.update(1/60, { ...input, focus: 0 });
  assert(creature.action); assert(creature.x < right - .01);
  let previous = creature.x;
  for (let i = 0; i < 600; i++) {
    creature.update(1/60, { ...input, focus: 0 });
    assert(creature.x <= previous + 1e-8, 'steady input must not reverse the travel'); previous = creature.x;
  }
});

test('gentle motion produces smaller hops and landing events occur at water contact', () => {
  const spec = CAST.find(s => s.id === 'jumper');
  const peaks = [.06, .8].map(strength => {
    const creature = new CreatureAnimation(spec, 0); let peak = 0, landings = 0;
    for (let i = 0; i < 125; i++) {
      const event = creature.update(1/60, { moving: true, focus: spec.x, strength, intensity: 1 });
      peak = Math.max(peak, creature.pose().lift);
      if (event === 'land') { landings++; assert(creature.pose().lift < .001); }
    }
    assert.equal(landings, 1); return peak;
  });
  assert(peaks[1] > peaks[0] * 3);
});

test('large bubbles respond promptly at motion locations instead of a shared waterline', t => {
  let seed = 17;
  t.mock.method(Math, 'random', () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646);
  const scene = create(), input = { motion: { points: [{ x: .12, y: .25, strength: .8 }, { x: .88, y: .7, strength: .8 }] } };
  step(scene, .15, input);
  assert(scene.bubbles.length >= 2, 'visible burst immediately after the motion gate');
  assert(scene.bubbles.every(b => b.r >= .013 && (b.x < .16 || b.x > .84)));
  step(scene, 1, input);
  assert(scene.bubbles.some(b => b.x < .16 && b.y < .28));
  assert(scene.bubbles.some(b => b.x > .84 && b.y > .55));
  const existing = new Set(scene.bubbles); step(scene, .2);
  assert(scene.bubbles.every(b => existing.has(b)), 'no new bubbles after movement stops');
});

test('a full bubble budget still responds when movement changes sides', () => {
  const scene = create(); step(scene, 3, movement(.1), 0, 1);
  assert.equal(scene.bubbles.length, 16);
  step(scene, .15, movement(.9), 0, 1);
  assert(scene.bubbles.some(b => b.x > .85 && b.age < .2));
  assert(scene.bubbles.length <= 16);
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
