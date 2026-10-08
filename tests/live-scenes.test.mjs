import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { sanitize } = require('../app/core/settings.cjs');
const { Scheduler } = require('../app/core/scheduler.cjs');
const { CloudGate } = require('../app/core/cloud-gate.cjs');
const { robotStatus } = require('../app/core/robot-status.cjs');
const { LIVE_SCENE_IDS, nextPlaylistScene } = require('../app/core/live-scenes.cjs');

test('existing playlists gain cartoon without changing their order or toggles', () => {
  const old = ['garden', 'heat', 'robots', 'lines', 'monsters'].map(id => ({ id, enabled: id === 'garden' }));
  assert.deepEqual(sanitize({ scenes: old }).scenes, [...old, { id: 'cartoon', enabled: true }]);
});

test('playlist order includes enabled Lucy scenes without opening connections', () => {
  const settings = sanitize({ duration: 10, scenes: ['heat', 'cartoon', 'lines', 'robots', 'garden', 'monsters'].map(id => ({ id, enabled: true })) });
  const scheduler = new Scheduler(settings, 0);
  for (const id of LIVE_SCENE_IDS) scheduler.availability(id, false, 0);
  assert.equal(nextPlaylistScene(scheduler, true), 'cartoon');
  assert.equal(scheduler.until('cartoon', 0, true), 10000);
  scheduler.tick(10001); assert.equal(scheduler.active, 'lines');
  assert.equal(nextPlaylistScene(scheduler, true), 'robots');
  assert.equal(nextPlaylistScene(scheduler, false), 'garden');
});

test('cartoon-only playlist can connect with robots disabled and stays ambient until decoded', () => {
  const settings = sanitize({ robotEnabled: true });
  settings.scenes = settings.scenes.map(scene => ({ ...scene, enabled: scene.id === 'cartoon' }));
  const scheduler = new Scheduler(settings, 0);
  for (const id of LIVE_SCENE_IDS) scheduler.availability(id, false, 0);
  assert.equal(scheduler.active, null);
  assert.equal(nextPlaylistScene(scheduler, true), 'cartoon');
  const input = { settings, hasKey: true, gate: new CloudGate(), cloud: {}, ready: false, camera: 'live', frameFresh: true, now: 1e9 };
  assert.equal(robotStatus(input).canGenerate, true);
  scheduler.availability('cartoon', true, 1000);
  assert.equal(scheduler.active, 'cartoon');
  scheduler.availability('cartoon', false, 2000);
  assert.equal(scheduler.active, null);
  settings.scenes.find(scene => scene.id === 'cartoon').enabled = false;
  assert.equal(robotStatus(input).state, 'scene-disabled');
});
