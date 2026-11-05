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
  import {portalGeometry,paintReferenceFrame} from './app/core/composition.js';
  window.scene=new Living();scene.initialize();scene.activate();
  window.canvas=document.querySelector('canvas');canvas.width=960;canvas.height=758;window.composed=true;
  window.render=()=>{
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,portal=portalGeometry(w,h,'monstersLiving');
    scene.render(ctx,{w,h,foregroundClip:composed?portal.inner.map(p=>({x:p.x/w,y:p.y/h})):undefined});
    if(composed)paintReferenceFrame(ctx,portal,w,h);
  };
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
  await app.evaluate(({BrowserWindow})=>{const fixture=new BrowserWindow({width:960,height:758,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});fixture.loadURL('reverie://app/living-world-check.html');});
  let fixture;
  for(let i=0;i<100;i++){fixture=app.windows().find(w=>w.url().endsWith('/living-world-check.html'));if(fixture)break;await wait(50);}
  assert(fixture);await fixture.waitForFunction(()=>window.scene?.puppets && scene.artwork?.mode==='reference-layers');
  const capture=async name=>writeFile('test-results/'+name,Buffer.from(await fixture.evaluate(()=>canvas.toDataURL('image/png').split(',')[1]),'base64'));
  await fixture.evaluate(()=>step(.5));
  await capture('living-world-reference-composition.png');
  await fixture.evaluate(()=>{window.composed=false;canvas.height=850;render();});
  // Check the drawn facial expression at partial eye closure.
  await fixture.evaluate(()=>{scene.creatures[0].blink=.65;render();});await capture('living-world-blink.png');
  await fixture.evaluate(()=>{scene.creatures[0].blink=0;render();});
  const rig=await fixture.evaluate(()=>({mode:scene.puppets.mode,environment:scene.artwork.mode,
    characters:scene.creatures.length,connectedAtlas:scene.images.tall.naturalWidth,
    gpu:!!scene.puppets.gl,error:scene.puppets.error||''}));
  assert.equal(rig.mode,'reference-character-mesh');assert.equal(rig.environment,'reference-layers');
  assert.equal(rig.characters,3);assert(rig.connectedAtlas>1000);assert(rig.gpu,rig.error);
  const idleWater=await fixture.evaluate(()=>{
    const ctx=canvas.getContext('2d'),before=scene.animationTime;
    render();const a=ctx.getImageData(0,0,960,850).data;
    scene.animationTime+=1;scene.water.time+=1;render();const b=ctx.getImageData(0,0,960,850).data;
    const difference=(x,y,w,h)=>{let changed=0,total=0;for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++){
      const k=(j*960+i)*4;if(Math.abs(a[k]-b[k])+Math.abs(a[k+1]-b[k+1])+Math.abs(a[k+2]-b[k+2])>8)changed++;total++;
    }return changed/total;};
    const result={water:difference(150,740,620,90),sky:difference(5,5,100,25),rock:difference(610,550,15,25)};
    scene.animationTime=before;scene.water.time-=1;render();return result;
  });
  assert(idleWater.water>.015,'painted foreground crests must move while idle');
  assert.equal(idleWater.sky,0);assert.equal(idleWater.rock,0);
  await capture('living-world-idle.png');
  await fixture.evaluate(()=>step(5));await capture('living-world-peek.png');
  await fixture.evaluate(()=>step(1.2,true));await capture('living-world-active.png');
  await fixture.evaluate(()=>{window.savedBubbles=scene.bubbles;scene.bubbles=[];render();});await capture('living-world-wave-detail.png');
  await fixture.evaluate(()=>{scene.bubbles=window.savedBubbles;delete window.savedBubbles;});
  await fixture.evaluate(()=>step(1.4,true));await capture('living-world-splash.png');
  await fixture.evaluate(()=>{scene.bubbles=[];render();});await capture('living-world-shoulders.png');
  // Inspect the demanding poses explicitly, not whichever phase a timer lands on.
  for(const [id,kind] of [['tall','greet'],['green','peek'],['green','retreat'],['jumper','hop']]){
    await fixture.evaluate(([id,kind])=>{
      scene.activate();for(const c of scene.creatures){c.nextIdle=100;c.cooldown=100;}
      scene.creatures.find(c=>c.spec.id===id).begin(kind,.9,.45);
    },[id,kind]);
    for(let frame=0;frame<12;frame++){
      await fixture.evaluate(()=>step(.3));
      await capture('living-world-review-'+id+'-'+kind+'-'+String(frame).padStart(2,'0')+'.png');
      if(id==='jumper'&&frame===2){
        await fixture.evaluate(()=>{window.composed=true;canvas.height=758;render();});
        await capture('living-world-reference-action.png');
        await fixture.evaluate(()=>{window.composed=false;canvas.height=850;render();});
      }
    }
  }
  const perf=await fixture.evaluate(()=>{
    const samples=[];
    for(let i=0;i<120;i++){const t=performance.now();step(1/60,true);samples.push(performance.now()-t);}
    samples.sort((a,b)=>a-b);return {median:samples[60],p95:samples[114]};
  });
  if(process.argv.includes('--record')) {
    const video=await fixture.evaluate(async()=>{
      scene.activate();window.composed=true;canvas.height=758;render();const stream=canvas.captureStream(60),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4500000});
      recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(r=>recorder.onstop=r);recorder.start();
      let start,last;await new Promise(resolve=>{const frame=now=>{start??=now;last??=now;const time=(now-start)/1000;
        scene.update({dt:Math.min(.05,(now-last)/1000),intensity:.85,quality:2,analysis:{motion:{points:time>6&&time<15 ? scene.creatures.map((c,j)=>({x:c.spec.x+Math.sin(time*.7+j)*.07,y:.35+j*.045,strength:.8})) : []}}});last=now;render();
        time<23 ? requestAnimationFrame(frame) : resolve();};requestAnimationFrame(frame);});
      recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
      return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
    });
    await writeFile('test-results/living-world-reference-preview.webm',Buffer.from(video,'base64'));
    await fixture.evaluate(()=>{window.composed=false;canvas.height=850;render();});
  }
  await fixture.evaluate(()=>step(1));await capture('living-world-settled.png');
  assert.equal(await fixture.evaluate(()=>!!scene.artwork.gl),false,'the reference environment is never displaced');
  await fixture.evaluate(()=>{scene.puppets.gl.getExtension('WEBGL_lose_context').loseContext();render();});
  await capture('living-world-fallback.png');
  await fixture.evaluate(()=>{scene.cleanup();if(scene.creatures.length || scene.water.rings.length || scene.puppets)throw Error('cleanup leaked');});
  // A camera outage must leave the local world alive, with no camera fallback.
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('frame');ipcMain.handle('frame',()=>null);});
  await wait(7500);const lost=await operator.evaluate(()=>installation.state());assert.equal(lost.rendering.failure,'');assert.equal(lost.rendering.particles,0);assert(lost.rendering.fps>20);
  assert.equal(await audience.evaluate(()=>window.cameraUploads),0);
  assert.equal(errors.length,0,JSON.stringify(errors));
  const result={high:high.rendering,low:low.rendering,cameraLost:lost.rendering,rig,idleWater,perf,errors};
  await writeFile('test-results/living-world-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {clearTimeout(watchdog);await app.close();await Promise.all(fixtureFiles.map(p=>rm(p,{force:true})));}
