class Scheduler {
  constructor(settings, now = 0) { this.settings = settings; this.unavailable = new Set(); this.active = this.enabled()[0] || null; this.start = now; this.activation = 0; this.paused = false; this.remaining = settings.duration * 1000; }
  enabled(includeUnavailable = false) { return this.settings.scenes.filter(s => s.enabled && (includeUnavailable || !this.unavailable.has(s.id))).map(s => s.id); }
  availability(id, available, now) {
    if (available) this.unavailable.delete(id); else this.unavailable.add(id);
    if (!this.enabled().includes(this.active)) {
      const order = this.enabled(true), index = order.indexOf(this.active);
      const next = [...order.slice(index + 1), ...order.slice(0, index + 1)].find(item => !this.unavailable.has(item));
      this.select(next || null, now);
    }
  }
  configure(settings, now) { const remaining = this.left(now); this.settings = settings; if (!this.enabled().includes(this.active)) this.select(this.enabled()[0] || null, now); else { this.remaining = Math.min(remaining, settings.duration * 1000); this.start = now - (settings.duration * 1000 - this.remaining); } }
  left(now) { return Math.max(0, this.paused ? this.remaining : this.settings.duration * 1000 - (now - this.start)); }
  select(id, now) { if (id !== null && !this.enabled().includes(id)) return false; if (id === null && this.enabled().length) return false; const changed = this.active !== id; this.active = id; this.activation++; this.start = now; this.remaining = this.settings.duration * 1000; return changed; }
  next(now) { const ids = this.enabled(); return this.select(ids[(ids.indexOf(this.active) + 1) % ids.length] || null, now); }
  pause(now) { this.remaining = this.left(now); this.paused = true; }
  resume(now) { this.start = now - (this.settings.duration * 1000 - this.remaining); this.paused = false; }
  tick(now) { if (!this.paused && this.left(now) <= 0) return this.next(now); return false; }
  until(id, now, includeUnavailable = false) { const ids = this.enabled(includeUnavailable); if (!ids.includes(id)) return Infinity; if (this.active === id || this.active === null) return 0; if (this.paused) return Infinity; const distance = (ids.indexOf(id) - ids.indexOf(this.active) + ids.length) % ids.length; return this.left(now) + (distance - 1) * this.settings.duration * 1000; }
}
module.exports = { Scheduler };
