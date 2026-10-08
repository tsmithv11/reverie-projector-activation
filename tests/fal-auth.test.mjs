import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { usableDimensions, usablePixels } from '../app/core/robot-result.js';
const { mintLucyToken, TOKEN_URL } = createRequire(import.meta.url)('../app/core/fal-auth.cjs');
test('FAL auth uses SDK-verified REST URL, alias scope, expiration and JSON-string response', async () => {
  let request;
  const token = await mintLucyToken('example-secret', async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => 'temporary-token' }; });
  assert.equal(token, 'temporary-token'); assert.equal(request.url, 'https://rest.fal.ai/tokens/'); assert.equal(request.url, TOKEN_URL);
  assert.deepEqual(JSON.parse(request.body), { allowed_apps: ['lucy-2-5'], token_expiration: 120 }); assert(request.signal instanceof AbortSignal);
});
test('FAL auth accepts legacy wrapper, fails closed on malformed/error responses and never retries', async () => {
  assert.equal(await mintLucyToken('x', async () => ({ ok: true, json: async () => ({ detail: 'temporary-token' }) })), 'temporary-token');
  await assert.rejects(mintLucyToken('x', async () => ({ ok: true, json: async () => ({ images: [] }) })), /Invalid/);
  let attempts = 0; await assert.rejects(mintLucyToken('x', async () => { attempts++; return { ok: false }; }), /unavailable/); assert.equal(attempts, 1);
});
test('cloud output screening rejects blank, black, tiny and pathological images', () => {
  assert(!usableDimensions(0, 0)); assert(!usableDimensions(5000, 5000)); assert(usableDimensions(1280, 720));
  assert(!usablePixels(new Uint8ClampedArray(4096))); assert(!usablePixels(new Uint8ClampedArray(4096).fill(128)));
  const pixels = new Uint8ClampedArray(4096); for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(i / 128) % 2 ? 220 : 40;
  assert(usablePixels(pixels));
});
