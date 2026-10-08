// Animate the five painted creatures and water in one GPU pass. The shared
// motion envelope comes from the camera; the bridge and shoreline stay fixed.
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
uniform float activity;
varying vec2 uv;
float region(vec2 p, vec2 center, vec2 radius) {
  return 1.0 - smoothstep(0.55, 1.0, length((p - center) / radius));
}
vec2 creature(vec2 p, vec2 center, vec2 radius, float phase, float speed, float amplitude) {
  float mask = region(p, center, radius);
  float bob = sin(time * speed + phase);
  float sway = sin(time * speed * 0.5 + phase);
  // A broad, soft mask moves each head/body together and lets fins flex, while
  // blending the displacement back into its own painted surroundings.
  float upperBody = clamp((center.y + radius.y - p.y) / radius.y, 0.0, 1.5);
  return vec2(sway * amplitude * 0.65 * upperBody + (p.x - center.x) * bob * 0.025,
    bob * amplitude + (p.y - center.y) * sway * 0.025) * mask * activity;
}
void main() {
  vec2 p = uv;
  vec2 drift = creature(p, vec2(0.278, 0.455), vec2(0.17, 0.28), 0.0, 1.4, 0.010);
  drift += creature(p, vec2(0.080, 0.710), vec2(0.11, 0.16), 1.8, 1.8, 0.013);
  drift += creature(p, vec2(0.563, 0.525), vec2(0.070, 0.20), 3.2, 1.2, 0.009);
  drift += creature(p, vec2(0.740, 0.645), vec2(0.085, 0.11), 4.7, 1.6, 0.014);
  drift += creature(p, vec2(0.639, 0.748), vec2(0.038, 0.046), 2.4, 2.2, 0.010);
  // Cover the entire exposed bay, with soft exclusions for creatures, the
  // central rock and the diagonal shore. Waves run through the reflections.
  float water = smoothstep(0.59, 0.72, p.y);
  water *= 1.0 - smoothstep(0.93, 1.0, p.x + (p.y - 0.7) * 0.8);
  water *= 1.0 - region(p, vec2(0.278, 0.455), vec2(0.18, 0.30));
  water *= 1.0 - region(p, vec2(0.080, 0.700), vec2(0.12, 0.17));
  water *= 1.0 - region(p, vec2(0.533, 0.545), vec2(0.12, 0.22));
  water *= 1.0 - region(p, vec2(0.740, 0.645), vec2(0.09, 0.115));
  water *= 1.0 - region(p, vec2(0.639, 0.748), vec2(0.04, 0.05));
  float wave = sin(p.y * 125.0 + time * 1.8) + sin(p.x * 45.0 - time * 1.2) * 0.45;
  drift += vec2(wave * 0.0045,
    sin(p.x * 70.0 + p.y * 80.0 - time * 1.6) * 0.0025) * water * activity;
  vec4 color = texture2D(artwork, clamp(p + drift, 0.001, 0.999));
  color.rgb += vec3(0.018, 0.012, 0.018) * wave * water * activity;
  gl_FragColor = color;
}`;

export class LivingArtwork {
  constructor(image) {
    this.image = image;
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false });
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
      this.activity = gl.getUniformLocation(this.program, 'activity');
      this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.uniform1i(gl.getUniformLocation(this.program, 'artwork'), 0);
    } catch { this.cleanup(); }
  }

  render(ctx, w, h, time, activity = 0) {
    const gl = this.gl;
    if (!gl || gl.isContextLost() || activity === 0) { ctx.drawImage(this.image, 0, 0, w, h); return; }
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    // Reset at a common multiple of all wave periods to retain float precision.
    gl.uniform1f(this.time, time % (Math.PI * 40));
    gl.uniform1f(this.activity, activity);
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
