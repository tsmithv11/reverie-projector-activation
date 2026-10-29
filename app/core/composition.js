// Outer and inner corners traced from the supplied 321 × 284 reference.
// Rotate in pixel space so the tapered silhouette survives every output format.
const OUTER = [[80, 56], [249, 26], [299, 198], [22, 263]];
const INNER = [[91, 69], [238, 44], [278, 184], [47, 241]];
export const SCENE_ROTATIONS = Object.freeze({ heat: 16, robots: -6, monsters: 0, lines: 26, garden: 10, cartoon: 21, words: -12 });
export const TRANSITION_MS = 1400;
export const LOGO_BOTTOM = .075;

function rotate(points, degrees) {
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return points.map(([x, y]) => ({ x: x * c - y * s, y: x * s + y * c }));
}
function bounds(points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
export function portalGeometry(w, h, sceneId) {
  const angle = SCENE_ROTATIONS[sceneId] ?? 0;
  const outer = rotate(OUTER, angle), inner = rotate(INNER, angle), box = bounds(outer);
  // Fit each rotation to the screen with only a 1.5% short-edge buffer.
  // One scale preserves the entire silhouette, rim and opening.
  const inset = Math.min(w, h) * .015;
  const scale = Math.min((w - 2 * inset) / box.width, (h - 2 * inset) / box.height);
  const place = p => ({ x: w / 2 + (p.x - box.x - box.width / 2) * scale, y: h / 2 + (p.y - box.y - box.height / 2) * scale });
  return { outer: outer.map(place), inner: inner.map(place) };
}

export function polygonPath(ctx, points) {
  points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
}

// Fit the artwork to the opening's rotated bounds; the common clip supplies
// the tapered edges without bending the characters or changing camera tracking.
export function artworkTransform(portal, w, h) {
  const [left, right] = [portal.inner[3], portal.inner[2]];
  const length = Math.hypot(right.x - left.x, right.y - left.y);
  const ux = (right.x - left.x) / length, uy = (right.y - left.y) / length;
  const local = portal.inner.map(p => ({ x: p.x * ux + p.y * uy, y: -p.x * uy + p.y * ux }));
  const box = bounds(local);
  return [ux * box.width / w, uy * box.width / w, -uy * box.height / h, ux * box.height / h,
    ux * box.x - uy * box.y, uy * box.x + ux * box.y];
}

export function paintBackground(ctx, w, h) {
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#f5acd3'); gradient.addColorStop(.5, '#bea8df'); gradient.addColorStop(1, '#7297e5');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
}

export function paintTransition(ctx, previous, w, h, elapsed) {
  if (elapsed >= TRANSITION_MS) return;
  const progress = Math.max(0, elapsed / TRANSITION_MS);
  const ease = value => value * value * (3 - 2 * value);
  ctx.save();
  if (progress < .5) {
    // Completely cover the incoming scene until the outgoing frame is gone.
    paintBackground(ctx, w, h);
    ctx.globalAlpha = 1 - ease(progress * 2);
    ctx.drawImage(previous, 0, 0, w, h);
  } else {
    ctx.globalAlpha = 1 - ease((progress - .5) * 2);
    paintBackground(ctx, w, h);
  }
  ctx.restore();
}
