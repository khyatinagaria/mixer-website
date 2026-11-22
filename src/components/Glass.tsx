import { useEffect, useMemo, useState } from 'react';
import { GLASS_ML, shapeFor, blendColor, type GlassShape } from '../lib/helpers';

type Layer = { id: string; ml: number; color_hex: string; opacity: number; density: number };
type Props = {
  layers: Layer[]; glass?: string; temp?: string; carbonated?: boolean; build?: string;
  garnish?: string; ingredientIds?: string[]; replayKey: string; empty?: boolean; compact?: boolean;
};

// interior path, rim y, bottom y, extra outline (stem/base/handle)
const SHAPES: Record<GlassShape, { d: string; rim: number; bottom: number; extra: string }> = {
  tall: { d: 'M62 40 L178 40 L170 300 Q120 314 70 300 Z', rim: 40, bottom: 306, extra: '' },
  short: { d: 'M46 130 L194 130 L184 300 Q120 312 56 300 Z', rim: 130, bottom: 306, extra: '' },
  coupe: { d: 'M38 120 Q40 216 120 226 Q200 216 202 120 Z', rim: 120, bottom: 226, extra: 'M120 226 L120 296 M82 304 Q120 292 158 304' },
  flute: { d: 'M90 60 L150 60 L146 222 Q120 236 94 222 Z', rim: 60, bottom: 230, extra: 'M120 232 L120 296 M84 304 Q120 292 156 304' },
  martini: { d: 'M30 110 L210 110 L120 228 Z', rim: 110, bottom: 228, extra: 'M120 228 L120 296 M84 304 Q120 292 156 304' },
  mug: { d: 'M56 110 L170 110 L166 300 Q113 312 60 300 Z', rim: 110, bottom: 306, extra: 'M170 140 Q222 140 220 200 Q218 256 166 258' },
  kulhad: { d: 'M66 130 L174 130 L160 300 Q120 310 80 300 Z', rim: 130, bottom: 306, extra: '' },
  cup: { d: 'M58 150 L182 150 Q178 262 120 272 Q62 262 58 150 Z', rim: 150, bottom: 272, extra: 'M40 284 Q120 300 200 284' },
};

const GARNISHES: { re: RegExp; kind: 'wheel' | 'leaf' | 'cherry' | 'stick' | 'berry' | 'star'; color: string }[] = [
  { re: /orange|tangerine|blood orange/i, kind: 'wheel', color: '#F7941D' },
  { re: /lemon/i, kind: 'wheel', color: '#F6E05E' },
  { re: /lime/i, kind: 'wheel', color: '#8BC34A' },
  { re: /grapefruit/i, kind: 'wheel', color: '#F48A7B' },
  { re: /mint|basil|sage|coriander|rosemary|thyme/i, kind: 'leaf', color: '#3FA34D' },
  { re: /cherry|cranberr|pomegranate|strawberr|berry|berries/i, kind: 'cherry', color: '#C1121F' },
  { re: /cinnamon|candied ginger|stick/i, kind: 'stick', color: '#8B4513' },
  { re: /star anise/i, kind: 'star', color: '#5C3317' },
];

function Garnish({ kind, color, x, y, delay }: { kind: string; color: string; x: number; y: number; delay: number }) {
  const st = { animationDelay: `${delay}s`, transformOrigin: `${x}px ${y}px` } as React.CSSProperties;
  if (kind === 'wheel') return (
    <g className="garnish" style={st}><circle cx={x} cy={y} r="17" fill={color} stroke="#fff" strokeOpacity=".6" strokeWidth="3" />
      {[0, 60, 120].map(a => <line key={a} x1={x - 13} y1={y} x2={x + 13} y2={y} stroke="#fff" strokeOpacity=".5" strokeWidth="1.5" transform={`rotate(${a} ${x} ${y})`} />)}</g>);
  if (kind === 'leaf') return (
    <g className="garnish" style={st}>{[[-12, -16, -30], [0, -22, 0], [12, -14, 32]].map(([dx, dy, r], i) =>
      <ellipse key={i} cx={x + dx} cy={y + dy} rx="7" ry="14" fill={color} transform={`rotate(${r} ${x + dx} ${y + dy})`} />)}</g>);
  if (kind === 'cherry') return (
    <g className="garnish" style={st}><path d={`M${x} ${y} Q${x + 8} ${y - 26} ${x + 22} ${y - 30}`} stroke="#4E7B2E" strokeWidth="2" fill="none" /><circle cx={x} cy={y} r="9" fill={color} /><circle cx={x - 3} cy={y - 3} r="2.4" fill="#fff" fillOpacity=".6" /></g>);
  if (kind === 'stick') return <g className="garnish" style={st}><rect x={x - 3} y={y - 52} width="7" height="64" rx="3" fill={color} transform={`rotate(14 ${x} ${y})`} /></g>;
  return <g className="garnish" style={st}><circle cx={x} cy={y} r="11" fill={color} /></g>;
}

