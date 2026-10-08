import { Scene, camera, PALETTE } from './base.js';
export default class Garden extends Scene {
  activate() { this.plants = []; this.butterflies = Array.from({ length: 12 }, (_, i) => ({ x: .2 + i * .05, y: .5, alpha: 0 })); this.spawn = 0; }
  update({ dt, analysis, intensity, quality, time }) {
    const cap = [70, 140, 210][quality]; this.spawn += dt * (2 + intensity * 8);
    if (this.spawn > 1 && analysis.motion.points.length && this.plants.length < cap) {
      const p = analysis.motion.points[Math.floor(Math.random() * analysis.motion.points.length)];
      this.plants.push({ x: p.x, y: Math.min(.94, p.y + .12), age: 0, life: 24 + Math.random() * 18, size: .07 + Math.random() * .14, type: Math.floor(Math.random() * 3), phase: Math.random() * 6 }); this.spawn = 0;
    } else this.spawn = Math.min(2, this.spawn);
    for (const p of this.plants) p.age += dt;
    this.plants = this.plants.filter(p => p.age < p.life).slice(-cap);
    this.butterflies.forEach((b, i) => {
      const p = analysis.motion.calm[i % Math.max(1, analysis.motion.calm.length)];
      b.alpha += ((p ? .85 : 0) - b.alpha) * Math.min(1, dt * .8);
      if (p) { b.x += (p.x + Math.sin(time * .7 + i) * .04 - b.x) * Math.min(1, dt * .6); b.y += (p.y + Math.cos(time * .9 + i) * .04 - b.y) * Math.min(1, dt * .6); }
    });
  }
  render(ctx, { frame, w, h, time }) {
    ctx.fillStyle = '#271431'; ctx.fillRect(0, 0, w, h); camera(ctx, frame, w, h, .52, 'saturate(.6) contrast(.9)');
    const glow = ctx.createLinearGradient(0, 0, w, h); glow.addColorStop(0, '#ffa0d020'); glow.addColorStop(1, '#4d65ff28'); ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    for (const p of this.plants) {
      const growth = Math.min(1, p.age / 3), alpha = Math.min(1, (p.life - p.age) / 7), size = p.size * h * growth;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(p.x * w, p.y * h); const sway = Math.sin(time * .8 + p.phase) * size * .13;
      ctx.strokeStyle = '#b8d8ae'; ctx.lineWidth = w * .002; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-size * .25, -size * .35, size * .25, -size * .6, sway, -size); ctx.stroke();
      for (let i = 1; i <= 3; i++) { const side = i % 2 ? -1 : 1; ctx.save(); ctx.translate(sway * i / 4, -size * i / 4); ctx.rotate(side * .7); ctx.fillStyle = i % 2 ? '#b8d8ae' : '#E7D2F6'; ctx.beginPath(); ctx.ellipse(side * size * .12, -size * .055, size * .16, size * .055, side * .3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      ctx.translate(sway, -size);
      if (p.type === 0) { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.fillStyle = PALETTE.pink; ctx.beginPath(); ctx.ellipse(Math.cos(a) * size * .11, Math.sin(a) * size * .11, size * .105, size * .065, a, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = PALETTE.orange; ctx.beginPath(); ctx.arc(0, 0, size * .055, 0, Math.PI * 2); ctx.fill(); }
      else if (p.type === 1) { ctx.fillStyle = PALETTE.lavender; ctx.fillRect(-size * .035, -size * .08, size * .07, size * .16); ctx.fillStyle = '#ffa0d0'; ctx.beginPath(); ctx.ellipse(0, -size * .06, size * .22, size * .16, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff0e9'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * size * .09, -size * .12, size * .025, 0, Math.PI * 2); ctx.fill(); } }
      ctx.restore();
    }
    this.butterflies.forEach((b, i) => { ctx.save(); ctx.globalAlpha = b.alpha; ctx.translate(b.x * w, b.y * h); ctx.rotate(Math.sin(time + i) * .3); const flap = .3 + Math.abs(Math.sin(time * 8 + i)) * .7, s = w * .01; ctx.fillStyle = i % 2 ? PALETTE.pink : PALETTE.lavender; for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * s * flap, 0, s * flap, s * 1.4, side * .4, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#483064'; ctx.fillRect(-1, -s, 2, s * 2); ctx.restore(); });
  }
  deactivate() { this.plants = []; this.butterflies = []; }
  cleanup() { this.deactivate(); }
}
