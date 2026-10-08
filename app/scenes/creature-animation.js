const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };

// Each character has a pose sequence and its own action, timing and home range.
// The images keep their shape: only rigid translation/rotation and frame changes.
export const CAST = [
  { id: 'tall', action: 'wave', x: .265, y: .715, height: .55, travel: .022, lift: .014, duration: 2.8, rest: 1.0, delay: 0 },
  { id: 'green', action: 'peek', x: .625, y: .707, height: .33, travel: .025, lift: .055, duration: 2.7, rest: 1.2, delay: .08 },
  { id: 'blue', action: 'bound', x: .795, y: .737, height: .245, travel: .045, lift: .075, duration: 2.1, rest: .65, delay: .12 },
  { id: 'antenna', action: 'paddle', x: .105, y: .827, height: .26, travel: .055, lift: .008, duration: 2.5, rest: .3, delay: .04 },
  { id: 'pink', action: 'skip', x: .658, y: .825, height: .11, travel: .085, lift: .04, duration: 1.8, rest: .55, delay: .18 },
  { id: 'jumper', action: 'leap', x: .40, y: .775, height: .205, travel: .065, lift: .16, duration: 1.7, rest: 1.6, delay: .1 }
];

export class CreatureAnimation {
  constructor(spec, index) {
    this.spec = spec; this.index = index; this.x = spec.x;
    this.direction = 1; this.action = null; this.cooldown = spec.delay;
    this.completed = 0; this.motionHold = 0;
  }

  update(dt, { moving, focus, strength, intensity }) {
    const s = this.spec;
    this.motionHold = moving ? this.motionHold + dt : 0;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.action) {
      // A passing flicker can wake a character, but cannot launch it after
      // the audience has already stopped. Once airborne, finish the landing.
      if (!moving && this.action.age / s.duration < .22) {
        this.action = null; this.cooldown = s.rest;
        return null;
      }
      this.action.age = Math.min(s.duration, this.action.age + dt);
      const progress = this.action.age / s.duration;
      const target = moving ? s.x + clamp((focus - s.x) * 2.2, -1, 1) * s.travel * this.action.power : this.x;
      // Keep following live motion, including a reversal during an action.
      // The opening hold leaves the first pose exactly at its resting position.
      this.x += (target - this.x) * (1 - Math.exp(-dt * 5 * ease(progress / .22)));
      if (progress >= .08 && progress < .22 && Math.abs(target - this.x) > .003) this.direction = target > this.x ? 1 : -1;
      if (progress >= 1) {
        this.action = null; this.cooldown = s.rest; this.completed++;
        return ['bound', 'skip', 'leap'].includes(s.action) ? null : 'land';
      }
      if (progress >= .8 && !this.action.landed && ['bound', 'skip', 'leap'].includes(s.action)) {
        this.action.landed = true;
        return 'land';
      }
    } else if (moving && this.motionHold >= .18 + s.delay && this.cooldown === 0 && intensity > 0) {
      const power = intensity * (.2 + clamp(strength * 2) * .8);
      this.action = { age: 0, power };
      return 'start';
    } else if (!moving) {
      this.x += (s.x - this.x) * (1 - Math.exp(-dt * 1.4));
      if (Math.abs(s.x - this.x) < .0001) this.x = s.x;
    }
    return null;
  }

  pose() {
    const s = this.spec, a = this.action;
    if (!a) return { x: this.x, y: s.y, frame: 0, angle: 0, lift: 0, direction: this.direction, progress: 0 };
    const p = clamp(a.age / s.duration), arch = Math.sin(p * Math.PI) ** 2;
    let lift = 0, angle = 0;
    const hopping = ['leap', 'bound', 'skip'].includes(s.action);
    if (hopping) {
      // Hold, anticipate, take off, land: one smooth arc, with zero vertical
      // velocity at both ends instead of a near-instant jump on activation.
      const flight = clamp((p - .22) / .58);
      lift = Math.sin(flight * Math.PI) ** 2;
      angle = Math.sin(flight * Math.PI * 2) * lift * .12 * this.direction;
    }
    if (s.action === 'peek') { lift = arch; angle = Math.sin(p * Math.PI * 2) * .09 * this.direction; }
    if (s.action === 'paddle') { lift = Math.sin(p * Math.PI * 4) * arch * .5; angle = Math.sin(p * Math.PI * 4) * arch * .035; }
    // A held, readable pose sequence. Actual arms, eyes and head angles change
    // in the images; there is no rubber-sheet deformation or blended ghosting.
    const sequence = [0, 1, 2, 3, 2, 3, 4, 5, 0];
    let frame = sequence[Math.min(8, Math.floor(p * 9))];
    if (hopping) frame = p < .08 ? 0 : p < .22 ? 1 : p < .32 ? 2 : p < .7 ? 3 : p < .84 ? 4 : p < .94 ? 5 : 0;
    const amplitude = a.power;
    return { x: this.x, y: s.y - lift * s.lift * amplitude, frame, angle: angle * amplitude, lift: Math.max(0, lift) * amplitude, direction: this.direction, progress: p };
  }
}
