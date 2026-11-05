// Outer and inner corners traced from the supplied 321 × 284 reference.
// Rotate in pixel space so the tapered silhouette survives every output format.
const OUTER = [[80, 56], [249, 26], [299, 198], [22, 263]];
const INNER = [[91, 69], [238, 44], [278, 184], [47, 241]];
export const SCENE_ROTATIONS = Object.freeze({ heat: 16, robots: -6, monsters: 0, lines: 26, garden: 10, cartoon: 21, words: -12, animation3d: -18, cyberpunk: 30, claymation: 5, ghibli25: 13, monstersLiving: 0 });
export const TRANSITION_MS = 1400;
export const LOGO_BOTTOM = .075;
// Exact colors from the supplied Reverie brand palette, shared by the surround,
// portal rim and Words in motion. Other scene artwork keeps its own colors.
export const REVERIE_PALETTE = Object.freeze({
  firstLight: '#FDCADB', pink: '#FAA0D0', orchid: '#E1A3D7', lilac: '#C49ED8',
  blue: '#7A9DDA', deep: '#24152F', blush: '#F7B7DB', dawn: '#A8AEDB'
});
const BACKGROUND_COLORS = [REVERIE_PALETTE.firstLight, REVERIE_PALETTE.pink,
  REVERIE_PALETTE.orchid, REVERIE_PALETTE.lilac, REVERIE_PALETTE.blue];

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

export function reverieGradient(ctx, w, h, startOpacity = 1, endOpacity = startOpacity) {
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  BACKGROUND_COLORS.forEach((color, i) => {
    const stop = i / (BACKGROUND_COLORS.length - 1);
    const alpha = Math.round((startOpacity + (endOpacity - startOpacity) * stop) * 255).toString(16).padStart(2, '0');
    gradient.addColorStop(stop, color + alpha);
  });
  return gradient;
}

export function paintBackground(ctx, w, h) {
  ctx.fillStyle = reverieGradient(ctx, w, h); ctx.fillRect(0, 0, w, h);
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
