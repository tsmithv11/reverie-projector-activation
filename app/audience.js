import { registry } from './scenes/index.js';
import { SceneHost } from './core/scene-host.js';
import { AdaptiveQuality } from './core/performance.js';
import { camera } from './scenes/base.js';
const api = window.installation, canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d', { alpha: false });
const source = document.createElement('canvas'), sourceCtx = source.getContext('2d');
const robotCanvas = document.createElement('canvas'), robotCtx = robotCanvas.getContext('2d');
const previous = document.createElement('canvas'), previousCtx = previous.getContext('2d');
let state = await api.state(), latest = null, pulling = false, robotLatest = null, robotPulling = false, robotSeq = -1, robotSession = null, seq = -1;
let last = 0, deadline = 0, frames = 0, lastReport = performance.now(), fps = 0, crossfadeAt = -10000, failure = '', activation = -1;
const adaptive = new AdaptiveQuality(), host = new SceneHost(registry, (id, phase) => { failure = `Scene ${id} failed during ${phase}; isolated fallback active`; });
function receiveState(s) {
  state = s;
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
  try {
    const f = await api.frame(seq);
    if (f) { latest = f; seq = f.seq; if (source.width !== f.width || source.height !== f.height) { source.width = f.width; source.height = f.height; } sourceCtx.putImageData(new ImageData(new Uint8ClampedArray(f.pixels), f.width, f.height), 0, 0); }
  } catch {} finally { pulling = false; }
}
function ambient(w, h, time) {
  const gradient = ctx.createLinearGradient(0, 0, w, h); gradient.addColorStop(0, '#f6b5d5'); gradient.addColorStop(.5, '#c5a8dd'); gradient.addColorStop(1, '#6254ab'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.sin(time * .07) * .1 - .15);
  for (let i = 0; i < 5; i++) { ctx.strokeStyle = `rgba(255,225,244,${.1 + i * .035})`; ctx.lineWidth = w * .02; const s = w * (.2 + i * .12); ctx.strokeRect(-s / 2, -s / 2, s, s); }
  ctx.restore();
}
function finishComposition(w, h, time, cameraLive) {
  // The same angled portal and lower-third layout follows every scene.
  ctx.save();
  const wash = ctx.createLinearGradient(0, 0, w, h); wash.addColorStop(0, '#ffa0d055'); wash.addColorStop(1, '#8272db44');
  ctx.fillStyle = wash; ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.moveTo(w * .06, h * .14); ctx.lineTo(w * .92, h * .045); ctx.lineTo(w * .97, h * .87); ctx.lineTo(w * .1, h * .98); ctx.closePath(); ctx.fill('evenodd');
  ctx.strokeStyle = '#ffbadb70'; ctx.lineWidth = w * .018; ctx.beginPath(); ctx.moveTo(w * .06, h * .14); ctx.lineTo(w * .92, h * .045); ctx.lineTo(w * .97, h * .87); ctx.lineTo(w * .1, h * .98); ctx.closePath(); ctx.stroke();
  const shade = ctx.createLinearGradient(0, h * .66, 0, h); shade.addColorStop(0, '#27143100'); shade.addColorStop(1, '#271431d9'); ctx.fillStyle = shade; ctx.fillRect(0, h * .66, w, h * .34);
  ctx.fillStyle = '#fcedf6'; ctx.font = `500 ${w * .015}px sans-serif`; ctx.fillText('R E V E R I E', w * .055, h * .075);
  ctx.font = `${w * .011}px monospace`; ctx.textAlign = 'right'; ctx.fillText('A SHARED DAYDREAM', w * .95, h * .075); ctx.textAlign = 'left';
  const scene = state.scenes.find(s => s.id === state.active);
  ctx.font = `${w * .009}px monospace`; ctx.fillStyle = '#ecc9e5'; ctx.fillText(cameraLive ? `${String(state.scenes.findIndex(s => s.id === state.active) + 1).padStart(2, '0')} / COLLECTIVE IMAGINATION` : 'A MOMENT OF POSSIBILITY', w * .065, h * .825);
  ctx.fillStyle = '#fff4fb'; ctx.font = `400 ${w * .038}px Georgia, serif`; ctx.fillText(cameraLive ? scene?.name || 'A shared daydream' : 'The world is still dreaming.', w * .064, h * .897);
  if (latest?.demo && cameraLive) { ctx.textAlign = 'right'; ctx.font = `${w * .01}px monospace`; ctx.fillText('DEMO / SYNTHETIC CROWD', w * .94, h * .93); }
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
  const quality = adaptive.level, w = [1280, 1600, 1920][quality], h = w * 9 / 16;
  if (canvas.width !== w) { canvas.width = w; canvas.height = h; previous.width = w; previous.height = h; crossfadeAt = -10000; }
  const live = latest && Date.now() - latest.at < 2000;
  const robotLive = robotLatest && Date.now() - robotLatest.at < 2000 && state.cloud.ready;
  const context = { w, h, time: now / 1000, dt, quality, intensity: state.settings.intensity, frame: live ? source : null, analysis: live ? { boxes: latest.boxes, motion: latest.motion } : { boxes: [], motion: { points: [], calm: [], amount: 0 } }, robotVideo: robotLive ? robotCanvas : null, demo: latest?.demo || false };
  if (host.id !== state.active || activation !== state.activation) { previousCtx.drawImage(canvas, 0, 0); crossfadeAt = now; host.activate(state.active, context, activation !== state.activation); activation = state.activation; }
  ctx.resetTransform(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  const visible = !!state.active && (state.active === 'robots' ? robotLive : live);
  if (!visible) ambient(w, h, context.time);
  else if (!host.render(ctx, context)) { ambient(w, h, context.time); camera(ctx, source, w, h, .5); }
  finishComposition(w, h, context.time, visible);
  const transition = (now - crossfadeAt) / 1400;
  if (transition < 1) { const fade = Math.max(0, Math.min(1, transition)); ctx.globalAlpha = 1 - fade * fade * (3 - 2 * fade); ctx.drawImage(previous, 0, 0, w, h); ctx.globalAlpha = 1; }
  frames++;
  if (now - lastReport >= 1000) { fps = frames * 1000 / (now - lastReport); frames = 0; lastReport = now; adaptive.sample(fps, state.settings.quality); api.report({ fps: Math.round(fps * 10) / 10, quality: adaptive.level, scene: state.active, failure, robotSeq: robotLatest?.seq || 0, robotFrameAge: robotLatest ? Date.now() - robotLatest.at : null, frameAge: latest ? Date.now() - latest.at : null, particles: host.active?.bubbles?.length ?? host.active?.plants?.length ?? 0 }); }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key.toLowerCase() === 'o') api.command('controls');
  if (e.key.toLowerCase() === 'f') api.command('fullscreen');
  if (e.key === ' ') { e.preventDefault(); api.command('pause'); }
  if (e.key === 'ArrowRight') api.command('next');
  if (/^[1-5]$/.test(e.key)) api.command('select', state.scenes[Number(e.key) - 1].id);
});
window.addEventListener('beforeunload', () => host.cleanup());
requestAnimationFrame(tick);
