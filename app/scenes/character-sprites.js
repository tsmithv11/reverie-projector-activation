// The generated sheets are six distinct poses on transparent backgrounds.
// Cache their alpha bounds once; every displayed character is one atlas draw.
export class CharacterSprites {
  constructor(image) {
    this.image = image;
    const cw = image.naturalWidth / 3, ch = image.naturalHeight / 2;
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Generated poses can extend a little beyond a nominal cell. Find the
    // transparent gutters so waving hands, noses and tails are never clipped.
    const gutter = (nominal, radius, score) => {
      let best = Math.round(nominal), cost = Infinity;
      for (let n = Math.round(nominal - radius); n <= nominal + radius; n++) {
        const value = score(n) + Math.abs(n - nominal) * .0001;
        if (value < cost) { cost = value; best = n; }
      }
      return best;
    };
    const splitY = gutter(ch, ch * .16, y => {
      let count = 0;
      for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4 + 3] >= 80) count++;
      return count;
    });
    const rows = [0, splitY, canvas.height];
    const columns = [0, 1].map(row => [0, ...[cw, cw * 2].map(x => gutter(x, cw * .25, column => {
      let count = 0;
      for (let y = rows[row]; y < rows[row + 1]; y++) if (data[(y * canvas.width + column) * 4 + 3] >= 80) count++;
      return count;
    })), canvas.width]);
    this.frames = Array.from({ length: 6 }, (_, index) => {
      const row = Math.floor(index / 3), col = index % 3;
      const sx = columns[row][col], sy = rows[row];
      const right = columns[row][col + 1], bottom = rows[row + 1];
      let minX = right, maxX = sx, minY = bottom, maxY = sy;
      for (let y = sy; y < bottom; y++) for (let x = sx; x < right; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] < 80) continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      if (maxX <= minX || maxY <= minY) throw Error('Character pose is missing');
      // Anchor at the lower torso, so a raised arm does not shift the body.
      let weightedX = 0, weight = 0;
      for (let y = Math.round(minY + (maxY - minY) * .57); y <= minY + (maxY - minY) * .79; y++) {
        for (let x = minX; x <= maxX; x++) {
          const a = data[(y * canvas.width + x) * 4 + 3];
          weightedX += x * a; weight += a;
        }
      }
      return { sx, sy, sw: right - sx, sh: bottom - sy, anchorX: (weight ? weightedX / weight : (minX + maxX) / 2) - sx, anchorY: maxY - sy, height: maxY - minY + 1 };
    });
    this.height = this.frames[0].height;
    canvas.width = canvas.height = 1;
  }

  draw(ctx, frame, height, direction = 1) {
    const f = this.frames[frame], scale = height / this.height;
    ctx.save(); ctx.scale(direction, 1);
    ctx.drawImage(this.image, f.sx, f.sy, f.sw, f.sh, -f.anchorX * scale, -f.anchorY * scale, f.sw * scale, f.sh * scale);
    ctx.restore();
  }
}
