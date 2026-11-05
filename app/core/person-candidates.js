import { describePerson } from './person-masks.js';
import { MAX_PEOPLE } from './person-tracker.js';

const BODY_POINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const TORSO_POINTS = [11, 12, 23, 24];
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const reliable = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && Number.isFinite(p.visibility) && p.visibility >= .45;

function onForeground(p, mask, width, height) {
  const x = Math.round(p.x * (width - 1)), y = Math.round(p.y * (height - 1));
  // Allow a two-pixel boundary error without accepting distant background poses.
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && xx < width && yy >= 0 && yy < height && mask[yy * width + xx] >= .5) return true;
  }
  return false;
}

// A mask alone is not person evidence. Accept a visible upper OR lower body;
// never demand a face, upright stance, or all 33 landmarks from cropped people.
export function describePose(mask, pixels, width, height, landmarks = []) {
  const supported = new Set(BODY_POINTS.filter(i => reliable(landmarks[i]) && onForeground(landmarks[i], mask, width, height)));
  if (supported.size < 4 || TORSO_POINTS.filter(i => supported.has(i)).length < 2) return null;
  const bones = BONES.filter(([a, b]) => supported.has(a) && supported.has(b) &&
    Math.hypot((landmarks[a].x - landmarks[b].x) * width, (landmarks[a].y - landmarks[b].y) * height) >= 3);
  if (bones.length < 2) return null;
  const description = describePerson(mask, pixels, width, height, landmarks.map((p, i) => supported.has(i) ? p : undefined));
  if (!description) return null;
  return { ...description, quality: [...supported].reduce((sum, i) => sum + landmarks[i].visibility, 0) / supported.size };
}

function duplicate(a, b, width, height) {
  let intersection = 0, areaA = 0, areaB = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    const index = y * width + x, aa = a.mask[index] >= .6, bb = b.mask[index] >= .6;
    if (aa) areaA++;
    if (bb) areaB++;
    if (aa && bb) intersection++;
  }
  if (!intersection) return false;
  if (intersection / Math.min(areaA, areaB) < .8) return false;
  let common = 0, close = 0;
  const tolerance = Math.max(2, Math.sqrt(Math.min(areaA, areaB) * 4) * .06);
  for (const i of BODY_POINTS) {
    const p = a.landmarks[i], q = b.landmarks[i];
    if (!reliable(p) || !reliable(q)) continue;
    common++;
    if (Math.hypot((p.x - q.x) * width, (p.y - q.y) * height) < tolerance) close++;
  }
  // Overlapping neighbors remain separate unless their actual joints coincide.
  return common >= 4 && close / common >= .75;
}

export function selectPersonCandidates(candidates, width, height) {
  const selected = [];
  for (const candidate of [...candidates].sort((a, b) => b.description.quality - a.description.quality)) {
    if (selected.some(other => duplicate(candidate, other, width, height))) continue;
    selected.push(candidate);
    if (selected.length === MAX_PEOPLE) break;
  }
  return selected;
}
