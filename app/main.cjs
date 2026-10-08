const { app, BrowserWindow, ipcMain, screen, protocol, net, session, powerSaveBlocker, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { performance } = require('node:perf_hooks');
const { SCENES, defaults, sanitize } = require('./core/settings.cjs');
const { Scheduler } = require('./core/scheduler.cjs');
const { CloudGate } = require('./core/cloud-gate.cjs');
const { mintLucyToken } = require('./core/fal-auth.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'reverie', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
if (process.env.REVERIE_TEST_DIR) app.setPath('userData', process.env.REVERIE_TEST_DIR);
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
const runtime = process.env.REVERIE_TEST_DIR || (app.isPackaged ? app.getPath('userData') : path.join(__dirname, '../.runtime'));
fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
const keyPath = app.isPackaged || process.env.REVERIE_TEST_DIR ? path.join(runtime, '.env') : path.join(__dirname, '../.env');
function readJSON(name, fallback) { try { return JSON.parse(fs.readFileSync(path.join(runtime, name), 'utf8')); } catch { return fallback; } }
function writeJSON(name, data) { const file = path.join(runtime, name); fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); }
let key = process.env.FAL_KEY || ''; try { key ||= require('dotenv').parse(fs.readFileSync(keyPath)).FAL_KEY || ''; } catch {}
let settings = sanitize(readJSON('settings.json', defaults));
if (process.argv.includes('--demo')) settings.demo = true;
const scheduler = new Scheduler(settings, performance.now());
const gate = new CloudGate(readJSON('cloud-budget.json', {}));
let operator, audience, engine, robot, quitting = false, frame = null, preview = '', robotStill = null, robotJob = null, robotTimer, generation = 0;
let camera = { state: 'starting', message: 'Starting shared camera service', devices: [], detector: 'starting' };
let rendering = { fps: 0, scene: scheduler.active, quality: 1 }, cloud = { state: settings.robotEnabled ? 'waiting' : 'disabled', message: 'Robot generation is optional' };
let cameraHeartbeat = Date.now(), renderHeartbeat = Date.now(), restarting = new Set(), logTail = [];
function log(code, detail = '') {
  // Only internal status codes and controlled text. Never log frames, tokens, SDP or provider error bodies.
  const line = `${new Date().toISOString()} ${code} ${String(detail).slice(0, 200)}`;
  logTail.push(line); if (logTail.length > 80) logTail.shift();
  try { const p = path.join(runtime, 'installation.log'); if (fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024) { fs.renameSync(p, p + '.1'); } fs.appendFileSync(p, line + '\n', { mode: 0o600 }); } catch {}
}
function displays() { return screen.getAllDisplays().map(d => ({ id: String(d.id), label: d.label || `Display ${d.id}`, width: d.size.width, height: d.size.height, primary: d.id === screen.getPrimaryDisplay().id })); }
function state() { return { settings, scenes: SCENES, active: scheduler.active, activation: scheduler.activation, paused: scheduler.paused, remaining: scheduler.left(performance.now()), camera, rendering, cloud: { ...cloud, configured: !!key, count: gate.session, cap: settings.robotSessionCap, cachedAt: robotStill?.at || null }, displays: displays(), keyPath, logPath: path.join(runtime, 'installation.log'), logs: logTail.slice(-12), outputAvailable: !audience?.isDestroyed() && !!audience?.isVisible() }; }
function send(win, channel, data) { if (win && !win.isDestroyed()) win.webContents.send(channel, data); }
function broadcast() { const s = state(); for (const win of [operator, audience, engine]) send(win, 'state', s); }
function allowed(event, win) { return win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame?.url.startsWith('reverie://app/'); }
function guard(event, win) { if (!allowed(event, win)) throw Error('Unauthorized window'); }
function handle(channel, getWindow, fn) { ipcMain.handle(channel, (event, ...args) => { guard(event, getWindow()); return fn(...args); }); }
function makeWindow(role, options = {}) {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false, backgroundColor: '#11130f', autoHideMenuBar: true, ...options, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false, ...options.webPreferences } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('render-process-gone', () => { log('renderer-exited', role); restart(role); });
  win.on('unresponsive', () => { log('renderer-unresponsive', role); restart(role); });
  win.loadURL(`reverie://app/${role}.html`);
  return win;
}
function createOperator() { operator = makeWindow('operator', { minWidth: 1020, minHeight: 700, title: 'Reverie · Installation control' }); operator.once('ready-to-show', () => operator.show()); operator.on('close', e => { if (!quitting) { e.preventDefault(); operator.hide(); } }); }
function placeOutput() {
  if (!audience || audience.isDestroyed()) return;
  const all = screen.getAllDisplays(), primary = screen.getPrimaryDisplay();
  const display = all.find(d => String(d.id) === settings.displayId) || (!settings.displayId ? all.find(d => d.id !== primary.id) : null);
  audience.setFullScreen(false);
  if (display) { audience.setBounds(display.bounds); audience.showInactive(); audience.setFullScreen(settings.fullscreen); }
  else { audience.setBounds({ x: primary.workArea.x + 60, y: primary.workArea.y + 60, width: Math.min(1280, primary.workArea.width - 80), height: Math.min(720, primary.workArea.height - 80) }); audience.showInactive(); log('display-preview', 'External display absent; windowed preview on primary display'); }
}
function createAudience() { renderHeartbeat = Date.now(); audience = makeWindow('audience', { title: 'Reverie · Audience', frame: false }); audience.once('ready-to-show', placeOutput); audience.on('close', e => { if (!quitting) { e.preventDefault(); audience.hide(); operator?.show(); } }); }
function createEngine() { cameraHeartbeat = Date.now(); engine = makeWindow('engine', { width: 640, height: 360 }); }
function restart(role) {
  if (quitting || restarting.has(role)) return;
  if (role === 'robot') { finishRobot(null, 'Connection stopped; local robot scene available'); return; }
  restarting.add(role);
  const win = { audience, engine, operator }[role];
  if (role === 'engine') { frame = null; preview = ''; camera.state = 'recovering'; camera.message = 'Restarting camera service'; }
  // Preserve the native window, especially macOS full-screen Spaces. Destroying it
  // synchronously in render-process-gone can deadlock AppKit's full-screen teardown.
  setTimeout(() => {
    if (quitting) return;
    if (win && !win.isDestroyed()) {
      if (!win.webContents.isCrashed()) win.webContents.forcefullyCrashRenderer();
      setTimeout(() => {
        if (!quitting && !win.isDestroyed()) {
          if (role === 'engine') cameraHeartbeat = Date.now();
          if (role === 'audience') renderHeartbeat = Date.now();
          win.reload();
        }
        restarting.delete(role);
      }, 250);
    } else { ({ audience: createAudience, engine: createEngine, operator: createOperator })[role]?.(); restarting.delete(role); }
  }, 1500);
}
function finishRobot(result, message) {
  clearTimeout(robotTimer);
  if (result && /^data:image\/jpeg;base64,/.test(result) && result.length < 6e6) { robotStill = { image: result, at: Date.now(), generation: ++generation }; cloud = { state: 'ready', message: 'Robot still ready in memory' }; log('robot-ready'); }
  else { cloud = { state: 'fallback', message: message || 'Generation unavailable; cached or local robot still in use' }; log('robot-fallback'); }
  gate.finish(); robotJob = null;
  if (robot && !robot.isDestroyed()) robot.destroy(); robot = null;
  broadcast();
}
function startRobot() {
  if (!frame || Date.now() - frame.at > 2000 || camera.state !== 'live' || settings.demo || !settings.scenes.some(s => s.id === 'robots' && s.enabled)) return;
  if (gate.reserve(Date.now(), settings, !!key)) return;
  try { writeJSON('cloud-budget.json', { history: gate.history }); } catch { gate.finish(); cloud = { state: 'fallback', message: 'Cannot persist spending cap; cloud requests stopped' }; settings.robotEnabled = false; return; }
  robotJob = { width: frame.width, height: frame.height, pixels: frame.pixels, mirror: settings.mirror };
  cloud = { state: 'generating', message: 'Preparing one frozen audience frame · 25 second limit' };
  log('robot-start');
  robot = makeWindow('robot', { width: 640, height: 360 });
  robotTimer = setTimeout(() => finishRobot(null, 'Generation timed out; cached or local robot still in use'), 25000);
}
app.whenReady().then(() => {
  const dist = path.resolve(__dirname, '../dist');
  protocol.handle('reverie', request => {
    const url = new URL(request.url); const file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (url.host !== 'app' || !file.startsWith(dist + path.sep)) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.setPermissionRequestHandler((web, permission, callback, details) => callback(web === engine?.webContents && permission === 'media' && !(details.mediaTypes || []).includes('audio')));
  session.defaultSession.setPermissionCheckHandler((web, permission, _origin, details) => web === engine?.webContents && permission === 'media' && details.mediaType !== 'audio');
  ipcMain.handle('state', e => { if (![operator, audience, engine].some(w => w && e.sender === w.webContents)) throw Error('Unauthorized'); return state(); });
  handle('configure', () => operator, value => {
    const old = settings; settings = sanitize({ ...settings, ...value });
    writeJSON('settings.json', settings); scheduler.configure(settings, performance.now());
    if (old.displayId !== settings.displayId || old.fullscreen !== settings.fullscreen) placeOutput();
    if (gate.busy && (!settings.robotEnabled || settings.demo || !settings.scenes.some(s => s.id === 'robots' && s.enabled))) finishRobot(null, 'Cloud generation stopped by operator settings');
    if (!settings.robotEnabled) cloud = { state: 'disabled', message: 'Local robot fallback active' };
    else if (!key) cloud = { state: 'missing-key', message: 'Add your FAL key to enable Lucy' };
    broadcast(); return state();
  });
  handle('save-key', () => operator, value => {
    if (typeof value !== 'string' || value.length > 512 || /[\r\n"'\\]/.test(value)) throw Error('Invalid key');
    fs.writeFileSync(keyPath, `FAL_KEY=${value.trim()}\n`, { mode: 0o600 }); fs.chmodSync(keyPath, 0o600); key = value.trim(); log('credentials-updated'); broadcast(); return !!key;
  });
  function command(name, value) {
    const now = performance.now();
    if (name === 'select') scheduler.select(value, now);
    if (name === 'next') scheduler.next(now);
    if (name === 'pause') scheduler.paused ? scheduler.resume(now) : scheduler.pause(now);
    if (name === 'output') { audience.show(); placeOutput(); }
    if (name === 'controls') operator.show();
    if (name === 'fullscreen') { audience.show(); audience.setFullScreen(!audience.isFullScreen()); }
    if (name === 'reconnect') restart('engine');
    if (name === 'logs') shell.showItemInFolder(path.join(runtime, 'installation.log'));
    if (name === 'quit') { quitting = true; app.quit(); }
    broadcast();
  }
  handle('command', () => operator, command);
  handle('audience-command', () => audience, (name, value) => { if (['controls', 'fullscreen', 'pause', 'next', 'select'].includes(name)) command(name, value); });
  handle('frame', () => audience, seq => frame && frame.seq !== seq && Date.now() - frame.at < 2000 ? frame : null);
  handle('preview', () => operator, () => Date.now() - (frame?.at || 0) < 2000 ? preview : '');
  handle('robot-image', () => audience, () => robotStill);
  handle('publish-frame', () => engine, data => {
    if (data && data.width <= 960 && data.height <= 720 && data.pixels?.length === data.width * data.height * 4) { frame = data; preview = data.preview || preview; cameraHeartbeat = Date.now(); }
    return true;
  });
  ipcMain.on('camera-status', (e, status) => { if (!allowed(e, engine)) return; cameraHeartbeat = Date.now(); if (camera.state !== status.state) log('camera-state', status.state); camera = status; });
  ipcMain.on('render-status', (e, status) => { if (!allowed(e, audience)) return; renderHeartbeat = Date.now(); if (status.failure && status.failure !== rendering.failure) log('scene-failure', status.failure); rendering = status; });
  handle('robot-job', () => robot, () => robotJob);
  handle('robot-token', () => robot, async () => {
    if (!gate.busy || !key) throw Error('Cloud request not authorized');
    // Short-lived, fixed-endpoint credentials; no FAL secret crosses the preload bridge.
    return mintLucyToken(key);
  });
  ipcMain.on('robot-result', (e, result) => { if (!allowed(e, robot)) return; finishRobot(result?.image, result?.ok ? undefined : 'Lucy result unavailable; cached or local robot still in use'); });
  createOperator(); createAudience(); createEngine();
  screen.on('display-added', () => { placeOutput(); broadcast(); }); screen.on('display-removed', () => { placeOutput(); broadcast(); }); screen.on('display-metrics-changed', () => placeOutput());
  powerSaveBlocker.start('prevent-display-sleep');
  setInterval(() => { scheduler.tick(performance.now()); if (scheduler.until('robots', performance.now()) <= 45000) startRobot(); broadcast(); }, 500);
  setInterval(() => { if (Date.now() - cameraHeartbeat > 12000) restart('engine'); if (audience?.isVisible() && Date.now() - renderHeartbeat > 10000) restart('audience'); }, 3000);
  log('installation-start');
});
app.on('activate', () => operator?.show());
app.on('second-instance', () => { if (operator && !operator.isDestroyed()) { operator.show(); operator.focus(); } });
app.on('before-quit', () => { quitting = true; clearTimeout(robotTimer); if (robot && !robot.isDestroyed()) robot.destroy(); log('installation-stop'); });
app.on('window-all-closed', () => app.quit());
