// Reads each drink illustration's liquid gradient (the *_liq stops) into src/lib/artColors.json
// so the pour animation can build toward the same color. usage: node scripts/art-colors.mjs
import fs from 'fs';
const dir = 'public/art', out = {};
let miss = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.svg')).sort()) {
  const s = fs.readFileSync(`${dir}/${f}`, 'utf8');
  const g = s.match(/<linearGradient id="[^"]*_liq"[\s\S]*?<\/linearGradient>/);
  const stops = g ? [...g[0].matchAll(/stop-color="(#[0-9a-fA-F]{6})"(?:\s+stop-opacity="([\d.]+)")?/g)].map(m => [m[1].toLowerCase(), Number(m[2] ?? 1)]) : [];
  if (!stops.length) { miss.push(f); continue; }
  const mid = stops[Math.min(1, stops.length - 1)], bot = stops[stops.length - 1];
  out[f.replace(/\.svg$/, '')] = [stops[0][0], mid[0], bot[0], +mid[1].toFixed(2)];
}
fs.writeFileSync('src/lib/artColors.json', JSON.stringify(out));
console.log(Object.keys(out).length, 'colors;', miss.length, 'without a liquid gradient', miss.join(' '));
