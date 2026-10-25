// Saves from older versions must still load: migrate() fills in fields added later.
const PW = require('./load_game');
const { Dex, Game } = PW;
let errors = 0;
const check = (ok, what) => { if (!ok) { errors++; console.log('FAIL', what); } };

Game.newGame({ name: 'Ola', gender: 'F', avatar: 'dawn', region: 'kanto', starter: Dex.monByKey('bulbasaur') });
const old = JSON.parse(Game.exportSave());
// Fields that older saves did not have, and ones they had that are gone now.
delete old.player.tid;
for (const m of old.party) delete m.tid;
delete old.research; delete old.hunt; delete old.gift; delete old.lottery;
old.unlocked = ['kanto'];
localStorage.setItem('pokewedrowka.save.v1', JSON.stringify(old));
Game.s = null;
const s = Game.load();
check(!!s, 'old save loads (' + Game.loadError + ')');
if (s) {
  check(s.player.tid !== undefined, 'player gets a trainer ID');
  check(s.party.every(m => m.tid === s.player.tid), 'own Pokémon get the player ID');
  check(s.unlocked === undefined, 'region lock removed');
}
// A broken save reports why instead of failing silently.
localStorage.setItem('pokewedrowka.save.v1', '{"player":');
Game.s = null;
const origError = console.error;
console.error = () => {};
check(!Game.load() && !!Game.loadError, 'broken save reports an error');
console.error = origError;
console.log('save tests', errors ? 'FAILED: ' + errors : 'ok');
process.exitCode = errors ? 1 : 0;
