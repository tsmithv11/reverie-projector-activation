// Explicit paid opt-in. Observe repeated sessions without saving video, tokens,
// socket URLs, SDP or ICE addresses. Stop immediately on a provider rejection.
import { _electron as electron } from 'playwright';
import { decode } from '@msgpack/msgpack';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
if (process.env.REVERIE_LIVE_CHECK !== '1') throw Error('REVERIE_LIVE_CHECK=1 is required for this paid live-camera check.');
const repeat = process.argv.includes('--repeat');
const trace = [], results = [];
const app = await electron.launch({ executablePath: path.resolve('release/mac-arm64/Reverie Installation.app/Contents/MacOS/Reverie Installation'), args: [] });
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), repeat ? 1900000 : 1000000);
let operator, original, wasPaused;
const start = Date.now();
await app.context().exposeBinding('recordLucyWire', (_source, event, data) => {
  const entry = { ms: Date.now() - start, event };
  if (event === 'sent' || event === 'received') {
    try {
      const message = typeof data === 'string' ? JSON.parse(data) : decode(new Uint8Array(data));
      const type = message.prompt ? 'prompt' : message.type;
      entry.type = ['prompt', 'ready', 'iceServers', 'answer', 'offer', 'icecandidate', 'error', 'x-fal-message', 'x-fal-error'].includes(type) ? type : 'other';
      if (/concurrent session limit reached/i.test(String(message.error || message.message || ''))) entry.failure = 'SESSION_BUSY';
      // FAL request IDs are useful for support; never retain arbitrary fields.
      for (const field of ['request_id', 'requestId']) {
        if (typeof message[field] === 'string' && /^[0-9a-f-]{36}$/i.test(message[field])) entry.requestId = message[field];
      }
    } catch { entry.type = 'undecodable'; }
  } else if (event === 'closed') { entry.code = data.code; entry.clean = data.clean; }
  else if (event === 'close-requested') entry.code = data ?? null;
  else if (event === 'peer-state') entry.state = ['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed'].includes(data) ? data : 'other';
  trace.push(entry);
});
await app.context().addInitScript(() => {
  const record = (event, data) => globalThis.recordLucyWire(event, data).catch(() => {});
  const NativeSocket = globalThis.WebSocket;
  globalThis.WebSocket = class extends NativeSocket {
    constructor(...args) {
      super(...args); record('created');
      this.addEventListener('open', () => record('opened'));
      this.addEventListener('close', e => record('closed', { code: e.code, clean: e.wasClean }));
      this.addEventListener('message', async e => record('received', typeof e.data === 'string' ? e.data : Array.from(new Uint8Array(e.data instanceof Blob ? await e.data.arrayBuffer() : e.data))));
    }
    send(data) { record('sent', typeof data === 'string' ? data : Array.from(new Uint8Array(data))); return super.send(data); }
    close(code, reason) { record('close-requested', code); return super.close(code, reason); }
  };
  const NativePeer = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = class extends NativePeer {
    constructor(...args) { super(...args); record('peer-created'); this.addEventListener('connectionstatechange', () => record('peer-state', this.connectionState)); }
    close() { record('peer-close-requested'); return super.close(); }
  };
});
const status = () => operator.evaluate(() => window.installation.state());
const delay = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 100 && !operator; i++) { operator = app.windows().find(p => p.url().includes('operator.html')); if (!operator) await delay(100); }
  await operator.waitForFunction(() => document.querySelector('#camera-health').textContent === 'live', null, { timeout: 15000 });
  const initial = await status(); original = initial.settings; wasPaused = initial.paused;
  console.log('Enable Lucy in the operator console within 60 seconds to authorize this paid check.');
  await operator.waitForFunction(async () => (await window.installation.state()).settings.robotEnabled, null, { timeout: 60000 });
  if (!wasPaused) await operator.evaluate(() => window.installation.command('pause'));
  await operator.evaluate(() => window.installation.configure({ duration: 20 }));
  for (let round = 0; round < (repeat ? 2 : 1); round++) {
    const deadline = Date.now() + 900000; let s = await status(), reported = 0;
    while (!s.cloud.canGenerate && !s.cloud.canRetry && Date.now() < deadline) {
      assert(/Next scheduled connection is eligible/.test(s.cloud.blockReason), s.cloud.blockReason);
      if (Date.now() - reported > 45000) { console.log(s.cloud.blockReason); reported = Date.now(); }
      await delay(1000); s = await status();
    }
    assert(s.cloud.canGenerate || (s.cloud.canRetry && process.argv.includes('--retry')), s.cloud.blockReason);
    const traceStart = trace.length;
    console.log(`Starting live session ${round + 1}.`);
    await operator.evaluate(() => window.installation.command('select', 'robots'));
    const readyDeadline = Date.now() + 28000;
    let first = await status();
    while (!first.cloud.ready && first.cloud.state !== 'error' && Date.now() < readyDeadline) { await delay(100); first = await status(); }
    if (!first.cloud.ready) {
      for (let i = 0; i < 50 && (await status()).cloud.closing; i++) await delay(100);
      results.push({ round: round + 1, live: false, code: first.cloud.code, phase: first.cloud.phase, trace: trace.slice(traceStart) });
      throw Error(first.cloud.message);
    }
    await delay(10000);
    const live = await status();
    assert(live.cloud.ready && live.active === 'robots');
    assert(live.cloud.frames > first.cloud.frames + 50);
    await operator.evaluate(() => window.installation.command('next'));
    for (let i = 0; i < 50 && (await status()).cloud.closing; i++) await delay(100);
    results.push({ round: round + 1, live: true, frames: live.cloud.frames, fps: live.rendering.fps, trace: trace.slice(traceStart) });
    console.log(JSON.stringify(results.at(-1)));
  }
} finally {
  if (operator && !operator.isClosed()) {
    await operator.evaluate(() => window.installation.command('stop-robot')).catch(() => {});
    if (original) await operator.evaluate(s => window.installation.configure(s), original).catch(() => {});
    if (wasPaused === false) await operator.evaluate(() => window.installation.command('pause')).catch(() => {});
  }
  await mkdir('test-results', { recursive: true });
  const report = { at: new Date().toISOString(), results, trace, imagesSaved: false };
  await writeFile('test-results/lucy-sessions.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  clearTimeout(watchdog); const stop = setTimeout(() => app.process().kill('SIGKILL'), 5000); await app.close(); clearTimeout(stop);
}
