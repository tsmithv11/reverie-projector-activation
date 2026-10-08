const TAU = Math.PI * 2;
const clamp = n => Math.max(0, Math.min(1, n));
// Stable variation makes the dormant garden a composed landscape across visits.
const noise = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const surface = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function glow(ctx, x, y, radius, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color); g.addColorStop(1, '#00000000');
  ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function leafSprite(tint) {
  const canvas = surface(160, 88), ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 45, 145, 5);
  g.addColorStop(0, '#11272b'); g.addColorStop(.48, tint); g.addColorStop(1, '#b1c8a4');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(5, 76);
  ctx.bezierCurveTo(8, 22, 87, 38, 151, 8); ctx.bezierCurveTo(125, 53, 100, 94, 5, 76); ctx.fill();
  ctx.strokeStyle = '#cee5c758'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(5, 76); ctx.quadraticCurveTo(89, 62, 151, 8); ctx.stroke();
  for (let i = 1; i < 9; i++) {
    const x = 10 + i * 13, y = 77 - (x / 151) ** 1.6 * 65;
    ctx.strokeStyle = '#dbedce29'; ctx.lineWidth = .6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 6, y - 10, x - 13, y - 17); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 14, y + 3, x + 23, y + 6); ctx.stroke();
  }
  return canvas;
}

export function drawBud(ctx, size, type = 0, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.fillStyle = ['#c68ba7', '#8993c7', '#d0b583'][type];
  ctx.beginPath(); ctx.ellipse(0, -size * .3, size * .55, size, -.25, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#aec6a7'; ctx.lineWidth = Math.max(.6, size * .13);
  ctx.beginPath(); ctx.moveTo(-size * .65, 0); ctx.quadraticCurveTo(0, size, size * .65, -size * .3); ctx.stroke();
  ctx.restore();
}

export function drawStem(ctx, height, lean, age, type = 0, leaves) {
  if (height < .1) return;
  const g = ctx.createLinearGradient(0, 0, 0, -height);
  g.addColorStop(0, '#30464d08'); g.addColorStop(.35, '#48746d'); g.addColorStop(1, '#bed0a2');
  ctx.strokeStyle = g; ctx.lineWidth = Math.max(.65, height * .0055); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-height * .04, -height * .32, lean * height * .5, -height * .78, lean * height, -height); ctx.stroke();
  for (let j = 1; j < 6; j++) {
    const f = j / 7, side = j % 2 ? -1 : 1, open = clamp((age - f * 1.6) / 1.5);
    if (!open) continue;
    const x = lean * height * f * f, y = -height * f;
    const size = height * (.25 - f * .11) * open;
    ctx.save(); ctx.translate(x, y); ctx.scale(side, 1); ctx.rotate(-.16 - f * .32);
    if (leaves) ctx.drawImage(leaves[type], 0, -size * .5, size, size * .55);
    else {
      ctx.fillStyle = '#669487'; ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(size * .2, -size * .55, size * .7, -size * .2, size, -size * .55);
      ctx.quadraticCurveTo(size * .7, size * .18, 0, 0); ctx.fill();
    }
    ctx.restore();
  }
}

function fern(ctx, x, y, height, lean, tint) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = tint; ctx.fillStyle = tint;
  ctx.lineWidth = Math.max(.5, height * .003);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(lean * height * .15, -height * .7, lean * height, -height); ctx.stroke();
  for (let j = 2; j < 22; j++) {
    const f = j / 23, px = lean * height * f * f, py = -height * f;
    const length = Math.sin(f * Math.PI) * height * .22;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.bezierCurveTo(px + side * length * .3, py - length * .5, px + side * length * .8, py - length * .2, px + side * length, py - length * .48);
      ctx.quadraticCurveTo(px + side * length * .5, py + length * .04, px, py); ctx.fill();
      ctx.strokeStyle = '#a2c6b412'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + side * length, py - length * .48); ctx.stroke();
    }
  }
  ctx.restore();
}

export class GardenArtwork {
  constructor() {
    this.leaves = ['#477f73', '#577585', '#758764'].map(leafSprite);
    this.haze = surface(256, 256);
    glow(this.haze.getContext('2d'), 128, 128, 128, '#bba7b215');
  }

