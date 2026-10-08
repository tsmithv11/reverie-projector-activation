import { Scene } from './base.js';
import { GardenArtwork, drawStem, drawBud } from './garden-artwork.js';

const TAU = Math.PI * 2;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };
const valid = p => Number.isFinite(p.x) && Number.isFinite(p.y);
const FLOWERS = [[0, 0, 530, 538], [530, 0, 488, 538], [1018, 0, 518, 538]];
const BUTTERFLIES = [[0, 540, 530, 484], [530, 540, 488, 484], [1018, 540, 518, 484]];

export default class Garden extends Scene {
  initialize() {
    this.artwork = new GardenArtwork();
    this.atlas = new Image();
    this.atlas.src = 'scenes/garden/botanical-atlas.png';
    // Missing art keeps the procedural garden alive; it never reveals a camera.
  }

  activate() {
    this.plants = []; this.spawn = 0; this.elapsed = 0; this.motionHold = 0; this.activity = 0;
    this.butterflies = Array.from({ length: 12 }, (_, i) => ({
      x: .12 + i * .068, y: .75, alpha: 0, phase: i * 2.39996,
      scale: .026 + (i % 4) * .004, type: i % 3, angle: 0
    }));
  }

  update({ dt, analysis, intensity = .7, quality = 2 }) {
    dt = clamp(dt, 0, .1); intensity = clamp(intensity);
    this.elapsed += dt;
    const points = (analysis?.motion?.points || []).filter(p => valid(p) && (p.strength ?? 1) > .045).slice(0, 48);
    const calm = (analysis?.motion?.calm || []).filter(p => valid(p) && !points.some(m => Math.hypot(m.x - p.x, m.y - p.y) < .18)).slice(0, 24);
    const cap = [48, 80, 112][quality] ?? 80;
    this.motionHold = points.length ? this.motionHold + dt : 0;

    if (this.motionHold >= .12 && intensity > 0) {
      this.spawn = Math.min(2, this.spawn + dt * (1.5 + intensity * 4.5));
      while (this.spawn >= 1 && this.plants.length < cap) {
        const p = points[Math.floor(Math.random() * points.length)];
        const depth = Math.random();
        this.plants.push({
          x: clamp(.065 + p.x * .87 + (Math.random() - .5) * .1, .035, .965),
          y: .86 + depth * .17, age: 0, life: 30 + Math.random() * 16,
          height: .18 + (1 - clamp(p.y)) * .36 + Math.random() * .12,
          size: .068 + Math.random() * .075 + depth * .022,
          lean: (Math.random() - .5) * .32, phase: Math.random() * TAU,
          type: Math.floor(Math.random() * 3), depth
        });
        this.spawn--;
      }
    } else this.spawn = 0;
    for (const p of this.plants) p.age += dt;
    this.plants = this.plants.filter(p => p.age < p.life).slice(-cap);

    this.butterflies.forEach((b, i) => {
      const p = calm.length && intensity > 0 ? calm[(i * 7) % calm.length] : null;
      const targetAlpha = p ? .7 + intensity * .3 : 0;
      b.alpha += (targetAlpha - b.alpha) * (1 - Math.exp(-dt * (p ? .65 : 1.4)));
      const t = this.elapsed, phase = b.phase;
      if (p) {
        const tx = clamp(.08 + p.x * .84 + Math.sin(t * .34 + phase) * .12, .055, .945);
        const ty = clamp(.19 + p.y * .42 + Math.cos(t * .43 + phase) * .085, .17, .77);
        b.x += (tx - b.x) * (1 - Math.exp(-dt * .7));
        b.y += (ty - b.y) * (1 - Math.exp(-dt * .7));
        b.angle = Math.sin(t * .43 + phase) * .45;
      } else if (b.alpha > .002) { b.y -= dt * .025; b.x += Math.sin(phase + t) * dt * .018; }
    });
    const active = this.plants.length > 0 || this.butterflies.some(b => b.alpha > .05);
    this.activity += ((active ? 1 : 0) - this.activity) * (1 - Math.exp(-dt * .7));
  }

  render(ctx, { w, h, quality = 2 }) {
    const t = this.elapsed;
    this.artwork?.render(ctx, w, h, t, quality);
    if (!this.artwork) { ctx.fillStyle = '#090d17'; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const ready = this.atlas?.complete && this.atlas.naturalWidth;

    // Every stem is rooted in the meadow, not in the audience's camera plane.
    for (const p of [...this.plants].sort((a, b) => a.depth - b.depth)) {
      const growth = ease(p.age / 3.6), bloom = ease((p.age - .9) / 3);
      const alpha = ease((p.life - p.age) / 9) * (.62 + p.depth * .38);
      const height = p.height * h * growth;
      const sway = Math.sin(t * .55 + p.phase) * .032 + p.lean;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.translate(p.x * w, p.y * h);
      drawStem(ctx, height, sway, p.age, p.type, this.artwork?.leaves);
      ctx.translate(sway * height, -height);
      if (bloom < .8) drawBud(ctx, h * .006 * (.6 + growth), p.type, 1 - bloom);
      if (bloom > 0) {
        ctx.rotate(p.lean * .5 + Math.sin(t * .25 + p.phase) * .045);
        const size = p.size * h * (.15 + bloom * .85);
        ctx.scale(.45 + .55 * bloom, 1);
        ctx.globalAlpha = alpha * bloom;
        if (ready) ctx.drawImage(this.atlas, ...FLOWERS[p.type], -size / 2, -size / 2, size, size);
        else this.artwork?.drawFlower(ctx, size, p.type);
      }
      ctx.restore();
    }

    this.artwork?.pollen(ctx, w, h, t, quality, this.activity);
    if (ready) this.butterflies.forEach(b => {
      if (b.alpha < .003) return;
      const [sx, sy, sw, sh] = BUTTERFLIES[b.type];
      const size = b.scale * w, phase = b.phase, flutter = t * (6.3 + b.type * .8) + phase;
      ctx.save(); ctx.globalAlpha = b.alpha;
      ctx.translate((b.x + Math.sin(t * 1.6 + phase) * .006) * w, (b.y + Math.cos(t * 1.9 + phase) * .008) * h);
      ctx.rotate(b.angle);
      // Separate wing planes fold around the body; each insect has its own phase.
      for (const side of [-1, 1]) {
        const opening = .16 + .84 * Math.abs(Math.cos(flutter + side * .12));
        ctx.save(); ctx.scale(opening, 1);
        ctx.drawImage(this.atlas, sx + (side > 0 ? sw / 2 : 0), sy, sw / 2, sh,
          side < 0 ? -size / 2 : 0, -size * sh / sw / 2, size / 2, size * sh / sw);
        ctx.restore();
      }
      ctx.fillStyle = '#eed6b5'; ctx.beginPath(); ctx.ellipse(0, 0, Math.max(.7, size * .014), size * .15, 0, 0, TAU); ctx.fill();
      ctx.restore();
    });

  }

  deactivate() { this.plants = []; this.butterflies = []; this.spawn = 0; this.motionHold = 0; }
  cleanup() {
    this.deactivate(); this.artwork?.cleanup(); this.artwork = null;
    if (this.atlas) this.atlas.removeAttribute('src');
    this.atlas = null;
  }
}
