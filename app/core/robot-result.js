export function usableDimensions(width, height) { return Number.isFinite(width) && Number.isFinite(height) && width >= 256 && height >= 144 && width <= 4096 && height <= 4096; }
// Reject obvious transport/decoder failures, not artistic or semantic quality.
export function usablePixels(pixels) {
  if (!pixels || pixels.length < 1024) return false;
  let mean = 0, squared = 0, count = 0;
  for (let i = 0; i + 2 < pixels.length; i += 128) { const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3; mean += value; squared += value * value; count++; }
  return mean / count >= 3 && squared / count - (mean / count) ** 2 >= 30;
}
