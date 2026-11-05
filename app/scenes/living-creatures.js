import { CAST } from './creature-animation.js';

export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const smooth = n => { n = clamp(n); return n * n * n * (10 + n * (-15 + n * 6)); };
const envelope = (p, attack = .2, release = .72) => smooth(p / attack) * (1 - smooth((p - release) / (1 - release)));
const spring = (body, key, target, frequency, dt, damping = 1) => {
  const velocity = key + 'V';
  body[velocity] += ((target - body[key]) * frequency * frequency - 2 * damping * frequency * body[velocity]) * dt;
  body[key] += body[velocity] * dt;
};

export const LIVING_CAST = CAST.map((s, i) => ({ ...s,
  temperament: ['gentle', 'shy', 'bold', 'curious', 'playful', 'diver'][i],
  mass: [1.6, 1, .85, .75, .48, .65][i],
  // A fixed drawing is articulated continuously; no atlas-frame cycling.
  frame: s.id === 'green' ? 1 : 0
}));

export class LivingCreature {
  constructor(spec, index, seed = 3817) {
    this.spec = spec; this.index = index; this.seed = (seed + index * 7919) >>> 0;
    this.time = 0; this.phase = this.random() * Math.PI * 2;
    this.breathRate = .9 + this.random() * .6;
    this.x = spec.x; this.xV = 0;
    this.depth = spec.id === 'jumper' ? 1.12 : spec.id === 'green' ? .24 : 0; this.depthV = 0;
    this.lift = 0; this.liftV = 0; this.lean = 0; this.leanV = 0;
    this.gaze = 0; this.gazeV = 0; this.squash = 0; this.squashV = 0;
    this.gesture = 0; this.gestureV = 0; this.energy = 0; this.energyV = 0;
    this.action = null; this.completed = 0; this.motionHold = 0;
    this.cooldown = .25 + index * .13; this.nextIdle = 1.8 + this.random() * 5 + index * .3;
    this.nextLook = .8 + this.random() * 2; this.look = 0;
    this.nextBlink = .7 + this.random() * 4; this.blinkAge = -1; this.blinkDuration = .2;
    this.blink = 0; this.social = null; this.lastReaction = -10; this.wakeDistance = 0;
  }

  random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  notice(x, delay = .3) {
    if (this.time - this.lastReaction < 3 || this.social) return;
    this.social = { x, at: this.time + delay, until: this.time + delay + 1.7 };
    this.lastReaction = this.time;
  }

  begin(kind, power = .5, focus = this.spec.x) {
    const durations = { greet: 2.8, peek: 3.8, swim: 3.4, dive: 4.6, retreat: 3.7, hop: 2.2, look: 2.9 };
    this.action = { kind, age: 0, duration: durations[kind] * (.85 + this.random() * .3),
      power, focus, sign: focus >= this.x ? 1 : -1, fromDepth: this.depth, landed: false, surfaced: false, dipped: false };
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
      if (strength > .58 && ['green', 'antenna'].includes(s.id) && this.random() < .6) kind = 'retreat';
      this.begin(kind, power, focus);
      events.push({ kind: 'notice', x: this.x, power });
    } else if (!this.action && this.time >= this.nextIdle) {
      const choice = this.random();
      const kind = s.id === 'tall' ? (choice < .55 ? 'look' : 'greet')
        : s.id === 'green' ? 'peek'
          : s.id === 'jumper' ? 'dive'
            : s.id === 'antenna' ? (choice < .65 ? 'swim' : 'dive')
              : choice < .35 ? 'dive' : choice < .65 ? 'swim' : 'look';
      this.begin(kind, .22 + this.random() * .2, s.x + (this.random() - .5) * .14);
    }

