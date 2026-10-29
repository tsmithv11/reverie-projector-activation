import { registry } from './scenes/index.js';
import { SceneHost } from './core/scene-host.js';
import { AdaptiveQuality } from './core/performance.js';
import { outputSize, fitCameraAnalysis } from './core/display.js';
import { camera } from './scenes/base.js';
import { isLiveScene } from './core/live-scenes.cjs';
import { portalGeometry, polygonPath, artworkTransform, paintBackground, paintTransition } from './core/composition.js';
const api = window.installation, canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d', { alpha: false });
const brandLogo = new Image();
brandLogo.src = 'brand/reverie-logo-white.svg';
let brandLogoReady = false;
brandLogo.decode().then(() => { brandLogoReady = true; }).catch(error => console.error('Reverie logo failed to load', error));
const source = document.createElement('canvas'), sourceCtx = source.getContext('2d');
const robotCanvas = document.createElement('canvas'), robotCtx = robotCanvas.getContext('2d');
const previous = document.createElement('canvas'), previousCtx = previous.getContext('2d');
const artworkCanvas = document.createElement('canvas'), artworkCtx = artworkCanvas.getContext('2d', { alpha: false });
artworkCanvas.width = artworkCanvas.height = 1;
let state = await api.state(), latest = null, pulling = false, robotLatest = null, robotPulling = false, robotSeq = -1, robotSession = null, seq = -1;
let last = 0, deadline = 0, frames = 0, lastReport = performance.now(), fps = 0, transitionAt = -10000, failure = '', activation = -1;
let portal, portalKey;
const isArtworkScene = id => id === 'monsters' || id === 'garden';
const adaptive = new AdaptiveQuality(), host = new SceneHost(registry, (id, phase) => { failure = `Scene ${id} failed during ${phase}; isolated fallback active`; });
function receiveState(s) {
  // Refetch even the current packet when changing between analysis and video.
  if (isArtworkScene(state.active) !== isArtworkScene(s.active)) { seq = -1; latest = null; }
  state = s;
  canvas.style.objectFit = s.settings.displayFormat === 'fill' ? 'fill' : 'contain';
  if (s.cloud.sessionId !== robotSession) { robotSession = s.cloud.sessionId; robotLatest = null; robotSeq = -1; }
}
api.onState(receiveState);
receiveState(state);
async function pullRobot() {
  if (robotPulling || !robotSession) return; robotPulling = true;
  try {
    const f = await api.robotFrame(robotSeq);
    if (!f || f.sessionId !== robotSession) return;
    if (robotCanvas.width !== f.width || robotCanvas.height !== f.height) { robotCanvas.width = f.width; robotCanvas.height = f.height; }
    robotCtx.putImageData(new ImageData(new Uint8ClampedArray(f.pixels), f.width, f.height), 0, 0);
    const first = !robotLatest; robotLatest = f; robotSeq = f.seq;
    if (first) await api.robotDecoded(f.sessionId);
  } catch {} finally { robotPulling = false; }
}
async function pull() {
  if (pulling) return; pulling = true;
  const analysisOnly = isArtworkScene(state.active);
  try {
    const f = await api.frame(seq, analysisOnly);
    // A scene change may occur while IPC is in flight. Discard the wrong format.
    if (!f || analysisOnly !== isArtworkScene(state.active) || (!analysisOnly && !f.pixels)) return;
    latest = f; seq = f.seq;
    if (!analysisOnly) {
      if (source.width !== f.width || source.height !== f.height) { source.width = f.width; source.height = f.height; }
      sourceCtx.putImageData(new ImageData(new Uint8ClampedArray(f.pixels), f.width, f.height), 0, 0);
    }
  } catch {} finally { pulling = false; }
}
function renderCameraPortal(context) {
  const { frame, w, h } = context;
  if (frame) camera(ctx, frame, w, h);
  else paintBackground(ctx, w, h);
  // Keep camera coordinates aligned across the opening and its tinted surround.
  ctx.save(); ctx.beginPath(); polygonPath(ctx, portal.inner); ctx.clip();
  const rendered = host.render(ctx, context);
  ctx.restore(); return rendered;
}
function renderArtworkPortal(context) {
  const { w, h } = context;
  const landscape = state.active === 'monsters';
  paintBackground(ctx, w, h);
  ctx.save();
  if (!landscape) {
    ctx.beginPath(); polygonPath(ctx, portal.inner); ctx.clip();
    ctx.transform(...artworkTransform(portal, w, h));
  }
  let rendered;
  if (isArtworkScene(state.active)) {
    // Quarter as many artwork pixels, then upscale once inside the crisp portal.
    const gw = w / 2, gh = h / 2;
    if (artworkCanvas.width !== gw || artworkCanvas.height !== gh) { artworkCanvas.width = gw; artworkCanvas.height = gh; }
    // The bay stays upright and continuous across the frame. Only its creature
    // and particle layer is clipped; the empty landscape fills the whole output.
    const foregroundClip = landscape ? portal.inner.map(p => ({ x: p.x / w, y: p.y / h })) : undefined;
    rendered = host.render(artworkCtx, { ...context, w: gw, h: gh, frame: null, foregroundClip });
    if (rendered) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; ctx.drawImage(artworkCanvas, 0, 0, w, h); }
  } else rendered = host.render(ctx, context);
  ctx.restore(); return rendered;
}
function finishComposition(w, h, cameraLive) {
  // Every world shares the reference silhouette, with its own fixed rotation.
  ctx.save();
  const cameraScene = ['heat', 'lines', 'words'].includes(state.active) || isLiveScene(state.active);
  const wash = ctx.createLinearGradient(0, 0, w, h);
  wash.addColorStop(0, cameraScene ? '#ff8fcf99' : '#ffa0d055');
  wash.addColorStop(1, cameraScene ? '#627aeb99' : '#8272db44');
  if (cameraScene || state.active === 'monsters') { ctx.fillStyle = wash; ctx.beginPath(); ctx.rect(0, 0, w, h); polygonPath(ctx, portal.inner); ctx.fill('evenodd'); }
  const border = ctx.createLinearGradient(0, 0, w, h);
  border.addColorStop(0, '#ef8bc8'); border.addColorStop(1, '#ba79c2');
  ctx.fillStyle = border; ctx.beginPath(); polygonPath(ctx, portal.outer); polygonPath(ctx, portal.inner); ctx.fill('evenodd');
  if (state.active !== 'monsters' && state.active !== 'garden' && state.active !== 'words') {
    ctx.save(); ctx.beginPath(); polygonPath(ctx, portal.inner); ctx.clip();
    const shade = ctx.createLinearGradient(0, h * .66, 0, h); shade.addColorStop(0, '#27143100'); shade.addColorStop(1, '#271431d9'); ctx.fillStyle = shade; ctx.fillRect(0, h * .66, w, h * .34);
    ctx.restore();
  }
  if (brandLogoReady) {
    const logoWidth = w * .145, logoHeight = logoWidth * 224.984 / 1026;
    ctx.drawImage(brandLogo, w * .055, h * .075 - logoHeight, logoWidth, logoHeight);
  }
  if (latest?.demo && cameraLive) { ctx.fillStyle = '#fff4fb'; ctx.textAlign = 'right'; ctx.font = `${w * .01}px monospace`; ctx.fillText('DEMO / SYNTHETIC CROWD', w * .94, h * .93); }
  ctx.restore();
}
function tick(now) {
  requestAnimationFrame(tick);
  if (now + .8 < deadline) return;
  // Carry the fractional deadline forward; resetting it to `now` loses refreshes
  // when a 60 Hz display's callbacks arrive a fraction of a millisecond early.
  deadline = (deadline || now) + 1000 / 30;
  if (deadline < now) deadline = now + 1000 / 30;
  const dt = Math.min(.1, (now - (last || now)) / 1000); last = now;
  pull(); pullRobot();
  const quality = adaptive.level;
  const { width: w, height: h } = outputSize(state.settings.displayFormat, quality, innerWidth * devicePixelRatio, innerHeight * devicePixelRatio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    // A new opaque canvas starts black; seed it before any transition snapshot.
    paintBackground(ctx, w, h);
  }
  const nextPortalKey = `${w}:${h}:${innerWidth}:${innerHeight}:${state.active}`;
  if (portalKey !== nextPortalKey) { portal = portalGeometry(w, h, state.active, innerWidth, innerHeight); portalKey = nextPortalKey; }
  const live = latest && Date.now() - latest.at < 2000;
  const robotLive = robotLatest && Date.now() - robotLatest.at < 2000 && state.cloud.ready && state.cloud.sceneId === state.active;
  let analysis = live ? { boxes: latest.boxes, motion: latest.motion } : { boxes: [], motion: { points: [], calm: [], amount: 0 } };
  if (live && !isArtworkScene(state.active)) analysis = fitCameraAnalysis(analysis, latest.width, latest.height, w, h);
  const context = { w, h, time: now / 1000, dt, quality, intensity: state.settings.intensity, frame: live && !isArtworkScene(state.active) ? source : null, analysis, robotVideo: robotLive ? robotCanvas : null, demo: latest?.demo || false };
  if (host.id !== state.active || activation !== state.activation) {
    if (!isArtworkScene(state.active)) artworkCanvas.width = artworkCanvas.height = 1;
    previous.width = w; previous.height = h; previousCtx.drawImage(canvas, 0, 0);
    transitionAt = now; host.activate(state.active, context, activation !== state.activation); activation = state.activation;
  }
  ctx.resetTransform(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  // Artwork scenes remain alive without camera packets. Only interaction needs them.
  const artworkOnly = isArtworkScene(state.active);
  const visible = !!state.active && (artworkOnly || (isLiveScene(state.active) ? robotLive : live));
  if (!visible) paintBackground(ctx, w, h);
  else if (!(artworkOnly ? renderArtworkPortal(context) : renderCameraPortal(context))) { paintBackground(ctx, w, h); if (!artworkOnly) camera(ctx, source, w, h, .5); }
  finishComposition(w, h, live);
  paintTransition(ctx, previous, w, h, now - transitionAt);
  frames++;
  if (now - lastReport >= 1000) { fps = frames * 1000 / (now - lastReport); frames = 0; lastReport = now; adaptive.sample(fps, state.settings.quality); api.report({ fps: Math.round(fps * 10) / 10, quality: adaptive.level, scene: state.active, failure, outputWidth: w, outputHeight: h, sceneWidth: artworkOnly ? artworkCanvas.width : w, sceneHeight: artworkOnly ? artworkCanvas.height : h, robotSeq: robotLatest?.seq || 0, robotFrameAge: robotLatest ? Date.now() - robotLatest.at : null, frameAge: latest ? Date.now() - latest.at : null, particles: host.active?.bubbles?.length ?? host.active?.plants?.length ?? 0 }); }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key.toLowerCase() === 'o') api.command('controls');
  if (e.key.toLowerCase() === 'f') api.command('fullscreen');
  if (e.key === ' ') { e.preventDefault(); api.command('pause'); }
  if (e.key === 'ArrowRight') api.command('next');
  if (/^[1-9]$/.test(e.key) && state.scenes[Number(e.key) - 1]) api.command('select', state.scenes[Number(e.key) - 1].id);
});
window.addEventListener('beforeunload', () => host.cleanup());
requestAnimationFrame(tick);
