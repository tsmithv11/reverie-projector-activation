import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
let detector;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      detector = await ObjectDetector.createFromOptions(await FilesetResolver.forVisionTasks('../wasm'), { baseOptions: { modelAssetPath: '../models/efficientdet_lite0.tflite', delegate: 'CPU' }, runningMode: 'VIDEO', scoreThreshold: .34, maxResults: 24, categoryAllowlist: ['person'] });
      self.postMessage({ ready: true }); return;
    }
    const start = performance.now();
    const result = detector.detectForVideo(new ImageData(data.pixels, data.width, data.height), data.time);
    const boxes = result.detections.map(d => ({ x: d.boundingBox.originX / data.width, y: d.boundingBox.originY / data.height, w: d.boundingBox.width / data.width, h: d.boundingBox.height / data.height, score: d.categories[0].score }));
    self.postMessage({ boxes, ms: performance.now() - start });
  } catch { self.postMessage({ error: true }); }
};
