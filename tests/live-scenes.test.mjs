import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { sanitize } = require('../app/core/settings.cjs');
const { Scheduler } = require('../app/core/scheduler.cjs');
const { CloudGate } = require('../app/core/cloud-gate.cjs');
const { robotStatus } = require('../app/core/robot-status.cjs');
const { LIVE_SCENE_IDS, nextPlaylistScene } = require('../app/core/live-scenes.cjs');

test('existing playlists drop removed scenes and gain current scenes without changing remaining order or toggles', () => {
  const old = ['garden', 'cartoon', 'heat', 'robots', 'lines', 'monsters', 'words'].map(id => ({ id, enabled: id === 'garden' }));
  const saved = [...old];
  saved.splice(2, 0, ...['animation3d', 'cyberpunk', 'claymation'].map(id => ({ id, enabled: true })));
  assert.deepEqual(sanitize({ scenes: saved }).scenes, [...old, ...['ghibli25', 'monstersLiving', 'afterglow'].map(id => ({ id, enabled: true }))]);
});

test('the Lucy Latest Ghibli comparison retains its saved ID, playlist order and choices', () => {
  const old = sanitize().scenes.filter(scene => scene.id !== 'ghibli25').reverse()
    .map(scene => ({ ...scene, enabled: scene.id !== 'cartoon' }));
  const updated = sanitize({ scenes: old }).scenes;
  assert.deepEqual(updated, [...old, { id: 'ghibli25', enabled: true }]);
  updated.find(scene => scene.id === 'ghibli25').enabled = false;
  assert.deepEqual(sanitize({ scenes: updated }).scenes, updated);
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

for (const sceneId of LIVE_SCENE_IDS) test(`${sceneId}-only playlist stays ambient until decoded`, () => {
  const settings = sanitize({ robotEnabled: true });
  settings.scenes = settings.scenes.map(scene => ({ ...scene, enabled: scene.id === sceneId }));
  const scheduler = new Scheduler(settings, 0);
  for (const id of LIVE_SCENE_IDS) scheduler.availability(id, false, 0);
  assert.equal(scheduler.active, null);
  assert.equal(nextPlaylistScene(scheduler, true), sceneId);
  const input = { settings, hasKey: true, gate: new CloudGate(), cloud: {}, ready: false, camera: 'live', frameFresh: true, now: 1e9 };
  assert.equal(robotStatus(input).canGenerate, true);
  scheduler.availability(sceneId, true, 1000);
  assert.equal(scheduler.active, sceneId);
  scheduler.availability(sceneId, false, 2000);
  assert.equal(scheduler.active, null);
  settings.scenes.find(scene => scene.id === sceneId).enabled = false;
  assert.equal(robotStatus(input).state, 'scene-disabled');
});
