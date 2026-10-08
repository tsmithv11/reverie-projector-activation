export function demoCrowd(ctx, w, h, t, count = 18) {
  const bg = ctx.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#f9b6d0'); bg.addColorStop(1, '#514285'); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 1;
  for (let x = 0; x < w; x += w / 16) { ctx.beginPath(); ctx.moveTo(w / 2, h * .3); ctx.lineTo(x, h); ctx.stroke(); }
  const boxes = [];
  for (let i = 0; i < count; i++) {
    const x = ((i * .143 + Math.sin(t * .12 + i) * .09 + 1) % 1), y = .18 + (i % 3) * .17 + Math.sin(t * .55 + i) * .014, r = .024 + (i % 3) * .009;
    ctx.fillStyle = ['#dfcde9', '#888ecc', '#222d53', '#b8cfb0', '#cf7ba8'][i % 5];
    ctx.beginPath(); ctx.ellipse(x * w, y * h, r * w, r * w * 1.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect((x - r * 1.6) * w, (y + r * 1.4) * h, r * 3.2 * w, r * 8 * h, [r * w, r * w, 8, 8]); ctx.fill();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = r * w * .65; ctx.lineCap = 'round';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo((x + side * r) * w, (y + r * 3) * h); ctx.lineTo((x + side * r * (2.4 + Math.sin(t * 1.2 + i))) * w, (y + r * 5 + Math.cos(t + i) * .05) * h); ctx.stroke(); }
    boxes.push({ x: Math.max(0, x - r * 1.9), y: y - r * 1.5, w: r * 3.8, h: r * 11, score: .9 });
  }
  return boxes;
}
