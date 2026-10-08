import { _electron as electron } from 'playwright';
import { decode, encode } from '@msgpack/msgpack';
import path from 'node:path';
import assert from 'node:assert/strict';
const app = await electron.launch({ args: ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env: { ...process.env, FAL_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/transport-profile-${Date.now()}`) } });
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 60000);
let connected = false, promptReceived = false, movingInputFrames = false, prompts = 0, socketClosed = false, closeCalls = null;
try {
  const getWindow = async name => {
    for (let i = 0; i < 100; i++) {
      const page = app.windows().find(p => !p.isClosed() && p.url().includes(`/${name}.html`));
      if (page) { await page.waitForLoadState(); return page; }
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error(`Missing ${name}`);
  };
  // A mocked socket at the real SDK URL exercises the browser CSP and actual
  // signaling client. No socket or token request leaves this test process.
  await app.context().routeWebSocket('wss://fal.run/**', ws => {
    connected = true;
    ws.onClose(() => { socketClosed = true; });
    const candidates = []; let receiverReady = false;
    ws.onMessage(async bytes => {
      const message = decode(new Uint8Array(bytes));
      if (message.prompt) { prompts++; promptReceived = /robot/.test(message.prompt); ws.send(Buffer.from(encode({ type: 'ready', iceServers: [] }))); }
      if (message.type === 'icecandidate') {
        const robot = await getWindow('robot');
        if (receiverReady) await robot.evaluate(c => globalThis.testReceiver.addIceCandidate(c), message.candidate);
        else candidates.push(message.candidate);
      }
      if (message.type === 'offer') {
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
  await app.evaluate(() => { globalThis.fetch = async () => ({ ok: true, json: async () => 'mock-temporary-token' }); });
  const operator = await getWindow('operator');
  await operator.waitForFunction(() => document.querySelector('#camera-health').textContent === 'live');
  await operator.evaluate(async () => {
    await window.installation.saveKey('fake-key');
    await window.installation.configure({ robotEnabled: true, robotSessionCap: 1, duration: 30, quality: 'high' });
    await window.installation.command('generate-robot');
  });
  await operator.waitForFunction(() => document.querySelector('#cloud-health').textContent === 'Live', { timeout: 30000 });
  const audience = await getWindow('audience'), robot = await getWindow('robot');
  await new Promise(r => setTimeout(r, 5000));
  const before = await audience.locator('canvas').evaluate(c => c.toDataURL());
  await new Promise(r => setTimeout(r, 800));
  const movingAudienceFrames = before !== await audience.locator('canvas').evaluate(c => c.toDataURL());
  const state = await operator.evaluate(() => window.installation.state());
  assert(connected); assert(promptReceived); assert(movingInputFrames); assert(movingAudienceFrames);
  assert.equal(state.active, 'robots'); assert(state.cloud.ready); assert(state.cloud.streaming); assert(state.cloud.frames > 30); assert.equal(state.cloud.count, 1);
  assert(state.rendering.fps > 20);
  assert.equal(prompts, 1, 'Exactly one initial prompt must be sent');
  await robot.evaluate(() => {
    globalThis.testCloseCalls = { socket: 0, peer: 0 };
    const socketClose = WebSocket.prototype.close, peerClose = RTCPeerConnection.prototype.close;
    WebSocket.prototype.close = function(...args) { globalThis.testCloseCalls.socket++; return socketClose.apply(this, args); };
    RTCPeerConnection.prototype.close = function(...args) { globalThis.testCloseCalls.peer++; return peerClose.apply(this, args); };
  });
  if (process.argv.includes('--stall')) {
    await robot.evaluate(() => clearInterval(globalThis.testPaint));
    await operator.waitForFunction(() => document.querySelector('#cloud-note').textContent.includes('VIDEO_STALLED'), null, { timeout: 6000 });
    const failed = await operator.evaluate(() => window.installation.state());
    assert.notEqual(failed.active, 'robots'); assert(!failed.cloud.ready); assert(!failed.cloud.streaming);
    for (let i = 0; i < 30 && !robot.isClosed(); i++) await new Promise(r => setTimeout(r, 100));
    assert(robot.isClosed()); assert(socketClosed);
  } else {
  // Main must deliver the stop command and let renderer cleanup run BEFORE
  // destroying its window. The original destroy-only implementation failed this.
  await operator.evaluate(() => window.installation.command('next'));
  const stopping = await operator.evaluate(() => window.installation.state());
  assert(stopping.cloud.closing); assert(!stopping.cloud.streaming); assert(!stopping.cloud.ready); assert(!stopping.cloud.canGenerate);
  assert.notEqual(stopping.active, 'robots');
  for (let i = 0; i < 10; i++) {
    closeCalls = await robot.evaluate(() => globalThis.testCloseCalls);
    if (closeCalls.peer && closeCalls.socket) break;
    await new Promise(r => setTimeout(r, 20));
  }
  assert(closeCalls.peer > 0); assert(closeCalls.socket > 0);
  for (let i = 0; i < 30 && !robot.isClosed(); i++) await new Promise(r => setTimeout(r, 100));
  const stopped = await operator.evaluate(() => window.installation.state());
  assert(robot.isClosed()); assert(socketClosed); assert(!stopped.cloud.closing); assert.equal(stopped.cloud.count, 1);
  assert(stopped.logs.some(line => line.includes('Local peer and signaling close requested')));
  }

  console.log(JSON.stringify({ cspAllowsSDKAddress: connected, promptReceived, movingInputFrames, movingAudienceFrames, continuousFrames: state.cloud.frames, audienceFps: state.rendering.fps, scenario: process.argv.includes('--stall') ? 'stalled-video' : 'scene-exit', gracefulCloseBeforeDestroy: closeCalls, socketClosed, prompts, providerRequests: 0 }));
} finally {
  clearTimeout(watchdog); const stop = setTimeout(() => app.process().kill('SIGKILL'), 8000); await app.close(); clearTimeout(stop);
}
