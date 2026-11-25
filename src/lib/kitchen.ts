// Kitchen method: turns a recipe's "How to make it" text into animated preparation steps.
//
// The sequencer only knows the ingredients that end up in the glass, so a recipe like
// "heat sugar and water in a saucepan, add tarragon, boil, cool, blend with ice, refrigerate, strain,
// stir in lemon juice, then serve over ice with seltzer" used to play as a single "Pour simple syrup".
// Here every preparation clause of the recipe text becomes its own step (heat, add, boil, cool, blend,
// refrigerate, strain, stir in...) played in a saucepan, blender, jug, bowl or teapot, and the glass
// steps from the sequencer follow. Nothing here is specific to one drink: it reads the recipe text.
import type { Seq, SeqStep } from './pour';
import type { Ingredient } from './data';

export type RGB = number[];
export type Contents = { level: number; color: RGB; op: number; bits: RGB[]; pulp: number; hot: number; ice: number; sugar: number; w: number };
export type Thing = { name: string; color: RGB; type: 'liquid' | 'bits' | 'powder' | 'ice'; op: number };
export type Kit = {
  act: string; vessel: string; from?: string; before: Contents; after: Contents; src?: Contents; adds: Thing[];
  timer?: string; heat: [number, number];
};
export type KStep = SeqStep & { kit: Kit; detail: string };

// ---------- colour helpers ----------
const hex = (h: string): RGB => { const n = parseInt((h || '#cccccc').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c: RGB) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mixc = (a: RGB, b: RGB, t: number) => a.map((v, i) => v + (b[i] - v) * t);
const avg = (cs: RGB[]) => (cs.length ? [0, 1, 2].map(k => cs.reduce((s, c) => s + c[k], 0) / cs.length) : [200, 200, 200]);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// ---------- what a phrase in the recipe looks like ----------
// Order matters: compound names come first and consume their text, so "lemon zest" never also counts as "lemon".
const THINGS: [RegExp, string, Thing['type'], number][] = [
  [/baking soda|bicarbonate/, '#ffffff', 'powder', 0],
  [/kosher salt|black salt|sea salt|\bsalt\b/, '#ffffff', 'powder', 0],
  [/brown sugar|jaggery|\bgur\b|muscovado|kokuto|black sugar|palm sugar|coconut sugar/, '#B9772E', 'powder', 0.7],
  [/\bsugar\b|\bmishri\b/, '#ffffff', 'powder', 0],
  [/honey|maple syrup|agave/, '#E0A030', 'liquid', 0.55],
  [/(lemon|lime|orange|citrus|grapefruit) (zest|peel|rind)|\bzest\b|\bpeel\b/, '#F2C94C', 'bits', 1],
  [/lemon juice|lime juice|\blemons?\b|\blimes?\b/, '#F1E9A6', 'liquid', 0.45],
  [/orange juice|\boranges?\b|tangerine|clementine/, '#F7941D', 'liquid', 0.8],
  [/grapefruit/, '#F48A7B', 'liquid', 0.6],
  [/tea leaves|loose tea|tea bags?|sencha|black tea|assam|darjeeling|earl grey|oolong|hojicha|green tea leaves/, '#4A3A1E', 'bits', 1],
  [/green tea|sencha/, '#B9C46A', 'liquid', 0.45],
  [/\btea\b/, '#A0522D', 'liquid', 0.6],
  [/matcha/, '#6E9E2E', 'powder', 0.9],
  [/hibiscus|beetroot|\bbeet\b|rose petals?/, '#A3123F', 'bits', 1],
  [/tarragon|mint|basil|tulsi|coriander|cilantro|parsley|rosemary|thyme|lemongrass|pandan|curry leaves|\bherbs?\b|\bleaves\b|spinach|kale|shiso|perilla|sage/, '#4E8F2E', 'bits', 1],
  [/cucumber/, '#9BCB6A', 'bits', 1],
  [/aniseed|anise|fennel|cumin|coriander seeds?|\bseeds?\b|cardamom|cloves?|peppercorns?|black pepper|\bpepper\b|ajwain|carom|mustard/, '#7A5A33', 'bits', 1],
  [/cinnamon|star anise|bay lea(f|ves)/, '#8B4513', 'bits', 1],
  [/ginger|galangal/, '#E3C27A', 'bits', 1],
  [/turmeric|haldi/, '#E0A800', 'powder', 0.9],
  [/saffron|kesar/, '#E8811A', 'bits', 0.6],
  [/cocoa|chocolate|cacao/, '#5C3A21', 'powder', 0.95],
  [/coffee|espresso/, '#4B2E1E', 'liquid', 0.95],
  [/kinako|soy ?milk|soybean/, '#E3CFA2', 'liquid', 0.9],
  [/oat ?milk|\boats?\b/, '#EADFC8', 'liquid', 0.9],
  [/coconut milk|coconut cream/, '#F6F2EA', 'liquid', 0.95],
  [/milk|cream|yog(h)?urt|curd|dahi|buttermilk|condensed/, '#F6F1E6', 'liquid', 0.95],
  [/almonds?|cashews?|pistachios?|\bnuts?\b|walnuts?|peanuts?|sesame/, '#D9BE94', 'bits', 1],
  [/raw mango|green mango|kairi/, '#C7C45A', 'bits', 1],
  [/mango/, '#F4B400', 'liquid', 0.9],
  [/strawberr|raspberr|berr(y|ies)|cherr(y|ies)|cranberr/, '#C2185B', 'bits', 1],
  [/watermelon/, '#E8505B', 'liquid', 0.75],
  [/pineapple/, '#F5D547', 'liquid', 0.8],
  [/pomegranate/, '#B3123B', 'liquid', 0.8],
  [/kokum/, '#7B1E4B', 'liquid', 0.85],
  [/tamarind|imli/, '#6B3A1E', 'liquid', 0.85],
  [/grapes?/, '#6B2A5E', 'liquid', 0.8],
  [/apples?/, '#E6D8A8', 'bits', 1],
  [/bananas?/, '#F3E5AB', 'bits', 1],
  [/peach(es)?|apricots?|plums?/, '#F4A460', 'bits', 1],
  [/\bice\b|ice cubes?|crushed ice/, '#EAF6FB', 'ice', 0],
  [/seltzer|soda water|club soda|sparkling water|tonic/, '#EAF6FB', 'liquid', 0.1],
  [/\bwater\b/, '#E8F4F8', 'liquid', 0.12],
  [/vanilla/, '#5B3A1A', 'liquid', 0.2],
  [/rose ?water|rose syrup/, '#F2A7B8', 'liquid', 0.4],
  [/syrup|concentrate|cordial/, '#E9D8A6', 'liquid', 0.45],
];

/** Things named in one clause, in the order the recipe names them. Uses the app's ingredient list as a fallback. */
export function thingsIn(text: string, db: { re: RegExp; ing: Ingredient }[] = []): Thing[] {
  let rest = ' ' + text.toLowerCase().replace(/\([^)]*\)/g, ' ') + ' ';
  const found: { at: number; t: Thing }[] = [];
  for (const [re, color, type, op] of THINGS) {
    const g = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(rest))) {
      found.push({ at: m.index, t: { name: m[0], color: hex(color), type, op } });
      rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index + m[0].length);
      g.lastIndex = m.index + m[0].length;
    }
  }
  for (const { re, ing } of db) {
    const m = re.exec(rest); if (!m) continue;
    const type: Thing['type'] = ing.category === 'accent' ? 'bits' : 'liquid';
    found.push({ at: m.index, t: { name: m[0], color: hex(ing.color_hex), type, op: clamp(ing.opacity, 0.1, 0.95) } });
    rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  return found.sort((a, b) => a.at - b.at).map(f => f.t);
}

// ---------- splitting the recipe into clauses ----------
const VERBS = 'heat|warm|boil|simmer|bring|cook|cool|let|leave|set|rest|refrigerate|chill|keep|freeze|strain|sieve|filter|blend|pur[eé]e|process|stir|whisk|mix|combine|add|pour|top|serve|garnish|steep|brew|cover|soak|infuse|remove|transfer|discard|squeeze|muddle|mash|crush|grind|roast|toast|chop|slice|peel|grate|fill|place|put|taste|adjust|dilute|sprinkle|dissolve|reduce|melt|whip|froth|shake|cut|halve|zest';
const SPLIT = new RegExp(`(?:[,;]\\s*(?:and\\s+)?(?:then\\s+)?|\\s+and\\s+then\\s+|\\s+then\\s+|,?\\s+and\\s+)(?=(?:${VERBS})\\b)`, 'i');

