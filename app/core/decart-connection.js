import { createDecartClient, models } from '@decartai/sdk';

export const decartModel = models.realtime('lucy-2.5');
const quietLogger = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, () => {}]));

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

export function openDecartConnection({ token, stream, prompt, onRemoteStream, onError, onStage }) {
  let realtime, stopped = false, connected = false;
  const transports = ownDecartTransports(globalThis, (code, detail) => { if (!stopped) onError(code, detail); });
  const client = createDecartClient({ apiKey: token, telemetry: false, logger: quietLogger });
  const close = () => { stopped = true; return transports.close(() => realtime?.disconnect()); };
  client.realtime.connect(stream, {
    model: decartModel, mirror: false, retries: 0,
    initialState: { prompt: { text: prompt, enhance: false } },
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
    realtime.on('error', error => onError(error.code === 'INVALID_API_KEY' ? 'AUTH_REJECTED' : 'PROVIDER_ERROR', error.message));
    realtime.on('sessionEnded', event => onError('PROVIDER_ERROR', event.reason));
  }).catch(error => { if (!stopped) onError(error.code === 'INVALID_API_KEY' ? 'AUTH_REJECTED' : 'PROVIDER_ERROR', error.message); });
  return { close };
}
