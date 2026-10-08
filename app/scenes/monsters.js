import { Scene, camera, monster, PALETTE } from './base.js';
export default class Monsters extends Scene {
  activate() { this.bubbles = []; this.pops = []; this.spawn = 0; this.creatures = Array.from({ length: 7 }, (_, i) => ({ x: .12 + i * .12, y: .55 + Math.sin(i) * .13, color: [PALETTE.lavender, '#8dbaee', '#bbddb9', '#fda3d4'][i % 4] })); }
  update({ dt, analysis, intensity, quality, time }) {
    const cap = [45, 80, 110][quality]; this.spawn += dt * (3 + intensity * 15);
    if (analysis.motion.points.length && this.spawn > 1 && this.bubbles.length < cap) { const p = analysis.motion.points[Math.floor(Math.random() * analysis.motion.points.length)]; this.bubbles.push({ x: p.x, y: p.y, r: .009 + Math.random() * .021, life: 8, phase: Math.random() * 6 }); this.spawn = 0; }
    else this.spawn = Math.min(this.spawn, 2);
    for (const b of this.bubbles) { b.y -= dt * .025; b.x += Math.sin(time + b.phase) * dt * .006; b.life -= dt; }
    for (let i = 0; i < this.creatures.length; i++) {
      const c = this.creatures[i]; let target, best = Infinity;
      for (const b of this.bubbles) { const d = Math.hypot(c.x - b.x, (c.y - b.y) * .65); if (d < best) { target = b; best = d; } }
      if (target) { const f = Math.min(1, dt * .45 / Math.max(.03, best)); c.x += (target.x - c.x) * f; c.y += (target.y - c.y) * f; if (best < .04) { target.life = 0; if (this.pops.length < 28) this.pops.push({ x: target.x, y: target.y, life: .6 }); } }
      else { c.x += Math.sin(time * .3 + i) * dt * .007; c.y += Math.cos(time * .4 + i) * dt * .004; }
      // Gentle separation keeps seven chasers legible when the crowd makes one hot spot.
      for (let j = 0; j < this.creatures.length; j++) if (j !== i) { const other = this.creatures[j], dx = c.x - other.x, dy = c.y - other.y, d = Math.hypot(dx, dy); if (d > .001 && d < .095) { c.x += dx / d * (.095 - d) * dt * 2; c.y += dy / d * (.095 - d) * dt * 2; } }
      c.x = Math.max(.06, Math.min(.94, c.x)); c.y = Math.max(.17, Math.min(.78, c.y));
    }
    this.bubbles = this.bubbles.filter(b => b.life > 0 && b.y > 0).slice(-cap); this.pops = this.pops.filter(p => (p.life -= dt) > 0);
  }
  render(ctx, { frame, analysis, w, h, time }) {
    ctx.fillStyle = '#665292'; ctx.fillRect(0, 0, w, h); camera(ctx, frame, w, h, .6, 'saturate(1.5) contrast(.8) blur(2px)');
    ctx.fillStyle = '#ffa0d035'; ctx.fillRect(0, 0, w, h);
    for (const b of analysis.boxes.slice(0, 12)) monster(ctx, (b.x + b.w * .5) * w, (b.y + b.h * .33) * h, Math.max(w * .019, b.w * w * .37), '#bcb8eb', time + b.x * 8);
    for (const b of this.bubbles) { ctx.save(); ctx.globalAlpha = Math.min(1, b.life); ctx.strokeStyle = '#f2eaff'; ctx.lineWidth = w * .0015; ctx.fillStyle = '#cce9ff33'; ctx.beginPath(); ctx.arc(b.x * w, b.y * h, b.r * w, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#ffffffaa'; ctx.beginPath(); ctx.arc(b.x * w, b.y * h, b.r * w * .72, 3.8, 5); ctx.stroke(); ctx.restore(); }
    this.creatures.forEach((c, i) => monster(ctx, c.x * w, c.y * h, w * (.038 + (i % 2) * .014), c.color, time + i));
    for (const p of this.pops) { ctx.save(); ctx.globalAlpha = p.life / .6; ctx.strokeStyle = '#fff1ac'; ctx.lineWidth = 3; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, r = (1 - p.life) * w * .027; ctx.beginPath(); ctx.moveTo(p.x * w + Math.cos(a) * r, p.y * h + Math.sin(a) * r); ctx.lineTo(p.x * w + Math.cos(a) * (r + 8), p.y * h + Math.sin(a) * (r + 8)); ctx.stroke(); } ctx.restore(); }
  }
  deactivate() { this.bubbles = []; this.pops = []; this.creatures = []; }
  cleanup() { this.deactivate(); }
}
