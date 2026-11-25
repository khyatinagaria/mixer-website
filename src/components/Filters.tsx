import type { Taxonomy } from '../lib/data';
import { label } from '../lib/helpers';

export type FilterState = { season: string | null; mood: string | null; vibe: string | null; diet: string[]; indianFirst: boolean; temp?: 'hot' | 'cold' | null };
type Props = { tax: Taxonomy; f: FilterState; set: (f: FilterState) => void };
const DIETS = ['low_sugar', 'caffeine_free', 'dairy_free', 'vegan', 'nut_free', 'no_spice'];

export default function Filters({ tax, f, set }: Props) {
  const pill = (k: 'season' | 'mood' | 'vibe', v: string) => (
    <button key={v} className={'pill' + (f[k] === v ? ' on' : '')} aria-pressed={f[k] === v} onClick={() => set({ ...f, [k]: f[k] === v ? null : v })}>{label(v)}</button>
  );
  return (
    <section className="panel" aria-label="Season, mood and vibe">
      <div className="panel-head"><h2>Set the mood</h2></div>
      <h3>Hot or cold</h3>
      <div className="pills">{(['hot', 'cold'] as const).map(t => (
        <button key={t} className={'pill' + (f.temp === t ? ' on' : '')} aria-pressed={f.temp === t} onClick={() => set({ ...f, temp: f.temp === t ? null : t })}>{t === 'hot' ? '♨ Hot' : '❄ Cold'}</button>
      ))}</div>
      <h3>Season</h3><div className="pills">{tax.seasons.filter(s => s !== 'spring').concat('spring').map(s => pill('season', s))}</div>
      <h3>Mood</h3><div className="pills">{tax.moods.map(m => pill('mood', m))}</div>
      <h3>Vibe</h3><div className="pills">{tax.vibes.map(v => pill('vibe', v))}</div>
      <h3>Dietary</h3>
      <div className="pills">{DIETS.map(d => (
        <button key={d} className={'pill diet' + (f.diet.includes(d) ? ' on' : '')} aria-pressed={f.diet.includes(d)}
          onClick={() => set({ ...f, diet: f.diet.includes(d) ? f.diet.filter(x => x !== d) : [...f.diet, d] })}>{label(d)}</button>
      ))}</div>
      <label className="toggle"><input type="checkbox" checked={f.indianFirst} onChange={e => set({ ...f, indianFirst: e.target.checked })} /> Show desi favourites first</label>
    </section>
  );
}
