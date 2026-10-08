class Scheduler {
  constructor(settings, now = 0) { this.settings = settings; this.active = this.enabled()[0]; this.start = now; this.activation = 0; this.paused = false; this.remaining = settings.duration * 1000; }
  enabled() { return this.settings.scenes.filter(s => s.enabled).map(s => s.id); }
  configure(settings, now) { const remaining = this.left(now); this.settings = settings; if (!this.enabled().includes(this.active)) this.select(this.enabled()[0], now); else { this.remaining = Math.min(remaining, settings.duration * 1000); this.start = now - (settings.duration * 1000 - this.remaining); } }
  left(now) { return Math.max(0, this.paused ? this.remaining : this.settings.duration * 1000 - (now - this.start)); }
  select(id, now) { if (!this.enabled().includes(id)) return false; const changed = this.active !== id; this.active = id; this.activation++; this.start = now; this.remaining = this.settings.duration * 1000; return changed; }
  next(now) { const ids = this.enabled(); return this.select(ids[(ids.indexOf(this.active) + 1) % ids.length], now); }
  pause(now) { this.remaining = this.left(now); this.paused = true; }
  resume(now) { this.start = now - (this.settings.duration * 1000 - this.remaining); this.paused = false; }
  tick(now) { if (!this.paused && this.left(now) <= 0) return this.next(now); return false; }
  until(id, now) { const ids = this.enabled(); if (!ids.includes(id)) return Infinity; if (this.active === id) return 0; if (this.paused) return Infinity; const distance = (ids.indexOf(id) - ids.indexOf(this.active) + ids.length) % ids.length; return this.left(now) + (distance - 1) * this.settings.duration * 1000; }
}
module.exports = { Scheduler };
