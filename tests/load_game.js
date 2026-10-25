// Loads engine + game layer (no DOM) for headless tests.
globalThis.localStorage = globalThis.localStorage || { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const path = require('path');
const root = path.join(__dirname, '..');
require('./load');
for (const f of ['js/game/state.js', 'js/game/world.js', 'js/game/quiz.js', 'js/game/breeding.js', 'js/game/quests.js',
  'js/game/story.js', 'js/game/events.js', 'js/game/flow.js']) require(path.join(root, f));
module.exports = globalThis.PW;
