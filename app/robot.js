import { decartModel, openDecartConnection } from './core/decart-connection.js';
import { openLucySignaling } from './core/lucy-signaling.js';
import { usableDimensions, usablePixels } from './core/robot-result.js';
import { CARTOON_PROMPT } from './core/live-scenes.cjs';
// This isolated service sends current camera frames and publishes current Lucy
// video frames. There is no snapshot, JPEG cache, or substitute robot drawing.
const api = window.installation;
let connection, peer, stream, remote, done = false, offered = false, pendingICE = [], grace, inputTimer, watchdog;
let job, closing, inputSeq = -1, outputSeq = 0, inputBusy = false, lastInput = Date.now(), lastOutput = 0;
function close() {
  if (closing) return closing;
  done = true; clearTimeout(grace); clearInterval(inputTimer); clearInterval(watchdog);
  closing = connection?.close() || Promise.resolve({ acknowledged: true, code: null, noSocket: true });
  try { peer?.close(); } catch {}
  stream?.getTracks().forEach(t => t.stop()); remote?.getTracks().forEach(t => t.stop());
  return closing;
}
function fail(code = 'CLIENT_ERROR', detail) { if (done) return; close(); api.complete({ code, detail }); }
api.onStop(async ({ id }) => {
  const result = await close();
  // A socket close handshake still does not acknowledge upstream quota release.
  api.closed({ id, ...result });
});
window.addEventListener('securitypolicyviolation', event => { if (event.effectiveDirective === 'connect-src') fail('SIGNALING_BLOCKED'); });
async function offer(iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]) {
  if (offered || done) return; offered = true; clearTimeout(grace); api.stage('connecting-video');
  peer = new RTCPeerConnection({ iceServers });
  for (const track of stream.getTracks()) peer.addTrack(track, stream);
  peer.onicecandidate = e => { if (!done && e.candidate) connection.send({ type: 'icecandidate', candidate: e.candidate.toJSON() }); };
  peer.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) fail('PEER_CONNECTION'); };
  peer.ontrack = e => receiveStream(e.streams[0] || new MediaStream([e.track]));
  const sdp = await peer.createOffer(); await peer.setLocalDescription(sdp);
  if (!done) connection.send({ type: 'offer', sdp: sdp.sdp });
}
async function receiveStream(incoming) {
  if (remote || done || !incoming.getVideoTracks().length) return;
  remote = incoming; api.stage('receiving-video');
  for (const track of remote.getVideoTracks()) track.onended = () => fail('VIDEO_STALLED');
  const video = document.querySelector('video'); video.srcObject = remote;
  const output = document.createElement('canvas'); output.width = 960; output.height = 540;
  const ctx = output.getContext('2d', { willReadFrequently: true });
  let publishDeadline = 0;
  const publish = async now => {
    if (done) return;
    // A decoded-frame callback, not a timer: a frozen remote stream cannot
    // keep the main-process freshness watchdog alive by repainting old pixels.
    if (now + .8 < publishDeadline) { video.requestVideoFrameCallback(publish); return; }
    publishDeadline = (publishDeadline || now) + 1000 / 24;
    if (publishDeadline < now) publishDeadline = now + 1000 / 24;
    if (!usableDimensions(video.videoWidth, video.videoHeight)) { fail('INVALID_IMAGE'); return; }
    ctx.fillStyle = '#271431'; ctx.fillRect(0, 0, 960, 540);
    const scale = Math.min(960 / video.videoWidth, 540 / video.videoHeight);
    ctx.drawImage(video, (960 - video.videoWidth * scale) / 2, (540 - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale);
    const pixels = ctx.getImageData(0, 0, 960, 540).data;
    if (!usablePixels(pixels)) { if (lastOutput) fail('INVALID_IMAGE'); else video.requestVideoFrameCallback(publish); return; }
    lastOutput = Date.now();
    try {
      // Awaiting the acknowledgement bounds IPC to one frame in flight.
      await api.publish({ sessionId: job.id, seq: ++outputSeq, width: 960, height: 540, pixels });
      if (!done) video.requestVideoFrameCallback(publish);
    } catch { fail('CLIENT_ERROR'); }
  };
  try { await video.play(); if (!done) video.requestVideoFrameCallback(publish); } catch { fail('CLIENT_ERROR'); }
}
async function receive(message) {
  if (done) return;
  switch (message.type?.toLowerCase()) {
    case 'ready': { const servers = message.iceServers || message.ice_servers || message.iceservers; if (servers) await offer(servers); else grace = setTimeout(() => offer().catch(() => fail()), 1000); break; }
    case 'iceservers': await offer(message.iceServers || message.ice_servers || message.iceservers); break;
    case 'answer': if (peer && message.sdp && !peer.remoteDescription) { await peer.setRemoteDescription({ type: 'answer', sdp: message.sdp }); for (const c of pendingICE.splice(0)) await peer.addIceCandidate(c); } break;
    case 'icecandidate': if (message.candidate) { if (peer?.remoteDescription) await peer.addIceCandidate(message.candidate); else if (pendingICE.length < 40) pendingICE.push(message.candidate); } break;
    case 'error': fail('PROVIDER_ERROR', message.error || message.message); break;
  }
}
try {
  job = await api.job(); if (!job || done) throw Error('No session');
  const source = document.createElement('canvas'), sourceCtx = source.getContext('2d');
  const canvas = document.createElement('canvas'); canvas.width = job.provider === 'decart' ? decartModel.width : 1280; canvas.height = job.provider === 'decart' ? decartModel.height : 720;
  const ctx = canvas.getContext('2d');
  const input = async () => {
    if (done || inputBusy) return; inputBusy = true;
    try {
      const f = await api.frame(inputSeq); if (!f || done) return;
      inputSeq = f.seq; lastInput = Date.now();
      if (source.width !== f.width || source.height !== f.height) { source.width = f.width; source.height = f.height; }
      sourceCtx.putImageData(new ImageData(new Uint8ClampedArray(f.pixels), f.width, f.height), 0, 0);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      stream?.getVideoTracks()[0]?.requestFrame?.();
    } finally { inputBusy = false; }
  };
  await input(); if (done || inputSeq < 0) throw Error('Camera unavailable');
  stream = canvas.captureStream(30);
  inputTimer = setInterval(() => input().catch(() => fail('CAMERA_LOST')), 33);
  watchdog = setInterval(() => {
    if (Date.now() - lastInput > 2000) fail('CAMERA_LOST');
    else if (lastOutput && Date.now() - lastOutput > 2000) fail('VIDEO_STALLED');
  }, 250);
  api.stage('authenticating');
  const token = await api.token(); if (!token || done) throw Error('Authentication failed');
  api.stage('signaling');
  const prompt = job.sceneId === 'cartoon' ? CARTOON_PROMPT : 'Transform each visible person into a realistic ceramic and brushed-metal humanoid robot. Only transform the people and nothing one else.';
  if (job.provider === 'decart') {
    api.stage('connecting-video');
    connection = openDecartConnection({ token, stream, prompt, onRemoteStream: receiveStream, onError: fail, onStage: phase => api.stage(phase) });
  } else connection = openLucySignaling({ token,
    input: { prompt, enable_prompt_expansion: false },
    onResult: receive, onError: detail => fail('SIGNALING', detail),
    onDiagnostic: (event, detail) => api.diagnostic({ event, ...detail })
  });
} catch (error) { fail('CLIENT_ERROR', error?.message); }
window.addEventListener('beforeunload', close);
