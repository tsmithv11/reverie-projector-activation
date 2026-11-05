import { CAST } from './creature-animation.js';
const TAU=Math.PI*2;

export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const smooth = n => { n = clamp(n); return n * n * n * (10 + n * (-15 + n * 6)); };
const envelope = (p, attack = .2, release = .72) => smooth(p / attack) * (1 - smooth((p - release) / (1 - release)));
const spring = (body, key, target, frequency, dt, damping = 1) => {
  const velocity = key + 'V';
  body[velocity] += ((target - body[key]) * frequency * frequency - 2 * damping * frequency * body[velocity]) * dt;
  body[key] += body[velocity] * dt;
};

export const LIVING_CAST = CAST.filter(s => ['tall','green','jumper'].includes(s.id)).map((s, i) => ({ ...s,
  // The three distinct silhouettes and staging in the supplied reference.
  x: [.15,.78,.39][i], y: [.755,.715,.77][i], height: [.70,.46,.27][i],
  temperament: ['gentle','shy','diver'][i], mass: [1.6,1,.65][i],
  travel: [.018,.065,.07][i], lift: [.014,.025,.19][i],
  frame: s.id === 'green' ? 1 : 0
}));

export class LivingCreature {
  constructor(spec, index, seed = 3817) {
    this.spec = spec; this.index = index; this.seed = (seed + index * 7919) >>> 0;
    this.time = 0; this.phase = this.random() * Math.PI * 2;
    this.breathRate = .9 + this.random() * .6;
    this.x = spec.x; this.xV = 0;
    this.depth = spec.id === 'jumper' ? .36 : spec.id === 'green' ? .025 : 0; this.depthV = 0;
    this.lift = 0; this.liftV = 0; this.lean = 0; this.leanV = 0;
    this.gaze = 0; this.gazeV = 0; this.squash = 0; this.squashV = 0;
    this.gesture = 0; this.gestureV = 0; this.energy = 0; this.energyV = 0;
    this.action = null; this.completed = 0; this.motionHold = 0;
    this.cooldown = .25 + index * .13; this.nextIdle = 1.8 + this.random() * 5 + index * .3;
    this.nextLook = .8 + this.random() * 2; this.look = 0;
    this.nextBlink = .7 + this.random() * 4; this.blinkAge = -1; this.blinkDuration = .2;
    this.blink = 0; this.social = null; this.lastReaction = -10; this.wakeDistance = 0; this.surfaceUntil = 4;
    this.strokePhase=this.phase;this.restX=spec.x;
    for(const [key,value] of Object.entries({head:0,armL:.36,elbowL:-.72,wristL:0,armR:-.34,elbowR:.68,wristR:0,legL:.06,legR:-.06,tail:0,mouth:.3,surprise:0})){
      this[key]=value;this[key+'V']=0;
    }
  }

  random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  notice(x, delay = .3) {
    if (this.time - this.lastReaction < 3 || this.social) return;
    this.social = { x, at: this.time + delay, until: this.time + delay + 1.7 };
    this.lastReaction = this.time;
  }

  begin(kind, power = .5, focus = this.spec.x) {
    const durations = { greet: 3.4, peek: 4.7, swim: 4.1, dive: 4.6, retreat: 3.7, hop: this.spec.id==='jumper'?1.95:1.7, look: 2.9 };
    this.action = { kind, age: 0, duration: durations[kind] * (.85 + this.random() * .3),
      power, focus, startX:this.x, sign: focus >= this.x ? 1 : -1, fromDepth: this.depth, landed: false };
  }

  update(dt, input = {}) {
    const events = [];
    // Small physics steps keep springs and contact events consistent at every
    // quality level, including a dropped render frame or a sudden reversal.
    let remaining = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    while (remaining > 1e-7) { const step = Math.min(remaining, 1 / 120); this.step(step, input, events); remaining -= step; }
    return events;
  }

