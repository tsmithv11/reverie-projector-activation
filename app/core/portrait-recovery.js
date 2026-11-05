import { describePerson } from './person-masks.js';

// This path is for prominent, cropped people. Connected foreground regions
// remain separate; a whole-scene semantic mask must never become one "person".
export function portraitCandidates(foreground, pixels, width, height, boxes) {
  const size = width * height, labels = new Int32Array(size), queue = new Int32Array(size), regions = [];
  let label = 0;
  for (let seed = 0; seed < size; seed++) {
    if (labels[seed] || !(foreground[seed] >= .5)) continue;
    const id = ++label; let head = 0, tail = 1, strong = 0;
    queue[0] = seed; labels[seed] = id;
    while (head < tail) {
      const i = queue[head++], x = i % width;
      if (foreground[i] >= .8) strong++;
      for (const next of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (next < 0 || next >= size || labels[next] || !(foreground[next] >= .5)) continue;
        labels[next] = id; queue[tail++] = next;
      }
    }
    if (strong >= size * .06 && tail >= size * .08) regions.push({ id, count: tail });
  }
  const detections = boxes.filter(b => b.score >= .5 && b.w * b.h >= .04 && b.h >= .25 &&
    [b.x, b.y, b.w, b.h].every(Number.isFinite));
  const candidates = [];
  for (const region of regions.sort((a, b) => b.count - a.count)) {
    const supporting = detections.filter(box => {
      const left = Math.max(0, Math.floor(box.x * width)), right = Math.min(width, Math.ceil((box.x + box.w) * width));
      const top = Math.max(0, Math.floor(box.y * height)), bottom = Math.min(height, Math.ceil((box.y + box.h) * height));
      let hits = 0, samples = 0;
      for (let y = top; y < bottom; y += 2) for (let x = left; x < right; x += 2) {
        samples++; if (labels[y * width + x] === region.id) hits++;
      }
      return samples > 0 && hits / samples >= .55;
    });
    if (!supporting.length) continue;
    // Do not merge two people into a single highlight when semantic masks touch.
    const ambiguous = supporting.some((a, i) => supporting.slice(i + 1).some(b => {
      const intersection = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
        Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return intersection / Math.min(a.w * a.h, b.w * b.h) < .3;
    }));
    if (ambiguous) continue;
    const mask = new Float32Array(size);
    for (let i = 0; i < size; i++) if (labels[i] === region.id) mask[i] = foreground[i];
    const description = describePerson(mask, pixels, width, height);
    if (description) candidates.push({ mask, landmarks: [], description: { ...description, quality: Math.max(...supporting.map(b => b.score)) } });
    if (candidates.length === 2) break;
  }
  return candidates;
}

export function mergePortraitCandidates(poses, portraits) {
  const retained = [...poses];
  for (const portrait of portraits) {
    // A recovered portrait can replace an incomplete pose over the same pixels.
    // Different people keep their own masks and tracks.
    for (let p = retained.length - 1; p >= 0; p--) {
      let area = 0, intersection = 0;
      for (let i = 0; i < portrait.mask.length; i += 2) {
        if (!(retained[p].mask[i] >= .6)) continue;
        area++; if (portrait.mask[i] >= .6) intersection++;
      }
      if (area && intersection / area > .7) retained.splice(p, 1);
    }
    retained.push(portrait);
  }
  return retained;
}
