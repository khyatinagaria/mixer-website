import type { Drink, Ingredient } from './data';

export const LABELS: Record<string, string> = {
  energize: 'Energize', refresh: 'Refresh', relax: 'Relax', celebrate: 'Celebrate', cozy: 'Cozy', focus: 'Focus',
  hydrate: 'Hydrate', indulge: 'Indulge', digest: 'Digest',
  late_night_focus: 'Late-Night Focus', post_workout: 'Post-Workout', party: 'Party', brunch: 'Brunch',
  date_night: 'Date Night', chai_break: 'Chai Break', festive: 'Festive', sunday_slowdown: 'Sunday Slowdown',
  hot_day_rescue: 'Hot-Day Rescue', morning_kickstart: 'Morning Kickstart', afternoon_slump: 'Afternoon Slump',
  summer: 'Summer', monsoon: 'Monsoon', autumn: 'Autumn', winter: 'Winter', spring: 'Spring',
  low_sugar: 'Low sugar', caffeine_free: 'Caffeine-free', dairy_free: 'Dairy-free', vegan: 'Vegan', nut_free: 'Nut-free', no_spice: 'No spice',
};
export const label = (k: string) => LABELS[k] || k;

/** Indian seasons by month: Mar-May summer, Jun-Sep monsoon, Oct-Nov autumn, Dec-Feb winter. */
export function indianSeason(d = new Date()): string {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'summer';
  if (m >= 6 && m <= 9) return 'monsoon';
  if (m >= 10 && m <= 11) return 'autumn';
  return 'winter';
}

const SPOONS: [number, string][] = [[240, 'cup'], [15, 'tbsp'], [5, 'tsp']];
const FRAC: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾', '0.33': '⅓', '0.67': '⅔' };
function frac(n: number): string {
  const whole = Math.floor(n + 1e-6), rest = n - whole;
  const r = Math.round(rest * 4) / 4;
  const key = r.toFixed(2);
  const f = r === 0 ? '' : (FRAC[key] || '');
  if (r === 1) return String(whole + 1);
  if (!whole && !f) return n < 0.25 ? '⅛' : '¼';
  return `${whole || ''}${f}`.trim();
}
/** Format an ingredient amount in ml, or in cups and spoons. */
export function formatAmount(i: { amount: number; unit: string; ml_equiv: number }, mode: 'ml' | 'spoons'): string {
  if (['pcs', 'leaves'].includes(i.unit)) return `${i.amount} ${i.unit === 'leaves' ? (i.amount === 1 ? 'leaf' : 'leaves') : (i.amount === 1 ? 'piece' : 'pieces')}`;
  if (i.unit === 'pinch') return `${i.amount > 1 ? i.amount + ' ' : 'a '}pinch`;
  if (i.unit === 'dash') return `${i.amount > 1 ? i.amount + ' ' : 'a '}dash`;
  if (i.unit === 'cup') return mode === 'ml' ? `${Math.round(i.amount * 240)} ml` : `${frac(i.amount)} cup`;
  if (i.unit === 'tsp' || i.unit === 'tbsp') return mode === 'ml' ? `${Math.round(i.ml_equiv)} ml` : `${frac(i.amount)} ${i.unit}`;
  if (mode === 'ml') return `${Math.round(i.ml_equiv)} ml`;
  for (const [size, name] of SPOONS) {
    if (i.ml_equiv >= size * 0.9) return `${frac(i.ml_equiv / size)} ${name}`;
  }
  return `${i.ml_equiv} ml`;
}

const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const toHex = (c: number[]) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

type Part = { id: string; ml: number };
const TINT: Record<string, number> = { cocoa: 30, matcha: 30, turmeric: 20, saffron: 12, chocolate_syrup: 3, espresso: 2.5, cold_brew: 2, instant_coffee: 3, grenadine: 2, blue_curacao_syrup: 2.5, rose_syrup: 2, beetroot: 3, black_tea: 1.5, hibiscus_tea: 2 };

