// https://docs.platform.decart.ai/api-reference/create-client-token
const TOKEN_URL = 'https://api.decart.ai/v1/client/tokens';
async function mintDecartToken(key, fetcher = fetch) {
  const response = await fetcher(TOKEN_URL, {
    method: 'POST', headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 120, allowedModels: ['lucy-2.5'], constraints: { realtime: { maxSessionDuration: 100 } } }),
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw Object.assign(Error('Decart authentication unavailable'), { code: ({ 401: 'AUTH_REJECTED', 403: 'AUTH_REJECTED', 402: 'DECART_CREDITS', 429: 'DECART_RATE_LIMIT' })[response.status] || 'DECART_SERVICE' });
  const result = await response.json();
  if (typeof result?.apiKey !== 'string' || result.apiKey.length < 10 || result.apiKey.length > 16000) throw Object.assign(Error('Invalid Decart token response'), { code: 'AUTH_RESPONSE' });
  return result.apiKey;
}
module.exports = { mintDecartToken, TOKEN_URL };
