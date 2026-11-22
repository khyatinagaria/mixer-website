import { useEffect, useMemo, useState } from 'react';
import { loadLab, type Lab, type Drink } from './lib/data';
import { blendColor, indianSeason, isIndian, label, layersFrom, subNotesFor } from './lib/helpers';
import Pantry from './components/Pantry';
import Filters, { type FilterState } from './components/Filters';
import Results, { type Row } from './components/Results';
import Stage, { type View } from './components/Stage';

const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

const DAIRY = ['milk', 'cream', 'evaporated_milk', 'ice_cream'];

function drinkView(d: Drink, lab: Lab, pantry: Set<string>): View {
  const badges: string[] = [];
  if (d.diet.vegan) badges.push('Vegan'); else if (d.diet.dairy_free) badges.push('Dairy-free');
  if (d.diet.caffeine_free) badges.push('Caffeine-free'); if (d.diet.low_sugar) badges.push('Low sugar'); if (d.diet.spicy) badges.push('Spicy');
  return {
    key: d.id, kicker: d.section_label, name: d.name, glass: d.glass, build: d.build, temp: d.temp, carbonated: d.carbonated, garnish: d.garnish,
    ings: d.ingredients, layers: d.layers, color_hex: d.color_hex, steps: d.steps, flavor: d.flavor_vector, sugar: d.diet.sugar_g_est, badges,
    tags: [...d.season.slice(0, 2), ...d.vibe.slice(0, 3)],
    warnings: d.warnings.includes('acid_dairy') ? [{ msg: 'Acid and milk can curdle.', fix: 'Add the acid last and stir gently, or use oat milk.' }] : [],
    subs: subNotesFor(d, pantry, lab.ingById),
  };
}

function customView(lab: Lab, ids: string[]): View | null {
  const r = lab.engine.customLab(ids);
  const ings = r.recipe.map((x: any) => x.unit === 'pcs' ? { id: x.id, amount: x.amount || 1, unit: 'pcs', ml_equiv: x.ml } : { id: x.id, amount: x.ml, unit: 'ml', ml_equiv: x.ml });
  const layers = layersFrom(r.recipe.map((x: any) => ({ id: x.id, ml: x.ml })), lab.ingById);
  const top = (g: string, n: number) => (r.predicted_tags?.[g] || []).slice(0, n).map((t: any) => t.tag);
  const fizz = ids.some(i => lab.ingById[i].category === 'fizz');
  return {
    key: 'custom-' + ids.join('+'), custom: true, kicker: 'Custom Lab · invented for you', name: r.name, glass: r.temp === 'blended' ? 'tall' : 'highball', build: fizz ? 'built' : r.temp === 'blended' ? 'blended' : 'stirred',
    temp: r.temp, carbonated: fizz, garnish: '', ings, layers, color_hex: blendColor(layers), steps: r.steps.length ? r.steps : ['Stir everything over ice.'],
    flavor: r.flavor_vector, sugar: r.sugar_g_est, badges: ['Invented here'], tags: [...top('season', 1), ...top('mood', 2), ...top('vibe', 1)],
    warnings: r.warnings.map((w: any) => ({ msg: w.msg, fix: w.fix })), subs: [], tastesLike: r.tastes_like.map((t: any) => t.name),
  };
}

