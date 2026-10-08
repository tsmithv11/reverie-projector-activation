import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

const mainURL = new URL('../app/main.cjs', import.meta.url);
const require = createRequire(mainURL), source = readFileSync(mainURL, 'utf8');

// Exercise the actual main-process IPC, scheduler and cleanup under a virtual
// clock. No provider, camera, credentials or Electron process is used here.
async function installation(saved = {}, keys = { fal: 'fake-key' }) {
  let now = 1e9, seq = 0, timerId = 0;
  const windows = [], timers = new Map(), handlers = new Map(), files = new Map();
  const ipcMain = new EventEmitter();
  ipcMain.handle = (name, fn) => handlers.set(name, fn);
  files.set('settings.json', JSON.stringify(saved));
  const app = new EventEmitter();
  Object.assign(app, { isPackaged: false, setPath() {}, getAppPath: () => '/test', requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() { app.emit('before-quit', { preventDefault() {} }); } });
  const display = { id: 1, size: { width: 1280, height: 720 } }, screen = new EventEmitter();
  screen.getAllDisplays = () => [display]; screen.getPrimaryDisplay = () => display;
  class Window extends EventEmitter {
    constructor() {
      super(); this.destroyed = false; this.visible = false; this.messages = [];
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, { setWindowOpenHandler() {}, isCrashed: () => false, send: (name, data) => this.messages.push({ name, data }) });
      windows.push(this);
    }
    loadURL(url) { this.role = new URL(url).pathname.slice(1, -5); queueMicrotask(() => this.emit('ready-to-show')); }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; }
  }
  const electron = { app, BrowserWindow: Window, ipcMain, screen,
    protocol: { registerSchemesAsPrivileged() {}, handle() {} }, net: {},
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
    powerSaveBlocker: { start() {} }, shell: {} };
  const fakeFS = { mkdirSync() {}, readFileSync(p) { const data = files.get(p.split('/').at(-1)); if (!data) throw Error('Missing file'); return data; },
    writeFileSync(p, data) { files.set(p.split('/').at(-1), data); }, renameSync(a, b) { files.set(b.split('/').at(-1), files.get(a.split('/').at(-1))); }, existsSync: () => false, appendFileSync() {} };
  const timeout = (fn, ms, repeat = false) => { const id = ++timerId; timers.set(id, { fn, at: now + ms, ms, repeat }); return id; };
  const context = vm.createContext({
    require(name) {
      if (name === 'electron') return electron;
      if (name === 'node:fs') return fakeFS;
      if (name === 'node:perf_hooks') return { performance: { now: () => now } };
      if (name === './core/credentials.cjs') return { readKeys: () => keys };
      if (name === './core/output-placement.cjs') return { outputLayout: () => ({}), OutputPlacement: class { constructor(win) { this.win = win; } place(_, options) { if (options?.show) this.win.show(); } dispose() {} hide() {} } };
      return require(name);
    },
    process: { env: { REVERIE_TEST_DIR: '/test' }, argv: [] }, __dirname: '/test/app',
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    console: { warn() {} }, setTimeout: timeout, clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => timeout(fn, ms, true)
  });
  vm.runInContext(`(function() { ${source}\n})();`, context);
  await Promise.resolve(); await Promise.resolve();
  const windowFor = role => windows.findLast(w => w.role === role && !w.destroyed);
  const event = role => ({ sender: windowFor(role).webContents, senderFrame: { url: `reverie://app/${role}.html` } });
  const call = (role, name, ...args) => handlers.get(name)(event(role), ...args);
  const emit = (role, name, data) => ipcMain.emit(name, event(role), data);
  const state = () => call('operator', 'state');
  const pixels = new Uint8ClampedArray(960 * 540 * 4);
  function feed(video = true) {
    emit('engine', 'camera-status', { state: 'live' });
    emit('audience', 'render-status', { fps: 30 });
    call('engine', 'publish-frame', { width: 1, height: 1, pixels: new Uint8ClampedArray(4), seq: ++seq, at: now });
    if (video && state().cloud.streaming) {
      const job = call('robot', 'robot-job');
      call('robot', 'robot-publish', { sessionId: job.id, seq, width: 960, height: 540, pixels });
      call('audience', 'robot-decoded', job.id);
    }
  }
  function close() {
    const robot = windowFor('robot');
    const stop = robot?.messages.findLast(m => m.name === 'robot-stop');
    if (stop) emit('robot', 'robot-closed', { id: stop.data.id, acknowledged: true });
  }
  function step(ms = 500, { video = true, cleanup = true } = {}) {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 500); feed(video);
      for (const [id, t] of [...timers]) if (timers.has(id) && t.at <= now) {
        if (t.repeat) t.at = now + t.ms; else timers.delete(id);
        t.fn();
      }
      if (cleanup) close();
    }
  }
  feed(false);
  return { state, step, close, windows, app,
    configure: patch => call('operator', 'configure', patch),
    command: (name, value) => call('operator', 'command', name, value),
    fail: (code = 'SESSION_BUSY') => emit('robot', 'robot-result', { code }),
    get saved() { return JSON.parse(files.get('settings.json')); }
  };
}

