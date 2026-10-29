import { _electron as electron } from 'playwright';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Exercise the production audience bundle with deterministic, synthetic input.
// No webcam, credentials, provider connection, or saved operator settings.
await mkdir('test-results', { recursive: true });
const html = 'dist/composition-check.html', bootstrap = 'dist/composition-check.js';
const main = path.resolve('test-results/composition-main.cjs');
await writeFile(html, (await readFile('dist/audience.html', 'utf8')).replace('src="audience.js"', 'src="composition-check.js"'));
await writeFile(bootstrap, `
  let now = performance.now() + 2000, callback, receiver, seq = 0;
  const state = { active: 'heat', activation: 0, settings: { displayFormat: '4:3', quality: 'high', intensity: .7 },
    cloud: { sessionId: 'synthetic', ready: true, sceneId: 'heat' }, scenes: [] };
  const source = document.createElement('canvas'); source.width = 320; source.height = 180;
  const ctx = source.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 320, 180);
  gradient.addColorStop(0, '#87a7c2'); gradient.addColorStop(1, '#29384c');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 320, 180);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = ['#e8d5ce', '#b2d4cb', '#c4b3d7'][i % 3];
    ctx.beginPath(); ctx.arc(48 + i * 55, 64, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(36 + i * 55, 79, 24, 69);
  }
  const pixels = ctx.getImageData(0, 0, 320, 180).data.buffer;
  const motion = { points: [], calm: [], amount: 0 };
  window.requestAnimationFrame = fn => { callback = fn; };
  window.installation = {
    state: async () => structuredClone(state), onState: fn => { receiver = fn; },
    frame: async (_, analysisOnly) => ({ width: 320, height: 180, pixels: analysisOnly ? undefined : pixels, seq: ++seq, at: Date.now(), demo: true, boxes: [], motion }),
    robotFrame: async () => ({ width: 320, height: 180, pixels, seq: ++seq, at: Date.now(), sessionId: 'synthetic' }),
    robotDecoded: async () => {}, report: value => { window.renderStatus = value; }, command: async () => {}
  };
  window.fixture = {
    step: async ms => { now += ms; callback(now); await new Promise(resolve => setTimeout(resolve, 20)); },
    select: id => { state.active = id; state.activation++; state.cloud.sceneId = id; receiver(structuredClone(state)); },
    format: value => { state.settings.displayFormat = value; receiver(structuredClone(state)); },
    gradient: () => {
      const canvas = document.querySelector('canvas'), c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      const context = c.getContext('2d'), g = context.createLinearGradient(0, 0, c.width, c.height);
      g.addColorStop(0, '#f5acd3'); g.addColorStop(.5, '#bea8df'); g.addColorStop(1, '#7297e5');
      context.fillStyle = g; context.fillRect(0, 0, c.width, c.height);
      return context.getImageData(0, 0, c.width, c.height).data;
    },
    pixels: () => { const c = document.querySelector('canvas'); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; },
    error: (actual, expected) => { let max = 0; for (let i = 0; i < actual.length; i++) max = Math.max(max, Math.abs(actual[i] - expected[i])); return max; }
  };
  await import('./audience.js');
  window.fixtureReady = true;
`);
await writeFile(main, `
  const { app, BrowserWindow } = require('electron');
  app.whenReady().then(() => {
    const win = new BrowserWindow({ width: 960, height: 720, show: false, webPreferences: { backgroundThrottling: false } });
    win.loadFile(${JSON.stringify(path.resolve(html))});
  });
`);
let app;
const errors = [], samples = [];
try {
  app = await electron.launch({ args: [main] });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.fixtureReady);
  await page.setViewportSize({ width: 960, height: 720 });
  await page.evaluate(() => fixture.step(0));
  assert.equal(await page.evaluate(() => fixture.error(fixture.pixels(), fixture.gradient())), 0, 'startup must begin with the gradient');
  await page.evaluate(() => fixture.step(1500));
  // Let artwork decode before sampling its incoming half of the transition.
  for (const format of ['4:3', '16:9']) {
    await page.setViewportSize({ width: format === '4:3' ? 960 : 1280, height: 720 });
    await page.evaluate(format => fixture.format(format), format);
    await page.evaluate(() => fixture.step(100));
    for (const id of ['heat', 'robots', 'monsters', 'lines', 'garden', 'cartoon', 'words']) {
      await page.evaluate(id => fixture.select(id), id);
      await page.evaluate(() => fixture.step(100));
      await page.evaluate(() => { window.outgoing = fixture.pixels(); });
      await page.evaluate(() => fixture.step(350));
      const outgoingError = await page.evaluate(() => {
        const gradient = fixture.gradient(), expected = outgoing.map((value, i) => Math.round((value + gradient[i]) / 2));
        return fixture.error(fixture.pixels(), expected);
      });
      assert(outgoingError <= 1, `${id}: fade-out must contain only the outgoing scene and gradient`);
      await page.evaluate(() => fixture.step(350));
      const midpointError = await page.evaluate(() => fixture.error(fixture.pixels(), fixture.gradient()));
      assert.equal(midpointError, 0, `${id}: midpoint must be entirely pink to blue`);
      if (format === '4:3' && id === 'garden') await page.screenshot({ path: 'test-results/composition-transition-midpoint.png' });
      await page.evaluate(() => fixture.step(700));
      assert.equal(await page.evaluate(() => renderStatus.failure), '');
      await page.screenshot({ path: `test-results/composition-${format.replace(':', '-')}-${id}.png` });
      samples.push({ format, id, outgoingError, midpointError });
    }
  }
  // An interrupted fade starts from the currently displayed image.
  await page.evaluate(async () => { fixture.select('garden'); await fixture.step(100); await fixture.step(350); window.interrupted = fixture.pixels(); fixture.select('monsters'); await fixture.step(100); });
  assert.equal(await page.evaluate(() => fixture.error(fixture.pixels(), interrupted)), 0);
  await page.evaluate(async () => { fixture.format('4:3'); await fixture.step(350); await fixture.step(350); });
  assert.equal(await page.evaluate(() => fixture.error(fixture.pixels(), fixture.gradient())), 0, 'resizing mid-transition must preserve the gradient midpoint');
  assert.deepEqual(errors, []);
  await writeFile('test-results/composition-check.json', JSON.stringify({ samples, errors }, null, 2));
  console.log(JSON.stringify({ scenes: samples.length, gradientMidpoints: 'exact', outgoingFades: 'verified', rapidSelection: 'continuous', resize: 'passed', errors }, null, 2));
} finally {
  if (app) await app.close();
  await Promise.all([html, bootstrap, main].map(file => rm(file, { force: true })));
}
