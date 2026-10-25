// Loads game data and engine modules into the Node global scope for tests.
const path = require('path');
const root = path.join(__dirname, '..');
const files = [
  'js/data/core.js', 'js/data/abilities.js', 'js/data/items.js', 'js/data/moves.js', 'js/data/species.js',
  'js/data/pokemon.js', 'js/data/learnsets.js', 'js/data/dextext.js', 'js/data/world.js',
  'js/core/util.js', 'js/core/dex.js', 'js/core/pokemon.js', 'js/core/battle_data.js', 'js/core/battle.js',
  'js/core/ai.js', 'js/core/catch.js', 'js/game/items.js',
];
for (const f of files) require(path.join(root, f));
module.exports = globalThis.PW;
