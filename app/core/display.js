// Fixed formats keep their proportions inside the window. Fill follows the
// output's physical pixels, capped by the selected performance budget.
export function outputSize(format, quality, viewportWidth, viewportHeight) {
  const level = [0, 1, 2].includes(quality) ? quality : 1;
  const width = [1280, 1600, 1920][level], height = [720, 900, 1080][level];
  if (format === '4:3') return { width: [960, 1200, 1392][level], height: [720, 900, 1044][level] };
  if (format !== 'fill' || !(viewportWidth > 0 && viewportHeight > 0)) return { width, height };
  const scale = Math.min(1, width / viewportWidth, height / viewportHeight);
  // Even dimensions also give the half-resolution artwork whole-pixel sizes.
  const even = value => Math.max(2, Math.floor(value / 2) * 2);
  return { width: even(viewportWidth * scale), height: even(viewportHeight * scale) };
}

export function coverRect(sourceWidth, sourceHeight, width, height) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale, h = sourceHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

// The camera service analyzes a shared 16:9 plane. Apply the same centered crop
// to its overlays as to the pixels, without changing the shared camera packet.
export function fitCameraAnalysis(analysis, sourceWidth, sourceHeight, width, height) {
  const rect = coverRect(sourceWidth, sourceHeight, width, height);
  const sx = rect.width / width, sy = rect.height / height, ox = rect.x / width, oy = rect.y / height;
  const point = p => ({ ...p, x: p.x * sx + ox, y: p.y * sy + oy });
  const visible = p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  return {
    ...analysis,
    boxes: analysis.boxes.map(b => ({ ...point(b), w: b.w * sx, h: b.h * sy }))
      .filter(b => b.x < 1 && b.y < 1 && b.x + b.w > 0 && b.y + b.h > 0),
    motion: { ...analysis.motion, points: analysis.motion.points.map(point).filter(visible), calm: analysis.motion.calm.map(point).filter(visible) }
  };
}
