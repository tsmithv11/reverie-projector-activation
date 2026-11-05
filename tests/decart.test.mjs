import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { decartModel, decartFailure, ownDecartTransports } from '../app/core/decart-connection.js';
const require = createRequire(import.meta.url);
const { mintDecartToken, TOKEN_URL } = require('../app/core/decart-auth.cjs');
const { readKeys, saveKey } = require('../app/core/credentials.cjs');
const { CloudGate } = require('../app/core/cloud-gate.cjs');
const { sanitize } = require('../app/core/settings.cjs');
const { LIVE_SCENE_IDS } = require('../app/core/live-scenes.cjs');
const { liveScene } = require('../app/core/live-scenes.cjs');
const { safeDiagnostic } = require('../app/core/robot-status.cjs');
const { configuredProviders, backupProvider } = require('../app/core/robot-providers.cjs');

test('Decart reports the underlying SDK failure instead of hiding it behind Signaling error', () => {
  assert.deepEqual(decartFailure({ code: 'WEBRTC_SIGNALING_ERROR', message: 'Signaling error', cause: Error('Prompt enhancement failed') }), {
    code: 'SIGNALING', detail: 'Prompt enhancement failed'
  });
  assert.deepEqual(decartFailure({ code: 'WEBRTC_SIGNALING_ERROR', message: 'Signaling error', cause: Error('Content contains copyrighted IP that cannot be generated') }), {
    code: 'PROMPT_REJECTED', detail: 'Content contains copyrighted IP that cannot be generated'
  });
  for (const [sdkCode, code] of [['INVALID_API_KEY', 'AUTH_REJECTED'], ['WEBRTC_WEBSOCKET_ERROR', 'SIGNALING'], ['WEBRTC_ICE_ERROR', 'PEER_CONNECTION'], ['WEBRTC_TIMEOUT_ERROR', 'TIMEOUT'], ['WEBRTC_SERVER_ERROR', 'PROVIDER_ERROR']]) {
    assert.equal(decartFailure({ code: sdkCode, message: 'Specific failure' }).code, code);
  }
  const circular = Error('Original failure'); circular.cause = circular;
  assert.equal(decartFailure(circular).detail, 'Original failure');
  assert.equal(decartFailure({ cause: 'String failure' }).detail, 'String failure');
  assert.equal(decartFailure(null).detail, '');
});

test('Decart cause diagnostics redact temporary credentials and negotiation data before leaving the service', () => {
  const token = 'short-secret';
  const result = decartFailure({ message: 'Signaling error', cause: Error(`Rejected ${token} at wss://api3.decart.ai/connect?token=${token}`), data: { token } }, token);
  assert(!result.detail.includes(token)); assert(!result.detail.includes('wss:'));
  assert.equal(decartFailure({ cause: Error('v=0\r\na=ice-pwd:private') }).detail, 'Provider rejected the video negotiation.');
  assert.equal(decartFailure({ cause: Error('x'.repeat(500)) }).detail, '[redacted]');
});

test('Decart auth scopes a temporary token with a provider-side duration backstop, without exposing permanent credentials', async () => {
  let request;
  const token = await mintDecartToken('private-test-key', async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ apiKey: 'temporary-token' }) }; });
  assert.equal(token, 'temporary-token'); assert.equal(request.url, TOKEN_URL);
  assert.equal(TOKEN_URL, 'https://api.decart.ai/v1/client/tokens');
  assert.equal(request.headers['x-api-key'], 'private-test-key');
  assert.deepEqual(JSON.parse(request.body), { expiresIn: 120, allowedModels: ['lucy-latest'], constraints: { realtime: { maxSessionDuration: 100 } } });
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

