import Monsters from './monsters.js';
import { LIVING_CAST, LivingCreature, clamp } from './living-creatures.js';
import { LivingPuppets } from './living-puppets.js';
import { LivingWater } from './living-water.js';
import { LivingBay } from './living-bay.js';

const TAU = Math.PI * 2;
// Preserve the reference painting and established motion-positioned bubbles.
// Connected full-body artwork is animated independently of the original scene.
export default class LivingMonsters extends Monsters {
  initialize() {
    this.disposed=false;this.images={};this.sprites={};
    const names=['surround','interior','rock','tall','green','jumper'];
    let loaded=0;
    for(const name of names){
      const image=this.images[name]=new Image();
      image.onload=()=>{if(!this.disposed&&++loaded===names.length){this.artwork=new LivingBay(this.images);this.puppets=new LivingPuppets(this.images);}};
      image.onerror=()=>{this.assetError=true;};
      image.src='scenes/small-wonderful-things/reference-v4/'+name+'.png';
    }
  }
  activate() {
    this.creatures = LIVING_CAST.map((s,i) => new LivingCreature(s,i));
    this.water = new LivingWater(); this.bubbles = []; this.ripples = []; this.splashes = [];
    this.spawn = 0; this.motionHold = 0; this.elapsed = 0; this.activity = 0; this.wasMoving = false;
    this.animationTime = 0; this.quality = 2;
  }

  update({ dt, analysis, intensity = .7, quality = 2 }) {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1); intensity = clamp(Number.isFinite(intensity) ? intensity : .7);
    this.quality = Math.round(clamp(Number.isFinite(quality)?quality:2,0,2));
    this.elapsed += dt; this.animationTime += dt;
    const points = (analysis?.motion?.points || []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.strength ?? 1) && (p.strength ?? 1) > .045).slice(0,48);
    this.motionHold = points.length ? this.motionHold + dt : 0;
    const moving = this.motionHold >= .12 && intensity > 0;
    const weight = points.reduce((sum,p) => sum+clamp(p.strength ?? 1),0), strength = weight / Math.max(1,points.length);
    const target = moving ? intensity * clamp(strength*2) : 0;
    this.activity += (target-this.activity)*(1-Math.exp(-dt*(target>this.activity ? 3.8 : 1.5)));
    this.water.update(dt,this.quality);
    for (const c of this.creatures) {
      let influence = 0, focus = 0, localStrength = 0;
      for (const p of points) {
        const near = clamp(1-Math.abs(clamp(p.x)-c.x)/.27), amount = near*clamp(p.strength ?? 1);
        influence += amount; focus += clamp(p.x)*amount; localStrength = Math.max(localStrength,amount);
      }
      const events = c.update(dt, { moving: moving && localStrength>.035, focus: influence ? focus/influence : c.x, strength: localStrength, intensity });
      for (const event of events) {
        if (event.kind === 'notice' || ['land','surface'].includes(event.kind)) {
          // Neighbors notice a real action after a short, individual delay.
          // Looking does not emit a new event, so reactions cannot cascade.
          for (const other of this.creatures) if (other !== c && Math.abs(other.x-c.x)<.34) other.notice(c.x,.25+other.index*.09);
        }
        this.water.disturb(event,c.spec);
      }
    }
    // Retain the original motion-positioned iridescent bubbles and 120 ms gate.
    const cap = [16,24,32][this.quality];
    if (moving) {
      if (!this.wasMoving) this.spawn = 1+Math.ceil(intensity*2);
      this.spawn = Math.min(3,this.spawn+dt*intensity*(5+clamp(strength*2)*9));
      while (this.spawn>=1) {
        if (this.bubbles.length>=cap) this.bubbles.shift();
        let pick = Math.random()*weight;
        const source = points.find(p => (pick-=clamp(p.strength ?? 1))<=0) || points[points.length-1];
        this.bubbles.push({ x: clamp(source.x+(Math.random()-.5)*.03,.035,.965), y: clamp(source.y+(Math.random()-.5)*.03,.08,.92),
          r:.013+Math.random()*.014,age:0,life:2.8+Math.random()*1.6,speed:.065+Math.random()*.025,phase:Math.random()*TAU });
        this.spawn--;
      }
    } else this.spawn = 0;
    this.wasMoving = moving;
    for (const b of this.bubbles) { b.age+=dt; b.y-=dt*b.speed; b.x+=Math.sin(this.elapsed+b.phase)*dt*.008; }
    this.bubbles = this.bubbles.filter(b=>b.age<b.life).slice(-cap);
    this.ripples = this.water.rings; this.splashes = this.water.drops;
  }

  render(ctx, { w, h, foregroundClip }) {
    if(this.assetError)throw Error('Living world reference artwork could not load');
    if(!this.artwork||!this.puppets){ctx.fillStyle='#d8b2da';ctx.fillRect(0,0,w,h);return;}
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    this.artwork.render(ctx,w,h);
    ctx.save();
    if(foregroundClip){
      ctx.beginPath();foregroundClip.forEach((p,i)=>i?ctx.lineTo(p.x*w,p.y*h):ctx.moveTo(p.x*w,p.y*h));ctx.closePath();ctx.clip();
      const ox=Math.min(...foregroundClip.map(p=>p.x))*w,oy=Math.min(...foregroundClip.map(p=>p.y))*h;
      w=Math.max(...foregroundClip.map(p=>p.x))*w-ox;h=Math.max(...foregroundClip.map(p=>p.y))*h-oy;
      ctx.translate(ox,oy);
    }
    this.artwork.interior(ctx,w,h);
    ctx.save();this.artwork.waterClip(ctx,w,h);this.water.drawWaves(ctx,w,h,this.animationTime);ctx.restore();
    const surface=(x,y)=>this.water.surface(x,y);
    this.puppets.render(ctx,this.creatures,w,h,c=>c.pose(),surface);
    this.artwork.rock(ctx,w,h);
    this.puppets.render(ctx,this.creatures,w,h,c=>c.pose(),surface,true);
    this.water.render(ctx,w,h,effect=>({x:effect.x,y:surface(effect.x,effect.y)}));
    for(const c of this.creatures){
      const p=c.pose(),contact=clamp(1-p.depth*1.5)*clamp(1-p.lift/.025);
      this.water.contact(ctx,p.x,c.spec.y,c.spec.height*h*.22/w,contact,w,h);
    }
    this.water.contact(ctx,.65,.757,.105,.7,w,h);
    for(const bubble of this.bubbles)this.drawBubble(ctx,bubble,w,h);
    ctx.restore();
  }

  deactivate() { super.deactivate(); this.water?.cleanup(); }
  cleanup() { this.puppets?.cleanup(); this.puppets=null; super.cleanup(); }
}
