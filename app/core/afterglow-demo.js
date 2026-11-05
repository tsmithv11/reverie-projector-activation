import { TRACK_COLORS } from './person-tracker.js';
import { composePersonMasks } from './person-masks.js';

// An explicitly synthetic rehearsal, never used as a live-camera fallback.
export function afterglowDemo(canvas, silhouette, time) {
  const w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d', { willReadFrequently: true });
  silhouette.width = w; silhouette.height = h;
  const sc = silhouette.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#24152F'; ctx.fillRect(0, 0, w, h);
  const masks = [], tracks = [];
  for (let i = 0; i < 4; i++) {
    const x = .24 + i * .175 + Math.sin(time * .35 + i * 1.6) * .045, y = .36 + (i % 2) * .07;
    sc.clearRect(0, 0, w, h); sc.fillStyle = '#fff'; sc.strokeStyle = '#fff';
    sc.beginPath(); sc.ellipse(x * w, y * h, w * .022, h * .056, 0, 0, Math.PI * 2); sc.fill();
    sc.beginPath(); sc.roundRect((x - .034) * w, (y + .065) * h, w * .068, h * .22, w * .025); sc.fill();
    sc.lineWidth = w * .019; sc.lineCap = 'round'; sc.lineJoin = 'round';
    for (const side of [-1, 1]) {
      sc.beginPath(); sc.moveTo((x + side * .028) * w, (y + .1) * h);
      sc.lineTo((x + side * .053) * w, (y + .21) * h);
      sc.lineTo((x + side * (.065 + Math.sin(time + i) * .015)) * w, (y + .2 + Math.cos(time * .7 + i) * .07) * h); sc.stroke();
      sc.lineWidth = w * .024; sc.beginPath(); sc.moveTo((x + side * .018) * w, (y + .26) * h);
      sc.lineTo((x + side * .023) * w, (y + .38) * h); sc.lineTo((x + side * .032) * w, (y + .49) * h); sc.stroke();
    }
    const rgba = sc.getImageData(0, 0, w, h).data;
    masks.push(Float32Array.from({ length: w * h }, (_, p) => rgba[p * 4 + 3] / 255));
    ctx.save(); ctx.globalAlpha = .32; ctx.drawImage(silhouette, 0, 0); ctx.restore();
    tracks.push({ id: i + 1, color: TRACK_COLORS[i], x, y: y + .16, top: y - .06 });
  }
  return { ...composePersonMasks(masks, tracks, w, h), pixels: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}
