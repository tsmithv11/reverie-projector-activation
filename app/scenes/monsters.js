import { Scene } from './base.js';
import { LivingArtwork } from './living-artwork.js';

const ART = 'scenes/small-wonderful-things/';
const TAU = Math.PI * 2;
const JUMP_SECONDS = 1.35;
const HOME = { x: .391, y: .727 };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export default class Monsters extends Scene {
  initialize() {
    this.disposed = false;
    this.background = new Image(); this.jumper = new Image();
    this.background.onload = () => { if (!this.disposed) this.artwork = new LivingArtwork(this.background); };
    this.background.onerror = () => { this.assetError = true; };
    this.jumper.onerror = () => { this.assetError = true; };
    this.background.src = ART + 'bay.png'; this.jumper.src = ART + 'jumper.png';
  }

  activate() {
    this.bubbles = []; this.ripples = []; this.spawn = 0; this.motionHold = 0;
    this.jump = null; this.cooldown = 0; this.elapsed = 0;
  }

  update({ dt, analysis, intensity = .7, quality = 2 }) {
    dt = clamp(dt, 0, .1); intensity = clamp(intensity, 0, 1);
    this.elapsed += dt;
    const cap = [36, 64, 90][quality] ?? 64;
    const points = (analysis?.motion?.points || []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && (p.strength ?? 1) > .045);
    const moving = points.length > 0;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.motionHold = moving ? this.motionHold + dt : 0;

    if (this.jump) {
      this.jump.age += dt;
      if (this.jump.age >= JUMP_SECONDS) {
        this.jump = null;
        this.cooldown = 1.6;
        this.addRipple(HOME.x, HOME.y, .045);
      }
    }
    // Brief noise cannot trigger a hop. Continuing motion can trigger another
    // only after landing and a rest, and stillness never schedules a new hop.
    if (!this.jump && this.cooldown === 0 && this.motionHold >= .12 && intensity > 0) {
      this.jump = { age: 0, height: .02 + intensity * .025 };
      this.addRipple(HOME.x, HOME.y, .032);
    }

    if (moving && intensity > 0) {
      this.spawn = Math.min(3, this.spawn + dt * (4 + intensity * 12));
      while (this.spawn >= 1 && this.bubbles.length < cap) {
        const point = points[Math.floor(Math.random() * points.length)];
        this.bubbles.push({
          x: clamp(.09 + point.x * .76 + (Math.random() - .5) * .025, .06, .9),
          y: .73 + clamp(point.y, 0, 1) * .15,
          r: .006 + Math.random() * .012, age: 0, life: 4 + Math.random() * 3,
          speed: .045 + Math.random() * .032, phase: Math.random() * TAU
        });
        this.spawn--;
      }
    } else this.spawn = 0;
    for (const bubble of this.bubbles) {
      bubble.age += dt; bubble.y -= dt * bubble.speed;
      bubble.x += Math.sin(this.elapsed * 1.1 + bubble.phase) * dt * .007;
    }
    this.bubbles = this.bubbles.filter(b => b.age < b.life && b.y > -.04).slice(-cap);
    for (const ripple of this.ripples) ripple.age += dt;
    this.ripples = this.ripples.filter(r => r.age < 1.4);
  }

  addRipple(x, y, radius) {
    this.ripples.push({ x, y, radius, age: 0 });
    this.ripples = this.ripples.slice(-8);
  }

  jumperPose() {
    const progress = this.jump ? clamp(this.jump.age / JUMP_SECONDS, 0, 1) : 0;
    const lift = this.jump ? Math.sin(progress * Math.PI) : 0;
    return {
      x: HOME.x, y: HOME.y - lift * (this.jump?.height || 0) + Math.sin(this.elapsed * 1.5) * .0013,
      tilt: this.jump ? Math.sin(progress * TAU) * .12 : Math.sin(this.elapsed * .8) * .018,
      stretch: 1 + lift * .04, lift
    };
  }

  render(ctx, { w, h }) {
    if (this.assetError) throw Error('Small wonderful things artwork could not load');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (!this.background?.complete || !this.background.naturalWidth) {
      const sky = ctx.createLinearGradient(0, 0, w, h);
      sky.addColorStop(0, '#f6b1cf'); sky.addColorStop(1, '#8b82c6');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h); return;
    }
    if (this.artwork) this.artwork.render(ctx, w, h, this.elapsed);
    else ctx.drawImage(this.background, 0, 0, w, h);
    this.drawJumper(ctx, w, h);
    for (const ripple of this.ripples) {
      const progress = ripple.age / 1.4;
      ctx.save(); ctx.globalAlpha = (1 - progress) * .5;
      ctx.lineWidth = Math.max(1, w * .0007); ctx.strokeStyle = '#ffdfef';
      ctx.beginPath(); ctx.ellipse(ripple.x * w, ripple.y * h, (.014 + progress * ripple.radius) * w, (.003 + progress * .008) * h, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
    for (const bubble of this.bubbles) this.drawBubble(ctx, bubble, w, h);
  }

  drawJumper(ctx, w, h) {
    if (!this.jumper?.complete || !this.jumper.naturalWidth) return;
    const pose = this.jumperPose(), sh = h * .17, sw = sh * this.jumper.naturalWidth / this.jumper.naturalHeight;
    // The same creature rests partly submerged, then clears the surface to hop.
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, HOME.y * h); ctx.clip();
    ctx.translate(pose.x * w, pose.y * h + h * .068 * (1 - pose.lift));
    ctx.rotate(pose.tilt); ctx.scale(1, pose.stretch);
    ctx.drawImage(this.jumper, -sw / 2, -sh, sw, sh); ctx.restore();
    // A faint reflected silhouette anchors it to the water even at the apex.
    ctx.save(); ctx.globalAlpha = .10 * (1 - pose.lift * .65);
    ctx.translate(HOME.x * w, HOME.y * h); ctx.scale(1, -.28);
    ctx.drawImage(this.jumper, -sw / 2, -sh, sw, sh); ctx.restore();
    ctx.save(); ctx.strokeStyle = '#ffe8ee90'; ctx.lineWidth = w * .00065;
    ctx.beginPath(); ctx.ellipse(HOME.x * w, HOME.y * h, w * (.023 + pose.lift * .01), h * .0045, 0, 0, TAU); ctx.stroke(); ctx.restore();
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

  deactivate() { this.bubbles = []; this.ripples = []; this.jump = null; this.spawn = 0; this.motionHold = 0; }
  cleanup() {
    this.deactivate(); this.disposed = true;
    this.artwork?.cleanup(); this.artwork = null;
    for (const image of [this.background, this.jumper]) if (image) { image.onload = null; image.onerror = null; image.removeAttribute('src'); }
    this.background = this.jumper = null;
  }
}