export function clausesOf(steps: string[]): string[] {
  const out: string[] = [];
  for (const s of steps) {
    // "Brew and chill the hibiscus base: steep 2 tbsp hibiscus..." - the heading only names the step; the method follows the colon
    const body = s.replace(/^\s*(?:\d+[.)]\s*)?[A-Za-z][^:.\d()]{1,60}:\s+(?=\S)/, m => (m.split(/\s+/).length <= 9 ? '' : m));
    const sentences = body.replace(/\boz\./gi, 'oz').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
    for (const sen of sentences) {
      // keep "(enough for 5 glasses)" and "2 oz (60 ml)" with their clause, never split inside brackets
      const masked = sen.replace(/\([^)]*\)/g, m => m.replace(/[,;]/g, '\u0001').replace(/ and /g, ' \u0002 ').replace(/ then /g, ' \u0003 '));
      let lead = '';
      for (const p of masked.split(SPLIT)) {
        const c = p.replace(/\u0001/g, ',').replace(/\u0002/g, 'and').replace(/\u0003/g, 'then').trim().replace(/^(and|then)\s+/i, '').replace(/[.;,]+$/, '').trim();
        // "To serve, fill a glass..." keeps its lead-in with the clause it introduces
        if (/^(to (serve|finish|assemble|make (it|one|a glass))|for (each|one) (glass|serving))$/i.test(c)) { lead = c + ', '; continue; }
        if (c && /[a-z]/i.test(c)) { out.push(lead + c); lead = ''; }
      }
    }
  }
  // a lead-in fragment that names no ingredient ("Once boiling", "In a small saucepan over medium heat") joins the clause after it
  const merged: string[] = [];
  for (let k = 0; k < out.length; k++) {
    const c = out[k];
    if (k + 1 < out.length && /^(once|when|after|in a|in the|on a|over|while)\b/i.test(c) && !thingsIn(c).length) { out[k + 1] = c + ', ' + out[k + 1].charAt(0).toLowerCase() + out[k + 1].slice(1); continue; }
    merged.push(c);
  }
  return merged;
}

// ---------- what each clause does ----------
const ACTS: [string, RegExp][] = [
  ['chill', /\b(refrigerat\w*|fridge|freez\w*|chill(ed)? (it |them |the \w+ )?(for|in|until|overnight|at least|completely)|^chill\b|keep (it )?(cold|chilled))/],
  ['blend', /\b(blend\w*|pur[eé]e\w*|process\w*|liquidi[sz]\w*|churn\w*|blender)\b/],
  ['strain', /\b(strain\w*|sieve\w*|filter\w*|discard)\b/],
  ['boil', /\b(boil\w*|simmer\w*|bring\b.*\bto a boil)\b/],
  ['heat', /\b(heat\w*|warm\w*|cook\w*|melt\w*|dissolve\w*|reduce)\b/],
  ['cool', /\b(cool\w*|let (it |them )?(sit|rest|stand)|set (\w+ ){0,2}aside|rest\b|leave (it )?to|remove\w* (it )?from the heat|(take|turn) (\w+ ){0,2}off the heat|turn off the (heat|flame|stove))/],
  ['steep', /\b(steep\w*|brew\w*|infus\w*|soak\w*|cover and|bloom)\b/],
  ['whisk', /\b(whisk\w*|froth\w*|beat\w*|whip\w*)\b/],
  ['muddle', /\b(muddl\w*|crush\w*|mash\w*|smash\w*|bruis\w*|pound\w*|grind\w*)\b/],
  ['roast', /\b(roast\w*|toast\w*|dry[- ]roast\w*|fry\w*)\b/],
  ['cut', /\b(chop\w*|slic\w*|dic(e|ing)\w*|peel\w*|cut\b|halve\w*|grat\w*|zest\b|core\b|pit\b|deseed\w*)/],
  ['squeeze', /\b(squeez\w*|juice (the|a|half|1|2))\b/],
  ['pour', /\b(pour\w*|transfer\w*|tip (it|the))\b/],
  ['stir', /\b(stir\w*|mix\w*|combine\w*|dilute\w*|shake (well|it|the jar))\b/],
  ['add', /\b(add\w*|put\b|place\w*|weigh\w*|measure\w*|drop\w*|sprinkle\w*|toss\w*)\b/],
  ['taste', /\b(taste\w*|adjust\w*)\b/],
];
/** the action whose verb comes first in the clause */
function actOf(c: string): string | null {
  let best: string | null = null, at = 1e9;
  for (const [a, re] of ACTS) { const m = re.exec(c); if (m && m.index < at) { at = m.index; best = a; } }
  return best;
}
const STRONG = new Set(['chill', 'blend', 'strain', 'boil', 'heat', 'cool', 'steep', 'roast', 'cut', 'muddle']);
const VESSEL_WORDS: [RegExp, string][] = [
  [/immersion blender|hand blender|stick blender/, 'here'],
  [/blender|food processor|mixer jar/, 'blender'],
  [/saucepan|\bpan\b|skillet|wok|kadai|kadhai|tawa/, 'pan'],
  [/\bpot\b|kettle|saucepot|stockpot|\bvessel\b/, 'pot'],
  [/teapot|french press|tea ?pot/, 'teapot'],
  [/jug|pitcher|\bjar\b|bottle|container|carafe|flask/, 'jug'],
  [/\bbowl\b|\bin (a|the) (small |large |separate )?cup\b/, 'bowl'],
];
const vesselIn = (c: string) => { for (const [re, v] of VESSEL_WORDS) if (re.test(c)) return v; return null; };
const GLASS_RE = /\b(glass(es)?|mugs?|teacups?|tumblers?|kulhads?|serv(e|es|ed|ing)|garnish\w*|top (it |up |off )?with|over (crushed |fresh |plenty of |lots of )?ice|fill\b.*\bwith (crushed )?ice|add (some |crushed |a few )?ice( cubes)?\b|splash with|(iced|serving|chilled|prepared|warmed) (cups?|glass)|into (the|a|your|two|2) cups?|over\b[^.]*\bice|shaker|^shake\b(?! off))\b/;
/** true when a clause builds or serves the drink itself rather than preparing something in the kitchen */
function isGlass(c: string, act: string | null): boolean {
  const t = c.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\b(until|before|when|for|till|ahead of) (serv\w*|ready to serve)/g, ' ').replace(/enough for \d+ \w+/g, ' ');
  if (!GLASS_RE.test(t)) return false;
  // "blend with ice cubes" or "boil until..." stay in the kitchen unless they name the glass or serving
  if (act && STRONG.has(act) && act !== 'cut' && act !== 'muddle' && !/\b(glass(es)?|mugs?|teacups?|serv(e|es|ed|ing)|tumblers?|kulhads?|garnish\w*)\b/.test(t)) return false;
  return true;
}

function timerOf(c: string): string | undefined {
  const t = c.toLowerCase();
  if (/overnight/.test(t)) return 'overnight';
  const n = '(?:\\d+(?:\\s+\\d\\/\\d|[./]\\d+)?|a few|a couple of|one|two|three|four|five|ten|fifteen|twenty|thirty)';
  const m = new RegExp(`(?:at least |about |around |for |another )?(${n}(?:\\s*(?:to|-|–)\\s*${n})?)\\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)\\b`).exec(t);
  if (!m) return undefined;
  const unit = /^s/.test(m[2]) ? 'sec' : /^m/.test(m[2]) ? 'min' : /^h/.test(m[2]) ? (m[1] === '1' || m[1] === 'one' ? 'hr' : 'hrs') : 'days';
  const amt = pretty(m[1]).replace(/\s*(to|-|–)\s*/, '–').replace(/(\d) ([½¼¾⅓⅔⅛])/g, '$1$2').replace(/^a couple of$/, '2').replace(/^a few$/, 'a few');
  return `${/at least/.test(m[0]) ? '≥ ' : ''}${amt} ${unit}`;
}

const pretty = (s: string) => s.replace(/(\d+) (\d)\/(\d)/g, '$1 $2/$3').replace(/\b1\/2\b/g, '½').replace(/\b1\/4\b/g, '¼').replace(/\b3\/4\b/g, '¾').replace(/\b1\/3\b/g, '⅓').replace(/\b2\/3\b/g, '⅔').replace(/\b1\/8\b/g, '⅛');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DUR: Record<string, number> = { add: 1.5, pour: 1.6, heat: 1.7, boil: 1.7, cool: 1.5, chill: 2.0, blend: 1.9, strain: 1.8, steep: 1.7, whisk: 1.4, muddle: 1.4, roast: 1.6, cut: 1.5, squeeze: 1.3, stir: 1.4, taste: 1.1 };
const EMPTY = (): Contents => ({ level: 0, color: [232, 244, 248], op: 0.12, bits: [], pulp: 0, hot: 0, ice: 0, sugar: 0, w: 0 });
const copyC = (c: Contents): Contents => ({ ...c, color: [...c.color], bits: [...c.bits] });

