import { _electron as electron } from 'playwright';
import { decode, encode } from '@msgpack/msgpack';
import path from 'node:path';
import assert from 'node:assert/strict';
const app = await electron.launch({ args: ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env: { ...process.env, FAL_KEY: '', DECART_API_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/transport-profile-${Date.now()}`) } });
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 60000);
const sceneId = process.argv.includes('--cartoon') ? 'cartoon' : 'robots';
const expectedPrompt = sceneId === 'cartoon' ? /entire scene.*2D cartoon/ : /robot/;
let directPrompt;
const useDecart = process.argv.includes('--decart-fallback');
let decartSockets = 0, decartPrompts = 0, decartClosed = false;
let connected = false, promptReceived = false, movingInputFrames = false, prompts = 0, sockets = 0, offers = 0, socketClosed = false, closeCalls = null;
try {
  const getWindow = async name => {
    for (let i = 0; i < 100; i++) {
      const page = app.windows().find(p => !p.isClosed() && p.url().includes(`/${name}.html`));
      if (page) { await page.waitForLoadState(); return page; }
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error(`Missing ${name}`);
  };
  // A mocked socket at the real FAL URL exercises the browser CSP and actual
  // signaling client. No socket or token request leaves this test process.
  closeCalls = { socket: 0, peer: 0 };
  await app.context().exposeBinding('testClosedMethod', (_source, kind) => { closeCalls[kind]++; });
  await app.context().routeWebSocket('wss://api3.decart.ai/**', ws => {
    decartSockets++;
    ws.onClose(() => { decartClosed = true; setTimeout(() => ws.close({ code: 1000 }), 750); });
    ws.onMessage(bytes => {
      const message = JSON.parse(String(bytes));
      if (message.type === 'prompt') {
        assert.match(message.prompt, expectedPrompt); directPrompt = message.prompt; assert.equal(message.enhance_prompt, false); decartPrompts++;
        ws.send(JSON.stringify({ type: 'error', error: 'Concurrent session limit reached.' }));
      }
    });
  });
  await app.context().routeWebSocket('wss://fal.run/**', ws => {
    if (useDecart) assert(decartClosed, 'Decart must close before FAL starts');
    connected = true; sockets++;
    ws.onClose(() => {
      socketClosed = true;
      // Reply later than the old 500ms teardown grace. The worker must remain
      // alive long enough to observe the server's side of the close handshake.
      setTimeout(() => ws.close({ code: 1000 }), 750);
    });
    const candidates = []; let receiverReady = false;
    ws.onMessage(async bytes => {
      const message = decode(new Uint8Array(bytes));
      if (process.argv.includes('--busy')) {
        if (message.prompt) {
          prompts++;
          ws.send(Buffer.from(encode({ type: 'ready' })));
          ws.send(Buffer.from(encode({ type: 'iceServers', iceServers: [] })));
          ws.send(Buffer.from(encode({ type: 'error', error: 'Concurrent session limit reached.' })));
          ws.close({ code: 1000 });
        }
        if (message.type === 'offer') offers++;
        return;
      }
      if (message.prompt) {
        prompts++; promptReceived = expectedPrompt.test(message.prompt);
        assert.equal(message.enable_prompt_expansion, false);
        if (useDecart) assert.equal(message.prompt, directPrompt, 'Fallback must keep the requested scene prompt');
        // The provider sends these separately. Repeated readiness must not
        // allocate another peer or submit another offer/session.
        ws.send(Buffer.from(encode({ type: 'ready' })));
        ws.send(Buffer.from(encode({ type: 'iceServers', iceServers: [] })));
        ws.send(Buffer.from(encode({ type: 'ready', iceServers: [] })));
      }
      if (message.type === 'icecandidate') {
        const robot = await getWindow('robot');
        if (receiverReady) await robot.evaluate(c => globalThis.testReceiver.addIceCandidate(c), message.candidate);
        else candidates.push(message.candidate);
      }
      if (message.type === 'offer') {
        offers++;
        const robot = await getWindow('robot');
        const answer = await robot.evaluate(async offer => {
          const peer = globalThis.testReceiver = new RTCPeerConnection({ iceServers: [] });
          const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
          const ctx = c.getContext('2d'); const gradient = ctx.createLinearGradient(0, 0, 1280, 720);
          gradient.addColorStop(0, '#17273f'); gradient.addColorStop(1, '#d0d7df');
          const paint = () => { ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1280, 720); ctx.fillStyle = '#eee'; ctx.fillRect(400 + Math.sin(performance.now() / 250) * 150, 180, 250, 380); };
          paint(); const stream = c.captureStream(30); globalThis.testPaint = setInterval(paint, 33);
          for (const track of stream.getTracks()) peer.addTrack(track, stream);
          peer.ontrack = e => { const video = document.createElement('video'); video.muted = true; video.srcObject = e.streams[0]; video.play(); globalThis.testInput = video; };
          await peer.setRemoteDescription({ type: 'offer', sdp: offer });
          await peer.setLocalDescription(await peer.createAnswer());
          if (peer.iceGatheringState !== 'complete') await new Promise(resolve => peer.onicegatheringstatechange = () => { if (peer.iceGatheringState === 'complete') resolve(); });
          return peer.localDescription.sdp;
        }, message.sdp);
        receiverReady = true;
        for (const c of candidates.splice(0)) await robot.evaluate(c => globalThis.testReceiver.addIceCandidate(c), c);
        ws.send(Buffer.from(encode({ type: 'answer', sdp: answer })));
        movingInputFrames = await robot.evaluate(async () => {
          const c = document.createElement('canvas'); c.width = 160; c.height = 90; const ctx = c.getContext('2d');
          for (let i = 0; i < 60 && globalThis.testInput.readyState < 2; i++) await new Promise(r => setTimeout(r, 20));
          ctx.drawImage(globalThis.testInput, 0, 0, 160, 90); const first = c.toDataURL();
          await new Promise(r => setTimeout(r, 500)); ctx.drawImage(globalThis.testInput, 0, 0, 160, 90);
          return first !== c.toDataURL();
        });
      }
    });
  });
  await app.evaluate(() => { globalThis.fetch = async url => ({ ok: true, json: async () => url.includes('decart.ai') ? { apiKey: 'mock-temporary-decart-token' } : 'mock-temporary-token' }); });
  const operator = await getWindow('operator');
  await operator.waitForFunction(() => document.querySelector('#camera-health').textContent === 'live');
  await operator.evaluate(async ({ useDecart, sceneId }) => {
    await window.installation.saveKey('fake-key');
    if (useDecart) await window.installation.saveKey('fake-decart-key', 'decart');
    await window.installation.configure({ robotEnabled: true, duration: 30, quality: 'high' });
    await window.installation.command('select', sceneId);
  }, { useDecart, sceneId });
  if (process.argv.includes('--busy')) {
    await operator.waitForFunction(() => document.querySelector('#cloud-note').textContent.startsWith('FAL:') && document.querySelector('#cloud-note').textContent.includes('[SESSION_BUSY') && !document.querySelector('#generate-robot').textContent.includes('Closing'), null, { timeout: 5000 });
    const failed = await operator.evaluate(() => window.installation.state());
    assert.equal(failed.cloud.code, 'SESSION_BUSY'); assert(!failed.cloud.ready); assert(!failed.cloud.streaming); assert(!failed.cloud.canGenerate);
    assert.match(failed.cloud.blockReason, /Next scheduled connection/); assert.notEqual(failed.active, sceneId);
    assert.equal(sockets, 1); assert.equal(prompts, 1); assert(offers <= 1); assert.equal(failed.cloud.count, useDecart ? 2 : 1);
    assert.equal(decartSockets, useDecart ? 1 : 0); assert.equal(decartPrompts, useDecart ? 1 : 0);
    console.log(JSON.stringify({ scenario: useDecart ? 'both-providers-busy' : 'wire-provider-busy', decartSockets, decartPrompts, preservedProviderError: true, skipped: true, eligibleNextSlotAfterBackoff: true, sockets, prompts, offers, providerRequests: 0 }));
  } else {
  await operator.waitForFunction(() => document.querySelector('#cloud-health').textContent === 'Live', null, { timeout: 30000 });
  const audience = await getWindow('audience'), robot = await getWindow('robot');
  await new Promise(r => setTimeout(r, 5000));
  const before = await audience.locator('canvas').evaluate(c => c.toDataURL());
  await new Promise(r => setTimeout(r, 800));
  const movingAudienceFrames = before !== await audience.locator('canvas').evaluate(c => c.toDataURL());
  const state = await operator.evaluate(() => window.installation.state());
  assert(connected); assert(promptReceived); assert(movingInputFrames); assert(movingAudienceFrames);
  assert.equal(state.active, sceneId); assert.equal(state.cloud.sceneId, sceneId); assert(state.cloud.ready); assert(state.cloud.streaming); assert(state.cloud.frames > 30); assert.equal(state.cloud.count, useDecart ? 2 : 1);
  assert.equal(state.cloud.provider, 'fal'); assert.equal(decartSockets, useDecart ? 1 : 0); assert.equal(decartPrompts, useDecart ? 1 : 0);
  assert(state.rendering.fps > 20);
  assert.equal(prompts, 1, 'Exactly one initial prompt must be sent');
  assert.equal(sockets, 1, 'Exactly one signaling socket must be opened');
  assert.equal(offers, 1, 'Repeated readiness must not submit overlapping sessions');
  if (sceneId === 'cartoon') await audience.locator('canvas').screenshot({ path: 'test-results/cartoon-portal.png' });
  await robot.evaluate(() => {
    const socketClose = WebSocket.prototype.close, peerClose = RTCPeerConnection.prototype.close;
    WebSocket.prototype.close = function(...args) { globalThis.testClosedMethod('socket'); return socketClose.apply(this, args); };
    RTCPeerConnection.prototype.close = function(...args) { globalThis.testClosedMethod('peer'); return peerClose.apply(this, args); };
  });
  if (process.argv.includes('--stall')) {
    await robot.evaluate(() => clearInterval(globalThis.testPaint));
    await operator.waitForFunction(() => document.querySelector('#cloud-note').textContent.includes('VIDEO_STALLED'), null, { timeout: 6000 });
    const failed = await operator.evaluate(() => window.installation.state());
    assert.notEqual(failed.active, sceneId); assert(!failed.cloud.ready); assert(!failed.cloud.streaming);
    for (let i = 0; i < 55 && !robot.isClosed(); i++) await new Promise(r => setTimeout(r, 100));
    assert(robot.isClosed()); assert(socketClosed);
  } else {
  // Main must deliver the stop command and let renderer cleanup run BEFORE
  // destroying its window. The original destroy-only implementation failed this.
  await operator.evaluate(() => window.installation.command('next'));
  const stopping = await operator.evaluate(() => window.installation.state());
  assert(!stopping.cloud.streaming); assert(!stopping.cloud.ready); assert(!stopping.cloud.canGenerate);
  assert.notEqual(stopping.active, sceneId);
  for (let i = 0; i < 10; i++) {
    if (closeCalls.peer && closeCalls.socket) break;
    await new Promise(r => setTimeout(r, 20));
  }
  assert(closeCalls.peer > 0); assert(closeCalls.socket > 0);
  for (let i = 0; i < 55 && !robot.isClosed(); i++) await new Promise(r => setTimeout(r, 100));
  const stopped = await operator.evaluate(() => window.installation.state());
  assert(robot.isClosed()); assert(socketClosed); assert(!stopped.cloud.closing); assert.equal(stopped.cloud.count, useDecart ? 2 : 1);
  assert(stopped.logs.some(line => line.includes('signaling close handshake completed')));
  }

  console.log(JSON.stringify({ sceneId, decartSockets, decartPrompts, decartClosed, cspAllowsFALAddress: connected, promptReceived, movingInputFrames, movingAudienceFrames, continuousFrames: state.cloud.frames, audienceFps: state.rendering.fps, scenario: process.argv.includes('--stall') ? 'stalled-video' : 'scene-exit', gracefulCloseBeforeDestroy: closeCalls, socketClosed, prompts, sockets, offers, providerRequests: 0 }));
  }
} finally {
  clearTimeout(watchdog); const stop = setTimeout(() => app.process().kill('SIGKILL'), 8000); await app.close(); clearTimeout(stop);
}
