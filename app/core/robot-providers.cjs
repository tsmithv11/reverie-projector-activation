const PROVIDER_NAMES = { decart: 'Decart', fal: 'FAL' };
const PROVIDER_FAILURES = new Set(['AUTH_REJECTED', 'AUTH_NETWORK', 'AUTH_RESPONSE', 'FAL_CREDITS', 'FAL_RATE_LIMIT', 'FAL_SERVICE', 'DECART_CREDITS', 'DECART_RATE_LIMIT', 'DECART_SERVICE', 'SIGNALING', 'SIGNALING_BLOCKED', 'PEER_CONNECTION', 'VIDEO_STALLED', 'NO_VIDEO', 'INVALID_IMAGE', 'SESSION_BUSY', 'PROVIDER_ERROR', 'TIMEOUT', 'RENDERER_EXIT', 'CLIENT_ERROR']);
function configuredProviders(keys) { return ['decart', 'fal'].filter(provider => !!keys[provider]); }
function backupProvider(run, code) {
  return run && PROVIDER_FAILURES.has(code) ? run.providers[run.index + 1] || null : null;
}
module.exports = { PROVIDER_NAMES, configuredProviders, backupProvider };
