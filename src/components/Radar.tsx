const AX = ['Sweet', 'Sour', 'Bitter', 'Creamy', 'Fizzy'];
export default function Radar({ v, size = 180 }: { v: number[]; size?: number }) {
  const c = size / 2, R = size / 2 - 28;
  const pt = (i: number, r: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return [c + Math.cos(a) * r, c + Math.sin(a) * r]; };
  const max = Math.max(0.6, ...v);
  const poly = v.map((x, i) => pt(i, R * Math.min(1, x / max)).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label={'Flavor profile: ' + AX.map((a, i) => `${a} ${Math.round((v[i] / max) * 100)}%`).join(', ')}>
      {[0.33, 0.66, 1].map(k => <polygon key={k} points={AX.map((_, i) => pt(i, R * k).join(',')).join(' ')} className="radar-grid" />)}
      {AX.map((_, i) => <line key={i} x1={c} y1={c} x2={pt(i, R)[0]} y2={pt(i, R)[1]} className="radar-grid" />)}
      <polygon points={poly} className="radar-shape" />
      {AX.map((a, i) => { const [x, y] = pt(i, R + 15); return <text key={a} x={x} y={y + 4} textAnchor="middle" className="radar-label">{a}</text>; })}
    </svg>
  );
}
