function sameBounds(a, b) { return !!a && !!b && ['x', 'y', 'width', 'height'].every(key => a[key] === b[key]); }
function sameDisplay(a, b) { return !!a && !!b && a.displayId === b.displayId && a.preview === b.preview; }

function outputLayout(screen, settings) {
  const all = screen.getAllDisplays(), primary = screen.getPrimaryDisplay();
  const display = all.find(d => String(d.id) === settings.displayId) || (!settings.displayId ? all.find(d => d.id !== primary.id) : null);
  return {
    displayId: String((display || primary).id), preview: !display,
    fullscreen: !!display && settings.fullscreen,
    bounds: display ? { ...display.bounds } : { x: primary.workArea.x + 60, y: primary.workArea.y + 60, width: Math.min(1280, primary.workArea.width - 80), height: Math.min(720, primary.workArea.height - 80) }
  };
}

class OutputPlacement {
  constructor(win) {
    this.win = win;
    this.layout = null;
    this.placed = null;
    this.override = null;
    this.transition = null;
    this.showPending = false;
    this.suspended = false;
    this.disposed = false;
    this.applying = false;
    this.enter = () => this.settled(true);
    this.leave = () => this.settled(false);
    win.on('enter-full-screen', this.enter);
    win.on('leave-full-screen', this.leave);
    win.once('closed', () => this.dispose());
  }

  place(layout, { show = false } = {}) {
    // Geometry notifications must not undo F / the full-screen button. A new
    // output or a changed automatic-full-screen setting starts a new choice.
    if (!sameDisplay(this.layout, layout) || this.layout.fullscreen !== layout.fullscreen) this.override = null;
    this.layout = { ...layout, bounds: { ...layout.bounds } };
    if (show) { this.suspended = false; this.showPending = true; }
    this.reconcile();
  }

  toggleFullscreen() {
    if (!this.layout) return;
    this.override = !(this.override ?? this.layout.fullscreen);
    this.suspended = false; this.showPending = true;
    this.reconcile();
  }

  hide() { this.suspended = true; this.showPending = false; }

  settled(fullscreen) {
    // Native Escape / window controls are choices too. Do not re-enter full
    // screen in response to the work-area notifications that they generate.
    if (this.transition === null) this.override = fullscreen;
    this.transition = null;
    this.reconcile();
  }

  setFullscreen(fullscreen) {
    // Set the guard before the native call: some platforms emit synchronously.
    this.transition = fullscreen;
    this.win.setFullScreen(fullscreen);
  }

  reconcile() {
    if (this.disposed || this.suspended || this.applying || !this.layout || this.win.isDestroyed() || this.transition !== null) return;
    this.applying = true;
    try {
      const layout = this.layout, fullscreen = this.override ?? layout.fullscreen;
      const move = !sameDisplay(this.placed, layout) || !sameBounds(this.placed?.bounds, layout.bounds);
      // macOS full-screen transitions are asynchronous. Moving must wait for
      // leave-full-screen; repeated requests only update the latest layout.
      if (this.win.isFullScreen() && (move || !fullscreen)) { this.setFullscreen(false); return; }
      if (move) {
        // Compare requested placements, not transient OS full-screen bounds.
        this.placed = layout;
        if (!sameBounds(this.win.getBounds(), layout.bounds)) this.win.setBounds(layout.bounds);
      }
      if (this.showPending) {
        this.showPending = false;
        if (this.win.isMinimized()) this.win.restore();
        if (!this.win.isVisible()) this.win.showInactive();
      }
      if (this.win.isFullScreen() !== fullscreen) this.setFullscreen(fullscreen);
    } finally {
      this.applying = false;
      // A synchronous completion or reentrant screen event may have queued a
      // new layout. Continue only when native transition work has completed.
      if (!this.disposed && !this.suspended && !this.win.isDestroyed() && this.transition === null &&
          (!sameDisplay(this.placed, this.layout) || !sameBounds(this.placed?.bounds, this.layout.bounds) ||
           this.showPending || this.win.isFullScreen() !== (this.override ?? this.layout.fullscreen))) {
        this.reconcile();
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.win.removeListener('enter-full-screen', this.enter);
    this.win.removeListener('leave-full-screen', this.leave);
  }
}

module.exports = { outputLayout, OutputPlacement };
