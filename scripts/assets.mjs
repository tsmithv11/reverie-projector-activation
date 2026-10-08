import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const url = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite';
await mkdir('assets/models', { recursive: true });
const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw Error(`Model download failed: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length < 1e6 || bytes.toString('ascii', 4, 8) !== 'TFL3') throw Error('Invalid TFLite model');
const sha256 = createHash('sha256').update(bytes).digest('hex');
let previous; try { previous = JSON.parse(await readFile('assets/model-manifest.json', 'utf8')); } catch {}
if (previous && previous.sha256 !== sha256) throw Error('Model checksum changed. Review source and manifest before updating.');
await writeFile('assets/models/efficientdet_lite0.tflite', bytes);
await writeFile('assets/model-manifest.json', JSON.stringify({ url, sha256, bytes: bytes.length, license: 'Apache-2.0; Google MediaPipe/EfficientDet, COCO-trained', source: 'https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector' }, null, 2) + '\n');
console.log(`Offline detector installed and verified: ${sha256}`);
