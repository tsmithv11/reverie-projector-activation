import { Scene, camera, boxes } from './base.js';
export default class Heat extends Scene {
  render(ctx, { frame, analysis, w, h, time, intensity, demo }) {
    ctx.fillStyle = '#251b40'; ctx.fillRect(0, 0, w, h); camera(ctx, frame, w, h, .95, 'saturate(.55) contrast(1.1)');
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const sources = analysis.boxes.map(b => ({ x: b.x + b.w / 2, y: b.y + b.h * .5, strength: .35, radius: Math.max(b.w * w, b.h * h) * .65 })).concat(analysis.motion.points.slice(0, 22));
    for (let i = 0; i < sources.length; i++) {
      const p = sources[i], x = p.x * w, y = p.y * h, r = p.radius || w * (.045 + p.strength * .04), pulse = .82 + .18 * Math.sin(time * 1.4 + i);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * pulse); g.addColorStop(0, `rgba(239,255,74,${intensity * .76})`); g.addColorStop(.32, `rgba(26,238,170,${intensity * .65})`); g.addColorStop(.65, `rgba(54,117,252,${intensity * .65})`); g.addColorStop(1, 'rgba(230,41,188,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
    ctx.strokeStyle = '#ffc0e344'; ctx.lineWidth = 1;
    for (let y = 0; y < h; y += h / 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    boxes(ctx, analysis.boxes, w, h, '#ffd0ed', !demo);
    ctx.fillStyle = '#271431cc'; ctx.fillRect(w * .67, h * .12, w * .26, h * .125);
    ctx.fillStyle = '#fbd8ef'; ctx.font = `${w * .011}px monospace`; ctx.fillText('SIMULATED HEAT / ARTISTIC FIELD', w * .685, h * .153);
    ctx.fillText(`FRAME MOTION  ${(analysis.motion.amount * 100).toFixed(1)}%`, w * .685, h * .19);
    ctx.fillText(demo ? 'SYNTHETIC CROWD' : `VISIBLE DETECTIONS  ${analysis.boxes.length}`, w * .685, h * .223);
  }
}
