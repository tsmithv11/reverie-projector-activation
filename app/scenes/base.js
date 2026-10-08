export const PALETTE = { pink: '#ffa0d0', lavender: '#E7D2F6', purple: '#271431', blue: '#4d65ff', orange: '#FF734A', cyan: '#64e8f3', leaf: '#b8d8ae' };
export class Scene {
  initialize() {}
  activate() {}
  update() {}
  render() {}
  deactivate() {}
  cleanup() {}
}
export function camera(ctx, frame, w, h, opacity = 1, filter = 'none') {
  ctx.save(); ctx.globalAlpha = opacity; ctx.filter = filter;
  if (frame) ctx.drawImage(frame, 0, 0, w, h);
  ctx.restore();
}
export function boxes(ctx, data, w, h, color = '#70eaff', labels = true) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8 * w / 1280; ctx.font = `${Math.max(12, w * .009)}px monospace`;
  for (const b of data.slice(0, 24)) {
    const x = b.x * w, y = b.y * h, bw = b.w * w, bh = b.h * h;
    ctx.strokeRect(x, y, bw, bh);
    const l = Math.min(bw, bh) * .13;
    ctx.lineWidth = 4 * w / 1280; ctx.beginPath(); ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y); ctx.moveTo(x + bw - l, y + bh); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw, y + bh - l); ctx.stroke(); ctx.lineWidth = 1.8 * w / 1280;
    if (labels) { const text = `PERSON  ${Math.round(b.score * 100)}%`; ctx.fillStyle = '#271431bc'; ctx.fillRect(x, y - 23, ctx.measureText(text).width + 14, 22); ctx.fillStyle = color; ctx.fillText(text, x + 7, y - 7); }
  }
  ctx.restore();
}
export function monster(ctx, x, y, size, color, t, smile = true) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.7) * .045);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = size * .16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-size * .5, 0); ctx.lineTo(-size * .85, Math.sin(t * 3) * size * .18); ctx.moveTo(size * .5, 0); ctx.lineTo(size * .8, -Math.sin(t * 3) * size * .18); ctx.stroke();
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * size * .32, -size * .64, size * .13, size * .31, side * .35, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(0, 0, size * .62, size * .7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff55'; ctx.beginPath(); ctx.ellipse(0, size * .2, size * .45, size * .38, 0, 0, Math.PI * 2); ctx.fill();
  for (const side of [-1, 1]) { ctx.fillStyle = '#fff9f3'; ctx.beginPath(); ctx.ellipse(side * size * .23, -size * .17, size * .15, size * .19, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#271431'; ctx.beginPath(); ctx.arc(side * size * .23 + Math.sin(t) * size * .025, -size * .14, size * .075, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffa0d0'; ctx.beginPath(); ctx.ellipse(side * size * .4, size * .06, size * .12, size * .065, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#442449'; ctx.lineWidth = size * .035; ctx.beginPath(); ctx.arc(0, size * .08, size * .18, 0, Math.PI, !smile); ctx.stroke(); ctx.restore();
}
