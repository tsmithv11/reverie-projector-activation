import { _electron as electron } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
await mkdir('test-results', { recursive: true });
const reports = [];
const sceneId = process.argv.includes('--cartoon') ? 'cartoon' : 'robots';
const requested = process.argv.slice(2).find(arg => !arg.startsWith('--'));
for (const scenario of requested ? [requested] : ['scene-exit', 'paused-limit', 'connect-timeout', 'provider-busy', 'auto-slot']) {
  const profile = path.resolve(`test-results/robot-${scenario}-${Date.now()}`);
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, 'settings.json'), JSON.stringify({ robotEnabled: true, robotMinutes: 60, robotSessionCap: 1 }));
  await writeFile(path.join(profile, 'cloud-budget.json'), JSON.stringify({ history: Array(12).fill(Date.now()), cooldownAt: Date.now(), requiresManualRetry: true }));
  const packaged = process.argv.includes('--packaged');
  const app = await electron.launch({ ...(packaged ? { executablePath: path.resolve('release/mac-arm64/Reverie Installation.app/Contents/MacOS/Reverie Installation') } : {}), args: [...(packaged ? [] : ['.']), '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env: { ...process.env, FAL_KEY: '', DECART_API_KEY: '', REVERIE_TEST_DIR: profile } });
  const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 60000);
  const errors = [];
  app.on('window', page => page.on('pageerror', e => errors.push(e.message)));
  try {
    const getWindow = async name => {
      for (let i = 0; i < 100; i++) {
        const page = app.windows().find(p => !p.isClosed() && p.url().includes(`/${name}.html`));
        if (page) { await page.waitForLoadState(); return page; }
        await new Promise(r => setTimeout(r, 100));
      }
      throw Error(`Missing ${name}`);
    };
    const operator = await getWindow('operator');
    await operator.waitForFunction(() => document.querySelector('#camera-health').textContent === 'live');
    assert.equal((await operator.evaluate(() => window.installation.state())).settings.robotEnabled, false);
    // Block provider traffic; feed synthetic live frames across the exact worker
    // boundary to exercise scheduling, frame replacement and connection cleanup.
    await app.evaluate(() => { globalThis.pendingRobotFetch = []; globalThis.fetch = () => new Promise(resolve => globalThis.pendingRobotFetch.push(resolve)); });
    await operator.evaluate(async ({ scenario, sceneId }) => {
      await window.installation.saveKey('fake-test-key');
      const state = await window.installation.state();
      await window.installation.configure({ robotEnabled: true, duration: 10, quality: 'high',
        ...(scenario === 'auto-slot' ? { scenes: state.settings.scenes.map(scene => ({ ...scene, enabled: scene.id === 'heat' || scene.id === sceneId })) } : {}) });
      if (scenario !== 'auto-slot') await window.installation.command('generate-robot', sceneId);
    }, { scenario, sceneId });
    if (scenario === 'auto-slot') {
      await new Promise(resolve => setTimeout(resolve, 5000));
      assert.equal((await operator.evaluate(() => window.installation.state())).cloud.count, 0, 'No background prewarming');
    }
    const robot = await getWindow('robot');
    await new Promise(r => setTimeout(r, 1200));
    let state = await operator.evaluate(() => window.installation.state());
    assert.notEqual(state.active, sceneId); assert(!state.cloud.ready); assert.equal(state.cloud.count, 1);
    if (scenario === 'provider-busy') {
      await robot.evaluate(() => window.installation.complete({ code: 'PROVIDER_ERROR', detail: 'Concurrent session limit reached.' }));
      await operator.waitForFunction(() => document.querySelector('#cloud-note').textContent.includes('Next scheduled connection is eligible in'), null, { timeout: 5000 });
      state = await operator.evaluate(() => window.installation.state());
      assert.notEqual(state.active, sceneId); assert(!state.cloud.ready); assert(!state.cloud.streaming);
      assert.match(state.cloud.blockReason, /Next scheduled connection is eligible in (59|60) seconds/);
      assert(!state.cloud.canGenerate); assert(!state.cloud.canRetry);
      for (let i = 0; i < 30 && !robot.isClosed(); i++) await new Promise(r => setTimeout(r, 100));
      assert(robot.isClosed());
      await operator.evaluate(() => window.installation.command('retry-robot'));
      state = await operator.evaluate(() => window.installation.state());
      assert.equal(state.cloud.count, 1); assert.deepEqual(errors, []);
      reports.push({ scenario, sceneId, pass: true, providerRequests: 0, errors });
      continue;
    }
    if (scenario === 'connect-timeout') {
      await operator.waitForFunction(() => document.querySelector('#cloud-note').textContent.includes('[TIMEOUT'), null, { timeout: 28000 });
      state = await operator.evaluate(() => window.installation.state());
      assert.notEqual(state.active, sceneId); assert(!state.cloud.ready); assert(!state.cloud.streaming); for (let i = 0; i < 30 && !robot.isClosed(); i++) await new Promise(r => setTimeout(r, 100)); assert(robot.isClosed());
      assert.equal(state.cloud.count, 1); assert.deepEqual(errors, []);
      reports.push({ scenario, sceneId, pass: true, providerRequests: 0, errors });
      continue;
    }
    const supplyVideo = page => page.evaluate(async () => {
      const job = await window.installation.job();
      const c = document.createElement('canvas'); c.width = 960; c.height = 540;
      const ctx = c.getContext('2d'); let seq = 0, busy = false;
      setInterval(async () => {
        if (busy) return; busy = true;
        ctx.fillStyle = '#263455'; ctx.fillRect(0, 0, 960, 540);
        ctx.fillStyle = '#fff'; ctx.fillRect((seq * 8) % 700, 150, 200, 280);
        await window.installation.publish({ sessionId: job.id, seq: ++seq, width: 960, height: 540, pixels: ctx.getImageData(0, 0, 960, 540).data });
        busy = false;
      }, 50);
    });
    await supplyVideo(robot);
    await operator.waitForFunction(() => document.querySelector('#cloud-health').textContent === 'Live');
    if (scenario === 'auto-slot') {
      for (let i = 0; i < 120; i++) {
        if ((await operator.evaluate(() => window.installation.state())).active === sceneId) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    state = await operator.evaluate(() => window.installation.state());
    assert.equal(state.active, sceneId); assert(state.cloud.ready);
    if (scenario === 'repeat-switch') {
      await operator.evaluate(() => window.installation.command('pause'));
      let previous = robot;
      for (const target of [sceneId === 'robots' ? 'cartoon' : 'robots', sceneId, sceneId === 'robots' ? 'cartoon' : 'robots']) {
        await operator.locator(`.scene-card[data-id=${target}] .scene-art`).click();
        for (let i = 0; i < 60 && !previous.isClosed(); i++) await new Promise(resolve => setTimeout(resolve, 100));
        assert(previous.isClosed(), 'Previous stream must close before the next scene connects');
        const next = await getWindow('robot'); await supplyVideo(next);
        await operator.waitForFunction(() => document.querySelector('#cloud-health').textContent === 'Live');
        state = await operator.evaluate(() => window.installation.state());
        assert.equal(state.active, target); assert(state.settings.robotEnabled); assert(state.cloud.ready);
        assert.match(await operator.locator('#generate-robot').textContent(), /^Turn off Lucy · \d+s left$/);
        previous = next;
      }
      assert.equal(state.cloud.count, 4);
      await operator.locator('#cloud-enabled').uncheck();
      await new Promise(resolve => setTimeout(resolve, 1000));
      state = await operator.evaluate(() => window.installation.state());
      assert(!state.cloud.ready && !state.cloud.streaming && !state.settings.robotEnabled);
      assert.equal(state.cloud.count, 4); assert.deepEqual(errors, []);
      reports.push({ scenario, sceneId, packaged, pass: true, connections: 4, providerRequests: 0, errors });
      continue;
    }
    if (scenario === 'scene-exit' || scenario === 'auto-slot') {
      await operator.evaluate(() => window.installation.command('next'));
      state = await operator.evaluate(() => window.installation.state());
      assert.notEqual(state.active, sceneId); assert(!state.cloud.ready); assert(!state.cloud.streaming); for (let i = 0; i < 30 && !robot.isClosed(); i++) await new Promise(r => setTimeout(r, 100)); assert(robot.isClosed());
      await operator.evaluate(sceneId => window.installation.configure({ robotEnabled: false, scenes: ['robots','heat','monsters','lines','garden','cartoon'].map(id => ({ id, enabled: id === sceneId })) }), sceneId);
      state = await operator.evaluate(() => window.installation.state());
      assert.equal(state.active, null); assert(!state.cloud.ready);
    } else {
      await operator.evaluate(() => window.installation.command('pause'));
      const first = await operator.evaluate(() => window.installation.state());
      await new Promise(resolve => setTimeout(resolve, 12000));
      state = await operator.evaluate(() => window.installation.state());
      assert.notEqual(state.active, sceneId); assert(state.paused); assert(!state.cloud.ready); assert(robot.isClosed());
      assert(state.settings.robotEnabled); assert.equal(state.cloud.count, first.cloud.count);
      await new Promise(resolve => setTimeout(resolve, 3000));
      assert.equal((await operator.evaluate(() => window.installation.state())).cloud.count, first.cloud.count);
      await operator.evaluate(() => window.installation.command('stop-robot'));
      state = await operator.evaluate(() => window.installation.state());
      assert(!state.settings.robotEnabled); assert(!state.cloud.ready);

    }
    assert.equal(state.cloud.count, 1); assert.deepEqual(errors, []);
    reports.push({ scenario, sceneId, pass: true, providerRequests: 0, errors });
  } finally {
    clearTimeout(watchdog); const stop = setTimeout(() => app.process().kill('SIGKILL'), 8000); await app.close(); clearTimeout(stop);
  }
}
await writeFile(`test-results/${sceneId}-check.json`, JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));
