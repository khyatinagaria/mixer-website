import { shapeFor } from './helpers';
import { SHAPES } from './pour';

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
  const BAND = 470;
  g.fillStyle = v.color_hex; g.fillRect(0, 0, W, BAND);
  g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, 0, W, BAND);
  // glass: the real shape of this drink's glass, scaled to sit inside the band
  const sh = SHAPES[shapeFor(v.glass)], top = sh.rim - 8, bot = 318, sc = Math.min(1.35, 400 / (bot - top));
  g.save(); g.translate(250 - 120 * sc, 35 - top * sc); g.scale(sc, sc);
  const path = new Path2D(sh.d);
  g.fillStyle = 'rgba(255,255,255,.16)'; g.fill(path);
  g.save(); g.clip(path);
  const total = v.layers.reduce((s, l) => s + l.ml, 0) || 1, levelH = (sh.bottom - sh.rim) * 0.84; let y = sh.bottom + 4;
  for (const l of v.layers) { const h = (l.ml / total) * levelH; y -= h; g.globalAlpha = Math.max(0.5, l.opacity); g.fillStyle = l.color_hex; g.fillRect(0, y, 240, h + 1); }
  g.restore(); g.globalAlpha = 1;
  g.lineWidth = 5 / sc; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(path);
  if (sh.extra) g.stroke(new Path2D(sh.extra));
  g.restore();
  // title: shrink until the longest word fits and it takes at most 3 lines
  const TX = 450, TW = W - TX - 50, title = v.name.toUpperCase();
  let fs = 84; g.fillStyle = '#FFF8EC'; g.textAlign = 'left';
  for (; fs > 40; fs -= 4) { g.font = `800 ${fs}px Fraunces, Georgia, serif`; if (Math.max(...title.split(' ').map(w => g.measureText(w).width)) <= TW && lines(g, title, TW).length <= 3) break; }
  const tl = lines(g, title, TW), lh = fs * 1.1, ty = 190 - ((tl.length - 1) * lh) / 2 + fs * 0.3;
  tl.forEach((l, i) => g.fillText(l, TX, ty + i * lh));
  g.font = '500 28px "DM Sans", Arial, sans-serif'; g.fillStyle = 'rgba(255,248,236,.92)';
  g.fillText(fit(g, v.section || 'Zero-Proof Mixology Lab', TW), TX, ty + (tl.length - 1) * lh + 56);
  // ingredients
  let yy = 560; g.fillStyle = accent; g.font = '700 26px "DM Sans", Arial, sans-serif'; g.fillText('WHAT YOU NEED', 80, yy); yy += 20;
  g.fillStyle = ink; g.font = '500 32px "DM Sans", Arial, sans-serif';
  for (const l of v.lines.slice(0, 9)) { yy += 46; g.fillText(l, 80, yy); }
  // flavor bars
  const ax = ['Sweet', 'Sour', 'Bitter', 'Creamy', 'Fizzy'], bx = 640; let by = 580; const mx = Math.max(0.6, ...v.flavor);
  g.fillStyle = accent; g.font = '700 26px "DM Sans", Arial, sans-serif'; g.fillText('FLAVOR', bx, 560);
  ax.forEach((a, i) => { g.fillStyle = ink; g.font = '500 26px "DM Sans", Arial, sans-serif'; g.fillText(a, bx, by + 30);
    g.fillStyle = night ? '#3A2618' : '#E6D6BE'; g.fillRect(bx + 130, by + 10, 270, 26); g.fillStyle = accent; g.fillRect(bx + 130, by + 10, 270 * Math.min(1, v.flavor[i] / mx), 26); by += 52; });
  // steps
  let sy = 990; g.fillStyle = accent; g.font = '700 26px "DM Sans", Arial, sans-serif'; g.fillText('HOW TO MAKE IT', 80, sy);
  g.fillStyle = ink;
  const steps = v.steps.slice(0, 5), room = H - 90 - (sy + 20);
  let sf = 30; // shrink the method text until every step fits above the footer
  for (; sf > 20; sf -= 2) {
    g.font = `500 ${sf}px "DM Sans", Arial, sans-serif`;
    const n = steps.reduce((t, s, i) => t + lines(g, `${i + 1}. ${s}`, 920).length, 0);
    if (n * (sf + 10) + steps.length * 10 <= room) break;
  }
  g.font = `500 ${sf}px "DM Sans", Arial, sans-serif`;
  steps.forEach((s, i) => { sy += 10; sy = wrap(g, `${i + 1}. ${s}`, 80, sy + sf + 6, 920, sf + 10); });
  g.fillStyle = quiet; g.font = '500 24px "DM Sans", Arial, sans-serif'; g.fillText('Zero-Proof Mixology Lab', 80, H - 50);
  const a = document.createElement('a');
  a.download = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png'; a.href = c.toDataURL('image/png'); a.click();
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  let line = ''; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t; }
  g.fillText(line, x, y); return y;
}

function lines(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  out.push(line); return out;
}
function fit(g: CanvasRenderingContext2D, text: string, maxW: number) { while (g.measureText(text).width > maxW && text.length > 4) text = text.slice(0, -2); return text; }
