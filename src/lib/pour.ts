// PourPlayer: a procedural drink animator.
//
// It never knows about specific drinks. It plays the step list produced by the sequencer (rim, whisk, muddle,
// pour, float, ice, stir, shake, blend, top, scoop, dust, garnish, steam) on a canvas:
//   - almost everything is a pure function of the timeline time t, so scrubbing / replaying is exact;
//   - only small things (splash droplets, bubbles, steam, sediment) are particles, simulated at a fixed 60 Hz
//     step with a seeded RNG, so seeking just fast-forwards the simulation and always looks the same.
// Animation principles used: anticipation (vessel slides in and tilts before the stream starts), follow-through
// (the stream detaches and the surface keeps rippling), squash and stretch (ice cubes, scoop), arcs (ballistic
// stream, spoon circles), slow-in/slow-out (cubic easing), secondary action (ripples, splash, bubbles, steam).
import { GLASS_ML, shapeFor, type GlassShape } from './helpers';
import { drawKitchen, drawVessel, type KStep } from './kitchen';

export const SHAPES: Record<GlassShape, { d: string; rim: number; bottom: number; extra: string }> = {
  tall: { d: 'M62 40 L178 40 L170 300 Q120 314 70 300 Z', rim: 40, bottom: 306, extra: '' },
  short: { d: 'M46 130 L194 130 L184 300 Q120 312 56 300 Z', rim: 130, bottom: 306, extra: '' },
  coupe: { d: 'M38 120 Q40 216 120 226 Q200 216 202 120 Z', rim: 120, bottom: 226, extra: 'M120 226 L120 296 M82 304 Q120 292 158 304' },
  flute: { d: 'M90 60 L150 60 L146 222 Q120 236 94 222 Z', rim: 60, bottom: 230, extra: 'M120 232 L120 296 M84 304 Q120 292 156 304' },
  martini: { d: 'M30 110 L210 110 L120 228 Z', rim: 110, bottom: 228, extra: 'M120 228 L120 296 M84 304 Q120 292 156 304' },
  mug: { d: 'M56 110 L170 110 L166 300 Q113 312 60 300 Z', rim: 110, bottom: 306, extra: 'M170 140 Q222 140 220 200 Q218 256 166 258' },
  kulhad: { d: 'M66 130 L174 130 L160 300 Q120 310 80 300 Z', rim: 130, bottom: 306, extra: '' },
  cup: { d: 'M58 150 L182 150 Q178 262 120 272 Q62 262 58 150 Z', rim: 150, bottom: 272, extra: 'M40 284 Q120 300 200 284' },
};

export type SeqStep = {
  i: number; kind: string; ids: string[]; label: string; dur: number;
  into?: string; ml?: number; color?: string; opacity?: number; density?: number; flow?: string; cubes?: number; strained?: boolean; blendedPour?: boolean; gentle?: boolean;
  /** kitchen steps (kind 'prep', into 'kitchen') carry their scene here, see kitchen.ts */
  kit?: unknown; detail?: string;
};
export type Seq = { steps: SeqStep[]; layered: boolean; blended: boolean; shaken: boolean; totalMl: number; color: string; roles: Record<string, string>; duration: number };
export type PlayerOpts = { glass: string; temp: string; carbonated: boolean; garnish: string; ingredientIds: string[]; ingredientNames?: Record<string, string> };

const GARNISHES: { re: RegExp; kind: 'wheel' | 'leaf' | 'cherry' | 'stick' | 'star' | 'dot'; color: string }[] = [
  { re: /orange|tangerine|blood orange/i, kind: 'wheel', color: '#F7941D' },
  { re: /lemon/i, kind: 'wheel', color: '#F6E05E' },
  { re: /lime/i, kind: 'wheel', color: '#8BC34A' },
  { re: /grapefruit/i, kind: 'wheel', color: '#F48A7B' },
  { re: /green apple|apple|pear/i, kind: 'wheel', color: '#B9D96C' },
  { re: /pineapple|mango|peach|apricot|melon|kiwi/i, kind: 'wheel', color: '#F5C518' },
  { re: /cucumber/i, kind: 'wheel', color: '#9BCB6A' },
  { re: /mint|basil|sage|coriander|rosemary|thyme|tulsi|curry leaf|tarragon|shiso|lemongrass/i, kind: 'leaf', color: '#3FA34D' },
  { re: /cherry|cranberr|pomegranate|strawberr|berry|berries/i, kind: 'cherry', color: '#C1121F' },
  { re: /cinnamon|candied ginger|stick/i, kind: 'stick', color: '#8B4513' },
  { re: /star anise/i, kind: 'star', color: '#5C3317' },
  { re: /rose|flower|saffron|pistachio|almond|nut|coconut|sesame|cardamom/i, kind: 'dot', color: '#D98BA5' },
];

