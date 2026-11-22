# Zero-Proof Mixology Lab

Tap what's in your kitchen, watch an animated glass fill, and get non-alcoholic drinks you can make right now. Built for an Indian audience first: chai, shikanji, lassi, sharbats and cold coffees sit alongside mocktails and cold brew tonics.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

## How it works

- `public/data/` holds the dataset (629 drinks, 152 ingredients), the trained suggestion model (`model.json`) and the learned pour order (`order.json`). Everything runs in the browser, no backend.
- `src/lib/engine.js` is the engine: pantry matching with substitutions, "1 ingredient away", chemistry warnings (acid curdles milk), Custom Lab 2:1:1 balancing, season/mood/vibe ranking and next-ingredient suggestions.
- `src/lib/sequencer.js` works out **how to build any drink** from its ingredients: each ingredient gets a role (syrup, juice, milk, tea, coffee, powder, fizz...), layered drinks are ordered by density (heaviest first, hot espresso floats), light syrups stir into the base, matcha and cocoa are whisked into a slurry, ice goes in before floats and fizz, and everything else follows the order learned from the recipes (`order.json`). No drink has a hand-made animation.
- `src/lib/pour.ts` is the animator. It plays the sequencer's step list on a canvas: a vessel slides in, tilts, the stream arcs into the glass, the surface ripples, ice drops with a splash and bob, floats slide off a spoon, fizz foams, stir swirls and blends colour, muddle, shake, blend, whisk, scoop, dust, garnish, steam. Most of the frame is a pure function of time, so replay, pause and scrubbing are exact. Respects `prefers-reduced-motion`.
- `src/components/PourGlass.tsx` wraps the player with a caption, play/pause, speed and a scrubber with step ticks. The live pantry glass uses the same player at 2.4x.
- `src/components/Stage.tsx` is the live glass and the Pour Guide (ml or cups and spoons, generated pour order, recipe method, flavor radar, swaps, PNG share card). Deep link to a drink with `#drink=<id>`.

## Updating the drinks

The data is compiled by scripts in the data workspace (`zero-proof-lab`):

```bash
node src/import/convert.js && node src/build-data.js && node src/tag-imported.js \
  && node src/build-data.js && node src/train.js && node src/train-order.js
```

Copy the output (data, models, and the ESM engine/sequencer) here with:

```bash
npm run data -- /path/to/zero-proof-lab
```