test('Lucy starts off even if saved on, stays on past old limits, and resets only on relaunch', async () => {
  const app = await installation({ robotEnabled: true, robotMinutes: 60, robotSessionCap: 1 });
  assert.equal(app.state().settings.robotEnabled, false);
  app.step(120000); assert.equal(app.state().cloud.count, 0);
  app.configure({ robotEnabled: true, duration: 10 });
  const seen = { robots: 0, cartoon: 0 }; let last;
  for (let i = 0; i < 3000; i++) {
    app.step(); const s = app.state();
    if (s.cloud.ready && s.active !== last && s.active in seen) seen[s.active]++;
    last = s.active;
    assert.equal(s.settings.robotEnabled, true);
  }
  assert(seen.robots > 12 && seen.cartoon > 12, JSON.stringify(seen));
  assert(app.state().cloud.count > 40);
  const relaunched = await installation(app.saved);
  assert.equal(relaunched.state().settings.robotEnabled, false);
});

for (const sceneId of ['robots', 'cartoon']) test(`${sceneId} disconnects at its duration while paused but stays enabled for the next visit`, async () => {
  const app = await installation();
  app.configure({ robotEnabled: true, duration: 10 });
  app.command('select', sceneId); app.step(); app.command('pause');
  const first = app.state(); app.step(8000);
  assert(app.state().cloud.ready); assert(app.state().cloud.frames > first.cloud.frames);
  // Reselecting the same live scene must not extend its paid connection.
  app.command('select', sceneId); app.step(180000);
  const held = app.state();
  assert(held.paused && !held.cloud.ready && !held.cloud.streaming);
  assert(held.settings.robotEnabled); assert.equal(held.cloud.count, 1);
  assert(held.settings.scenes.find(s => s.id === sceneId).enabled);
  app.command('select', sceneId); app.step();
  assert.equal(app.state().active, sceneId); assert(app.state().cloud.ready); assert.equal(app.state().cloud.count, 2);
  app.command('stop-robot'); app.step(180000);
  assert.equal(app.state().settings.robotEnabled, false); assert.equal(app.state().cloud.count, 2);
  assert(!app.state().cloud.ready && !app.state().cloud.streaming);
});

test('Lucy opens no background connection on local scenes, including paused idle time', async () => {
  const app = await installation();
  app.configure({ robotEnabled: true, duration: 60 });
  app.command('select', 'heat'); app.step(59500);
  assert.equal(app.state().cloud.count, 0, 'No prewarming before the live slot');
  app.step(1000); assert.equal(app.state().active, 'robots'); assert(app.state().cloud.ready);
  app.command('select', 'garden'); app.close(); app.command('pause'); app.step(3600000);
  assert.equal(app.state().cloud.count, 1); assert(!app.state().cloud.streaming);
  assert.equal(app.state().active, 'garden'); assert(app.state().settings.robotEnabled);
});

test('both live scenes rotate when adjacent or alone; switching waits for cleanup and can be cancelled', async () => {
  const app = await installation();
  app.configure({ robotEnabled: true, duration: 10, scenes: app.state().settings.scenes.map(s => ({ ...s, enabled: ['robots', 'cartoon'].includes(s.id) })) });
  const seen = new Set();
  for (let i = 0; i < 90; i++) { app.step(); if (app.state().cloud.ready) seen.add(app.state().active); }
  assert(seen.has('robots') && seen.has('cartoon')); assert(app.state().cloud.count >= 4);
  const other = app.state().cloud.sceneId === 'robots' ? 'cartoon' : 'robots';
  const count = app.state().cloud.count;
  app.command('select', other);
  assert(app.state().cloud.closing); assert.equal(app.state().cloud.count, count);
  assert.equal(app.windows.filter(w => w.role === 'robot' && !w.destroyed).length, 1);
  app.close(); app.step();
  assert.equal(app.state().active, other); assert.equal(app.state().cloud.count, count + 1);
  app.command('select', other === 'robots' ? 'cartoon' : 'robots');
  app.configure({ robotEnabled: false }); app.close(); app.step(120000);
  assert.equal(app.state().cloud.count, count + 1); assert(!app.state().cloud.streaming);
});

test('provider failure never retries in the background while paused; explicit retry and quit work', async () => {
  const app = await installation();
  app.configure({ robotEnabled: true }); app.command('select', 'cartoon'); app.step(); app.command('pause');
  app.fail(); app.close(); app.step(59000);
  assert(app.state().settings.robotEnabled); assert.equal(app.state().cloud.count, 1);
  app.step(180000); assert.equal(app.state().cloud.count, 1); assert(!app.state().cloud.streaming);
  app.command('select', 'cartoon'); app.step();
  assert.equal(app.state().active, 'cartoon'); assert(app.state().cloud.ready); assert.equal(app.state().cloud.count, 2);
  app.command('quit'); assert(app.state().cloud.closing); app.close();
  assert(!app.state().cloud.streaming && !app.state().cloud.ready);
});

test('a backup resumes a paused live scene within its original playback limit', async () => {
  const app = await installation({}, { decart: 'fake-direct-key', fal: 'fake-backup-key' });
  app.configure({ robotEnabled: true, duration: 10, scenes: app.state().settings.scenes.map(s => ({ ...s, enabled: s.id === 'cartoon' })) });
  app.step(1000); app.command('pause');
  assert.equal(app.state().cloud.provider, 'decart'); assert(app.state().cloud.ready);
  app.step(6000);
  app.fail('VIDEO_STALLED'); app.close(); app.step(1000);
  assert.equal(app.state().cloud.provider, 'fal'); assert(app.state().cloud.ready);
  assert.equal(app.state().active, 'cartoon'); assert(app.state().paused);
  app.step(4000); assert(!app.state().cloud.streaming); assert(app.state().settings.robotEnabled);
  app.step(180000); assert.equal(app.state().cloud.count, 2);
});
