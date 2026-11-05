import test from 'node:test';
import assert from 'node:assert/strict';
import { SegmentationService } from '../app/core/segmentation-service.js';

test('segmentation has one job in flight, drops late results and releases workers on changes', async () => {
  const workers = [], published = [];
  const previousDocument = globalThis.document, previousWorker = globalThis.Worker;
  globalThis.document = { createElement() { return { width: 1, height: 1, getContext() { return { drawImage() {}, getImageData(_x, _y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; } }; } }; } };
  globalThis.Worker = class {
    constructor(url) { this.url = url; this.messages = []; workers.push(this); }
    postMessage(data) { this.messages.push(data); }
    terminate() { this.terminated = true; }
  };
  try {
    const service = new SegmentationService({ async publishSegmentation(data) { published.push(data); } });
    const state = { active: 'afterglow', activation: 1, settings: { cameraId: '', mirror: true, demo: false } };
    service.configure(state); const now = Date.now(); service.capture({}, now, 2);
    assert.equal(workers.length, 1); assert.equal(workers[0].url, 'workers/segmentation.js');
    await workers[0].onmessage({ data: { ready: true } });
    service.capture({}, now + 100, 2); service.capture({}, now + 200, 2);
    assert.equal(workers[0].messages.length, 2, 'initialization + exactly one inference');
    const sent = workers[0].messages[1]; assert.equal(sent.width, 640);
    const result = { pixels: sent.pixels, width: sent.width, height: sent.height, at: sent.at, instances: [], fill: new Uint8ClampedArray(sent.pixels.length), ms: 12 };
    await workers[0].onmessage({ data: result });
    assert.equal(published.at(-1).at, sent.at, 'arrival time cannot make a stale capture fresh');
    assert.equal(published.at(-1).activation, 1);
    service.capture({}, now + 300, 0); assert.equal(workers[0].messages.at(-1).width, 384);
    service.configure({ ...state, settings: { ...state.settings, mirror: false } });
    assert(workers[0].terminated); assert.equal(published.at(-1), null);
    await workers[0].onmessage({ data: result }); assert.equal(published.at(-1), null, 'old camera orientation must be ignored');
    service.capture({}, now + 500, 0); assert.equal(workers.length, 2);
    await workers[1].onmessage({ data: { ready: true } });
    service.configure({ ...state, active: 'garden' }); assert(workers[1].terminated);
    service.capture({}, now + 1000, 2); assert.equal(workers.length, 2); assert.equal(service.state, 'idle');
    service.configure(state); service.capture({}, now + 2000, 1);
    await workers[2].onmessage({ data: { error: true } });
    assert.equal(service.state, 'unavailable'); assert(workers[2].terminated);
    service.capture({}, now + 2500, 1); assert.equal(workers.length, 3, 'failed model retries are bounded');
    service.capture({}, service.retryAt + 1, 1); assert.equal(workers.length, 4);
    service.check(service.sent + 15001); assert.equal(service.state, 'unavailable'); assert(workers[3].terminated);
    assert.equal(published.filter(p => p !== null).length, 1, 'no synthetic fallback is published');
  } finally { globalThis.document = previousDocument; globalThis.Worker = previousWorker; }
});
