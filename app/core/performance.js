export class AdaptiveQuality {
  constructor() { this.level = 1; this.slow = 0; this.fast = 0; }
  sample(fps, mode) {
    if (mode !== 'auto') { this.level = { high: 2, balanced: 1, low: 0 }[mode] ?? 1; return this.level; }
    if (fps < 25) { this.slow++; this.fast = 0; } else if (fps > 28) { this.fast++; this.slow = 0; } else { this.fast = this.slow = 0; }
    if (this.slow >= 3) { this.level = Math.max(0, this.level - 1); this.slow = 0; }
    if (this.fast >= 20) { this.level = Math.min(2, this.level + 1); this.fast = 0; }
    return this.level;
  }
}
