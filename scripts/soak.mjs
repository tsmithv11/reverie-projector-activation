import { _electron as electron } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const seconds = Math.max(30, Number(process.env.SOAK_SECONDS || 600));
await mkdir('test-results', { recursive: true });
const executablePath = process.env.REVERIE_EXECUTABLE;
const app = await electron.launch({ executablePath, args: executablePath ? ['--demo'] : ['.', '--demo'], env: { ...process.env, FAL_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/soak-profile-${Date.now()}`) } });
const errors = []; app.on('window', w => w.on('pageerror', e => errors.push(e.message)));
const samples = [], started = Date.now();
try {
  let operator;
  while (!operator) { operator = app.windows().find(w => w.url().endsWith('/operator.html')); await new Promise(r => setTimeout(r, 100)); }
  await operator.waitForLoadState('domcontentloaded');
  await operator.evaluate(() => window.installation.configure({ duration: 10, quality: 'high', intensity: 1 }));
  let lastReport = 0;
  while (Date.now() - started < seconds * 1000) {
    await new Promise(r => setTimeout(r, 5000));
    const s = await operator.evaluate(() => window.installation.state());
    const metrics = await app.evaluate(({ app }) => app.getAppMetrics().map(m => ({ type: m.type, workingSetMB: m.memory.workingSetSize / 1024, cpu: m.cpu.percentCPUUsage })));
    samples.push({ seconds: Math.round((Date.now() - started) / 1000), scene: s.active, ...s.rendering, camera: s.camera.state, memoryMB: metrics.reduce((n, m) => n + m.workingSetMB, 0), metrics });
    if (Date.now() - lastReport > 30000) { lastReport = Date.now(); console.log(JSON.stringify(samples.at(-1))); }
  }
  const stable = samples.filter(s => s.seconds > 30), sortedFPS = stable.map(s => s.fps).sort((a, b) => a - b);
  const result = { packaged: !!executablePath, durationSeconds: (Date.now() - started) / 1000, workload: '18 synthetic audience silhouettes, high quality 1920x1080 render, 960x540 capture, 384x216 motion analysis, 10-second automatic scene rotation, intensity 1', meanFPS: stable.reduce((n, s) => n + s.fps, 0) / stable.length, p05FPS: sortedFPS[Math.floor(sortedFPS.length * .05)], minFPS: sortedFPS[0], maxMemoryMB: Math.max(...stable.map(s => s.memoryMB)), firstMemoryMB: stable[0]?.memoryMB, lastMemoryMB: stable.at(-1)?.memoryMB, sceneCounts: Object.fromEntries(['heat','robots','monsters','lines','garden'].map(id => [id, samples.filter(s => s.scene === id).length])), errors, samples };
  await writeFile('test-results/soak.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify({ ...result, samples: undefined }, null, 2));
  if (errors.length || stable.some(s => s.failure)) throw Error('Soak detected scene or renderer errors');
} finally { await app.close(); }
