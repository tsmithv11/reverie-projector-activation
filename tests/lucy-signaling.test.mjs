import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '@msgpack/msgpack';
import { openLucySignaling } from '../app/core/lucy-signaling.js';

function fixture(closeTimeoutMs = 1000, onResult) {
  const sockets = [], failures = [], received = [];
  class Socket {
    static OPEN = 1;
    readyState = 0; sent = []; closes = [];
    constructor() { sockets.push(this); }
    send(data) { this.sent.push(decode(data)); }
    close(...args) { this.closes.push(args); this.readyState = 2; }
    open() { this.readyState = 1; this.onopen(); }
    result(data) { this.onmessage({ data: encode(data) }); }
    closed(code = 1000, wasClean = true) { this.readyState = 3; this.onclose({ code, wasClean }); }
  }
  const client = openLucySignaling({ token: 'test-token', input: { prompt: 'robots' }, Socket, closeTimeoutMs, onResult: async data => { received.push(data); await onResult?.(data); }, onError: error => failures.push(error) });
  return { client, socket: sockets[0], sockets, failures, received };
}

test('Lucy shutdown waits for the close event; repeated close does not redial or send another prompt', async () => {
  const { client, socket, sockets } = fixture(); socket.open();
  assert.deepEqual(socket.sent, [{ prompt: 'robots' }]);
  let finished = false;
  const closing = client.close(); closing.then(() => { finished = true; });
  await new Promise(r => setTimeout(r, 20));
  assert(!finished, 'Do not acknowledge teardown merely because close() was called');
  assert.equal(client.close(), closing);
  assert.equal(client.send({ prompt: 'more robots' }), false);
  assert.deepEqual(socket.closes, [[1000, 'Scene ended']]);
  socket.closed(); assert.deepEqual(await closing, { acknowledged: true, code: 1000 });
  assert.equal(sockets.length, 1); assert.equal(socket.sent.length, 1);
});

test('cancelling a connecting socket prevents late-open input and observes unclean closure', async () => {
  const { client, socket } = fixture(); const closing = client.close();
  assert.equal(socket.closes.length, 1); socket.open(); assert.equal(socket.sent.length, 0);
  socket.closed(1006, false); assert.deepEqual(await closing, { acknowledged: false, code: 1006 });
});

test('a missing close handshake has a bounded, explicitly unacknowledged result', async () => {
  const { client } = fixture(25);
  assert.deepEqual(await client.close(), { acknowledged: false, code: null });
});

test('FAL keepalive envelopes do not fail the session; provider refusals remain visible', async () => {
  const { socket, client, received, failures } = fixture(); socket.open();
  socket.result({ type: 'x-fal-message', arbitrary: 'not forwarded' });
  socket.result({ type: 'x-fal-error', error: 'TIMEOUT' });
  socket.result({ type: 'error', error: 'Concurrent session limit reached.' });
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(failures, []);
  assert.deepEqual(received, [{ type: 'error', error: 'Concurrent session limit reached.' }]);
  const closing = client.close(); socket.closed(); await closing;
});

test('remote normal close is terminal and never silently opens another socket', async () => {
  const { socket, sockets, client, failures } = fixture(); socket.open(); socket.closed();
  await new Promise(r => setTimeout(r, 0));
  assert.match(failures[0], /closed.*1000/);
  await client.close(); assert.equal(sockets.length, 1);
});

test('a concurrency refusal arriving during offer creation survives a late send and remote close', async () => {
  let finishOffer, client;
  const creatingOffer = new Promise(resolve => { finishOffer = resolve; });
  const f = fixture(1000, async data => {
    if (data.type === 'ready') { await creatingOffer; client.send({ type: 'offer', sdp: 'test-only' }); }
    if (data.type === 'error') await client.close();
  });
  client = f.client; f.socket.open();
  f.socket.result({ type: 'ready' });
  await new Promise(r => setTimeout(r, 0));
  f.socket.result({ type: 'error', error: 'Concurrent session limit reached.' });
  f.socket.closed(); finishOffer();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(f.failures, [], 'Do not mask the provider error with a late-send or close error');
  assert.equal(f.received.at(-1).error, 'Concurrent session limit reached.');
  assert.equal(f.socket.sent.length, 1); assert.equal(f.sockets.length, 1);
});
