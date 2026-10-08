import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ownDecartTransports } from '../app/core/decart-connection.js';
const require = createRequire(import.meta.url);
const { mintDecartToken, TOKEN_URL } = require('../app/core/decart-auth.cjs');
const { readKeys, saveKey } = require('../app/core/credentials.cjs');
const { CloudGate } = require('../app/core/cloud-gate.cjs');
const { sanitize } = require('../app/core/settings.cjs');
const { configuredProviders, backupProvider } = require('../app/core/robot-providers.cjs');

test('Decart auth scopes a temporary token and session duration, without exposing permanent credentials', async () => {
  let request;
  const token = await mintDecartToken('private-test-key', async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ apiKey: 'temporary-token' }) }; });
  assert.equal(token, 'temporary-token'); assert.equal(request.url, TOKEN_URL);
  assert.equal(TOKEN_URL, 'https://api.decart.ai/v1/client/tokens');
  assert.equal(request.headers['x-api-key'], 'private-test-key');
  assert.deepEqual(JSON.parse(request.body), { expiresIn: 120, allowedModels: ['lucy-2.5'], constraints: { realtime: { maxSessionDuration: 100 } } });
  assert(request.signal instanceof AbortSignal);
});

test('Decart auth reports bad keys, billing, limits, service and malformed responses without retries', async () => {
  for (const [status, code] of [[401, 'AUTH_REJECTED'], [403, 'AUTH_REJECTED'], [402, 'DECART_CREDITS'], [429, 'DECART_RATE_LIMIT'], [503, 'DECART_SERVICE']]) {
    let attempts = 0;
    await assert.rejects(mintDecartToken('x', async () => { attempts++; return { ok: false, status }; }), { code });
    assert.equal(attempts, 1);
  }
  for (const value of [null, {}, { apiKey: 'short' }, { apiKey: 42 }]) await assert.rejects(mintDecartToken('x', async () => ({ ok: true, json: async () => value })), { code: 'AUTH_RESPONSE' });
});

test('saving either key preserves the other provider and unrelated env entries; clearing is independent', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reverie-credentials-')), file = path.join(dir, '.env');
  try {
    writeFileSync(file, '# Private config\nFAL_KEY=old\nDECART_API_KEY=direct\nOTHER=value\nFAL_KEY=duplicate\n');
    saveKey(file, 'fal', 'backup');
    assert.deepEqual(readKeys(file, {}), { decart: 'direct', fal: 'backup' });
    assert.equal(readFileSync(file, 'utf8').match(/^FAL_KEY=/gm).length, 1);
    saveKey(file, 'decart', 'new-direct'); saveKey(file, 'fal', '');
    assert.deepEqual(readKeys(file, {}), { decart: 'new-direct', fal: '' });
    assert.deepEqual(readKeys(file, { DECART_API_KEY: 'environment', FAL_KEY: 'backup-env' }), { decart: 'environment', fal: 'backup-env' });
    assert.match(readFileSync(file, 'utf8'), /# Private config/); assert.match(readFileSync(file, 'utf8'), /OTHER=value/);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.throws(() => saveKey(file, 'unknown', 'key')); assert.throws(() => saveKey(file, 'fal', 'bad\nKEY=value'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('provider order uses configured keys only and never falls back on operator/local stop', () => {
  assert.deepEqual(configuredProviders({ decart: 'd', fal: 'f' }), ['decart', 'fal']);
  assert.deepEqual(configuredProviders({ fal: 'f' }), ['fal']);
  assert.deepEqual(configuredProviders({ decart: 'd' }), ['decart']);
  assert.deepEqual(configuredProviders({}), []);
  const run = { providers: ['decart', 'fal'], index: 0 };
  for (const code of ['AUTH_REJECTED', 'TIMEOUT', 'VIDEO_STALLED', 'SESSION_BUSY']) assert.equal(backupProvider(run, code), 'fal');
  for (const code of ['CANCELLED', 'SCENE_ENDED', 'SESSION_LIMIT', 'APP_QUIT', 'CAMERA_LOST', 'DISPLAY_LOST', 'BUDGET_WRITE']) assert.equal(backupProvider(run, code), null);
  assert.equal(backupProvider({ ...run, index: 1 }, 'TIMEOUT'), null);
});

test('backup consumes its own persisted cap slot and cannot overlap or bypass caps', () => {
  const settings = sanitize({ robotEnabled: true, robotSessionCap: 2 }), gate = new CloudGate(), now = 1e9;
  assert.equal(gate.reserve(now, settings, true), '');
  assert.equal(gate.reserveFallback(now + 1000, settings, true), 'busy');
  gate.finish(); assert.equal(gate.reserveFallback(now + 2000, settings, true), '');
  assert.equal(gate.session, 2); assert.equal(gate.snapshot().history.length, 2);
  gate.finish(); assert.equal(gate.reserveFallback(now + 3000, settings, true), 'session-cap');
  const restored = new CloudGate({ history: Array(12).fill(now) });
  assert.equal(restored.reserveFallback(now + 4000, settings, true), 'hour-cap');
  assert.equal(new CloudGate().reserveFallback(now, settings, false), 'missing-key');
});

class Socket extends EventTarget {
  static CLOSING = 2;
  readyState = 0;
  close(code) { this.code = code; this.readyState = 2; }
  finish() { this.readyState = 3; this.dispatchEvent(Object.assign(new Event('close'), { code: 1000, wasClean: true })); }
}
class Peer { close() { this.closed = true; } }
test('Decart pending-connect cleanup closes all transports and prevents late SDK reconnects', async () => {
  const scope = { WebSocket: Socket, RTCPeerConnection: Peer }, errors = [];
  const transport = ownDecartTransports(scope, (...error) => errors.push(error));
  const socket = new scope.WebSocket(), peer = new scope.RTCPeerConnection();
  const closing = transport.close();
  assert.equal(socket.code, 1000); assert(peer.closed); assert.equal(transport.close(), closing);
  assert.throws(() => new scope.WebSocket(), /stopped/); assert.throws(() => new scope.RTCPeerConnection(), /stopped/);
  socket.finish(); assert((await closing).acknowledged); assert.deepEqual(errors, []);
});
