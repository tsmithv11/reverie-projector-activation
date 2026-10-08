import { _electron as electron } from 'playwright';
import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('test-results', { recursive: true });
await writeFile('dist/wonderful-check.html', '<!doctype html><html><head><style>body{margin:0;background:#000}canvas{width:100vw;height:100vh;display:block}</style></head><body><canvas></canvas><script type="module" src="wonderful-check.js"></script></body></html>');
await build({ stdin: { contents: `
  import Monsters from './app/scenes/monsters.js';
  window.fixtureScene = new Monsters(); fixtureScene.initialize(); fixtureScene.activate();
  const canvas = document.querySelector('canvas'); canvas.width = 1920; canvas.height = 1080;
  window.fixtureRender = () => fixtureScene.render(canvas.getContext('2d'), { w: canvas.width, h: canvas.height });
  window.fixtureStep = (seconds, moving = false) => {
    const analysis = { motion: { points: moving ? [{ x: .4, y: .4, strength: .5 }] : [] } };
    for (let i = 0; i < Math.round(seconds * 60); i++) fixtureScene.update({ dt: 1/60, intensity: .7, quality: 2, analysis });
    fixtureRender();
  };
`, resolveDir: process.cwd() }, bundle: true, format: 'esm', outfile: 'dist/wonderful-check.js' });
const removeFixture = () => Promise.all(['dist/wonderful-check.html', 'dist/wonderful-check.js'].map(file => rm(file, { force: true })));
const app = await electron.launch({ args: ['.', '--demo'], env: { ...process.env, FAL_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/wonderful-profile-${Date.now()}`) } }).catch(async error => { await removeFixture(); throw error; });
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
    await window.installation.command('select', 'monsters');
    await window.installation.command('pause');
  });
  await wait(7000);
  const high = await operator.evaluate(() => window.installation.state());
  assert.equal(high.active, 'monsters'); assert.equal(high.rendering.failure, ''); assert(high.rendering.fps > 25);
  await audience.locator('canvas').screenshot({ path: 'test-results/wonderful-portal.png' });
  await operator.evaluate(() => window.installation.configure({ quality: 'low' }));
  await wait(2500);
  const low = await operator.evaluate(() => window.installation.state());
  assert.equal(low.rendering.quality, 0); assert.equal(low.rendering.failure, '');
  await audience.screenshot({ path: 'test-results/wonderful-portal-low.png' });
  await operator.evaluate(() => window.installation.configure({ quality: 'high' }));
  // Stop input packets until the audience considers the camera stale, keeping
  // the renderer and existing artwork alive to verify its independent idle state.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('frame');
    ipcMain.handle('frame', () => null);
  });
  await wait(10000);
  const cameraLost = await operator.evaluate(() => window.installation.state());
  assert(cameraLost.rendering.frameAge > 2000); assert.equal(cameraLost.rendering.particles, 0);
  assert.equal(cameraLost.rendering.failure, ''); assert(cameraLost.rendering.fps > 25);
  await audience.screenshot({ path: 'test-results/wonderful-portal-idle.png' });

  const fixturePromise = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow }) => {
    const fixture = new BrowserWindow({ width: 1920, height: 1080, show: false, webPreferences: { backgroundThrottling: false } });
    fixture.loadURL('reverie://app/wonderful-check.html');
  });
  const fixture = await fixturePromise;
  await fixture.waitForFunction(() => window.fixtureScene?.background?.naturalWidth && window.fixtureScene?.jumper?.naturalWidth);
  const assets = await fixture.evaluate(() => ({
    background: [fixtureScene.background.naturalWidth, fixtureScene.background.naturalHeight],
    sprite: [fixtureScene.jumper.naturalWidth, fixtureScene.jumper.naturalHeight],
    gpu: !!fixtureScene.artwork?.gl
  }));
  assert(assets.gpu, 'the living artwork shader must initialize');
  assert(assets.background[0] > 1038);
  await fixture.evaluate(() => fixtureStep(3));
  await fixture.screenshot({ path: 'test-results/wonderful-idle.png' });
  await fixture.evaluate(() => { fixtureStep(.18, true); fixtureStep(.6); });
  await fixture.screenshot({ path: 'test-results/wonderful-jump.png' });
  const jumping = await fixture.evaluate(() => ({ pose: fixtureScene.jumperPose(), bubbles: fixtureScene.bubbles.length }));
  assert(jumping.pose.lift > .95); assert(jumping.bubbles > 0);
  await fixture.evaluate(() => fixtureStep(9));
  assert.equal(await fixture.evaluate(() => fixtureScene.bubbles.length), 0);
  assert.equal(await fixture.evaluate(() => fixtureScene.jump), null);
  await fixture.screenshot({ path: 'test-results/wonderful-settled.png' });
  // GPU loss must leave the detailed art, sprite and interaction usable.
  await fixture.evaluate(() => { fixtureScene.artwork.cleanup(); fixtureRender(); });
  await fixture.screenshot({ path: 'test-results/wonderful-gpu-fallback.png' });
  await fixture.evaluate(() => fixtureScene.cleanup());
  assert.deepEqual(errors, []);
  const result = { assets, high: high.rendering, low: low.rendering, cameraLost: cameraLost.rendering, jumping, errors };
  await writeFile('test-results/wonderful-check.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  clearTimeout(watchdog);
  try { await app.close(); } finally { await removeFixture(); }
}
