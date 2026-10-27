import { Scene, PALETTE } from './base.js';

const TEXT = 'Reverie 2026';
const rgb = hex => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
const mix = (a, b, t) => a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));
const blue = rgb(PALETTE.blue), purple = rgb(PALETTE.purple);
const stops = [
  [0, mix(purple, blue, .78)], [.2, blue],
  [.62, rgb(PALETTE.pink)], [1, rgb(PALETTE.lavender)]
];
const colors = Array.from({ length: 256 }, (_, i) => {
  const value = i / 255, end = stops.findIndex(stop => stop[0] >= value);
  if (end <= 0) return stops[0][1];
  const [from, a] = stops[end - 1], [to, b] = stops[end];
  return mix(a, b, (value - from) / (to - from));
});

// A bounded, camera-aligned field. Only movement supplies energy; stillness
// releases it smoothly, leaving a short trail without retaining camera frames.
export class WordField {
  constructor(width, height, quality = 1) {
    this.cols = [64, 80, 96][quality] || 80;
    this.rows = Math.max(16, Math.min(96, Math.round(this.cols * height / width)));
    this.aspect = width / height;
    this.energy = new Float32Array(this.cols * this.rows);
    this.target = new Float32Array(this.energy.length);
  }
  update(dt, points = [], intensity = .7) {
    dt = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    intensity = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : .7));
    this.target.fill(0);
    const { cols, rows } = this;
    for (const point of points.slice(0, 48)) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.strength) || point.strength <= 0) continue;
      if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) continue;
      // Camera frame differences are small during an ordinary walk-by. Expand
      // that useful range so gentle movement reaches pink without requiring a wave.
      const strength = Math.min(1, Math.sqrt(Math.min(1, point.strength)) * 3.8 * intensity);
      const rx = .075, ry = rx * this.aspect;
      const left = Math.max(0, Math.floor((point.x - rx) * cols)), right = Math.min(cols - 1, Math.ceil((point.x + rx) * cols));
      const top = Math.max(0, Math.floor((point.y - ry) * rows)), bottom = Math.min(rows - 1, Math.ceil((point.y + ry) * rows));
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        const dx = ((x + .5) / cols - point.x) / rx, dy = ((y + .5) / rows - point.y) / ry;
        const falloff = Math.max(0, 1 - dx * dx - dy * dy);
        const i = y * cols + x;
        this.target[i] = Math.max(this.target[i], strength * falloff * falloff);
      }
    }
    const attack = 1 - Math.exp(-dt / .12), release = 1 - Math.exp(-dt / .95);
    for (let i = 0; i < this.energy.length; i++) {
      const current = this.energy[i], target = this.target[i];
      this.energy[i] += (target - current) * (target > current ? attack : release);
      if (!target && this.energy[i] < .001) this.energy[i] = 0;
    }
  }
  clear() { this.energy.fill(0); this.target.fill(0); }
}

export default class Words extends Scene {
  initialize() {
    this.mask = document.createElement('canvas');
    this.ink = document.createElement('canvas');
    this.color = document.createElement('canvas');
    this.maskCtx = this.mask.getContext('2d');
    this.inkCtx = this.ink.getContext('2d');
    this.colorCtx = this.color.getContext('2d');
    this.layout = '';
  }
  activate() { this.field?.clear(); }
  resize(w, h, quality) {
    const layout = `${w}:${h}:${quality}`;
    if (this.layout === layout) return;
    this.layout = layout;
    this.field = new WordField(w, h, quality);
    this.color.width = this.field.cols; this.color.height = this.field.rows;
    this.pixels = this.colorCtx.createImageData(this.color.width, this.color.height);
    this.mask.width = this.ink.width = w; this.mask.height = this.ink.height = h;
    // Rasterize the precise text only on resize. The moving color field is
    // composited through this crisp mask, so letters never wobble or overlap.
    const ctx = this.maskCtx, fontSize = w / 68;
    ctx.font = `600 ${fontSize}px Arial, sans-serif`;
    ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
    const stepX = ctx.measureText(TEXT).width + fontSize * .78, stepY = fontSize * 1.48;
    for (let row = 0, y = stepY / 2; y < h + stepY; row++, y += stepY) {
      const offset = row % 2 ? -stepX / 2 : fontSize * .3;
      for (let x = offset; x < w; x += stepX) ctx.fillText(TEXT, x, y);
    }
  }
  update({ dt, w, h, quality, intensity, analysis }) {
    this.resize(w, h, quality);
    this.field.update(dt, analysis?.motion?.points || [], intensity);
  }
  render(ctx, { w, h, quality }) {
    this.resize(w, h, quality);
    const { energy, cols, rows } = this.field, data = this.pixels.data;
    for (let i = 0; i < energy.length; i++) {
      // A quiet diagonal wash gives the resting typography depth. It is static:
      // every change in color still comes from the audience's actual movement.
      const rest = .025 + .04 * ((i % cols) / cols + Math.floor(i / cols) / rows) / 2;
      const color = colors[Math.min(255, Math.round((rest + energy[i] * (1 - rest)) * 255))];
      const p = i * 4;
      data[p] = color[0]; data[p + 1] = color[1]; data[p + 2] = color[2]; data[p + 3] = 255;
    }
    this.colorCtx.putImageData(this.pixels, 0, 0);
    const ink = this.inkCtx;
    ink.globalCompositeOperation = 'copy'; ink.drawImage(this.mask, 0, 0);
    ink.globalCompositeOperation = 'source-in';
    ink.imageSmoothingEnabled = true;
    ink.drawImage(this.color, 0, 0, w, h);
    ink.globalCompositeOperation = 'source-over';
    ctx.fillStyle = PALETTE.purple; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(this.ink, 0, 0);
  }
  deactivate() { this.field?.clear(); }
  cleanup() {
    for (const canvas of [this.mask, this.ink, this.color]) if (canvas) canvas.width = canvas.height = 1;
    this.field = null; this.pixels = null; this.layout = '';
  }
}
