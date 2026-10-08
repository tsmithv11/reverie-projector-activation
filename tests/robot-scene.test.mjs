import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Scheduler } = require('../app/core/scheduler.cjs');
const { sanitize } = require('../app/core/settings.cjs');
const { CloudGate } = require('../app/core/cloud-gate.cjs');
const { robotStatus, safeDiagnostic } = require('../app/core/robot-status.cjs');
const { resolveKeyPath } = require('../app/core/key-path.cjs');

test('unavailable robots are skipped by rotation and manual selection, but retain their planned playlist slot', () => {
  const scheduler = new Scheduler(sanitize({ duration: 10 }), 0);
  scheduler.availability('robots', false, 0);
  assert.equal(scheduler.until('robots', 0, true), 10000);
  scheduler.select('robots', 1000); assert.equal(scheduler.active, 'heat');
  scheduler.tick(10001); assert.equal(scheduler.active, 'monsters');
  scheduler.pause(10001); scheduler.availability('robots', true, 11000);
  assert.equal(scheduler.active, 'monsters'); assert(scheduler.paused);
  scheduler.select('robots', 12000); assert.equal(scheduler.active, 'robots');
  scheduler.availability('robots', false, 13000); assert.equal(scheduler.active, 'monsters');
});

test('an unavailable robot-only playlist waits safely and recovers when live video arrives', () => {
  const settings = sanitize({ scenes: ['robots','heat','monsters','lines','garden','cartoon'].map(id => ({ id, enabled: id === 'robots' })) });
  const scheduler = new Scheduler(settings, 0);
  scheduler.availability('robots', false, 0); assert.equal(scheduler.active, null);
  scheduler.tick(60001); assert.equal(scheduler.active, null);
  assert.equal(scheduler.until('robots', 60001, true), 0);
  scheduler.configure(sanitize(settings), 60001); assert.equal(scheduler.active, null);
  scheduler.availability('robots', true, 60002); assert.equal(scheduler.active, 'robots');
});

test('operator gets actionable missing-key, disabled, failure and recovery status', () => {
  const settings = sanitize({ robotEnabled: true });
  const input = { settings, hasKey: false, gate: new CloudGate(), cloud: {}, ready: false, camera: 'live', frameFresh: true, now: 1e9 };
  assert.equal(robotStatus(input).state, 'missing-key');
  assert.match(robotStatus(input).message, /No Decart or FAL key/); assert.equal(robotStatus(input).canGenerate, false);
  assert.equal(robotStatus({ ...input, settings: sanitize() }).state, 'disabled');
  input.hasKey = true; assert(robotStatus(input).canGenerate);
  input.gate.reserve(input.now, settings, true); input.gate.failed(input.now); input.gate.finish();
  input.cloud = { state: 'error', code: 'AUTH_REJECTED', message: 'FAL rejected the API key.' };
  const failed = robotStatus(input); assert.equal(failed.code, 'AUTH_REJECTED'); assert.match(failed.blockReason, /Next scheduled connection/); assert.equal(failed.canGenerate, false); assert.match(failed.display, /Skipped/);
});

test('local packaged build finds project key without packaging it; installed and test profiles stay isolated', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'reverie-key-test-'));
  try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'reverie-projector' }));
    writeFileSync(path.join(root, '.env'), 'FAL_KEY=fake');
    const runtime = path.join(root, 'profile'); mkdirSync(runtime);
    const appPath = path.join(root, 'release/mac-arm64/Reverie Installation.app/Contents/Resources/app.asar');
    const options = { packaged: true, runtime, appPath };
    assert.equal(resolveKeyPath(options), path.join(root, '.env'));
    assert.equal(resolveKeyPath({ ...options, testMode: true }), path.join(runtime, '.env'));
    assert.equal(resolveKeyPath({ ...options, appPath: '/Applications/Reverie Installation.app/Contents/Resources/app.asar' }), path.join(runtime, '.env'));
    writeFileSync(path.join(runtime, '.env'), 'FAL_KEY=');
    assert.equal(resolveKeyPath(options), path.join(runtime, '.env'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('provider diagnostics retain useful errors and redact credentials, URLs and session descriptions', () => {
  assert.equal(safeDiagnostic({ message: 'Invalid offer: missing video track' }), 'Invalid offer: missing video track');
  const detail = safeDiagnostic('Failure private-secret at wss://fal.run/path?token=abc Bearer example-token', 'private-secret');
  assert(!detail.includes('private-secret')); assert(!detail.includes('example-token')); assert(!detail.includes('token=abc'));
  assert.equal(safeDiagnostic('v=0\r\na=ice-pwd:private'), 'Provider rejected the video negotiation.');
  assert.equal(safeDiagnostic({ image: 'private-frame' }), '');
});

test('concurrency rejection is classified separately from other provider failures', () => {
  const { classifyRobotFailure } = require('../app/core/robot-status.cjs');
  assert.equal(classifyRobotFailure('PROVIDER_ERROR', 'Concurrent session limit reached.'), 'SESSION_BUSY');
  assert.equal(classifyRobotFailure('SIGNALING', { message: 'Concurrent session limit reached.' }), 'SESSION_BUSY');
  assert.equal(classifyRobotFailure('PROVIDER_ERROR', 'Invalid prompt'), 'PROVIDER_ERROR');
});

test('failed requests back off for one minute then automatically become eligible', () => {
  const settings = sanitize({ robotEnabled: true }), gate = new CloudGate(), now = 1e9;
  assert.equal(gate.reserve(now, settings, true), '');
  gate.failed(now + 2000);
  assert.equal(gate.reason(now + 62000, settings, true), 'busy', 'Cleanup retains the connection lock');
  gate.finish();
  assert.equal(gate.reason(now + 3000, settings, true), 'provider-wait');
  assert.equal(gate.reason(now + 62000, settings, true), '');
  assert.equal(gate.reserve(now + 63000, settings, true), '');
  assert.equal(gate.session, 2);
  gate.finish(); assert.equal(gate.reason(now + 64000, settings, true), '');
  settings.robotEnabled = false;
  assert.equal(gate.reason(now + 64000, settings, true), 'disabled');
});
