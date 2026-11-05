import { Scene, camera } from './base.js';
import { coverRect } from '../core/display.js';
import { REVERIE_PALETTE } from '../core/composition.js';

export default class Afterglow extends Scene {
  initialize() {
    this.fill = document.createElement('canvas'); this.fillCtx = this.fill.getContext('2d');
    this.seq = -1; this.paths = []; this.sample = null;
  }
  update({ analysis }) {
    const sample = analysis.segmentation;
    if (!sample) { this.sample = null; this.paths = []; this.seq = -1; return; }
    if (sample.seq === this.seq) return;
    this.sample = sample; this.seq = sample.seq;
    this.fill.width = sample.width; this.fill.height = sample.height;
    this.fillCtx.putImageData(new ImageData(new Uint8ClampedArray(sample.fill), sample.width, sample.height), 0, 0);
    this.paths = sample.instances.map(person => {
      const path = new Path2D(), c = person.contour;
      for (let i = 0; i < c.length; i += 4) { path.moveTo(c[i], c[i + 1]); path.lineTo(c[i + 2], c[i + 3]); }
      return { ...person, path };
    });
  }
  render(ctx, { frame, w, h, intensity = .7, demo, visionState }) {
    ctx.fillStyle = REVERIE_PALETTE.deep; ctx.fillRect(0, 0, w, h);
    camera(ctx, frame, w, h, .76, 'saturate(0.28) contrast(1.08)');
    ctx.fillStyle = '#24152F30'; ctx.fillRect(0, 0, w, h);
    if (this.sample && frame) {
      const rect = coverRect(this.sample.width, this.sample.height, w, h), scale = rect.width / this.sample.width;
      ctx.save(); ctx.translate(rect.x, rect.y); ctx.scale(scale, scale);
      ctx.globalAlpha = .2 + intensity * .18; ctx.drawImage(this.fill, 0, 0); ctx.globalAlpha = 1;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const person of this.paths) {
        ctx.strokeStyle = person.color; ctx.shadowColor = person.color;
        ctx.shadowBlur = (5 + intensity * 7) * w / 1280; ctx.lineWidth = 2.2 * w / 1280 / scale;
        ctx.globalAlpha = .9; ctx.stroke(person.path);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.strokeStyle = '#fff1fb';
        ctx.lineWidth = .65 * w / 1280 / scale; ctx.stroke(person.path);
      }
      ctx.restore();
      for (const person of this.paths) {
        const x = rect.x + person.x * rect.width, y = Math.max(h * .24, rect.y + person.top * rect.height - h * .022);
        ctx.save(); ctx.font = `500 ${Math.max(10, w * .009)}px monospace`; ctx.textAlign = 'center';
        ctx.shadowColor = '#24152F'; ctx.shadowBlur = 5; ctx.fillStyle = person.color;
        ctx.fillText(`ID ${String(person.id).padStart(2, '0')}`, x, y); ctx.restore();
      }
    }
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#E7D2F6';
    ctx.font = `500 ${Math.max(10, w * .0095)}px monospace`;
    ctx.shadowColor = '#24152F'; ctx.shadowBlur = 4;
    const status = demo ? 'SYNTHETIC MASK REHEARSAL' : visionState === 'unavailable' ? 'SEGMENTATION UNAVAILABLE · RETRYING' : !frame ? 'WAITING FOR CAMERA' : !this.sample ? 'LOADING SEGMENTATION' : !this.paths.length ? 'WAITING FOR PEOPLE' : `${String(this.paths.length).padStart(2, '0')} PEOPLE TRACKED`;
    ctx.fillText(status, w * .5, h * .20);
    ctx.restore();
  }
  cleanup() { this.fill.width = this.fill.height = 1; this.paths = []; this.sample = null; }
}
