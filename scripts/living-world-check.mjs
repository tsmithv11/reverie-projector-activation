import { _electron as electron } from 'playwright';
import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('test-results',{recursive:true});
const fixtureFiles=['dist/living-world-check.html','dist/living-world-check.js'];
await writeFile(fixtureFiles[0],'<html><body style="margin:0;background:#25172e"><canvas style="width:100vw;height:100vh;display:block"></canvas><script type="module" src="living-world-check.js"></script></body></html>');
await build({stdin:{contents:`
  import Living from './app/scenes/monsters-living.js';
  window.scene=new Living();scene.initialize();scene.activate();
  window.canvas=document.querySelector('canvas');canvas.width=960;canvas.height=540;
  window.render=()=>scene.render(canvas.getContext('2d'),{w:canvas.width,h:canvas.height});
  window.step=(seconds,moving=false)=>{
    for(let i=0;i<Math.round(seconds*60);i++)scene.update({dt:1/60,intensity:.85,quality:2,analysis:{motion:{points:moving ? scene.creatures.map((c,j)=>({x:c.spec.x+Math.sin(scene.elapsed*.7+j)*.06,y:.32+j*.045,strength:.8})) : []}}});
    render();
  };
`,resolveDir:process.cwd()},bundle:true,format:'esm',outfile:fixtureFiles[1]});
const app=await electron.launch({args:['.','--demo'],env:{...process.env,FAL_KEY:'',DECART_API_KEY:'',REVERIE_TEST_DIR:path.resolve(`test-results/living-world-profile-${Date.now()}`)}}).catch(async error=>{await Promise.all(fixtureFiles.map(p=>rm(p,{force:true})));throw error;});
const wait=ms=>new Promise(r=>setTimeout(r,ms)),errors=[];
app.on('window',w=>w.on('pageerror',e=>errors.push(e.message)));
const watchdog=setTimeout(()=>app.process().kill('SIGKILL'),120000);
try {
  let operator,audience;
  for(let i=0;i<100;i++) {
    operator=app.windows().find(w=>w.url().endsWith('/operator.html'));audience=app.windows().find(w=>w.url().endsWith('/audience.html'));
    if(operator&&audience)break;await wait(100);
  }
  assert(operator&&audience);
  await operator.evaluate(async()=>{await installation.configure({quality:'high',duration:60,robotEnabled:false});await installation.command('select','monstersLiving');await installation.command('pause');});
  await wait(2500);
  await audience.evaluate(()=>{window.cameraUploads=0;const put=CanvasRenderingContext2D.prototype.putImageData;CanvasRenderingContext2D.prototype.putImageData=function(...args){window.cameraUploads++;return put.apply(this,args);};});
  await audience.screenshot({path:'test-results/living-world-portal.png'});
  const high=await operator.evaluate(()=>installation.state());assert.equal(high.active,'monstersLiving');assert.equal(high.rendering.failure,'');assert(high.rendering.fps>25);
  await operator.evaluate(()=>installation.configure({quality:'low',displayFormat:'4:3'}));await wait(1800);
  await audience.screenshot({path:'test-results/living-world-portal-4x3.png'});
  const low=await operator.evaluate(()=>installation.state());assert.equal(low.rendering.failure,'');assert(low.rendering.fps>20);
  await operator.evaluate(()=>installation.command('select','monsters'));await wait(1600);
  assert.equal((await operator.evaluate(()=>installation.state())).active,'monsters');
  await operator.evaluate(()=>installation.command('select','monstersLiving'));await wait(1600);
  assert.equal((await operator.evaluate(()=>installation.state())).rendering.failure,'');
  await app.evaluate(({BrowserWindow})=>{const fixture=new BrowserWindow({width:960,height:540,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});fixture.loadURL('reverie://app/living-world-check.html');});
  let fixture;
  for(let i=0;i<100;i++){fixture=app.windows().find(w=>w.url().endsWith('/living-world-check.html'));if(fixture)break;await wait(50);}
  assert(fixture);await fixture.waitForFunction(()=>window.scene?.background?.naturalWidth && Object.keys(scene.sprites).length===6);
  await fixture.evaluate(()=>step(.5));
  // Capture the exact same live body at half and full eye closure; the atlas
  // frame and silhouette remain fixed throughout the blink.
  await fixture.evaluate(()=>{scene.creatures[0].blink=.65;render();});await fixture.screenshot({path:'test-results/living-world-blink.png'});
  await fixture.evaluate(()=>{scene.creatures[0].blink=0;render();});
  const gpu=await fixture.evaluate(()=>({working:!!scene.puppets.gl,error:scene.puppets.error||'',frames:Object.fromEntries(Object.entries(scene.sprites).map(([id,s])=>[id,s.frames[0]]))}));
  assert(gpu.working,gpu.error);
  await fixture.screenshot({path:'test-results/living-world-idle.png'});
  await fixture.evaluate(()=>step(5));await fixture.screenshot({path:'test-results/living-world-peek.png'});
  await fixture.evaluate(()=>step(1.2,true));await fixture.screenshot({path:'test-results/living-world-active.png'});
  await fixture.evaluate(()=>step(1.4,true));await fixture.screenshot({path:'test-results/living-world-splash.png'});
  const perf=await fixture.evaluate(()=>{
    const samples=[];
    for(let i=0;i<120;i++){const t=performance.now();step(1/60,true);samples.push(performance.now()-t);}
    samples.sort((a,b)=>a-b);return {median:samples[60],p95:samples[114]};
  });
  if(process.argv.includes('--record')) {
    const video=await fixture.evaluate(async()=>{
      scene.activate();const stream=canvas.captureStream(60),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4500000});
      recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(r=>recorder.onstop=r);recorder.start();
      let start,last;await new Promise(resolve=>{const frame=now=>{start??=now;last??=now;const time=(now-start)/1000;
        scene.update({dt:Math.min(.05,(now-last)/1000),intensity:.85,quality:2,analysis:{motion:{points:time>6&&time<15 ? scene.creatures.map((c,j)=>({x:c.spec.x+Math.sin(time*.7+j)*.07,y:.35+j*.045,strength:.8})) : []}}});last=now;render();
        time<23 ? requestAnimationFrame(frame) : resolve();};requestAnimationFrame(frame);});
      recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
      return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
    });
    await writeFile('test-results/living-world-preview.webm',Buffer.from(video,'base64'));
  }
  await fixture.evaluate(()=>{scene.puppets.gl.getExtension('WEBGL_lose_context').loseContext();scene.artwork.gl.getExtension('WEBGL_lose_context').loseContext();});
  await wait(50);await fixture.evaluate(()=>step(1));await fixture.screenshot({path:'test-results/living-world-fallback.png'});
  await fixture.evaluate(()=>{scene.cleanup();if(scene.creatures.length || scene.water.rings.length || scene.puppets)throw Error('cleanup leaked');});
  // A camera outage must leave the local world alive, with no camera fallback.
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('frame');ipcMain.handle('frame',()=>null);});
  await wait(7500);const lost=await operator.evaluate(()=>installation.state());assert.equal(lost.rendering.failure,'');assert.equal(lost.rendering.particles,0);assert(lost.rendering.fps>20);
  assert.equal(await audience.evaluate(()=>window.cameraUploads),0);
  assert.equal(errors.length,0,JSON.stringify(errors));
  const result={high:high.rendering,low:low.rendering,cameraLost:lost.rendering,gpu,perf,errors};
  await writeFile('test-results/living-world-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {clearTimeout(watchdog);await app.close();await Promise.all(fixtureFiles.map(p=>rm(p,{force:true})));}
