import { clamp } from './living-creatures.js';

// Landmarks belong to the connected, complete drawings in connected-v3/cast.png.
// No limb is a separate image. Each triangle retains the same UVs and shares
// vertices across the shoulder; skin weights spread the bend through the joint.
export const PAINTED_RIGS = {
  tall: { crop:[0,0,512,555], anchor:[270,534], height:530, neck:[284,267], eyes:[[255,142,9,10],[354,142,9,10]], mouth:[305,174,47,25], left:[[207,307],[157,336],[111,366]], right:[[337,307],[387,338],[435,367]], width:35, hips:[[204,474],[342,474]], tail:[155,457] },
  green: { crop:[512,0,512,555], anchor:[784,534], height:434, neck:[784,310], eyes:[[739,239,13,10],[827,239,13,10]], closed:true, mouth:[783,261,37,16], left:[[692,318],[644,349],[606,374]], right:[[877,318],[923,351],[960,377]], width:32, hips:[[701,485],[849,485]], tail:[662,460] },
  blue: { crop:[1024,0,512,555], anchor:[1284,533], height:360, neck:[1287,349], eyes:[[1237,282,10,11],[1335,282,10,11]], mouth:[1287,315,47,24], left:[[1203,348],[1155,376],[1115,396]], right:[[1364,348],[1411,376],[1457,396]], width:32, hips:[[1214,486],[1343,486]], tail:[1168,469] },
  antenna: { crop:[0,555,512,469], anchor:[270,979], height:386, neck:[280,852], eyes:[[229,800,17,12],[349,800,17,12]], closed:true, mouth:[285,847,56,27], left:[[174,834],[132,854],[97,872]], right:[[389,834],[426,852],[455,870]], width:26, hips:[[199,943],[348,943]], tail:[158,931] },
  pink: { crop:[512,555,512,469], anchor:[779,970], height:265, neck:[782,875], eyes:[[741,819,10,11],[826,819,10,11]], mouth:[784,844,24,12], left:[[709,874],[688,889],[673,903]], right:[[843,874],[861,888],[879,903]], width:19, hips:[[736,938],[821,938]], tail:[699,922] },
  jumper: { crop:[1024,555,512,469], anchor:[1290,979], height:415, neck:[1291,761], eyes:[[1249,686,8,9],[1335,685,8,9]], mouth:[1290,710,30,17], left:[[1249,776],[1214,798],[1179,817]], right:[[1328,773],[1365,796],[1400,818]], width:20, hips:[[1255,893],[1329,893]], tail:[1233,904] }
};
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
function armWeights(point, bone, width) {
  const [s,e,h]=bone, dx=h[0]-s[0],dy=h[1]-s[1],length2=dx*dx+dy*dy;
  const t=((point[0]-s[0])*dx+(point[1]-s[1])*dy)/length2;
  const distance=Math.abs(dx*(point[1]-s[1])-dy*(point[0]-s[0]))/Math.sqrt(length2);
  return [smooth(-.15,.55,t)*(1-smooth(width,width*1.55,distance)),smooth(.32,.75,t)];
}
export function skinWeights(id, point) {
  const r=PAINTED_RIGS[id],l=armWeights(point,r.left,r.width),a=armWeights(point,r.right,r.width);
  const hip=(index)=>{const h=r.hips[index];return smooth(h[1]-5,h[1]+29,point[1])*(1-smooth(29,61,Math.abs(point[0]-h[0])));};
  const head=1-smooth(r.neck[1]-32,r.neck[1]+24,point[1]);
  const tail=(1-smooth(r.tail[0]-26,r.tail[0]+15,point[0]))*smooth(r.tail[1]-65,r.tail[1]-22,point[1]);
  return {arms:[l[0],a[0],l[1],a[1]],body:[head,hip(0),hip(1),tail]};
}
export function jointAngles(pose) {
  const j=pose.joints;
  // The drawing's rest arms already slope outwards. Animate relative to that
  // pose, with elbow follow-through, rather than swinging an entire cutout.
  return {left:[clamp((j.armL-.36)*.70,-.55,1.15),clamp((j.elbowL+.72)*.58,-.7,.85)],
    right:[clamp((j.armR+.34)*.70,-1.15,.55),clamp((j.elbowR-.68)*.58,-.95,.7)]};
}
export function armJoints(id, pose, side='right') {
  const [s,e,h]=PAINTED_RIGS[id][side], [a,b]=jointAngles(pose)[side];
  const rotate=(p,o,t)=>[o[0]+(p[0]-o[0])*Math.cos(t)-(p[1]-o[1])*Math.sin(t),o[1]+(p[0]-o[0])*Math.sin(t)+(p[1]-o[1])*Math.cos(t)];
  const elbow=rotate(e,s,a),hand=rotate(h,e,a+b);
  return {shoulder:s,elbow,hand:[hand[0]+elbow[0]-e[0],hand[1]+elbow[1]-e[1]]};
}
const vertex=`
attribute vec2 point;
attribute vec4 arms, body;
uniform vec2 viewport, origin, anchor, neck, shoulderL, elbowL, shoulderR, elbowR, hipL, hipR, tailRoot;
uniform vec4 angles;
uniform vec4 motion;
uniform float scale, lean, breath, crouch, headAngle, reflection, surface;
varying vec2 source, world;
vec2 rotate(vec2 p,vec2 root,float a){float c=cos(a),s=sin(a);p-=root;return root+vec2(p.x*c-p.y*s,p.x*s+p.y*c);}
vec2 arm(vec2 p,vec2 shoulder,vec2 elbow,float upper,float lower,float blend){
  vec2 e=rotate(elbow,shoulder,upper);
  return mix(rotate(p,shoulder,upper),rotate(p,elbow,upper+lower)+e-elbow,blend);
}
void main(){
  source=point;
  vec2 p=point;
  p+= (arm(point,shoulderL,elbowL,angles.x,angles.y,arms.z)-point)*arms.x;
  p+= (arm(point,shoulderR,elbowR,angles.z,angles.w,arms.w)-point)*arms.y;
  p+= (rotate(point,neck,headAngle)-point)*body.x;
  p+= (rotate(point,hipL,motion.x)-point)*body.y;
  p+= (rotate(point,hipR,motion.y)-point)*body.z;
  p+= (rotate(point,tailRoot,motion.z)-point)*body.w;
  p-=anchor;
  // Small rib-cage breathing, no global rubber stretch or squash of the face.
  float chest=1.-body.x;
  p.x*=1.+breath*.35*chest;
  p.y+=crouch*35.*chest+breath*12.*chest;
  p=rotate(p,vec2(0.),lean)*scale;
  world=origin+p;
  if(reflection>.5)world.y=surface+(surface-world.y)*.20;
  gl_Position=vec4(world.x/viewport.x*2.-1.,1.-world.y/viewport.y*2.,0.,1.);
}`;
const fragment=`
precision highp float;
uniform sampler2D artwork;
uniform vec2 atlasSize;
uniform vec4 eyeA,eyeB,mouth;
uniform float blink,gaze,closedEyes,expression,surface,reflection,time;
varying vec2 source,world;
vec4 eyelid(vec4 color,vec4 e){
  vec2 d=(source-e.xy)/e.zw;
  float mask=1.-smoothstep(1.05,1.4,length(d));
  if(mask<.001)return color;
  float opening=max(.03,1.-blink);
  vec4 fur=texture2D(artwork,(e.xy+vec2(d.x*e.z,-e.w*1.85))/atlasSize);
  vec4 iris=texture2D(artwork,(e.xy+vec2(source.x-e.x-gaze*1.3,(source.y-e.y)/opening))/atlasSize);
  float slit=1.-smoothstep(opening*.8,opening+.12,abs(d.y));
  vec4 painted=mix(fur,iris,slit);
  float seam=(1.-smoothstep(.05,.16,abs(d.y-.10*d.x*d.x)))*blink*blink;
  painted.rgb=mix(painted.rgb,vec3(.16,.10,.23),seam*.9);
  return mix(color,painted,mask*smoothstep(0.,.10,blink));
}
void main(){
  float line=surface+sin(world.x*.055+time*1.3)*.65;
  if(reflection<.5&&world.y>line)discard;
  if(reflection>.5&&world.y<line)discard;
  vec4 color=texture2D(artwork,source/atlasSize);
  if(closedEyes<.5)color=eyelid(eyelid(color,eyeA),eyeB);
  float alpha=color.a;
  if(reflection>.5)alpha*=.13*exp(-max(0.,world.y-surface)/18.);
  gl_FragColor=vec4(color.rgb*alpha,alpha);
}`;