function addThings(c: Contents, things: Thing[], vessel: string) {
  const room = vessel === 'pan' ? 0.75 : 0.82;
  for (const th of things) {
    if (th.type === 'liquid') {
      const w = 1; c.color = c.w ? mixc(c.color, th.color, w / (c.w + w)) : [...th.color];
      c.op = c.w ? (c.op * c.w + th.op * w) / (c.w + w) : th.op; c.w += w; c.level = Math.min(room, c.level + (c.level < 0.05 ? 0.34 : 0.14));
    } else if (th.type === 'powder') {
      if (th.op > 0) { c.color = c.w ? mixc(c.color, th.color, 0.45) : [...th.color]; c.op = Math.max(c.op, th.op * 0.8); c.w += 0.5; }
      c.sugar = Math.min(1, c.sugar + (th.op > 0 ? 0.4 : 0.55));
      if (c.level < 0.12) c.level = 0.12;
    } else if (th.type === 'bits') {
      const n = th.op >= 1 ? 6 : 3; for (let k = 0; k < n; k++) c.bits.push(th.color);
      if (c.level < 0.1) c.level = 0.1;
    } else if (th.type === 'ice') { c.ice = 1; c.level = Math.min(room, c.level + 0.12); }
  }
}
function infuse(c: Contents, amt: number) {
  if (!c.bits.length) return;
  c.color = mixc(c.color, avg(c.bits), amt); c.op = clamp(c.op + amt * 0.5, 0, 0.92);
}

export type MethodInput = { steps: string[]; ingById: Record<string, Ingredient>; items: { id: string; ml: number }[] };
export type Method = { kitchen: KStep[]; kitchenText: string; glassText: string; product: string; color: RGB; op: number; act: string };

/** Parse the recipe's own method into kitchen steps (empty when the recipe is built straight in the glass). */
export function parseMethod(o: MethodInput): Method {
  const clauses = clausesOf(o.steps);
  // the verb outside brackets decides: "Make the base (… 1 inch grated ginger)" is not a grating step
  const acts = clauses.map(c => actOf(c.toLowerCase().replace(/\([^)]*\)/g, ' ')));
  // Which clauses happen in the kitchen: the opening run before the glass is mentioned (when it really prepares
  // something), plus any later run that starts with real preparation (heat, boil, blend, steep, a pan or a bowl...).
  const glassy = clauses.map((c, k) => isGlass(c, acts[k]));
  // "fill a cup with ice and set aside", "add ice and stir": a bare follow-up belongs to the clause before it
  for (let k = 1; k < clauses.length; k++) if (!glassy[k] && glassy[k - 1] && /^(set (it )?aside|stir( well| gently)?|mix( well)?|cool)$/i.test(clauses[k].trim())) glassy[k] = true;
  const strongAt = (k: number) => (!!acts[k] && STRONG.has(acts[k]!)) || !!vesselIn(clauses[k].toLowerCase().replace(/\([^)]*\)/g, ''));
  const inK = clauses.map(() => false);
  let g = glassy.indexOf(true); if (g < 0) g = clauses.length;
  if (clauses.slice(0, g).some((_, k) => strongAt(k))) for (let k = 0; k < g; k++) inK[k] = true;
  let run = false;
  for (let k = g; k < clauses.length; k++) {
    if (glassy[k]) { run = false; continue; }
    if (strongAt(k) || run) { inK[k] = true; run = true; }
  }
  const pre = clauses.filter((_, k) => inK[k]);
  const preActs = acts.filter((_, k) => inK[k]);
  const none: Method = { kitchen: [], kitchenText: '', glassText: clauses.join('. ').toLowerCase(), product: '', color: [232, 244, 248], op: 0.2, act: '' };
  if (!pre.length) return none;

  const db = Object.values(o.ingById).flatMap(ing => {
    const names = [ing.name.toLowerCase().replace(/\s*\(.*\)/, ''), ...ing.name.toLowerCase().split('/').map(s => s.replace(/\s*\(.*\)/, '').trim())].filter(n => n.length >= 4);
    return [...new Set(names)].map(n => ({ re: new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), ing }));
  }).sort((a, b) => b.re.source.length - a.re.source.length);

  const store: Record<string, Contents> = {};
  const held: Record<string, string[]> = {};   // what went into each vessel, to find "the milk" later
  let cur = '';
  const kitchen: KStep[] = [];
  let lastAct = '';
  pre.forEach((raw, k) => {
    const c = raw.toLowerCase();
    let act = preActs[k];
    // "Make the tarragon syrup: heat sugar and water..." names the product, not an ingredient
    const things = thingsIn(raw.replace(/^make\b[^:]*:\s*/i, '').replace(/^make (the |a |your )?((?:[a-z-]+ ){0,3}(syrup|concentrate|tea|base|puree|mix|mixture|paste|brew|infusion|cordial))\b/i, ''), db);
    if (!act) { if (!things.length) return; act = 'add'; }
    const named = vesselIn(c.replace(/\([^)]*\)/g, ''));
    const heatable = (v: string) => v === 'pan' || v === 'pot';
    let vessel = cur, from: string | undefined;
    const hasStuff = (v: string) => !!v && !!store[v] && store[v].level > 0.04;
    // choose the vessel for this clause
    if (named === 'here') vessel = cur || 'jug';
    else if (act === 'blend') vessel = 'blender';
    else if (act === 'strain') vessel = named && named !== cur ? named : cur === 'jug' ? 'bowl' : 'jug';
    else if (act === 'cut') vessel = cur;
    else if (named) vessel = named;
    else if (!cur) vessel = act === 'heat' || act === 'boil' || act === 'roast' ? 'pan' : act === 'steep' ? (/tea|sencha|leaves/.test(c) ? 'teapot' : 'jug') : 'bowl';
    else if ((act === 'heat' || act === 'boil' || act === 'roast') && !heatable(cur)) vessel = 'pan';
    // "blend the milk": the batch comes from whichever vessel holds the milk, not always the last one used
    const named2 = things.map(t => t.name.split(' ').pop()!);
    const holder = Object.keys(store).find(v => hasStuff(v) && v !== vessel && (held[v] || []).some(n => named2.some(x => n.includes(x))));
    let source = holder && (act === 'blend' || act === 'strain' || act === 'heat' || act === 'boil' || act === 'chill') ? holder : cur;
    if (act === 'pour' && !named) {
      // "pour the water over the leaves": from this vessel into the other one that already holds something
      const other = Object.keys(store).filter(v => v !== cur && hasStuff(v)).pop();
      if (other) vessel = other;
      else if (/\bover\b/.test(c) && hasStuff(cur)) { vessel = cur === 'bowl' ? 'jug' : 'bowl'; source = ''; }
    }
    if (source !== cur && source && act !== 'pour') { /* keep the source as the vessel being worked on when nothing moves */ if (vessel === cur) vessel = source; }
    if (vessel !== source && hasStuff(source) && (act === 'blend' || act === 'strain' || (act === 'pour' && !things.some(t => t.type !== 'liquid' && !/\bover\b/.test(c))) || (!things.length && act !== 'cut'))) from = source;
    if (act === 'pour' && !from && things.length) from = undefined;
    // "Muddle it gently", "Let it cool": nothing new is named, so keep working on what is already in the last vessel
    if (!things.length && act !== 'cut' && !from && !hasStuff(vessel) && hasStuff(cur)) vessel = cur;
    const before = copyC(store[vessel] || EMPTY());
    const src = from ? copyC(store[from]) : undefined;
    const after = copyC(before);
    if (from && src) {
      // the whole batch moves; straining leaves the solids behind
      const w = after.w + src.w || 1;
      after.color = after.level > 0.04 ? mixc(after.color, src.color, src.w / w) : [...src.color];
      after.op = after.level > 0.04 ? (after.op * after.w + src.op * src.w) / w : src.op;
      after.w = w; after.level = Math.min(0.85, after.level + src.level * (vessel === 'blender' ? 0.75 : 0.95));
      after.bits = [...after.bits, ...src.bits]; after.pulp = Math.max(after.pulp, src.pulp); after.hot = src.hot; after.ice = src.ice; after.sugar = Math.max(after.sugar, src.sugar);
    }
    const adds = act === 'cut' ? things : things.filter(t => !(act === 'pour' && from && t.type === 'liquid' && /water|tea|milk/.test(t.name) && /\bthe\b/.test(c)));
    if (act !== 'cut') addThings(after, adds, vessel);
    let heat: [number, number] = [before.hot, before.hot];
    switch (act) {
      case 'heat': after.hot = 1; after.sugar = 0; infuse(after, 0.12); heat = [1, 1]; break;
      case 'boil': after.hot = 2; after.sugar = 0; infuse(after, 0.28); heat = [2, 2]; break;
      case 'roast': after.hot = 1; after.color = mixc(after.color, [120, 70, 30], 0.3); after.bits = after.bits.map(b => mixc(b, [110, 60, 25], 0.35)); heat = [1, 1]; break;
      case 'cool': after.hot = 0; heat = [before.hot ? 1 : 0, 0]; infuse(after, 0.08); break;
      case 'chill': after.hot = 0; heat = [0, 0]; break;
      case 'steep': infuse(after, 0.55); heat = [0, 0]; after.hot = Math.max(0, after.hot - 1); break;
      case 'blend': infuse(after, 0.55); if (after.bits.length) after.pulp = 1; after.bits = []; after.sugar = 0; after.op = clamp(after.op + 0.25, 0, 0.92); after.hot = Math.min(after.hot, 1); heat = [0, 0]; break;
      case 'strain': after.bits = []; after.pulp = 0; after.ice = 0; after.op = clamp(after.op - 0.08, 0.15, 0.9); heat = [0, 0]; break;
      case 'muddle': infuse(after, 0.3); heat = [0, 0]; break;
      case 'whisk': case 'stir': after.sugar = after.hot ? 0 : after.sugar * 0.4; heat = [Math.min(1, before.hot), Math.min(1, before.hot)]; break;
      default: heat = heatable(vessel) ? [Math.min(1, before.hot), Math.min(1, before.hot)] : [0, 0];
    }
    if (!heatable(vessel)) { heat = [0, 0]; }
    if (from) { held[vessel] = [...(held[vessel] || []), ...(held[from] || [])]; delete store[from]; delete held[from]; }
    if (act !== 'cut') held[vessel] = [...(held[vessel] || []), ...things.map(t => t.name)];
    store[vessel] = after; if (act !== 'cut') cur = vessel;
    let label = cap(pretty(raw.replace(/\s*\([^)]*\)/g, '')).replace(/^to serve,?\s*/i, '').trim());
    const baseLabel = label;
    if (!things.length && !['cut', 'add'].includes(act)) {
      // name what is being worked on: "Strain" -> "Strain the hibiscus and water", "Muddle it" -> "Muddle the cucumber"
      const what = [...new Set((held[vessel] || []).filter(n => !/^(ice|seeds?|leaves|peel|zest|black|white|green|red|fresh)$/.test(n)))];
      const list = !what.length ? '' : what.length > 3 ? '\u0004mixture' : what.length > 1 ? what.slice(0, -1).join(', ') + ' and ' + what[what.length - 1] : what[0];
      if (list && /\b(it|them)\b/i.test(label)) label = label.replace(/\b(it|them)\b/i, 'the ' + list);
      else if (list && !/\b(the|everything|all)\b/i.test(label) && label.split(/\s+/).length <= 3) label = label.replace(/^(\S+)/, `$1 the ${list}`);
    }
    kitchen.push({
      i: 0, kind: 'prep', into: 'kitchen', ids: [], label, detail: label !== baseLabel ? label + (/\([^)]*\)/.test(raw) ? ' ' + (raw.match(/\([^)]*\)/) || [''])[0] : '') + '.' : cap(pretty(raw)) + '.', dur: DUR[act] || 1.4,
      kit: { act, vessel: act === 'cut' ? 'board' : vessel, from, before, after, src, adds, timer: timerOf(raw.replace(/\([^)]*\)/g, ' ')) || timerOf(raw), heat },
    });
    lastAct = act;
  });
  if (!kitchen.length) return none;
  // keep the kitchen part of the film under ~22 s
  const sum = kitchen.reduce((s, x) => s + x.dur, 0), f = sum > 22 ? 22 / sum : 1;
  kitchen.forEach(s => { s.dur = +(Math.max(0.9, s.dur * f)).toFixed(2); });

  const kitchenText = pre.join('. ').toLowerCase();
  const glassText = clauses.filter((_, k) => !inK[k]).join('. ').toLowerCase();
  const END = '(?:syrup|concentrate|tea|base|puree|purée|juice|brew|infusion|cordial|mix|mixture|paste|decoction|sharbat|extract|milk|soda|lemonade|cooler|water|sauce|kadha|panna)';
  const END2 = '(?:syrup|concentrate|base|puree|purée|brew|infusion|cordial|mixture|paste|decoction|sharbat|extract)';
  // headings like "Brew and chill the hibiscus base:" name the product even though the heading is not a step
  const heads = o.steps.map(t => (/^\s*(?:\d+[.)]\s*)?([A-Za-z][^:.\d()]{1,60}):/.exec(t) || [])[1] || '').join(' . ').toLowerCase();
  const made = new RegExp(`\\bmake (?:the |a |your )?((?:[a-z-]+ ){0,3}${END})\\b`).exec(kitchenText)
    || new RegExp(`\\b(?:the |a |your )((?:[a-z-]+ ){0,2}${END2})\\b`).exec(heads)
    || new RegExp(`\\b(?:of |add |pour |with )the ((?:[a-z-]+ ){0,2}${END})\\b`).exec(glassText)
    || new RegExp(`\\bthe ((?:[a-z-]+ ){0,2}${END})\\b`).exec(glassText)
    || new RegExp(`\\bthe ((?:[a-z-]+ ){0,2}${END2})\\b(?![\\s\\S]*\\bthe (?:[a-z-]+ ){0,2}${END2}\\b)`).exec(kitchenText);
  const fallback: Record<string, string> = { blend: 'blended mix', strain: 'strained mix', steep: 'brew', chill: 'chilled mix', boil: 'cooked mix', heat: 'warm mix', cool: 'cooled mix' };
  const product = made ? made[1].trim() : fallback[lastAct] || 'mix';
  // a step that works on a long list of things names the product when the recipe names one ("Chill the tamarind base")
  kitchen.forEach(k => { const nm = made ? made[1].trim() : 'mixture'; k.label = k.label.replace(/\u0004mixture/g, nm); k.detail = k.detail.replace(/\u0004mixture/g, nm); });
  const fin = store[cur] || EMPTY();
  return { kitchen, kitchenText, glassText, product, color: fin.color, op: fin.op, act: lastAct };
}