for (const sceneId of LIVE_SCENE_IDS) test(`${sceneId} scopes credentials to its model and uses its native frame size`, async () => {
  const expectedModel = ['robots', 'ghibli25'].includes(sceneId) ? 'lucy-latest' : 'lucy-restyle-2';
  let body;
  await mintDecartToken('private-test-key', async (_, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ apiKey: 'temporary-token' }) };
  }, sceneId);
  assert.deepEqual(body.allowedModels, [expectedModel]);
  const model = decartModel(sceneId);
  assert.equal(model.name, expectedModel); assert.equal(model.width, 1280);
  assert.equal(model.height, expectedModel === 'lucy-latest' ? 720 : 704);
  await assert.rejects(mintDecartToken('private-test-key', () => { throw Error('Must not authenticate an unknown scene'); }, 'unknown'), /Unknown live scene/);
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
  assert.deepEqual(configuredProviders({ decart: 'd', fal: 'f' }), ['decart']);
  assert.deepEqual(configuredProviders({ fal: 'f' }), []);
  assert.deepEqual(configuredProviders({ decart: 'd' }), ['decart']);
  assert.deepEqual(configuredProviders({}), []);
  const run = { providers: ['decart', 'fal'], index: 0 };
  for (const code of ['AUTH_REJECTED', 'TIMEOUT', 'VIDEO_STALLED', 'SESSION_BUSY']) assert.equal(backupProvider(run, code), 'fal');
  for (const code of ['CANCELLED', 'SCENE_ENDED', 'APP_QUIT', 'CAMERA_LOST', 'DISPLAY_LOST']) assert.equal(backupProvider(run, code), null);
  assert.equal(backupProvider({ ...run, index: 1 }, 'TIMEOUT'), null);
});

test('backup is counted and cannot overlap the primary or bypass disabling Lucy', () => {
  const settings = sanitize({ robotEnabled: true }), gate = new CloudGate(), now = 1e9;
  assert.equal(gate.reserve(now, settings, true), '');
  assert.equal(gate.reserveFallback(now + 1000, settings, true), 'busy');
  gate.finish(); assert.equal(gate.reserveFallback(now + 2000, settings, true), '');
  assert.equal(gate.session, 2);
  gate.finish(); assert.equal(gate.reserveFallback(now + 3000, { ...settings, robotEnabled: false }, true), 'disabled');
  assert.equal(new CloudGate().reserveFallback(now, settings, false), 'missing-key');
});

class Socket extends EventTarget {
  static CLOSING = 2;
  readyState = 0;
  close(code) { this.code = code; this.readyState = 2; }
  finish() { this.readyState = 3; this.dispatchEvent(Object.assign(new Event('close'), { code: 1000, wasClean: true })); }
}
class Peer { close() { this.closed = true; } }

