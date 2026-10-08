import { _electron as electron } from 'playwright';
import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('test-results', { recursive: true });
await writeFile('dist/garden-check.html', '<!doctype html><html><head><style>body{margin:0;background:#090d17}canvas{width:100vw;height:100vh;display:block}</style></head><body><canvas></canvas><script type="module" src="garden-check.js"></script></body></html>');
await build({ stdin: { contents: `
  import Garden from './app/scenes/garden.js';
  window.fixtureScene = new Garden(); fixtureScene.initialize(); fixtureScene.activate();
  const canvas = document.querySelector('canvas'); canvas.width = 1920; canvas.height = 1080;
  window.fixtureRender = () => fixtureScene.render(canvas.getContext('2d'), { w: canvas.width, h: canvas.height, quality: 2 });
  window.fixtureStep = (seconds, mode = 'empty') => {
    const points = Array.from({length: 24}, (_, i) => ({x: .08 + i % 8 * .12, y: .1 + Math.floor(i / 8) * .21, strength: .7}));
    const calm = Array.from({length: 12}, (_, i) => ({x: .15 + i % 6 * .14, y: .3 + Math.floor(i / 6) * .3, strength: .8}));
    const analysis = { motion: { points: mode === 'moving' ? points : [], calm: mode === 'still' ? calm : [] } };
    for (let i = 0; i < Math.round(seconds * 30); i++) fixtureScene.update({ dt: 1/30, intensity: .8, quality: 2, analysis });
    fixtureRender();
  };
`, resolveDir: process.cwd() }, bundle: true, format: 'esm', outfile: 'dist/garden-check.js' });
const removeFixture = () => Promise.all(['dist/garden-check.html', 'dist/garden-check.js'].map(file => rm(file, { force: true })));
const app = await electron.launch({ args: ['.', '--demo'], env: { ...process.env, FAL_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/garden-profile-${Date.now()}`) } }).catch(async error => { await removeFixture(); throw error; });
const errors = [];
app.on('window', win => win.on('pageerror', error => errors.push(error.message)));
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 120000);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let operator, audience;
  for (let i = 0; i < 100; i++) {
    operator = app.windows().find(w => w.url().endsWith('/operator.html'));
    audience = app.windows().find(w => w.url().endsWith('/audience.html'));
    if (operator && audience) break;
    await wait(100);
  }
  assert(operator && audience);
  await operator.waitForLoadState('domcontentloaded');
  await operator.evaluate(async () => {
    await window.installation.configure({ quality: 'high', duration: 60, robotEnabled: false });
    await window.installation.command('select', 'heat');
    await window.installation.command('pause');
  });
  // Exercise the real IPC route before substituting deterministic movement.
  await audience.waitForFunction(async () => (await window.installation.frame(-1))?.pixels?.byteLength > 0);
  const packets = await audience.evaluate(async () => {
    const full = await window.installation.frame(-1);
    const compact = await window.installation.frame(-1, true);
    const restored = await window.installation.frame(-1);
    return { fullBytes: full.pixels.byteLength, compactBytes: JSON.stringify(compact).length,
      compactHasImage: !!(compact.pixels || compact.preview || compact.motion.edges || compact.motion.energy),
      hasMotion: Array.isArray(compact.motion.points) && Array.isArray(compact.motion.calm), restoredBytes: restored.pixels.byteLength };
  });
  assert(packets.fullBytes > 0); assert(packets.compactBytes < packets.fullBytes / 10);
  assert.equal(packets.compactHasImage, false); assert(packets.hasMotion); assert(packets.restoredBytes > 0);
  // Synthetic vivid green camera packets make accidental image compositing visible.
  await app.evaluate(({ ipcMain }) => {
    globalThis.gardenInput = 'empty'; let seq = 100000;
    const pixels = new Uint8ClampedArray(64 * 36 * 4);
    for (let i = 0; i < pixels.length; i += 4) { pixels[i + 1] = 255; pixels[i + 3] = 255; }
    ipcMain.removeHandler('frame');
    ipcMain.handle('frame', (_, lastSeq, analysisOnly) => globalThis.gardenInput === 'lost' ? null : ({
      seq: seq++, width: 64, height: 36, pixels: pixels.buffer, at: Date.now(), demo: true, boxes: [],
      motion: { amount: 0, points: globalThis.gardenInput === 'moving' ? Array.from({length:24}, (_,i)=>({x:.08+i%8*.12,y:.15+Math.floor(i/8)*.23,strength:.7})) : [],
        calm: globalThis.gardenInput === 'still' ? Array.from({length:12},(_,i)=>({x:.15+i%6*.14,y:.4,strength:.8})) : [] },
      ...(analysisOnly ? { pixels: undefined } : {})
    }));
  });
  await wait(2000);
  await audience.evaluate(() => {
    window.gardenCameraDraws = 0; window.gardenCameraUploads = 0; window.inGarden = false;
    window.installation.onState(s => { window.inGarden = s.active === 'garden'; });
    const put = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function(...args) {
      if (window.inGarden) window.gardenCameraUploads++;
      return put.apply(this, args);
    };
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function(x, y, w, h) {
      if (x === 0 && y === 0 && w === this.canvas.width && h === this.canvas.height && this.globalAlpha === 1) this.canvas.containsCamera = false;
      return fill.call(this, x, y, w, h);
    };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
      const isCamera = source?.containsCamera || (source?.width === 64 && source?.height === 36);
      if (isCamera) {
        this.canvas.containsCamera = true;
        if (window.inGarden) window.gardenCameraDraws++;
      }
      return draw.call(this, source, ...args);
    };
  });
  // Track source provenance without GPU readback, which forces software rendering.
  await wait(100);
  await operator.evaluate(() => window.installation.command('select', 'garden'));
  await wait(4000);
  assert.equal(await audience.evaluate(() => window.gardenCameraDraws), 0);
  await audience.screenshot({ path: 'test-results/garden-audience-idle.png' });
  await app.evaluate(() => { globalThis.gardenInput = 'moving'; });
  await wait(26000);
  const high = await operator.evaluate(() => window.installation.state());
  console.log('High quality:', JSON.stringify(high.rendering));
  assert.equal(high.active, 'garden'); assert.equal(high.rendering.failure, ''); assert(high.rendering.fps > 25); assert(high.rendering.particles >= 100);
  assert.deepEqual([high.rendering.sceneWidth, high.rendering.sceneHeight], [960, 540]);
  assert.deepEqual(await audience.evaluate(() => { const c = document.querySelector('canvas'); return [c.width, c.height]; }), [1920, 1080]);
  assert.equal(await audience.evaluate(() => window.gardenCameraUploads), 0);
  await audience.screenshot({ path: 'test-results/garden-audience-growth.png' });
  await app.evaluate(() => { globalThis.gardenInput = 'still'; });
  await wait(5000);
  await audience.screenshot({ path: 'test-results/garden-audience-butterflies.png' });
  await operator.evaluate(() => window.installation.configure({ quality: 'low' }));
  await wait(2500);
  const low = await operator.evaluate(() => window.installation.state());
  assert.equal(low.rendering.quality, 0); assert.equal(low.rendering.failure, ''); assert(low.rendering.particles <= 48);
  assert.deepEqual([low.rendering.sceneWidth, low.rendering.sceneHeight], [640, 360]);
  await operator.evaluate(() => window.installation.configure({ quality: 'high' }));
  await app.evaluate(() => { globalThis.gardenInput = 'lost'; });
  await wait(3000);
  const cameraLost = await operator.evaluate(() => window.installation.state());
  assert(cameraLost.rendering.frameAge > 2000); assert.equal(cameraLost.rendering.failure, ''); assert(cameraLost.rendering.fps > 25);
  assert.equal(await audience.evaluate(() => window.gardenCameraDraws), 0);

  // Leaving the garden restores full-resolution camera rendering and image uploads.
  await app.evaluate(() => { globalThis.gardenInput = 'moving'; });
  await operator.evaluate(() => window.installation.command('select', 'heat'));
  await wait(2500);
  const otherScene = await operator.evaluate(() => window.installation.state());
  assert.equal(otherScene.active, 'heat'); assert.equal(otherScene.rendering.failure, '');
  assert.deepEqual([otherScene.rendering.sceneWidth, otherScene.rendering.sceneHeight], [1920, 1080]);
  assert(await audience.evaluate(async () => !!(await window.installation.frame(-1)).pixels));
  await operator.evaluate(() => window.installation.command('select', 'garden'));
  await wait(3500);
  assert.equal(await audience.evaluate(() => window.gardenCameraUploads), 0);

  // A quarantined scene must also stay camera-free while live packets arrive.
  await app.evaluate(() => { globalThis.gardenInput = 'moving'; });
  await audience.evaluate(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
      if (source instanceof HTMLImageElement && source.src.includes('botanical-atlas')) throw Error('Synthetic garden render failure');
      return draw.call(this, source, ...args);
    };
  });
  await wait(2500);
  const sceneFailure = await operator.evaluate(() => window.installation.state());
  assert.match(sceneFailure.rendering.failure, /garden failed/);
  assert.equal(await audience.evaluate(() => window.gardenCameraDraws), 0, 'scene failure must never expose camera imagery');

  const fixturePromise = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow }) => {
    const fixture = new BrowserWindow({ width: 1920, height: 1080, show: false, webPreferences: { backgroundThrottling: false } });
    fixture.loadURL('reverie://app/garden-check.html');
  });
  const fixture = await fixturePromise;
  await fixture.waitForFunction(() => window.fixtureScene?.atlas?.naturalWidth);
  const assets = await fixture.evaluate(() => ({ atlas: [fixtureScene.atlas.naturalWidth, fixtureScene.atlas.naturalHeight] }));
  assert.deepEqual(assets.atlas, [1536,1024]);
  await fixture.evaluate(() => fixtureStep(3));
  await fixture.screenshot({ path: 'test-results/garden-idle.png' });
  await fixture.evaluate(() => fixtureStep(16, 'moving'));
  await fixture.screenshot({ path: 'test-results/garden-bloom.png' });
  await fixture.evaluate(() => fixtureStep(6, 'still'));
  await fixture.screenshot({ path: 'test-results/garden-butterflies.png' });
  assert(await fixture.evaluate(() => fixtureScene.butterflies.every(b => b.alpha > .9)));
  // Two different solid camera frames must produce pixel-identical scene output.
  assert(await fixture.evaluate(() => {
    const c = document.querySelector('canvas'), ctx = c.getContext('2d'), frame = document.createElement('canvas'); frame.width = 64; frame.height = 36;
    const fc = frame.getContext('2d'); fc.fillStyle = '#00ff00'; fc.fillRect(0,0,64,36);
    fixtureScene.render(ctx, {w:1920,h:1080,quality:2,frame}); const before = c.toDataURL();
    fc.fillStyle = '#ff0000'; fc.fillRect(0,0,64,36);
    fixtureScene.render(ctx, {w:1920,h:1080,quality:2,frame}); return before === c.toDataURL();
  }), 'garden output must be independent of the actual camera image');
  await fixture.evaluate(() => { fixtureScene.atlas.removeAttribute('src'); fixtureRender(); });
  await fixture.screenshot({ path: 'test-results/garden-art-fallback.png' });
  await fixture.evaluate(() => fixtureStep(60));
  assert.equal(await fixture.evaluate(() => fixtureScene.plants.length), 0);
  assert(await fixture.evaluate(() => fixtureScene.butterflies.every(b => b.alpha < .001)));
  await fixture.screenshot({ path: 'test-results/garden-settled.png' });
  await fixture.evaluate(() => fixtureScene.cleanup());
  assert.deepEqual(errors, []);
  const result = { assets, packets, high: high.rendering, low: low.rendering, cameraLost: cameraLost.rendering, otherScene: otherScene.rendering, sceneFailure: sceneFailure.rendering, cameraDraws: await audience.evaluate(() => window.gardenCameraDraws), cameraUploads: await audience.evaluate(() => window.gardenCameraUploads), errors };
  await writeFile('test-results/garden-check.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  clearTimeout(watchdog);
  try { await app.close(); } finally { await removeFixture(); }
}
