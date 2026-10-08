import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { outputLayout, OutputPlacement } = require('../app/core/output-placement.cjs');

const primary = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 825 } };
const external = { id: 2, bounds: { x: 1440, y: 0, width: 1920, height: 1080 }, workArea: { x: 1440, y: 25, width: 1920, height: 1055 } };
function layout(displays = [primary, external], settings = {}) {
  return outputLayout({ getAllDisplays: () => displays, getPrimaryDisplay: () => primary }, { displayId: '', fullscreen: true, ...settings });
}

class Window extends EventEmitter {
  constructor() { super(); this.bounds = { x: 0, y: 0, width: 1280, height: 800 }; this.fullscreen = false; this.visible = false; this.destroyed = false; this.pending = null; this.calls = []; }
  isDestroyed() { return this.destroyed; }
  isFullScreen() { return this.fullscreen; }
  isVisible() { return this.visible; }
  isMinimized() { return false; }
  getBounds() { return this.bounds; }
  setBounds(bounds) { assert.equal(this.pending, null, 'must finish the full-screen transition before moving'); assert.equal(this.fullscreen, false, 'must leave full screen before moving'); this.bounds = { ...bounds }; this.calls.push(['bounds', this.bounds]); this.onBounds?.(); }
  showInactive() { this.visible = true; this.calls.push(['show']); }
  setFullScreen(value) { assert.equal(this.pending, null, 'native transitions must not overlap'); assert.notEqual(value, this.fullscreen, 'no redundant native transitions'); this.pending = value; this.calls.push(['fullscreen', value]); this.onTransition?.(); }
  finish() { assert.notEqual(this.pending, null); const value = this.pending; this.pending = null; this.fullscreen = value; this.emit(value ? 'enter-full-screen' : 'leave-full-screen'); }
}
function opened() { const win = new Window(), output = new OutputPlacement(win); output.place(layout(), { show: true }); win.finish(); win.calls = []; return { win, output }; }

test('repeated display notifications during and after entry do not cycle full screen', () => {
  const win = new Window(), output = new OutputPlacement(win);
  output.place(layout(), { show: true });
  for (let i = 0; i < 100; i++) output.place(layout());
  assert.deepEqual(win.calls.map(c => c[0]), ['bounds', 'show', 'fullscreen']);
  win.finish(); win.calls = [];
  for (let i = 0; i < 100; i++) output.place(layout());
  output.place(layout(), { show: true });
  assert.deepEqual(win.calls, []);
});

test('Dock and menu-bar work-area notifications do not disturb external output', () => {
  const { win, output } = opened();
  for (let i = 0; i < 40; i++) output.place(layout([{ ...primary, workArea: { ...primary.bounds } }, { ...external, workArea: i % 2 ? external.bounds : external.workArea }]));
  assert.deepEqual(win.calls, []);
});

test('display removal waits for native exit before moving to windowed preview', () => {
  const { win, output } = opened();
  output.place(layout([primary]));
  assert.deepEqual(win.calls, [['fullscreen', false]]);
  output.place(layout([primary]));
  win.finish();
  assert.equal(win.fullscreen, false); assert.equal(win.visible, true);
  assert.deepEqual(win.bounds, layout([primary]).bounds);
  assert.equal(win.calls.filter(c => c[0] === 'fullscreen').length, 1);
  output.place(layout()); win.finish();
  assert.deepEqual(win.bounds, external.bounds); assert.equal(win.fullscreen, true);
});

test('hot unplug during entry settles before applying the latest display layout', () => {
  const win = new Window(), output = new OutputPlacement(win);
  output.place(layout(), { show: true });
  output.place(layout([primary]));
  assert.equal(win.pending, true);
  win.finish(); assert.equal(win.pending, false);
  win.finish(); assert.deepEqual(win.bounds, layout([primary]).bounds); assert.equal(win.pending, null);
});

test('display switching coalesces requests and moves only after native exit', () => {
  const { win, output } = opened();
  const third = { ...external, id: 3, bounds: { x: -1920, y: 0, width: 1920, height: 1080 } };
  output.place(layout([primary, external, third], { displayId: '1' }));
  output.place(layout([primary, external, third], { displayId: '3' }));
  assert.deepEqual(win.calls, [['fullscreen', false]]);
  win.finish(); assert.deepEqual(win.bounds, third.bounds); assert.equal(win.pending, true);
  win.finish(); assert.equal(win.calls.filter(c => c[0] === 'bounds').length, 1);
});