test('Lucy Latest keeps self-anchoring disabled at connect time for both audience-editing scenes', async () => {
  const source = readFileSync(new URL('../app/core/decart-connection.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  for (const sceneId of LIVE_SCENE_IDS) {
    let options;
    const context = vm.createContext({
      WebSocket: Socket, RTCPeerConnection: Peer, setTimeout, clearTimeout, liveScene, safeDiagnostic,
      models: { realtime: name => ({ name }) },
      createDecartClient: () => ({ realtime: { connect: async (_, value) => {
        options = value; return { on() {}, disconnect() {} };
      } } })
    });
    const open = vm.runInContext(`${source}\nopenDecartConnection`, context);
    const connection = open({ token: 'test-token', sceneId, stream: {}, onError: () => assert.fail('Unexpected error'), onRemoteStream() {}, onStage() {} });
    const editing = ['robots', 'ghibli25'].includes(sceneId);
    assert.equal(options.model.name, editing ? 'lucy-latest' : 'lucy-restyle-2');
    assert.equal(options.queryParams?.self_anchor, editing ? 'false' : undefined);
    assert.equal(options.initialState.prompt.enhance, sceneId === 'ghibli25');
    assert.equal(options.retries, 0);
    await connection.close();
  }
});

test('Decart forwards nested failures from both connect rejection and emitted SDK errors, and ignores late events after close', async () => {
  const source = readFileSync(new URL('../app/core/decart-connection.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const failure = { code: 'WEBRTC_SIGNALING_ERROR', message: 'Signaling error', cause: Error('Content contains copyrighted IP that cannot be generated') };
  for (const rejects of [false, true]) {
    const handlers = {}, failures = [];
    const context = vm.createContext({
      WebSocket: Socket, RTCPeerConnection: Peer, setTimeout, clearTimeout, liveScene, safeDiagnostic,
      models: { realtime: name => ({ name }) },
      createDecartClient: () => ({ realtime: { connect: async () => {
        if (rejects) throw failure;
        return { on: (name, handler) => { handlers[name] = handler; }, disconnect() {} };
      } } })
    });
    const open = vm.runInContext(`${source}\nopenDecartConnection`, context);
    const connection = open({ token: 'test-token', sceneId: 'ghibli25', stream: {}, onError: (...args) => failures.push(args), onRemoteStream() {}, onStage() {} });
    await new Promise(resolve => setImmediate(resolve));
    if (!rejects) handlers.error(failure);
    assert.deepEqual(failures, [['PROMPT_REJECTED', failure.cause.message]]);
    await connection.close();
    if (!rejects) { handlers.error(failure); handlers.sessionEnded({ reason: 'closed' }); }
    assert.equal(failures.length, 1);
  }
});

test('custom prompts reach Decart during setup and live playback without reconnecting, and stop after cleanup', async () => {
  const source = readFileSync(new URL('../app/core/decart-connection.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const updates = [], failures = [];
  let options, resolveConnect, connections = 0;
  const context = vm.createContext({
    WebSocket: Socket, RTCPeerConnection: Peer, setTimeout, clearTimeout, liveScene, safeDiagnostic,
    models: { realtime: name => ({ name }) },
    createDecartClient: () => ({ realtime: { connect: (_, value) => {
      connections++; options = value; return new Promise(resolve => { resolveConnect = resolve; });
    } } })
  });
  const open = vm.runInContext(`${source}\nopenDecartConnection`, context);
  const connection = open({ token: 'test-token', sceneId: 'customRestyle', prompt: 'Paper cutouts', stream: {},
    onError: (...args) => failures.push(args), onRemoteStream() {}, onStage() {} });
  assert.equal(options.initialState.prompt.text, 'Paper cutouts');
  assert.equal(options.initialState.prompt.enhance, false);
  connection.setPrompt('First edit'); connection.setPrompt('Latest edit');
  assert.equal(updates.length, 0);
  resolveConnect({ on() {}, disconnect() {}, async setPrompt(text, { enhance }) {
    updates.push([text, enhance]);
    if (text === 'Rejected') throw Error('Prompt update failed');
  } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(updates, [['Latest edit', false]]);
  connection.setPrompt('Watercolor'); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(updates.at(-1), ['Watercolor', false]); assert.equal(connections, 1);
  connection.setPrompt('Rejected'); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(failures, [['PROVIDER_ERROR', 'Prompt update failed']]);
  connection.setPrompt('Cancelled'); await connection.close(); connection.setPrompt('After close');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(updates.length, 3);
});

test('Decart pending-connect cleanup closes all transports and prevents late SDK reconnects', async () => {
  const scope = { WebSocket: Socket, RTCPeerConnection: Peer }, errors = [];
  const transport = ownDecartTransports(scope, (...error) => errors.push(error));
  const socket = new scope.WebSocket(), peer = new scope.RTCPeerConnection();
  const closing = transport.close();
  assert.equal(socket.code, 1000); assert(peer.closed); assert.equal(transport.close(), closing);
  assert.throws(() => new scope.WebSocket(), /stopped/); assert.throws(() => new scope.RTCPeerConnection(), /stopped/);
  socket.finish(); assert((await closing).acknowledged); assert.deepEqual(errors, []);
});