  step(dt, { moving = false, focus = this.spec.x, strength = 0, intensity = .7 } = {}, events) {
    const s = this.spec;
    this.time += dt; this.cooldown = Math.max(0, this.cooldown - dt);
    moving = moving && intensity > 0;
    this.motionHold = moving ? this.motionHold + dt : Math.max(0, this.motionHold - dt * 2);
    spring(this, 'energy', moving ? clamp(strength * 1.5) * intensity : 0, 3.4, dt);
    this.strokePhase += dt*(1.8+this.energy*3.6);
    if (this.time >= this.nextLook) {
      this.look = this.random() * 2 - 1;
      this.nextLook = this.time + 1.8 + this.random() * 4.2;
    }
    if (this.blinkAge < 0 && this.time >= this.nextBlink) {
      this.blinkAge = 0; this.blinkDuration = .18 + this.random() * .11;
    }
    if (this.blinkAge >= 0) {
      this.blinkAge += dt;
      const p = this.blinkAge / this.blinkDuration;
      this.blink = p < .36 ? smooth(p / .36) : 1 - smooth((p - .36) / .64);
      if (p >= 1) { this.blinkAge = -1; this.blink = 0; this.nextBlink = this.time + (this.random() < .12 ? .22 : 2.3 + this.random() * 5.2); }
    }
    if (this.social && this.time > this.social.until) this.social = null;
    const socialLook = this.social && this.time >= this.social.at;
    const look = moving ? clamp((focus - this.x) * 7, -1, 1) : socialLook ? clamp((this.social.x - this.x) * 6, -1, 1) : this.look;
    spring(this, 'gaze', look, 4.8 / Math.sqrt(s.mass), dt);

    if (!this.action && this.cooldown === 0 && this.motionHold > .16 + this.index * .045) {
      const power = intensity * (.22 + .78 * clamp(strength * 1.8));
      let kind = s.id === 'tall' ? 'greet' : s.id === 'green' ? 'peek' : s.id === 'antenna' ? 'swim' : 'hop';
      if (strength > .58 && ['green', 'antenna'].includes(s.id) && this.random() < .28) kind = 'retreat';
      this.begin(kind, power, focus);
      events.push({ kind: 'notice', x: this.x, power });
    } else if (!this.action && this.time >= this.nextIdle) {
      const choice = this.random();
      const kind = s.id === 'tall' ? (choice < .55 ? 'look' : 'greet')
        : s.id === 'green' ? 'peek'
          : s.id === 'jumper' ? (choice < .45 ? 'dive' : choice < .75 ? 'swim' : 'hop')
            : s.id === 'antenna' ? (choice < .65 ? 'swim' : 'dive')
              : choice < .35 ? 'dive' : choice < .65 ? 'swim' : 'look';
      this.begin(kind, .3 + this.random() * .25, clamp(s.x + (this.random() - .5) * .42,.05,.92));
    }

    let targetX = this.restX + Math.sin(this.time * .43 + this.phase) * s.travel * .04;
    let targetDepth = s.id === 'jumper' ? (this.time > this.surfaceUntil ? 1.12 : .36) : s.id === 'green' ? .025 : 0;
    let targetLift = 0, targetSquash = 0, targetGesture = socialLook ? .16 : 0, targetLean = this.gaze * .025;
    const idleSway=Math.sin(this.time*this.breathRate+this.phase)*.035;
    const joints={head:this.gaze*.18,armL:.36+idleSway,elbowL:-.72-idleSway*.7,wristL:idleSway,armR:-.34+idleSway,elbowR:.68-idleSway*.5,wristR:-idleSway,legL:.06,legR:-.06,
      tail:Math.sin(this.strokePhase*.55)*.06,mouth:.28+(socialLook?.12:0),surprise:0};
    const a = this.action;
    if (a) {
      a.age += dt;
      const p = clamp(a.age / a.duration), env = envelope(p);
      // Only targets change on new input; the body's position and velocity
      // continue through anticipation, a retreat, landing and the next action.
      const aim = moving && !['retreat', 'dive'].includes(a.kind) ? focus : a.focus;
      const travel = clamp((aim - s.x) * 5, -1, 1) * s.travel * (.55 + a.power * .45);
      targetX += travel * env * (a.kind === 'retreat' ? -1 : 1);
      if (a.kind === 'greet') {
        targetGesture = env * a.power; targetLean += Math.sin(p * Math.PI * 2) * .055 * a.power;
        const hello=envelope(p,.22,.76)*(.6+a.power*.4),wave=Math.sin(a.age*7.2)*hello;
        // Wave toward the middle of the bay so the hand stays inside the rim.
        joints.armR-=hello*1.55; joints.elbowR-=hello*1.5+wave*.48;
        joints.wristR=hello*.15+wave*.48;
        joints.armL+=hello*.24;joints.elbowL-=hello*.2;
        joints.head+=Math.sin(a.age*2.8)*hello*.08;joints.mouth+=hello*.42;
      }
      if (a.kind === 'swim') {
        targetX=a.startX+travel*smooth(p/.8);
        targetGesture = env * (.25 + a.power); targetDepth = .36 + .06 * Math.sin(p * Math.PI * 2) * env;
        targetLean += -this.xV * 2.8;
        const paddle=env*(.55+a.power*.4),stroke=Math.sin(this.strokePhase);
        joints.armL+=paddle*(.55+stroke*.85);joints.armR-=paddle*(.55-stroke*.85);
        joints.elbowL+=paddle*(.35-Math.cos(this.strokePhase)*.4);joints.elbowR-=paddle*(.35+Math.cos(this.strokePhase)*.4);
        joints.legL+=paddle*(.18+stroke*.25);joints.legR-=paddle*(.18-stroke*.25);
        joints.wristL=Math.sin(this.strokePhase-.6)*paddle*.32;joints.wristR=-Math.sin(this.strokePhase-.6)*paddle*.32;
        joints.tail+=Math.sin(this.strokePhase-.65)*paddle*.35;joints.head-=targetLean*.7;joints.mouth+=paddle*.25;
      }
      if (a.kind === 'peek') {
        targetDepth = .025 + (.25+a.power*.18) * envelope(p, .2, .35) - .035 * envelope((p - .36) / .64, .35, .7);
        targetX -= .065 * envelope(p, .2, .35);
        targetLean += -.12 * envelope(p, .2, .35) + .09 * envelope((p - .45) / .55);
        const hiding=envelope(p,.2,.38),peeking=envelope((p-.4)/.6,.3,.8);
        joints.armL+=hiding*.65;joints.elbowL+=hiding*1.5;joints.armR-=hiding*.6;joints.elbowR-=hiding*1.2;
        joints.head+=peeking*.26-hiding*.18;joints.mouth-=hiding*.22;joints.surprise=peeking*.2;
      }
      if (a.kind === 'retreat') {
        targetDepth = 1.18 * envelope(p, .19, .48);
        targetLean += .25 * a.sign * envelope(p, .15, .3);
        targetSquash = -.08 * env;
        joints.armL+=env*1.05;joints.elbowL+=env*1.6;joints.armR-=env*.9;joints.elbowR-=env*1.4;
        joints.head-=env*.25;joints.surprise=env*.85;joints.mouth=env*.25;
      }
      if (a.kind === 'dive') {
        // The little diver first surfaces inquisitively, then slips back down.
        targetDepth = s.id === 'jumper' ? .36 + .76 * (1 - envelope(p, .3, .68)) : 1.12 * envelope(p, .25, .55);
        targetLean += Math.sin(p * Math.PI * 2) * .38 * env;
        targetGesture = env * .24;
        joints.armL+=env*.8;joints.armR-=env*.7;joints.elbowL+=env*.45;joints.elbowR-=env*.45;
        joints.head+=Math.sin(p*TAU)*.22*env;joints.tail-=Math.sin(p*TAU)*.25*env;
      }
      if (a.kind === 'hop') {
        const flight = clamp((p - .2) / .53);
        // A single arch with a held anticipation and a soft landing. Spring
        // follow-through supplies inertia without resetting a pose or phase.
        targetLift = 4*flight*(1-flight) * s.lift * a.power;
        targetDepth = a.fromDepth * (1 - smooth((p - .12) / .18)) + .36 * smooth((p-.73)/.27);
        targetSquash = -.14 * envelope(p / .23, .25, .65) + .09 * Math.sin(flight * Math.PI)
          - .12 * envelope((p - .7) / .3, .2, .5);
        targetLean += Math.sin(flight * Math.PI * 2) * .18 * a.sign * a.power;
        targetGesture = Math.sin(flight * Math.PI) * a.power;
        const prepare=envelope(p/.24,.3,.7),air=Math.sin(flight*Math.PI),land=envelope((p-.74)/.26,.22,.5);
        joints.armL+=prepare*.5+air*1.9;joints.armR-=prepare*.4+air*1.7;
        joints.elbowL+=prepare*1.1+air*.4;joints.elbowR-=prepare*.9+air*.3;
        joints.legL+=prepare*.65+air*.9+land*.5;joints.legR-=prepare*.55+air*.7+land*.45;
        joints.head-=prepare*.19;joints.head+=air*.13;joints.tail+=air*.48;
        joints.mouth+=air*.55;joints.surprise=air*.15;
        if (p > .58 && this.lift-this.depth*s.height*1.2 < s.height*.035 && this.liftV < 0 && !a.landed) {
          events.push({ kind: 'land', x: this.x, power: a.power, speed: Math.abs(this.liftV) + a.power * .12 }); a.landed = true;
        }
      }
      if (p >= 1) {
        if (['hop','swim'].includes(a.kind)) this.surfaceUntil = this.time + 3.5 + this.random() * 2;
        if(a.kind==='swim')this.restX=clamp(this.x,s.x-s.travel,s.x+s.travel);
        this.action = null; this.completed++;
        this.cooldown = s.rest * (1 + this.random() * 1.5);
        this.nextIdle = this.time + 3 + this.random() * 7;
      }
    }

    const oldX = this.x, oldDepth = this.depth;
    const mass = Math.sqrt(s.mass);
    spring(this, 'x', clamp(targetX,Math.max(.055,s.x-s.travel),Math.min(.91,s.x+s.travel)), 3.6 / mass, dt);
    spring(this, 'depth', targetDepth, 5.8 / mass, dt);
    spring(this, 'lift', targetLift, 16 / mass, dt, .84);
    spring(this, 'squash', targetSquash, 11 / mass, dt, .7);
    spring(this, 'lean', targetLean, 5 / mass, dt, .78);
    spring(this, 'gesture', targetGesture, 5.5 / mass, dt);
    for(const [key,value] of Object.entries(joints))spring(this,key,value,(key==='head'||key.startsWith('wrist')?7:key==='mouth'||key==='surprise'?8:10)/mass,dt,.88);
    if (oldDepth >= .32 && this.depth < .32) events.push({ kind: 'surface', x: this.x, power: .3, speed: Math.abs(this.depthV) * s.height });
    if (oldDepth <= .45 && this.depth > .45) events.push({ kind: 'dive', x: this.x, power: a?.power || .25, speed: Math.abs(this.depthV) * s.height });
    this.wakeDistance += Math.abs(this.x - oldX);
    if (this.depth < .65 && this.lift < .008 && this.wakeDistance > .005) {
      events.push({ kind: 'wake', x: this.x, power: .15, speed: Math.abs(this.xV), direction: Math.sign(this.xV) }); this.wakeDistance = 0;
    } else if (this.depth > .65 || this.lift >= .008) this.wakeDistance = 0;
  }

  pose() {
    const breath = Math.sin(this.time * this.breathRate + this.phase);
    const bob = Math.sin(this.time * .91 + this.phase) * .002 + Math.sin(this.time * 1.37 + this.phase * 2) * .001;
    return { x: this.x, y: this.spec.y + this.depth * this.spec.height * 1.2 - this.lift + bob,
      depth: this.depth, lift: this.lift, angle: this.lean, gaze: this.gaze, blink: this.blink,
      breath: breath * .014, squash: this.squash, gesture: this.gesture,
      crouch:-this.squash*.34,
      joints:Object.fromEntries(['head','armL','elbowL','wristL','armR','elbowR','wristR','legL','legR','tail','mouth','surprise'].map(key=>[key,this[key]])),
      flutter: Math.sin(this.strokePhase) * (.12 + this.gesture),
      time: this.time, frame: this.spec.frame, visible: this.depth < 1.08, direction: 1 };
  }
}
