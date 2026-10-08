// Matches @fal-ai/client 1.10.1 auth.js + config.js. No retry of a failed call.
const TOKEN_URL = 'https://rest.fal.ai/tokens/';
async function mintLucyToken(key, fetcher = fetch) {
  const response = await fetcher(TOKEN_URL, { method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ allowed_apps: ['lucy-2-5'], token_expiration: 30 }), signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw Error('FAL authentication unavailable');
  const result = await response.json();
  const token = typeof result === 'string' ? result : result?.detail;
  if (typeof token !== 'string' || token.length < 10 || token.length > 16000) throw Error('Invalid FAL token response');
  return token;
}
module.exports = { mintLucyToken, TOKEN_URL };
