// Optional AFTERGLOW_VIDEO is a local Y4M camera fixture containing people.
// Otherwise Chromium's blank test camera verifies zero-person inference.
import { _electron as electron } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('test-results', { recursive: true });
const executablePath = process.env.REVERIE_EXECUTABLE;
const expectedPeople = Number(process.env.AFTERGLOW_EXPECTED_PEOPLE ?? (process.env.AFTERGLOW_VIDEO ? 2 : 0));
assert(Number.isInteger(expectedPeople) && expectedPeople >= 0 && expectedPeople <= 16);
const args = [...(executablePath ? [] : ['.']), '--demo', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
if (process.env.AFTERGLOW_VIDEO) args.push(`--use-file-for-fake-video-capture=${path.resolve(process.env.AFTERGLOW_VIDEO)}`);
const app = await electron.launch({ executablePath, args, env: { ...process.env, FAL_KEY: '', DECART_API_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/afterglow-profile-${Date.now()}`) } });
const errors = [], network = [], samples = [];
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 120000);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (read, timeout = 30000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await read(); if (result) return result; await wait(100); }
  throw Error('Timed out waiting for Afterglow');
};
app.on('window', win => win.on('pageerror', e => errors.push(e.message)));
app.context().on('request', req => { if (/^(https?|wss?):/.test(req.url())) network.push(req.url()); });
await app.context().route(/^https?:/, route => route.abort());
const getWindow = async name => {
  for (let i = 0; i < 100; i++) {
    const win = app.windows().find(w => w.url().endsWith(`/${name}.html`));
    if (win) { await win.waitForLoadState('domcontentloaded'); return win; }
    await wait(100);
  }
  throw Error(`Missing ${name}`);
};
try {
  const operator = await getWindow('operator'), audience = await getWindow('audience'), engine = await getWindow('engine');
  await operator.evaluate(async () => {
    await installation.configure({ quality: 'high', duration: 60, robotEnabled: false, fullscreen: false });
    await installation.command('select', 'afterglow'); await installation.command('pause');
  });
  await until(() => audience.evaluate(async () => (await installation.segmentation(-1))?.instances.length === 4));
  await wait(2000);
  await audience.screenshot({ path: 'test-results/afterglow-demo.png' });
  const high = await operator.evaluate(() => installation.state());
  assert.equal(high.active, 'afterglow'); assert.equal(high.rendering.failure, ''); assert(high.rendering.fps > 20);
  assert.equal(high.cloud.streaming, false);
  samples.push({ stage: 'demo-high', fps: high.rendering.fps });
  await operator.evaluate(() => installation.configure({ quality: 'low', displayFormat: '4:3' }));
  await wait(1800);
  await audience.screenshot({ path: 'test-results/afterglow-demo-4x3.png' });
  const low = await operator.evaluate(() => installation.state());
  assert.equal(low.rendering.failure, ''); assert(low.rendering.fps > 20);
  samples.push({ stage: 'demo-low', fps: low.rendering.fps });

  await operator.evaluate(() => installation.configure({ demo: false, quality: 'high', displayFormat: '16:9' }));
  await until(() => operator.evaluate(async () => {
    const s = await installation.state();
    return s.camera.state === 'live' && s.camera.segmentation === 'ready' && s.camera.segmentationMs > 0;
  }), 45000);
  await until(() => audience.evaluate(async () => !!(await installation.segmentation(-1))));
  const collect = () => until(() => audience.evaluate(async () => {
    const f = await installation.segmentation(-1);
    return f && { at: f.at, seq: f.seq, demo: f.demo, width: f.width, height: f.height, mirror: f.mirror, ms: f.ms, count: f.instances.length, tracks: f.instances.map(p => ({ id: p.id, color: p.color, x: p.x, y: p.y, segments: p.contour.length / 4 })), alpha: f.fill.filter((_, i) => i % 4 === 3).filter(a => a > 0).length };
  }));
  const checkPeople = sample => {
    assert.equal(sample.count, expectedPeople, 'fixture should have exactly the expected people, without duplicate or extra masks');
    if (expectedPeople) {
      assert(sample.alpha > 1000);
      assert(sample.tracks.every(p => p.segments > 50));
      assert.equal(new Set(sample.tracks.map(p => p.id)).size, expectedPeople);
    } else assert.equal(sample.alpha, 0);
  };
  await until(() => audience.evaluate(async () => (await installation.segmentation(-1))?.width === 640));
  // New real tracks need two captures before becoming visible.
  await until(() => audience.evaluate(async expected => (await installation.segmentation(-1))?.instances.length === expected, expectedPeople));
  const real = await collect();
  assert(real && !real.demo); assert(real.width === 640); assert(real.ms > 0);
  checkPeople(real);
  await wait(2000);
  const later = await collect();
  assert(later.seq > real.seq, 'inference must keep advancing');
  checkPeople(later);
  if (process.env.AFTERGLOW_VIDEO) assert.deepEqual(later.tracks.map(p => [p.id, p.color]).sort(), real.tracks.map(p => [p.id, p.color]).sort());
  await audience.screenshot({ path: `test-results/afterglow-${process.env.AFTERGLOW_VIDEO ? 'live' : 'empty'}.png` });
  samples.push({ stage: 'local-model', ...later });
  await operator.evaluate(() => installation.configure({ mirror: false, displayFormat: '4:3' }));
  await until(() => audience.evaluate(async () => (await installation.segmentation(-1))?.mirror === false));
  await wait(1600);
  await audience.screenshot({ path: `test-results/afterglow-${process.env.AFTERGLOW_VIDEO ? 'live' : 'empty'}-4x3.png` });
  for (const [quality, width] of [['low', 384], ['balanced', 512]]) {
    await operator.evaluate(quality => installation.configure({ quality }), quality);
    await until(() => audience.evaluate(async width => (await installation.segmentation(-1))?.width === width, width));
    await wait(1000);
    const sample = await collect(); checkPeople(sample);
    assert.equal(sample.width, width);
    samples.push({ stage: `local-model-${quality}`, ...sample });
  }

  // The worker and held frame must be released when leaving the scene.
  await operator.evaluate(() => installation.command('select', 'words'));
  await wait(1300);
  assert.equal(await audience.evaluate(() => installation.segmentation(-1)), null);
  assert.equal((await operator.evaluate(() => installation.state())).camera.segmentation, 'idle');
  await operator.evaluate(() => installation.command('select', 'afterglow'));
  await until(() => audience.evaluate(async () => !!(await installation.segmentation(-1))));

  // Camera loss clears the latest mask; no generated stand-in people appear.
  await engine.evaluate(() => { const video = document.querySelector('video'); video.srcObject.getTracks().forEach(t => t.stop()); video.pause(); });
  await wait(2500);
  assert.equal(await audience.evaluate(() => installation.segmentation(-1)), null, 'captured timestamps must expire, even if camera.currentTime stalls');
  assert.equal((await operator.evaluate(() => installation.state())).rendering.failure, '');
  assert.deepEqual(network, []); assert.deepEqual(errors, []);
  await writeFile(`test-results/afterglow${executablePath ? '-package' : ''}${process.env.AFTERGLOW_VIDEO ? '' : '-empty'}.json`, JSON.stringify({ samples, network, errors }, null, 2));
  console.log(JSON.stringify({ samples, network, errors }, null, 2));
} finally {
  clearTimeout(watchdog);
  const force = setTimeout(() => app.process().kill('SIGKILL'), 6000);
  await app.close(); clearTimeout(force);
}
