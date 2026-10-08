# Add a scene

1. Add a module under `app/scenes/`. It receives the existing shared camera and analysis; it must not open another camera.
2. Import its constructor and add it to `registry` in `app/scenes/index.js`.
3. Add `{id,name,color}` to `SCENES` in `app/core/settings.cjs`. The scheduler, persisted-setting reconciliation, playlist and controls automatically include it. Optional: add a tile symbol in `app/operator.js`. Numeric keyboard shortcuts currently cover the first five scenes.
4. Run `npm run build`, try transitions, camera loss, both quality extremes and cleanup, then package again. Do not change the scheduler or capture pipeline.

Example `app/scenes/ripples.js`:

```js
import { Scene, camera } from './base.js';

export default class Ripples extends Scene {
  initialize() { this.rings = []; this.budget = 0; }
  activate() { this.rings.length = 0; this.budget = 0; }
  update({ dt, analysis }) {
    this.budget = Math.min(1, this.budget + dt * 5);
    if (this.budget >= 1 && analysis.motion.points.length && this.rings.length < 32) {
      const p = analysis.motion.points[0];
      this.rings.push({ x: p.x, y: p.y, age: 0 });
      this.budget = 0;
    }
    for (const ring of this.rings) ring.age += dt;
    this.rings = this.rings.filter(ring => ring.age < 2);
  }
  render(ctx, { frame, w, h }) {
    ctx.fillStyle = '#271431'; ctx.fillRect(0, 0, w, h);
    camera(ctx, frame, w, h, 0.6);
    for (const ring of this.rings) {
      ctx.globalAlpha = 1 - ring.age / 2;
      ctx.strokeStyle = '#ffa0d0'; ctx.lineWidth = w * .002;
      ctx.beginPath(); ctx.arc(ring.x * w, ring.y * h, ring.age * w * .08, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  deactivate() { this.rings.length = 0; }
  cleanup() { this.rings.length = 0; }
}
```

Register with `import Ripples from './ripples.js'` and `registry.ripples = Ripples`, plus `{ id: 'ripples', name: 'Ripples in the room', color: '#ffa0d0' }` in SCENES. The shared branding and transition are composed after your scene renders. All scenes use the portal frame; the garden and painted bay are fitted inside it with a pink/lavender surround. The garden uses a camera-free entry wash. Artwork-only scenes must also opt into camera-independent rendering and exclude camera fallbacks in `audience.js`.

Keep all arrays bounded. Use normalized positions; respect the quality/intensity inputs; do not retain camera packets. Dispose images, workers, timers and graphics resources in cleanup if you add any. An exception is isolated, but expensive synchronous work can still stall that renderer until the watchdog replaces it.
