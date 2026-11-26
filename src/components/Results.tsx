import { useMemo, useState } from 'react';
import type { Lab, Drink } from '../lib/data';
import { label, isIndian } from '../lib/helpers';
import DrinkPic from './DrinkPic';
import artColors from '../lib/artColors.json';

const liq = artColors as Record<string, (string | number)[]>;

export type Mode = 'browse' | 'exact' | 'closest';
export type Row = { drink: Drink; hit: number };
type Props = { lab: Lab; rows: Row[]; mode: Mode; pantry: string[]; open: (id: string) => void; activeId?: string };

const short = (n: string) => n.replace(/ \(.*\)/, '');

function Card({ r, mode, total, open, active }: { r: Row; mode: Mode; total: number; open: (id: string) => void; active: boolean }) {
  const d = r.drink, n = d.ingredients.length;
  const tempIcon = d.temp === 'hot' ? '♨ Hot' : d.temp === 'blended' ? '◍ Blended' : d.temp === 'cold' ? '❄ Chilled' : '❄ Iced';
  return (
    <article className={'card' + (active ? ' active' : '')}>
      <button className="card-btn" onClick={() => open(d.id)} aria-label={`Open recipe for ${d.name}`}>
        <span className="card-band" style={{ background: liq[d.id] ? `linear-gradient(135deg, ${liq[d.id][0]}, ${liq[d.id][2]})` : `linear-gradient(135deg, ${d.color_hex}, ${d.layers[0]?.color_hex || d.color_hex})` }}><span className="card-temp">{tempIcon}</span></span>
        <DrinkPic id={d.id} className="card-pic" />
        <span className="card-body">
          <span className="card-title">{d.name}</span>
          <span className="card-meta">{d.section_label}{isIndian(d) && d.section !== 'indian' ? ' · desi' : ''}</span>
          <span className="tags">{mode !== 'browse' && <i className="count-tag">{n} ingredient{n === 1 ? '' : 's'}</i>}{mode === 'closest' && <i className="count-tag warn">has {r.hit} of your {total}</i>}
            {d.mood.slice(0, 2).map(m => <i key={m}>{label(m)}</i>)}{d.diet.low_sugar && <i>Low sugar</i>}{!d.diet.caffeine_free ? <i>Caffeine</i> : null}</span>
        </span>
      </button>
    </article>
  );
}

export default function Results({ lab, rows, mode, pantry, open, activeId }: Props) {
  const [section, setSection] = useState('all');
  const [limit, setLimit] = useState(24);
  const shown = useMemo(() => (section === 'all' ? rows : rows.filter(r => r.drink.section === section)), [rows, section]);
  const names = pantry.map(id => short(lab.ingById[id].name).toLowerCase());
  const list = names.length <= 2 ? names.join(' + ') : `${names.slice(0, 2).join(' + ')} + ${names.length - 2} more`;
  const title = mode === 'browse' ? 'For your vibe' : mode === 'exact' ? `Drinks with ${list}` : 'Closest matches';
  return (
    <section className="results" aria-label="Drink suggestions">
      <div className="sections" role="tablist" aria-label="Browse by section">
        <button className={'pill' + (section === 'all' ? ' on' : '')} onClick={() => setSection('all')}>All sections</button>
        {Object.entries(lab.tax.sections).map(([k, v]) => <button key={k} className={'pill' + (section === k ? ' on' : '')} onClick={() => setSection(k)}>{v}</button>)}
      </div>
      <h2 className="tier">{title} <span className="count">{shown.length}</span></h2>
      {mode === 'exact' && <p className="muted tiny">Every drink here uses all of what you picked. The ones with the fewest ingredients come first.</p>}
      {mode === 'closest' && <p className="muted tiny">No drink uses all {pantry.length} of your ingredients together. These use the most of them. Remove one ingredient to see exact matches.</p>}
      {mode === 'browse' && <p className="muted tiny">Pick what you have on the left and we will list the drinks that use it.</p>}
      {shown.length
        ? <div className="grid">{shown.slice(0, limit).map(r => <Card key={r.drink.id} r={r} mode={mode} total={pantry.length} open={open} active={activeId === r.drink.id} />)}</div>
        : <p className="muted">{mode === 'browse' ? 'Nothing in this section.' : 'No drinks in this section use those ingredients. Try "All sections".'}</p>}
      {shown.length > limit && <button className="btn ghost" onClick={() => setLimit(l => l + 24)}>Show 24 more</button>}
    </section>
  );
}
