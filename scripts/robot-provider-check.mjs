import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

const sceneId = process.argv.includes('--cartoon') ? 'cartoon' : 'robots';
const expectedModel = sceneId === 'cartoon' ? 'lucy-restyle-2' : 'lucy-2.5';
const scenarios = ['missing-keys', 'fal-only', 'decart-only', 'both-auth-fail', 'cancel-fallback', 'decart-timeout', 'decart-live'];
for (const scenario of scenarios) {
  const app = await electron.launch({ args: ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env: { ...process.env, FAL_KEY: '', DECART_API_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/providers-${scenario}-${Date.now()}`) } });
  const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 30000);
  let sockets = 0, closed = false;
  const errors = [];
  app.on('window', page => page.on('pageerror', error => errors.push(error.message)));
  try {
    const windowFor = async name => {
      for (let i = 0; i < 100; i++) {
        const page = app.windows().find(p => !p.isClosed() && p.url().endsWith(`/${name}.html`));
        if (page) { await page.waitForLoadState(); await page.waitForFunction(() => !!window.installation); return page; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw Error(`Missing ${name}`);
    };
    await app.context().routeWebSocket('**', ws => {
      assert(ws.url().startsWith('wss://api3.decart.ai/'), 'Only the direct provider may open a socket in these scenarios'); sockets++;
      const params = new URL(ws.url()).searchParams;
      assert.equal(params.get('model'), expectedModel);
      assert.equal(params.get('self_anchor'), sceneId === 'robots' ? 'false' : null);
      ws.onClose(() => { closed = true; setTimeout(() => ws.close({ code: 1000 }), 750); });
      ws.onMessage(message => {
        const data = JSON.parse(String(message));
        if (data.type === 'prompt') {
          assert.match(data.prompt, sceneId === 'cartoon' ? /entire scene.*2D cartoon/ : /robot/);
          assert.equal(data.enhance_prompt, false);
          if (scenario === 'cancel-fallback') ws.send(JSON.stringify({ type: 'error', error: 'Service unavailable' }));
        }
      });
    });
    await app.context().addInitScript(() => {
      const captureStream = HTMLCanvasElement.prototype.captureStream;
      HTMLCanvasElement.prototype.captureStream = function(...args) {
        globalThis.testCaptureSize = [this.width, this.height];
        return captureStream.apply(this, args);
      };
    });
    await app.evaluate((_, { scenario }) => {
      globalThis.providerTokenCalls = [];
      globalThis.providerTokenScopes = [];
      globalThis.fetch = async (url, options) => {
        const provider = url.includes('decart.ai') ? 'decart' : 'fal';
        globalThis.providerTokenCalls.push(provider);
        if (provider === 'decart') globalThis.providerTokenScopes.push(JSON.parse(options.body).allowedModels);
        if (['cancel-fallback', 'decart-timeout', 'decart-live'].includes(scenario) && provider === 'decart') return { ok: true, json: async () => ({ apiKey: 'test-temporary-decart-token' }) };
        return { ok: false, status: 401 };
      };
      if (scenario === 'decart-timeout') {
        const original = globalThis.setTimeout;
        globalThis.setTimeout = (callback, ms, ...args) => original(callback, ms === 25000 ? 2000 : ms, ...args);
      }
    }, { scenario });
    const operator = await windowFor('operator');
    const waitState = async predicate => {
      for (let i = 0; i < 150; i++) {
        const state = await operator.evaluate(() => window.installation.state());
        if (predicate(state)) return state;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw Error(`State deadline: ${scenario}`);
    };
    await waitState(state => state.camera.state === 'live' && state.outputAvailable);
    await operator.evaluate(async ({ scenario, sceneId }) => {
      if (!['missing-keys', 'fal-only'].includes(scenario)) await window.installation.saveKey('fake-decart-key', 'decart');
      if (!['missing-keys', 'decart-only'].includes(scenario)) await window.installation.saveKey('fake-fal-key', 'fal');
      await window.installation.configure({ robotEnabled: true, duration: 60 });
      await window.installation.command('generate-robot', sceneId);
    }, { scenario, sceneId });
    if (scenario === 'cancel-fallback') {
      await waitState(state => state.cloud.closing);
      await operator.evaluate(async sceneId => { const state = await window.installation.state(); await window.installation.configure({ scenes: state.settings.scenes.map(scene => ({ ...scene, enabled: scene.id === sceneId ? false : scene.enabled })) }); }, sceneId);
    } else if (scenario === 'decart-live') {
      const robot = await windowFor('robot');
      await robot.waitForFunction(() => globalThis.testCaptureSize);
      assert.deepEqual(await robot.evaluate(() => globalThis.testCaptureSize), [1280, sceneId === 'cartoon' ? 704 : 720]);
      // Synthetic output exercises the same main/audience frame acknowledgement
      // boundary while the actual Decart SDK is awaiting mocked signaling.
      await robot.evaluate(async () => {
        const job = await window.installation.job(), canvas = document.createElement('canvas');
        canvas.width = 960; canvas.height = 540;
        const ctx = canvas.getContext('2d'); let seq = 0;
        globalThis.testFrameTimer = setInterval(() => {
          ctx.fillStyle = '#c7aedd'; ctx.fillRect(0, 0, 960, 540); ctx.fillStyle = '#fff'; ctx.fillRect((seq * 10) % 800, 100, 100, 300);
          window.installation.publish({ sessionId: job.id, seq: ++seq, width: 960, height: 540, pixels: ctx.getImageData(0, 0, 960, 540).data });
        }, 50);
      });
      await waitState(state => state.cloud.ready);
      const live = await operator.evaluate(() => window.installation.state());
      assert.equal(live.cloud.provider, 'decart'); assert.equal(live.active, sceneId); assert.equal(live.cloud.count, 1);
      assert.match(live.cloud.display, sceneId === 'cartoon' ? /Lucy Restyle 2/ : /Lucy 2\.5/);
      await operator.evaluate(() => window.installation.command('next'));
    }
    await waitState(state => !state.cloud.streaming && !state.cloud.closing);
    const state = await operator.evaluate(() => window.installation.state());
    const expected = ['missing-keys', 'fal-only'].includes(scenario) ? [] : ['decart'];
    assert.deepEqual(await app.evaluate(() => globalThis.providerTokenCalls), expected);
    assert.deepEqual(await app.evaluate(() => globalThis.providerTokenScopes), expected.includes('decart') ? [[expectedModel]] : []);
    if (['decart-only', 'both-auth-fail'].includes(scenario)) assert.equal(state.cloud.code, 'AUTH_REJECTED');
    if (scenario === 'decart-timeout') assert.equal(state.cloud.code, 'TIMEOUT');
    assert.equal(state.cloud.count, expected.length); assert(!state.cloud.ready); assert.notEqual(state.active, sceneId);
    assert.equal(state.cloud.providers.decart, !['missing-keys', 'fal-only'].includes(scenario));
    assert(!JSON.stringify(state).includes('fake-decart-key')); assert(!JSON.stringify(state).includes('fake-fal-key'));
    assert.equal(sockets, ['cancel-fallback', 'decart-timeout', 'decart-live'].includes(scenario) ? 1 : 0);
    if (sockets) assert(closed);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ scenario, sceneId, pass: true, attempts: expected, providerRequests: 0 }));
  } finally {
    clearTimeout(watchdog); const timer = setTimeout(() => app.process().kill('SIGKILL'), 8000); await app.close(); clearTimeout(timer);
  }
}
