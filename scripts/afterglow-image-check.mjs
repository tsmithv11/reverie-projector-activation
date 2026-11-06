// User-supplied local regression image; never uploaded or included in the app.
import { _electron as electron } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

if (!process.env.AFTERGLOW_IMAGE) throw Error('Set AFTERGLOW_IMAGE to a local close-up PNG or JPEG.');
const executablePath = process.env.REVERIE_EXECUTABLE;
const expectedPeople = Number(process.env.AFTERGLOW_EXPECTED_PEOPLE ?? 1);
const minimumArea = Number(process.env.AFTERGLOW_MIN_AREA ?? .12);
await mkdir('test-results', { recursive: true });
const app = await electron.launch({ executablePath, args: [...(executablePath ? [] : ['.']), '--demo'],
  env: { ...process.env, FAL_KEY: '', DECART_API_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/afterglow-image-profile-${Date.now()}`) } });
const errors = [], network = [];
app.on('window', win => win.on('pageerror', error => errors.push(error.message)));
app.context().on('request', request => { if (/^(https?|wss?):/.test(request.url())) network.push(request.url()); });
await app.context().route(/^https?:/, route => route.abort());
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 90000);
try {
  let engine;
  for (let i = 0; i < 100 && !engine; i++) {
    engine = app.windows().find(win => win.url().endsWith('/engine.html'));
    if (!engine) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(engine, 'camera engine window must be available');
  await engine.waitForLoadState('domcontentloaded');
  const bytes = await readFile(process.env.AFTERGLOW_IMAGE);
  const results = await engine.evaluate(async base64 => {
    const img = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))]));
    const results = [];
    for (const width of [640, 512, 384]) {
      const height = width * 9 / 16, canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }), scale = Math.min(width / img.width, height / img.height);
      ctx.drawImage(img, (width - img.width * scale) / 2, (height - img.height * scale) / 2, img.width * scale, img.height * scale);
      results.push(await new Promise((resolve, reject) => {
        const worker = new Worker('workers/segmentation.js'), samples = [];
        let overlay;
        const timeout = setTimeout(() => { worker.terminate(); reject(Error('Segmentation timed out')); }, 30000);
        const send = () => {
          const pixels = samples.length < 4 ? ctx.getImageData(0, 0, width, height).data : new Uint8ClampedArray(width * height * 4).fill(128);
          worker.postMessage({ pixels, width, height, time: performance.now(), at: Date.now() }, [pixels.buffer]);
        };
        worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(Error(event.message)); };
        worker.onmessage = ({ data }) => {
          if (data.ready) { send(); return; }
          if (data.error) { clearTimeout(timeout); worker.terminate(); reject(Error('Segmentation failed')); return; }
          const filled = data.fill.reduce((n, a, i) => n + (i % 4 === 3 && a > 127 ? 1 : 0), 0);
          samples.push({ count: data.instances.length, ids: data.instances.map(p => p.id), area: filled / (width * height), ms: data.ms });
          if (samples.length === 4) {
            const output = document.createElement('canvas'); output.width = width; output.height = height;
            const out = output.getContext('2d'); out.drawImage(canvas, 0, 0);
            const layer = document.createElement('canvas'); layer.width = width; layer.height = height;
            for (let i = 0; i < data.fill.length; i += 4) { data.fill[i] = 0; data.fill[i + 1] = 255; data.fill[i + 2] = 180; }
            layer.getContext('2d').putImageData(new ImageData(data.fill, width, height), 0, 0);
            out.globalAlpha = .65; out.drawImage(layer, 0, 0); overlay = output.toDataURL('image/png');
          }
          if (samples.length < 5) { setTimeout(send, 150); return; }
          clearTimeout(timeout); worker.terminate(); resolve({ width, samples, overlay });
        };
        worker.postMessage({ type: 'init' });
      }));
    }
    img.close(); return results;
  }, bytes.toString('base64'));
  for (const result of results) {
    await writeFile(`test-results/afterglow-closeup-${result.width}.png`, Buffer.from(result.overlay.split(',')[1], 'base64'));
    delete result.overlay;
    assert.equal(result.samples[0].count, 0, 'a single capture cannot confirm a new track');
    for (const sample of result.samples.slice(1, 4)) {
      assert.equal(sample.count, expectedPeople);
      assert(sample.area >= minimumArea, 'mask must cover the person, not a small spurious patch');
      assert.deepEqual(sample.ids, result.samples[1].ids);
    }
    assert.equal(result.samples[4].count, 0, 'blank frame must clear the portrait immediately');
    assert.equal(result.samples[4].area, 0);
  }
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const report = { results, errors, network };
  await writeFile(`test-results/afterglow-closeup${executablePath ? '-package' : ''}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  clearTimeout(watchdog);
  const force = setTimeout(() => app.process().kill('SIGKILL'), 6000);
  await app.close(); clearTimeout(force);
}
