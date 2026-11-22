import { useMemo, useState } from 'react';
import type { Lab, Drink } from '../lib/data';
import { label, isIndian } from '../lib/helpers';

export type Row = { drink: Drink; missing: string[]; subs: { needs: string; use: string; note: string }[]; ctx: number; score: number };
type Props = { lab: Lab; makeNow: Row[]; oneAway: Row[]; forYou: Row[]; pantryCount: number; open: (id: string) => void; addIngredient: (id: string) => void; activeId?: string };

function Card({ r, lab, open, addIngredient, active }: { r: Row; lab: Lab; open: (id: string) => void; addIngredient: (id: string) => void; active: boolean }) {
  const d = r.drink;
  const tempIcon = d.temp === 'hot' ? '♨ Hot' : d.temp === 'blended' ? '◍ Blended' : d.temp === 'cold' ? '❄ Chilled' : '❄ Iced';
  return (
    <article className={'card' + (active ? ' active' : '')}>
      <button className="card-btn" onClick={() => open(d.id)} aria-label={`Open recipe for ${d.name}`}>
        <span className="card-band" style={{ background: `linear-gradient(135deg, ${d.color_hex}, ${d.layers[0]?.color_hex || d.color_hex})` }}><span className="card-temp">{tempIcon}</span></span>
        <span className="card-body">
          <span className="card-title">{d.name}</span>
          <span className="card-meta">{d.section_label}{isIndian(d) && d.section !== 'indian' ? ' · desi' : ''}</span>
          <span className="tags">{d.mood.slice(0, 2).map(m => <i key={m}>{label(m)}</i>)}{d.diet.low_sugar && <i>Low sugar</i>}{!d.diet.caffeine_free ? <i>Caffeine</i> : null}</span>
        </span>
      </button>
      {r.subs.length > 0 && <p className="card-note">Swap: {r.subs.map(s => `${lab.ingById[s.use].name.replace(/ \(.*\)/, '')} for ${lab.ingById[s.needs].name.replace(/ \(.*\)/, '').toLowerCase()}`).join(', ')}</p>}
      {r.missing.length > 0 && <button className="card-missing" onClick={() => addIngredient(r.missing[0])}>+ add {lab.ingById[r.missing[0]].name.replace(/ \(.*\)/, '').toLowerCase()}</button>}
    </article>
  );
}

export default function Results({ lab, makeNow, oneAway, forYou, pantryCount, open, addIngredient, activeId }: Props) {
  const [section, setSection] = useState('all');
  const [limit, setLimit] = useState(12);
  const f = (rows: Row[]) => (section === 'all' ? rows : rows.filter(r => r.drink.section === section));
  const now = useMemo(() => f(makeNow), [makeNow, section]);
  const away = useMemo(() => f(oneAway), [oneAway, section]);
  const you = useMemo(() => f(forYou), [forYou, section]);
  const grid = (rows: Row[], n = 99) => <div className="grid">{rows.slice(0, n).map(r => <Card key={r.drink.id} r={r} lab={lab} open={open} addIngredient={addIngredient} active={activeId === r.drink.id} />)}</div>;
  return (
    <section className="results" aria-label="Drink suggestions">
      <div className="sections" role="tablist" aria-label="Browse by section">
        <button className={'pill' + (section === 'all' ? ' on' : '')} onClick={() => setSection('all')}>All sections</button>
        {Object.entries(lab.tax.sections).map(([k, v]) => <button key={k} className={'pill' + (section === k ? ' on' : '')} onClick={() => setSection(k)}>{v}</button>)}
      </div>
      {pantryCount > 0 && (<>
        <h2 className="tier">Make it now <span className="count">{now.length}</span></h2>
        {now.length ? grid(now, 12) : <p className="muted">Nothing is a full match yet. Look at "1 ingredient away" below, or tap "Invent something".</p>}
        <h2 className="tier">1 ingredient away <span className="count">{away.length}</span></h2>
        {away.length ? grid(away, 9) : <p className="muted">No near matches in this section.</p>}
      </>)}
      <h2 className="tier">{pantryCount ? 'More for your vibe' : 'For your vibe'} <span className="count">{you.length}</span></h2>
      {grid(you, limit)}
      {you.length > limit && <button className="btn ghost" onClick={() => setLimit(l => l + 12)}>Show 12 more</button>}
    </section>
  );
}
