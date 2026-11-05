import { createDecartClient, models } from '@decartai/sdk';
import { liveScene } from './live-scenes.cjs';
import { safeDiagnostic } from './robot-status.cjs';

export const decartModel = sceneId => models.realtime(liveScene(sceneId).model);
const quietLogger = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, () => {}]));

// The SDK wraps useful failures (including prompt rejection) in a generic
// "Signaling error". Keep the cause, but never pass credentials or raw SDK data
// out of this service. Bound traversal because causes can be circular.
export function decartFailure(error, token = '') {
  const codes = {
    INVALID_API_KEY: 'AUTH_REJECTED', TOKEN_INVALID: 'AUTH_REJECTED', TOKEN_EXPIRED: 'AUTH_REJECTED',
    WEBRTC_SIGNALING_ERROR: 'SIGNALING', WEBRTC_WEBSOCKET_ERROR: 'SIGNALING',
    WEBRTC_ICE_ERROR: 'PEER_CONNECTION', LIVEKIT_INITIALIZATION_ERROR: 'PEER_CONNECTION',
    WEBRTC_TIMEOUT_ERROR: 'TIMEOUT', INVALID_INPUT: 'CLIENT_ERROR', INVALID_OPTIONS: 'CLIENT_ERROR'
  };
  let current = error, message = '', code = 'PROVIDER_ERROR';
  const seen = new Set();
  for (let depth = 0; current && depth < 8 && !seen.has(current); depth++) {
    seen.add(current);
    if (codes[current.code]) code = codes[current.code];
    const detail = typeof current === 'string' ? current : current.message;
    if (typeof detail === 'string' && detail.trim()) message = detail;
    current = current.cause;
  }
  if (/content contains copyrighted IP/i.test(message)) code = 'PROMPT_REJECTED';
  return { code, detail: safeDiagnostic(message, token) };
}

// SDK 0.2.5 exposes disconnect only after connect resolves. Track transports
// inside this dedicated service so timeout/stop also closes a pending connect.
// Keep constructors guarded through teardown to prevent SDK/LiveKit redials.
export function ownDecartTransports(scope, onError) {
  const NativeSocket = scope.WebSocket, NativePeer = scope.RTCPeerConnection;
  const sockets = [], peers = [];
  let stopped = false, closing;
  scope.WebSocket = class extends NativeSocket {
    constructor(...args) {
      if (stopped) throw Error('Decart connection stopped');
      super(...args);
      const entry = { socket: this };
      entry.closed = new Promise(resolve => this.addEventListener('close', event => {
        resolve(event.wasClean && event.code === 1000);
        if (!stopped) onError('SIGNALING', event.reason || 'Decart connection closed.');
      }, { once: true }));
      sockets.push(entry);
    }
  };
  scope.RTCPeerConnection = class extends NativePeer {
    constructor(...args) {
      if (stopped) throw Error('Decart connection stopped');
      super(...args); peers.push(this);
    }
  };
  return {
    close(disconnect) {
      if (closing) return closing;
      stopped = true;
      try { disconnect?.(); } catch {}
      for (const peer of peers) { try { peer.close(); } catch {} }
      for (const { socket } of sockets) { try { if (socket.readyState < NativeSocket.CLOSING) socket.close(1000); } catch {} }
      closing = new Promise(resolve => {
        const timer = setTimeout(() => resolve({ acknowledged: false, code: null }), 3500);
        Promise.all(sockets.map(entry => entry.closed)).then(results => {
          clearTimeout(timer); resolve({ acknowledged: results.every(Boolean), code: 1000, noSocket: sockets.length === 0 });
        });
      });
      return closing;
    }
  };
}

export function openDecartConnection({ token, stream, sceneId, onRemoteStream, onError, onStage }) {
  const scene = liveScene(sceneId), model = decartModel(sceneId);
  let realtime, stopped = false, connected = false;
  const transports = ownDecartTransports(globalThis, (code, detail) => { if (!stopped) onError(code, safeDiagnostic(detail, token)); });
  const client = createDecartClient({ apiKey: token, telemetry: false, logger: quietLogger });
  const close = () => { stopped = true; return transports.close(() => realtime?.disconnect()); };
  const failed = error => {
    if (stopped) return;
    const { code, detail } = decartFailure(error, token);
    onError(code, detail);
  };
  client.realtime.connect(stream, {
    model, mirror: false, retries: 0,
    // Keep changing audiences anchored to live input even as lucy-latest advances.
    // Restyle 2 does not expose this setting; only opted-in scenes send it.
    ...(scene.selfAnchor === false ? { queryParams: { self_anchor: 'false' } } : {}),
    initialState: { prompt: { text: scene.prompt, enhance: scene.enhance === true } },
    onRemoteStream: remote => { if (!stopped) onRemoteStream(remote); else remote.getTracks().forEach(track => track.stop()); },
    onConnectionChange: state => {
      if (stopped) return;
      // SDK reconnects can create another paid session. Stop synchronously
      // before its reconnect handler can dial, then let main choose the backup.
      if (state === 'reconnecting' || (connected && state === 'disconnected')) {
        close(); onError('PEER_CONNECTION');
      } else if (state === 'connected' || state === 'generating') { connected = true; onStage('receiving-video'); }
    }
  }).then(result => {
    realtime = result;
    if (stopped) { realtime.disconnect(); return; }
    realtime.on('error', failed);
    realtime.on('sessionEnded', event => failed({ message: event.reason }));
  }).catch(failed);
  return { close };
}
