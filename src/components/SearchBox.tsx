import { useMemo, useRef, useState } from 'react';
import type { Drink } from '../lib/data';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

type Props = { drinks: Drink[]; open: (id: string) => void };

export default function SearchBox({ drinks, open }: Props) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const index = useMemo(() => drinks.map(d => ({ d, n: norm(d.name) })), [drinks]);
  const hits = useMemo(() => {
    const t = norm(q); if (!t) return [];
    const words = t.split(' ');
    return index.filter(x => words.every(w => x.n.includes(w)))
      .sort((a, b) => Number(!a.n.startsWith(t)) - Number(!b.n.startsWith(t)) || a.n.indexOf(words[0]) - b.n.indexOf(words[0]) || a.n.length - b.n.length)
      .slice(0, 8).map(x => x.d);
  }, [q, index]);
  const pick = (d: Drink) => { open(d.id); setQ(''); setSel(0); input.current?.blur(); };
  const show = focus && q.trim().length > 0;
  return (
    <div className="namesearch" role="search">
      <svg className="namesearch-icon" aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8" /></svg>
      <input ref={input} type="search" value={q} placeholder="Search drinks by name" aria-label="Search drinks by name"
        role="combobox" aria-expanded={show} aria-controls="search-list" aria-autocomplete="list"
        onChange={e => { setQ(e.target.value); setSel(0); }} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
          else if (e.key === 'Enter' && hits[sel]) pick(hits[sel]);
          else if (e.key === 'Escape') { setQ(''); input.current?.blur(); }
        }} />
      {show && <ul className="namesearch-list" id="search-list" role="listbox">
        {hits.length ? hits.map((d, i) => <li key={d.id} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''}
          onMouseDown={e => { e.preventDefault(); pick(d); }} onMouseEnter={() => setSel(i)}>
          <b>{d.name}</b><span>{d.section_label}</span></li>)
          : <li className="none">No drink called “{q.trim()}”</li>}
      </ul>}
    </div>
  );
}
