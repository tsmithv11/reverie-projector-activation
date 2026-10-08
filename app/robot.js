import { fal } from '@fal-ai/client';
import { usableDimensions, usablePixels } from './core/robot-result.js';
// Signaling message types verified against fal.ai's published Lucy WebRTC client.
// Only this frozen canvas stream leaves the computer. Never attach the webcam stream.
const api = window.installation;
let connection, peer, stream, remote, done = false, offered = false, pendingICE = [], mediaTimer, grace, repaint;
const timers = [];
function finish(image) {
  if (done) return; done = true;
  timers.forEach(clearTimeout); clearTimeout(mediaTimer); clearTimeout(grace); clearInterval(repaint);
  try { connection?.close(); } catch {} try { peer?.close(); } catch {}
  stream?.getTracks().forEach(t => t.stop()); remote?.getTracks().forEach(t => t.stop());
  api.complete({ ok: !!image, image });
}
const delay = ms => new Promise(resolve => timers.push(setTimeout(resolve, ms)));
async function offer(iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]) {
  if (offered || done) return; offered = true; clearTimeout(grace);
  peer = new RTCPeerConnection({ iceServers });
  for (const track of stream.getTracks()) peer.addTrack(track, stream);
  peer.onicecandidate = e => { if (!done && e.candidate) connection.send({ type: 'icecandidate', candidate: e.candidate.toJSON() }); };
  peer.onconnectionstatechange = () => { if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') finish(); };
  peer.ontrack = async e => {
    if (remote || done) return;
    remote = e.streams[0] || new MediaStream([e.track]);
    const video = document.querySelector('video'); video.srcObject = remote;
    try {
      await video.play(); await delay(3000); if (done || video.readyState < 2 || !usableDimensions(video.videoWidth, video.videoHeight)) { finish(); return; }
      const probe = document.createElement('canvas'); probe.width = 160; probe.height = 90;
      const probeCtx = probe.getContext('2d', { willReadFrequently: true }); probeCtx.drawImage(video, 0, 0, 160, 90);
      if (!usablePixels(probeCtx.getImageData(0, 0, 160, 90).data)) { finish(); return; }
      const result = document.createElement('canvas'); result.width = 1280; result.height = 720;
      const ctx = result.getContext('2d', { willReadFrequently: true });
      // Contain returned output to avoid stretching if the provider changes aspect ratio.
      ctx.fillStyle = '#271431'; ctx.fillRect(0, 0, 1280, 720); const scale = Math.min(1280 / video.videoWidth, 720 / video.videoHeight);
      ctx.drawImage(video, (1280 - video.videoWidth * scale) / 2, (720 - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale);
      finish(result.toDataURL('image/jpeg', .9));
    } catch { finish(); }
  };
  const sdp = await peer.createOffer(); await peer.setLocalDescription(sdp);
  if (!done) { connection.send({ type: 'offer', sdp: sdp.sdp }); mediaTimer = setTimeout(() => finish(), 10000); }
}
async function receive(message) {
  if (done) return;
  switch (message.type?.toLowerCase()) {
    case 'ready': { const servers = message.iceServers || message.ice_servers || message.iceservers; if (servers) await offer(servers); else grace = setTimeout(() => offer().catch(() => finish()), 1000); break; }
    case 'iceservers': await offer(message.iceServers || message.ice_servers || message.iceservers); break;
    case 'answer': if (peer && message.sdp && !peer.remoteDescription) { await peer.setRemoteDescription({ type: 'answer', sdp: message.sdp }); for (const c of pendingICE.splice(0)) await peer.addIceCandidate(c); } break;
    case 'icecandidate': if (message.candidate) { if (peer?.remoteDescription) await peer.addIceCandidate(message.candidate); else if (pendingICE.length < 40) pendingICE.push(message.candidate); } break;
    case 'error': finish(); break;
  }
}
try {
  const job = await api.job(); if (!job) throw Error('No job');
  const source = document.createElement('canvas'); source.width = job.width; source.height = job.height;
  source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(job.pixels), job.width, job.height), 0, 0);
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
  canvas.getContext('2d').drawImage(source, 0, 0, 1280, 720);
  stream = canvas.captureStream(30);
  // Repaint the SAME still to produce regular frames. No subsequent camera frames are read.
  repaint = setInterval(() => stream?.getVideoTracks()[0]?.requestFrame?.(), 33);
  timers.push(setTimeout(() => { clearInterval(repaint); finish(); }, 24000));
  connection = fal.realtime.connect('decart/lucy-2-5/realtime', { connectionKey: crypto.randomUUID(), maxBuffering: 2, throttleInterval: 0, tokenProvider: () => api.token(), onResult: data => receive(data).catch(() => finish()), onError: () => finish() });
  connection.send({ prompt: 'Replace every visible person with a friendly white ceramic and brushed-metal humanoid robot, dark mechanical joints, small cyan lights. Preserve each visible pose, body size, position, overlaps, perspective and framing as closely as possible. Preserve the original room, objects, lighting and background. Realistic physical robots, no text, no additional people, no camera movement.', enable_prompt_expansion: false });
} catch { finish(); }
window.addEventListener('beforeunload', () => { connection?.close(); peer?.close(); stream?.getTracks().forEach(t => t.stop()); remote?.getTracks().forEach(t => t.stop()); });
