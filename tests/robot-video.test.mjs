import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { usableDimensions, usablePixels } from '../app/core/robot-result.js';
import { coverRect } from '../app/core/display.js';
import { decartModel } from '../app/core/decart-connection.js';

const source = readFileSync(new URL('../app/robot.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const goodPixels = new Uint8ClampedArray(4096);
for (let i = 0; i < goodPixels.length; i++) goodPixels[i] = Math.floor(i / 128) % 2 ? 220 : 40;
const blackPixels = new Uint8ClampedArray(4096), flatPixels = new Uint8ClampedArray(4096).fill(128);

// Run the actual isolated service with controlled decoded-frame callbacks and
// a virtual clock. Provider traffic and camera capture never leave this test.
async function videoService({ holdPublish = false, sceneId = 'robots', inputWidth = 1280, inputHeight = 720 } = {}) {
  let now = 1000, callback, connectionOptions, outputPixels = goodPixels, inputSeq = 0, releasePublish;
  let connections = 0, closes = 0, stoppedTracks = 0;
  const failures = [], published = [], draws = [], intervals = new Set();
  const stream = { getVideoTracks: () => [{ requestFrame() {} }], getTracks: () => [{ stop() { stoppedTracks++; } }] };
  const video = { videoWidth: 1280, videoHeight: 720, play: async () => {},
    requestVideoFrameCallback(fn) { assert.equal(callback, undefined, 'Only one frame callback may be queued'); callback = fn; } };
  const api = {
    onStop(fn) { this.stop = fn; }, closed() {}, stage() {},
    job: async () => ({ id: 7, provider: 'decart', sceneId }), token: async () => 'fake-token',
    frame: async () => ({ seq: ++inputSeq, width: inputWidth, height: inputHeight, pixels: new Uint8ClampedArray(inputWidth * inputHeight * 4) }),
    publish: frame => { published.push(frame); return holdPublish ? new Promise(resolve => { releasePublish = resolve; }) : Promise.resolve(true); },
    complete: result => failures.push(result)
  };
  const context = vm.createContext({
    window: { installation: api, addEventListener() {} },
    document: {
      querySelector: () => video,
      createElement: () => ({ captureStream: () => stream, getContext: () => ({
        fillRect() {}, drawImage(...args) { draws.push(args); }, putImageData() {}, getImageData: () => ({ data: outputPixels })
      }) })
    },
    Date: { now: () => now }, Uint8ClampedArray, ImageData: class {},
    usableDimensions, usablePixels, coverRect, decartModel, liveScene: () => ({ prompt: 'robots' }),
    openDecartConnection(options) { connections++; connectionOptions = options; return { close() { closes++; return Promise.resolve({ acknowledged: true }); } }; },
    setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn), clearTimeout() {}
  });
  await vm.runInContext(`(async () => { ${source}\n})()`, context);
  await connectionOptions.onRemoteStream(stream);
  return {
    failures, published, draws,
    get connections() { return connections; }, get closes() { return closes; }, get stoppedTracks() { return stoppedTracks; },
    get queued() { return !!callback; }, acknowledge() { releasePublish?.(true); },
    async frame({ after = 50, pixels = goodPixels, width = 1280, height = 720 } = {}) {
      now += after; outputPixels = pixels; video.videoWidth = width; video.videoHeight = height;
      const publish = callback; callback = undefined; assert(publish, 'The next decoded frame must still be requested');
      await publish(now);
    },
    async tick(ms) { now += ms; for (const fn of intervals) await fn(); },
    stop: () => api.stop({ id: 7 })
  };
}

test('Restyle input preserves face proportions at every shared-camera resolution', async () => {
  for (const inputWidth of [480, 640, 960, 1280]) {
    const inputHeight = inputWidth * 9 / 16;
    const service = await videoService({ sceneId: 'cartoon', inputWidth, inputHeight });
    const [, x, y, width, height] = service.draws[0];
    assert.equal(width / inputWidth, height / inputHeight, 'Both axes must use the same scale');
    assert.deepEqual([x, y, width, height], [0, -8, 1280, 720], 'Crop 8 pixels at top and bottom, never squash 720 into 704');
    await service.stop();
  }
});

test('Lucy 2.5 input still uses the full camera plane without cropping', async () => {
  const service = await videoService();
  assert.deepEqual(service.draws[0].slice(1), [0, 0, 1280, 720]);
  await service.stop();
});

test('brief black, flat and invalid-dimension frames recover in the same live connection', async () => {
  const service = await videoService();
  await service.frame();
  const first = service.published[0];
  for (const bad of [{ pixels: blackPixels }, { pixels: flatPixels }, { width: 0, height: 0 }]) {
    for (let i = 0; i < 8; i++) await service.frame({ after: 50, ...bad });
  }
  assert.equal(service.published.length, 1, 'Bad frames must not refresh the audience image');
  assert.equal(service.published[0], first);
  assert.equal(service.closes, 0); assert.deepEqual(service.failures, []);
  await service.frame();
  assert.equal(service.published.length, 2); assert.equal(service.published[1].seq, 2);
  assert.equal(service.connections, 1); assert.equal(service.closes, 0);
  await service.stop();
});

test('repeated short glitches each recover without accumulating toward a later failure', async () => {
  const service = await videoService();
  await service.frame();
  for (let i = 0; i < 100; i++) {
    await service.frame({ after: 500, pixels: blackPixels });
    await service.frame({ after: 500 });
  }
  assert.equal(service.published.length, 101); assert.equal(service.connections, 1);
  assert.equal(service.closes, 0); assert.deepEqual(service.failures, []);
  await service.stop();
});

for (const [label, bad] of [['black', { pixels: blackPixels }], ['flat', { pixels: flatPixels }], ['dimensions', { width: 0, height: 0 }]]) {
  test(`sustained invalid ${label} output stops after two seconds without refreshing freshness`, async () => {
    const service = await videoService();
    await service.frame();
    for (let i = 0; i < 19; i++) await service.frame({ after: 100, ...bad });
    assert.equal(service.closes, 0);
    await service.frame({ after: 100, ...bad });
    assert.equal(service.published.length, 1); assert.equal(service.closes, 1);
    assert.equal(service.failures.length, 1); assert.equal(service.failures[0].code, 'INVALID_IMAGE');
    assert.equal(service.queued, false); assert(service.stoppedTracks > 0);
    await service.tick(5000); assert.equal(service.failures.length, 1);
  });
}

test('watchdog still stops missing decoded frames and a glitch followed by a frozen stream', async () => {
  for (const invalid of [false, true]) {
    const service = await videoService();
    await service.frame();
    if (invalid) await service.frame({ after: 100, pixels: blackPixels });
    await service.tick(invalid ? 1800 : 1900); assert.equal(service.closes, 0);
    await service.tick(100);
    assert.equal(service.failures[0].code, invalid ? 'INVALID_IMAGE' : 'VIDEO_STALLED');
    assert.equal(service.published.length, 1); assert.equal(service.closes, 1);
  }
});

test('startup waits for usable video and a later healthy stream clears the invalid-frame diagnosis', async () => {
  const service = await videoService();
  await service.frame({ width: 0, height: 0 });
  await service.frame({ after: 3000, pixels: blackPixels });
  await service.tick(500); assert.equal(service.closes, 0); assert.equal(service.published.length, 0);
  await service.frame(); assert.equal(service.published.length, 1);
  await service.tick(2000); assert.equal(service.failures[0].code, 'VIDEO_STALLED');
});

test('glitch recovery preserves one frame in flight and stop prevents further output', async () => {
  const service = await videoService({ holdPublish: true });
  const pending = service.frame();
  assert.equal(service.published.length, 1); assert.equal(service.queued, false);
  service.acknowledge(); await pending;
  await service.frame({ pixels: blackPixels });
  await service.stop();
  await service.frame();
  assert.equal(service.published.length, 1); assert.equal(service.closes, 1);
  assert.deepEqual(service.failures, []); assert.equal(service.queued, false);
});
