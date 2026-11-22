import { useMemo, useState } from 'react';
import Glass from './Glass';
import Radar from './Radar';
import type { Lab } from '../lib/data';
import { formatAmount, label, layersFrom } from '../lib/helpers';
import { downloadCard } from '../lib/share';

export type View = {
  key: string; custom?: boolean; kicker: string; name: string; glass: string; build: string; temp: string; carbonated: boolean; garnish: string;
  ings: { id: string; amount: number; unit: string; ml_equiv: number }[]; layers: any[]; color_hex: string; steps: string[]; flavor: number[];
  sugar: number; badges: string[]; tags: string[]; warnings: { msg: string; fix?: string }[]; subs: { needs: string; use: string; note: string }[]; tastesLike?: string[];
};

type LiveProps = { layers: any[]; ids: string[]; flavor: number[]; warnings: { code: string; msg: string; fix: string }[]; next: { id: string; name: string; unlocks: string[] }[]; swap: (code: string) => void; add: (id: string) => void; invent: () => void; temp: string; carbonated: boolean };
type Props = { lab: Lab; view: View | null; live: LiveProps; units: 'ml' | 'spoons'; setUnits: (u: 'ml' | 'spoons') => void; close: () => void; night: boolean };

export default function Stage({ lab, view, live, units, setUnits, close, night }: Props) {
  const [tick, setTick] = useState(0);
  const liveKey = 'live-' + live.ids.join('+') + '-' + live.layers.length;
  const nm = (id: string) => lab.ingById[id].name.replace(/ \(.*\)/, '');

  if (!view) return (
    <section className="stage" aria-label="Live glass">
      <div className="glass-wrap"><Glass layers={live.layers} replayKey={liveKey} glass="highball" temp={live.temp} carbonated={live.carbonated} build="stirred" ingredientIds={live.ids} empty={!live.layers.length} /></div>
      <div className="stage-body">
        <h2>{live.ids.length ? 'Your glass, live' : 'Tap what you have'}</h2>
        <p className="muted">{live.ids.length ? 'It fills as you tap. Heavy syrups sink, fizz floats, bubbles rise.' : 'Pick ingredients from your pantry. The glass fills in real time and we match drinks you can make.'}</p>
        {live.warnings.map(w => (
          <div className="warn" key={w.code} role="alert"><b>Heads up:</b> {w.msg} <span>{w.fix}</span>{w.code === 'curdle' && <button className="btn small" onClick={() => live.swap('curdle')}>Swap to oat milk</button>}</div>
        ))}
        {live.ids.length > 0 && <div className="radar-row"><Radar v={live.flavor} /><div><h3>Flavor chemistry</h3><p className="muted">Sweet, sour, bitter, creamy and fizzy of what is in your glass right now.</p>
          <button className="btn" onClick={live.invent} disabled={live.ids.length < 2}>Invent something</button>{live.ids.length < 2 && <p className="muted tiny">Pick at least 2 ingredients.</p>}</div></div>}
        {live.next.length > 0 && <div className="next"><h3>Add next</h3><div className="chips">{live.next.map(n => <button key={n.id} className="chip hint" onClick={() => live.add(n.id)} title={n.unlocks.slice(0, 4).join(', ')}>+ {n.name.replace(/ \(.*\)/, '')} <small>{n.unlocks.length} drinks</small></button>)}</div></div>}
      </div>
    </section>
  );

  const v = view;
  const lines = v.ings.map(i => `${formatAmount(i, units)}  ${nm(i.id)}`);
  return (
    <section className="stage guide" aria-label="Pour guide">
      <div className="guide-top"><button className="link" onClick={close}>← Back to pantry</button>
        <div className="seg" role="group" aria-label="Units"><button className={units === 'ml' ? 'on' : ''} onClick={() => setUnits('ml')}>ml</button><button className={units === 'spoons' ? 'on' : ''} onClick={() => setUnits('spoons')}>cups & spoons</button></div></div>
      <div className="glass-wrap" onClick={() => setTick(t => t + 1)} title="Tap to replay the pour">
        <Glass layers={v.layers} replayKey={v.key + tick} glass={v.glass} temp={v.temp} carbonated={v.carbonated} build={v.build} garnish={v.garnish} ingredientIds={v.ings.map(i => i.id)} />
        <button className="replay" onClick={e => { e.stopPropagation(); setTick(t => t + 1); }}>↻ Replay pour</button>
      </div>
      <div className="stage-body">
        <p className="kicker">{v.kicker}</p>
        <h2 className="drink-name">{v.name}</h2>
        <div className="badges">{v.badges.map(b => <span key={b} className="badge">{b}</span>)}<span className="badge sugar">~{Math.round(v.sugar)} g sugar</span></div>
        {v.warnings.map((w, i) => <div className="warn" key={i} role="alert"><b>Heads up:</b> {w.msg} {w.fix && <span>{w.fix}</span>}</div>)}
        <div className="two">
          <div><h3>Ingredients</h3>
            <ul className="ings">{v.ings.map(i => <li key={i.id}><b>{formatAmount(i, units)}</b> {nm(i.id)}</li>)}</ul>
            {v.subs.length > 0 && <div className="subs"><h4>Your swaps</h4>{v.subs.map(s => <p key={s.needs}><b>{nm(s.use)}</b> for {nm(s.needs).toLowerCase()}. {s.note}</p>)}</div>}</div>
          <div><h3>Flavor profile</h3><Radar v={v.flavor} /></div>
        </div>
        <h3>Build order</h3>
        <ol className="steps">{v.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <dl className="meta"><div><dt>Glass</dt><dd>{v.glass}</dd></div><div><dt>Method</dt><dd>{v.build}</dd></div><div><dt>Serve</dt><dd>{v.temp === 'hot' ? 'Hot' : v.temp === 'blended' ? 'Blended' : v.temp === 'cold' ? 'Chilled' : 'Over ice'}</dd></div>{v.garnish && <div><dt>Garnish</dt><dd>{v.garnish}</dd></div>}</dl>
        {v.tastesLike && v.tastesLike.length > 0 && <p className="muted">Tastes a bit like: {v.tastesLike.join(', ')}.</p>}
        <div className="tags">{v.tags.map(t => <i key={t}>{label(t)}</i>)}</div>
        <div className="actions"><button className="btn" onClick={() => downloadCard({ name: v.name, section: v.kicker, color_hex: v.color_hex, layers: v.layers, lines, steps: v.steps, glass: v.glass, flavor: v.flavor }, night)}>Save share card (PNG)</button></div>
      </div>
    </section>
  );
}
