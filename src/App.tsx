import { useEffect, useMemo, useState } from 'react';
import SearchBox from './components/SearchBox';
import { loadLab, type Lab, type Drink } from './lib/data';
import { indianSeason, isIndian, label, passesDiet, subNotesFor } from './lib/helpers';
import Pantry from './components/Pantry';
import Filters, { type FilterState } from './components/Filters';
import Results, { type Row, type Mode } from './components/Results';
import Stage, { type View } from './components/Stage';

const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

/** Pantry items that count as each other when matching drinks (the chocolate syrup chip says "/ cocoa"). */
const SAME: Record<string, string[]> = { chocolate_syrup: ['cocoa'], cocoa: ['chocolate_syrup'] };

function drinkView(d: Drink, lab: Lab, pantry: Set<string>): View {
  const badges: string[] = [];
  if (d.diet.vegan) badges.push('Vegan'); else if (d.diet.dairy_free) badges.push('Dairy-free');
  if (d.diet.caffeine_free) badges.push('Caffeine-free'); if (d.diet.low_sugar) badges.push('Low sugar'); if (d.diet.spicy) badges.push('Spicy');
  return {
    key: d.id, kicker: d.section_label, name: d.name, glass: d.glass, build: d.build, temp: d.temp, carbonated: d.carbonated, garnish: d.garnish,
    ings: d.ingredients, layers: d.layers, color_hex: d.color_hex, steps: d.steps, flavor: d.flavor_vector, sugar: d.diet.sugar_g_est, verified: d.verified || '', verifiedNote: d.verified_note || '', extras: d.extras || [], badges,
    tags: [...d.season.slice(0, 2), ...d.vibe.slice(0, 3)],
    warnings: d.warnings.includes('acid_dairy') ? [{ msg: 'Acid and milk can curdle.', fix: 'Add the acid last and stir gently, or use oat milk.' }] : [],
    subs: subNotesFor(d, pantry, lab.ingById),
  };
}

