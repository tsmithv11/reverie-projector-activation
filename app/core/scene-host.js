export class SceneHost {
  constructor(registry, report = () => {}) { this.registry = registry; this.report = report; this.failed = new Set(); this.active = null; this.id = null; }
  activate(id, context, force = false) {
    if (id === this.id && !force) return;
    if (this.active) { try { this.active.deactivate(); } catch { this.report(this.id, 'deactivate'); } try { this.active.cleanup(); } catch { this.report(this.id, 'cleanup'); } }
    this.active = null; this.id = id;
    if (!id) return;
    if (this.failed.has(id)) return;
    try { this.active = new this.registry[id](); this.active.initialize(context); this.active.activate(context); } catch { this.fail('activate'); }
  }
  fail(phase) { this.failed.add(this.id); this.report(this.id, phase); try { this.active?.deactivate(); } catch {} try { this.active?.cleanup(); } catch {} this.active = null; }
  render(ctx, context) {
    if (!this.active) return false;
    ctx.save();
    try { this.active.update(context); this.active.render(ctx, context); return true; } catch { ctx.reset?.(); this.fail('render'); return false; } finally { ctx.restore(); }
  }
  cleanup() { try { this.active?.deactivate(); } finally { this.active?.cleanup(); this.active = null; } }
}
