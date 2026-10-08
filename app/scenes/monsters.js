import { Scene } from './base.js';
import { LivingArtwork } from './living-artwork.js';
import { CAST, CreatureAnimation } from './creature-animation.js';
import { CharacterSprites } from './character-sprites.js';

const ART = 'scenes/small-wonderful-things/';
const TAU = Math.PI * 2;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export default class Monsters extends Scene {
  initialize() {
    this.disposed = false; this.images = {}; this.sprites = {};
    this.background = new Image();
    this.background.onload = () => { if (!this.disposed) this.artwork = new LivingArtwork(this.background); };
    this.background.onerror = () => { this.assetError = true; };
    this.background.src = ART + 'bay-empty.png';
    for (const { id } of CAST) {
      const image = this.images[id] = new Image();
      image.onload = () => {
        if (this.disposed) return;
        try { this.sprites[id] = new CharacterSprites(image); } catch { this.assetError = true; }
      };
      image.onerror = () => { this.assetError = true; };
      image.src = ART + id + '-poses.png';
    }
  }

  activate() {
    this.creatures = CAST.map((spec, i) => new CreatureAnimation(spec, i));
    this.bubbles = []; this.ripples = []; this.splashes = [];
    this.spawn = 0; this.motionHold = 0; this.elapsed = 0;
    this.activity = 0; this.animationTime = 0; this.focus = .5;
  }

  update({ dt, analysis, intensity = .7, quality = 2 }) {
    dt = clamp(dt, 0, .1); intensity = clamp(intensity); this.elapsed += dt;
    const points = (analysis?.motion?.points || []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && (p.strength ?? 1) > .045).slice(0, 48);
    this.motionHold = points.length ? this.motionHold + dt : 0;
    const moving = this.motionHold >= .12 && intensity > 0;
    const weight = points.reduce((sum, p) => sum + clamp(p.strength ?? 1), 0);
    const strength = weight / Math.max(1, points.length);
    if (weight) {
      const target = points.reduce((sum, p) => sum + clamp(p.x) * clamp(p.strength ?? 1), 0) / weight;
      this.focus += (target - this.focus) * (1 - Math.exp(-dt * 5));
    }
    const target = moving ? intensity * (.35 + .65 * clamp(strength * 2)) : 0;
    this.activity += (target - this.activity) * (1 - Math.exp(-dt * (target > this.activity ? 4 : 1.5)));
    if (target === 0 && this.activity < .001) this.activity = 0;
    this.animationTime += dt * this.activity;

    for (const creature of this.creatures) {
      const event = creature.update(dt, { moving, focus: this.focus, strength, intensity });
      if (event && creature.spec.action !== 'wave') {
        this.addRipple(creature.x, creature.spec.y, event === 'land' ? .045 : .026);
        if (event === 'land' && ['bound', 'skip', 'leap'].includes(creature.spec.action)) {
          for (let i = 0; i < 7; i++) this.splashes.push({ x: creature.x, y: creature.spec.y, age: 0, vx: (i - 3) * .035, vy: -.14 - Math.random() * .10, r: .0015 + Math.random() * .002 });
        }
      }
    }
    const cap = [16, 24, 32][quality] ?? 24;
    if (moving) {
      this.spawn = Math.min(2, this.spawn + dt * (1 + intensity * 4));
      while (this.spawn >= 1 && this.bubbles.length < cap) {
        this.bubbles.push({ x: .12 + this.focus * .7 + (Math.random() - .5) * .2,
          y: .80 + Math.random() * .08, r: .004 + Math.random() * .006, age: 0, life: 3 + Math.random() * 2,
          speed: .055 + Math.random() * .03, phase: Math.random() * TAU });
        this.spawn--;
      }
    } else this.spawn = 0;
    for (const b of this.bubbles) { b.age += dt; b.y -= dt * b.speed; b.x += Math.sin(this.elapsed + b.phase) * dt * .008; }
    this.bubbles = this.bubbles.filter(b => b.age < b.life).slice(-cap);
    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter(r => r.age < 1.4);
    for (const s of this.splashes) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += .65 * dt; }
    this.splashes = this.splashes.filter(s => s.age < .65).slice(-56);
  }

  addRipple(x, y, radius) { this.ripples.push({ x, y, radius, age: 0 }); this.ripples = this.ripples.slice(-8); }

  render(ctx, { w, h }) {
    if (this.assetError) throw Error('Small wonderful things character artwork could not load');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (!this.background?.complete || !this.background.naturalWidth) {
      ctx.fillStyle = '#bca1d3'; ctx.fillRect(0, 0, w, h); return;
    }
    if (this.artwork) this.artwork.render(ctx, w, h, this.animationTime, this.activity);
    else ctx.drawImage(this.background, 0, 0, w, h);
    for (const creature of this.creatures) {
      this.drawCreature(ctx, creature, w, h);
      if (creature.spec.id === 'green') {
        // Restore the foreground rock over the green character: it can emerge
        // from behind the rock without dragging the rock along with its body.
        ctx.save(); ctx.beginPath();
        const edge = [[.451,.697],[.459,.650],[.474,.590],[.483,.566],[.495,.523],[.514,.493],[.531,.503],[.553,.548],[.571,.596],[.592,.626],[.613,.697],[.613,.716],[.448,.716]];
        edge.forEach(([x,y],i) => i ? ctx.lineTo(x*w,y*h) : ctx.moveTo(x*w,y*h));
        ctx.closePath(); ctx.clip(); ctx.drawImage(this.background, 0, 0, w, h); ctx.restore();
      }
    }
    for (const r of this.ripples) {
      const p = r.age / 1.4;
      ctx.save(); ctx.globalAlpha = (1 - p) * .6; ctx.strokeStyle = '#ffe7f0'; ctx.lineWidth = Math.max(.7, w * .0007);
      ctx.beginPath(); ctx.ellipse(r.x * w, r.y * h, (.012 + p * r.radius) * w, (.002 + p * .01) * h, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.fillStyle = '#e2e8ff';
    for (const s of this.splashes) {
      ctx.globalAlpha = (1 - s.age / .65) * .9;
      ctx.beginPath(); ctx.ellipse(s.x * w, s.y * h, s.r * w, s.r * h * 2.3, -.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
    for (const bubble of this.bubbles) this.drawBubble(ctx, bubble, w, h);
  }

  drawCreature(ctx, creature, w, h) {
    const sprite = this.sprites?.[creature.spec.id]; if (!sprite) return;
    const pose = creature.pose(), s = creature.spec, size = s.height * h;
    const waterline = s.y * h;
    // Keep the actual figure rigid. Animation comes from authored head, arm,
    // eye and leg poses, plus travel across the bay and arcs through the air.
    ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0);
    for (let i = 32; i >= 0; i--) ctx.lineTo(i * w / 32, waterline + Math.sin(i * 2.8 + this.animationTime * 2) * h * .002);
    ctx.closePath(); ctx.clip();
    ctx.translate(pose.x * w, pose.y * h + size * .12 * (1 - pose.lift)); ctx.rotate(pose.angle);
    sprite.draw(ctx, pose.frame, size, pose.direction); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(0, waterline, w, h - waterline); ctx.clip();
    ctx.globalAlpha = .10 * (1 - pose.lift * .8);
    ctx.translate(pose.x * w, waterline); ctx.scale(1, -.22);
    sprite.draw(ctx, pose.frame, size, pose.direction); ctx.restore();
    ctx.save(); ctx.strokeStyle = '#ffe6f0a0'; ctx.lineWidth = Math.max(.65, w * .0007);
    ctx.beginPath(); ctx.ellipse(pose.x * w, waterline, size * .36, h * .005, 0, .1, Math.PI - .1); ctx.stroke();
    if (creature.action && s.action === 'paddle') {
      ctx.globalAlpha = .45; ctx.beginPath();
      ctx.ellipse((pose.x - pose.direction * .035) * w, waterline + h * .005, size * .27, h * .008, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  drawBubble(ctx, bubble, w, h) {
    const x = bubble.x * w, y = bubble.y * h, r = bubble.r * w;
    ctx.save();
    ctx.globalAlpha = Math.min(1, bubble.age * 3, (bubble.life - bubble.age) * 1.5) * .78;
    const fill = ctx.createRadialGradient(x - r * .3, y - r * .35, r * .1, x, y, r);
    fill.addColorStop(0, '#fff2fd04'); fill.addColorStop(.72, '#b9deff0a'); fill.addColorStop(1, '#ffe3fc66');
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(.7, w * .0006);
    ctx.strokeStyle = '#fce9ffb8'; ctx.stroke();
    ctx.strokeStyle = '#fff9f4df'; ctx.lineWidth *= 1.8;
    ctx.beginPath(); ctx.arc(x, y, r * .81, 3.6, 4.8); ctx.stroke();
    ctx.strokeStyle = '#a7dbffb0'; ctx.lineWidth *= .65;
    ctx.beginPath(); ctx.arc(x, y, r * .86, .3, 1.6); ctx.stroke(); ctx.restore();
  }

  deactivate() { this.creatures = []; this.bubbles = []; this.ripples = []; this.splashes = []; this.spawn = 0; this.motionHold = 0; this.activity = 0; this.animationTime = 0; }
  cleanup() {
    this.deactivate(); this.disposed = true; this.artwork?.cleanup(); this.artwork = null;
    for (const image of [this.background, ...Object.values(this.images || {})]) if (image) { image.onload = null; image.onerror = null; image.removeAttribute('src'); }
    this.background = null; this.images = {}; this.sprites = {};
  }
}
