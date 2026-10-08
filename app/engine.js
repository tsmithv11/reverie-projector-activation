import { demoCrowd } from './core/demo.js';
const api = window.installation;
let settings = (await api.state()).settings;
const video = document.querySelector('video'), canvas = document.createElement('canvas'), small = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true }), sx = small.getContext('2d', { willReadFrequently: true });
small.width = 160; small.height = 90;
let stream, opening = false, openEpoch = 0, nextOpen = 0, cameraState = 'starting', message = '', devices = [], boxes = [], detectionAt = 0, detectorState = 'starting', detectorMs = 0;
let motion = { points: [], calm: [], amount: 0 }, detector, motionWorker, detectBusy = false, motionBusy = false, detectorReady = false, detectSent = 0, motionSent = 0, detectionRetry = 0;
let publishing = false, seq = 0, lastVideoTime = -1, lastAdvance = Date.now(), lastPreview = 0, lastMotion = 0, lastDetect = 0, level = 1;
function initMotion() {
  motionWorker?.terminate(); motionBusy = false;
  motionWorker = new Worker('workers/motion.js');
  motionWorker.onmessage = ({ data }) => { motion = data; motion.at = Date.now(); motionBusy = false; };
  motionWorker.onerror = () => { motionBusy = false; setTimeout(initMotion, 2000); };
}
function initDetector() {
  detector?.terminate(); detectBusy = false; detectorReady = false; detectorState = 'starting'; detectSent = Date.now();
  detector = new Worker('workers/detector.js');
  detector.onmessage = ({ data }) => {
    if (data.ready) { detectorReady = true; detectorState = 'ready'; return; }
    detectBusy = false;
    if (data.error) { detectorState = 'unavailable'; detectorReady = false; detectionRetry = Date.now() + 30000; return; }
    const previous = [...boxes];
    boxes = data.boxes.slice(0, 24).map(b => {
      let closest = -1, distance = .07;
      previous.forEach((p, i) => { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < distance) { distance = d; closest = i; } });
      const p = closest >= 0 ? previous.splice(closest, 1)[0] : null;
      return p ? { ...b, x: p.x * .3 + b.x * .7, y: p.y * .3 + b.y * .7, w: p.w * .3 + b.w * .7, h: p.h * .3 + b.h * .7 } : b;
    });
    detectionAt = Date.now(); detectorMs = data.ms;
  };
  detector.onerror = () => { detectorState = 'unavailable'; detectorReady = false; detectBusy = false; detectionRetry = Date.now() + 30000; };
  detector.postMessage({ type: 'init' });
}
function stopCamera() { openEpoch++; stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; boxes = []; motion = { points: [], calm: [], amount: 0 }; lastVideoTime = -1; }
async function listDevices() { try { devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })); } catch {} }
async function connect() {
  if (opening || settings.demo || Date.now() < nextOpen) return;
  opening = true; const epoch = ++openEpoch; cameraState = 'connecting'; message = 'Connecting camera; allow camera access in system settings';
  const timeout = setTimeout(() => { if (opening) { cameraState = 'permission'; message = 'Camera access is pending. Check Privacy & Security → Camera, then reconnect.'; } }, 12000);
  try {
    const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: settings.cameraId ? { exact: settings.cameraId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } });
    if (epoch !== openEpoch || settings.demo) { media.getTracks().forEach(t => t.stop()); return; }
    stream = media; video.srcObject = media; await video.play();
    stream.getVideoTracks()[0].onended = () => { stopCamera(); cameraState = 'disconnected'; nextOpen = Date.now() + 2000; };
    cameraState = 'live'; message = 'Camera connected · processing on this computer'; lastAdvance = Date.now(); await listDevices();
  } catch (error) {
    cameraState = error.name === 'NotAllowedError' ? 'permission' : 'disconnected';
    message = cameraState === 'permission' ? 'Camera permission denied. Enable camera access in system settings, then reconnect.' : 'Selected camera unavailable. Reconnecting automatically; check USB or choose another camera.';
    nextOpen = Date.now() + (cameraState === 'permission' ? 15000 : 3000);
  } finally { clearTimeout(timeout); opening = false; }
}
api.onState(s => {
  const changed = settings.cameraId !== s.settings.cameraId || settings.demo !== s.settings.demo || settings.mirror !== s.settings.mirror;
  settings = s.settings; level = s.rendering.quality ?? 1;
  if (changed) { stopCamera(); nextOpen = 0; initMotion(); }
});
navigator.mediaDevices.addEventListener('devicechange', () => { nextOpen = 0; listDevices(); });
initMotion(); initDetector(); listDevices();
setInterval(async () => {
  if (publishing) return;
  const now = Date.now();
  if (!settings.demo && !stream) { connect(); return; }
  if (!settings.demo && (video.readyState < 2 || !video.videoWidth)) return;
  if (!settings.demo) {
    if (video.currentTime !== lastVideoTime) { lastAdvance = now; lastVideoTime = video.currentTime; }
    if (now - lastAdvance > 4500) { stopCamera(); cameraState = 'disconnected'; message = 'Camera stopped delivering frames; reconnecting'; nextOpen = now + 1000; return; }
  }
  const width = [480, 640, 960][level];
  // Always contain the sensor image within 16:9; all analysis uses this exact camera plane.
  if (canvas.width !== width) { canvas.width = width; canvas.height = width * 9 / 16; }
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#141126'; ctx.fillRect(0, 0, w, h);
  if (settings.demo) { boxes = demoCrowd(ctx, w, h, performance.now() / 1000); detectionAt = now; cameraState = 'demo'; message = 'Synthetic crowd · no camera images or cloud uploads'; }
  else {
    const scale = Math.min(w / video.videoWidth, h / video.videoHeight), vw = video.videoWidth * scale, vh = video.videoHeight * scale;
    ctx.save(); if (settings.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); } ctx.drawImage(video, (w - vw) / 2, (h - vh) / 2, vw, vh); ctx.restore();
  }
  if (now - detectionAt > 1600) boxes = [];
  const analysisWidth = [160, 256, 384][level], analysisHeight = analysisWidth * 9 / 16;
  if (small.width !== analysisWidth) { small.width = analysisWidth; small.height = analysisHeight; }
  sx.drawImage(canvas, 0, 0, analysisWidth, analysisHeight);
  if (!motionBusy && now - lastMotion > [140, 90, 65][level]) {
    const pixels = sx.getImageData(0, 0, analysisWidth, analysisHeight).data; motionBusy = true; motionSent = now;
    motionWorker.postMessage({ pixels, width: analysisWidth, height: analysisHeight, boxes, dt: Math.min(.5, (now - lastMotion) / 1000) }, [pixels.buffer]); lastMotion = now;
  }
  if (!settings.demo && detectorReady && !detectBusy && now - lastDetect > [650, 400, 300][level]) {
    const pixels = ctx.getImageData(0, 0, w, h).data; detectBusy = true; detectSent = now;
    detector.postMessage({ pixels, width: w, height: h, time: performance.now() }, [pixels.buffer]); lastDetect = now;
  }
  let preview;
  if (now - lastPreview > 1000) { preview = canvas.toDataURL('image/jpeg', .55); lastPreview = now; }
  publishing = true;
  try { await api.publish({ seq: ++seq, at: now, width: w, height: h, pixels: ctx.getImageData(0, 0, w, h).data, boxes, motion: now - (motion.at || 0) < 1500 ? motion : { points: [], calm: [], amount: 0 }, demo: settings.demo, preview }); } finally { publishing = false; }
}, 33);
setInterval(() => {
  const now = Date.now();
  if (motionBusy && now - motionSent > 3000) initMotion();
  if ((detectBusy || detectorState === 'starting') && now - detectSent > 15000) { detector.terminate(); detectorState = 'unavailable'; detectorReady = false; detectBusy = false; detectionRetry = now + 30000; }
  if (!detectorReady && detectorState === 'unavailable' && now >= detectionRetry) initDetector();
  api.health({ state: cameraState, message: detectorState === 'unavailable' && !settings.demo ? `${message}. Person detection unavailable; motion effects continue. Retrying the detector.` : message, devices, detector: settings.demo ? 'synthetic' : detectorState, detectorMs: Math.round(detectorMs), width: canvas.width, height: canvas.height, boxes: boxes.length });
}, 1000);
window.addEventListener('beforeunload', () => { stopCamera(); detector.terminate(); motionWorker.terminate(); });
