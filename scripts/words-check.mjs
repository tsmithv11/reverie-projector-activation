import { _electron as electron } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const profile = path.resolve(`test-results/words-profile-${Date.now()}`);
await mkdir(profile, { recursive: true });
await writeFile(path.join(profile, 'settings.json'), JSON.stringify({ demo: true, quality: 'high', fullscreen: false }));
const app = await electron.launch({ args: ['.', '--demo'], env: { ...process.env, FAL_KEY: '', DECART_API_KEY: '', REVERIE_TEST_DIR: profile } });
const errors = [], samples = [];
app.on('window', page => page.on('pageerror', error => errors.push(error.message)));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 120000);
try {
  let operator, audience;
  for (let i = 0; i < 100; i++) {
    operator = app.windows().find(page => page.url().endsWith('/operator.html'));
    audience = app.windows().find(page => page.url().endsWith('/audience.html'));
    if (operator && audience) break;
    await wait(100);
  }
  assert(operator && audience);
  await operator.waitForLoadState('domcontentloaded');
  await audience.waitForFunction(async () => (await window.installation.frame(-1))?.demo);
  await operator.evaluate(async () => {
    await window.installation.command('pause');
    await window.installation.command('select', 'words');
  });
  await operator.locator('.scene-card[data-id="words"].active').waitFor();
  await audience.setViewportSize({ width: 1920, height: 1080 });
  await wait(4500);
  let state = await operator.evaluate(() => window.installation.state());
  assert.equal(state.active, 'words'); assert.equal(state.rendering.failure, '');
  assert(state.rendering.fps > 25, `High quality: ${state.rendering.fps} fps`);
  samples.push({ mode: 'real demo motion', ...state.rendering });
  await audience.screenshot({ path: 'test-results/words-demo.png' });

  // Freeze a synthetic camera frame, then move only the analysis. This verifies
  // color response and keeps this rehearsal from recording any real camera.
  const frame = await audience.evaluate(async () => {
    const frame = await window.installation.frame(-1);
    if (!frame.demo) throw Error('Words rehearsal requires a synthetic camera');
    const pixels = new Uint8Array(frame.pixels);
    let binary = '';
    for (let offset = 0; offset < pixels.length; offset += 16384) binary += String.fromCharCode(...pixels.subarray(offset, offset + 16384));
    return { width: frame.width, height: frame.height, pixels: btoa(binary) };
  });
  await app.evaluate(({ ipcMain }, frame) => {
    globalThis.wordsMode = 'still';
    let seq = 100000;
    const pixels = Uint8ClampedArray.from(Buffer.from(frame.pixels, 'base64'));
    const alternate = pixels.slice();
    for (let i = 0; i < alternate.length; i += 4) { alternate[i] = 35; alternate[i + 1] = 90; alternate[i + 2] = 150; }
    const person = (x, scale = 1) => [
      [0, .23], [0, .29], [-.025, .36], [.025, .36], [-.025, .43], [.025, .43],
      [-.06, .4], [.06, .4], [-.085, .46], [.085, .46],
      [-.025, .52], [.025, .52], [-.045, .6], [.045, .6], [-.065, .68], [.065, .68]
    ].map(([dx, y]) => ({ x: x + dx * scale, y: .17 + (y - .17) * scale, strength: .75 }));
    ipcMain.removeHandler('frame');
    ipcMain.handle('frame', () => globalThis.wordsMode === 'lost' ? null : ({
      seq: seq++, at: Date.now(), width: frame.width, height: frame.height, demo: true,
      pixels: (globalThis.wordsMode === 'camera-change' ? alternate : pixels).buffer, boxes: [],
      motion: { amount: .1, calm: [], points: globalThis.wordsMode === 'left' ? person(.28) :
        globalThis.wordsMode === 'right' ? person(.72) :
        globalThis.wordsMode === 'crowd' ? [...person(.24), ...person(.51, .8), ...person(.77, 1.1)] : [] }
    }));
  }, frame);
  const inspect = () => audience.evaluate(() => {
    const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, image = ctx.getImageData(0, 0, w, h).data;
    let left = 0, right = 0, interior = 0;
    for (let y = Math.floor(h * .2); y < h * .8; y += 2) for (let x = Math.floor(w * .14); x < w * .88; x += 2) {
      const i = (y * w + x) * 4;
      if (image[i] > 150 && image[i + 2] > 155) { if (x < w / 2) left++; else right++; }
      interior = (interior + image[i] + image[i + 1] * 3 + image[i + 2] * 7) >>> 0;
    }
    const p = (Math.floor(h * .5) * w + Math.floor(w * .025)) * 4;
    return { left, right, interior, outside: Array.from(image.slice(p, p + 4)), width: w, height: h };
  });
  await wait(8000);
  const idle = await inspect(); assert.equal(idle.left + idle.right, 0);
  await app.evaluate(() => { globalThis.wordsMode = 'left'; });
  await wait(1800);
  const left = await inspect(); assert(left.left > 200); assert.equal(left.right, 0);
  assert.deepEqual(left.outside, idle.outside, 'motion may recolor text only inside the portal');
  await app.evaluate(() => { globalThis.wordsMode = 'right'; });
  await wait(6500);
  const right = await inspect(); assert(right.right > 200); assert.equal(right.left, 0);
  await app.evaluate(() => { globalThis.wordsMode = 'crowd'; });
  await wait(1600);
  await audience.screenshot({ path: 'test-results/words-audience-16-9.png' });

  for (const [displayFormat, quality, width, height] of [['4:3','high',1392,1044], ['fill','low',1280,960]]) {
    await audience.setViewportSize({ width, height });
    await operator.evaluate(({ displayFormat, quality }) => window.installation.configure({ displayFormat, quality }), { displayFormat, quality });
    await wait(2500);
    state = await operator.evaluate(() => window.installation.state());
    assert.equal(state.rendering.failure, ''); assert(state.rendering.fps > 25);
    samples.push({ mode: `${displayFormat} ${quality}`, ...state.rendering });
    await audience.screenshot({ path: `test-results/words-audience-${displayFormat.replace(':','-')}-${quality}.png` });
  }
  await app.evaluate(() => { globalThis.wordsMode = 'still'; });
  await wait(8000);
  const still = await inspect(); assert.equal(still.left + still.right, 0);
  await app.evaluate(() => { globalThis.wordsMode = 'camera-change'; });
  await wait(500);
  const changed = await inspect();
  assert.notDeepEqual(changed.outside, still.outside, 'the surround must show the current camera');
  assert.equal(changed.interior, still.interior, 'the camera image must not bleed into the text field');
  await app.evaluate(() => { globalThis.wordsMode = 'lost'; });
  await wait(2600);
  state = await operator.evaluate(() => window.installation.state());
  assert(state.rendering.frameAge > 2000); assert.equal(state.rendering.failure, '');
  await app.evaluate(() => { globalThis.wordsMode = 'crowd'; });
  await wait(1600);
  assert((await inspect()).left > 200, 'motion must resume after camera recovery');
  await operator.evaluate(() => window.installation.command('select', 'lines'));
  await wait(1800);
  await operator.evaluate(() => window.installation.command('select', 'words'));
  await wait(2000);
  state = await operator.evaluate(() => window.installation.state());
  assert.equal(state.rendering.failure, ''); assert.equal(state.active, 'words');
  assert.deepEqual(errors, []);
  await writeFile('test-results/words-check.json', JSON.stringify({ samples, idle, left, right, still, changed, errors }, null, 2));
  console.log(JSON.stringify({ samples, portalAndCamera: 'passed', motionAndRecovery: 'passed', errors }, null, 2));
} finally {
  clearTimeout(watchdog);
  const stop = setTimeout(() => app.process().kill('SIGKILL'), 8000);
  try { await app.close(); } finally { clearTimeout(stop); }
}
