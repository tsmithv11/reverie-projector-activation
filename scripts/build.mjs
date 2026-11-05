import { build } from 'esbuild';
import { mkdir, cp, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
for (const [manifestPath, file] of [['assets/model-manifest.json', 'efficientdet_lite0.tflite'], ['assets/segmentation-model-manifest.json', 'pose_landmarker_full.task'], ['assets/portrait-model-manifest.json', 'selfie_segmenter.tflite']]) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const bytes = await readFile(`assets/models/${file}`).catch(() => { throw Error('Run npm run assets once online before building.'); });
  if (bytes.length !== manifest.bytes || createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw Error(`Offline model verification failed: ${file}. Run npm run assets to restore it.`);
}
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['app/operator.js', 'app/audience.js', 'app/engine.js', 'app/robot.js'], outdir: 'dist', bundle: true, format: 'esm', platform: 'browser', target: 'chrome140', sourcemap: true });
await build({ entryPoints: ['app/workers/motion.js', 'app/workers/detector.js', 'app/workers/segmentation.js'], outdir: 'dist/workers', bundle: true, format: 'iife', platform: 'browser', target: 'chrome140', sourcemap: true });
for (const file of ['operator.html', 'audience.html', 'engine.html', 'robot.html', 'style.css']) await cp(`app/${file}`, `dist/${file}`);
// The bundled Decart SDK resolves its frame metadata worker beside robot.js.
await cp('node_modules/@decartai/sdk/dist/realtime/browser/frame-metadata-worker.js', 'dist/frame-metadata-worker.js');
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'dist/wasm', { recursive: true });
await cp('assets/brand', 'dist/brand', { recursive: true });
await cp('assets/models', 'dist/models', { recursive: true });
await cp('assets/scenes', 'dist/scenes', { recursive: true, filter: source => !source.endsWith('provenance.json') });
await cp('assets/model-manifest.json', 'dist/models/manifest.json');
await cp('assets/segmentation-model-manifest.json', 'dist/models/segmentation-manifest.json');
await cp('assets/portrait-model-manifest.json', 'dist/models/portrait-manifest.json');
await cp('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');
await cp('assets/MEDIAPIPE-LICENSE.txt', 'dist/MEDIAPIPE-LICENSE.txt');
console.log('Built desktop windows, workers and offline vision assets.');