/** Liquid layers (heaviest first) and blended color for any set of ingredient amounts, used for live pantry preview. */
export function layersFrom(parts: Part[], ingById: Record<string, Ingredient>) {
  const layers = parts.filter(p => p.ml >= 5 && ingById[p.id].category !== 'accent' || (ingById[p.id].category === 'accent' && ['banana', 'avocado', 'ice_cream', 'matcha', 'cocoa', 'watermelon', 'strawberry', 'berries', 'rice'].includes(p.id) && p.ml >= 5))
    .map(p => ({ id: p.id, ml: p.ml, color_hex: ingById[p.id].color_hex, opacity: ingById[p.id].opacity, density: ingById[p.id].density }))
    .sort((a, b) => b.density - a.density);
  return layers;
}
export function blendColor(layers: { id: string; ml: number; color_hex: string; opacity: number }[]): string {
  if (!layers.length) return '#E8F4F8';
  let rgb = [0, 0, 0], cw = 0, clear = 0, total = 0;
  for (const l of layers) {
    const w = l.ml * l.opacity * (TINT[l.id] || 1);
    hex(l.color_hex).forEach((v, k) => { rgb[k] += v * w; }); cw += w;
    total += l.ml; if (l.opacity < 0.2) clear += l.ml;
  }
  if (!cw) return '#EAF6FB';
  const p = rgb.map(v => v / cw), lighten = 0.35 * (clear / total);
  return toHex(p.map(v => v + (255 - v) * lighten));
}

export const GLASS_ML: Record<string, number> = { highball: 300, collins: 320, tall: 380, 'mason jar': 350, rocks: 250, coupe: 180, flute: 170, wine: 260, martini: 180, mug: 300, 'copper mug': 320, cup: 200, hurricane: 360, 'poco grande': 380, 'diner glass': 360, kulhad: 220, 'steel glass': 280, 'cutting glass': 130, short: 220, 'small glass': 160, 'small bowl': 120, 'glass cup': 140, 'punch bowl': 400, bottle: 400, 'clay mug': 220, 'tumbler & dabara': 180 };
export type GlassShape = 'tall' | 'short' | 'coupe' | 'flute' | 'mug' | 'martini' | 'kulhad' | 'cup';
export function shapeFor(glass: string): GlassShape {
  const g = glass.toLowerCase();
  if (/coupe/.test(g)) return 'coupe';
  if (/martini/.test(g)) return 'martini';
  if (/flute|wine/.test(g)) return 'flute';
  if (/mug|clay/.test(g)) return 'mug';
  if (/kulhad/.test(g)) return 'kulhad';
  if (/cup|cutting|dabara|small bowl|glass cup/.test(g)) return 'cup';
  if (/rocks|short|small glass|steel/.test(g)) return 'short';
  return 'tall';
}

export const isIndian = (d: Drink) => d.section === 'indian' || /ministryofcurry|harighotra/.test(d.source) ||
  /chai|lassi|masala|shikanji|nimbu|jaljeera|sharbat|thandai|kadha|haldi|badam|kesar|falooda|filter coffee|chaas|kokum|aam panna|jeera/i.test(d.name);

export function subNotesFor(d: Drink, pantry: Set<string>, ingById: Record<string, Ingredient>) {
  const out: { needs: string; use: string; note: string }[] = [];
  for (const id of d.core_ingredients) {
    if (pantry.has(id) || id === 'water') continue;
    const s = ingById[id].substitutes.find(x => pantry.has(x.id));
    if (s) out.push({ needs: id, use: s.id, note: s.note });
  }
  return out;
}

/** Picks a build method for a freshly picked set of ingredients so the generated pour shows distinct layers when it should. */
export function liveBuild(ids: string[], ingById: Record<string, Ingredient>): 'layered' | 'built' | 'blended' {
  const has = (...x: string[]) => ids.some(i => x.includes(i));
  const creamy = has('milk', 'oat_milk', 'almond_milk', 'soy_milk', 'coconut_milk', 'cream', 'evaporated_milk', 'condensed_milk');
  const coffee = has('espresso', 'cold_brew');
  const heavy = ids.some(i => ingById[i] && ingById[i].category === 'sweetener' && ingById[i].density >= 9 && ingById[i].opacity >= 0.5);
  const clearBase = ids.some(i => ingById[i] && ingById[i].category === 'base' && ingById[i].opacity < 0.9 && !['milk', 'oat_milk', 'almond_milk', 'soy_milk', 'coconut_milk', 'cream'].includes(i));
  if ((coffee && creamy) || (has('matcha') && creamy) || (heavy && clearBase) || (has('hibiscus_tea', 'black_tea', 'green_tea') && coffee)) return 'layered';
  return 'built';
}
