import { _electron as electron } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
await mkdir('test-results', { recursive: true });
const reports = [];
for (const scenario of process.argv[2] ? [process.argv[2]] : ['scene-exit', 'paused-limit', 'connect-timeout', 'provider-busy']) {
  const app = await electron.launch({ args: ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env: { ...process.env, FAL_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/robot-${scenario}-${Date.now()}`) } });
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
    // Block provider traffic; feed synthetic live frames across the exact worker
    // boundary to exercise scheduling, frame replacement and connection cleanup.
    await app.evaluate(() => { globalThis.pendingRobotFetch = []; globalThis.fetch = () => new Promise(resolve => globalThis.pendingRobotFetch.push(resolve)); });
    await operator.evaluate(async scenario => {
      await window.installation.saveKey('fake-test-key');
      await window.installation.configure({ robotEnabled: true, duration: 10, quality: 'high', robotSessionCap: scenario === 'provider-busy' ? 2 : 1 });
      await window.installation.command('generate-robot');
    }, scenario);
    const robot = await getWindow('robot');
    await new Promise(r => setTimeout(r, 1200));
    let state = await operator.evaluate(() => window.installation.state());
    assert.notEqual(state.active, 'robots'); assert(!state.cloud.ready); assert.equal(state.cloud.count, 1);
    if (scenario === 'provider-busy') {
      await robot.evaluate(() => window.installation.complete({ code: 'PROVIDER_ERROR', detail: 'Concurrent session limit reached.' }));
      await operator.waitForFunction(() => document.querySelector('#cloud-note').textContent.includes('Manual retry available in'), null, { timeout: 5000 });
      state = await operator.evaluate(() => window.installation.state());
      assert.notEqual(state.active, 'robots'); assert(!state.cloud.ready); assert(!state.cloud.streaming);
      assert.match(state.cloud.blockReason, /Manual retry available in (59|60) seconds/);
      assert(!state.cloud.canGenerate); assert(!state.cloud.canRetry);
      for (let i = 0; i < 30 && !robot.isClosed(); i++) await new Promise(r => setTimeout(r, 100));
      assert(robot.isClosed());
      await operator.evaluate(() => window.installation.command('retry-robot'));
      state = await operator.evaluate(() => window.installation.state());
      assert.equal(state.cloud.count, 1); assert.deepEqual(errors, []);
      reports.push({ scenario, pass: true, providerRequests: 0, errors });
      continue;
    }
    if (scenario === 'connect-timeout') {
      await operator.waitForFunction(() => document.querySelector('#cloud-note').textContent.includes('[TIMEOUT'), null, { timeout: 28000 });
      state = await operator.evaluate(() => window.installation.state());
      assert.notEqual(state.active, 'robots'); assert(!state.cloud.ready); assert(!state.cloud.streaming); for (let i = 0; i < 30 && !robot.isClosed(); i++) await new Promise(r => setTimeout(r, 100)); assert(robot.isClosed());
      assert.equal(state.cloud.count, 1); assert.deepEqual(errors, []);
      reports.push({ scenario, pass: true, providerRequests: 0, errors });
      continue;
    }
    await robot.evaluate(async () => {
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
    await operator.waitForFunction(() => document.querySelector('#cloud-health').textContent === 'Live');
    state = await operator.evaluate(() => window.installation.state());
    assert.equal(state.active, 'robots'); assert(state.cloud.ready);
    if (scenario === 'scene-exit') {
      await operator.evaluate(() => window.installation.command('next'));
      state = await operator.evaluate(() => window.installation.state());
      assert.notEqual(state.active, 'robots'); assert(!state.cloud.ready); assert(!state.cloud.streaming); for (let i = 0; i < 30 && !robot.isClosed(); i++) await new Promise(r => setTimeout(r, 100)); assert(robot.isClosed());
      await operator.evaluate(() => window.installation.configure({ robotEnabled: false, scenes: ['robots','heat','monsters','lines','garden'].map(id => ({ id, enabled: id === 'robots' })) }));
      state = await operator.evaluate(() => window.installation.state());
      assert.equal(state.active, null); assert(!state.cloud.ready);
    } else {
      await operator.evaluate(() => window.installation.command('pause'));
      await operator.waitForFunction(() => document.querySelector('#log-lines').textContent.includes('SESSION_LIMIT'), null, { timeout: 14000 });
      state = await operator.evaluate(() => window.installation.state());
      assert.notEqual(state.active, 'robots'); assert(state.paused); assert(!state.cloud.ready); for (let i = 0; i < 30 && !robot.isClosed(); i++) await new Promise(r => setTimeout(r, 100)); assert(robot.isClosed());
      assert(state.logs.some(line => line.includes('SESSION_LIMIT')));
    }
    assert.equal(state.cloud.count, 1); assert.deepEqual(errors, []);
    reports.push({ scenario, pass: true, providerRequests: 0, errors });
  } finally {
    clearTimeout(watchdog); const stop = setTimeout(() => app.process().kill('SIGKILL'), 8000); await app.close(); clearTimeout(stop);
  }
}
await writeFile('test-results/robot-check.json', JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));
