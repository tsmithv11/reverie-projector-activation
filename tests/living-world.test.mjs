import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import LivingMonsters from '../app/scenes/monsters-living.js';
import { LivingCreature, LIVING_CAST } from '../app/scenes/living-creatures.js';
import { LivingWater } from '../app/scenes/living-water.js';
import { PAINTED_RIGS, armJoints, skinWeights } from '../app/scenes/living-puppets.js';
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

test('connected painted arms keep bone lengths and move smoothly through a greeting',()=>{
  const hero=new LivingCreature(LIVING_CAST[0],0);hero.begin('greet',1,.4);
  const hands=[],r=PAINTED_RIGS.tall;
  for(let i=0;i<240;i++){
    hero.update(1/60);const pose=hero.pose();
    for(const side of ['left','right']){
      const {shoulder,elbow,hand}=armJoints('tall',pose,side),[s,e,h]=r[side];
      assert(Math.abs(Math.hypot(elbow[0]-shoulder[0],elbow[1]-shoulder[1])-Math.hypot(e[0]-s[0],e[1]-s[1]))<1e-9);
      assert(Math.abs(Math.hypot(hand[0]-elbow[0],hand[1]-elbow[1])-Math.hypot(h[0]-e[0],h[1]-e[1]))<1e-9);
      if(side==='right')hands.push(hand);
    }
  }
  assert(Math.max(...hands.map(h=>h[1]))-Math.min(...hands.map(h=>h[1]))>90);
  for(let i=1;i<hands.length;i++)assert(Math.hypot(hands[i][0]-hands[i-1][0],hands[i][1]-hands[i-1][1])<5);
});

test('rolling water has visible displacement even when audience activity is zero',()=>{
  const water=new LivingWater(),heights=[];
  for(let i=0;i<360;i++){water.update(1/60);heights.push(water.surface(.35,.91));}
  assert(Math.max(...heights)-Math.min(...heights)>.012,'foreground crest must travel more than six pixels at 540p');
  for(let i=1;i<heights.length;i++)assert(Math.abs(heights[i]-heights[i-1])<.001,'water settles and rolls continuously');
  assert.equal(water.surface(.35,.91),water.surface(.35,.91,water.time),'one height field drives waves and buoyancy');
});

test('arm skin blends continuously into the painted torso without moving the chest',()=>{
  for(const [id,r] of Object.entries(PAINTED_RIGS)){
    const chest=skinWeights(id,[r.anchor[0],(r.neck[1]+r.anchor[1])*.5]);
    assert(chest.arms[0]<.01&&chest.arms[1]<.01,id);
    for(const [index,side] of ['left','right'].entries()){
      const [s,,h]=r[side];assert(skinWeights(id,h).arms[index]>.98,id);
      let previous=skinWeights(id,s).arms[index];
      for(let i=1;i<=100;i++){
        const p=[s[0]+(h[0]-s[0])*i/100,s[1]+(h[1]-s[1])*i/100],w=skinWeights(id,p).arms[index];
        assert(Number.isFinite(w)&&w>=0&&w<=1);assert(Math.abs(w-previous)<.025,id);previous=w;
      }
    }
  }
});

test('jump splash begins when the descending feet reach the sea',()=>{
  const c=new LivingCreature(LIVING_CAST[2],2);c.begin('hop',1,.8);
  let contact=null,count=0;
  for(let i=0;i<140;i++)for(const e of c.update(1/60))if(e.kind==='land'){count++;contact={lift:c.lift,speed:c.liftV};}
  assert.equal(count,1);assert(contact.speed<0);assert(contact.lift>.006&&contact.lift<c.spec.height*.12);
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
