const { app, BrowserWindow, ipcMain, screen, protocol, net, session, powerSaveBlocker, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { performance } = require('node:perf_hooks');
const { SCENES, defaults, sanitize } = require('./core/settings.cjs');
const { Scheduler } = require('./core/scheduler.cjs');
const { CloudGate } = require('./core/cloud-gate.cjs');
const { mintLucyToken } = require('./core/fal-auth.cjs');
const { resolveKeyPath } = require('./core/key-path.cjs');
const { outputLayout, OutputPlacement } = require('./core/output-placement.cjs');
const { FAILURES, robotStatus, safeDiagnostic, classifyRobotFailure } = require('./core/robot-status.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'reverie', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
if (process.env.REVERIE_TEST_DIR) app.setPath('userData', process.env.REVERIE_TEST_DIR);
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
const runtime = process.env.REVERIE_TEST_DIR || (app.isPackaged ? app.getPath('userData') : path.join(__dirname, '../.runtime'));
fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
const keyPath = resolveKeyPath({ packaged: app.isPackaged, runtime, appPath: app.getAppPath(), testMode: !!process.env.REVERIE_TEST_DIR });
function readJSON(name, fallback) { try { return JSON.parse(fs.readFileSync(path.join(runtime, name), 'utf8')); } catch { return fallback; } }
function writeJSON(name, data) { const file = path.join(runtime, name); fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); }
let key = process.env.FAL_KEY || ''; try { key ||= require('dotenv').parse(fs.readFileSync(keyPath)).FAL_KEY || ''; } catch {}
let settings = sanitize(readJSON('settings.json', defaults));
// Cloud streaming requires the operator to opt in again after each launch.
settings.robotEnabled = false;
if (process.argv.includes('--demo')) settings.demo = true;
const scheduler = new Scheduler(settings, performance.now());
scheduler.availability('robots', false, performance.now());
const gate = new CloudGate(readJSON('cloud-budget.json', {}));
let operator, audience, engine, robot, quitting = false, frame = null, preview = '', robotOutput = null, robotJob = null, robotTimer, generation = 0;
let robotClosing = null, quitAfterCleanup = false;
let outputPlacement;
let robotDecoded = false, robotStartedAt = 0, robotPresented = false, robotStopAt = 0, robotPhase = 'idle';
let camera = { state: 'starting', message: 'Starting shared camera service', devices: [], detector: 'starting' };
let rendering = { fps: 0, scene: scheduler.active, quality: 1 }, cloud = { state: 'waiting', message: '' };
let cameraHeartbeat = Date.now(), renderHeartbeat = Date.now(), restarting = new Set(), logTail = [];
try { logTail = fs.readFileSync(path.join(runtime, 'installation.log'), 'utf8').trim().split('\n').slice(-12); } catch {}
function log(code, detail = '') {
  // Only internal status codes and controlled text. Never log frames, tokens, SDP or provider error bodies.
  const line = `${new Date().toISOString()} ${code} ${String(detail).slice(0, 200)}`;
  if (code === 'robot-skipped') console.warn(`[Lucy 2.5] ${detail}`);
  logTail.push(line); if (logTail.length > 80) logTail.shift();
  try { const p = path.join(runtime, 'installation.log'); if (fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024) { fs.renameSync(p, p + '.1'); } fs.appendFileSync(p, line + '\n', { mode: 0o600 }); } catch {}
}
function displays() { return screen.getAllDisplays().map(d => ({ id: String(d.id), label: d.label || `Display ${d.id}`, width: d.size.width, height: d.size.height, primary: d.id === screen.getPrimaryDisplay().id })); }
function cloudStatus() { return robotStatus({ settings, hasKey: !!key, gate, cloud, ready: !!robotOutput && robotDecoded && Date.now() - robotOutput.at < 2000, camera: camera.state, frameFresh: !!frame && Date.now() - frame.at < 2000, now: Date.now() }); }
function state() { return { settings, scenes: SCENES, active: scheduler.active, activation: scheduler.activation, paused: scheduler.paused, remaining: scheduler.left(performance.now()), camera, rendering, cloud: { ...cloudStatus(), configured: !!key, count: gate.session, cap: settings.robotSessionCap, sessionId: robotJob?.id || null, streaming: gate.busy && !robotClosing, closing: !!robotClosing, frames: robotOutput?.seq || 0, secondsLeft: gate.busy ? Math.max(0, Math.ceil((robotStopAt - Date.now()) / 1000)) : 0 }, displays: displays(), keyPath, logPath: path.join(runtime, 'installation.log'), logs: logTail.slice(-12), outputAvailable: !audience?.isDestroyed() && !!audience?.isVisible() }; }
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
function placeOutput(options) {
  if (quitting || !outputPlacement || !audience || audience.isDestroyed()) return;
  const layout = outputLayout(screen, settings);
  if (layout.preview && !outputPlacement.layout?.preview) log('display-preview', 'External display absent; windowed preview on primary display');
  outputPlacement.place(layout, options);
}
function createAudience() { renderHeartbeat = Date.now(); audience = makeWindow('audience', { title: 'Reverie · Audience', frame: false }); audience.once('ready-to-show', () => { outputPlacement = new OutputPlacement(audience); placeOutput({ show: true }); }); audience.on('close', e => { if (!quitting) { e.preventDefault(); stopRobot('DISPLAY_LOST'); outputPlacement?.hide(); audience.hide(); operator?.show(); } }); }
function createEngine() { cameraHeartbeat = Date.now(); engine = makeWindow('engine', { width: 640, height: 360 }); }
function restart(role) {
  if (quitting || restarting.has(role)) return;
  if (role === 'robot') { if (robotClosing) robotClosing.finish('forced'); else stopRobot('RENDERER_EXIT'); return; }
  if (role === 'audience' || role === 'engine') stopRobot(role === 'engine' ? 'CAMERA_LOST' : 'DISPLAY_LOST');
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
function stopRobot(code = 'CLIENT_ERROR', detail) {
  if (robotClosing) return robotClosing.promise;
  if (!gate.busy) return Promise.resolve();
  clearTimeout(robotTimer);
  code = classifyRobotFailure(code, detail);
  if (code === 'SESSION_BUSY' && !robotOutput) {
    gate.rejectConcurrency(Date.now());
    try { writeJSON('cloud-budget.json', gate.snapshot()); }
    catch { settings.robotEnabled = false; log('robot-budget', 'Could not persist retry state; Lucy disabled.'); }
  }
  const elapsed = Date.now() - robotStartedAt;
  if (['SCENE_ENDED', 'CANCELLED', 'SESSION_LIMIT', 'APP_QUIT'].includes(code)) {
    cloud = { state: 'waiting', message: code === 'SESSION_LIMIT' ? 'Live session ended at its time limit. Robot scene skipped until the next allowed session.' : 'Live connection closed. Waiting for the next robot scene.' };
    log('robot-stopped', `${code} / ${elapsed}ms / ${robotOutput?.seq || 0} live frames`);
  } else {
    if (!FAILURES[code]) code = 'CLIENT_ERROR';
    const diagnostic = safeDiagnostic(detail, key);
    cloud = { state: 'error', code, phase: robotPhase, message: `${FAILURES[code]}${diagnostic && code !== 'SESSION_BUSY' ? ` Provider detail: ${diagnostic}` : ''} Robot scene skipped.`, elapsed };
    log('robot-skipped', `${code} / ${robotPhase} / ${elapsed}ms / ${FAILURES[code]} Robot scene skipped.`);
    if (diagnostic) log('robot-detail', diagnostic);
  }
  const win = robot, id = robotJob?.id;
  robotOutput = null; robotDecoded = false; robotPresented = false; robotJob = null;
  scheduler.availability('robots', false, performance.now());
  // destroy() does not run beforeunload. Ask the service to close its WebRTC
  // peer and signaling socket first, and hold the gate until cleanup finishes.
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  const closing = robotClosing = { win, id, promise, timer: null, finish: null };
  closing.finish = mode => {
    if (robotClosing !== closing) return;
    clearTimeout(closing.timer);
    if (win && !win.isDestroyed()) win.destroy();
    robot = null; robotClosing = null; cloud.closing = false; gate.finish();
    log('robot-disconnected', mode === 'not-opened' ? 'Local media released; no signaling socket was opened.' : mode === 'graceful' ? 'Peer closed; signaling close handshake completed before window teardown. Upstream quota release is not acknowledged.' : 'Signaling close was not acknowledged before the cleanup deadline. Provider release may be delayed.');
    broadcast(); resolve();
  };
  cloud.closing = true; broadcast();
  if (!win || win.isDestroyed() || win.webContents.isCrashed()) closing.finish('forced');
  else { closing.timer = setTimeout(() => closing.finish('forced'), 5000); send(win, 'robot-stop', { id }); }
  return promise;
}
function syncRobot() {
  if (!gate.busy || robotClosing) return;
  const now = Date.now();
  if (camera.state !== 'live' || !frame || now - frame.at > 2000) { stopRobot('CAMERA_LOST'); return; }
  if (robotOutput && now - robotOutput.at > 2000) { stopRobot('VIDEO_STALLED'); return; }
  if (robotDecoded && scheduler.active === 'robots' && !robotPresented) {
    robotPresented = true; robotStopAt = now + settings.duration * 1000;
    log('robot-live', `Displaying continuous Lucy video; ${settings.duration}s session limit`);
  }
  if (robotPresented && scheduler.active !== 'robots') stopRobot('SCENE_ENDED');
  else if (now >= robotStopAt) stopRobot('SESSION_LIMIT');
  else if (!robotPresented && !robotJob.manual && (scheduler.paused || scheduler.until('robots', performance.now(), true) > 15000)) stopRobot('CANCELLED');
}
function startRobot(manual = false, retry = false) {
  if (quitting || !audience || audience.isDestroyed() || !audience.isVisible() || !(retry ? cloudStatus().canRetry : cloudStatus().canGenerate)) return;
  if (gate.reserve(Date.now(), settings, !!key, retry)) return;
  robotStartedAt = Date.now(); robotPhase = 'starting'; robotDecoded = false; robotPresented = false; robotOutput = null;
  // A hard bound includes negotiation, prewarming and the displayed scene.
  // Pausing rotation never leaves a paid stream running indefinitely.
  robotStopAt = robotStartedAt + 40000 + settings.duration * 1000;
  try { writeJSON('cloud-budget.json', gate.snapshot()); } catch { stopRobot('BUDGET_WRITE'); settings.robotEnabled = false; return; }
  robotJob = { id: ++generation, manual };
  cloud = { state: 'connecting', message: 'Connecting live camera to Lucy · 25 second connection limit', phase: robotPhase };
  log('robot-start', 'Live camera conversion; viewers stay on the current scene until video arrives');
  robot = makeWindow('robot', { width: 640, height: 360 });
  robotTimer = setTimeout(() => stopRobot('TIMEOUT'), 25000);
  broadcast();
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
    if (!settings.robotEnabled || settings.demo || !settings.scenes.some(s => s.id === 'robots' && s.enabled)) {
      if (gate.busy) stopRobot('CANCELLED');
      robotOutput = null; robotDecoded = false; scheduler.availability('robots', false, performance.now());
      if (!cloud.code) cloud = { state: 'waiting', message: '' };
    }
    syncRobot(); broadcast(); return state();
  });
  handle('save-key', () => operator, value => {
    if (typeof value !== 'string' || value.length > 512 || /[\r\n"'\\]/.test(value)) throw Error('Invalid key');
    fs.writeFileSync(keyPath, `FAL_KEY=${value.trim()}\n`, { mode: 0o600 }); fs.chmodSync(keyPath, 0o600); key = value.trim(); log('credentials-updated'); broadcast(); return !!key;
  });
  function command(name, value) {
    const now = performance.now();
    if (name === 'select') {
      if (value === 'robots' && !cloudStatus().ready) {
        if (robotJob) robotJob.manual = true; else if (cloudStatus().canRetry) startRobot(true, true); else if (cloudStatus().canGenerate) startRobot(true); else log('robot-skipped', cloudStatus().message);
      } else { if (value !== 'robots') stopRobot('CANCELLED'); scheduler.select(value, now); }
    }
    if (name === 'generate-robot') startRobot(true);
    if (name === 'retry-robot') startRobot(true, true);
    if (name === 'stop-robot') stopRobot('CANCELLED');
    if (name === 'next') { scheduler.next(now); stopRobot('SCENE_ENDED'); }
    if (name === 'pause') scheduler.paused ? scheduler.resume(now) : scheduler.pause(now);
    if (name === 'output') placeOutput({ show: true });
    if (name === 'controls') operator.show();
    if (name === 'fullscreen') outputPlacement?.toggleFullscreen();
    if (name === 'reconnect') restart('engine');
    if (name === 'logs') shell.showItemInFolder(path.join(runtime, 'installation.log'));
    if (name === 'quit') { quitting = true; app.quit(); }
    syncRobot(); broadcast();
  }
  handle('command', () => operator, command);
  handle('audience-command', () => audience, (name, value) => { if (['controls', 'fullscreen', 'pause', 'next', 'select'].includes(name)) command(name, value); });
  handle('frame', () => audience, (seq, analysisOnly = false) => {
    if (!frame || frame.seq === seq || Date.now() - frame.at >= 2000) return null;
    if (analysisOnly !== true) return frame;
    // Artwork scenes need no camera pixels, edge image, energy grid or JPEG preview.
    // Keep the shared full packet intact for camera scenes and robot prewarming.
    const { points = [], calm = [], amount = 0 } = frame.motion || {};
    return { seq: frame.seq, at: frame.at, demo: frame.demo, boxes: frame.boxes, motion: { points, calm, amount } };
  });
  handle('preview', () => operator, () => Date.now() - (frame?.at || 0) < 2000 ? preview : '');
  handle('robot-frame', () => audience, seq => robotOutput && robotOutput.seq !== seq && Date.now() - robotOutput.at < 2000 ? robotOutput : null);
  handle('robot-decoded', () => audience, id => {
    if (id !== robotJob?.id || !robotOutput || robotDecoded) return;
    robotDecoded = true; clearTimeout(robotTimer); robotPhase = 'live';
    cloud = { state: 'live', phase: 'live', message: 'Lucy is continuously transforming the live camera. The connection closes when this scene ends.' };
    scheduler.availability('robots', true, performance.now());
    if (robotJob.manual) scheduler.select('robots', performance.now());
    syncRobot(); broadcast();
  });
  handle('publish-frame', () => engine, data => {
    if (data && data.width <= 960 && data.height <= 720 && data.pixels?.length === data.width * data.height * 4) { frame = data; preview = data.preview || preview; cameraHeartbeat = Date.now(); }
    return true;
  });
  ipcMain.on('camera-status', (e, status) => { if (!allowed(e, engine)) return; cameraHeartbeat = Date.now(); if (camera.state !== status.state) log('camera-state', status.state); camera = status; });
  ipcMain.on('render-status', (e, status) => { if (!allowed(e, audience)) return; renderHeartbeat = Date.now(); if (status.failure && status.failure !== rendering.failure) log('scene-failure', status.failure); rendering = status; });
  handle('robot-job', () => robot, () => robotJob);
  handle('robot-input', () => robot, seq => gate.busy && frame && !frame.demo && frame.seq !== seq && Date.now() - frame.at < 2000 ? frame : null);
  handle('robot-publish', () => robot, data => {
    if (!robotJob || data?.sessionId !== robotJob.id || !Number.isSafeInteger(data.seq) || data.seq <= (robotOutput?.seq || 0)) return false;
    if (data.width !== 960 || data.height !== 540 || data.pixels?.length !== 960 * 540 * 4) { stopRobot('INVALID_IMAGE'); return false; }
    robotOutput = { sessionId: data.sessionId, seq: data.seq, width: data.width, height: data.height, pixels: data.pixels, at: Date.now() };
    return true;
  });
  handle('robot-token', () => robot, async () => {
    if (!gate.busy || robotClosing || !key) throw Error('Cloud request not authorized');
    // Short-lived, fixed-endpoint credentials; no FAL secret crosses the preload bridge.
    const id = robotJob?.id;
    try { const token = await mintLucyToken(key); return id === robotJob?.id ? token : null; } catch (error) { if (id === robotJob?.id) stopRobot(error.code || 'AUTH_NETWORK'); return null; }
  });
  ipcMain.on('robot-closed', (e, result) => { if (robotClosing && allowed(e, robotClosing.win) && result?.id === robotClosing.id) robotClosing.finish(result.noSocket === true ? 'not-opened' : result.acknowledged === true ? 'graceful' : 'forced'); });
  ipcMain.on('robot-diagnostic', (e, data) => {
    if (!allowed(e, robot) || !['socket-created', 'socket-open', 'prompt-sent', 'offer-sent', 'socket-closed'].includes(data?.event)) return;
    const suffix = data.event === 'socket-closed' ? ` / code=${Number.isInteger(data.code) ? data.code : 'unknown'} / clean=${data.acknowledged === true}` : '';
    log('robot-transport', `${data.event}${suffix}`);
  });
  ipcMain.on('robot-stage', (e, phase) => { if (robotClosing || !allowed(e, robot) || !['authenticating', 'signaling', 'connecting-video', 'receiving-video'].includes(phase)) return; robotPhase = phase; cloud.phase = phase; cloud.message = `Lucy: ${phase.replaceAll('-', ' ')} · 25 second limit`; log('robot-stage', phase); broadcast(); });
  ipcMain.on('robot-result', (e, result) => { if (!allowed(e, robot)) return; stopRobot(result?.code, result?.detail); });
  createOperator(); createAudience(); createEngine();
  screen.on('display-added', () => { placeOutput(); broadcast(); }); screen.on('display-removed', () => { placeOutput(); broadcast(); });
  screen.on('display-metrics-changed', (_event, _display, changedMetrics) => {
    // Native full-screen Spaces change the Dock/menu-bar work area. They do
    // not change monitor geometry and must not trigger another placement.
    if (changedMetrics.some(metric => ['bounds', 'scaleFactor', 'rotation'].includes(metric))) placeOutput();
  });
  powerSaveBlocker.start('prevent-display-sleep');
  setInterval(() => { scheduler.tick(performance.now()); syncRobot(); if (!scheduler.paused && scheduler.until('robots', performance.now(), true) <= 15000) startRobot(); broadcast(); }, 500);
  setInterval(() => { if (Date.now() - cameraHeartbeat > 12000) restart('engine'); if (audience?.isVisible() && Date.now() - renderHeartbeat > 10000) restart('audience'); }, 3000);
  log('installation-start');
});
app.on('activate', () => operator?.show());
app.on('second-instance', () => { if (operator && !operator.isDestroyed()) { operator.show(); operator.focus(); } });
app.on('before-quit', event => {
  quitting = true;
  outputPlacement?.dispose();
  if (!quitAfterCleanup && gate.busy) {
    event.preventDefault();
    stopRobot('APP_QUIT').then(() => { quitAfterCleanup = true; app.quit(); });
    return;
  }
  clearTimeout(robotTimer); log('installation-stop');
});
app.on('window-all-closed', () => app.quit());
