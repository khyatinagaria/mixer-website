import { useEffect, useRef, useState } from 'react';
import { PourPlayer, CANVAS_H, CANVAS_W, type Seq } from '../lib/pour';

type Props = {
  seq: Seq | null; glass: string; temp: string; carbonated: boolean; garnish?: string; ingredientIds: string[];
  replayKey: string; /** quick preview mode for the live pantry glass: faster, no scrubber */ live?: boolean; empty?: boolean;
};

const SPEEDS = [0.5, 1, 2];

export default function PourGlass({ seq, glass, temp, carbonated, garnish = '', ingredientIds, replayKey, live, empty }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const player = useRef<PourPlayer | null>(null);
  const [st, setSt] = useState({ t: 0, total: 1, step: -1, playing: false, done: false });
  const [speed, setSpeed] = useState(1);
  const dragging = useRef(false);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    if (!seq || !seq.steps.length) { player.current?.destroy(); player.current = null; paint(c); setSt({ t: 0, total: 1, step: -1, playing: false, done: false }); return; }
    const p = new PourPlayer(c, seq, { glass, temp, carbonated, garnish, ingredientIds }, s => setSt(s));
    (c as any).__player = p; player.current = p;
    p.setSpeed(live ? 2.4 : speed);
    if (p.reduced && !live) p.finish(); else p.play();
    return () => { p.destroy(); if (player.current === p) player.current = null; };
    // the player is rebuilt whenever the drink (replayKey) or its glass changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey, glass, temp, seq]);

  useEffect(() => { player.current?.setSpeed(live ? 2.4 : speed); }, [speed, live]);

  const total = seq ? seq.steps.length : 0;
  const cur = seq && st.step >= 0 ? seq.steps[st.step] : null;
  const caption = !seq || !total ? '' : st.done ? 'Ready to serve' : cur ? cur.label : 'Getting ready…';
  const starts = player.current ? player.current.stepStarts : [];
  const dur = player.current ? player.current.duration : 1;

  return (
    <div className={'pour' + (live ? ' live' : '')}>
      <canvas ref={ref} className="glass-canvas" width={CANVAS_W} height={CANVAS_H} role="img"
        aria-label={seq && total ? `Animated glass: ${seq.steps.map(s => s.label).join(', then ')}` : 'Empty glass'} />
      {!empty && total > 0 && (
        <div className="pour-ui">
          <p className="pour-caption" aria-live="polite"><span className="pour-n">{st.done ? '✓' : Math.max(1, st.step + 1) + '/' + total}</span>{caption}</p>
          {!live && (
            <div className="pour-bar">
              <button className="pour-btn" onClick={() => (st.playing ? player.current?.pause() : player.current?.play())} aria-label={st.playing ? 'Pause' : st.done ? 'Replay' : 'Play'}>{st.playing ? '❚❚' : st.done ? '↻' : '▶'}</button>
              <div className="pour-scrub">
                <input type="range" min={0} max={1000} value={Math.round((st.t / dur) * 1000)} aria-label="Scrub through the pour"
                  onChange={e => { dragging.current = true; player.current?.pause(); player.current?.seek((Number(e.target.value) / 1000) * dur); }}
                  onPointerUp={() => { dragging.current = false; }} />
                <div className="pour-ticks" aria-hidden>{starts.map((s, i) => <i key={i} className={i <= st.step ? 'on' : ''} style={{ left: s * 100 + '%' }} />)}</div>
              </div>
              <div className="seg tiny" role="group" aria-label="Playback speed">{SPEEDS.map(s => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}</div>
            </div>
          )}
        </div>
      )}
      {empty && <p className="pour-caption muted">Tap an ingredient</p>}
    </div>
  );
}

function paint(c: HTMLCanvasElement) { const x = c.getContext('2d'); if (x) { x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); } }