// ---------- which ingredients the kitchen already used ----------
const ALIAS: Record<string, string[]> = {
  simple_syrup: ['sugar', 'simple syrup', 'sugar syrup'], soda_water: ['seltzer', 'club soda', 'soda water', 'sparkling water'],
  jaggery: ['jaggery', 'gur'], lemon_juice: ['lemon juice', 'lemon', 'lemons'], lime_juice: ['lime juice', 'lime', 'limes'],
};
function aliasesOf(id: string, ing: Ingredient): string[] {
  const base = ing.name.toLowerCase().replace(/\s*\(.*\)/, '');
  const parts = base.split('/').map(s => s.trim());
  const GENERIC = /^(water|juice|syrup|milk|tea|powder|leaves|cream|soda|extract|concentrate|seeds?|paste|sugar|salt|fresh|brewed|chilled)$/;
  const last = parts.map(p => p.split(' ')).filter(w => w.length > 1).map(w => w[w.length - 1]).filter(w => w.length >= 5 && !GENERIC.test(w));
  return [...new Set([...(ALIAS[id] || []), base, ...parts, id.replace(/_/g, ' '), ...last].filter(s => s.length >= 3))];
}
// "mint" also finds "spearmint"; short names need a word boundary on both sides
const mentions = (text: string, names: string[]) => names.some(n => new RegExp(`${n.length >= 4 ? '' : '\\b'}${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(e?s)?\\b`).test(text));

/**
 * The film for one recipe: the kitchen steps from its method, a short hand-over, then the glass steps from the sequencer.
 * Glass steps for things the kitchen already made (a syrup, a concentrate, a brew) pour that product instead.
 */
