import { Scene, camera, boxes } from './base.js';
export default class Lines extends Scene {
  initialize() { this.edges = document.createElement('canvas'); this.ctx = this.edges.getContext('2d'); }
  render(ctx, { frame, analysis, w, h, demo }) {
    ctx.fillStyle = '#060b24'; ctx.fillRect(0, 0, w, h); camera(ctx, frame, w, h, .2, 'grayscale(1) contrast(1.8)');
    const m = analysis.motion;
    if (m.edges) { if (this.edges.width !== m.width) { this.edges.width = m.width; this.edges.height = m.height; } this.ctx.putImageData(new ImageData(new Uint8ClampedArray(m.edges), m.width, m.height), 0, 0); ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.drawImage(this.edges, 0, 0, w, h); ctx.restore(); }
    ctx.strokeStyle = '#397ddb55'; ctx.lineWidth = 1;
    for (let i = -10; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(w * .5 + i * w * .015, h * .58); ctx.lineTo(w * .5 + i * w * .14, h); ctx.stroke(); }
    for (let i = 0; i < 9; i++) { const y = h * (.58 + (i / 9) ** 2 * .42); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    boxes(ctx, analysis.boxes, w, h, '#5de6ff', !demo);
  }
  cleanup() { this.edges.width = this.edges.height = 1; }
}