  background(w, h) {
    this.backdrop = surface(w, h); const ctx = this.backdrop.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, w * .75, h);
    sky.addColorStop(0, '#0c101c'); sky.addColorStop(.42, '#141421'); sky.addColorStop(.73, '#10282b'); sky.addColorStop(1, '#090f19');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    glow(ctx, w * .16, h * .54, h * .65, '#35204660');
    glow(ctx, w * .76, h * .66, h * .6, '#22636837');
    glow(ctx, w * .5, h * .93, h * .46, '#b2a17410');
    // A distant, softly silhouetted understory gives the empty scene depth.
    for (let i = 0; i < 52; i++) {
      const x = noise(i + 7) * w, height = h * (.13 + noise(i + 42) * .31);
      fern(ctx, x, h * (1.06 + noise(i) * .05), height, (noise(i + 2) - .5) * 1.2, i % 2 ? '#41645b25' : '#71909216');
    }
    for (let i = 0; i < 260; i++) {
      const x = noise(i + 71) * w, height = h * (.025 + noise(i + 305) ** 2 * .17);
      ctx.strokeStyle = ['#486c6122', '#87a89520', '#a2a98113'][i % 3]; ctx.lineWidth = .55 + noise(i) * .8;
      ctx.beginPath(); ctx.moveTo(x, h * 1.01); ctx.quadraticCurveTo(x - height * .18, h - height * .4, x + (noise(i + 4) - .5) * height, h - height); ctx.stroke();
    }
    // Taller fern fronds frame the quiet, open center.
    for (let i = 0; i < 12; i++) {
      const side = i < 6 ? 1 : -1, x = side > 0 ? w * (i * .029 - .035) : w * (1.035 - (i - 6) * .03);
      fern(ctx, x, h * 1.04, h * (.28 + noise(i + 4) * .28), side * (.22 + noise(i) * .2), '#46726855');
    }
    const shade = ctx.createLinearGradient(0, h * .9, 0, h);
    shade.addColorStop(0, '#08111800'); shade.addColorStop(1, '#081118aa'); ctx.fillStyle = shade; ctx.fillRect(0, h * .9, w, h * .1);
  }

  render(ctx, w, h, time) {
    if (!this.backdrop || this.backdrop.width !== w) this.background(w, h);
    ctx.drawImage(this.backdrop, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      const size = h * (.85 + i * .15), x = w * (.18 + i * .3) + Math.sin(time * .08 + i) * w * .035;
      ctx.drawImage(this.haze, x - size / 2, h * .73 - size / 2 + Math.cos(time * .12 + i) * h * .03, size, size * .6);
    }
    ctx.restore();
    // Dormant shoots breathe in a breeze; none spontaneously become flowers.
    for (let i = 0; i < 32; i++) {
      const x = noise(i + 124), height = h * (.09 + noise(i + 204) * .18);
      const lean = (noise(i + 67) - .5) * .5 + Math.sin(time * .4 + i) * .045;
      ctx.save(); ctx.globalAlpha = .23 + noise(i + 27) * .26;
      ctx.translate(w * (.015 + x * .97), h * (.97 + noise(i + 2) * .09));
      drawStem(ctx, height, lean, 5, i % 3, this.leaves);
      if (i % 4 === 0) { ctx.translate(lean * height, -height); drawBud(ctx, h * .0035, i % 3); }
      ctx.restore();
    }
  }

  pollen(ctx, w, h, t, quality, activity) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const count = [44, 68, 96][quality] ?? 68;
    for (let i = 0; i < count; i++) {
      const phase = noise(i + 63) * TAU;
      const x = ((noise(i + 176) + Math.sin(t * .06 + phase) * .035 + 1) % 1) * w;
      const y = (1 - ((noise(i + 439) + t * (.003 + noise(i) * .004)) % 1)) * h;
      const r = (.45 + noise(i + 742) ** 3 * 2.1) * w / 1920;
      ctx.globalAlpha = (.16 + .25 * (1 + Math.sin(t * .7 + phase)) / 2) * (.7 + activity * .3);
      ctx.fillStyle = i % 3 ? '#d8cfaa' : '#accbd7'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      if (r > 1.8) { ctx.globalAlpha *= .1; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  drawFlower(ctx, size, type) {
    // A graceful procedural blossom also covers an unavailable image asset.
    const colors = [['#693451', '#f1a9c7'], ['#44486f', '#c5c5ed'], ['#855b45', '#f0d7a3']][type];
    for (let ring = 0; ring < 3; ring++) {
      const count = 13 - ring * 3, radius = size * (.38 - ring * .09);
      for (let j = 0; j < count; j++) {
        ctx.save(); ctx.rotate(j / count * TAU + ring * .32);
        const g = ctx.createLinearGradient(0, 0, 0, -radius); g.addColorStop(0, colors[0]); g.addColorStop(1, colors[1]); ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-radius * .6, -radius * .7, -radius * .35, -radius * 1.2, 0, -radius); ctx.bezierCurveTo(radius * .4, -radius * 1.1, radius * .5, -radius * .6, 0, 0); ctx.fill(); ctx.restore();
      }
    }
    ctx.fillStyle = '#d4b986'; ctx.beginPath(); ctx.arc(0, 0, size * .06, 0, TAU); ctx.fill();
  }

  cleanup() {
    for (const canvas of [this.backdrop, this.haze, ...this.leaves]) if (canvas) { canvas.width = 1; canvas.height = 1; }
    this.backdrop = this.haze = null; this.leaves = [];
  }
}
