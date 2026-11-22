import { shapeFor } from './helpers';

export type CardView = {
  name: string; section?: string; color_hex: string; layers: { color_hex: string; ml: number; opacity: number }[];
  lines: string[]; steps: string[]; glass: string; flavor: number[]; tags?: string[];
};

/** Draws a 1080x1350 shareable recipe card and downloads it as PNG. */
export function downloadCard(v: CardView, night: boolean) {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const bg = night ? '#1C120C' : '#F4EBDD', ink = night ? '#F4EBDD' : '#2B1A12', accent = night ? '#E59A3C' : '#D9622B', quiet = night ? '#B9A58F' : '#7A6450';
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // colored band in the drink's own color
  g.fillStyle = v.color_hex; g.fillRect(0, 0, W, 430);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, W, 430);
  // glass
  const gx = 150, gTop = 120, gw = 250, gh = 520, gb = gTop + gh;
  const sh = shapeFor(v.glass);
  const tl = sh === 'short' || sh === 'mug' ? 0 : 0;
  g.save();
  g.beginPath(); g.moveTo(gx, gTop); g.lineTo(gx + gw, gTop); g.lineTo(gx + gw - 26, gb); g.quadraticCurveTo(gx + gw / 2, gb + 24, gx + 26, gb); g.closePath();
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fill(); g.clip();
  const total = v.layers.reduce((s, l) => s + l.ml, 0) || 1, levelH = gh * 0.82; let y = gb;
  for (const l of v.layers) { const h = (l.ml / total) * levelH; y -= h; g.globalAlpha = Math.max(0.4, l.opacity); g.fillStyle = l.color_hex; g.fillRect(gx, y, gw, h + 1); }
  g.restore(); g.globalAlpha = 1;
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.85)';
  g.beginPath(); g.moveTo(gx, gTop); g.lineTo(gx + gw, gTop); g.lineTo(gx + gw - 26, gb); g.quadraticCurveTo(gx + gw / 2, gb + 24, gx + 26, gb); g.closePath(); g.stroke();
  void tl;
  // title
  g.fillStyle = '#FFF8EC'; g.textAlign = 'left'; g.font = '800 84px Fraunces, Georgia, serif';
  wrap(g, v.name.toUpperCase(), 470, 230, 560, 92);
  g.font = '500 28px "DM Sans", Arial, sans-serif'; g.fillStyle = 'rgba(255,248,236,.9)';
  g.fillText((v.section || 'Zero-Proof Mixology Lab'), 470, 390);
  // ingredients
  let yy = 520; g.fillStyle = accent; g.font = '700 26px "DM Sans", Arial, sans-serif'; g.fillText('WHAT YOU NEED', 80, yy); yy += 20;
  g.fillStyle = ink; g.font = '500 32px "DM Sans", Arial, sans-serif';
  for (const l of v.lines.slice(0, 9)) { yy += 46; g.fillText(l, 80, yy); }
  // flavor bars
  const ax = ['Sweet', 'Sour', 'Bitter', 'Creamy', 'Fizzy'], bx = 640; let by = 540; const mx = Math.max(0.6, ...v.flavor);
  g.fillStyle = accent; g.font = '700 26px "DM Sans", Arial, sans-serif'; g.fillText('FLAVOR', bx, 520);
  ax.forEach((a, i) => { g.fillStyle = ink; g.font = '500 26px "DM Sans", Arial, sans-serif'; g.fillText(a, bx, by + 30);
    g.fillStyle = night ? '#3A2618' : '#E6D6BE'; g.fillRect(bx + 130, by + 10, 270, 26); g.fillStyle = accent; g.fillRect(bx + 130, by + 10, 270 * Math.min(1, v.flavor[i] / mx), 26); by += 52; });
  // steps
  let sy = 960; g.fillStyle = accent; g.font = '700 26px "DM Sans", Arial, sans-serif'; g.fillText('HOW TO MAKE IT', 80, sy);
  g.fillStyle = ink; g.font = '500 30px "DM Sans", Arial, sans-serif';
  v.steps.slice(0, 4).forEach((s, i) => { sy += 14; sy = wrap(g, `${i + 1}. ${s}`, 80, sy + 36, 920, 40); });
  g.fillStyle = quiet; g.font = '500 24px "DM Sans", Arial, sans-serif'; g.fillText('Zero-Proof Mixology Lab', 80, H - 50);
  const a = document.createElement('a');
  a.download = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png'; a.href = c.toDataURL('image/png'); a.click();
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  let line = ''; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t; }
  g.fillText(line, x, y); return y;
}