export function withMethod(seq: Seq & { prep?: string | null }, o: MethodInput & { glass: string; temp: string }): Seq & { prep?: string | null; method?: Method } {
  const m = parseMethod(o);
  if (!m.kitchen.length) return seq;
  const kText = m.kitchenText.replace(/baking soda|bicarbonate of soda/g, ' ');
  const gText = m.glassText;
  const roles = seq.roles || {};
  const steeped = m.kitchen.some(s => s.kit.act === 'steep' || s.kit.act === 'boil');
  const consumed = new Set(o.items.filter(i => {
    const ing = o.ingById[i.id]; if (!ing) return false;
    const names = aliasesOf(i.id, ing);
    if (roles[i.id] === 'fizz' && !mentions(kText, names)) return false;
    const inK = mentions(kText, names) || (steeped && (roles[i.id] === 'tea' || roles[i.id] === 'coffee') && /tea|coffee|leaves|sencha|brew/.test(kText));
    return inK && !mentions(gText.split(m.product).join(' '), names);
  }).map(i => i.id));

  const prodColor = (c?: string) => toHex(c ? mixc(m.color, hex(c), 0.35) : m.color);
  let glass: SeqStep[] = [];
  let merged: SeqStep | null = null;
  for (const st of seq.steps) {
    const ids = st.ids || [];
    const allUsed = ids.length > 0 && ids.every(id => consumed.has(id));
    if ((st.kind === 'muddle' || st.kind === 'dust' || st.kind === 'whisk' || st.kind === 'drop' || st.kind === 'blend') && allUsed) continue;
    if (st.kind === 'blend' && m.kitchen.some(k => k.kit.act === 'blend')) continue;
    if ((st.kind === 'pour' || st.kind === 'float') && allUsed && !st.strained && !st.blendedPour) {
      if (merged) { merged.ml = (merged.ml || 0) + (st.ml || 0); merged.ids = [...merged.ids, ...ids]; continue; }
      merged = { ...st, color: prodColor(st.color), opacity: Math.max(0.35, Math.min(0.9, (m.op + (st.opacity ?? 0.5)) / 2 + 0.1)), label: `${st.into === 'shaker' ? 'Pour the ' + m.product + ' into the shaker' : 'Pour in the ' + m.product}`, detail: `Pour ${Math.round(st.ml || 0)} ml of the ${m.product} ${st.into === 'shaker' ? 'into the shaker' : 'into the glass'}.` } as SeqStep;
      glass.push(merged); continue;
    }
    glass.push({ ...st });
  }
  if (merged) { const ms = merged; ms.dur = Math.max(ms.dur, Math.min(2.2, 0.6 + (ms.ml || 0) / 40)); }
  // "fill a glass with ice, add the syrup...": ice goes in first when the recipe says so
  const iceFirst = /^(?:to serve,?\s*)?(?:fill|add|put|place)[^.]*?\bice\b/.test(gText) && (gText.search(/\bice\b/) < Math.max(0, gText.search(/\b(add|pour|top)\b(?![^.]*\bice\b)/)) || /^(?:to serve,?\s*)?fill\b/.test(gText));
  const ice = glass.findIndex(s => s.kind === 'ice' && s.into !== 'shaker');
  const firstPour = glass.findIndex(s => (s.kind === 'pour' || s.kind === 'top' || s.kind === 'float') && s.into !== 'shaker');
  if (iceFirst && ice > firstPour && firstPour >= 0) {
    const [st] = glass.splice(ice, 1);
    glass.splice(firstPour, 0, { ...st, label: 'Fill the glass with ice' });
    // the sequencer's "stir before the ice" no longer makes sense once the ice is in first
    glass = glass.filter((s, k) => !(s.kind === 'stir' && !s.gentle && k > 0 && glass[k - 1] && glass[k - 1].kind === 'pour' && glass.slice(k + 1).some(x => x.kind === 'top')));
  }
  const g = (o.glass || 'glass').toLowerCase(), gName = /glass|mug|cup|jar|kulhad|tumbler|bowl|bottle/.test(g) ? g : g + ' glass';
  const serve: KStep = {
    i: 0, kind: 'prep', into: 'kitchen', ids: [], dur: 1.1, label: `Now build the drink in the ${gName}`,
    detail: `Bring the ${m.product} over and build the drink in the ${gName}.`,
    kit: { act: 'serve', vessel: m.kitchen[m.kitchen.length - 1].kit.vessel === 'board' ? 'bowl' : m.kitchen[m.kitchen.length - 1].kit.vessel, before: m.kitchen[m.kitchen.length - 1].kit.after, after: m.kitchen[m.kitchen.length - 1].kit.after, adds: [], heat: [0, 0] },
  };
  const steps = [...m.kitchen, serve, ...glass].map((s, i) => ({ ...s, i }));
  return { ...seq, steps, prep: null, method: m, duration: +steps.reduce((s, x) => s + x.dur, 0).toFixed(2) };
}

// =====================================================================================================
// Drawing. Everything is a pure function of (step, u = progress through the step 0..1, t = film time),
// so scrubbing and replaying the kitchen part is exact, like the glass part.
// Coordinates are the player's 240 x 340 design space; the counter top is at y = 306.
// =====================================================================================================
type Ctx = CanvasRenderingContext2D;
const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const rr = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); (ctx as any).roundRect(x, y, w, h, r); };
const hash = (k: number) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

type VSpec = { d: string; top: number; bot: number; l: number; r: number; heat: boolean };
const VS: Record<string, VSpec> = {
  pan: { d: 'M48 232 L192 232 L189 292 Q187 303 174 303 L66 303 Q53 303 51 292 Z', top: 238, bot: 301, l: 52, r: 188, heat: true },
  pot: { d: 'M60 176 L180 176 L177 292 Q175 303 162 303 L78 303 Q65 303 63 292 Z', top: 182, bot: 301, l: 64, r: 176, heat: true },
  blender: { d: 'M70 112 L170 112 L156 262 L84 262 Z', top: 120, bot: 260, l: 80, r: 160, heat: false },
  jug: { d: 'M80 164 L160 164 L164 294 Q164 304 153 304 L87 304 Q76 304 76 294 Z', top: 170, bot: 302, l: 80, r: 160, heat: false },
  bowl: { d: 'M40 236 Q42 306 120 306 Q198 306 200 236 Z', top: 242, bot: 304, l: 50, r: 190, heat: false },
  teapot: { d: 'M64 252 C64 196 176 196 176 252 C176 296 158 304 120 304 C82 304 64 296 64 252 Z', top: 214, bot: 302, l: 68, r: 172, heat: false },
};
const spec = (v: string) => VS[v] || VS.bowl;

/** contents part-way through a step */
function contentsAt(k: Kit, u: number): Contents {
  const a = k.before, b = k.after, q = easeIO(clamp((u - 0.18) / 0.62));
  const n = Math.round(lerp(a.bits.length, b.bits.length, clamp((u - 0.3) / 0.45)));
  const bits = (b.bits.length >= a.bits.length ? b.bits : a.bits).slice(0, n);
  return {
    level: lerp(a.level, b.level, q), color: mixc(a.color, b.color, q), op: lerp(a.op, b.op, q), bits, pulp: lerp(a.pulp, b.pulp, q),
    hot: lerp(k.heat[0], k.heat[1], clamp(u / 0.3)), ice: b.ice > a.ice ? clamp((u - 0.25) / 0.3) : lerp(a.ice, b.ice, q), sugar: lerp(a.sugar, b.sugar, q), w: b.w,
  };
}

