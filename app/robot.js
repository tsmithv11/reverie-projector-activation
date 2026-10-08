import { fal } from '@fal-ai/client';
import { usableDimensions, usablePixels } from './core/robot-result.js';
// This isolated service sends current camera frames and publishes current Lucy
// video frames. There is no snapshot, JPEG cache, or substitute robot drawing.
const api = window.installation;
let connection, peer, stream, remote, done = false, offered = false, pendingICE = [], grace, inputTimer, watchdog;
let job, inputSeq = -1, outputSeq = 0, inputBusy = false, lastInput = Date.now(), lastOutput = 0;
function close() {
  done = true; clearTimeout(grace); clearInterval(inputTimer); clearInterval(watchdog);
  try { connection?.close(); } catch {} try { peer?.close(); } catch {}
  stream?.getTracks().forEach(t => t.stop()); remote?.getTracks().forEach(t => t.stop());
}
function fail(code = 'CLIENT_ERROR', detail) { if (done) return; close(); api.complete({ code, detail }); }
api.onStop(({ id }) => {
  close();
  // Keep the renderer alive briefly so socket/peer close traffic can be sent.
  // This acknowledges local cleanup, not server-side release of the quota slot.
  setTimeout(() => api.closed(id), 500);
});
window.addEventListener('securitypolicyviolation', event => { if (event.effectiveDirective === 'connect-src') fail('SIGNALING_BLOCKED'); });
async function offer(iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]) {
  if (offered || done) return; offered = true; clearTimeout(grace); api.stage('connecting-video');
  peer = new RTCPeerConnection({ iceServers });
  for (const track of stream.getTracks()) peer.addTrack(track, stream);
  peer.onicecandidate = e => { if (!done && e.candidate) connection.send({ type: 'icecandidate', candidate: e.candidate.toJSON() }); };
  peer.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) fail('PEER_CONNECTION'); };
  peer.ontrack = async e => {
    if (remote || done) return;
    remote = e.streams[0] || new MediaStream([e.track]); api.stage('receiving-video');
    e.track.onended = () => fail('VIDEO_STALLED');
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
  };
  const sdp = await peer.createOffer(); await peer.setLocalDescription(sdp);
  if (!done) connection.send({ type: 'offer', sdp: sdp.sdp });
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
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const input = async () => {
    if (done || inputBusy) return; inputBusy = true;
    try {
      const f = await api.frame(inputSeq); if (!f || done) return;
      inputSeq = f.seq; lastInput = Date.now();
      if (source.width !== f.width || source.height !== f.height) { source.width = f.width; source.height = f.height; }
      sourceCtx.putImageData(new ImageData(new Uint8ClampedArray(f.pixels), f.width, f.height), 0, 0);
      ctx.drawImage(source, 0, 0, 1280, 720);
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
  connection = fal.realtime.connect('decart/lucy-2-5/realtime', { connectionKey: crypto.randomUUID(), maxBuffering: 40, throttleInterval: 0, tokenProvider: async () => { api.stage('authenticating'); const token = await api.token(); if (!token || done) throw Error('Authentication failed'); api.stage('signaling'); return token; }, onResult: data => receive(data).catch(() => fail('SIGNALING')), onError: error => fail('SIGNALING', error?.message) });
  connection.send({ prompt: 'Transform each visible person into a friendly realistic white ceramic and brushed-metal humanoid robot with dark mechanical joints and small cyan lights. Follow their movements continuously in realtime. Preserve the exact number of people, their poses, body sizes, positions, overlaps, perspective and framing. Preserve the original room, objects, lighting and background. No additional people or robots, no text, no camera movement.', enable_prompt_expansion: false });
} catch { fail('CLIENT_ERROR'); }
window.addEventListener('beforeunload', close);
