import { clamp } from './living-creatures.js';

// Whole, connected paintings in their original three-quarter poses. The arms
// keep their drawn anatomy: no detached parts and no generic shoulder hinges.
export const PAINTED_RIGS = {
  tall:{anchor:[400,1410],height:1400,neck:[450,970],headBand:[720,1110],eyes:[[580,516,26,30],[908,486,20,29]],tail:[400,1400]},
  green:{anchor:[640,1340],height:1320,neck:[570,770],headBand:[570,830],eyes:[[245,407,28,12],[477,519,35,12]],closed:true,tail:[873,1200]},
  jumper:{anchor:[550,1180],height:1090,neck:[460,650],headBand:[520,750],eyes:[[234,419,15,23],[384,460,21,23]],tail:[685,910]}
};
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function skinWeights(id,[x,y]) {
  const r=PAINTED_RIGS[id];
  return [1-smooth(...r.headBand,y),
    id==='jumper'?smooth(830,1160,y)*smooth(580,750,x):id==='green'?smooth(860,1020,x)*smooth(1110,1270,y):0,
    id==='tall'?1-smooth(220,350,y):id==='jumper'?smooth(550,760,x)*(1-smooth(470,650,y)):0];
}
const vertex=`
attribute vec2 point;
attribute vec3 weights;
uniform vec2 viewport,origin,anchor,neck,tailRoot;
uniform float scale,lean,breath,headAngle,tailAngle,flutter,time,reflection,surface,reach,kick,smallSwimmer;
varying vec2 source,world;
vec2 rotate(vec2 p,vec2 root,float a){float c=cos(a),s=sin(a);p-=root;return root+vec2(p.x*c-p.y*s,p.x*s+p.y*c);}
void main(){
  source=point;
  vec2 p=point+(rotate(point,neck,headAngle)-point)*weights.x;
  p+=(rotate(point,tailRoot,tailAngle)-point)*weights.y;
  p.x+=sin(time*2.1+point.y*.005)*flutter*weights.z;
  if(smallSwimmer>.5){
    // A soft bend through the full length of both short forelimbs. Their roots
    // remain part of the torso; small limits preserve the painted anatomy.
    float arm=(1.-smoothstep(340.,475.,point.x))*smoothstep(540.,580.,point.y)*(1.-smoothstep(730.,775.,point.y));
    p+=(rotate(point,vec2(455.,630.),reach)-point)*arm;
    float feet=smoothstep(840.,920.,point.y)*(1.-smoothstep(990.,1035.,point.y))*(1.-smoothstep(725.,785.,point.x));
    p+=(rotate(point,vec2(610.,850.),kick)-point)*feet;
  }
  // Ribs expand subtly; the face and the shoulder silhouettes remain intact.
  p.x+=(point.x-anchor.x)*breath*.16*(1.-weights.x);
  p.y+=breath*9.*(1.-weights.x);
  world=origin+rotate(p-anchor,vec2(0.),lean)*scale;
  if(reflection>.5)world.y=surface+(surface-world.y)*.17;
  gl_Position=vec4(world.x/viewport.x*2.-1.,1.-world.y/viewport.y*2.,0.,1.);
}`;
const fragment=`
precision highp float;
uniform sampler2D artwork;
uniform vec2 imageSize;
uniform vec4 eyeA,eyeB;
uniform float blink,gaze,closedEyes,surface,reflection,time,frontArm,opacity;
varying vec2 source,world;
vec4 eyelid(vec4 color,vec4 e){
  vec2 d=(source-e.xy)/e.zw;
  float mask=1.-smoothstep(1.02,1.35,length(d));
  if(mask<.001)return color;
  float opening=max(.03,1.-blink);
  vec4 skin=texture2D(artwork,(e.xy+vec2(d.x*e.z,-e.w*1.9))/imageSize);
  vec4 iris=texture2D(artwork,(e.xy+vec2(source.x-e.x-gaze*2.5,(source.y-e.y)/opening))/imageSize);
  float slit=1.-smoothstep(opening*.8,opening+.12,abs(d.y));
  vec4 painted=mix(skin,iris,slit);
  float seam=(1.-smoothstep(.04,.14,abs(d.y-.1*d.x*d.x)))*blink*blink;
  painted.rgb=mix(painted.rgb,vec3(.16,.10,.23),seam*.9);
  return mix(color,painted,mask);
}
void main(){
  float line=surface+sin(world.x*.055+time*1.3)*.5;
  if(reflection<.5&&world.y>line)discard;
  if(reflection>.5&&world.y<line)discard;
  // The near hugging forearm is drawn again over the boulder. It shares exactly
  // the same deformation and UVs as the complete body, including its shoulder.
  if(frontArm>.5){
    if(source.y<665.||source.y>905.||source.x<180.||source.x>700.)discard;
    float edge=875.-max(0.,source.x-400.)*.22;
    if(source.y>edge)discard;
  }
  vec4 color=texture2D(artwork,source/imageSize);
  if(closedEyes<.5)color=eyelid(eyelid(color,eyeA),eyeB);
  float alpha=color.a*opacity;
  if(reflection>.5)alpha*=.12*exp(-max(0.,world.y-surface)/14.);
  gl_FragColor=vec4(color.rgb*alpha,alpha);
}`;