function drawStove(ctx: Ctx, heat: number, t: number, ink: string) {
  ctx.save();
  ctx.fillStyle = '#3b3430'; ctx.strokeStyle = ink; ctx.lineWidth = 1.6; rr(ctx, 30, 304, 180, 11, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5a504a'; rr(ctx, 58, 300, 124, 5, 2); ctx.fill();
  if (heat > 0.02) {
    for (let k = 0; k < 7; k++) {
      const x = 66 + k * 18, h = heat * (7 + 4 * Math.sin(t * 23 + k * 1.7) + (heat > 1.4 ? 5 : 0));
      const g = ctx.createLinearGradient(0, 302, 0, 302 - h); g.addColorStop(0, 'rgba(60,120,255,.95)'); g.addColorStop(0.6, 'rgba(120,170,255,.8)'); g.addColorStop(1, 'rgba(255,170,60,.7)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 4, 303); ctx.quadraticCurveTo(x - 4, 302 - h * 0.5, x, 302 - h); ctx.quadraticCurveTo(x + 4, 302 - h * 0.5, x + 4, 303); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

function drawContents(ctx: Ctx, v: string, c: Contents, t: number, u: number, opts: { boil?: number; swirl?: number; steep?: number } = {}) {
  const s = spec(v); if (c.level < 0.01 && c.sugar < 0.01 && !c.bits.length) return;
  const surf = s.bot - c.level * (s.bot - s.top);
  const boil = opts.boil || 0;
  ctx.save(); ctx.clip(new Path2D(s.d));
  const wave = (x: number) => surf + Math.sin(x * 0.09 + t * (3 + boil * 6)) * (0.8 + boil * 1.6) + (opts.swirl ? Math.sin(x * 0.05 - t * 14) * 3 * opts.swirl : 0);
  if (c.level > 0.01) {
    ctx.beginPath(); ctx.moveTo(0, wave(0)); for (let x = 0; x <= 240; x += 4) ctx.lineTo(x, wave(x)); ctx.lineTo(240, 340); ctx.lineTo(0, 340); ctx.closePath();
    const a = clamp(c.op, 0.28, 0.95), g = ctx.createLinearGradient(0, surf, 0, s.bot);
    g.addColorStop(0, css(c.color, a)); g.addColorStop(1, css(c.color.map(x => x * 0.86), a)); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = css(c.color.map(x => x * 0.6), 0.5); ctx.lineWidth = 1.3; ctx.beginPath(); for (let x = 0; x <= 240; x += 4) { if (x) ctx.lineTo(x, wave(x) + 0.6); else ctx.moveTo(x, wave(x) + 0.6); } ctx.stroke();
  }
  // undissolved sugar or powder on the bottom
  if (c.sugar > 0.02) { ctx.fillStyle = `rgba(255,255,255,${0.75 * c.sugar})`; for (let k = 0; k < 40; k++) { ctx.beginPath(); ctx.arc(s.l + hash(k) * (s.r - s.l), s.bot - 2 - hash(k + 50) * 7 * c.sugar, 1.3, 0, 7); ctx.fill(); } }
  // pulp after blending
  if (c.pulp > 0.02) { ctx.fillStyle = css(c.color.map(x => x * 0.7), 0.55 * c.pulp); for (let k = 0; k < 46; k++) { const y = lerp(surf + 4, s.bot - 3, hash(k + 9)); ctx.beginPath(); ctx.arc(s.l + hash(k + 3) * (s.r - s.l) + Math.sin(t * 2 + k) * 1.2, y, 1 + hash(k) * 1.2, 0, 7); ctx.fill(); } }
  // steeping: colour clouds rise from the leaves
  if (opts.steep && c.bits.length) {
    const col = avg(c.bits);
    for (let k = 0; k < 6; k++) { const x = s.l + 14 + hash(k + 70) * (s.r - s.l - 28), y = lerp(s.bot - 6, surf + 10, hash(k + 80)) - opts.steep * 12; const r = 8 + opts.steep * 22; const g = ctx.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, css(col, 0.45 * opts.steep)); g.addColorStop(1, css(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  }
  // boiling bubbles
  if (boil > 0.05) { ctx.fillStyle = 'rgba(255,255,255,.75)'; for (let k = 0; k < 16; k++) { const ph = (t * (0.9 + hash(k) * 0.8) + hash(k + 20)) % 1; const x = s.l + 6 + hash(k + 30) * (s.r - s.l - 12); const y = lerp(s.bot - 3, surf + 2, ph); ctx.globalAlpha = Math.min(1, boil) * (0.4 + 0.6 * ph); ctx.beginPath(); ctx.arc(x, y, 1 + ph * 2.6 * Math.min(1.4, boil), 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
  // floating pieces (herbs, zest, seeds, fruit)
  const n = Math.min(22, c.bits.length);
  for (let k = 0; k < n; k++) {
    const col = c.bits[Math.floor(k * c.bits.length / n)];
    const x = s.l + 8 + ((k * 53 + 17) % Math.max(1, s.r - s.l - 16)) + Math.sin(t * 1.3 + k) * 2 + (opts.swirl ? Math.sin(t * 9 + k) * 10 * opts.swirl : 0);
    const y = (c.level > 0.05 ? surf + 3 + ((k * 17) % 11) : s.bot - 4 - (k % 3) * 3) + Math.sin(t * 2 + k * 1.3) * 1.2 + boil * Math.sin(t * 11 + k) * 2.5;
    ctx.save(); ctx.translate(x, y); ctx.rotate(k * 1.1 + Math.sin(t + k) * 0.3); ctx.fillStyle = css(col, 0.95);
    ctx.beginPath(); ctx.ellipse(0, 0, k % 3 === 0 ? 2.2 : 4.2, k % 3 === 0 ? 2.2 : 1.8, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  // ice
  if (c.ice > 0.02 && c.level > 0.05) { for (let k = 0; k < 3; k++) { const x = s.l + 18 + k * ((s.r - s.l - 36) / 2), y = surf - 6 + Math.sin(t * 1.5 + k) * 1.5; ctx.globalAlpha = c.ice; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.4; rr(ctx, x - 9, y - 9 + (1 - c.ice) * -40, 18, 18, 4); ctx.fill(); ctx.stroke(); } ctx.globalAlpha = 1; }
  // swirl lines while blending or stirring
  if (opts.swirl && c.level > 0.05) { ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; const cy = (surf + s.bot) / 2; for (let k = 0; k < 4; k++) { const a = t * 12 + k * 1.6; ctx.globalAlpha = opts.swirl * (0.6 - k * 0.1); ctx.beginPath(); ctx.ellipse(120, cy + (k - 1.5) * 8, 14 + k * 10, 4 + k * 2, 0, a, a + 2); ctx.stroke(); } ctx.globalAlpha = 1; }
  ctx.restore();
}

function drawSteam(ctx: Ctx, v: string, amt: number, t: number) {
  if (amt < 0.03) return; const s = spec(v);
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineCap = 'round'; ctx.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    const ph = (t * 0.6 + k * 0.25) % 1, x0 = s.l + 20 + k * ((s.r - s.l - 40) / 3);
    ctx.globalAlpha = amt * 0.5 * Math.sin(ph * Math.PI);
    ctx.beginPath(); for (let i = 0; i <= 10; i++) { const y = s.top - 8 - ph * 30 - i * 4, x = x0 + Math.sin(i * 0.8 + t * 3 + k) * 5; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
  }
  ctx.restore();
}

/** one vessel with its contents, handles and (for pans) the stove */
export function drawVessel(ctx: Ctx, v: string, c: Contents, t: number, u: number, ink: string, glassBg: string, opts: { boil?: number; swirl?: number; steep?: number; stove?: number; jig?: number; lid?: boolean } = {}) {
  const s = spec(v), path = new Path2D(s.d);
  ctx.save();
  if (opts.jig) ctx.translate(Math.sin(t * 60) * 1.3 * opts.jig, 0);
  ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.ellipse(120, 309, 88, 7, 0, 0, 7); ctx.fill();
  if (s.heat && opts.stove != null) drawStove(ctx, opts.stove, t, ink);
  if (v === 'blender') { ctx.fillStyle = '#4a3a33'; ctx.strokeStyle = ink; ctx.lineWidth = 2; rr(ctx, 76, 262, 88, 44, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = opts.jig ? '#e8a33d' : '#9a8a80'; ctx.beginPath(); ctx.arc(120, 284, 7, 0, 7); ctx.fill(); ctx.stroke(); }
  ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = glassBg; ctx.fill(path); ctx.globalAlpha = 0.08; ctx.fillStyle = s.heat ? '#7d8a94' : '#5a7f95'; ctx.fill(path); ctx.restore();
  drawContents(ctx, v, c, t, u, opts);
  if (v === 'blender' && (opts.swirl || 0) > 0.05) { // blades
    ctx.save(); ctx.translate(120, 252); ctx.rotate(t * 40); ctx.strokeStyle = '#cfd4d8'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke(); ctx.restore();
  }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = ink; ctx.globalAlpha = 0.75; ctx.lineWidth = s.heat ? 3.2 : 3; ctx.stroke(path); ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(40, 0, 200, 0); g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(0.25, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.15)'); ctx.fillStyle = g; ctx.fill(path);
  ctx.strokeStyle = ink; ctx.lineWidth = 3;
  if (v === 'pan') { ctx.save(); ctx.lineWidth = 7; ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(48, 240); ctx.lineTo(-12, 228); ctx.stroke(); ctx.lineWidth = 4.5; ctx.strokeStyle = '#8a5a36'; ctx.beginPath(); ctx.moveTo(30, 236); ctx.lineTo(-11, 228); ctx.stroke(); ctx.restore(); }
  if (v === 'pot') { for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(120 + sx * 60, 196); ctx.quadraticCurveTo(120 + sx * 78, 198, 120 + sx * 76, 214); ctx.lineTo(120 + sx * 61, 214); ctx.stroke(); } }
  if (v === 'jug') { ctx.beginPath(); ctx.moveTo(160, 182); ctx.bezierCurveTo(186, 180, 188, 240, 162, 246); ctx.lineWidth = 4; ctx.stroke(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(80, 164); ctx.lineTo(70, 158); ctx.lineTo(80, 174); ctx.stroke(); }
  if (v === 'blender') { ctx.fillStyle = '#6d5a50'; rr(ctx, 66, 102, 108, 11, 4); ctx.fill(); ctx.stroke(); rr(ctx, 110, 94, 20, 9, 3); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(170, 130); ctx.bezierCurveTo(194, 132, 192, 200, 162, 206); ctx.lineWidth = 4; ctx.stroke(); }
  if (v === 'teapot') { ctx.beginPath(); ctx.moveTo(68, 262); ctx.quadraticCurveTo(40, 258, 30, 222); ctx.lineTo(38, 220); ctx.quadraticCurveTo(48, 246, 70, 244); ctx.stroke(); ctx.beginPath(); ctx.moveTo(174, 232); ctx.bezierCurveTo(206, 228, 206, 284, 170, 282); ctx.lineWidth = 4; ctx.stroke(); if (opts.lid !== false) { ctx.lineWidth = 2.5; ctx.fillStyle = glassBg; ctx.beginPath(); ctx.ellipse(120, 211, 30, 6, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(120, 202, 5, 0, 7); ctx.fill(); ctx.stroke(); } }
  ctx.restore();
  drawSteam(ctx, v, Math.min(1, c.hot), t);
}

function ribbon(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, col: RGB, head: number, tail: number, t: number) {
  if (head <= tail + 0.01) return;
  ctx.save(); ctx.strokeStyle = css(col, 0.9); ctx.lineCap = 'round'; ctx.lineWidth = w;
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) { const s = lerp(tail, head, i / 16); const x = lerp(x0, x1, s) + Math.sin(s * 12 - t * 14) * 0.8 * s, y = y0 + (y1 - y0) * s * s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.stroke(); ctx.restore();
}

/** the source vessel, small and tilted, pouring into the centre one */
function drawPourer(ctx: Ctx, v: string, c: Contents, u: number, t: number, ink: string, glassBg: string, target: { x: number; y: number }) {
  const enter = easeIO(clamp(u / 0.25)), exit = easeIO(clamp((u - 0.8) / 0.2)), pose = enter * (1 - exit);
  const tilt = 1.15 * pose, x = lerp(330, 196, easeOut(pose)), y = lerp(-80, -20, easeOut(pose));
  const p = clamp((u - 0.25) / 0.55);
  ctx.save(); ctx.globalAlpha = clamp(pose * 1.6); ctx.translate(x, y); ctx.rotate(-tilt); ctx.scale(0.42, 0.42); ctx.translate(-120, -spec(v).top);
  drawVessel(ctx, v, { ...c, level: c.level * (1 - p * 0.9), hot: 0 }, t, u, ink, glassBg, {});
  ctx.restore();
  const lip = { x: x - 36 * Math.cos(tilt), y: y + 6 - 36 * Math.sin(tilt) * 0.2 };
  const head = easeOut(clamp((u - 0.24) / 0.1)), tail = easeIn(clamp((u - 0.76) / 0.08));
  ribbon(ctx, lip.x, lip.y, target.x, target.y, 6, c.color, head, tail, t);
}

function drawClock(ctx: Ctx, txt: string, u: number, ink: string, x = -8, y = -70) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(255,253,248,.92)'; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(14, 14, 14, 0, 7); ctx.fill(); ctx.stroke();
  const a = -Math.PI / 2 + u * Math.PI * 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(14 + Math.cos(a) * 10, 14 + Math.sin(a) * 10); ctx.stroke();
  ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(14 + Math.cos(a / 12) * 6, 14 + Math.sin(a / 12) * 6); ctx.stroke();
  ctx.font = '800 13px "DM Sans", system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const w = ctx.measureText(txt).width + 14; ctx.fillStyle = 'rgba(255,253,248,.92)'; rr(ctx, 32, 4, w, 20, 10); ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = ink; ctx.fillText(txt, 39, 15);
  ctx.restore();
}

function drawFridge(ctx: Ctx, open: number, u: number, ink: string, inner: () => void, t: number) {
  ctx.save();
  ctx.fillStyle = '#dfe7ec'; ctx.strokeStyle = ink; ctx.lineWidth = 3; rr(ctx, 22, -56, 196, 368, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f7fbfd'; rr(ctx, 32, -46, 176, 348, 8); ctx.fill();
  const glow = ctx.createRadialGradient(120, -30, 4, 120, -30, 220); glow.addColorStop(0, 'rgba(255,250,215,.55)'); glow.addColorStop(1, 'rgba(255,250,215,0)'); ctx.fillStyle = glow; ctx.fillRect(32, -46, 176, 348);
  ctx.strokeStyle = 'rgba(120,150,170,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(34, 60); ctx.lineTo(206, 60); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.translate(120, 304); ctx.scale(0.78, 0.78); ctx.translate(-120, -306); inner(); ctx.restore();
  // frost sparkle while closed
  const shut = 1 - open;
  if (shut > 0.02) {
    const w = 176 * shut;
    ctx.save(); ctx.fillStyle = '#e8eff3'; ctx.strokeStyle = ink; ctx.lineWidth = 3; rr(ctx, 32, -46, Math.max(6, w), 348, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b8c4cc'; rr(ctx, 32 + Math.max(6, w) - 16, 40, 7, 90, 3); ctx.fill();
    if (shut > 0.9) {
      ctx.strokeStyle = '#7fb7e0'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.translate(120, 170); ctx.rotate(t * 0.4);
      for (let k = 0; k < 6; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -26); ctx.moveTo(0, -16); ctx.lineTo(-7, -23); ctx.moveTo(0, -16); ctx.lineTo(7, -23); ctx.stroke(); }
    }
    ctx.restore();
  }
  void u;
}

function drawBoard(ctx: Ctx, things: Thing[], u: number, t: number, ink: string) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.ellipse(120, 309, 96, 7, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#c89562'; ctx.strokeStyle = ink; ctx.lineWidth = 2.5; rr(ctx, 26, 284, 188, 20, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b07f50'; rr(ctx, 196, 290, 10, 6, 3); ctx.fill();
  const col = things.length ? things[0].color : [242, 201, 76];
  const leafy = things.length && things[0].type === 'bits' && col[1] > col[0];
  const cuts = Math.floor(clamp((u - 0.15) / 0.7) * 7);
  // the item: a row of slices that grows as the knife works right to left
  for (let k = 0; k < 8; k++) {
    const x = 60 + k * 15, sliced = 7 - k < cuts, dx = sliced ? (7 - k) * 2.2 : 0;
    ctx.fillStyle = css(col); ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
    if (leafy) { ctx.save(); ctx.translate(x + dx, 276); ctx.rotate(-0.4 + k * 0.1); ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.2, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
    else { ctx.beginPath(); ctx.ellipse(x + dx, 268 + Math.abs(k - 3.5) * 1.5, 7, 16 - Math.abs(k - 3.5) * 2.4, 0, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  // knife
  const kx = lerp(184, 76, clamp((u - 0.15) / 0.7)), chop = Math.abs(Math.sin(u * Math.PI * 7)), ky = 284 - 34 * chop;
  const pose = easeIO(clamp(u / 0.12)) * (1 - easeIO(clamp((u - 0.9) / 0.1)));
  ctx.globalAlpha = pose; ctx.translate(kx + 10, ky - (1 - pose) * 60); ctx.rotate(-0.12);
  ctx.fillStyle = '#e6e9ec'; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -40); ctx.lineTo(14, -40); ctx.quadraticCurveTo(14, -8, 0, 0); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#4a3a33'; rr(ctx, 1, -66, 11, 26, 3); ctx.fill(); ctx.stroke();
  ctx.restore();
  void t;
}

/** draw the kitchen for one step; `slide` moves the whole scene (used for the hand-over to the glass) */
export function drawKitchen(ctx: Ctx, st: KStep, u: number, t: number, ink: string, glassBg: string, prev?: KStep) {
  const k = st.kit, act = k.act;
  if (act === 'cut') { drawBoard(ctx, k.adds, u, t, ink); return; }
  const c = contentsAt(k, u), s = spec(k.vessel);
  const surfY = s.bot - c.level * (s.bot - s.top);
  const stove = s.heat ? c.hot : undefined;
  const slideIn = !k.from && prev && prev.kit.vessel !== k.vessel && act !== 'serve' ? (1 - easeOut(clamp(u / 0.22))) * 230 : 0;
  ctx.save(); ctx.translate(slideIn, 0);
  const opts: { boil?: number; swirl?: number; steep?: number; stove?: number; jig?: number } = { stove };
  if (act === 'boil') opts.boil = 1.2;
  if (act === 'heat' && c.hot > 0.5 && /simmer|bubbl/.test(st.label.toLowerCase())) opts.boil = 0.5;
  if (act === 'blend') { const b = clamp((u - (k.from ? 0.5 : 0.18)) / 0.1) * (1 - clamp((u - 0.92) / 0.08)); opts.swirl = b; opts.jig = b; }
  if (act === 'stir' || act === 'whisk') opts.swirl = Math.sin(Math.PI * clamp((u - 0.15) / 0.75)) * 0.8;
  if (act === 'steep') opts.steep = easeIO(clamp((u - 0.15) / 0.7));
  if (act === 'cool') { (c as Contents).hot = 1 - clamp(u / 0.8); }

  if (act === 'chill') {
    const open = 1 - easeIO(clamp((u - 0.12) / 0.18)) + easeIO(clamp((u - 0.72) / 0.18));
    drawFridge(ctx, clamp(open), u, ink, () => drawVessel(ctx, k.vessel, c, t, u, ink, glassBg, {}), t);
  } else if (act === 'strain' && k.src) {
    // centre: the receiving vessel with a sieve on its rim; the batch pours in from the top right
    const src = k.src, inP = clamp((u - 0.25) / 0.55);
    const recv = { ...c, level: lerp(k.before.level, k.after.level, easeIO(inP)), bits: [], pulp: 0 };
    drawVessel(ctx, k.vessel, recv, t, u, ink, glassBg, {});
    const sy = s.top - 12;
    ctx.save(); ctx.fillStyle = 'rgba(200,200,200,.35)'; ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(62, sy); ctx.quadraticCurveTo(120, sy + 46, 178, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(80,80,80,.35)'; ctx.lineWidth = 0.8; for (let x = 70; x < 178; x += 6) { ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(120 + (x - 120) * 0.4, sy + 22); ctx.stroke(); }
    ctx.lineWidth = 4; ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(178, sy); ctx.lineTo(214, sy - 6); ctx.stroke();
    // solids caught in the sieve
    const caught = src.bits.length ? src.bits : src.pulp > 0.1 ? [src.color.map(x => x * 0.7)] : [];
    const nc = Math.round(Math.min(18, caught.length ? 18 : 0) * clamp((u - 0.3) / 0.5));
    for (let j = 0; j < nc; j++) { ctx.fillStyle = css(caught[j % caught.length]); ctx.beginPath(); ctx.ellipse(96 + hash(j) * 48, sy + 6 + hash(j + 5) * 12, 3, 1.8, j, 0, 7); ctx.fill(); }
    // drips under the sieve
    if (inP > 0 && inP < 1) { ctx.fillStyle = css(src.color, 0.9); for (let j = 0; j < 4; j++) { const ph = (t * 2.2 + j * 0.25) % 1; ctx.beginPath(); ctx.arc(116 + j * 3, lerp(sy + 24, Math.max(sy + 26, s.bot - k.after.level * (s.bot - s.top)), ph), 1.8, 0, 7); ctx.fill(); } }
    ctx.restore();
    drawPourer(ctx, k.from || 'bowl', src, u, t, ink, glassBg, { x: 128, y: sy + 6 });
  } else {
    drawVessel(ctx, k.vessel, c, t, u, ink, glassBg, opts);
    if (k.from && k.src) drawPourer(ctx, k.from, k.src, act === 'blend' ? clamp(u / 0.5) : u, t, ink, glassBg, { x: 122, y: surfY });
    // things going in
    const adds = act === 'pour' && k.from ? [] : k.adds;
    const n = adds.length;
    adds.forEach((th, j) => {
      const d0 = 0.12 + (n > 1 ? (j / n) * 0.5 : 0), win = 0.32;
      if (th.type === 'bits' || th.type === 'ice') {
        for (let p = 0; p < (th.type === 'ice' ? 3 : 5); p++) {
          const q = (u - d0 - p * 0.035) / win; if (q <= 0 || q >= 1) continue;
          const x = 120 + (p - 2) * 16 + (j % 3 - 1) * 8, y = lerp(-60, surfY - 2, easeIn(q));
          ctx.save(); ctx.translate(x, y); ctx.rotate(q * 4 + p);
          if (th.type === 'ice') { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.strokeStyle = 'rgba(150,200,230,.9)'; ctx.lineWidth = 1.4; rr(ctx, -9, -9, 18, 18, 4); ctx.fill(); ctx.stroke(); }
          else { ctx.fillStyle = css(th.color); ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 2, 0, 0, 7); ctx.fill(); }
          ctx.restore();
        }
      } else if (th.type === 'powder') {
        const q = (u - d0) / (win + 0.1); if (q <= 0 || q >= 1) return;
        const pose = Math.sin(Math.PI * q);
        ctx.save(); ctx.translate(150 + j * 4, -10); ctx.rotate(-0.9 * pose); ctx.globalAlpha = clamp(pose * 2);
        ctx.fillStyle = '#d6d6d6'; ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 0, 13, 5.5, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(12, -1); ctx.lineTo(60, -14); ctx.stroke(); ctx.restore();
        ctx.fillStyle = th.op > 0 ? css(th.color) : 'rgba(255,255,255,.95)';
        for (let p = 0; p < 14; p++) { const ph = (q * 2.4 + hash(p + j * 20)) % 1; if (q < 0.25) continue; ctx.beginPath(); ctx.arc(140 + hash(p + 3) * 14, lerp(-4, surfY, ph), 1.3, 0, 7); ctx.fill(); }
      } else {
        // a measuring cup pours it in
        const q = clamp((u - d0) / (win + 0.25)); if (q <= 0 || q >= 1) return;
        const pose = easeIO(clamp(q / 0.25)) * (1 - easeIO(clamp((q - 0.8) / 0.2)));
        const x = lerp(300, 178, easeOut(pose)), y = lerp(-90, -40, easeOut(pose)), tilt = 1.2 * pose;
        ctx.save(); ctx.globalAlpha = clamp(pose * 1.8); ctx.translate(x, y); ctx.rotate(-tilt);
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(0, 0); ctx.lineTo(34, 0); ctx.lineTo(32, 36); ctx.lineTo(2, 36); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.clip(); ctx.rotate(tilt); ctx.fillStyle = css(th.color, Math.max(0.5, th.op)); ctx.fillRect(-40, 8 + q * 20, 90, 60); ctx.restore(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(34, 6); ctx.bezierCurveTo(48, 6, 48, 28, 33, 28); ctx.stroke(); ctx.restore();
        const head = easeOut(clamp((q - 0.22) / 0.1)), tail = easeIn(clamp((q - 0.76) / 0.08));
        ribbon(ctx, x - 6, y + 2, 122, surfY, 5, mixc(th.color, [255, 255, 255], th.op < 0.3 ? 0.2 : 0), head, tail, t);
      }
    });
    // tools
    const pose = easeIO(clamp(u / 0.15)) * (1 - easeIO(clamp((u - 0.88) / 0.12)));
    if (act === 'stir' || act === 'whisk' || act === 'taste') {
      const a = t * (act === 'whisk' ? 16 : 8), dip = act === 'taste' ? Math.sin(Math.PI * clamp((u - 0.2) / 0.6)) : 1;
      const bx = 120 + Math.cos(a) * 22 * pose * (act === 'taste' ? 0 : 1), by = lerp(s.top - 40, Math.min(s.bot - 10, surfY + 16), dip * pose);
      const tx = 150 + (1 - pose) * 70, ty = s.top - 90 - (1 - pose) * 40;
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = act === 'whisk' ? '#c9c9c9' : '#d9d9d9'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke();
      if (act === 'whisk') { ctx.strokeStyle = '#b9b9b9'; ctx.lineWidth = 1.5; for (const w of [4, 8]) { ctx.beginPath(); ctx.ellipse(bx, by + 6, w, 11, Math.cos(a) * 0.3, 0, 7); ctx.stroke(); } }
      else { ctx.fillStyle = '#d9d9d9'; ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(bx, by + 3, 8, 4, 0.3, 0, 7); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    if (act === 'muddle' || act === 'roast') {
      const stroke = Math.sin(u * Math.PI * 6 - 1.2) * 0.5 + 0.5;
      ctx.save();
      if (act === 'muddle') { const y = lerp(s.top - 70, s.bot - 14, stroke) - (1 - pose) * 90; ctx.translate(120, y); ctx.fillStyle = '#b8794a'; ctx.strokeStyle = ink; ctx.lineWidth = 1.6; rr(ctx, -5, -110, 10, 110, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#d8975f'; rr(ctx, -12, -2, 24, 16, 4); ctx.fill(); ctx.stroke(); }
      else { ctx.translate(150, s.top - 30 - (1 - pose) * 60); ctx.rotate(-0.6 + Math.sin(t * 9) * 0.15); ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(60, -50); ctx.stroke(); ctx.fillStyle = '#b8794a'; ctx.beginPath(); ctx.ellipse(-4, 4, 10, 5, 0.6, 0, 7); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    if (act === 'squeeze') {
      const q = clamp((u - 0.1) / 0.8), sq = Math.sin(q * Math.PI * 4) * 0.5 + 0.5;
      ctx.save(); ctx.globalAlpha = pose; ctx.translate(120, s.top - 50); ctx.scale(1 + 0.15 * sq, 1 - 0.25 * sq);
      ctx.fillStyle = '#F6E05E'; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 22, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#FFF3A6'; ctx.beginPath(); ctx.arc(0, 0, 17, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = 'rgba(246,224,94,.9)'; for (let p = 0; p < 6; p++) { const ph = (t * 1.8 + p / 6) % 1; if (q <= 0 || q >= 1) break; ctx.beginPath(); ctx.arc(112 + p * 3, lerp(s.top - 44, surfY, ph), 1.8, 0, 7); ctx.fill(); }
    }
    if (act === 'steep' && c.bits.length) { // tea bag string and tag
      ctx.save(); ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(150, surfY + 6); ctx.quadraticCurveTo(170, s.top - 20, 182, s.top - 34); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = '#f2e6c9'; rr(ctx, 176, s.top - 48, 18, 14, 2); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }
  ctx.restore();
  // a timer for anything that takes real time
  const timer = k.timer || (act === 'chill' ? (/serv/i.test(st.label) ? 'until serving' : 'until cold') : act === 'cool' ? 'cool down' : '');
  if (timer && act !== 'serve') { const a = easeOut(clamp(u / 0.15)) * (1 - easeIn(clamp((u - 0.92) / 0.08))); ctx.save(); ctx.globalAlpha = a; drawClock(ctx, timer, u, ink); ctx.restore(); }
}
