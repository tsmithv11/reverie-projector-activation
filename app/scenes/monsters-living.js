import Monsters from './monsters.js';
import { LIVING_CAST, LivingCreature, clamp } from './living-creatures.js';
import { LivingPuppets } from './living-puppets.js';
import { LivingWater } from './living-water.js';

const TAU = Math.PI * 2;
const ROCK = [[.451,.697],[.459,.650],[.474,.590],[.483,.566],[.495,.523],[.514,.493],[.531,.503],[.553,.548],[.571,.596],[.592,.626],[.613,.697],[.613,.716],[.448,.716]];

// The original scene owns the shared asset loader and bubble drawing only.
// Its animation, rendering and original files remain unchanged.
export default class LivingMonsters extends Monsters {
  activate() {
    this.creatures = LIVING_CAST.map((s,i) => new LivingCreature(s,i));
    this.water = new LivingWater(); this.bubbles = []; this.ripples = []; this.splashes = [];
    this.spawn = 0; this.motionHold = 0; this.elapsed = 0; this.activity = 0; this.wasMoving = false;
    this.animationTime = 0; this.quality = 2;
  }

  update({ dt, analysis, intensity = .7, quality = 2 }) {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1); intensity = clamp(Number.isFinite(intensity) ? intensity : .7);
    this.quality = Math.round(clamp(quality,0,2));
    if (this.background && (!this.background.naturalWidth || Object.keys(this.sprites).length < LIVING_CAST.length)) return;
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
    if (this.assetError) throw Error('Living bay character artwork could not load');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (!this.background?.complete || !this.background.naturalWidth) { ctx.fillStyle='#bca1d3'; ctx.fillRect(0,0,w,h); return; }
    this.artwork?.render(ctx,w,h,this.animationTime,.16+this.activity*.45);
    if (!this.artwork) ctx.drawImage(this.background,0,0,w,h);
    this.water.drawWaves(ctx,w,h,this.animationTime);
    if (Object.keys(this.sprites).length < LIVING_CAST.length) return;
    if (!this.puppets) this.puppets = new LivingPuppets(this.sprites);
    const landscapeWidth = w, landscapeHeight = h;
    let ox = 0, oy = 0;
    ctx.save();
    if (foregroundClip) {
      ctx.beginPath(); foregroundClip.forEach((p,i)=>i ? ctx.lineTo(p.x*w,p.y*h) : ctx.moveTo(p.x*w,p.y*h)); ctx.closePath(); ctx.clip();
      ox = Math.min(...foregroundClip.map(p=>p.x))*w; oy = Math.min(...foregroundClip.map(p=>p.y))*h;
      w = Math.max(...foregroundClip.map(p=>p.x))*w-ox; h = Math.max(...foregroundClip.map(p=>p.y))*h-oy;
      ctx.translate(ox,oy);
    }
    // Keep the shy character physically behind the painted rock in both output
    // formats, while its spring motion remains in normalized scene coordinates.
    const placement = c => {
      const p = c.pose();
      if (c.spec.id !== 'green') return p;
      const homeX = (.566*landscapeWidth-ox)/w, homeY = (.712*landscapeHeight-oy)/h;
      return { ...p, x: homeX+p.x-c.spec.x, y: homeY+p.y-c.spec.y, waterline: homeY };
    };
    this.puppets.render(ctx,this.creatures,w,h,placement);
    ctx.save(); ctx.translate(-ox,-oy); ctx.beginPath();
    ROCK.forEach(([x,y],i)=>i ? ctx.lineTo(x*landscapeWidth,y*landscapeHeight) : ctx.moveTo(x*landscapeWidth,y*landscapeHeight));
    ctx.closePath(); ctx.clip(); ctx.drawImage(this.background,0,0,landscapeWidth,landscapeHeight); ctx.restore();
    // Rebase green's ripples by the same offset as its body. The simulation and
    // the rest of the cast do not depend on the output's aspect ratio or rim.
    const green = this.creatures[1], gp = placement(green), dx = gp.x-green.x, dy = gp.waterline-green.spec.y;
    this.water.render(ctx,w,h,effect => effect.id === 'green' ? {x:effect.x+dx,y:effect.y+dy} : effect);
    // A broken meniscus and a soft contact shadow join the painted body to the
    // rolling surface. Both shrink away during takeoff and submersion.
    for (const c of this.creatures) {
      const p = placement(c), contact = clamp(1-p.depth*1.5)*clamp(1-p.lift/.025);
      if (contact<=0) continue;
      const size=c.spec.height*h, y=(p.waterline ?? c.spec.y)*h;
      ctx.save(); ctx.globalAlpha=contact*.14;ctx.fillStyle='#6a6caf';
      ctx.beginPath();ctx.ellipse(p.x*w,y+1,size*.32,h*.004,0,0,TAU);ctx.fill();
      ctx.globalAlpha=contact*.65;ctx.strokeStyle='#ffe7f3';ctx.lineWidth=Math.max(.7,w*.001);ctx.lineCap='round';
      ctx.beginPath();ctx.ellipse(p.x*w,y,size*.32,h*.004,0,.1,Math.PI-.1);ctx.stroke();ctx.restore();
    }
    for (const bubble of this.bubbles) this.drawBubble(ctx,bubble,w,h);
    ctx.restore();
  }

  deactivate() { super.deactivate(); this.water?.cleanup(); }
  cleanup() { this.puppets?.cleanup(); this.puppets=null; super.cleanup(); }
}
