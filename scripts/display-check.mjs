import { _electron as electron } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { outputSize } from '../app/core/display.js';

const profile = path.resolve(`test-results/display-profile-${Date.now()}`);
await mkdir(profile, { recursive: true });
await writeFile(path.join(profile, 'settings.json'), JSON.stringify({ demo: true, quality: 'high', fullscreen: false, outputExtraWidth: 0 }));
const errors = [], samples = [];
let app;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function launch() {
  app = await electron.launch({ args: ['.', '--demo'], env: { ...process.env, FAL_KEY: '', DECART_API_KEY: '', REVERIE_TEST_DIR: profile } });
  app.on('window', page => page.on('pageerror', error => errors.push(error.message)));
  const getWindow = async name => {
    for (let i = 0; i < 100; i++) {
      const page = app.windows().find(w => w.url().endsWith(`/${name}.html`));
      if (page) { await page.waitForLoadState('domcontentloaded'); return page; }
      await wait(100);
    }
    throw Error(`Missing ${name} window`);
  };
  const operator = await getWindow('operator'), audience = await getWindow('audience');
  await operator.waitForFunction(() => document.querySelector('#camera-health').textContent === 'demo');
  await operator.evaluate(() => window.installation.command('pause'));
  return { operator, audience };
}
async function close() {
  const stop = setTimeout(() => app.process().kill('SIGKILL'), 8000);
  try { await app.close(); } finally { clearTimeout(stop); }
}
const watchdog = setTimeout(() => app?.process().kill('SIGKILL'), 120000);
try {
  let { operator, audience } = await launch();
  for (const [displayFormat, width, height] of [
    ['4:3', 1392, 1044], ['16:9', 1920, 1080],
    ['4:3', 1920, 1080], ['4:3', 1920, 1600], ['16:9', 1392, 1044],
    ['fill', 1392, 1044], ['fill', 1920, 1080],
    ['fill', 1280, 720], ['fill', 1280, 960]
  ]) {
    await audience.setViewportSize({ width, height });
    await operator.locator('#display-format').selectOption(displayFormat);
    const dpr = await audience.evaluate(() => devicePixelRatio);
    const expected = outputSize(displayFormat, 2, width * dpr, height * dpr);
    await audience.waitForFunction(({ width, height }) => {
      const canvas = document.querySelector('canvas');
      return canvas.width === width && canvas.height === height;
    }, expected);
    const scenes = displayFormat === '4:3' && width === 1392 ? ['heat', 'lines', 'monsters', 'garden'] : ['garden'];
    for (const id of scenes) {
      await operator.evaluate(id => window.installation.command('select', id), id);
      await operator.waitForFunction(async ({ id, expected }) => {
        const s = await window.installation.state();
        return s.rendering.scene === id && s.rendering.outputWidth === expected.width && s.rendering.outputHeight === expected.height;
      }, { id, expected });
      await wait(1600);
      const state = await operator.evaluate(() => window.installation.state());
      assert.equal(state.rendering.failure, '');
      assert.equal(state.settings.displayFormat, displayFormat);
      const css = await audience.evaluate(() => {
        const c = document.querySelector('canvas'), rect = c.getBoundingClientRect();
        return { fit: getComputedStyle(c).objectFit, width: rect.width, height: rect.height, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight };
      });
      assert.deepEqual(css, { fit: displayFormat === 'fill' ? 'fill' : 'contain', width, height, scrollWidth: width, scrollHeight: height });
      const name = `${displayFormat.replace(':', '-')}-${width}x${height}-${id}`;
      await audience.screenshot({ path: `test-results/display-${name}.png` });
      samples.push({ name, ...expected, fps: state.rendering.fps });
    }
  }
  // Reproduce a processor that reports 1920×1600 but exposes only 1392×1044.
  const dpr = await audience.evaluate(() => devicePixelRatio);
  await audience.setViewportSize({ width: Math.round(1920 / dpr), height: Math.round(1600 / dpr) });
  await operator.locator('#display-format').selectOption('16:9');
  await operator.locator('#output-mapping').selectOption('wall-1392');
  assert.equal(await operator.locator('#display-format').inputValue(), '4:3');
  assert.equal(await operator.locator('#output-offsets').isVisible(), true);
  async function checkWall(x, y, renderWidth = 1392, renderHeight = 1044, areaWidth = 1392) {
    await audience.waitForFunction(({ x, y, renderWidth, renderHeight, areaWidth }) => {
      const c = document.querySelector('canvas'), r = c.getBoundingClientRect(), dpr = devicePixelRatio;
      return Math.abs(r.x * dpr - x) < .1 && Math.abs(r.y * dpr - y) < .1 &&
        Math.abs(r.width * dpr - areaWidth) < .1 && Math.abs(r.height * dpr - 1044) < .1 &&
        c.width === renderWidth && c.height === renderHeight && getComputedStyle(c).objectFit === 'fill' && getComputedStyle(document.body).backgroundColor === 'rgb(0, 0, 0)';
    }, { x, y, renderWidth, renderHeight, areaWidth });
  }
  await checkWall(0, 0);
  await audience.screenshot({ path: 'test-results/display-wall-1392x1044-in-1920x1600.png' });
  await operator.locator('#output-offset-x').fill('264');
  await operator.locator('#output-offset-x').press('Tab');
  await operator.locator('#output-offset-y').fill('278');
  await operator.locator('#output-offset-y').press('Tab');
  await checkWall(264, 278);
  await operator.locator('#quality').selectOption('low');
  await checkWall(264, 278, 960, 720);
  await operator.locator('#quality').selectOption('high');
  await operator.locator('#display-format').selectOption('fill');
  await checkWall(264, 278);
  // Returning to standard fitting must remove both offsets and fixed sizing.
  await operator.locator('#output-mapping').selectOption('screen');
  await audience.waitForFunction(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return r.x === 0 && r.y === 0 && r.width === innerWidth && r.height === innerHeight && !document.body.classList.contains('wall-output');
  });
  assert.equal(await operator.locator('#output-offsets').isVisible(), false);
  await operator.locator('#output-mapping').selectOption('wall-1392');
  await checkWall(264, 278);
  await operator.locator('#display-format').selectOption('4:3');
  await operator.locator('#output-extra-width').fill('20');
  await operator.locator('#output-extra-width').press('Tab');
  await checkWall(264, 278, 1392, 1044, 1412);
  await audience.screenshot({ path: 'test-results/display-wall-right-edge-20.png' });
  await operator.locator('#quality').selectOption('low');
  await checkWall(264, 278, 960, 720, 1412);
  await operator.locator('#quality').selectOption('high');
  await checkWall(264, 278, 1392, 1044, 1412);
  // Zero must restore the original width immediately.
  await operator.locator('#output-extra-width').fill('0');
  await operator.locator('#output-extra-width').press('Tab');
  await checkWall(264, 278);
  await operator.locator('#output-extra-width').fill('20');
  await operator.locator('#output-extra-width').press('Tab');
  await checkWall(264, 278, 1392, 1044, 1412);
  await operator.locator('#settings').screenshot({ path: 'test-results/display-controls.png' });
  const saved = JSON.parse(await readFile(path.join(profile, 'settings.json'), 'utf8'));
  assert.equal(saved.displayFormat, '4:3');
  assert.equal(saved.outputMapping, 'wall-1392');
  assert.equal(saved.outputExtraWidth, 20);
  assert.equal(saved.outputOffsetX, 264); assert.equal(saved.outputOffsetY, 278);
  await close();
  ({ operator, audience } = await launch());
  assert.equal(await operator.locator('#display-format').inputValue(), '4:3');
  assert.equal(await operator.locator('#output-mapping').inputValue(), 'wall-1392');
  assert.equal(await operator.locator('#output-offset-x').inputValue(), '264');
  assert.equal(await operator.locator('#output-offset-y').inputValue(), '278');
  await audience.setViewportSize({ width: Math.round(1920 / dpr), height: Math.round(1600 / dpr) });
  assert.equal(await operator.locator('#output-extra-width').inputValue(), '20');
  await checkWall(264, 278, 1392, 1044, 1412);
  await audience.waitForFunction(() => document.querySelector('canvas').width === 1392 && document.querySelector('canvas').height === 1044);
  assert.deepEqual(errors, []);
  await writeFile('test-results/display-check.json', JSON.stringify({ samples, persisted: true, errors }, null, 2));
  console.log(JSON.stringify({ samples, persisted: true, errors }, null, 2));
} finally { clearTimeout(watchdog); if (app) await close(); }
