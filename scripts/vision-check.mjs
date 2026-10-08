// Optional local fixture test. The supplied image is read into memory, never uploaded.
import { _electron as electron } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
if (!process.env.VISION_FIXTURE) throw Error('Set VISION_FIXTURE to a local PNG or JPEG containing visible people.');
const bytes = await readFile(process.env.VISION_FIXTURE);
const uri = `data:image/${process.env.VISION_FIXTURE.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
const app = await electron.launch({ args: ['.', '--demo'], env: { ...process.env, FAL_KEY: '', DECART_API_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/vision-profile-${Date.now()}`) } });
try {
  let engine;
  while (!engine) { engine = app.windows().find(w => w.url().endsWith('/engine.html')); await new Promise(r => setTimeout(r, 100)); }
  await engine.waitForLoadState('domcontentloaded');
  const result = await engine.evaluate(async uri => {
    const data = Uint8Array.from(atob(uri.split(',')[1]), c => c.charCodeAt(0));
    const img = await createImageBitmap(new Blob([data], { type: uri.split(';')[0].slice(5) }));
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext('2d'); ctx.fillRect(0, 0, 960, 540); const scale = Math.min(960 / img.width, 540 / img.height); ctx.drawImage(img, (960 - img.width * scale) / 2, (540 - img.height * scale) / 2, img.width * scale, img.height * scale);
    return new Promise((resolve, reject) => {
      const worker = new Worker('workers/detector.js'); const timeout = setTimeout(() => { worker.terminate(); reject(Error('Detector timed out')); }, 20000);
      worker.onerror = () => { clearTimeout(timeout); worker.terminate(); reject(Error('Detector failed')); };
      worker.onmessage = ({ data }) => {
        if (data.ready) { const pixels = ctx.getImageData(0, 0, 960, 540).data; worker.postMessage({ pixels, width: 960, height: 540, time: performance.now() }, [pixels.buffer]); }
        else { clearTimeout(timeout); worker.terminate(); resolve(data); }
      };
      worker.postMessage({ type: 'init' });
    });
  }, uri);
  assert(!result.error); assert(result.boxes.length > 0, 'Fixture should include visible people');
  await writeFile('test-results/vision.json', JSON.stringify({ fixture: path.basename(process.env.VISION_FIXTURE), ...result }, null, 2));
  console.log(JSON.stringify({ detections: result.boxes.length, latencyMs: result.ms, scores: result.boxes.map(b => b.score) }, null, 2));
} finally { await app.close(); }
