import { createEngine } from './engine.js';

export type Ingredient = {
  id: string; name: string; category: 'base' | 'fizz' | 'acid' | 'sweetener' | 'accent';
  color_hex: string; opacity: number; density: number; flavor_vector: number[];
  sugar_g_per_100ml: number; flags: string[]; clashes_with: string[]; piece_ml: number;
  substitutes: { id: string; note: string }[];
};
export type Drink = {
  id: string; name: string; section: string; section_label: string; glass: string; build: string; temp: string;
  ingredients: { id: string; amount: number; unit: string; ml_equiv: number }[];
  core_ingredients: string[]; steps: string[]; garnish: string;
  season: string[]; mood: string[]; vibe: string[]; flavor_vector: number[]; color_hex: string;
  layers: { id: string; ml: number; color_hex: string; opacity: number; density: number }[];
  volume_ml: number; carbonated: boolean; warnings: string[]; source: string;
  diet: { dairy_free: boolean; caffeine_free: boolean; vegan: boolean; nut_free: boolean; low_sugar: boolean; spicy: boolean; sugar_g_est: number };
  hand: boolean; sub: string; extras: string[];
};
export type Taxonomy = { flavor_axes: string[]; sections: Record<string, string>; seasons: string[]; moods: string[]; vibes: string[] };

export type Lab = {
  engine: any; order: any; ingredients: Ingredient[]; ingById: Record<string, Ingredient>; drinks: Drink[]; drinkById: Record<string, Drink>; tax: Taxonomy;
};

export async function loadLab(): Promise<Lab> {
  const base = import.meta.env.BASE_URL + 'data/';
  const [ingredients, drinks, tax, model, order] = await Promise.all(
    ['ingredients', 'drinks', 'taxonomy', 'model', 'order'].map(f => fetch(base + f + '.json').then(r => r.json())),
  );
  const engine = createEngine({ ingredients, drinks, model });
  return {
    engine, order, ingredients, drinks, tax,
    ingById: Object.fromEntries(ingredients.map((i: Ingredient) => [i.id, i])),
    drinkById: Object.fromEntries(drinks.map((d: Drink) => [d.id, d])),
  };
}
