const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };

// Each character has a pose sequence and its own action, timing and home range.
// The images keep their shape: only rigid translation/rotation and frame changes.
export const CAST = [
  { id: 'tall', action: 'wave', x: .265, y: .715, height: .55, travel: .022, lift: .014, duration: 2.8, rest: 1.0, delay: 0 },
  { id: 'green', action: 'peek', x: .625, y: .707, height: .33, travel: .025, lift: .055, duration: 2.7, rest: 1.2, delay: .3 },
  { id: 'blue', action: 'bound', x: .795, y: .737, height: .245, travel: .045, lift: .075, duration: 2.1, rest: .65, delay: .55 },
  { id: 'antenna', action: 'paddle', x: .105, y: .827, height: .26, travel: .055, lift: .008, duration: 2.5, rest: .3, delay: .15 },
  { id: 'pink', action: 'skip', x: .658, y: .825, height: .11, travel: .085, lift: .04, duration: 1.8, rest: .55, delay: .75 },
  { id: 'jumper', action: 'leap', x: .40, y: .775, height: .205, travel: .065, lift: .16, duration: 1.7, rest: 1.6, delay: .4 }
];

export class CreatureAnimation {
  constructor(spec, index) {
    this.spec = spec; this.index = index; this.x = spec.x;
    this.direction = 1; this.action = null; this.cooldown = spec.delay;
    this.completed = 0;
  }

  update(dt, { moving, focus, strength, intensity }) {
    const s = this.spec;
    if (moving || this.completed > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.action) {
      this.action.age = Math.min(s.duration, this.action.age + dt);
      const progress = this.action.age / s.duration;
      this.x = this.action.from + (this.action.to - this.action.from) * ease(progress);
      if (progress >= 1) {
        this.action = null; this.cooldown = s.rest; this.completed++;
        return 'land';
      }
    } else if (moving && this.cooldown === 0 && intensity > 0) {
      const power = intensity * (.55 + clamp(strength * 2) * .45);
      // Follow the location of passing motion within each character's own lane.
      const toward = clamp((focus - s.x) * 2.2, -1, 1);
      let to = s.x + toward * s.travel;
      if (this.completed > 0 && Math.abs(to - this.x) < s.travel * .25) to = s.x - toward * s.travel * .45;
      this.direction = (to - this.x >= 0 ? 1 : -1);
      this.action = { age: 0, from: this.x, to, power };
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
    const p = clamp(a.age / s.duration), arch = Math.sin(p * Math.PI);
    let lift = 0, angle = 0;
    if (s.action === 'leap') { lift = Math.pow(arch, .8); angle = Math.sin(p * Math.PI * 2) * .18 * this.direction; }
    if (s.action === 'bound' || s.action === 'skip') { lift = Math.abs(Math.sin(p * Math.PI * 2)); angle = Math.sin(p * Math.PI * 4) * .09 * this.direction; }
    if (s.action === 'peek') { lift = arch; angle = Math.sin(p * Math.PI * 2) * .09 * this.direction; }
    if (s.action === 'paddle') { lift = Math.sin(p * Math.PI * 4) * .5; angle = Math.sin(p * Math.PI * 4) * .035; }
    // A held, readable pose sequence. Actual arms, eyes and head angles change
    // in the images; there is no rubber-sheet deformation or blended ghosting.
    const sequence = s.action === 'leap' ? [0, 1, 2, 3, 3, 3, 4, 5, 0] : [0, 1, 2, 3, 2, 3, 4, 5, 0];
    let frame = sequence[Math.min(8, Math.floor(p * 9))];
    if (s.action === 'bound' || s.action === 'skip') frame = p > .96 ? 0 : [1, 2, 3, 3, 4, 5][Math.min(5, Math.floor((p * 2 % 1) * 6))];
    return { x: this.x, y: s.y - lift * s.lift * (.65 + a.power * .35), frame, angle, lift: Math.max(0, lift), direction: this.direction, progress: p };
  }
}
