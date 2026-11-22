import { useMemo, useState } from 'react';
import type { Lab, Ingredient } from '../lib/data';

const GROUPS: { key: Ingredient['category']; title: string; blurb: string; top: string[] }[] = [
  { key: 'base', title: 'Bases', blurb: 'the body of the drink', top: ['water', 'milk', 'black_tea', 'yogurt', 'cold_brew', 'coconut_water', 'orange_juice', 'mango_pulp', 'pineapple_juice', 'apple_juice', 'coconut_milk', 'instant_coffee', 'oat_milk'] },
  { key: 'fizz', title: 'Fizz', blurb: 'bubbles go in last', top: ['soda_water', 'lemon_lime_soda', 'ginger_ale', 'tonic', 'cola', 'ginger_beer'] },
  { key: 'acid', title: 'Acids', blurb: 'sour keeps it bright', top: ['lemon_juice', 'lime_juice', 'tamarind', 'raw_mango', 'kokum', 'apple_cider_vinegar'] },
  { key: 'sweetener', title: 'Sweeteners', blurb: 'balance the sour', top: ['simple_syrup', 'honey', 'jaggery', 'rose_syrup', 'condensed_milk', 'maple_syrup', 'vanilla_syrup', 'agave', 'grenadine', 'chocolate_syrup'] },
  { key: 'accent', title: 'Accents', blurb: 'herbs, spices, fruit', top: ['mint', 'ginger', 'cardamom', 'black_salt', 'cumin', 'cinnamon', 'saffron', 'turmeric', 'basil', 'coriander', 'cucumber', 'black_pepper', 'banana', 'watermelon', 'nuts', 'clove'] },
];

type Props = { lab: Lab; pantry: string[]; toggle: (id: string) => void; suggested: string[]; clear: () => void };

export default function Pantry({ lab, pantry, toggle, suggested, clear }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const sel = new Set(pantry), sug = new Set(suggested);
  const byCat = useMemo(() => {
    const m: Record<string, Ingredient[]> = {};
    lab.ingredients.forEach(i => (m[i.category] ||= []).push(i));
    return m;
  }, [lab]);
  const query = q.trim().toLowerCase();

  const chip = (i: Ingredient) => (
    <button key={i.id} className={'chip' + (sel.has(i.id) ? ' on' : '') + (sug.has(i.id) && !sel.has(i.id) ? ' hint' : '')}
      onClick={() => toggle(i.id)} aria-pressed={sel.has(i.id)} title={sug.has(i.id) ? 'Goes well with what you picked' : i.name}>
      <span className="dot" style={{ background: i.color_hex }} />{i.name.replace(/ \(.*\)$/, '')}
    </button>
  );

  return (
    <section className="panel" aria-label="Smart pantry">
      <div className="panel-head">
        <h2>Your pantry</h2>
        {pantry.length > 0 && <button className="link" onClick={clear}>Clear all ({pantry.length})</button>}
      </div>
      <input className="search" type="search" placeholder={`Search ${lab.ingredients.length} ingredients…`} value={q} onChange={e => setQ(e.target.value)} aria-label="Search ingredients" />
      {query ? (
        <div className="chips">{lab.ingredients.filter(i => i.name.toLowerCase().includes(query)).map(chip)}
          {!lab.ingredients.some(i => i.name.toLowerCase().includes(query)) && <p className="muted">Nothing matches "{q}".</p>}</div>
      ) : GROUPS.map(g => {
        const all = byCat[g.key] || [], topSet = new Set(g.top);
        const shown = open[g.key] ? all : g.top.map(id => lab.ingById[id]).filter(Boolean);
        const rest = all.filter(i => !topSet.has(i.id)).length;
        return (
          <div className="group" key={g.key}>
            <h3>{g.title} <small>{g.blurb}</small></h3>
            <div className="chips">{shown.map(chip)}</div>
            {rest > 0 && <button className="link more" onClick={() => setOpen(o => ({ ...o, [g.key]: !o[g.key] }))}>{open[g.key] ? 'Show fewer' : `+${rest} more`}</button>}
          </div>
        );
      })}
    </section>
  );
}
