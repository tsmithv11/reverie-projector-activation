// Continuous, locally weighted articulation of the original painted artwork.
// One shared mesh/context draws the entire cast; no crossfaded silhouettes or
// frame substitution. Coordinates below are authored landmarks in the atlas.
const RIGS = {
  tall: { eyes: [[370,169,11,13], [475,158,8,11]], hand: [300,355], tail: [135,365] },
  green: { eyes: [[831,215,15,18], [921,182,10,14]], hand: [780,350], tail: [648,385] },
  blue: { eyes: [[350,190,13,15], [448,186,8,12]], hand: [304,331], tail: [118,340] },
  antenna: { eyes: [[388,318,14,15], [502,311,9,13]], hand: [288,423], tail: [117,342] },
  pink: { eyes: [[352,279,15,17], [451,263,11,15]], hand: [283,429], tail: [106,379] },
  jumper: { eyes: [[353,191,13,14], [443,178,9,12]], hand: [271,348], tail: [136,364] }
};
const vertex = `
attribute vec2 point;
uniform vec4 crop;
uniform vec2 atlasSize, anchor, viewport, origin;
uniform float pixelScale, angle, breath, squash, gaze, gesture, flutter, reflection, surface;
uniform vec2 head, hand, tail;
varying vec2 source;
varying vec2 world;
float weight(vec2 p, vec2 center, vec2 radius) {
  vec2 d = (p - center) / radius;
  return exp(-dot(d,d) * 2.0);
}
void main() {
  source = crop.xy + point * crop.zw;
  vec2 p = source - anchor;
  float headW = weight(source, head, vec2(180.,180.));
  float handW = weight(source, hand, vec2(75.,105.));
  float tailW = weight(source, tail, vec2(105.,115.));
  float crownW = 1.0 - smoothstep(head.y - 160., head.y - 20., source.y);
  p.x += gaze * 15. * headW + flutter * 10. * crownW;
  p.y += gaze * 4. * headW;
  // A weighted arm lift rotates about the shoulder; tail/crown lag behind.
  p.x += gesture * 23. * handW + flutter * 13. * tailW;
  p.y -= gesture * 46. * handW;
  p.y += flutter * 17. * tailW;
  p *= vec2(1. - breath * .45 - squash * .5, 1. + breath + squash);
  float c = cos(angle), s = sin(angle);
  p = vec2(p.x*c - p.y*s, p.x*s + p.y*c) * pixelScale;
  world = origin + p;
  if (reflection > .5) world.y = surface + (surface - world.y) * .22;
  gl_Position = vec4(world.x / viewport.x * 2. - 1., 1. - world.y / viewport.y * 2., 0., 1.);
}`;
const fragment = `
precision mediump float;
uniform sampler2D artwork;
uniform vec2 atlasSize;
uniform vec4 eyeA, eyeB;
uniform float blink, gaze, surface, reflection, opacity, time;
varying vec2 source;
varying vec2 world;
vec4 eye(vec4 color, vec4 e) {
  vec2 d = (source - e.xy) / e.zw;
  float mask = 1. - smoothstep(1., 1.3, length(d));
  float opening = max(.025, 1. - blink);
  vec2 at = e.xy + vec2(source.x - e.x - gaze * 1.5, (source.y - e.y) / opening);
  vec4 iris = texture2D(artwork, at / atlasSize);
  vec4 lid = texture2D(artwork, (e.xy + vec2(d.x * e.z, -e.w * 1.65)) / atlasSize);
  float slit = 1. - smoothstep(opening * .8, opening + .12, abs(d.y));
  vec4 result = mix(lid, iris, slit);
  float seam = (1. - smoothstep(.05,.16,abs(d.y - .08 * d.x*d.x))) * blink * blink;
  result.rgb = mix(result.rgb, vec3(.20,.13,.28), seam * .8);
  return mix(color, result, mask * smoothstep(0., .08, blink));
}
void main() {
  float waterline = surface + sin(world.x * .055 + time * 1.5) * .8;
  if (reflection < .5 && world.y > waterline) discard;
  if (reflection > .5 && world.y < waterline) discard;
  vec4 color = texture2D(artwork, source / atlasSize);
  color = eye(eye(color, eyeA), eyeB);
  color.a *= opacity;
  if (reflection > .5) color.a *= .11 * exp(-max(0.,world.y-surface) / 22.);
  gl_FragColor = vec4(color.rgb * color.a, color.a);
}`;