// ---------- tiny math helpers ----------
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const easeBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const rgb = (h: string) => { const n = parseInt((h || '#cccccc').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const css = (c: number[], a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const mixc = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// canvas layout: the glass keeps its 240x340 design space, drawn at (OX, OY) with room above/right for vessels
export const CANVAS_W = 300, CANVAS_H = 430, OX = 30, OY = 92;
const PAUSE_END = 0.7; // seconds of "ready" hold before the idle loop

type P = { ct: string; k: string; x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; c: number[]; ph: number };
type Layer = { j: number; ml: number; base: number[]; color: number[]; opacity: number; fizz: boolean; mix: number };
type Vessel = { into: string; kind: string; x: number; y: number; angle: number; fill: number; color: number[]; head: number; tail: number; impactX: number; flow: string; width: number; spoon: boolean; ml: number };
type Cube = { k: number; x0: number; size: number; rot: number; tDrop: number; tLand: number; lift: number };
type Shp = { d: string; rim: number; bottom: number; extra: string };
type Ctr = { name: string; shape: Shp; path: Path2D; extra: Path2D | null; rows: { l: number; r: number }[]; floorY: number; rimY: number; cx: number; pxPerMl: number; events: { t0: number; x: number; amp: number }[]; cubes: Cube[] };
const SHAKER: Shp = { d: 'M78 150 L162 150 L154 302 Q120 311 86 302 Z', rim: 150, bottom: 306, extra: '' };
const ICE_SLOTS: number[][] = [[-25, 0], [22, 0], [-2, -0.74], [-27, -0.7], [26, -0.7], [-2, 0.05]];

export class PourPlayer {
  private ctx: CanvasRenderingContext2D;
  private shape!: Shp;
  private path!: Path2D;
  private extra: Path2D | null = null;
  private rows: { l: number; r: number }[] = [];
  private ctrs: Record<string, Ctr> = {};
  private active = 'glass';
  private glassShape: Shp;
  private steps: SeqStep[] = [];
  private starts: number[] = [];
  private total = 0;
  /** time when the kitchen part (preparing syrups, brews, blends...) ends and the glass part starts */
  private kitchenEnd = 0;
  private seq!: Seq;
  private opts: PlayerOpts;
  private cap: number;
  private hot: boolean; private cold: boolean; private blendedDrink: boolean;
  private pxPerMl = 1; private floorY = 0; private rimY = 0; private cx = 120;
  private events: { t0: number; x: number; amp: number }[] = [];
  private cubes: Cube[] = [];
  private ps: P[] = [];
  private rng = mulberry32(7);
  private simT = 0; private t = 0; private idleT = 0;
  playing = false; speed = 1; reduced = false; private raf = 0; private last = 0; private acc = 0; private dirty = true;
  private colors = { ink: '#2b1a12', glass: '#fffdf8', quiet: '#7a6450' };
  private garnishSpec: { kind: string; color: string } | null = null;
  private onChange: (s: { t: number; total: number; step: number; playing: boolean; done: boolean }) => void = () => {};
  private lastStep = -2; private lastDone = false;
  private visible = true; private io?: IntersectionObserver; private mo?: MutationObserver; private vis = () => { this.kick(); };

  constructor(private canvas: HTMLCanvasElement, seq: Seq, opts: PlayerOpts, onChange?: PlayerOptsCb) {
    this.opts = opts;
    if (onChange) this.onChange = onChange;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unsupported');
    this.ctx = ctx;
    this.glassShape = SHAPES[shapeFor(opts.glass)];
    this.cap = GLASS_ML[opts.glass] || 300;
    this.hot = opts.temp === 'hot'; this.blendedDrink = opts.temp === 'blended'; this.cold = !this.hot && !this.blendedDrink;
    this.setSeq(seq);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(CANVAS_W * dpr); canvas.height = Math.round(CANVAS_H * dpr);
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.readColors();
    if (typeof IntersectionObserver !== 'undefined') { this.io = new IntersectionObserver(es => { this.visible = es[0].isIntersecting; this.kick(); }); this.io.observe(canvas); }
    this.mo = new MutationObserver(() => { this.readColors(); this.dirty = true; this.kick(); });
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', this.vis);
  }

  // ---------- setup ----------
  private readColors() {
    const cs = getComputedStyle(this.canvas);
    const g = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
    this.colors = { ink: g('--ink', '#2b1a12'), glass: g('--glass-bg', '#fffdf8'), quiet: g('--quiet', '#7a6450') };
  }
  private makeCtr(name: string, shape: Shp): Ctr {
    const path = new Path2D(shape.d);
    const c = document.createElement('canvas'); c.width = 240; c.height = 340;
    const cx2 = c.getContext('2d')!; const rows: { l: number; r: number }[] = [];
    for (let y = shape.rim; y <= shape.bottom; y++) {
      let l = -1, r = -1;
      for (let x = 0; x <= 240; x++) if (cx2.isPointInPath(path, x, y)) { if (l < 0) l = x; r = x; }
      rows.push(l < 0 ? { l: 120, r: 120 } : { l, r });
    }
    const r0 = rows[Math.min(rows.length - 1, 20)];
    return { name, shape, path, extra: shape.extra ? new Path2D(shape.extra) : null, rows, floorY: shape.bottom - 4, rimY: shape.rim, cx: rows.length ? (r0.l + r0.r) / 2 : 120, pxPerMl: 1, events: [], cubes: [] };
  }
  /** make one container (the glass or the shaker) the active one: every geometry helper reads these fields */
  private useCtr(name: string) {
    const c = this.ctrs[name] || this.ctrs.glass; this.active = c.name;
    this.shape = c.shape; this.path = c.path; this.extra = c.extra; this.rows = c.rows; this.floorY = c.floorY; this.rimY = c.rimY; this.cx = c.cx; this.pxPerMl = c.pxPerMl; this.events = c.events; this.cubes = c.cubes;
  }
  private mine(st: SeqStep) { return (st.into || 'glass') === this.active; }
  private rowAt(y: number) { const i = clamp(Math.round(y - this.shape.rim), 0, this.rows.length - 1); return this.rows[i]; }

  setSeq(seq: Seq) {
    this.seq = seq; this.steps = seq.steps || [];
    this.starts = []; let s = 0;
    for (const st of this.steps) { this.starts.push(s); s += st.dur; }
    this.total = s;
    this.kitchenEnd = 0;
    for (let j = 0; j < this.steps.length && this.steps[j].kind === 'prep'; j++) this.kitchenEnd = this.starts[j] + this.steps[j].dur;
    const names = this.steps.some(x => x.into === 'shaker') ? ['shaker', 'glass'] : ['glass'];
    this.ctrs = {};
    for (const name of names) {
      const ctr = this.makeCtr(name, name === 'shaker' ? SHAKER : this.glassShape);
      this.ctrs[name] = ctr; this.useCtr(name);
      const inC = (x: SeqStep) => (x.into || 'glass') === name;
      const isLiq = (x: SeqStep) => x.kind === 'pour' || x.kind === 'float' || (x.kind === 'top' && x.flow === 'fizz');
      const liquidMl = this.steps.filter(x => isLiq(x) && inC(x)).reduce((a, x) => a + (x.ml || 0), 0) || 1;
      const hasIce = this.steps.some(x => x.kind === 'ice' && inC(x));
      const cap = name === 'shaker' ? 330 : this.cap;
      const fillH = (ctr.shape.bottom - ctr.shape.rim) * clamp(Math.max(liquidMl, 120) / cap, 0.45, 0.88) * (hasIce ? 0.86 : 1);
      ctr.pxPerMl = fillH / Math.max(liquidMl, 120 * 0.9);
      const lr = mulberry32(99 + names.length);
      this.steps.forEach((st, j) => {
        if (!inC(st)) return;
        const s0 = this.starts[j], d = st.dur;
        if (isLiq(st)) {
          const amp = st.flow === 'float' ? 0.35 : st.flow === 'thick' ? 0.9 : st.flow === 'fizz' ? 1.6 : 1.5;
          for (let tt = s0 + 0.28 * d; tt < s0 + 0.82 * d; tt += 0.11) ctr.events.push({ t0: tt, x: ctr.cx - (st.flow === 'float' ? 16 : 0) + (lr() - 0.5) * 6, amp });
          ctr.events.push({ t0: s0 + 0.84 * d, x: ctr.cx, amp: amp * 1.2 });
        }
        if (st.kind === 'ice') {
          const n = st.cubes || 4;
          for (let k = 0; k < n; k++) {
            const tDrop = s0 + d * (0.08 + (0.62 * k) / n), fall = 0.36;
            const slot = ICE_SLOTS[k % ICE_SLOTS.length];
            ctr.cubes.push({ k, x0: ctr.cx + slot[0] + (lr() - 0.5) * 5, size: 33 + lr() * 5, rot: (lr() - 0.5) * 0.9, tDrop, tLand: tDrop + fall, lift: slot[1] });
            ctr.events.push({ t0: tDrop + fall, x: ctr.cx + slot[0], amp: 2.6 });
          }
        }
        if (st.kind === 'scoop') ctr.events.push({ t0: s0 + 0.6 * d, x: ctr.cx, amp: 2 });
        if (st.kind === 'stir') for (let tt = s0 + 0.15 * d; tt < s0 + 0.9 * d; tt += 0.2) ctr.events.push({ t0: tt, x: ctr.cx + Math.cos(tt * 12) * 20, amp: st.gentle ? 0.5 : 0.9 });
        if (st.kind === 'shake') for (let tt = s0 + 0.1 * d; tt < s0 + 0.85 * d; tt += 0.06) ctr.events.push({ t0: tt, x: ctr.cx + (lr() - 0.5) * 40, amp: 2.2 });
      });
    }
    // the shaker's own steps (pour into it, ice, shake) all happen in the shaker container
    this.useCtr('glass');
    this.garnishSpec = null;
    const gs = this.steps.find(x => x.kind === 'garnish');
    if (gs) {
      const text = ((this.opts.garnish || '') + ' ' + gs.label.replace(/^Garnish( with|:)?\s*/i, '')).trim();
      const g = GARNISHES.find(x => x.re.test(text)) || (text ? undefined : GARNISHES.find(x => x.re.test(this.opts.ingredientIds.join(' '))));
      this.garnishSpec = g ? { kind: g.kind, color: g.color } : { kind: 'dot', color: '#D9A55B' };
    }
    this.reset();
  }

  // ---------- public controls ----------
  onState(cb: PlayerOptsCb) { this.onChange = cb; }
  get duration() { return this.total + PAUSE_END; }
  get stepStarts() { return this.starts.map(s => s / this.duration); }
  play() { if (this.t >= this.duration - 0.02) this.seek(0); this.playing = true; this.last = 0; this.kick(); this.emit(); }
  pause() { this.playing = false; this.emit(); }
  replay() { this.seek(0); this.play(); }
  setSpeed(v: number) { this.speed = v; }
  seek(t: number) {
    t = clamp(t, 0, this.duration);
    if (t < this.simT - 1e-6) this.reset();
    this.stepSim(t);
    this.t = t; this.dirty = true; this.draw(); this.emit(); this.kick();
  }
  /** jump straight to the finished glass (reduced motion, or a static preview) */
  finish() { this.seek(this.duration); this.playing = false; this.emit(); }
  destroy() { cancelAnimationFrame(this.raf); this.io?.disconnect(); this.mo?.disconnect(); document.removeEventListener('visibilitychange', this.vis); }

  private reset() {
    this.ps = []; this.rng = mulberry32(7); this.simT = 0; this.t = 0; this.idleT = 0; this.dirty = true;
  }
  private emit() {
    const step = this.stepIndexAt(this.t);
    const done = this.t >= this.total;
    this.onChange({ t: this.t, total: this.duration, step, playing: this.playing, done });
  }
  private stepIndexAt(t: number) { let k = -1; for (let i = 0; i < this.steps.length; i++) if (t >= this.starts[i]) k = i; return k; }
  private kick() { if (!this.raf && this.visible && !document.hidden) this.raf = requestAnimationFrame(this.loop); }

  private loop = (now: number) => {
    this.raf = 0;
    if (!this.visible || document.hidden) return;
    const dt = this.last ? Math.min(0.06, (now - this.last) / 1000) : 0; this.last = now;
    const idleAnim = !this.reduced && (this.hot || this.opts.carbonated || this.cold);
    if (this.playing) {
      this.t = Math.min(this.duration, this.t + dt * this.speed);
      this.stepSim(this.t);
      if (this.t >= this.duration) { this.playing = false; this.emit(); }
      this.dirty = true;
    } else if (idleAnim && this.t >= this.total && this.layersAt(this.total).length) {
      // finished: keep the glass alive (bubbles, steam, bobbing ice)
      this.idleT += dt; this.simT += 0; this.stepSimIdle(dt); this.dirty = true;
    }
    const step = this.stepIndexAt(this.t);
    if (step !== this.lastStep || this.t >= this.total !== this.lastDone) { this.lastStep = step; this.lastDone = this.t >= this.total; this.emit(); }
    if (this.dirty) { this.draw(); this.dirty = false; }
    if (this.playing || (idleAnim && this.t >= this.total && !this.reduced)) this.raf = requestAnimationFrame(this.loop);
    else this.last = 0;
    if (this.playing) this.emit();
  };

  // ---------- derived (pure) state ----------
  private layersAt(t: number): Layer[] {
    const out: Layer[] = [];
    this.steps.forEach((st, j) => {
      const isLiquid = (st.kind === 'pour' || st.kind === 'float' || (st.kind === 'top' && st.flow === 'fizz'));
      if (!isLiquid || !this.mine(st)) return;
      const d = st.dur, p = clamp((t - this.starts[j] - 0.22 * d) / (0.58 * d));
      if (p <= 0) return;
      const base = rgb(st.color || '#ccc');
      out.push({ j, ml: (st.ml || 0) * (p < 1 ? lerp(p, easeIO(p), 0.5) : 1), base, color: base, opacity: clamp(st.opacity ?? 0.7, 0.3, 1), fizz: st.flow === 'fizz', mix: 0 });
    });
    // stirring blends the layers that existed when the spoon went in
    this.steps.forEach((st, k) => {
      if (st.kind !== 'stir' || !this.mine(st)) return;
      const q = clamp((t - this.starts[k] - 0.1 * st.dur) / (0.75 * st.dur));
      if (q <= 0) return;
      const target = rgb(st.color || '#ccc'), amt = easeIO(q) * (st.gentle ? 0.4 : 1);
      for (const l of out) if (this.starts[l.j] < this.starts[k]) { l.color = mixc(l.color, target, amt); l.opacity = lerp(l.opacity, 0.9, amt); l.mix = Math.max(l.mix, amt); }
    });
    return out;
  }
  private mixOf(t: number) { // 0..1 how stirred the drink currently is (drives swirl streaks)
    let m = 0;
    this.steps.forEach((st, k) => { if (st.kind === 'stir' && this.mine(st)) { const q = clamp((t - this.starts[k]) / st.dur); if (q > 0 && q < 1) m = Math.max(m, Math.sin(q * Math.PI)); } });
    return m;
  }
  private iceDisp(t: number) { let d = 0; for (const c of this.cubes) d += clamp((t - c.tLand) / 0.3) * 0.032; return d; }
  private liquidTop(layers: Layer[], t: number) {
    let h = 0; for (const l of layers) h += l.ml * this.pxPerMl;
    return this.floorY - h * (1 + this.iceDisp(t));
  }
  private ripple(t: number, x: number, k = 1) {
    let y = 0;
    for (const e of this.events) {
      const age = t - e.t0; if (age < 0 || age > 2.6) continue;
      const dx = x - e.x;
      y += e.amp * Math.exp(-age * 2.4) * Math.sin(Math.abs(dx) * 0.17 - age * 10) * Math.exp(-Math.abs(dx) * 0.012);
    }
    return y * k + (this.reduced ? 0 : 0.3 * Math.sin(x * 0.05 + (this.t + this.idleT) * 1.7));
  }
  private foamAt(t: number) {
    let f = 0;
    this.steps.forEach((st, j) => {
      if (!this.mine(st)) return;
      if (st.kind === 'top' && st.flow === 'fizz') f = Math.max(f, 7 * easeOut(clamp((t - this.starts[j] - 0.3 * st.dur) / (0.6 * st.dur))) * (1 - 0.35 * clamp((t - this.starts[j] - st.dur) / 2)));
      else if (st.kind === 'pour' && st.flow === 'fizz') f = Math.max(f, 6 * easeOut(clamp((t - this.starts[j] - 0.3 * st.dur) / (0.6 * st.dur))));
      if (st.kind === 'pour' && st.blendedPour) f = Math.max(f, 6 * easeOut(clamp((t - this.starts[j] - 0.5 * st.dur) / (0.5 * st.dur))));
    });
    return f;
  }

  private vesselAt(t: number): Vessel | null {
    for (let j = 0; j < this.steps.length; j++) {
      const st = this.steps[j], s0 = this.starts[j], d = st.dur, u = (t - s0) / d;
      if (u < 0 || u > 1) continue;
      const pours = st.kind === 'pour' || st.kind === 'float' || (st.kind === 'top' && st.flow === 'fizz');
      if (!pours) continue;
      const into = st.into || 'glass', prevCtr = this.active; this.useCtr(into);
      const role = (st.ids && st.ids.length ? this.seq.roles[st.ids[0]] : '') || '';
      let kind = 'jug';
      if (st.strained) kind = 'tin'; else if (st.blendedPour) kind = 'jar'; else if (st.flow === 'fizz') kind = 'bottle'; else if (role === 'syrup') kind = 'bottle'; else if (role === 'coffee') kind = 'shot';
      const enter = easeIO(clamp(u / 0.22)), exit = easeIO(clamp((u - 0.8) / 0.2));
      const pose = enter * (1 - exit);
      const px = this.cx + (kind === 'shot' ? 22 : kind === 'tin' ? 12 : 30), py = this.rimY - 30 - (kind === 'jug' || kind === 'jar' || kind === 'tin' ? 4 : 0);
      const p = clamp((u - 0.22) / 0.58);
      const tilt = (kind === 'shot' ? 1.45 : 1.1 + 0.28 * p) * pose;
      const x = lerp(px + 130, px, easeOut(pose)), y = lerp(py - 40, py, easeOut(pose));
      const head = easeOut(clamp((u - 0.2) / 0.07)), tail = easeIn(clamp((u - 0.79) / 0.08));
      const spoon = st.kind === 'float';
      const w = clamp(4.2 + Math.sqrt(st.ml || 30) * 0.36, 5, 11) * (st.flow === 'thick' ? 0.62 : st.flow === 'thin' ? 0.85 : 1);
      const out = { into, kind, x, y, angle: -tilt, fill: lerp(0.85, 0.12, p), color: rgb(st.color || '#ccc'), head, tail, impactX: this.cx - (spoon ? 0 : 2), flow: st.flow || 'normal', width: spoon ? 15 : w, spoon, ml: st.ml || 0 };
      this.useCtr(prevCtr);
      return out;
    }
    return null;
  }

  // ---------- particle simulation (fixed step) ----------
  private stepSim(target: number) {
    const h = 1 / 60;
    while (this.simT < target - 1e-9) { const dt = Math.min(h, target - this.simT); this.simOnce(this.simT + dt, dt); this.simT += dt; }
  }
  private stepSimIdle(dt: number) { this.simOnce(this.t + this.idleT, dt, true); }
  private surf(t: number, layers: Layer[]) { return this.liquidTop(layers, t); }
  private spawn(k: string, x: number, y: number, vx: number, vy: number, max: number, r: number, c: number[]) {
    if (this.ps.length > 420) return;
    this.ps.push({ ct: this.active, k, x, y, vx, vy, life: 0, max, r, c, ph: this.rng() * 6.28 });
  }
  private simSpawn(t: number, dt: number, top: number, layers: Layer[]) {
    const R = this.rng;
      this.steps.forEach((st, j) => {
        if (!this.mine(st)) return;
        const s0 = this.starts[j], d = st.dur, u = (t - s0) / d;
        if (u < 0 || u > 1) return;
        const pours = st.kind === 'pour' || st.kind === 'float' || (st.kind === 'top' && st.flow === 'fizz');
        if (pours && u > 0.27 && u < 0.84) {
          const col = rgb(st.color || '#ccc');
          const ix = this.cx - (st.kind === 'float' ? 16 : 0);
          const rate = st.flow === 'float' ? 3 : st.flow === 'thick' ? 14 : st.flow === 'fizz' ? 42 : 36;
          if (R() < rate * dt) this.spawn('drop', ix + (R() - 0.5) * 8, top - 1, (R() - 0.5) * 60, -(30 + R() * 55), 0.55, 1.1 + R() * 1.1, col);
          if (st.flow === 'fizz' && R() < 30 * dt) this.spawn('bubble', ix + (R() - 0.5) * 30, top + 6 + R() * 12, (R() - 0.5) * 6, -(18 + R() * 20), 1.2, 1.2 + R() * 1.6, [255, 255, 255]);
          if (st.flow !== 'float' && R() < 14 * dt) this.spawn('bubble', ix + (R() - 0.5) * 14, top + 4, (R() - 0.5) * 10, -(10 + R() * 14), 0.8, 1 + R(), [255, 255, 255]);
        }
        if (st.kind === 'ice') this.cubes.forEach(c => { if (t - dt < c.tLand && t >= c.tLand) for (let q = 0; q < 9; q++) this.spawn('drop', c.x0 + (R() - 0.5) * 20, top, (R() - 0.5) * 110, -(50 + R() * 70), 0.6, 1.3 + R() * 1.2, layers.length ? layers[layers.length - 1].color : [200, 230, 245]); });
        if (st.kind === 'muddle' && u > 0.1 && u < 0.9) {
          const hit = Math.sin(u * Math.PI * 6 - 1.2) < -0.92; // bottom of each stroke
          if (hit && R() < 0.6) { const c = rgb(st.color || '#3a8f3a'); for (let q = 0; q < 2; q++) this.spawn('bit', this.cx + (R() - 0.5) * 50, this.floorY - 14, (R() - 0.5) * 80, -(40 + R() * 40), 99, 2 + R() * 2.4, c); }
        }
        if (st.kind === 'drop' && u > 0.1 && u < 0.7 && R() < 22 * dt) { const c = rgb(st.color || '#555'); this.spawn('solid', this.cx + (R() - 0.5) * 70, this.rimY - 30, (R() - 0.5) * 20, 20, 99, 2 + R() * 2.5, c); }
        if (st.kind === 'dust' && u > 0.1 && u < 0.8 && R() < 45 * dt) { const c = rgb(st.color || '#8a5a2b'); this.spawn('dust', this.cx + (R() - 0.5) * 70, this.rimY - 38 + R() * 8, (R() - 0.5) * 24, 70 + R() * 30, 99, 0.9 + R() * 0.9, c); }
        if (st.kind === 'whisk' || st.kind === 'blend' || st.kind === 'shake') { /* drawn procedurally */ }
      });
  }

  private simOnce(t: number, dt: number, idle = false) {
    const R = this.rng;
    const tt = Math.min(t, this.total + 5);
    const tops: Record<string, number> = {}, lay: Record<string, Layer[]> = {};
    for (const name of Object.keys(this.ctrs)) {
      this.useCtr(name); lay[name] = this.layersAt(tt); tops[name] = this.surf(tt, lay[name]);
      if (!idle) this.simSpawn(t, dt, tops[name], lay[name]);
    }
    this.useCtr('glass');
    const layers = lay.glass, top = tops.glass;
    const wall = (y: number) => this.rowAt(y);
    // continuous: bubbles in fizzy drinks, steam on hot drinks
    const fizzy = layers.some(l => l.fizz) || (this.opts.carbonated && layers.length > 1 && t > this.total * 0.5);
    if (fizzy && layers.length && R() < 9 * dt) { const row = wall(this.floorY - 10); this.spawn('bubble', lerp(row.l + 10, row.r - 10, R()), this.floorY - 6, 0, -(22 + R() * 18), 9, 1 + R() * 1.8, [255, 255, 255]); }
    if (this.hot && layers.length && top < this.floorY - 30 && R() < 5 * dt) this.spawn('steam', this.cx + (R() - 0.5) * 60, this.rimY - 4, (R() - 0.5) * 6, -(14 + R() * 8), 2.6, 5 + R() * 4, [255, 255, 255]);
    // update
    for (const p of this.ps) {
      const c = this.ctrs[p.ct] || this.ctrs.glass, top = tops[p.ct] ?? tops.glass, floorY = c.floorY;
      p.life += dt;
      if (p.k === 'drop') { p.vy += 380 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > top && p.vy > 0) p.life = p.max; }
      else if (p.k === 'bubble') { p.y += p.vy * dt; p.x += Math.sin(p.life * 6 + p.ph) * 6 * dt + p.vx * dt; if (p.y <= top + 1.5) p.life = p.max; }
      else if (p.k === 'steam') { p.y += p.vy * dt; p.x += (Math.sin(p.life * 2 + p.ph) * 9 + p.vx) * dt; p.r += dt * 5; }
      else if (p.k === 'bit') { p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; if (p.y > floorY - p.r - 1) { p.y = floorY - p.r - 1 - (p.ph % 3); p.vy = 0; p.vx = 0; p.k = 'rest'; } }
      else if (p.k === 'solid') { const inLiq = p.y > top; p.vy = inLiq ? Math.min(p.vy, 22) : p.vy + 200 * dt; p.y += p.vy * dt; p.x += Math.sin(p.life * 3 + p.ph) * 4 * dt; if (p.y > floorY - p.r - 1) { p.y = floorY - p.r - 1 - (p.ph % 4); p.vy = 0; p.k = 'rest'; } }
      else if (p.k === 'dust') { p.y += p.vy * dt; p.x += p.vx * dt; p.vx *= 0.97; if (p.y >= top) { p.k = 'speck'; p.y = top; } }
    }
    this.ps = this.ps.filter(p => p.k === 'rest' || p.k === 'speck' || p.life < p.max);
    // clamp stuff into the glass
    for (const p of this.ps) { if (p.k === 'rest' || p.k === 'speck') continue; const c = this.ctrs[p.ct] || this.ctrs.glass; const row = c.rows[clamp(Math.round(clamp(p.y, c.rimY, c.floorY) - c.shape.rim), 0, c.rows.length - 1)]; if (p.y > c.rimY) p.x = clamp(p.x, row.l + 3, row.r - 3); }
    // bound the number of resting bits so seeking stays cheap
    if (this.ps.length > 380) this.ps = this.ps.filter((p, i) => p.k !== 'rest' || i % 2 === 0);
  }

  // ---------- drawing ----------
  private shakeInfo() { const j = this.steps.findIndex(x => x.kind === 'shake'); return j < 0 ? null : { s: this.starts[j], d: this.steps[j].dur }; }
  /** where each container is on stage: the shaker stands where the glass will be until it is shaken, then the glass slides in */
  private ctrPose(name: string, t: number) {
    const sk = this.shakeInfo();
    if (!sk || !this.ctrs.shaker) return { show: true, dx: 0, dy: 0, rot: 0, cap: 0 };
    const q = (t - sk.s) / sk.d;
    if (name === 'shaker') {
      if (q >= 1) return { show: false, dx: 0, dy: 0, rot: 0, cap: 0 };
      const pose = easeIO(clamp(q / 0.14)) * (1 - easeIO(clamp((q - 0.7) / 0.12)));
      const out = easeIn(clamp((q - 0.78) / 0.22)) * 190; // the shaker slides off to the right while the glass slides in
      return { show: true, dx: Math.sin(t * 38) * 5 * pose + out, dy: -34 * pose, rot: Math.sin(t * 38 + 1) * 0.09 * pose, cap: q > 0 ? easeOut(clamp(q / 0.1)) : 0 };
    }
    const g = clamp((q - 0.72) / 0.28);
    return { show: q >= 0.72, dx: -(1 - easeOut(g)) * 190, dy: 0, rot: 0, cap: 0 };
  }

  private draw() {
    const { ctx, canvas } = this;
    const sx = canvas.width / CANVAS_W;
    ctx.setTransform(sx, 0, 0, sx, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save(); ctx.translate(OX, OY);
    const t = this.t;
    if (this.kitchenEnd > 0 && t < this.kitchenEnd) { this.drawKitchenPart(t); ctx.restore(); return; }
    for (const name of Object.keys(this.ctrs)) {
      const pose = this.ctrPose(name, t); if (!pose.show) continue;
      this.useCtr(name);
      ctx.save();
      ctx.translate(pose.dx + 120, pose.dy + this.shape.bottom); ctx.rotate(pose.rot); ctx.translate(-120, -this.shape.bottom);
      this.drawScene(t, pose.cap);
      ctx.restore();
    }
    this.useCtr('glass');
    this.drawVessels(this.surf(t, this.layersAt(t)), t);
    ctx.restore();
    if (!this.steps.length) { ctx.fillStyle = this.colors.quiet; ctx.font = '700 13px "DM Sans", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Tap an ingredient', OX + 120, OY + 190); }
  }

  /** the recipe's preparation, then a hand-over where the kitchen vessel slides out and the glass slides in */
  private drawKitchenPart(t: number) {
    const { ctx } = this;
    const j = Math.max(0, this.stepIndexAt(t)), st = this.steps[j] as KStep, u = clamp((t - this.starts[j]) / st.dur);
    const prev = j > 0 ? (this.steps[j - 1] as KStep) : undefined;
    if (st.kit.act !== 'serve') { drawKitchen(ctx, st, u, t, this.colors.ink, this.colors.glass, prev && prev.kind === 'prep' ? prev : undefined); return; }
    const out = easeIO(clamp(u / 0.7)), inn = easeOut(clamp((u - 0.3) / 0.7));
    ctx.save(); ctx.translate(-out * 280, 0); ctx.globalAlpha = 1 - out * 0.6;
    drawVessel(ctx, st.kit.vessel, { ...st.kit.after, hot: 0 }, t, u, this.colors.ink, this.colors.glass, {});
    ctx.restore();
    this.useCtr('glass');
    ctx.save(); ctx.translate((1 - inn) * 280, 0); ctx.globalAlpha = clamp(inn * 1.5); this.drawScene(t, 0); ctx.restore();
  }

  private drawScene(t: number, cap: number) {
    const { ctx } = this;
    const layers = this.layersAt(t);
    const top = this.surf(t, layers);
    const has = layers.length > 0;
    const sh = this.shape, isGlass = this.active === 'glass';

    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.ellipse(120, sh.bottom + 12, 86, 8, 0, 0, 7); ctx.fill();
    // glass back
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = this.colors.glass; ctx.fill(this.path); ctx.globalAlpha = 0.07; ctx.fillStyle = '#5a7f95'; ctx.fill(this.path); ctx.restore();

    ctx.save(); ctx.clip(this.path);
    if (has) this.drawLiquid(layers, top, t);
    if (this.cold) this.drawCubes(top, t);
    this.drawParticles(top, t, layers, 'in');
    if (has && this.cold && isGlass) this.drawBeads(top, t);
    ctx.restore();

    // utensils inside the container (stir spoon, muddler)
    this.drawInGlassTools(top, t);
    this.drawStreams(top, t);
    if (isGlass) this.drawSurfaceExtras(top, t, layers);

    // outline + shine
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = this.colors.ink; ctx.globalAlpha = 0.72; ctx.lineWidth = 3.5; ctx.stroke(this.path); if (this.extra) ctx.stroke(this.extra); ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(40, 0, 200, 0); g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(0.25, 'rgba(255,255,255,0)'); g.addColorStop(0.8, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.18)');
    ctx.fillStyle = g; ctx.fill(this.path);

    this.drawParticles(top, t, layers, 'out');
    if (isGlass) this.drawGarnish(t);
    if (!isGlass && cap > 0.01) { // the metal cap drops on before shaking
      const y = this.rimY - 22 * (1 - cap) * 3;
      ctx.save(); ctx.globalAlpha = Math.min(1, cap * 2);
      const gr = ctx.createLinearGradient(70, 0, 170, 0); gr.addColorStop(0, '#dfe3e6'); gr.addColorStop(0.5, '#fafbfc'); gr.addColorStop(1, '#a9afb4');
      ctx.fillStyle = gr; ctx.strokeStyle = this.colors.ink; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(72, y + 8); ctx.lineTo(168, y + 8); ctx.lineTo(160, y - 34); ctx.lineTo(80, y - 34); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c3c8cc'; ctx.beginPath(); (ctx as any).roundRect(98, y - 44, 44, 12, 4); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  private yAt(layers: Layer[], i: number, x: number, t: number, top: number): number {
    // y of the TOP boundary of layer i at x (i = layers.length-1 is the free surface)
    let h = 0; for (let k = 0; k <= i; k++) h += layers[k].ml * this.pxPerMl;
    const y = this.floorY - h * (1 + this.iceDisp(t));
    if (i === layers.length - 1) return y + this.ripple(t, x);
    return y + this.ripple(t, x, 0.3 + 0.8 * this.mixOf(t)); // interfaces shiver less than the surface
  }

  private drawLiquid(layers: Layer[], top: number, t: number) {
    const { ctx } = this;
    const row = this.rowAt(top), x0 = Math.min(row.l, 20) - 20, x1 = 220;
    const step = 4;
    const lastBound = (x: number) => this.floorY + 14;
    let prev: ((x: number) => number) = lastBound;
    const soft = this.seq.layered ? 3 : 7;
    layers.forEach((l, i) => {
      const upper = (x: number) => this.yAt(layers, i, x, t, top);
      const lower = prev;
      ctx.beginPath();
      ctx.moveTo(x0, upper(x0));
      for (let x = x0 + step; x <= x1; x += step) ctx.lineTo(x, upper(x));
      for (let x = x1; x >= x0; x -= step) ctx.lineTo(x, lower(x));
      ctx.closePath();
      const yt = upper(120), yb = Math.min(this.floorY + 10, lower(120));
      const gr = ctx.createLinearGradient(0, yt, 0, Math.max(yt + 1, yb));
      const a = clamp(l.opacity, 0.4, 0.96);
      gr.addColorStop(0, css(l.color, a)); gr.addColorStop(1, css(l.color.map(v => v * 0.88), a));
      ctx.fillStyle = gr; ctx.fill();
      // a darker meniscus line makes pale liquids (milk, oat, coconut) readable on a pale glass
      ctx.strokeStyle = css(l.color.map(v => v * 0.62), 0.45 * (1 - l.mix)); ctx.lineWidth = 1.4; ctx.beginPath();
      for (let x = x0; x <= x1; x += step) { const y = upper(x) + 0.7; if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      prev = upper;
    });
    // soft interfaces
    for (let i = 0; i < layers.length - 1; i++) {
      const a = layers[i], b = layers[i + 1];
      if (Math.min(a.mix, b.mix) > 0.85) continue;
      const yi = this.yAt(layers, i, 120, t, top);
      const diff = Math.hypot(a.color[0] - b.color[0], a.color[1] - b.color[1], a.color[2] - b.color[2]);
      if (diff < 6) continue;
      const g = ctx.createLinearGradient(0, yi - soft, 0, yi + soft);
      g.addColorStop(0, css(b.color, 0.55)); g.addColorStop(1, css(a.color, 0));
      ctx.fillStyle = g; ctx.fillRect(x0, yi - soft, x1 - x0, soft * 2);
      // meniscus glint on the interface
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x0, yi - 0.6, x1 - x0, 1.2);
    }
    // swirl streaks while stirring
    const m = this.mixOf(t);
    if (m > 0.02) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const cy = (top + this.floorY) / 2, ry = Math.max(8, (this.floorY - top) * 0.32);
      for (let k = 0; k < 4; k++) {
        const a = t * (this.steps.some(s => s.kind === 'stir' && s.gentle) ? 5 : 9) + k * 1.6, r = 12 + k * 9;
        ctx.globalAlpha = m * (0.5 - k * 0.08); ctx.beginPath(); ctx.ellipse(this.cx, cy + (k - 1.5) * 6, r, Math.min(ry, 6 + k * 3), 0, a, a + 1.9); ctx.stroke();
      }
      ctx.restore();
    }
    // surface sheen
    const ys = this.yAt(layers, layers.length - 1, 120, t, top);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(120, ys + 1.5, Math.max(10, (this.rowAt(ys).r - this.rowAt(ys).l) / 2 - 6), 2.2, 0, 0, 7); ctx.fill();
    // foam head
    const foam = this.foamAt(t);
    if (foam > 0.2) {
      const fr = this.rowAt(ys); const fc = this.blendedDrink ? mixc(layers[layers.length - 1].color, [255, 255, 255], 0.55) : [255, 255, 255];
      ctx.fillStyle = css(fc, 0.62); ctx.beginPath(); ctx.moveTo(fr.l, ys + 1);
      for (let x = fr.l; x <= fr.r; x += 5) ctx.lineTo(x, ys - foam * (0.55 + 0.45 * Math.sin(x * 0.4 + 1)) + this.ripple(t, x) * 0.4);
      ctx.lineTo(fr.r, ys + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = css(fc, 0.8); for (let x = fr.l + 4; x < fr.r - 3; x += 9) { ctx.beginPath(); ctx.arc(x, ys - foam * 0.55 + Math.sin(x) * 1.2, 1.6 + (x % 3) * 0.5, 0, 7); ctx.fill(); }
    }
    // whipped cream / ice cream scoop toppings sit in drawSurfaceExtras
  }

  private drawCubes(top: number, t: number) {
    const { ctx } = this;
    for (const c of this.cubes) {
      if (t < c.tDrop) continue;
      const row = this.rowAt(top);
      const half = c.size / 2;
      const x = clamp(c.x0, row.l + half + 2, row.r - half - 2);
      let y: number, rot = c.rot, sq = 0;
      const restY = Math.min(this.floorY - c.size + 2 + c.lift * c.size, top - c.size * (0.42 - c.lift * 0.9) + Math.sin((t + this.idleT) * 1.4 + c.k * 2) * 1.4);
      if (t < c.tLand) {
        const q = (t - c.tDrop) / (c.tLand - c.tDrop); // 0..1 falling under gravity
        y = lerp(this.rimY - 70, top - c.size * (0.5 - c.lift * 0.9), easeIn(q)); rot = c.rot + (1 - q) * 1.4; sq = -0.1 * q;
      } else {
        const age = t - c.tLand;
        const dip = 9 * Math.exp(-age * 3.2) * Math.cos(age * 11);   // plunge below the surface, bob back up
        y = restY + dip; rot = c.rot + 0.08 * Math.sin(age * 5) * Math.exp(-age * 2); sq = 0.18 * Math.exp(-age * 9) * Math.cos(age * 16);
      }
      ctx.save(); ctx.translate(x, y + half); ctx.rotate(rot); ctx.scale(1 + sq, 1 - sq);
      const g = ctx.createLinearGradient(-half, -half, half, half); g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(190,230,248,.45)');
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.8;
      ctx.beginPath(); (ctx as any).roundRect(-half, -half, c.size, c.size, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-half + 6, -half + 5); ctx.lineTo(-half + 6, half - 8); ctx.stroke();
      ctx.restore();
    }
  }

  private drawBeads(top: number, t: number) {
    const { ctx } = this; const born = this.starts[this.steps.findIndex(s => s.kind === 'ice')] ?? 0;
    const a = clamp((t - born - 1.2) / 2.2); if (a <= 0) return;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    [[70, 0.46, 2.2], [168, 0.55, 3], [78, 0.74, 2.4], [160, 0.38, 2.2], [66, 0.9, 3], [172, 0.8, 2.2]].forEach(([x, f, r], i) => {
      const y = top + (this.floorY - top) * f; ctx.globalAlpha = clamp(a * 1.4 - i * 0.12) * 0.7; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  private drawParticles(top: number, t: number, layers: Layer[], pass: 'in' | 'out') {
    const { ctx } = this;
    for (const p of this.ps) {
      if (p.ct !== this.active) continue;
      const inside = p.y > this.rimY - 2;
      if (pass === 'in' && !(p.k === 'bubble' || p.k === 'bit' || p.k === 'rest' || p.k === 'solid' || p.k === 'drop' || p.k === 'speck')) continue;
      if (pass === 'out' && !(p.k === 'steam' || p.k === 'dust')) continue;
      const a = p.k === 'steam' ? 0.22 * Math.sin(Math.PI * clamp(p.life / p.max)) : p.k === 'drop' ? 0.85 * (1 - p.life / p.max * 0.5) : p.k === 'bubble' ? 0.7 : 0.95;
      ctx.globalAlpha = a;
      if (p.k === 'bubble') { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); ctx.stroke(); }
      else if (p.k === 'steam') { ctx.fillStyle = css(p.c); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      else if (p.k === 'bit' || p.k === 'rest' || p.k === 'solid') { ctx.fillStyle = css(p.c); ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.2, p.r * 0.8, p.ph, 0, 7); ctx.fill(); }
      else if (p.k === 'speck') { ctx.fillStyle = css(p.c); ctx.beginPath(); ctx.arc(p.x, top - 0.5, p.r, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = css(p.c, 1); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      void inside;
    }
    ctx.globalAlpha = 1;
  }

  // ---------- utensils ----------
  private drawInGlassTools(top: number, t: number) {
    const { ctx } = this;
    this.steps.forEach((st, j) => {
      if (!this.mine(st)) return;
      const u = (t - this.starts[j]) / st.dur; if (u < 0 || u > 1) return;
      const pose = easeIO(clamp(u / 0.15)) * (1 - easeIO(clamp((u - 0.88) / 0.12)));
      if (st.kind === 'muddle') {
        const stroke = Math.sin(u * Math.PI * 6 - 1.2) * 0.5 + 0.5; // 0 top, 1 bottom
        const y = lerp(this.rimY - 60, this.floorY - 26, stroke) - (1 - pose) * 90;
        ctx.save(); ctx.translate(this.cx - 4, y);
        ctx.fillStyle = '#b8794a'; ctx.strokeStyle = this.colors.ink; ctx.lineWidth = 1.6;
        ctx.beginPath(); (ctx as any).roundRect(-4.5, -110, 9, 110, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d8975f'; ctx.beginPath(); (ctx as any).roundRect(-11, -2, 22, 16, 4); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      if (st.kind === 'stir') {
        const sp = st.gentle ? 5 : 9, a = t * sp;
        const baseX = this.cx + Math.cos(a) * 20 * pose, baseY = lerp(top + 2, this.floorY - 18, 0.8) + Math.sin(a) * 4;
        const tipX = this.cx + 36 * pose + (1 - pose) * 70, tipY = this.rimY - 62 - (1 - pose) * 30;
        ctx.save(); ctx.lineCap = 'round';
        ctx.strokeStyle = this.colors.ink; ctx.globalAlpha = 0.85; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(baseX, baseY); ctx.stroke();
        ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(baseX, baseY); ctx.stroke();
        ctx.fillStyle = '#d9d9d9'; ctx.strokeStyle = this.colors.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(baseX, baseY + 2, 6.5, 3.2, 0.4, 0, 7); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    });
  }

  private drawStreams(top: number, t: number) {
    const v = this.vesselAt(t); if (!v || v.into !== this.active) return;
    const { ctx } = this;
    const sp = this.spout(v);
    const col = v.color;
    if (v.head <= 0.01 || v.tail >= 0.99) return;
    const wob = v.flow === 'thin' ? 1.2 : v.flow === 'thick' ? 0.6 : 0.9;
    const coil = v.flow === 'thick' ? 3 : 0;
    if (v.spoon) {
      // jug pours onto the back of a spoon (thin stream), the spoon lets it slide gently over the surface
      const sx = this.cx - 2, sy = top - 8 + this.ripple(t, this.cx) * 0.3;
      this.ribbon(sp.x, sp.y, sx + 2, sy - 2, 5.5, col, 0.92, v.head, v.tail, 0.8, 0, t);
      this.drawSpoon(sx, sy, col, v);
      const lx = sx - 20;
      // sheet sliding off the spoon edge
      this.ribbon(lx + 8, sy + 3, lx, top, 12, col, 0.8, easeOut(clamp((v.head - 0.4) / 0.6)), v.tail, 0.2, 0, t);
    } else {
      this.ribbon(sp.x, sp.y, v.impactX, top + this.ripple(t, v.impactX) * 0.4, v.width, col, 0.93, v.head, v.tail, wob, coil, t);
      // impact dimple
      const a = easeOut(v.head) * (1 - v.tail);
      if (a > 0.3) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.4; ctx.globalAlpha = a * 0.8; ctx.beginPath(); ctx.ellipse(v.impactX, top + 1, v.width * 1.3 + Math.sin(t * 22) * 1.2, 2.4, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    }
  }
  private ribbon(sx: number, sy: number, ix: number, iy: number, w0: number, col: number[], alpha: number, head: number, tail: number, wob: number, coil: number, t: number) {
    const { ctx } = this; const N = 22; const dx = ix - sx, dy = Math.max(6, iy - sy);
    const pts: { x: number; y: number; nx: number; ny: number; w: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const s = lerp(tail, head, i / N);
      const wobble = Math.sin(s * 14 - t * 13) * wob * s + Math.sin(s * 8 - t * 7) * coil * s;
      const x = sx + dx * s + wobble, y = sy + dy * s * s;
      const tx = dx + (coil ? Math.cos(s * 8 - t * 7) * coil * 8 * s : 0), ty = 2 * dy * s;
      const len = Math.hypot(tx, ty) || 1;
      pts.push({ x, y, nx: -ty / len, ny: tx / len, w: w0 * (1 - 0.5 * s) * (0.85 + 0.15 * Math.sin(s * 22 - t * 18)) });
    }
    ctx.save();
    ctx.fillStyle = css(col, alpha);
    ctx.beginPath();
    pts.forEach((p, i) => { const f = i === 0 ? ctx.moveTo : ctx.lineTo; f.call(ctx, p.x + p.nx * p.w / 2, p.y + p.ny * p.w / 2); });
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x - pts[i].nx * pts[i].w / 2, pts[i].y - pts[i].ny * pts[i].w / 2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = Math.max(1, w0 * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); pts.forEach((p, i) => { const x = p.x - p.nx * p.w * 0.22, y = p.y - p.ny * p.w * 0.22; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
    ctx.restore();
  }
  private drawSpoon(x: number, y: number, col: number[], v: Vessel) {
    const { ctx } = this; const pose = 1 - easeIn(clamp((v.x - (this.cx + 30)) / 130));
    ctx.save(); ctx.translate(x + (1 - pose) * 40, y + (1 - pose) * -50); ctx.rotate(-0.22);
    ctx.strokeStyle = this.colors.ink; ctx.lineWidth = 1.4; ctx.fillStyle = '#e4e4e4';
    ctx.beginPath(); ctx.ellipse(0, 0, 17, 6.5, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = css(col, 0.55); ctx.beginPath(); ctx.ellipse(-1, 0.5, 12, 3.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = this.colors.ink; ctx.globalAlpha = 0.7; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(14, -2); ctx.lineTo(96, -34); ctx.stroke(); ctx.globalAlpha = 1; ctx.strokeStyle = '#d6d6d6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(14, -2); ctx.lineTo(96, -34); ctx.stroke();
    ctx.restore();
  }

  private spout(v: Vessel) {
    // spout position in glass space (the vessel origin) with a small lip offset for each shape
    const lip: Record<string, number[]> = { jug: [-6, 1], bottle: [0, -2], shot: [-3, 0], tin: [-3, 3], jar: [0, 0] };
    const [lx, ly] = lip[v.kind] || [0, 0];
    return { x: v.x + Math.cos(v.angle) * lx - Math.sin(v.angle) * ly, y: v.y + Math.sin(v.angle) * lx + Math.cos(v.angle) * ly };
  }

  private drawVessels(top: number, t: number) {
    const { ctx } = this;
    const v = this.vesselAt(t);
    if (v) { const hc = this.ctrs[v.into] || this.ctrs.glass; const home = Math.hypot(v.x - (hc.cx + 30), v.y - (hc.rimY - 34)); ctx.save(); ctx.globalAlpha = clamp(1.35 - home / 70); this.drawVessel(v); ctx.restore(); }
    // stationary appliances
    this.steps.forEach((st, j) => {
      const u = (t - this.starts[j]) / st.dur; if (u < 0 || u > 1) return;
      const pose = easeIO(clamp(u / 0.16)) * (1 - easeIO(clamp((u - 0.86) / 0.14)));
      if (st.kind === 'shake') { // motion lines beside the shaking container
        const sc = this.ctrs.shaker || this.ctrs.glass, sh = Math.sin(t * 38) * 7 * pose;
        ctx.save(); ctx.strokeStyle = this.colors.quiet; ctx.globalAlpha = 0.6 * pose; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(sc.cx - 62, sc.rimY - 12 + k * 18); ctx.lineTo(sc.cx - 80 - Math.abs(sh), sc.rimY - 12 + k * 18); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sc.cx + 62, sc.rimY - 12 + k * 18); ctx.lineTo(sc.cx + 80 + Math.abs(sh), sc.rimY - 12 + k * 18); ctx.stroke(); }
        ctx.restore();
      }
      if (st.kind === 'blend') {
        const x = this.cx + 70 + (1 - pose) * 90, y = this.rimY - 60, jig = Math.sin(t * 60) * 1.2 * pose;
        ctx.save(); ctx.translate(x + jig - 8, y - 14); ctx.scale(1.3, 1.3);
        ctx.fillStyle = '#4a3a33'; ctx.strokeStyle = this.colors.ink; ctx.lineWidth = 1.8; ctx.beginPath(); (ctx as any).roundRect(-26, 52, 52, 18, 5); ctx.fill(); ctx.stroke();
        this.jarBody(0, 0, rgb(st.color || '#ccc'), 0.6, t);
        ctx.restore();
      }
      if (st.kind === 'whisk') {
        const x = 52 + (1 - pose) * -90, y = 16;
        ctx.save(); ctx.translate(x, y);
        const col = rgb(st.color || '#8cb36b');
        ctx.fillStyle = '#f4efe6'; ctx.strokeStyle = this.colors.ink; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.quadraticCurveTo(0, 56, 34, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.moveTo(-34, 0); ctx.quadraticCurveTo(0, 56, 34, 0); ctx.closePath(); ctx.clip();
        ctx.fillStyle = css(col, 0.95); ctx.fillRect(-40, 9, 80, 40);
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.6; const a = t * 14; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(0, 18 + k * 3, 8 + k * 6, 3 + k, 0, a + k, a + k + 2.4); ctx.stroke(); }
        ctx.restore();
        const wa = t * 14; ctx.strokeStyle = '#b9b9b9'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        const wx = Math.cos(wa) * 9, wy = 22 + Math.sin(wa) * 3;
        ctx.beginPath(); ctx.moveTo(wx + 22, -34); ctx.lineTo(wx, wy); ctx.stroke();
        ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(wx, wy + 4, 5, 8, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(wx, wy + 4, 2, 8, 0, 0, 7); ctx.stroke();
        ctx.restore();
      }
      if (st.kind === 'scoop') {
        const q = clamp(u / 0.6), y = lerp(this.rimY - 80, top - 12, easeIn(q)) , land = clamp((u - 0.6) / 0.4);
        const sq = u > 0.6 ? 0.22 * Math.exp(-land * 6) * Math.cos(land * 18) : 0;
        ctx.save(); ctx.translate(this.cx, y); ctx.scale(1 + sq, 1 - sq);
        ctx.fillStyle = css(rgb(st.color || '#f6e7c8'), 1); ctx.strokeStyle = this.colors.ink; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(0, 0, 21, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(-7, -8, 6, 3.5, -0.6, 0, 7); ctx.fill();
        ctx.restore();
      }
      if (st.kind === 'top' && st.flow !== 'fizz') { // whipped cream swirl piped on
        const q = easeOut(clamp(u / 0.8));
        ctx.save(); ctx.translate(this.cx, top + 2); ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = this.colors.ink; ctx.lineWidth = 1.4;
        for (let k = 0; k < 3; k++) { const w = (30 - k * 8) * q, hh = 9 * q; ctx.beginPath(); ctx.ellipse(0, -k * 8 * q, w, hh, 0, 0, 7); ctx.fill(); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(-5 * q, -26 * q); ctx.quadraticCurveTo(0, -42 * q, 5 * q, -26 * q); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    });
  }

  // persistent toppings (scoop / whipped cream) after their step finished
  private drawSurfaceExtras(top: number, t: number, layers: Layer[]) {
    const { ctx } = this;
    this.steps.forEach((st, j) => {
      const u = (t - this.starts[j]) / st.dur; if (u <= 1) return;
      if (st.kind === 'scoop') {
        ctx.save(); ctx.translate(this.cx, top - 12); ctx.fillStyle = css(rgb(st.color || '#f6e7c8')); ctx.strokeStyle = this.colors.ink; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(0, 0, 21, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(-7, -8, 6, 3.5, -0.6, 0, 7); ctx.fill(); ctx.restore();
      }
      if (st.kind === 'top' && st.flow !== 'fizz') {
        ctx.save(); ctx.translate(this.cx, top + 2); ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = this.colors.ink; ctx.lineWidth = 1.4;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(0, -k * 8, 30 - k * 8, 9, 0, 0, 7); ctx.fill(); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(-5, -26); ctx.quadraticCurveTo(0, -42, 5, -26); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if (st.kind === 'rim') { ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.9)'; for (let x = this.rowAt(this.rimY).l; x < this.rowAt(this.rimY).r; x += 5) { ctx.beginPath(); ctx.arc(x + (x % 3), this.rimY - 1.5 + (x % 2), 1.4, 0, 7); ctx.fill(); } ctx.restore(); }
    });
    void layers;
  }

  private drawGarnish(t: number) {
    const gi = this.steps.findIndex(s => s.kind === 'garnish'); if (gi < 0 || !this.garnishSpec) return;
    const q = clamp((t - this.starts[gi] - 0.1) / 0.45); if (q <= 0) return;
    const { ctx } = this; const k = this.garnishSpec.kind, color = this.garnishSpec.color;
    const x = this.shape.rim < 100 ? 176 : this.rimY >= 140 ? 176 : 190, y = this.rimY + 2;
    ctx.save(); ctx.translate(x, y); const s = easeBack(q); ctx.scale(s, s); ctx.rotate((1 - q) * -0.7);
    if (k === 'wheel') {
      ctx.fillStyle = color; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.55)'; for (const a of [0, 60, 120]) { ctx.save(); ctx.rotate(a * Math.PI / 180); ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.stroke(); ctx.restore(); }
    } else if (k === 'leaf') {
      ctx.fillStyle = color; for (const [dx, dy, r] of [[-12, -16, -30], [0, -22, 0], [12, -14, 32]]) { ctx.save(); ctx.translate(dx, dy); ctx.rotate(r * Math.PI / 180); ctx.beginPath(); ctx.ellipse(0, 0, 7, 14, 0, 0, 7); ctx.fill(); ctx.restore(); }
    } else if (k === 'cherry') {
      ctx.strokeStyle = '#4E7B2E'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(8, -26, 22, -30); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(-3, -3, 2.4, 0, 7); ctx.fill();
    } else if (k === 'stick') {
      ctx.rotate(0.25); ctx.fillStyle = color; ctx.beginPath(); (ctx as any).roundRect(-3, -52, 7, 64, 3); ctx.fill();
    } else { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  // ---------- vessels ----------
  private drawVessel(v: Vessel) {
    const { ctx } = this;
    ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.angle);
    ctx.lineWidth = 2; ctx.strokeStyle = this.colors.ink; ctx.lineJoin = 'round';
    const liquid = (w: number, h: number, ox: number, oy: number) => { // liquid stays level while the body tilts
      ctx.save(); ctx.clip();
      ctx.translate(ox + w / 2, oy + h / 2); ctx.rotate(-v.angle);
      ctx.fillStyle = css(v.color, 0.95); ctx.fillRect(-w, (0.5 - v.fill) * h * 1.2, w * 2, h * 2);
      ctx.restore();
    };
    if (v.kind === 'jug') {
      ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(2, 4); ctx.lineTo(2, 4); ctx.lineTo(2, 4); ctx.lineTo(0, 0); ctx.lineTo(46, 0); ctx.lineTo(46, 52); ctx.quadraticCurveTo(46, 58, 40, 58); ctx.lineTo(6, 58); ctx.quadraticCurveTo(0, 58, 0, 52); ctx.lineTo(0, 6); ctx.lineTo(-9, -4); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); liquid(46, 58, 0, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(46, 10); ctx.bezierCurveTo(64, 8, 64, 44, 46, 46); ctx.lineWidth = 3; ctx.stroke();
    } else if (v.kind === 'bottle') {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, 0); ctx.lineTo(12, 18); ctx.quadraticCurveTo(26, 22, 26, 36); ctx.lineTo(26, 74); ctx.quadraticCurveTo(26, 80, 20, 80); ctx.lineTo(-6, 80); ctx.quadraticCurveTo(-12, 80, -12, 74); ctx.lineTo(-12, 36); ctx.quadraticCurveTo(-12, 22, 0, 18); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); liquid(38, 80, -12, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(-12, 46, 38, 14); ctx.fillStyle = this.colors.ink; ctx.globalAlpha = 0.55; ctx.fillRect(-6, 51, 26, 2); ctx.fillRect(-6, 55, 18, 2); ctx.globalAlpha = 1;
      ctx.fillStyle = '#c9c9c9'; ctx.beginPath(); (ctx as any).roundRect(-1, -6, 14, 8, 2); ctx.fill(); ctx.stroke();
    } else if (v.kind === 'shot') {
      ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(26, 0); ctx.lineTo(23, 32); ctx.quadraticCurveTo(22, 36, 18, 36); ctx.lineTo(6, 36); ctx.quadraticCurveTo(2, 36, 1, 32); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); liquid(28, 36, -2, 0); ctx.stroke();
    } else if (v.kind === 'tin' || v.kind === 'jar') {
      if (v.kind === 'tin') { ctx.save(); ctx.scale(0.66, 0.66); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(84, 0); ctx.lineTo(76, 150); ctx.quadraticCurveTo(42, 159, 8, 150); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); liquid(84, 156, 0, 0); ctx.stroke(); const gr = ctx.createLinearGradient(0, 0, 90, 0); gr.addColorStop(0, '#dfe3e6'); gr.addColorStop(0.5, '#fafbfc'); gr.addColorStop(1, '#a9afb4'); ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(88, 4); ctx.lineTo(80, -30); ctx.lineTo(4, -30); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#888'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(8 + k * 4, 0, 1, 0, 7); ctx.fill(); } ctx.restore(); } else { ctx.save(); this.jarBody(32, 2, v.color, v.fill, this.t, false); ctx.restore(); }
    }
    ctx.restore();
  }
  private tin(x: number, y: number, pouring = false) {
    const { ctx } = this;
    ctx.save(); ctx.translate(x, y); ctx.lineWidth = 2; ctx.strokeStyle = this.colors.ink;
    const g = ctx.createLinearGradient(0, 0, 44, 0); g.addColorStop(0, '#dfe3e6'); g.addColorStop(0.45, '#fafbfc'); g.addColorStop(1, '#a9afb4');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(44, 8); ctx.lineTo(38, 62); ctx.lineTo(6, 62); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 8); ctx.lineTo(4, 0); ctx.lineTo(14, -10); ctx.lineTo(30, -10); ctx.lineTo(40, 0); ctx.lineTo(40, 8); ctx.closePath(); ctx.fillStyle = '#c3c8cc'; ctx.fill(); ctx.stroke();
    if (pouring) { ctx.fillStyle = '#888'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(8 + k * 4, -4, 1, 0, 7); ctx.fill(); } }
    ctx.restore();
  }
  private jarBody(x: number, y: number, col: number[], fill: number, t: number, lid = true) {
    const { ctx } = this; ctx.save(); ctx.translate(x - 26, y);
    ctx.lineWidth = 2; ctx.strokeStyle = this.colors.ink; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(0, 0); ctx.lineTo(52, 0); ctx.lineTo(46, 54); ctx.lineTo(6, 54); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fill();
    ctx.save(); ctx.clip(); const lvl = 54 - fill * 54; ctx.fillStyle = css(col, 0.95); ctx.fillRect(-10, lvl, 70, 60);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; const a = t * 20; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(26, 30 + k * 6, 6 + k * 5, 3 + k, 0, a + k, a + k + 2.6); ctx.stroke(); }
    ctx.restore(); ctx.stroke();
    if (lid) { ctx.fillStyle = '#6d5a50'; ctx.beginPath(); (ctx as any).roundRect(0, -8, 52, 9, 3); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
}

export type PlayerOptsCb = (s: { t: number; total: number; step: number; playing: boolean; done: boolean }) => void;
