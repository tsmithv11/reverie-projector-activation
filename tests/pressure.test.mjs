import test from 'node:test';
import assert from 'node:assert/strict';
import Monsters from '../app/scenes/monsters.js';
import Garden from '../app/scenes/garden.js';
test('eight simulated hours of maximum crowd motion keep scene resources bounded', () => {
  const monsters = new Monsters(), garden = new Garden(); monsters.activate(); garden.activate();
  const context = { dt: .1, time: 0, intensity: 1, quality: 2, analysis: { motion: { points: Array.from({ length: 48 }, (_, i) => ({ x: i % 8 / 8, y: Math.floor(i / 8) / 6, strength: 1 })), calm: Array.from({ length: 24 }, (_, i) => ({ x: i / 24, y: .5 })) } } };
  let maxBubbles = 0, maxPlants = 0;
  for (let i = 0; i < 288000; i++) { context.time = i / 10; monsters.update(context); garden.update(context); maxBubbles = Math.max(maxBubbles, monsters.bubbles.length); maxPlants = Math.max(maxPlants, garden.plants.length); }
  assert(maxBubbles <= 110); assert(maxPlants <= 210); assert.equal(monsters.creatures.length, 7); assert.equal(garden.butterflies.length, 12);
  monsters.cleanup(); garden.cleanup(); assert.equal(monsters.bubbles.length, 0); assert.equal(garden.plants.length, 0);
});
