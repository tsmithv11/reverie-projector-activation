// Pure, fixed-size analysis. Coordinates are normalized in the mirrored camera plane.
export class MotionField {
  constructor(width = 160, height = 90, cols = 24, rows = 14) { this.width = width; this.height = height; this.cols = cols; this.rows = rows; this.prev = null; this.energy = new Float32Array(cols * rows); this.still = new Float32Array(cols * rows); }
  analyze(pixels, boxes = [], dt = .1) {
    const { width: w, height: h, cols, rows } = this;
    const gray = new Float32Array(w * h), count = new Uint16Array(cols * rows), raw = new Float32Array(cols * rows);
    let mean = 0, oldMean = 0;
    for (let i = 0; i < gray.length; i++) { gray[i] = pixels[i * 4] * .299 + pixels[i * 4 + 1] * .587 + pixels[i * 4 + 2] * .114; mean += gray[i]; oldMean += this.prev?.[i] || 0; }
    const shift = (mean - oldMean) / gray.length;
    if (this.prev) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, cell = Math.min(rows - 1, Math.floor(y / h * rows)) * cols + Math.min(cols - 1, Math.floor(x / w * cols));
      raw[cell] += Math.max(0, Math.abs(gray[i] - this.prev[i] - shift) - 12) / 70; count[cell]++;
    }
    const points = [], calm = []; let total = 0;
    const smooth = 1 - Math.exp(-Math.min(dt, .5) / .32);
    for (let i = 0; i < raw.length; i++) {
      this.energy[i] += (Math.min(1, raw[i] / Math.max(1, count[i])) - this.energy[i]) * smooth;
      const x = (i % cols + .5) / cols, y = (Math.floor(i / cols) + .5) / rows;
      const occupied = boxes.some(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      // Hysteresis: modest motion drains slowly; only sustained stillness attracts butterflies.
      this.still[i] = occupied ? Math.max(0, Math.min(10, this.still[i] + (this.energy[i] < .045 ? dt : -dt * .5))) : Math.max(0, this.still[i] - dt * 2);
      if (this.energy[i] > .045) points.push({ x, y, strength: this.energy[i] });
      if (this.still[i] > 2.5 && occupied) calm.push({ x, y, strength: this.still[i] / 10 });
      total += this.energy[i];
    }
    // Sobel edges share the same gray image; never claim depth or physical speed.
    const edges = new Uint8ClampedArray(w * h * 4);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -gray[i - w - 1] + gray[i - w + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + w - 1] + gray[i + w + 1];
      const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      const edge = Math.hypot(gx, gy) > 75;
      edges[i * 4] = edge ? 34 : 5; edges[i * 4 + 1] = edge ? 186 : 10; edges[i * 4 + 2] = edge ? 255 : 29; edges[i * 4 + 3] = 255;
    }
    this.prev = gray;
    return { energy: this.energy.slice(), points: points.sort((a, b) => b.strength - a.strength).slice(0, 48), calm: calm.slice(0, 24), amount: total / raw.length, edges, width: w, height: h, cols, rows };
  }
}
