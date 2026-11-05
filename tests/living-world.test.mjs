import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import LivingMonsters from '../app/scenes/monsters-living.js';
import { LivingCreature, LIVING_CAST } from '../app/scenes/living-creatures.js';
import { LivingWater } from '../app/scenes/living-water.js';
const require = createRequire(import.meta.url);
const { SCENES, sanitize } = require('../app/core/settings.cjs');
const still = { motion: { points: [] } };
const motion = x => ({ motion: { points: [{x,y:.3,strength:.8}] } });
function step(scene, seconds, analysis = still, quality = 2) {
  for (let i=0;i<seconds*60;i++) scene.update({dt:1/60,analysis,intensity:.8,quality});
}
const create = () => { const s = new LivingMonsters(); s.activate(); return s; };

test('living world appends as a separate scene and preserves original playlist choices', () => {
  const old = SCENES.filter(s=>s.id!=='monstersLiving').reverse().map(s=>({id:s.id,enabled:s.id==='monsters'}));
  assert.deepEqual(sanitize({scenes:old}).scenes,[...old,{id:'monstersLiving',enabled:true}]);
  assert.equal(SCENES.find(s=>s.id==='monsters').name,'Small wonderful things');
});

test('idle characters breathe, blink and make independent decisions without bubbles', () => {
  const scene = create(), samples = LIVING_CAST.map(()=>({blinks:0,depth:new Set(),pose:new Set(),actions:new Set()}));
  for (let i=0;i<3600;i++) {
    scene.update({dt:1/60,analysis:still});
    scene.creatures.forEach((c,n)=>{
      const p=c.pose(), sample=samples[n];
      if(p.blink>.5) sample.blinks++;
      sample.depth.add(p.depth.toFixed(2)); sample.pose.add(p.y.toFixed(5));
      if(c.action) sample.actions.add(c.action.kind);
    });
  }
  samples.forEach((s,i)=>{assert(s.blinks>20,LIVING_CAST[i].id);assert(s.pose.size>100);assert(s.actions.size>0);});
  for(const i of [1,3,5]) assert(samples[i].depth.size>40,'peek/dive/surface while idle');
  assert.equal(scene.bubbles.length,0); assert.equal(scene.animationTime,scene.elapsed);
  assert(new Set(scene.creatures.map(c=>c.nextBlink.toFixed(2))).size>=5);
});

test('rapid activation, reversal and camera loss never snap positions, scale or orientation', () => {
  const scene=create(); let previous=scene.creatures.map(c=>c.pose());
  const maxima={x:0,y:0,angle:0,squash:0,gaze:0};
  for(let i=0;i<3600;i++) {
    scene.update({dt:1/60,analysis:i%180<90 ? motion(i%60<30 ? .08 : .9) : null,intensity:1});
    scene.creatures.forEach((c,n)=>{
      const p=c.pose();
      for(const key of Object.keys(maxima)) {assert(Number.isFinite(p[key])); maxima[key]=Math.max(maxima[key],Math.abs(p[key]-previous[n][key]));}
      assert.equal(p.frame,c.spec.frame,'no discrete drawing changes'); assert.equal(p.direction,1,'no instantaneous mirroring');
      previous[n]=p;
    });
  }
  assert(maxima.x<.005,JSON.stringify(maxima)); assert(maxima.y<.02,JSON.stringify(maxima));
  assert(maxima.angle<.025); assert(maxima.squash<.025); assert(maxima.gaze<.13);
  step(scene,10); assert.equal(scene.bubbles.length,0); assert(scene.activity<.001);
});

test('physics and event timing remain stable across rendering rates', () => {
  const run = fps => {
    const c=new LivingCreature(LIVING_CAST[5],5), events=[];
    for(let i=0;i<fps*20;i++) events.push(...c.update(1/fps,{moving:i<fps*7,focus:.32,strength:.8,intensity:.9}));
    return {pose:c.pose(),events:events.map(e=>e.kind),completed:c.completed};
  };
  const a=run(30),b=run(60);
  for(const key of ['x','y','angle','depth','squash','gaze']) assert(Math.abs(a.pose[key]-b.pose[key])<1e-6,key);
  assert.deepEqual(a.events,b.events); assert.equal(a.completed,b.completed);
});

test('local motion wakes nearby characters and neighbors notice after a delay', () => {
  const scene=create(); step(scene,.7,motion(.05));
  assert(scene.creatures[3].action); assert(!scene.creatures[2].action);
  const c=new LivingCreature(LIVING_CAST[2],2); c.notice(.1,.4);
  const initial=c.gaze; c.update(.1); assert(Math.abs(c.gaze-initial)<.01);
  for(let i=0;i<15;i++) c.update(.1);
  assert(c.gaze<-.5); assert(c.social); assert.equal(c.action,null);
});

test('bubbles retain the original motion gate and camera-space source positions', () => {
  const scene=create(); step(scene,.08,motion(.12)); assert.equal(scene.bubbles.length,0);
  step(scene,.08,motion(.12)); assert(scene.bubbles.length>=2);
  assert(scene.bubbles.every(b=>b.x<.15 && b.y>.25 && b.y<.34));
  const old=new Set(scene.bubbles);step(scene,.2);assert(scene.bubbles.every(b=>old.has(b)));
  step(scene,4,motion(.1),0);step(scene,.2,motion(.9),0);
  assert(scene.bubbles.length<=16);assert(scene.bubbles.some(b=>b.x>.85));
});

test('water scales contact effects by size and speed, follows swimming, and settles', () => {
  const small=new LivingWater(),large=new LivingWater();
  small.disturb({kind:'surface',x:.3,speed:.02,power:.1},LIVING_CAST[4]);
  large.disturb({kind:'land',x:.3,speed:.5,power:1},LIVING_CAST[0]);
  assert(large.rings[0].radius>small.rings[0].radius*2); assert(large.drops.length>small.drops.length);
  large.disturb({kind:'wake',x:.4,speed:.02,direction:-1},LIVING_CAST[3]);
  assert(large.rings.at(-1).wake);assert.equal(large.rings.at(-1).direction,-1);
  for(let i=0;i<600;i++)large.update(1/60);
  assert.equal(large.rings.length+large.drops.length+large.crowns.length,0);
});

test('extended crowd activity, quality changes, invalid data and cleanup remain bounded', () => {
  const scene=create(),crowd={motion:{points:LIVING_CAST.map(s=>({x:s.x,y:.4,strength:1}))}};
  step(scene,180,crowd);assert(scene.bubbles.length<=32);assert(scene.ripples.length<=36);assert(scene.splashes.length<=72);
  step(scene,.2,crowd,0);assert(scene.ripples.length<=18);assert(scene.splashes.length<=24);
  scene.update({dt:NaN,analysis:{motion:{points:[{x:NaN,y:0},{x:0,y:Infinity}]}},intensity:NaN});
  assert(scene.creatures.every(c=>Number.isFinite(c.pose().x)));
  scene.cleanup();assert.equal(scene.creatures.length+scene.bubbles.length+scene.water.rings.length,0);
  scene.activate();step(scene,2);assert.equal(scene.bubbles.length,0);
});