test('changed monitor bounds are applied once despite reentrant metric notifications', () => {
  const { win, output } = opened();
  const changed = layout([primary, { ...external, bounds: { x: 1440, y: 0, width: 1280, height: 720 } }]);
  win.onBounds = () => output.place(changed);
  win.onTransition = () => output.place(changed);
  output.place(changed); win.finish(); win.finish();
  output.place(changed);
  assert.deepEqual(win.calls.map(c => c[0]), ['fullscreen', 'bounds', 'fullscreen']);
  assert.deepEqual(win.bounds, changed.bounds);
});

test('full-screen toggle stays windowed through metrics, reopen, and geometry changes', () => {
  const { win, output } = opened();
  output.toggleFullscreen(); win.finish(); win.calls = [];
  output.place(layout()); output.place(layout(), { show: true });
  assert.deepEqual(win.calls, []);
  output.place(layout([primary, { ...external, bounds: { ...external.bounds, x: -1920 } }]));
  assert.deepEqual(win.calls.map(c => c[0]), ['bounds']); assert.equal(win.fullscreen, false);
});

test('rapid full-screen toggles queue the final intent without overlapping transitions', () => {
  const { win, output } = opened();
  output.toggleFullscreen(); output.toggleFullscreen();
  assert.deepEqual(win.calls, [['fullscreen', false]]);
  win.finish(); assert.equal(win.pending, true); win.finish();
  assert.equal(win.fullscreen, true); assert.equal(win.pending, null);
});

test('native exit and single-display manual full screen survive repeated placement', () => {
  const { win, output } = opened();
  win.fullscreen = false; win.emit('leave-full-screen'); output.place(layout());
  assert.deepEqual(win.calls, []);
  output.place(layout([primary])); output.toggleFullscreen(); win.finish(); win.calls = [];
  output.place(layout([primary])); assert.deepEqual(win.calls, []);
});

test('automatic full-screen setting and explicit primary display are honored', () => {
  const { win, output } = opened();
  output.place(layout(undefined, { fullscreen: false })); win.finish();
  output.place(layout(undefined, { fullscreen: true })); win.finish();
  output.place(layout(undefined, { displayId: '1' })); win.finish(); win.finish();
  assert.deepEqual(win.bounds, primary.bounds); assert.equal(win.fullscreen, true);
  output.place(layout(undefined, { displayId: 'missing' })); win.finish();
  assert.deepEqual(win.bounds, layout([primary]).bounds); assert.equal(win.fullscreen, false);
});

test('hidden output stays hidden until explicitly reopened, including during transitions', () => {
  const win = new Window(), output = new OutputPlacement(win);
  output.place(layout(), { show: true }); output.hide(); win.visible = false;
  output.place(layout([primary])); win.finish(); win.calls = [];
  output.place(layout([primary])); assert.deepEqual(win.calls, []);
  output.place(layout([primary]), { show: true }); win.finish();
  assert.equal(win.visible, true); assert.equal(win.fullscreen, false);
  assert.deepEqual(win.bounds, layout([primary]).bounds);
});

test('synchronous full-screen completion also settles without recursion or repeated calls', () => {
  const win = new Window(), output = new OutputPlacement(win);
  win.onTransition = () => win.finish();
  output.place(layout(), { show: true }); output.place(layout()); output.place(layout([primary]));
  assert.equal(win.fullscreen, false); assert.equal(win.pending, null);
  assert.deepEqual(win.calls.map(c => c[0]), ['bounds', 'show', 'fullscreen', 'fullscreen', 'bounds']);
});

test('shutdown or destroyed windows cancel pending placement', () => {
  for (const destroy of [false, true]) {
    const { win, output } = opened(); output.place(layout([primary]));
    if (destroy) { win.destroyed = true; win.emit('closed'); } else output.dispose();
    win.calls = []; win.finish(); output.place(layout(), { show: true });
    assert.deepEqual(win.calls, []);
  }
});
