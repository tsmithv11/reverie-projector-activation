import { Scene, camera } from './base.js';
export default class Robots extends Scene {
  activate(context) {
    this.still = document.createElement('canvas'); this.still.width = context.w; this.still.height = context.h;
    const ctx = this.still.getContext('2d');
    if (context.robotImage) { camera(ctx, context.robotImage, context.w, context.h); this.generated = true; return; }
    this.generated = false;
    ctx.fillStyle = '#302b50'; ctx.fillRect(0, 0, context.w, context.h); camera(ctx, context.frame, context.w, context.h, .95, 'saturate(.35) contrast(1.1)');
    for (const b of context.analysis.boxes) {
      const x = (b.x + b.w / 2) * context.w, y = b.y * context.h, w = b.w * context.w * .8, h = b.h * context.h;
      ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#f1f0ee'; ctx.lineCap = 'round'; ctx.lineWidth = w * .19;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * w * .29, h * .4); ctx.lineTo(s * w * .6, h * .62); ctx.lineTo(s * w * .55, h * .8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * w * .23, h * .7); ctx.lineTo(s * w * .25, h * .97); ctx.stroke();
        ctx.fillStyle = '#383746'; ctx.beginPath(); ctx.arc(s * w * .58, h * .63, w * .12, 0, Math.PI * 2); ctx.fill();
      }
      const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, '#9697ac'); g.addColorStop(.4, '#f8f9f3'); g.addColorStop(1, '#c5c7d4'); ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(-w * .39, h * .29, w * .78, h * .42, w * .16); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-w * .3, h * .025, w * .6, h * .24, w * .18); ctx.fill();
      ctx.fillStyle = '#303342'; ctx.beginPath(); ctx.roundRect(-w * .23, h * .1, w * .46, h * .055, w * .03); ctx.fill();
      ctx.fillStyle = '#74e9f0'; ctx.fillRect(-w * .14, h * .116, w * .28, h * .014); ctx.beginPath(); ctx.arc(0, h * .42, w * .065, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  render(ctx, { w, h }) { camera(ctx, this.still, w, h); ctx.fillStyle = '#efdbf6'; ctx.font = `${w * .011}px monospace`; ctx.fillText(this.generated ? 'LUCY 2.5 / GENERATED STILL' : 'LOCAL ROBOT STUDY / STILL', w * .065, h * .15); }
  deactivate() { if (this.still) { this.still.width = this.still.height = 1; this.still = null; } }
  cleanup() { this.deactivate(); }
}