export class LivingPuppets {
  constructor(sprites) {
    this.sprites = sprites; this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    this.textures = {}; this.shaders = [];
    if (!this.gl) return;
    const gl = this.gl;
    try {
      const compile = (type, source) => {
        const shader = gl.createShader(type); this.shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      this.program = gl.createProgram();
      gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);
      this.uniforms = Object.fromEntries(['crop', 'atlasSize', 'anchor', 'viewport', 'origin', 'pixelScale', 'angle', 'breath', 'squash', 'gaze', 'gesture', 'flutter', 'reflection', 'surface', 'head', 'hand', 'tail', 'eyeA', 'eyeB', 'blink', 'opacity', 'time'].map(n => [n, gl.getUniformLocation(this.program, n)]));
      const vertices = [], grid = 24;
      for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
        for (const [dx,dy] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]) vertices.push((x+dx)/grid,(y+dy)/grid);
      }
      this.vertexCount = vertices.length / 2;
      this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
      const point = gl.getAttribLocation(this.program, 'point'); gl.enableVertexAttribArray(point); gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);
      for (const [id, sprite] of Object.entries(sprites)) {
        const texture = this.textures[id] = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sprite.image);
      }
      gl.uniform1i(gl.getUniformLocation(this.program, 'artwork'), 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } catch (error) { this.error = String(error); this.cleanup(); }
  }

  render(ctx, creatures, w, h, placement = c => c.pose()) {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) { this.fallback(ctx, creatures, w, h, placement); return; }
    if (this.canvas.width !== Math.round(w) || this.canvas.height !== Math.round(h)) { this.canvas.width = Math.round(w); this.canvas.height = Math.round(h); }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    const u = this.uniforms;
    gl.uniform2f(u.viewport, w, h);
    for (const c of creatures) {
      const p = placement(c), sprite = this.sprites[c.spec.id], rig = RIGS[c.spec.id];
      if (!p.visible || !sprite) continue;
      const f = sprite.frames[p.frame], size = c.spec.height * h, pixelScale = size / sprite.height;
      gl.bindTexture(gl.TEXTURE_2D, this.textures[c.spec.id]);
      gl.uniform4f(u.crop, f.sx, f.sy, f.sw, f.sh);
      gl.uniform2f(u.atlasSize, sprite.image.naturalWidth, sprite.image.naturalHeight);
      gl.uniform2f(u.anchor, f.sx + f.anchorX, f.sy + f.anchorY);
      gl.uniform2f(u.origin, p.x * w, p.y * h + size * .12);
      gl.uniform1f(u.pixelScale, pixelScale); gl.uniform1f(u.surface, (p.waterline ?? c.spec.y) * h);
      gl.uniform2f(u.head, (rig.eyes[0][0]+rig.eyes[1][0])/2, (rig.eyes[0][1]+rig.eyes[1][1])/2);
      gl.uniform2fv(u.hand, rig.hand); gl.uniform2fv(u.tail, rig.tail);
      gl.uniform4fv(u.eyeA, rig.eyes[0]); gl.uniform4fv(u.eyeB, rig.eyes[1]);
      for (const name of ['angle', 'breath', 'squash', 'gaze', 'gesture', 'flutter', 'blink']) gl.uniform1f(u[name], p[name]);
      gl.uniform1f(u.time, p.time % (Math.PI * 40)); gl.uniform1f(u.opacity, 1);
      gl.uniform1f(u.reflection, 1); gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
      gl.uniform1f(u.reflection, 0); gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    }
    ctx.drawImage(this.canvas, 0, 0, w, h);
  }

  fallback(ctx, creatures, w, h, placement) {
    for (const c of creatures) {
      const p = placement(c), sprite = this.sprites[c.spec.id]; if (!p.visible || !sprite) continue;
      const size = c.spec.height * h, f = sprite.frames[p.frame], scale = size / sprite.height;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, (p.waterline ?? c.spec.y) * h); ctx.clip();
      ctx.translate(p.x * w, p.y * h + size * .12); ctx.rotate(p.angle + p.gaze * .018);
      ctx.scale(1 - p.breath * .45 - p.squash * .5, 1 + p.breath + p.squash);
      sprite.draw(ctx, p.frame, size);
      // A soft painted lid keeps blink timing even without a GPU. Sample the
      // fur immediately above each eye rather than introducing a flat patch.
      if (p.blink > .02) for (const [x,y,rx,ry] of RIGS[c.spec.id].eyes) {
        ctx.save(); ctx.beginPath(); ctx.ellipse((x-f.sx-f.anchorX)*scale, (y-f.sy-f.anchorY)*scale, rx*scale*1.2, ry*scale*1.2, 0, 0, Math.PI*2); ctx.clip();
        ctx.globalAlpha = p.blink;
        ctx.drawImage(sprite.image, x-rx*1.4, y-ry*2.6, rx*2.8, ry, (x-rx*1.4-f.sx-f.anchorX)*scale, (y-ry*1.3-f.sy-f.anchorY)*scale, rx*2.8*scale, ry*2.6*scale);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  cleanup() {
    const gl = this.gl;
    if (gl) {
      for (const texture of Object.values(this.textures)) gl.deleteTexture(texture);
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
      for (const shader of this.shaders) gl.deleteShader(shader);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.canvas.width = this.canvas.height = 1; this.gl = null; this.textures = {};
  }
}