export default function App() {
  const [lab, setLab] = useState<Lab | null>(null);
  const [err, setErr] = useState('');
  const [pantry, setPantry] = useState<string[]>(() => read('zpl-pantry', []));
  const [f, setF] = useState<FilterState>(() => read('zpl-filters', { season: indianSeason(), mood: null, vibe: null, diet: [], indianFirst: true }));
  const [units, setUnits] = useState<'ml' | 'spoons'>(() => read('zpl-units', 'ml'));
  const [night, setNight] = useState<boolean>(() => read('zpl-night', false));
  const [openId, setOpenId] = useState<string | null>(() => { try { return new URLSearchParams(location.hash.slice(1)).get('drink'); } catch { return null; } });

  useEffect(() => { loadLab().then(setLab).catch(e => setErr(String(e))); }, []);
  useEffect(() => { try { history.replaceState(null, '', openId ? '#drink=' + openId : location.pathname + location.search); } catch { /* ignore */ } }, [openId]);
  useEffect(() => { write('zpl-pantry', pantry); }, [pantry]);
  useEffect(() => { write('zpl-filters', f); }, [f]);
  useEffect(() => { write('zpl-units', units); }, [units]);
  useEffect(() => { write('zpl-night', night); document.documentElement.dataset.theme = night ? 'night' : 'day'; }, [night]);

  const results = useMemo((): { mode: Mode; rows: Row[] } | null => {
    if (!lab) return null;
    const tempOk = (d: Drink) => !f.temp || (f.temp === 'hot' ? d.temp === 'hot' : d.temp !== 'hot');
    if (!pantry.length) {
      const out = lab.engine.recommend({ pantry: [], season: f.season, mood: f.mood, vibe: f.vibe, diet: f.diet, limit: 999 });
      const boost = (r: { drink: Drink; score: number }) => r.score + (f.indianFirst && isIndian(r.drink) ? 0.08 : 0);
      const rows = [...out.forYou].sort((a: any, b: any) => boost(b) - boost(a)).map((r: any) => ({ drink: r.drink as Drink, hit: 0 })).filter((r: Row) => tempOk(r.drink));
      return { mode: 'browse', rows };
    }
    // Drinks from the database that use every selected ingredient (and possibly more), fewest ingredients first.
    const tie = (a: Drink, b: Drink) => Number(!!f.season && b.season.includes(f.season)) - Number(!!f.season && a.season.includes(f.season))
      || (f.indianFirst ? Number(isIndian(b)) - Number(isIndian(a)) : 0) || a.name.localeCompare(b.name);
    const scored = lab.drinks.filter(d => passesDiet(d, f.diet) && tempOk(d)).map(d => {
      const ids = new Set(d.ingredients.map(i => i.id));
      return { drink: d, hit: pantry.filter(p => ids.has(p) || (SAME[p] || []).some(x => ids.has(x))).length };
    });
    const exact = scored.filter(s => s.hit === pantry.length).sort((a, b) => a.drink.ingredients.length - b.drink.ingredients.length || tie(a.drink, b.drink));
    if (exact.length) return { mode: 'exact', rows: exact };
    const closest = scored.filter(s => s.hit > 0).sort((a, b) => b.hit - a.hit || a.drink.ingredients.length - b.drink.ingredients.length || tie(a.drink, b.drink)).slice(0, 24);
    return { mode: 'closest', rows: closest };
  }, [lab, pantry, f]);

  const hints = useMemo(() => (lab && pantry.length ? lab.engine.pairsWith(pantry[pantry.length - 1], 8).map((p: any) => p.id) : []), [lab, pantry]);

  if (err) return <main className="center"><p>Could not load the drink data. {err}</p></main>;
  if (!lab || !results) return <main className="center"><div className="loader" aria-label="Loading" /><p>Mixing the data…</p></main>;

  const toggle = (id: string) => setPantry(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const view: View | null = openId && lab.drinkById[openId] ? drinkView(lab.drinkById[openId], lab, new Set(pantry)) : null;

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="brand-mark" aria-hidden>◐</span><div><h1>Zero-Proof Mixology Lab</h1><p>Tell us what's in your kitchen. We'll find the drinks.</p></div></div>
        <SearchBox drinks={lab.drinks} open={id => { setOpenId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        <button className="theme" onClick={() => setNight(n => !n)} aria-pressed={night} aria-label="Toggle day and night theme">{night ? '☀ Day' : '☾ Night'}</button>
      </header>
      <div className="hero"><span>{label(f.season || 'summer')} in India</span><h2>What's in your fridge?</h2><p>{lab.drinks.length} non-alcoholic drinks from chai and shikanji to cold brew tonics, matched to what you already have.</p></div>
      <main className={'layout' + (view ? ' with-stage' : '')}>
        <div className="col-left">
          <Pantry lab={lab} pantry={pantry} toggle={toggle} suggested={hints} clear={() => { setPantry([]); setOpenId(null); }} />
          <Filters tax={lab.tax} f={f} set={setF} />
        </div>
        {view && <div className="col-stage">
          <Stage lab={lab} view={view} night={night} units={units} setUnits={setUnits} close={() => setOpenId(null)} />
        </div>}
        <div className="col-results">
          <Results lab={lab} rows={results.rows} mode={results.mode} pantry={pantry} activeId={openId || undefined}
            open={id => { setOpenId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        </div>
      </main>
      {pantry.length > 0 && !view && <button className="jump" onClick={() => document.querySelector('.col-results')?.scrollIntoView({ behavior: 'smooth' })}>See {results.rows.length} drink{results.rows.length === 1 ? '' : 's'} ↓</button>}
      <footer className="foot">Zero-proof means no alcohol. Where a recipe shows "Recipe checked against", it follows that published page, scaled to one glass. Recipes marked "House recipe" are our own.</footer>
    </div>
  );
}
