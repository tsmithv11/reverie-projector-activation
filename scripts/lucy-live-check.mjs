// Explicit opt-in only: this uses the configured physical camera and FAL account.
// It respects the application's persisted spending gate and never saves imagery.
import { _electron as electron } from 'playwright';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
if (process.env.REVERIE_LIVE_CHECK !== '1') throw Error('Set REVERIE_LIVE_CHECK=1 only for an authorized paid live-camera check.');
const app = await electron.launch({ executablePath: path.resolve('release/mac-arm64/Reverie Installation.app/Contents/MacOS/Reverie Installation'), args: [] });
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 300000);
let operator, original;
try {
  for (let i = 0; i < 100 && !operator; i++) {
    operator = app.windows().find(p => p.url().includes('operator.html'));
    if (!operator) await new Promise(r => setTimeout(r, 100));
  }
  await operator.waitForLoadState();
  await operator.waitForFunction(() => document.querySelector('#camera-health').textContent === 'live', null, { timeout: 15000 });
  original = (await operator.evaluate(() => window.installation.state())).settings;
  assert(original.robotEnabled, 'Lucy must already be enabled by the operator');
  let status = await operator.evaluate(() => window.installation.state());
  if (!status.cloud.canGenerate && status.cloud.blockReason.startsWith('Next request allowed')) {
    console.log('Waiting for the configured request interval; no provider request has been made.');
    const deadline = Date.now() + 240000;
    while (!status.cloud.canGenerate && !status.cloud.streaming && status.cloud.blockReason.startsWith('Next request allowed') && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1000));
      status = await operator.evaluate(() => window.installation.state());
    }
  }
  assert(status.cloud.canGenerate || status.cloud.streaming, status.cloud.blockReason);
  await operator.evaluate(async () => { await window.installation.configure({ duration: 20 }); await window.installation.command('select', 'robots'); });
  await operator.waitForFunction(() => ['Live'].includes(document.querySelector('#cloud-health').textContent) || document.querySelector('#cloud-note').textContent.includes('Robot scene skipped.'), null, { timeout: 28000 });
  const first = await operator.evaluate(() => window.installation.state());
  assert(first.cloud.ready, first.cloud.message);
  console.log('Live Lucy video connected; checking continuous frame delivery for ten seconds.');
  const audience = app.windows().find(p => p.url().includes('audience.html'));
  await new Promise(r => setTimeout(r, 2000));
  const fingerprint = () => audience.locator('canvas').evaluate(async c => {
    const bytes = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
  });
  const before = await fingerprint();
  await new Promise(r => setTimeout(r, 8000));
  const after = await fingerprint();
  const live = await operator.evaluate(() => window.installation.state());
  assert.equal(live.active, 'robots'); assert(live.cloud.ready); assert(live.cloud.streaming);
  assert(live.cloud.frames > first.cloud.frames + 50, 'Lucy must continuously return decoded frames');
  assert.notEqual(after, before, 'Returned robot video must change on screen');
  assert(live.rendering.robotFrameAge < 2000); assert(live.rendering.fps > 20);
  await operator.evaluate(() => window.installation.command('next'));
  const stopped = await operator.evaluate(() => window.installation.state());
  assert(!stopped.cloud.streaming); assert(!stopped.cloud.ready); assert.notEqual(stopped.active, 'robots');
  await operator.waitForFunction(() => document.querySelector('#log-lines').textContent.includes('signaling close handshake completed'), null, { timeout: 6000 });
  const report = { gracefulCleanup: true, checkedAt: new Date().toISOString(), packagedBuild: true, livePhysicalCamera: true, provider: 'decart/lucy-2-5/realtime', returnedFrames: live.cloud.frames, observedSeconds: 10, changingAudienceVideo: before !== after, audienceFps: live.rendering.fps, frameAgeMs: live.rendering.robotFrameAge, stoppedOnExit: true, paidConnections: 1, imagesSaved: false };
  await writeFile('test-results/lucy-live.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  if (operator && !operator.isClosed()) {
    await operator.evaluate(() => window.installation.command('stop-robot')).catch(() => {});
    if (original) await operator.evaluate(settings => window.installation.configure(settings), original).catch(() => {});
  }
  clearTimeout(watchdog); const stop = setTimeout(() => app.process().kill('SIGKILL'), 5000); await app.close(); clearTimeout(stop);
}