export default function Glass({ layers, glass = 'highball', temp = 'iced', carbonated, build = 'stirred', garnish = '', ingredientIds = [], replayKey, empty, compact }: Props) {
  const shape = SHAPES[shapeFor(glass)];
  const cap = GLASS_ML[glass] || 300;
  const total = layers.reduce((s, l) => s + l.ml, 0) || 1;
  const fill = Math.max(0.5, Math.min(0.88, total / cap));
  const levelH = (shape.bottom - shape.rim) * fill;
  const top = shape.bottom - levelH;
  const stepDelay = 0.65;
  const layered = build === 'layered';
  const hot = temp === 'hot';
  const blended = temp === 'blended';
  const showIce = !hot && !blended;
  const n = layers.length;
  const [mixed, setMixed] = useState(false);
  const blend = useMemo(() => blendColor(layers), [layers]);

  // reset the stir/mix state whenever a drink is opened or the pantry preview changes
  useEffect(() => {
    setMixed(false);
    if (layered || !n) return;
    const t = setTimeout(() => setMixed(true), (n * stepDelay + 0.5) * 1000);
    return () => clearTimeout(t);
  }, [replayKey, layered, n]);

  let y = shape.bottom;
  const rects = layers.map((l, i) => {
    const h = (l.ml / total) * levelH;
    y -= h;
    return { ...l, y, h, i };
  });
  const iceDelay = n * stepDelay + 0.1;
  const gar = GARNISHES.find(g => g.re.test(garnish) || g.re.test(ingredientIds.join(' ')));
  const rimX = shape.rim < 100 ? 176 : 190;
  const bubbles = useMemo(() => Array.from({ length: carbonated ? 16 : 0 }, (_, i) => ({ x: 72 + ((i * 37) % 96), s: 1.6 + (i % 4) * 0.7, d: (i * 0.37) % 3, dur: 2.6 + (i % 5) * 0.5 })), [carbonated]);
  const clipId = 'clip-' + replayKey.replace(/[^a-z0-9]/gi, '');

  return (
    <svg className={'glass' + (compact ? ' compact' : '')} viewBox="0 0 240 340" role="img" aria-label="Animated glass showing the drink being built">
      <defs>
        <clipPath id={clipId}><path d={shape.d} /></clipPath>
        <linearGradient id="shine" x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity=".5" /><stop offset=".25" stopColor="#fff" stopOpacity="0" /><stop offset=".8" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity=".18" /></linearGradient>
      </defs>
      <ellipse cx="120" cy="318" rx="86" ry="9" className="glass-shadow" />
      <g key={replayKey}>
        <g clipPath={`url(#${clipId})`}>
          <path d={shape.d} className="glass-inner" />
          {rects.map(r => (
            <rect key={r.id} className="layer" x="0" width="240" y={r.y} height={r.h + 0.6} fill={r.color_hex} fillOpacity={Math.max(0.35, r.opacity)}
              style={{ animationDelay: `${r.i * stepDelay}s` }} />
          ))}
          {!layered && <rect x="0" width="240" y={top} height={levelH} fill={blend} className="mixed" style={{ opacity: mixed ? 0.92 : 0 }} />}
          {layered && rects.slice(0, -1).map(r => <rect key={'e' + r.id} x="0" width="240" y={r.y - 3} height="6" fill={r.color_hex} opacity=".35" className="edge" style={{ animationDelay: `${n * stepDelay}s` }} />)}
          {blended && n > 0 && <ellipse cx="120" cy={top + 2} rx="64" ry="7" fill="#fff" fillOpacity=".4" className="froth" style={{ animationDelay: `${n * stepDelay}s` }} />}
          {carbonated && n > 0 && bubbles.map((b, i) => (
            <circle key={i} className="bubble" cx={b.x} cy={shape.bottom - 6} r={b.s} style={{ animationDelay: `${b.d + n * 0.3}s`, animationDuration: `${b.dur}s`, ['--rise' as any]: `${levelH - 12}px` }} />
          ))}
          {showIce && n > 0 && [[84, 0], [124, 1], [102, 2], [146, 3]].map(([cx, k]) => (
            <rect key={k} className="ice" x={cx - 17} y={top - 4 + (k % 2) * 10} width="34" height="34" rx="7"
              transform={`rotate(${[-12, 9, -4, 15][k]} ${cx} ${top + 12})`} style={{ animationDelay: `${iceDelay + k * 0.12}s` }} />
          ))}
          {/* condensation beads */}
          {showIce && n > 0 && [[70, 0.46], [168, 0.55], [78, 0.74], [160, 0.38], [66, 0.9]].map(([cx, f], i) => (
            <circle key={i} className="bead" cx={cx} cy={top + (shape.bottom - top) * f} r={2.2 + (i % 2)} style={{ animationDelay: `${iceDelay + 1.4 + i * 0.3}s` }} />
          ))}
        </g>
        {n > 0 && n < 99 && !empty && <rect className="stream" x="116" width="8" y="0" height={top + 6} style={{ animationDelay: '0s', animationDuration: `${n * stepDelay}s` }} fill={rects[rects.length - 1]?.color_hex} opacity="0" />}
        <path d={shape.d} className="glass-outline" />
        <path d={shape.d} fill="url(#shine)" pointerEvents="none" />
        {shape.extra && <path d={shape.extra} className="glass-outline" fill="none" />}
        {hot && n > 0 && [96, 120, 144].map((x, i) => (
          <path key={x} className="steam" d={`M${x} ${shape.rim - 6} q-8 -16 0 -28 q8 -12 0 -26`} style={{ animationDelay: `${n * stepDelay + i * 0.5}s` }} />
        ))}
        {gar && n > 0 && <Garnish kind={gar.kind} color={gar.color} x={rimX} y={shape.rim + 2} delay={iceDelay + 0.9} />}
      </g>
      {empty && <text x="120" y="190" textAnchor="middle" className="glass-hint">Tap an ingredient</text>}
    </svg>
  );
}
