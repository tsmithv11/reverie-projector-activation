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
    this.rings.push({ id: spec.id, x, y, age: 0, radius: (.022 + energy * .085) * (wake ? .7 : 1),
      life: 2 + energy * 1.5, energy, wake, direction });
    this.rings = this.rings.slice(-36);
    if (!wake && energy > .18) {
      this.crowns.push({ id: spec.id, x, y, age: 0, energy, life: .42 + energy * .2 });
      this.crowns = this.crowns.slice(-8);
      const count = Math.ceil(4 + energy * 7);
      for (let i = 0; i < count; i++) {
        const fan = count > 1 ? i / (count-1) * 2 - 1 : 0;
        this.drops.push({ id: spec.id, x, y, floor: y, age: 0, vx: fan * (.025 + energy * .06),
          vy: -(.07 + energy * .22) * (1 - Math.abs(fan) * .35), r: .0015 + energy * .003,
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

  surface(x, y, time = this.time) {
    const depth=clamp((y-.55)/.45);
    return y+(Math.sin(x*14-time*.85+y*22)*.011
      +Math.sin(x*27+time*.55-y*9)*.0035)*(.12+depth*.88);
  }

  drawWaves(ctx, w, h, time = this.time) {
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    // Small rolling ribbons use the painting's violet shadows and rose light.
    // Their curved silhouettes travel over an unchanged plate, with separate
    // crest and trough shading. There is no sampling or warping of the image.
    for(let row=0;row<18;row++){
      const depth=row/17,y=.61+Math.pow(depth,1.55)*.43;
      for(let k=0;k<8;k++){
        const seed=Math.sin(row*35.1+k*73.7)*437.3,random=seed-Math.floor(seed);
        const x=((k*.151+row*.063+time*(.002+depth*.006))%1.3)-.16;
        const length=.025+depth*.065+random*.035;
        const cy=this.surface(x+length*.5,y,time);
        const rise=(.0015+depth*.0045)*(.7+.3*Math.sin(time*.65+row+k));
        const light=Math.exp(-(((x-.36)/(.10+depth*.2))**2));
        const fill=ctx.createLinearGradient(0,(cy-rise)*h,0,(cy+rise*2)*h);
        fill.addColorStop(0,light>.4?'#ffd7eb58':'#a8aff04c');
        fill.addColorStop(.36,light>.4?'#efa4d63c':'#656ed63c');
        fill.addColorStop(1,'#3443a000');
        ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(x*w,cy*h);
        ctx.bezierCurveTo((x+length*.25)*w,(cy+rise*.4)*h,(x+length*.55)*w,(cy-rise)*h,(x+length*.74)*w,(cy-rise)*h);
        ctx.bezierCurveTo((x+length*.91)*w,(cy-rise)*h,(x+length*.92)*w,cy*h,(x+length)*w,(cy+rise)*h);
        ctx.quadraticCurveTo((x+length*.45)*w,(cy+rise*2.2)*h,x*w,cy*h);ctx.fill();
        ctx.strokeStyle=light>.4?'#ffe9f280':'#e8c3ef58';ctx.lineWidth=Math.max(.5,h*(.0008+depth*.001));
        ctx.beginPath();ctx.moveTo((x+length*.12)*w,cy*h);
        ctx.bezierCurveTo((x+length*.35)*w,cy*h,(x+length*.56)*w,(cy-rise)*h,(x+length*.74)*w,(cy-rise)*h);ctx.stroke();
      }
    }
    ctx.restore();
  }

  contact(ctx, x, y, radius, contact, w, h) {
    if(contact<=0)return;
    const surface=this.surface(x,y),r=radius*(.96+Math.sin(this.time*1.3+x*20)*.04);
    ctx.save();ctx.globalAlpha=contact*.16;ctx.fillStyle='#4b67a3';
    ctx.beginPath();ctx.ellipse(x*w,(surface+.003)*h,r*w,.006*h,0,0,TAU);ctx.fill();
    ctx.lineCap='round';
    for(let ring=0;ring<2;ring++){
      ctx.globalAlpha=contact*(ring?.25:.78);ctx.strokeStyle=ring?'#e5cef3':'#f5e6f5';ctx.lineWidth=Math.max(1,h*(ring?.0015:.0025));
      ctx.beginPath();ctx.ellipse(x*w,(surface+.001)*h,r*w*(1+ring*.23),(.005+ring*.003)*h,0,.08,Math.PI-.08);ctx.stroke();
    }ctx.restore();
  }

  render(ctx, w, h, place = effect => effect) {
    ctx.save(); ctx.lineCap = 'round';
    for (const r of this.rings) {
      const p = r.age/r.life, expansion = 1 - Math.exp(-p*2.6);
      for (let ring = 0; ring < (r.wake ? 1 : 2); ring++) {
        const radius = (.004 + expansion*r.radius) * (1-ring*.28);
        ctx.globalAlpha = Math.sin(Math.min(1,p*9)*Math.PI/2) * (1-p)**2 * (.38 + r.energy*.55) * (ring ? .45 : 1);
        ctx.strokeStyle = ring ? '#a7b8ed' : '#ffe8f2'; ctx.lineWidth = Math.max(1,w*.0015) * (1-p*.45);
        ctx.beginPath();
        const position = place(r), x = position.x - (r.wake ? r.direction * p * .009 : 0);
        ctx.ellipse(x*w,position.y*h,radius*w,radius*h*.23,0,r.wake ? (r.direction > 0 ? Math.PI*.3 : Math.PI*1.3) : 0,r.wake ? (r.direction > 0 ? Math.PI*1.7 : Math.PI*2.7) : TAU);
        ctx.stroke();
      }
    }
    for (const c of this.crowns) {
      const p = c.age/c.life, radius = (.012 + p*.038)*(.4+c.energy), position = place(c);
      const height = Math.sin(p*Math.PI)*.055*c.energy;
      ctx.globalAlpha = (1-p)*.8; ctx.fillStyle = '#e9e6ff'; ctx.beginPath();
      ctx.moveTo((position.x-radius)*w,position.y*h);
      for (let i = 0; i <= 8; i++) {
        const x = position.x-radius+radius*2*i/8;
        ctx.quadraticCurveTo((x-radius*.12)*w,(position.y-height*(i%2 ? .4 : 1))*h,x*w,(position.y-height*(i%2 ? 1 : .2))*h);
      }
      ctx.lineTo((position.x+radius)*w,position.y*h); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#f2edff';
    for (const d of this.drops) {
      ctx.globalAlpha = Math.min(1,d.age*25)*(1-d.age/d.life)*.85;
      const position = place(d);
      ctx.beginPath(); ctx.ellipse(position.x*w,position.y*h,d.r*w,d.r*h*(1.3+Math.abs(d.vy)*4),-d.vx*5,0,TAU); ctx.fill();
    }
    ctx.restore();
  }

  cleanup() { this.rings = []; this.drops = []; this.crowns = []; }
}
