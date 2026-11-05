import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('assets/models', { recursive: true });
for (const [manifestPath, file] of [['assets/model-manifest.json', 'efficientdet_lite0.tflite'], ['assets/segmentation-model-manifest.json', 'pose_landmarker_full.task'], ['assets/portrait-model-manifest.json', 'selfie_segmenter.tflite']]) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const valid = bytes => bytes.length === manifest.bytes && createHash('sha256').update(bytes).digest('hex') === manifest.sha256;
  const target = `assets/models/${file}`;
  const existing = await readFile(target).catch(() => null);
  if (existing && valid(existing)) { console.log(`Offline model verified: ${file}`); continue; }
  const response = await fetch(manifest.url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error(`Model download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes)) throw Error(`Model checksum changed: ${file}. Review source and manifest before updating.`);
  await writeFile(target, bytes);
  console.log(`Offline model installed and verified: ${file}`);
}
