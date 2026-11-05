import { afterglowDemo } from './afterglow-demo.js';

export class SegmentationService {
  constructor(api) {
    this.api = api; this.seq = 0; this.epoch = 0; this.state = 'idle'; this.ms = 0; this.people = 0;
    this.canvas = document.createElement('canvas'); this.silhouette = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }
  configure(state) {
    const enabled = state.active === 'afterglow';
    const metadata = { activation: state.activation, cameraId: state.settings.cameraId, mirror: state.settings.mirror, demo: state.settings.demo };
    const key = enabled ? JSON.stringify(metadata) : '';
    if (this.key === key) return;
    this.stop(); this.key = key; this.metadata = metadata; this.enabled = enabled;
    if (enabled) { this.state = metadata.demo ? 'synthetic' : 'starting'; this.retryAt = 0; }
  }
  stop() {
    this.epoch++; this.worker?.terminate(); this.worker = null; this.ready = false; this.busy = false;
    this.state = 'idle'; this.people = 0; this.ms = 0; this.last = 0;
    this.canvas.width = this.canvas.height = this.silhouette.width = this.silhouette.height = 1;
    this.api.publishSegmentation(null).catch(() => {});
  }
  fail() {
    this.worker?.terminate(); this.worker = null; this.ready = false; this.busy = false;
    this.state = 'unavailable'; this.people = 0; this.retryAt = Date.now() + 30000;
    this.api.publishSegmentation(null).catch(() => {});
  }
  start() {
    const epoch = this.epoch;
    this.state = 'starting'; this.sent = Date.now();
    const worker = this.worker = new Worker('workers/segmentation.js');
    worker.onmessage = async ({ data }) => {
      if (epoch !== this.epoch || worker !== this.worker) return;
      if (data.ready) { this.ready = true; this.state = 'ready'; return; }
      if (data.error) { this.fail(); return; }
      try { await this.publish(data); }
      catch { if (epoch === this.epoch && worker === this.worker) this.fail(); }
      finally { if (epoch === this.epoch) this.busy = false; }
    };
    worker.onerror = () => { if (epoch === this.epoch && worker === this.worker) this.fail(); };
    worker.postMessage({ type: 'init' });
  }
  async publish(data) {
    this.ms = data.ms; this.people = data.instances.length;
    // The source pixels travel with their masks. No mask is overlaid on a newer
    // camera frame, even when inference takes longer than a display refresh.
    await this.api.publishSegmentation({ ...data, ...this.metadata, seq: ++this.seq });
  }
  check(now) {
    if (this.worker && (this.busy || !this.ready) && now - this.sent > 15000) this.fail();
  }
  capture(source, now, quality) {
    if (!this.enabled) return;
    this.check(now);
    if (!this.metadata.demo && !this.worker && now >= this.retryAt) {
      try { this.start(); } catch { this.fail(); }
    }
    if (this.busy || (!this.metadata.demo && !this.ready) || now - this.last < [180, 110, 75][quality]) return;
    const width = [384, 512, 640][quality];
    if (this.canvas.width !== width) { this.canvas.width = width; this.canvas.height = width * 9 / 16; }
    this.last = now; this.sent = now; this.busy = true;
    if (this.metadata.demo) {
      this.state = 'synthetic';
      const epoch = this.epoch, start = performance.now();
      const data = afterglowDemo(this.canvas, this.silhouette, start / 1000);
      this.publish({ ...data, at: now, ms: performance.now() - start }).catch(() => {}).finally(() => { if (epoch === this.epoch) this.busy = false; });
    } else {
      this.ctx.drawImage(source, 0, 0, width, this.canvas.height);
      const pixels = this.ctx.getImageData(0, 0, width, this.canvas.height).data;
      this.worker.postMessage({ pixels, width, height: this.canvas.height, at: now, time: performance.now() }, [pixels.buffer]);
    }
  }
}
