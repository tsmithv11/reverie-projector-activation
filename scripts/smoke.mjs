import { _electron as electron } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
await mkdir('test-results', { recursive: true });
const app = await electron.launch({ args: ['.', '--demo', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env: { ...process.env, FAL_KEY: '', DECART_API_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/profile-${Date.now()}`) } });
const errors = [];
const watchdog = setTimeout(() => { console.error('Desktop test exceeded its 180-second limit'); app.process().kill('SIGKILL'); }, 180000);
app.on('window', win => { win.on('pageerror', e => errors.push(e.message)); });
try {
  const getWindow = async name => { for (let i = 0; i < 80; i++) { const w = app.windows().filter(p => !p.isClosed() && p.url().includes(`/${name}.html`)).at(-1); if (w) { await w.waitForLoadState('domcontentloaded'); return w; } await new Promise(r => setTimeout(r, 100)); } throw Error(`Missing ${name}`); };
  const operator = await getWindow('operator'), audience = await getWindow('audience'), engine = await getWindow('engine');
  await operator.waitForFunction(() => document.querySelector('#camera-health')?.textContent === 'demo', { timeout: 30000 });
  await operator.evaluate(() => window.installation.configure({ duration: 10, quality: 'high' }));
  await new Promise(r => setTimeout(r, 5000));
  await operator.screenshot({ path: 'test-results/operator.png', fullPage: true });
  const samples = [];
  for (const id of ['heat','robots','monsters','lines','garden','cartoon']) {
    await operator.evaluate(id => window.installation.command('select', id), id);
    await new Promise(r => setTimeout(r, 2500));
    const sample = await operator.evaluate(() => window.installation.state());
    if (['robots', 'cartoon'].includes(id)) { assert.notEqual(sample.active, id); assert.equal(sample.cloud.ready, false); }
    await audience.screenshot({ path: `test-results/scene-${id}.png` }); samples.push(sample);
  }
  await operator.evaluate(() => window.installation.command('pause'));
  const a = await operator.evaluate(() => window.installation.state()); await new Promise(r => setTimeout(r, 1100)); const b = await operator.evaluate(() => window.installation.state()); assert.equal(a.remaining, b.remaining);
  // Kill the camera renderer to exercise the independent watchdog/restart path.
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('engine.html')); w.webContents.forcefullyCrashRenderer(); });
  await new Promise(r => setTimeout(r, 6000));
  const recovered = await operator.evaluate(() => window.installation.state()); assert.equal(recovered.camera.state, 'demo'); assert(recovered.rendering.fps > 20);
  // The Chromium fake webcam exercises getUserMedia, real local inference, and stalled-track recovery.
  await operator.evaluate(() => window.installation.configure({ demo: false }));
  const detectionDeadline = Date.now() + 45000;
  while (Date.now() < detectionDeadline) { const s = await operator.evaluate(() => window.installation.state()); if (s.camera.state === 'live' && s.camera.detector === 'ready' && s.camera.detectorMs > 0) break; await new Promise(r => setTimeout(r, 500)); }
  const live = await operator.evaluate(() => window.installation.state());
  assert.equal(live.camera.state, 'live'); assert.equal(live.camera.detector, 'ready'); assert(live.camera.detectorMs > 0);
  // Playwright marks a crashed Page permanently; use the current webContents after
  // Electron reloads that renderer inside its preserved native window.
  await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('engine.html')); await w.webContents.executeJavaScript('document.querySelector("video").srcObject.getTracks().forEach(t => t.stop())'); });
  await new Promise(r => setTimeout(r, 10000));
  const reconnected = await operator.evaluate(() => window.installation.state()); assert.equal(reconnected.camera.state, 'live');
  // Isolate the test from the internet. A fake key must never cause a real paid call.
  await app.evaluate(() => { globalThis.fetch = () => Promise.reject(new Error('Simulated offline network')); });
  await operator.evaluate(async () => { await window.installation.saveKey('test-key-not-real'); await window.installation.configure({ robotEnabled: true, robotMinutes: 5 }); await window.installation.command('select', 'robots'); await window.installation.command('generate-robot'); });
  await new Promise(r => setTimeout(r, 27000));
  const offline = await operator.evaluate(() => window.installation.state()); assert.equal(offline.cloud.count, 1); assert.equal(offline.cloud.state, 'error'); assert.equal(offline.cloud.code, 'AUTH_NETWORK'); assert.notEqual(offline.active, 'robots'); assert.equal(offline.cloud.ready, false); assert(offline.rendering.fps > 20);
  await operator.evaluate(() => window.installation.command('select', 'garden')); await new Promise(r => setTimeout(r, 2000));
  // Main-process scene scheduling remains alive when the audience renderer exits.
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('audience.html')); w.webContents.forcefullyCrashRenderer(); });
  await new Promise(r => setTimeout(r, 6000));
  const outputRecovery = await operator.evaluate(() => window.installation.state()); assert.equal(outputRecovery.active, 'garden'); assert(outputRecovery.rendering.fps > 20);
  const displayPlacement = await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('audience.html')); return { fullscreen: w.isFullScreen(), bounds: w.getBounds(), displays: screen.getAllDisplays().map(d => ({ label: d.label, bounds: d.bounds })) }; });
  // A native full-screen animation can itself publish screen metrics. A burst
  // of unchanged notifications must not call any native placement methods.
  const displayFeedback = await app.evaluate(async ({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('audience.html'));
    const calls = [], originals = new Map();
    for (const name of ['setFullScreen', 'setBounds', 'showInactive']) {
      originals.set(name, w[name]);
      w[name] = function (...args) { calls.push(name); return originals.get(name).apply(this, args); };
    }
    try {
      for (let i = 0; i < 30; i++) for (const d of screen.getAllDisplays()) {
        screen.emit('display-metrics-changed', {}, d, ['workArea']);
        screen.emit('display-metrics-changed', {}, d, ['bounds', 'scaleFactor', 'rotation']);
      }
      await new Promise(r => setTimeout(r, 750));
      return calls;
    } finally { for (const [name, original] of originals) w[name] = original; }
  });
  assert.deepEqual(displayFeedback, [], 'unchanged screen metrics must not cycle full screen');
  // Simulate removal in display enumeration, then restore the real monitor list.
  const missingDisplay = await app.evaluate(async ({ BrowserWindow, screen }) => {
    const original = screen.getAllDisplays; screen.getAllDisplays = () => [screen.getPrimaryDisplay()]; screen.emit('display-removed', {}, {});
    await new Promise(r => setTimeout(r, 1000)); const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('audience.html')); const result = { fullscreen: w.isFullScreen(), visible: w.isVisible() };
    screen.getAllDisplays = original; screen.emit('display-added', {}, {}); return result;
  });
  assert.equal(missingDisplay.fullscreen, false); assert.equal(missingDisplay.visible, true);
  const security = await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('audience.html')); return w.webContents.executeJavaScript('({canSaveKey:typeof window.installation.saveKey,canReadJob:typeof window.installation.job,node:typeof window.require})'); }); assert.deepEqual(security, { canSaveKey: 'undefined', canReadJob: 'undefined', node: 'undefined' });
  await writeFile('test-results/smoke.json', JSON.stringify({ samples, recovered, live, reconnected, offline, outputRecovery, displayPlacement, displayFeedback, missingDisplay, security, errors }, null, 2));
  assert.deepEqual(errors, []); console.log(JSON.stringify({ scenes: samples.map(s => ({ id: s.active, fps: s.rendering.fps, quality: s.rendering.quality, detector: s.camera.detector })), cameraRecovery: recovered.camera.state, detector: live.camera, reconnected: reconnected.camera.state, offline: offline.cloud, security, errors }, null, 2));
} finally { clearTimeout(watchdog); const stop = setTimeout(() => app.process().kill('SIGKILL'), 8000); await app.close(); clearTimeout(stop); }
