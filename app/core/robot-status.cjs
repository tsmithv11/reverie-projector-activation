const { isLiveScene } = require('./live-scenes.cjs');
const FAILURES = {
  AUTH_REJECTED: 'The provider rejected the API key. Check the key and its permissions.',
  AUTH_NETWORK: 'Could not reach provider authentication. Check the internet connection.',
  AUTH_RESPONSE: 'The provider returned an invalid authentication response.',
  DECART_CREDITS: 'Decart requires account credit. Check billing in the Decart console.',
  DECART_RATE_LIMIT: 'Decart rate limit reached. Wait before trying again.',
  DECART_SERVICE: 'Decart authentication service is unavailable.',
  FAL_CREDITS: 'FAL requires account credit. Check billing in the FAL console.',
  FAL_RATE_LIMIT: 'FAL rate limit reached. Wait before trying again.',
  FAL_SERVICE: 'FAL authentication service is unavailable.',
  SIGNALING: 'Video signaling failed. Check service availability and the network.',
  SIGNALING_BLOCKED: 'The app security policy blocked video signaling. Update the installation build.',
  PEER_CONNECTION: 'The Lucy video connection failed. Check firewall, VPN, and WebRTC access.',
  VIDEO_STALLED: 'Lucy stopped returning live video for two seconds. Check the service and network.',
  CAMERA_LOST: 'The live camera stopped sending frames. Reconnect the camera.',
  DISPLAY_LOST: 'The audience display closed or restarted; the paid stream was stopped.',
  NO_VIDEO: 'Lucy did not return usable video before the connection deadline.',
  INVALID_IMAGE: 'Lucy returned an empty, black, or invalid image.',
  SESSION_BUSY: 'The provider refused the live connection: concurrent-session limit reached. This app opens one Lucy session at a time. Provider capacity is unconfirmed. If this persists, ask the provider’s support to check upstream sessions and quota.',
  PROVIDER_ERROR: 'Lucy reported a generation error.',
  TIMEOUT: 'Lucy exceeded the 25-second connection deadline.',
  RENDERER_EXIT: 'The isolated Lucy service stopped unexpectedly.',
  CANCELLED: 'Generation was cancelled by operator settings.',
  BUDGET_WRITE: 'Could not save the spending limit. Check settings-folder permissions.',
  CLIENT_ERROR: 'The Lucy client could not complete this request.'
};
function safeDiagnostic(value, secret = '') {
  let text = typeof value === 'string' ? value : typeof value?.message === 'string' ? value.message : typeof value?.detail === 'string' ? value.detail : '';
  if (secret) text = text.replaceAll(secret, '[redacted]');
  if (/v=0[\r\n]|a=ice-pwd|a=fingerprint/i.test(text)) return 'Provider rejected the video negotiation.';
  return text.replace(/(?:https?|wss?):\/\/\S+/gi, '[service address]')
    .replace(/\b(?:Bearer|Key)\s+\S+/gi, '[redacted]')
    .replace(/\b(?:token|api[_-]?key|credential|authorization)\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/[A-Za-z0-9_.+\/-]{32,}/g, '[redacted]')
    .replace(/[\r\n\t]+/g, ' ').slice(0, 200);
}
function classifyRobotFailure(code, detail) {
  const text = typeof detail === 'string' ? detail : detail?.message || detail?.detail || '';
  return ['PROVIDER_ERROR', 'SIGNALING'].includes(code) && /(?:concurrent\s+)?session[_\s]+limit(?:[_\s]+reached)?/i.test(text) ? 'SESSION_BUSY' : code;
}
function robotStatus({ settings, hasKey, gate, cloud, ready, camera, frameFresh, now }) {
  let reason = gate.reason(now, settings, hasKey);
  if (!settings.scenes.some(s => isLiveScene(s.id) && s.enabled)) reason = 'scene-disabled';
  else if (settings.demo) reason = 'demo';
  else if (!reason && (camera !== 'live' || !frameFresh)) reason = 'camera';
  const reasons = {
    disabled: 'Enable Lucy 2.5 to stream live robot and cartoon scenes.',
    'missing-key': 'No Decart or FAL key found. Add a key at the path shown below.',
    'scene-disabled': 'Enable Machine dreaming or Life in cartoon in the playlist.',
    demo: 'Rehearsal mode does not upload audience frames.',
    camera: 'A live camera frame is required.',
    busy: cloud.closing ? 'Closing the previous Lucy connection.' : 'Live camera streaming to Lucy.',
    'provider-wait': `Manual retry available in ${Math.max(1, Math.ceil((gate.retryAt - now) / 1000))} seconds. No automatic retry.`,
    'manual-retry': 'Manual retry available; provider capacity is unconfirmed. Automatic Lucy connections remain paused.',
    cooldown: `Next request allowed in ${Math.max(1, Math.ceil((gate.cooldownAt + settings.robotMinutes * 60000 - now) / 1000))} seconds.`,
    'session-cap': 'Live connection cap reached.',
    'hour-cap': 'Rolling limit of 12 live connections per hour reached.'
  };
  const blocked = ['disabled', 'missing-key', 'scene-disabled', 'demo'].includes(reason);
  const message = blocked ? `${reasons[reason]}${cloud.code ? ` Last failure: ${cloud.message}` : ''}` : cloud.message || reasons[reason] || 'Waiting for the next scheduled appearance.';
  return { ...cloud, state: blocked ? reason : cloud.state, message, ready, canGenerate: !reason, canRetry: gate.requiresManualRetry && !gate.reason(now, settings, hasKey, true) && !['scene-disabled', 'demo', 'camera'].includes(reason) && camera === 'live' && frameFresh, blockReason: reasons[reason] || '', display: ready ? `Live · Lucy 2.5 / ${cloud.provider === 'decart' ? 'Decart' : 'FAL'}` : cloud.state === 'connecting' ? 'Connecting · current scene continues' : 'Skipped · no live Lucy video' };
}
module.exports = { FAILURES, robotStatus, safeDiagnostic, classifyRobotFailure };
