import { encode, decode } from '@msgpack/msgpack';

// The FAL Lucy wire protocol, with a single-use socket and observable shutdown.
// The generic SDK's close() returns before its socket closes and cannot cancel
// a CONNECTING socket. Never reconnect or replay an input behind the spending gate.
export function openLucySignaling({ token, input, onResult, onError, onDiagnostic = () => {}, Socket = WebSocket, closeTimeoutMs = 4000 }) {
  const url = new URL('wss://fal.run/decart/lucy-2-5/realtime');
  url.searchParams.set('fal_jwt_token', token);
  url.searchParams.set('max_buffering', '40');
  const socket = new Socket(url.href);
  socket.binaryType = 'arraybuffer';
  let closing = false, settled = false, timer, resolveClosed, messages = Promise.resolve();
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const finish = result => {
    if (settled) return;
    settled = true; clearTimeout(timer); resolveClosed(result);
  };
  const fail = detail => { if (!closing) onError(detail); };
  const send = message => {
    if (closing) return false;
    // A provider refusal can arrive while createOffer() is still pending and
    // put the socket into CLOSING before its error message is processed. Let
    // that message (or onclose) report the cause; a late send must not mask it.
    if (socket.readyState !== Socket.OPEN) return false;
    socket.send(encode(message));
    if (message.prompt) onDiagnostic('prompt-sent');
    if (message.type === 'offer') onDiagnostic('offer-sent');
    return true;
  };
  socket.onopen = () => { if (!closing) { onDiagnostic('socket-open'); send(input); } };
  socket.onmessage = event => {
    messages = messages.then(async () => {
      if (closing) return;
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : decode(new Uint8Array(event.data instanceof Blob ? await event.data.arrayBuffer() : event.data));
      if (closing) return;
      if (data.type === 'x-fal-message') return;
      if (data.type === 'x-fal-error') { if (data.error !== 'TIMEOUT') fail(`${data.error || 'FAL error'}: ${data.reason || ''}`); return; }
      if (data.status === 'error') { fail(data.error || 'FAL signaling error.'); return; }
      await onResult(data);
    }).catch(() => fail('Could not process Lucy signaling.'));
  };
  socket.onerror = () => fail('FAL signaling socket failed.');
  socket.onclose = event => {
    finish({ acknowledged: event.wasClean, code: event.code });
    onDiagnostic('socket-closed', { acknowledged: event.wasClean, code: event.code });
    // Drain received messages first so an in-flight negotiation cannot replace
    // a queued SESSION_BUSY refusal with a generic socket-close error.
    void messages.then(() => fail(`FAL signaling closed (code ${event.code}).`));
  };
  onDiagnostic('socket-created');
  return {
    send,
    close() {
      if (!closing) {
        closing = true;
        if (!settled) {
          timer = setTimeout(() => finish({ acknowledged: false, code: null }), closeTimeoutMs);
          // Explicit normal closure, including cancellation during CONNECTING.
          // Keep the worker alive until the close event, not an arbitrary grace.
          try { socket.close(1000, 'Scene ended'); } catch { finish({ acknowledged: false, code: null }); }
        }
      }
      return closed;
    }
  };
}