export default function App() {
  const [lab, setLab] = useState<Lab | null>(null);
  const [err, setErr] = useState('');
  const [pantry, setPantry] = useState<string[]>(() => read('zpl-pantry', []));
  const [f, setF] = useState<FilterState>(() => read('zpl-filters', { season: indianSeason(), mood: null, vibe: null, diet: [], indianFirst: true }));
  const [units, setUnits] = useState<'ml' | 'spoons'>(() => read('zpl-units', 'ml'));
  const [night, setNight] = useState<boolean>(() => read('zpl-night', false));
  const [openId, setOpenId] = useState<string | null>(null);
  const [custom, setCustom] = useState<View | null>(null);

  useEffect(() => { loadLab().then(setLab).catch(e => setErr(String(e))); }, []);
  useEffect(() => { write('zpl-pantry', pantry); }, [pantry]);
  useEffect(() => { write('zpl-filters', f); }, [f]);
  useEffect(() => { write('zpl-units', units); }, [units]);
  useEffect(() => { write('zpl-night', night); document.documentElement.dataset.theme = night ? 'night' : 'day'; }, [night]);

  const rec = useMemo(() => {
    if (!lab) return null;
    const out = lab.engine.recommend({ pantry, season: f.season, mood: f.mood, vibe: f.vibe, diet: f.diet, limit: 999 });
    const boost = (r: Row) => r.score + (f.indianFirst && isIndian(r.drink) ? 0.08 : 0);
    const sort = (rows: Row[]) => [...rows].sort((a, b) => boost(b) - boost(a));
    return { makeNow: sort(out.makeNow) as Row[], oneAway: sort(out.oneAway) as Row[], forYou: sort(out.forYou) as Row[] };
  }, [lab, pantry, f]);

  const live = useMemo(() => {
    if (!lab) return null;
    const ids = pantry;
    const r = ids.length ? lab.engine.customLab(ids) : null;
    const layers = r ? layersFrom(r.recipe.map((x: any) => ({ id: x.id, ml: x.ml })), lab.ingById) : [];
    return {
      ids, layers, flavor: r ? r.flavor_vector : [0, 0, 0, 0, 0], temp: r ? r.temp : 'iced',
      carbonated: ids.some(i => lab.ingById[i].category === 'fizz'),
      warnings: ids.length ? lab.engine.chemistry(ids) : [],
      next: ids.length ? lab.engine.suggestNext(ids, { season: f.season, mood: f.mood, vibe: f.vibe, diet: f.diet, limit: 5 }) : [],
    };
  }, [lab, pantry, f]);

  const hints = useMemo(() => (lab && pantry.length ? lab.engine.pairsWith(pantry[pantry.length - 1], 8).map((p: any) => p.id) : []), [lab, pantry]);

  if (err) return <main className="center"><p>Could not load the drink data. {err}</p></main>;
  if (!lab || !rec || !live) return <main className="center"><div className="loader" aria-label="Loading" /><p>Mixing the data…</p></main>;

  const toggle = (id: string) => { setPantry(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id])); setCustom(null); };
  const view: View | null = custom || (openId ? drinkView(lab.drinkById[openId], lab, new Set(pantry)) : null);
  const swap = (code: string) => {
    if (code === 'curdle') setPantry(p => [...new Set(p.map(x => (DAIRY.includes(x) ? 'oat_milk' : x)))]);
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="brand-mark" aria-hidden>◐</span><div><h1>Zero-Proof Mixology Lab</h1><p>Tap what's in your kitchen. Watch the glass fill.</p></div></div>
        <button className="theme" onClick={() => setNight(n => !n)} aria-pressed={night} aria-label="Toggle day and night theme">{night ? '☀ Day' : '☾ Night'}</button>
      </header>
      <div className="hero"><span>{label(f.season || 'summer')} in India</span><h2>What's in your fridge?</h2><p>{lab.drinks.length} non-alcoholic drinks from chai and shikanji to cold brew tonics, matched to what you already have.</p></div>
      <main className="layout">
        <div className="col-left">
          <Pantry lab={lab} pantry={pantry} toggle={toggle} suggested={hints} clear={() => { setPantry([]); setCustom(null); setOpenId(null); }} />
          <Filters tax={lab.tax} f={f} set={setF} />
        </div>
        <div className="col-stage">
          <Stage lab={lab} view={view} night={night} units={units} setUnits={setUnits}
            close={() => { setOpenId(null); setCustom(null); }}
            live={{ ...live, swap, add: toggle, invent: () => setCustom(customView(lab, pantry)) }} />
        </div>
        <div className="col-results">
          <Results lab={lab} makeNow={rec.makeNow} oneAway={rec.oneAway} forYou={rec.forYou} pantryCount={pantry.length} activeId={openId || undefined}
            open={id => { setCustom(null); setOpenId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} addIngredient={id => { if (!pantry.includes(id)) toggle(id); }} />
        </div>
      </main>
      <footer className="foot">Zero-proof means no alcohol. Recipes are our own home versions, adapted from classic and popular non-alcoholic drinks.</footer>
    </div>
  );
}
