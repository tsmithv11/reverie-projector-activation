import { _electron as electron } from 'playwright';
import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('test-results', { recursive: true });
await writeFile('dist/wonderful-check.html', '<!doctype html><html><head><style>body{margin:0;background:#000}canvas{width:100vw;height:100vh;display:block}</style></head><body><canvas></canvas><script type="module" src="wonderful-check.js"></script></body></html>');
await build({ stdin: { contents: `
  import Monsters from './app/scenes/monsters.js';
  window.fixtureScene = new Monsters(); fixtureScene.initialize(); fixtureScene.activate();
  const canvas = document.querySelector('canvas'); canvas.width = 960; canvas.height = 540;
  window.fixtureRender = () => fixtureScene.render(canvas.getContext('2d'), { w: canvas.width, h: canvas.height });
  window.fixtureStep = (seconds, moving = false, x = .4) => {
    const analysis = { motion: { points: moving ? [{ x, y: .4, strength: .5 }] : [] } };
    for (let i = 0; i < Math.round(seconds * 60); i++) fixtureScene.update({ dt: 1/60, intensity: .7, quality: 2, analysis });
    fixtureRender();
  };
`, resolveDir: process.cwd() }, bundle: true, format: 'esm', outfile: 'dist/wonderful-check.js' });
const removeFixture = () => Promise.all(['dist/wonderful-check.html', 'dist/wonderful-check.js'].map(file => rm(file, { force: true })));
const app = await electron.launch({ args: ['.', '--demo'], env: { ...process.env, FAL_KEY: '', DECART_API_KEY: '', REVERIE_TEST_DIR: path.resolve(`test-results/wonderful-profile-${Date.now()}`) } }).catch(async error => { await removeFixture(); throw error; });
const errors = [];
app.on('window', win => win.on('pageerror', error => errors.push(error.message)));
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 120000);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let operator, audience;
  for (let i = 0; i < 100; i++) {
    operator = app.windows().find(w => w.url().endsWith('/operator.html'));
    audience = app.windows().find(w => w.url().endsWith('/audience.html'));
    if (operator && audience) break;
    await wait(100);
  }
  assert(operator && audience);
  await operator.waitForLoadState('domcontentloaded');
  await operator.evaluate(async () => {
    await window.installation.configure({ quality: 'high', duration: 60, robotEnabled: false });
    await window.installation.command('select', 'heat');
    await window.installation.command('pause');
  });
  await audience.waitForFunction(async () => (await window.installation.frame(-1))?.pixels?.byteLength > 0);
  const packets = await audience.evaluate(async () => {
    let full, compact;
    for (let i = 0; i < 100; i++) {
      full = await window.installation.frame(-1); compact = await window.installation.frame(-1, true);
      if (full?.pixels && compact) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!full?.pixels || !compact) throw Error('Camera packets did not become fresh');
    return { fullBytes: full.pixels.byteLength, compactBytes: JSON.stringify(compact).length,
      compactHasImage: !!(compact.pixels || compact.preview || compact.motion.edges || compact.motion.energy),
      hasMotion: Array.isArray(compact.motion.points) };
  });
  assert(packets.compactBytes < packets.fullBytes / 10); assert.equal(packets.compactHasImage, false); assert(packets.hasMotion);
  await audience.evaluate(() => {
    window.wonderfulCameraUploads = 0; window.wonderfulCameraDraws = 0; window.inWonderful = false;
    window.installation.onState(s => { window.inWonderful = s.active === 'monsters'; });
    const put = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function(...args) {
      this.canvas.containsCamera = true;
      if (window.inWonderful) window.wonderfulCameraUploads++;
      return put.apply(this, args);
    };
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function(x, y, w, h) {
      if (x === 0 && y === 0 && w === this.canvas.width && h === this.canvas.height && this.globalAlpha === 1) this.canvas.containsCamera = false;
      return fill.call(this, x, y, w, h);
    };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
      if (source?.containsCamera) {
        this.canvas.containsCamera = true;
        if (window.inWonderful) window.wonderfulCameraDraws++;
      }
      return draw.call(this, source, ...args);
    };
  });
  await wait(200);
  await operator.evaluate(() => window.installation.command('select', 'monsters'));
  await wait(7000);
  const high = await operator.evaluate(() => window.installation.state());
  assert.equal(high.active, 'monsters'); assert.equal(high.rendering.failure, ''); assert(high.rendering.fps > 25);
  assert.deepEqual([high.rendering.sceneWidth, high.rendering.sceneHeight], [960, 540]);
  assert.deepEqual(await audience.evaluate(() => { const c = document.querySelector('canvas'); return [c.width, c.height]; }), [1920, 1080]);
  assert.equal(await audience.evaluate(() => window.wonderfulCameraUploads), 0);
  assert.equal(await audience.evaluate(() => window.wonderfulCameraDraws), 0);
  await audience.locator('canvas').screenshot({ path: 'test-results/wonderful-portal.png' });
  await operator.evaluate(() => window.installation.configure({ quality: 'low' }));
  await wait(2500);
  const low = await operator.evaluate(() => window.installation.state());
  assert.equal(low.rendering.quality, 0); assert.equal(low.rendering.failure, '');
  assert.deepEqual([low.rendering.sceneWidth, low.rendering.sceneHeight], [640, 360]);
  await audience.screenshot({ path: 'test-results/wonderful-portal-low.png' });
  await operator.evaluate(() => window.installation.configure({ quality: 'balanced' }));
  await wait(2500);
  const balanced = await operator.evaluate(() => window.installation.state());
  assert.deepEqual([balanced.rendering.sceneWidth, balanced.rendering.sceneHeight], [800, 450]);
  await operator.evaluate(() => window.installation.configure({ quality: 'high' }));
  // Camera scenes recover their full-resolution output and pixel uploads on exit.
  await operator.evaluate(() => window.installation.command('select', 'heat'));
  await wait(2500);
  const restored = await operator.evaluate(() => window.installation.state());
  assert.deepEqual([restored.rendering.sceneWidth, restored.rendering.sceneHeight], [1920, 1080]);
  assert(await audience.evaluate(async () => !!(await window.installation.frame(-1)).pixels));
  await operator.evaluate(() => window.installation.command('select', 'monsters'));
  await wait(2500);
  assert.equal(await audience.evaluate(() => window.wonderfulCameraUploads), 0);
  assert.equal(await audience.evaluate(() => window.wonderfulCameraDraws), 0);
  // Stop input packets until the audience considers the camera stale, keeping
  // the renderer and existing artwork alive to verify its independent idle state.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('frame');
    ipcMain.handle('frame', () => null);
  });
  await wait(10000);
  const cameraLost = await operator.evaluate(() => window.installation.state());
  assert(cameraLost.rendering.frameAge > 2000); assert.equal(cameraLost.rendering.particles, 0);
  assert.equal(cameraLost.rendering.failure, ''); assert(cameraLost.rendering.fps > 25);
  await audience.screenshot({ path: 'test-results/wonderful-portal-idle.png' });

  const fixturePromise = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow }) => {
    const fixture = new BrowserWindow({ width: 1920, height: 1080, show: false, webPreferences: { backgroundThrottling: false } });
    fixture.loadURL('reverie://app/wonderful-check.html');
  });
  const fixture = await fixturePromise;
  await fixture.waitForFunction(() => window.fixtureScene?.background?.naturalWidth && Object.keys(fixtureScene.sprites || {}).length === 6);
  const assets = await fixture.evaluate(() => ({
    background: [fixtureScene.background.naturalWidth, fixtureScene.background.naturalHeight],
    sprites: Object.fromEntries(Object.entries(fixtureScene.sprites).map(([id, s]) => [id, { size: [s.image.naturalWidth, s.image.naturalHeight], frames: s.frames.length }])),
    gpu: !!fixtureScene.artwork?.gl
  }));
  assert(assets.gpu); assert.equal(Object.keys(assets.sprites).length, 6);
  assert(Object.values(assets.sprites).every(s => s.frames === 6));
  await fixture.evaluate(() => fixtureStep(3));
  await fixture.screenshot({ path: 'test-results/wonderful-idle.png' });
  await fixture.evaluate(() => fixtureStep(1.3, true, .8));
  await fixture.screenshot({ path: 'test-results/wonderful-jump.png' });
  const jumping = await fixture.evaluate(() => fixtureScene.creatures.find(c => c.spec.id === 'jumper').pose());
  assert(jumping.lift > .9);
  await fixture.evaluate(() => fixtureStep(15));
  assert.equal(await fixture.evaluate(() => fixtureScene.bubbles.length), 0);
  assert(await fixture.evaluate(() => fixtureScene.creatures.every(c => !c.action)));
  await fixture.screenshot({ path: 'test-results/wonderful-settled.png' });
  const animation = await fixture.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 960; c.height = 540;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const spriteDifferences = Object.fromEntries(Object.entries(fixtureScene.sprites).map(([id, s]) => {
      const shot = frame => {
        ctx.clearRect(0,0,960,540); ctx.save(); ctx.translate(480,500); s.draw(ctx,frame,400,1); ctx.restore();
        return ctx.getImageData(0,0,960,540).data;
      };
      const a=shot(0), b=shot(2); let difference=0;
      for (let i=0;i<a.length;i++) difference+=Math.abs(a[i]-b[i]);
      return [id,difference/a.length];
    }));
    const shot = () => {
      fixtureScene.artwork.render(ctx,960,540,fixtureScene.animationTime,fixtureScene.activity);
      return ctx.getImageData(0,0,960,540).data;
    };
    const before=shot(); fixtureStep(2); const after=shot();
    const idleUnchanged=before.every((v,i)=>v===after[i]);
    fixtureStep(3,true); const a=shot(); fixtureStep(.8,true); const b=shot();
    const difference = (x,y,w,h) => {
      let total=0,count=0;
      for(let py=Math.floor(y*540);py<(y+h)*540;py++) for(let px=Math.floor(x*960);px<(x+w)*960;px++) {
        for(let ch=0;ch<3;ch++) { const i=(py*960+px)*4+ch;total+=Math.abs(a[i]-b[i]);count++; }
      }
      return total/count;
    };
    const waterDifference=difference(.21,.84,.43,.1), bridgeDifference=difference(.76,.08,.12,.2);
    const sceneCanvas=document.querySelector('canvas'), sceneCtx=sceneCanvas.getContext('2d');
    const frame=document.createElement('canvas'); frame.width=64;frame.height=36;
    const fc=frame.getContext('2d');fc.fillStyle='#00ff00';fc.fillRect(0,0,64,36);
    fixtureScene.render(sceneCtx,{w:960,h:540,frame});const green=sceneCanvas.toDataURL();
    fc.fillStyle='#ff0000';fc.fillRect(0,0,64,36);
    fixtureScene.render(sceneCtx,{w:960,h:540,frame});
    return {spriteDifferences,idleUnchanged,waterDifference,bridgeDifference,cameraIndependent:green===sceneCanvas.toDataURL()};
  });
  assert(animation.idleUnchanged);assert(animation.cameraIndependent);
  assert(Object.values(animation.spriteDifferences).every(d=>d>1),'all six characters need distinct pose artwork');
  assert(animation.waterDifference>.5);assert.equal(animation.bridgeDifference,0);
  await fixture.screenshot({path:'test-results/wonderful-all-moving.png'});
  if (process.argv.includes('--record')) {
    const video = await fixture.evaluate(async () => {
      fixtureScene.activate();
      const canvas=document.querySelector('canvas'), stream=canvas.captureStream(30), chunks=[];
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3500000});
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      const stopped=new Promise(resolve=>{recorder.onstop=resolve;});
      recorder.start();
      for(let i=0;i<510;i++) {
        const t=i/30, moving=t>1&&t<10;
        const x=t<5.5 ? .12+(t-1)/4.5*.76 : .88-(t-5.5)/4.5*.76;
        fixtureScene.update({dt:1/30,intensity:.85,quality:2,analysis:{motion:{points:moving?[{x,y:.5,strength:.75}]:[]}}});
        fixtureRender();
        await new Promise(resolve=>setTimeout(resolve,1000/30));
      }
      recorder.stop();await stopped;stream.getTracks().forEach(track=>track.stop());
      return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
    });
    await writeFile('test-results/wonderful-cartoon-preview.webm',Buffer.from(video,'base64'));
  }
  // Losing WebGL only freezes water: every separate character still animates.
  await fixture.evaluate(()=>{fixtureScene.artwork.cleanup();fixtureStep(.4,true);});
  assert(await fixture.evaluate(()=>fixtureScene.creatures.some(c=>c.action)));
  await fixture.screenshot({path:'test-results/wonderful-gpu-fallback.png'});
  await fixture.evaluate(() => fixtureScene.cleanup());
  assert.deepEqual(errors, []);
  const result = { assets, packets, animation, balanced: balanced.rendering, restored: restored.rendering, cameraDraws: await audience.evaluate(() => window.wonderfulCameraDraws), cameraUploads: await audience.evaluate(() => window.wonderfulCameraUploads), high: high.rendering, low: low.rendering, cameraLost: cameraLost.rendering, jumping, errors };
  await writeFile('test-results/wonderful-check.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  clearTimeout(watchdog);
  try { await app.close(); } finally { await removeFixture(); }
}
