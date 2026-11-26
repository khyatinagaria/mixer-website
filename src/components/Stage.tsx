import { useMemo, useState } from 'react';
import PourGlass from './PourGlass';
import artColors from '../lib/artColors.json';
import { buildSequence } from '../lib/sequencer.js';
import { withMethod } from '../lib/kitchen';
import Radar from './Radar';
import type { Lab } from '../lib/data';
import { formatAmount, label, layersFrom } from '../lib/helpers';
import { downloadCard } from '../lib/share';

export type View = {
  key: string; kicker: string; name: string; glass: string; build: string; temp: string; carbonated: boolean; garnish: string;
  ings: { id: string; amount: number; unit: string; ml_equiv: number }[]; layers: any[]; color_hex: string; steps: string[]; flavor: number[];
  sugar: number; verified?: string; verifiedNote?: string; extras: string[]; badges: string[]; tags: string[]; warnings: { msg: string; fix?: string }[]; subs: { needs: string; use: string; note: string }[];
};

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
type Props = { lab: Lab; view: View; units: 'ml' | 'spoons'; setUnits: (u: 'ml' | 'spoons') => void; close: () => void; night: boolean };

export default function Stage({ lab, view, units, setUnits, close, night }: Props) {
  const [tick] = useState(0);
  // the glass build from the sequencer, preceded by every preparation step of the recipe's own method
  const seq = useMemo(() => {
    const items = view.ings.map(i => ({ id: i.id, ml: i.ml_equiv, unit: i.unit, amount: i.amount }));
    const glassOnly = buildSequence({
      glass: view.glass, items, temp: view.temp, build: view.build, carbonated: view.carbonated,
      garnish: view.garnish, stepsText: view.steps.join(' '), ingById: lab.ingById, learned: lab.order,
    });
    return withMethod(glassOnly, { steps: view.steps, ingById: lab.ingById, items, glass: view.glass, temp: view.temp });
  }, [view, lab]);
  const nm = (id: string) => lab.ingById[id].name.replace(/ \(.*\)/, '');

  const v = view;
  const lines = v.ings.map(i => `${formatAmount(i, units)}  ${nm(i.id)}`);
  return (
    <section className="stage guide" aria-label="Pour guide">
      <div className="guide-top"><button className="link" onClick={close}>← Back to drinks</button>
        <div className="seg" role="group" aria-label="Units"><button className={units === 'ml' ? 'on' : ''} onClick={() => setUnits('ml')}>ml</button><button className={units === 'spoons' ? 'on' : ''} onClick={() => setUnits('spoons')}>cups & spoons</button></div></div>
      <div className="glass-wrap">
        <PourGlass seq={seq} art={`/art/${v.key}.svg`} finalColor={(artColors as Record<string, (string | number)[]>)[v.key]} replayKey={v.key + tick} glass={v.glass} temp={v.temp} carbonated={v.carbonated} garnish={v.garnish} ingredientIds={v.ings.map(i => i.id)} />
      </div>
      <div className="stage-body">
        <p className="kicker">{v.kicker}</p>
        <h2 className="drink-name">{v.name}</h2>
        <div className="badges">{v.badges.map(b => <span key={b} className="badge">{b}</span>)}<span className="badge sugar">~{Math.round(v.sugar)} g sugar</span></div>
        {v.warnings.map((w, i) => <div className="warn" key={i} role="alert"><b>Heads up:</b> {w.msg} {w.fix && <span>{w.fix}</span>}</div>)}
        <div className="two">
          <div><h3>Ingredients</h3>
            <ul className="ings">{v.ings.map(i => <li key={i.id}><b>{formatAmount(i, units)}</b> {nm(i.id)}</li>)}{v.extras.map(x => <li key={x} className="extra"><b>Also</b> {x}</li>)}</ul>
            {v.subs.length > 0 && <div className="subs"><h4>Your swaps</h4>{v.subs.map(s => <p key={s.needs}><b>{nm(s.use)}</b> for {nm(s.needs).toLowerCase()}. {s.note}</p>)}</div>}</div>
          <div><h3>Flavor profile</h3><Radar v={v.flavor} /></div>
        </div>
        <h3>How to make it</h3>
        <ol className="steps">{v.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        {v.verified === 'house' && <p className="muted tiny verified">✓ House recipe</p>}
        {v.verified && v.verified !== 'house' && <p className="muted tiny verified">✓ Recipe checked against <a href={v.verified} target="_blank" rel="noreferrer">{hostOf(v.verified)}</a>{v.verifiedNote ? `. ${v.verifiedNote}` : ''}</p>}
        {seq.steps.length > 0 && <details className="pour-list"><summary>Every step shown in the animation</summary>
          <ol className="steps gen">{seq.prep && <li>{seq.prep}</li>}{seq.steps.map((s: any, i: number) => <li key={i}>{s.detail || s.label}</li>)}</ol></details>}
        <dl className="meta"><div><dt>Glass</dt><dd>{v.glass}</dd></div><div><dt>Method</dt><dd>{v.build}</dd></div><div><dt>Serve</dt><dd>{v.temp === 'hot' ? 'Hot' : v.temp === 'blended' ? 'Blended' : v.temp === 'cold' ? 'Chilled' : 'Over ice'}</dd></div>{v.garnish && <div><dt>Garnish</dt><dd>{v.garnish}</dd></div>}</dl>
                <div className="tags">{v.tags.map(t => <i key={t}>{label(t)}</i>)}</div>
        <div className="actions"><button className="btn" onClick={() => downloadCard({ name: v.name, section: v.kicker, color_hex: v.color_hex, layers: v.layers, lines, steps: v.steps, glass: v.glass, flavor: v.flavor }, night)}>Save share card (PNG)</button></div>
      </div>
    </section>
  );
}
