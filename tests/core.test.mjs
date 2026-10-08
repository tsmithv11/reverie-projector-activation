import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { MotionField } from '../app/core/motion.js';
import { SceneHost } from '../app/core/scene-host.js';
import { AdaptiveQuality } from '../app/core/performance.js';
const require = createRequire(import.meta.url), { Scheduler } = require('../app/core/scheduler.cjs'), { sanitize } = require('../app/core/settings.cjs'), { CloudGate } = require('../app/core/cloud-gate.cjs');
test('scheduler runs eight simulated hours, honors bounds and survives playlist edits', () => {
  const s = new Scheduler(sanitize({ duration: 10 }), 0); let changes = 0;
  for (let t = 0; t <= 8 * 3600000; t += 33) if (s.tick(t)) changes++;
  assert(changes > 2800); assert.equal(s.enabled().length, 5);
  s.pause(8 * 3600000); const remaining = s.left(8 * 3600000); s.tick(9 * 3600000); assert.equal(s.left(9 * 3600000), remaining);
  s.resume(9 * 3600000); assert.equal(s.left(9 * 3600000), remaining);
  s.configure(sanitize({ scenes: [{ id: 'garden', enabled: true }, ...s.settings.scenes.filter(x => x.id !== 'garden').map(x => ({ ...x, enabled: false }))] }), 9 * 3600000);
  assert.equal(s.active, 'garden'); assert.equal(s.until('robots', 0), Infinity);
});
test('pause has a stable remaining time; manual selection and reorder are deterministic', () => {
  const s = new Scheduler(sanitize(), 0); s.pause(17000); assert.equal(s.left(999999), 43000); s.resume(100000); assert.equal(s.left(105000), 38000);
  s.select('lines', 110000); assert.equal(s.left(110000), 60000); assert.equal(s.until('robots', 110000), 180000);
  s.configure(sanitize({ duration: 10 }), 110000); assert.equal(s.left(110000), 10000);
});
test('a one-scene playlist still reactivates on its next slot for a new activation', () => {
  const settings = sanitize({ duration: 10 }); settings.scenes = settings.scenes.map(s => ({ ...s, enabled: s.id === 'robots' }));
  const s = new Scheduler(settings, 0); s.tick(10001); assert.equal(s.active, 'robots'); assert.equal(s.activation, 1); assert.equal(s.left(10001), 10000);
});
test('invalid settings cannot disable every scene or exceed operational limits', () => {
  const s = sanitize({ duration: 400, intensity: NaN, scenes: ['bad', { id: 'heat', enabled: false }, { id: 'heat', enabled: true }], robotMinutes: 0, robotSessionCap: 999 });
  assert.equal(s.duration, 60); assert.equal(s.robotMinutes, 5); assert.equal(s.robotSessionCap, 100); assert(s.scenes.some(x => x.enabled)); assert.equal(new Set(s.scenes.map(x => x.id)).size, 5);
});
test('cloud gate bounds duplicate requests, failures, sessions and restart spending', () => {
  const settings = sanitize({ robotEnabled: true, robotMinutes: 5, robotSessionCap: 2 }), g = new CloudGate(); const now = 1e9;
  assert.equal(g.reserve(now, settings, false), 'missing-key'); assert.equal(g.reserve(now, settings, true), ''); assert.equal(g.reserve(now, settings, true), 'busy'); g.finish();
  assert.equal(g.reserve(now + 100, settings, true), 'cooldown');
  const restarted = new CloudGate({ history: g.history }); assert.equal(restarted.reserve(now + 100, settings, true), 'cooldown');
  assert.equal(g.reserve(now + 300000, settings, true), ''); g.finish(); assert.equal(g.reserve(now + 600000, settings, true), 'session-cap');
});
function pixels(value) { const p = new Uint8ClampedArray(160 * 90 * 4); for (let i = 0; i < p.length; i += 4) { p[i] = p[i + 1] = p[i + 2] = value; p[i + 3] = 255; } return p; }
test('motion rejects global illumination shifts and reacts to crowded local motion', () => {
  const f = new MotionField(); f.analyze(pixels(30)); assert.equal(f.analyze(pixels(100)).amount, 0);
  const p = pixels(100); for (let i = 0; i < p.length; i += 16) p[i] = p[i + 1] = p[i + 2] = 240;
  const r = f.analyze(p); assert(r.amount > .02); assert(r.points.length <= 48); assert.equal(r.energy.length, 336);
});
test('butterflies require occupancy and tolerate brief motion before fading', () => {
  const f = new MotionField(), p = pixels(100), boxes = [{ x: .2, y: .2, w: .5, h: .6 }]; let r;
  for (let i = 0; i < 45; i++) r = f.analyze(p, boxes, .1);
  assert(r.calm.length > 0);
  const flash = p.slice(); for (let i = 0; i < flash.length; i += 16) flash[i] = 0;
  assert(f.analyze(flash, boxes, .1).calm.length > 0);
  for (let i = 0; i < 60; i++) r = f.analyze(p, [], .1);
  assert.equal(r.calm.length, 0);
});
test('scene exceptions clean up and cannot prevent subsequent scenes', () => {
  let disposed = 0, painted = 0; const errors = [];
  class Bad { initialize() {} activate() {} update() { throw Error('bad scene'); } deactivate() { disposed++; } cleanup() { disposed++; } }
  class Good { initialize() {} activate() {} update() {} render() { painted++; } deactivate() {} cleanup() {} }
  const host = new SceneHost({ bad: Bad, good: Good }, (...args) => errors.push(args)); const ctx = { save() {}, restore() {} };
  host.activate('bad', {}); assert.equal(host.render(ctx, {}), false); assert.equal(disposed, 2); host.activate('good', {}); assert.equal(host.render(ctx, {}), true); assert.equal(painted, 1); assert.equal(errors.length, 1);
  host.activate('bad', {}); assert.equal(host.active, null);
});
test('quality uses hysteresis instead of oscillating on single dropped frames', () => {
  const q = new AdaptiveQuality(); q.sample(12, 'auto'); assert.equal(q.level, 1); q.sample(12, 'auto'); q.sample(12, 'auto'); assert.equal(q.level, 0);
  for (let i = 0; i < 19; i++) q.sample(30, 'auto'); assert.equal(q.level, 0); q.sample(30, 'auto'); assert.equal(q.level, 1);
});
