# Zero-Proof Mixology Lab

Tap what's in your kitchen, watch an animated glass fill, and get non-alcoholic drinks you can make right now. Built for an Indian audience first: chai, shikanji, lassi, sharbats and cold coffees sit alongside mocktails and cold brew tonics.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

## How it works

- `public/data/` holds the dataset (186 drinks, 100 ingredients) and the trained suggestion model. Everything runs in the browser, no backend.
- `src/lib/engine.js` is the engine: pantry matching with substitutions, "1 ingredient away", chemistry warnings (acid curdles milk), Custom Lab 2:1:1 balancing, season/mood/vibe ranking and next-ingredient suggestions.
- `src/components/Glass.tsx` is the animated SVG glass. Layers sink by ingredient density, color blends on stir, fizz makes bubbles, ice drops, garnish snaps on.
- `src/components/Stage.tsx` is the live glass and the Pour Guide (ml or cups and spoons, build order, flavor radar, swaps, PNG share card).

## Updating the drinks

The data is compiled by scripts in the data workspace (`zero-proof-lab`: `node src/build-data.js && node src/train.js`). Copy the output here with:

```bash
npm run data -- /path/to/zero-proof-lab
```