    let targetX = s.x + Math.sin(this.time * .43 + this.phase) * s.travel * .08;
    let targetDepth = s.id === 'jumper' ? 1.12 : s.id === 'green' ? .24 : 0;
    let targetLift = 0, targetSquash = 0, targetGesture = socialLook ? .16 : 0, targetLean = this.gaze * .025;
    const a = this.action;
    if (a) {
      a.age += dt;
      const p = clamp(a.age / a.duration), env = envelope(p);
      // Only targets change on new input; the body's position and velocity
      // continue through anticipation, a retreat, landing and the next action.
      const aim = moving && !['retreat', 'dive'].includes(a.kind) ? focus : a.focus;
      const travel = clamp((aim - s.x) * 3, -1, 1) * s.travel * (.35 + a.power * .65);
      targetX += travel * env * (a.kind === 'retreat' ? -1 : 1);
      if (a.kind === 'greet') {
        targetGesture = env * a.power; targetLean += Math.sin(p * Math.PI * 2) * .055 * a.power;
      }
      if (a.kind === 'swim') {
        targetGesture = env * (.25 + a.power); targetDepth = .08 + .06 * Math.sin(p * Math.PI * 2) * env;
        targetLean += -this.xV * 1.6;
      }
      if (a.kind === 'peek') {
        targetDepth = .24 + .78 * envelope(p, .2, .35) - .32 * envelope((p - .36) / .64, .35, .7);
        targetX -= .045 * envelope(p, .2, .35);
        targetLean += -.12 * envelope(p, .2, .35) + .09 * envelope((p - .45) / .55);
      }
      if (a.kind === 'retreat') {
        targetDepth = 1.18 * envelope(p, .19, .48);
        targetLean += .25 * a.sign * envelope(p, .15, .3);
        targetSquash = -.08 * env;
      }
      if (a.kind === 'dive') {
        // The little diver first surfaces inquisitively, then slips back down.
        targetDepth = s.id === 'jumper' ? 1.12 * (1 - envelope(p, .3, .68)) : 1.12 * envelope(p, .25, .55);
        targetLean += Math.sin(p * Math.PI * 2) * .17 * env;
        targetGesture = env * .24;
      }
      if (a.kind === 'hop') {
        const flight = clamp((p - .2) / .53);
        // A single arch with a held anticipation and a soft landing. Spring
        // follow-through supplies inertia without resetting a pose or phase.
        targetLift = Math.sin(flight * Math.PI) ** 2 * s.lift * a.power;
        targetDepth = a.fromDepth * (1 - smooth((p - .12) / .18));
        targetSquash = -.14 * envelope(p / .23, .25, .65) + .09 * Math.sin(flight * Math.PI)
          - .12 * envelope((p - .7) / .3, .2, .5);
        targetLean += Math.sin(flight * Math.PI * 2) * .18 * a.sign * a.power;
        targetGesture = Math.sin(flight * Math.PI) * a.power;
        if (p > .73 && this.lift < .006 && !a.landed) {
          events.push({ kind: 'land', x: this.x, power: a.power, speed: Math.abs(this.liftV) + a.power * .12 }); a.landed = true;
        }
      }
      if (p >= 1) {
        this.action = null; this.completed++;
        this.cooldown = s.rest * (1 + this.random() * 1.5);
        this.nextIdle = this.time + 3 + this.random() * 7;
      }
    }

    const oldX = this.x, oldDepth = this.depth;
    const mass = Math.sqrt(s.mass);
    spring(this, 'x', targetX, 3.6 / mass, dt);
    spring(this, 'depth', targetDepth, 5.8 / mass, dt);
    spring(this, 'lift', targetLift, 16 / mass, dt, .84);
    spring(this, 'squash', targetSquash, 11 / mass, dt, .7);
    spring(this, 'lean', targetLean, 5 / mass, dt, .78);
    spring(this, 'gesture', targetGesture, 5.5 / mass, dt);
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
      flutter: Math.sin(this.time * (2.4 + this.energy * 3) + this.phase) * (.12 + this.gesture),
      time: this.time, frame: this.spec.frame, visible: this.depth < 1.08, direction: 1 };
  }
}