export class LivingPuppets {
  constructor(image) {
    this.mode='connected-painted-mesh';this.image=image;this.buffers={};this.shaders=[];
    this.canvas=document.createElement('canvas');
    this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false});
    if(!this.gl)return;
    const gl=this.gl;
    try{
      const compile=(type,src)=>{const shader=gl.createShader(type);this.shaders.push(shader);gl.shaderSource(shader,src);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
      this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);
      this.uniforms=Object.fromEntries(['viewport','origin','anchor','neck','shoulderL','elbowL','shoulderR','elbowR','hipL','hipR','tailRoot','angles','motion','scale','lean','breath','crouch','headAngle','reflection','surface','atlasSize','eyeA','eyeB','mouth','blink','gaze','closedEyes','expression','time'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
      this.attributes=['point','arms','body'].map(n=>gl.getAttribLocation(this.program,n));
      for(const [id,r] of Object.entries(PAINTED_RIGS)){
        const vertices=[],grid=64;
        for(let y=0;y<grid;y++)for(let x=0;x<grid;x++)for(const [dx,dy] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]){
          const p=[r.crop[0]+(x+dx)/grid*r.crop[2],r.crop[1]+(y+dy)/grid*r.crop[3]],weights=skinWeights(id,p);
          vertices.push(...p,...weights.arms,...weights.body);
        }
        const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);this.buffers[id]={buffer,count:vertices.length/10};
      }
      this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.uniform1i(gl.getUniformLocation(this.program,'artwork'),0);
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    }catch(error){this.error=String(error);this.cleanup();}
  }
  render(ctx,creatures,w,h,placement=c=>c.pose(),surface=(x,y)=>y){
    const gl=this.gl;
    if(!gl||gl.isContextLost()){this.fallback(ctx,creatures,w,h,placement,surface);return;}
    if(this.canvas.width!==Math.round(w)||this.canvas.height!==Math.round(h)){this.canvas.width=Math.round(w);this.canvas.height=Math.round(h);}
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);
    const u=this.uniforms;gl.uniform2f(u.viewport,w,h);gl.uniform2f(u.atlasSize,this.image.naturalWidth,this.image.naturalHeight);
    for(const c of creatures){
      const p=placement(c);if(!p.visible)continue;
      const r=PAINTED_RIGS[c.spec.id],b=this.buffers[c.spec.id],j=p.joints,a=jointAngles(p),size=c.spec.height*h,line=surface(p.x,c.spec.y)*h;
      gl.bindBuffer(gl.ARRAY_BUFFER,b.buffer);
      for(let i=0;i<3;i++){gl.enableVertexAttribArray(this.attributes[i]);gl.vertexAttribPointer(this.attributes[i],i?4:2,gl.FLOAT,false,40,[0,8,24][i]);}
      gl.uniform2f(u.origin,p.x*w,p.y*h+size*.12+(line-c.spec.y*h));
      for(const [key,value] of Object.entries({anchor:r.anchor,neck:r.neck,shoulderL:r.left[0],elbowL:r.left[1],shoulderR:r.right[0],elbowR:r.right[1],hipL:r.hips[0],hipR:r.hips[1],tailRoot:r.tail}))gl.uniform2fv(u[key],value);
      gl.uniform4fv(u.angles,[...a.left,...a.right]);gl.uniform4fv(u.motion,[(j.legL-.06)*.55,(j.legR+.06)*.55,j.tail*.5,0]);
      for(const [key,value] of Object.entries({scale:size/r.height,lean:p.angle,breath:p.breath,crouch:p.crouch,headAngle:j.head*.3,blink:p.blink,gaze:p.gaze,closedEyes:r.closed?1:0,expression:j.mouth,surface:line,time:p.time%(Math.PI*40)}))gl.uniform1f(u[key],value);
      gl.uniform4fv(u.eyeA,r.eyes[0]);gl.uniform4fv(u.eyeB,r.eyes[1]);gl.uniform4fv(u.mouth,r.mouth);
      gl.uniform1f(u.reflection,1);gl.drawArrays(gl.TRIANGLES,0,b.count);
      gl.uniform1f(u.reflection,0);gl.drawArrays(gl.TRIANGLES,0,b.count);
    }
    ctx.drawImage(this.canvas,0,0,w,h);
  }
  fallback(ctx,creatures,w,h,placement,surface){
    for(const c of creatures){const p=placement(c);if(!p.visible)continue;const r=PAINTED_RIGS[c.spec.id],size=c.spec.height*h,scale=size/r.height;
      ctx.save();ctx.beginPath();ctx.rect(0,0,w,surface(p.x,c.spec.y)*h);ctx.clip();ctx.translate(p.x*w,p.y*h+size*.12);ctx.rotate(p.angle);
      ctx.drawImage(this.image,...r.crop,(r.crop[0]-r.anchor[0])*scale,(r.crop[1]-r.anchor[1])*scale,r.crop[2]*scale,r.crop[3]*scale);ctx.restore();}
  }
  cleanup(){const gl=this.gl;if(gl){for(const {buffer} of Object.values(this.buffers))gl.deleteBuffer(buffer);if(this.texture)gl.deleteTexture(this.texture);if(this.program)gl.deleteProgram(this.program);for(const s of this.shaders)gl.deleteShader(s);gl.getExtension('WEBGL_lose_context')?.loseContext();}this.canvas.width=this.canvas.height=1;this.gl=null;this.buffers={};}
}
