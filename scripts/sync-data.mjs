// Copies the compiled dataset + trained model from the data workspace into public/data.
// Usage: npm run data -- /path/to/zero-proof-lab
import { cpSync } from 'node:fs';
import { join } from 'node:path';
const src = process.argv[2] || '../zero-proof-lab';
for (const f of ['drinks', 'ingredients', 'taxonomy']) cpSync(join(src, 'data', f + '.json'), join('public/data', f + '.json'));
cpSync(join(src, 'model/model.json'), 'public/data/model.json');
console.log('synced from', src);
