import { MAX_PEOPLE } from './person-tracker.js';

// Use actual mask pixels for tracking and a small clothing descriptor. Bounds
// stay internal; no rectangles or guessed body silhouettes are ever rendered.
export function describePerson(mask, pixels, width, height, landmarks = []) {
  let n = 0, sx = 0, sy = 0, top = height, left = width, right = 0, bottom = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    if (!(mask[y * width + x] >= .6)) continue;
    n++; sx += x; sy += y; top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
  }
  if (n < 20) return null;
  const torso = [11, 12, 23, 24].map(i => landmarks[i]).filter(p => p && p.visibility > .5 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  const center = torso.length >= 2 ? { x: torso.reduce((s, p) => s + p.x, 0) / torso.length, y: torso.reduce((s, p) => s + p.y, 0) / torso.length } : { x: sx / n / width, y: sy / n / height };
  const mean = [0, 0, 0], squares = [0, 0, 0]; let samples = 0;
  const radiusX = Math.max(4, (right - left) * .22), radiusY = Math.max(4, (bottom - top) * .22);
  for (let y = Math.max(0, Math.floor(center.y * height - radiusY)); y < Math.min(height, center.y * height + radiusY); y += 3) {
    for (let x = Math.max(0, Math.floor(center.x * width - radiusX)); x < Math.min(width, center.x * width + radiusX); x += 3) {
      const i = y * width + x;
      if (!(mask[i] >= .85)) continue;
      samples++;
      for (let c = 0; c < 3; c++) { const value = pixels[i * 4 + c] / 255; mean[c] += value; squares[c] += value * value; }
    }
  }
  const averages = mean.map(v => v / Math.max(1, samples));
  return { ...center, top: top / height, area: n * 4 / (width * height), appearance: [...averages, ...squares.map((v, i) => Math.sqrt(Math.max(0, v / Math.max(1, samples) - averages[i] ** 2)))] };
}

// Marching squares at the model's .5 isocontour, with interpolated subpixel
// crossings. Each independent segment is stroked in one Path2D per person.
export function maskContour(mask, width, height) {
  const segments = [];
  const cases = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[2, 0]], [[0, 1], [2, 3]], [[2, 1]], [[1, 3]], [[1, 0]], [[0, 3]], []];
  const value = (x, y) => x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x];
  for (let y = -1; y < height; y++) for (let x = -1; x < width; x++) {
    const a = value(x, y), b = value(x + 1, y), c = value(x + 1, y + 1), d = value(x, y + 1);
    const code = (a >= .5 ? 1 : 0) | (b >= .5 ? 2 : 0) | (c >= .5 ? 4 : 0) | (d >= .5 ? 8 : 0);
    if (!code || code === 15) continue;
    const v = [a, b, c, d];
    const corners = [[x + .5, y + .5], [x + 1.5, y + .5], [x + 1.5, y + 1.5], [x + .5, y + 1.5]];
    for (const pair of cases[code]) for (const edge of pair) {
      const next = (edge + 1) % 4, t = (.5 - v[edge]) / (v[next] - v[edge]);
      segments.push(Math.max(0, Math.min(width, corners[edge][0] + t * (corners[next][0] - corners[edge][0]))), Math.max(0, Math.min(height, corners[edge][1] + t * (corners[next][1] - corners[edge][1]))));
    }
  }
  return new Float32Array(segments);
}

export function composePersonMasks(masks, tracks, width, height) {
  const count = Math.min(masks.length, tracks.length, MAX_PEOPLE), size = width * height;
  const owned = Array.from({ length: count }, () => new Float32Array(size));
  const fill = new Uint8ClampedArray(size * 4);
  const colors = tracks.slice(0, count).map(t => [1, 3, 5].map(i => parseInt(t.color.slice(i, i + 2), 16)));
  for (let i = 0; i < size; i++) {
    let winner = -1, confidence = .35;
    for (let p = 0; p < count; p++) if (masks[p][i] > confidence) { confidence = masks[p][i]; winner = p; }
    if (winner < 0) continue;
    owned[winner][i] = confidence;
    const a = Math.max(0, Math.min(1, (confidence - .35) / .3));
    fill.set(colors[winner], i * 4); fill[i * 4 + 3] = Math.round(a * a * (3 - 2 * a) * 255);
  }
  return { fill, instances: tracks.slice(0, count).map((track, i) => ({ ...track, contour: maskContour(owned[i], width, height) })) };
}
