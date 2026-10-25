// Lists the sprites and cries the game can ask for, for tools/build_bundle.py.
// Usage: node tools/bundle_needs.js > needs.json
const fs = require('fs');
const path = require('path');
require('../tests/load_game.js');
const PW = globalThis.PW;
const D = globalThis.PW_DATA;
const root = path.join(__dirname, '..');

const pokemon = Object.keys(D.pokemon).map(Number).sort((a, b) => a - b);
const cries = [...new Set(pokemon.map(pid => (pid > 10000 ? pid : D.pokemon[pid].s)))].sort((a, b) => a - b);

const items = new Set(Object.values(D.items).map(it => it.k));
for (const k of [...items]) if (/-z$/.test(k)) items.add(k + '--held');
for (const t of D.core.types) items.add('tm-' + (t.k || t));
items.add('tm-normal');
items.add('poke-ball');

// Trainer sprites: every short lowercase string in the world data that is not another kind of key,
// plus the sprite literals in the game code. build_bundle.py keeps the ones Showdown actually has.
const other = new Set([
  ...Object.values(D.pokemon).map(p => p.k), ...Object.values(D.species).map(s => s.k),
  ...Object.values(D.items).map(i => i.k), ...Object.values(D.moves).map(m => m.k),
  ...Object.values(D.abilities).map(a => a.k), ...D.core.types,
]);
for (const r of PW.World.regions()) { other.add(r.id); other.add(r.enc); for (const l of r.locs || []) other.add(l.id); }
const trainers = new Set();
const consider = s => { if (/^[a-z][a-z0-9-]{1,23}$/.test(s) && !other.has(s) && !/^coins-/.test(s)) trainers.add(s); };
(function walk(o) {
  if (Array.isArray(o)) o.forEach(walk);
  else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  else if (typeof o === 'string') consider(o);
})(D.world);
for (const c of Object.values(PW.World.CLASSES)) consider(c[1]);
for (const s of Object.values(PW.World.FEMALE_VARIANT)) consider(s);
for (const dir of ['js/game', 'js/ui']) {
  for (const f of fs.readdirSync(path.join(root, dir))) {
    const src = fs.readFileSync(path.join(root, dir, f), 'utf8');
    for (const m of src.matchAll(/(?:trainer|sprite|trainerImg\()\s*:?\s*'([a-z0-9-]+)'/g)) consider(m[1]);
    for (const m of src.matchAll(/\[\s*'([a-z0-9-]+)'\s*,\s*'[MF]'\s*\]/g)) consider(m[1]);
  }
}
trainers.add('youngster');

process.stdout.write(JSON.stringify({ pokemon, cries, items: [...items].sort(), trainers: [...trainers].sort() }));
