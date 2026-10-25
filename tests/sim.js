// Random AI-vs-AI battles to shake out engine crashes.
const PW = require('./load');
const { Dex, Mon, Battle, U } = PW;
const all = Object.keys(PW_DATA.pokemon).map(Number).filter(id => !PW_DATA.pokemon[id].mega && !PW_DATA.pokemon[id].bo);
let errors = 0, turns = 0, battles = +(process.argv[2] || 300);
for (let n = 0; n < battles; n++) {
  const mk = () => Array.from({ length: U.int(1, 6) }, () => {
    const m = Mon.create({ pid: U.pick(all), level: U.int(5, 100) });
    if (U.chance(0.4)) m.item = U.pick(Object.keys(PW_DATA.items).map(Number).filter(i => PW.Items.pocketOf(i) === 'held' || PW.Items.pocketOf(i) === 'berries'));
    return m;
  });
  const b = new Battle({ kind: U.chance(0.3) ? 'wild' : 'trainer', player: { name: 'Ash', team: mk(), flags: { mega: true, z: true, dyna: U.chance(0.2), tera: U.chance(0.3) } },
    foe: { name: 'Rival', team: mk(), ai: U.pick(['trainer', 'gym', 'elite']), flags: { mega: true, z: true, tera: true, dyna: true } }, env: {} });
  try {
    b.start();
    let guard = 0;
    while (!b.over && guard++ < 400) {
      if (b.needSwitch) {
        const idx = b.sides[0].team.findIndex((m, i) => m.hp > 0 && i !== b.sides[0].activeIdx);
        b.choosePlayerSwitch(idx >= 0 ? idx : b.sides[0].team.findIndex(m => m.hp > 0));
        continue;
      }
      const act = PW.AI.choose(b, b.sides[0]);
      if (act.type === 'item') { act.type = 'move'; act.index = 0; }
      b.turnPlayer(act);
      turns++;
    }
  } catch (e) {
    errors++;
    if (errors < 8) console.log('ERROR', e.stack.split('\n').slice(0, 4).join('\n'));
  }
}
console.log('battles', battles, 'turns', turns, 'errors', errors);
