import { clamp } from './living-creatures.js';
const TAU = Math.PI * 2;

export class LivingWater {
  constructor() { this.rings = []; this.drops = []; this.crowns = []; this.time = 0; }

  disturb({ kind, x, power = .2, speed = 0, direction = 1 }, spec, y = spec.y) {
    if (kind === 'notice') return;
    // Radius, lifetime and splash energy follow displaced character volume and
    // contact speed. Slow swims leave wakes; large fast landings throw droplets.
    const mass = Math.sqrt(spec.height / .26);
    const energy = clamp((speed * 2.4 + power * .35) * mass, .06, 1);
    const wake = kind === 'wake';
    this.rings.push({ x, y, age: 0, radius: (.015 + energy * .055) * (wake ? .6 : 1),
      life: 1.6 + energy * 1.4, energy, wake, direction });
    this.rings = this.rings.slice(-36);
    if (!wake && energy > .18) {
      this.crowns.push({ x, y, age: 0, energy, life: .42 + energy * .2 });
      this.crowns = this.crowns.slice(-8);
      const count = Math.ceil(4 + energy * 7);
      for (let i = 0; i < count; i++) {
        const fan = count > 1 ? i / (count-1) * 2 - 1 : 0;
        this.drops.push({ x, y, floor: y, age: 0, vx: fan * (.025 + energy * .06),
          vy: -(.05 + energy * .16) * (1 - Math.abs(fan) * .35), r: .001 + energy * .002,
          life: .45 + energy * .45 });
      }
      this.drops = this.drops.slice(-72);
    }
  }

  update(dt, quality = 2) {
    this.time += dt;
    for (const r of this.rings) r.age += dt;
    for (const c of this.crowns) c.age += dt;
    for (const d of this.drops) { d.age += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += .48 * dt; }
    this.rings = this.rings.filter(r => r.age < r.life).slice(-[18,28,36][quality]);
    this.crowns = this.crowns.filter(c => c.age < c.life);
    this.drops = this.drops.filter(d => d.age < d.life && d.y <= d.floor + .002).slice(-[24,48,72][quality]);
  }

  drawWaves(ctx, w, h, time) {
    // Also supplies a moving water surface when WebGL is unavailable. Broken,
    // low-contrast crests follow the painted bay's perspective and palette.
    ctx.save(); ctx.lineCap = 'round';
    for (let row = 0; row < 9; row++) {
      const y = .69 + row * .032, phase = time * (.45 + row * .027) + row * 2.37;
      for (let col = 0; col < 4; col++) {
        const x = .025 + col * .225 + Math.sin(phase * .31 + col * 2) * .018;
        if ((x > .42 && x < .64 && y < .74) || x > .91 - (y - .7) * .8) continue;
        ctx.globalAlpha = .045 + (1 + Math.sin(phase + col)) * .035;
        ctx.strokeStyle = row % 2 ? '#ffcee7' : '#e0e9ff'; ctx.lineWidth = .7 + row * .07;
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const px = x + i / 16 * (.045 + row * .004);
          const py = y + Math.sin(i / 16 * Math.PI + phase + col) * .0023;
          i ? ctx.lineTo(px*w,py*h) : ctx.moveTo(px*w,py*h);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  render(ctx, w, h) {
    ctx.save(); ctx.lineCap = 'round';
    for (const r of this.rings) {
      const p = r.age/r.life, expansion = 1 - Math.exp(-p*2.6);
      for (let ring = 0; ring < (r.wake ? 1 : 2); ring++) {
        const radius = (.004 + expansion*r.radius) * (1-ring*.28);
        ctx.globalAlpha = Math.sin(Math.min(1,p*9)*Math.PI/2) * (1-p)**2 * (.24 + r.energy*.5) * (ring ? .45 : 1);
        ctx.strokeStyle = ring ? '#a7b8ed' : '#ffe8f2'; ctx.lineWidth = Math.max(.65,w*.00085) * (1-p*.45);
        ctx.beginPath();
        const x = r.x - (r.wake ? r.direction * p * .009 : 0);
        ctx.ellipse(x*w,r.y*h,radius*w,radius*h*.23,0,r.wake ? (r.direction > 0 ? Math.PI*.3 : Math.PI*1.3) : 0,r.wake ? (r.direction > 0 ? Math.PI*1.7 : Math.PI*2.7) : TAU);
        ctx.stroke();
      }
    }
    for (const c of this.crowns) {
      const p = c.age/c.life, radius = (.008 + p*.026)*(.4+c.energy);
      const height = Math.sin(p*Math.PI)*.022*c.energy;
      ctx.globalAlpha = (1-p)*.56; ctx.fillStyle = '#e9e6ff'; ctx.beginPath();
      ctx.moveTo((c.x-radius)*w,c.y*h);
      for (let i = 0; i <= 8; i++) {
        const x = c.x-radius+radius*2*i/8;
        ctx.quadraticCurveTo((x-radius*.12)*w,(c.y-height*(i%2 ? .4 : 1))*h,x*w,(c.y-height*(i%2 ? 1 : .2))*h);
      }
      ctx.lineTo((c.x+radius)*w,c.y*h); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#f2edff';
    for (const d of this.drops) {
      ctx.globalAlpha = Math.min(1,d.age*25)*(1-d.age/d.life)*.85;
      ctx.beginPath(); ctx.ellipse(d.x*w,d.y*h,d.r*w,d.r*h*(1.3+Math.abs(d.vy)*4),-d.vx*5,0,TAU); ctx.fill();
    }
    ctx.restore();
  }

  cleanup() { this.rings = []; this.drops = []; this.crowns = []; }
}
