// A single textured quad gives the painted characters very small, local breaths.
// The bridge, rock and shoreline stay fixed; there is no full-frame camera drift.
const vertex = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = vec2((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);
  gl_Position = vec4(position, 0.0, 1.0);
}`;
const fragment = `
precision mediump float;
uniform sampler2D artwork;
uniform float time;
varying vec2 uv;
float region(vec2 p, vec2 center, vec2 radius) {
  return 1.0 - smoothstep(0.2, 1.0, length((p - center) / radius));
}
vec2 breathe(vec2 p, vec2 center, vec2 radius, float phase, float amplitude) {
  float mask = region(p, center, radius);
  float breath = sin(time * 1.45 + phase);
  return vec2((p.x - center.x) * breath * 0.008, breath * amplitude) * mask;
}
void main() {
  vec2 p = uv;
  vec2 drift = breathe(p, vec2(0.278, 0.455), vec2(0.18, 0.28), 0.0, 0.0017);
  drift += breathe(p, vec2(0.080, 0.710), vec2(0.10, 0.16), 1.8, 0.0014);
  drift += breathe(p, vec2(0.563, 0.525), vec2(0.067, 0.19), 3.2, 0.0013);
  drift += breathe(p, vec2(0.740, 0.645), vec2(0.082, 0.10), 4.7, 0.0015);
  drift += breathe(p, vec2(0.639, 0.748), vec2(0.037, 0.040), 2.4, 0.0011);
  float water = smoothstep(0.78, 0.92, p.y);
  water *= 1.0 - smoothstep(0.76, 0.91, p.x + (p.y - 0.8) * 0.5);
  drift += vec2(sin(p.y * 150.0 + time * 0.8) * 0.0009,
    sin(p.x * 75.0 + p.y * 100.0 - time * 0.65) * 0.0006) * water;
  gl_FragColor = texture2D(artwork, clamp(p + drift, 0.001, 0.999));
}`;

export class LivingArtwork {
  constructor(image) {
    this.image = image;
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true });
    if (!this.gl) return;
    const gl = this.gl;
    this.shaders = [];
    try {
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        this.shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error('Artwork shader unavailable');
        return shader;
      };
      this.program = gl.createProgram();
      gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw Error('Artwork program unavailable');
      gl.useProgram(this.program);
      this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.time = gl.getUniformLocation(this.program, 'time');
      this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.uniform1i(gl.getUniformLocation(this.program, 'artwork'), 0);
    } catch { this.cleanup(); }
  }

  render(ctx, w, h, time) {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) { ctx.drawImage(this.image, 0, 0, w, h); return; }
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    // Reset at a common multiple of all wave periods to retain float precision.
    gl.uniform1f(this.time, time % (Math.PI * 40));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.drawImage(this.canvas, 0, 0, w, h);
  }

  cleanup() {
    if (!this.gl) return;
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.program) gl.deleteProgram(this.program);
    for (const shader of this.shaders || []) gl.deleteShader(shader);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.width = this.canvas.height = 1;
    this.gl = null;
  }
}