export class LivingPuppets {
  constructor(images) {
    this.mode='reference-character-mesh';this.images=images;this.buffers={};this.textures={};this.shaders=[];
    this.canvas=document.createElement('canvas');
    this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false});
    if(!this.gl)return;
    const gl=this.gl;
    try{
      const compile=(type,src)=>{const shader=gl.createShader(type);this.shaders.push(shader);gl.shaderSource(shader,src);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
      this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);
      this.uniforms=Object.fromEntries(['viewport','origin','anchor','neck','tailRoot','scale','lean','breath','headAngle','tailAngle','flutter','reflection','surface','imageSize','eyeA','eyeB','blink','gaze','closedEyes','time','frontArm','opacity','reach','kick','smallSwimmer'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
      this.attributes=['point','weights'].map(n=>gl.getAttribLocation(this.program,n));
      for(const [id,r] of Object.entries(PAINTED_RIGS)){
        const image=images[id],vertices=[],grid=80,points=[];
        for(let y=0;y<=grid;y++)for(let x=0;x<=grid;x++){
          const p=[x/grid*image.naturalWidth,y/grid*image.naturalHeight];points.push([...p,...skinWeights(id,p)]);
        }
        for(let y=0;y<grid;y++)for(let x=0;x<grid;x++)for(const [dx,dy] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]])vertices.push(...points[(y+dy)*(grid+1)+x+dx]);
        const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);this.buffers[id]={buffer,count:vertices.length/5};
        const texture=this.textures[id]=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      }
      gl.uniform1i(gl.getUniformLocation(this.program,'artwork'),0);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    }catch(error){this.error=String(error);this.cleanup();}
  }
  render(ctx,creatures,w,h,placement=c=>c.pose(),surface=(x,y)=>y,frontArm=false){
    const gl=this.gl;
    if(!gl||gl.isContextLost()){if(!frontArm)this.fallback(ctx,creatures,w,h,placement,surface);return;}
    if(this.canvas.width!==Math.round(w)||this.canvas.height!==Math.round(h)){this.canvas.width=Math.round(w);this.canvas.height=Math.round(h);}
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);
    const u=this.uniforms;gl.uniform2f(u.viewport,w,h);gl.uniform1f(u.frontArm,frontArm?1:0);
    for(const c of creatures){
      const p=placement(c);if(!p.visible)continue;
      const id=c.spec.id,r=PAINTED_RIGS[id],b=this.buffers[id],image=this.images[id],size=c.spec.height*h,line=surface(p.x,c.spec.y)*h;
      if(frontArm&&id!=='green')continue;
      gl.bindTexture(gl.TEXTURE_2D,this.textures[id]);gl.uniform2f(u.imageSize,image.naturalWidth,image.naturalHeight);
      gl.bindBuffer(gl.ARRAY_BUFFER,b.buffer);
      for(let i=0;i<2;i++){gl.enableVertexAttribArray(this.attributes[i]);gl.vertexAttribPointer(this.attributes[i],i?3:2,gl.FLOAT,false,20,i?8:0);}
      gl.uniform2f(u.origin,p.x*w,p.y*h+(line-c.spec.y*h));
      for(const [key,value] of Object.entries({anchor:r.anchor,neck:r.neck,tailRoot:r.tail}))gl.uniform2fv(u[key],value);
      const head=p.joints.head*(id==='green'?.09:.22),lean=p.angle*(id==='green'?.22:id==='tall'?.4:1);
      for(const [key,value] of Object.entries({scale:size/r.height,lean,breath:p.breath,headAngle:head,tailAngle:p.joints.tail*.5,
        flutter:id==='tall'?3:5,smallSwimmer:id==='jumper'?1:0,reach:clamp((.34+p.joints.armR)*-.12,-.06,.22),kick:clamp((p.joints.legL-.06)*-.16,-.2,.05),blink:p.blink,gaze:p.gaze,closedEyes:r.closed?1:0,surface:line,time:p.time%(Math.PI*40),opacity:frontArm?1-smooth(.04,.16,p.depth):1}))gl.uniform1f(u[key],value);
      gl.uniform4fv(u.eyeA,r.eyes[0]);gl.uniform4fv(u.eyeB,r.eyes[1]);
      if(!frontArm){gl.uniform1f(u.reflection,1);gl.drawArrays(gl.TRIANGLES,0,b.count);}
      gl.uniform1f(u.reflection,0);gl.drawArrays(gl.TRIANGLES,0,b.count);
    }
    ctx.drawImage(this.canvas,0,0,w,h);
  }
  fallback(ctx,creatures,w,h,placement,surface){
    for(const c of creatures){const p=placement(c);if(!p.visible)continue;const r=PAINTED_RIGS[c.spec.id],image=this.images[c.spec.id],scale=c.spec.height*h/r.height;
      ctx.save();ctx.beginPath();ctx.rect(0,0,w,surface(p.x,c.spec.y)*h);ctx.clip();ctx.translate(p.x*w,p.y*h);ctx.rotate(p.angle*(c.spec.id==='jumper'?1:.25));
      ctx.drawImage(image,-r.anchor[0]*scale,-r.anchor[1]*scale,image.naturalWidth*scale,image.naturalHeight*scale);ctx.restore();}
  }
  cleanup(){const gl=this.gl;if(gl){for(const {buffer} of Object.values(this.buffers))gl.deleteBuffer(buffer);for(const texture of Object.values(this.textures))gl.deleteTexture(texture);if(this.program)gl.deleteProgram(this.program);for(const s of this.shaders)gl.deleteShader(s);gl.getExtension('WEBGL_lose_context')?.loseContext();}this.canvas.width=this.canvas.height=1;this.gl=null;this.buffers={};this.textures={};}
}
