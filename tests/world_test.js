// Headless play-through: every region, location, special event, gym and league.
const PW = require('./load_game');
const { Dex, Mon, U, Game, World, Explore, Flow } = PW;
let errors = 0, battles = 0, scenes = 0;
const fail = (ctx, e) => { errors++; if (errors <= 25) console.log('ERROR [' + ctx + ']', e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e); };

function runBattle(spec, ctx) {
  const b = Flow.createBattle(spec);
  b.start();
  if (spec.foe.raid) Flow.setupRaid(b);
  let g = 0;
  while (!b.over && g++ < 300) {
    if (b.needSwitch) { const i = b.sides[0].team.findIndex((m, j) => m.hp > 0 && !m.egg && j !== b.sides[0].activeIdx); b.choosePlayerSwitch(i >= 0 ? i : b.sides[0].team.findIndex(m => m.hp > 0)); continue; }
    let a = PW.AI.choose(b, b.sides[0]);
    if (a.type === 'item' || a.type === 'switch') a = { type: 'move', index: 0 };
    if (spec.kind === 'wild' && U.chance(0.3) && b.sides[1].active && b.sides[1].active.hpFrac() < 0.5) a = { type: 'ball', item: Dex.itemByKey('ultra-ball') };
    b.turnPlayer(a);
  }
  battles++;
  const out = Flow.endBattle(b, spec);
  for (const t of out.tasks) {
    const m = Game.findMon(t.uid);
    if (!m) continue;
    if (t.type === 'evolve') Flow.doEvolve(m, t.row);
    if (t.type === 'learn') for (const mid of t.moves) if (m.moves.length < 4) Mon.learnMove(m, mid); else Mon.learnMove(m, mid, 0);
  }
  return spec.onEnd ? spec.onEnd(b.result, b) : null;
}
function playScene(sc, ctx, depth) {
  depth = depth || 0;
  while (sc && depth++ < 20) {
    scenes++;
    if (sc.battle) { sc = runBattle(sc.battle, ctx); continue; }
    if (sc.ui) return;
    const ch = (sc.choices || []).filter(c => c.label !== 'Nie teraz' && c.label !== 'Wyjdź');
    sc = ch.length ? U.pick(ch).run() : null;
  }
}
function strongTeam(lvl) {
  const s = Game.s;
  s.party.length = 0;
  for (const k of ['garchomp', 'metagross', 'gyarados', 'tyranitar', 'salamence', 'dragonite']) {
    const m = Mon.create({ pid: Dex.monByKey(k), level: lvl, ot: s.player.name });
    m.moves = World.bestMoves(m.pid, 100).map(id => ({ id, pp: Dex.move(id).pp, up: 3 }));
    s.party.push(m);
  }
}

for (const reg of World.regions()) {
  try {
    Game.newGame({ name: 'Test', gender: 'M', avatar: 'red', region: reg.id, starter: reg.starters[0] });
    Game.s.settings.ap = false;
    Game.addItem(Dex.itemByKey('ultra-ball'), 999, true);
    Game.addItem(Dex.itemByKey('mega-ring'), 1, true); Game.addItem(Dex.itemByKey('z-ring'), 1, true);
    Game.addItem(Dex.itemByKey('old-rod'), 1, true); Game.addItem(Dex.itemByKey('good-rod'), 1, true); Game.addItem(Dex.itemByKey('super-rod'), 1, true);
    Flow.travel(reg.id, Game.s.loc);
  } catch (e) { fail(reg.id + ' newGame', e); continue; }
  // Locations, before badges
  const r = Game.reg(reg.id);
  for (let gi = 0; gi < reg.gyms.length; gi++) {
    strongTeam(Math.min(100, 30 + gi * 8));
    for (const loc of reg.locs.filter(l => l.r === gi || (gi === 0 && l.r === 0))) {
      try {
        Flow.travel(reg.id, loc.id);
        Game.healParty();
        for (let i = 0; i < 12; i++) {
          for (const a of Explore.actions(reg.id, loc)) {
            if (a.ok === false) continue;
            const sc = Explore.run(reg.id, loc, a.id === 'explore' ? 'walk' : a.id);
            playScene(sc, reg.id + '/' + loc.id);
            Game.healParty();
          }
        }
        for (const sp of Explore.special(reg.id, loc)) { if (!sp.locked && sp.run) { const sc = sp.run(); playScene(sc, reg.id + '/' + loc.id + ' special ' + sp.key); Game.healParty(); } }
      } catch (e) { fail(reg.id + '/' + loc.id, e); }
    }
    // Gym
    try {
      const g = reg.gyms[gi];
      Flow.travel(reg.id, g.loc);
      let guard = 0;
      while (!r.badges.includes(gi) && guard++ < 8) { Game.healParty(); playScene(Flow.gymScene(reg.id, gi), reg.id + ' gym ' + gi); }
      if (!r.badges.includes(gi)) console.log('WARN no badge', reg.id, gi, g.leader);
    } catch (e) { fail(reg.id + ' gym ' + gi, e); r.badges.push(gi); }
  }
  // League
  try {
    strongTeam(100);
    Flow.travel(reg.id, reg.league);
    let guard = 0;
    while (!r.champion && guard++ < 6) { Game.healParty(); Game.s.league = null; let sc = Flow.leagueScene(reg.id); let d = 0; while (sc && d++ < 12) { if (sc.battle) { sc = runBattle(sc.battle, 'league'); continue; } const ch = (sc.choices || []); sc = ch.length ? ch[0].run() : null; } }
    if (!r.champion) console.log('WARN not champion', reg.id);
  } catch (e) { fail(reg.id + ' league', e); }
  // Postgame locations
  for (const loc of reg.locs.filter(l => l.r >= 99)) {
    try {
      Flow.travel(reg.id, loc.id);
      for (let i = 0; i < 6; i++) { Game.healParty(); playScene(Explore.run(reg.id, loc, 'walk'), reg.id + '/' + loc.id); }
      for (const sp of Explore.special(reg.id, loc)) { if (!sp.locked && sp.run) { Game.healParty(); playScene(sp.run(), reg.id + '/' + loc.id + ' special'); } }
    } catch (e) { fail(reg.id + '/' + loc.id + ' post', e); }
  }
  for (const t of reg.extra || []) { try { Game.healParty(); playScene(Flow.extraTrainerScene(reg.id, t), 'extra'); } catch (e) { fail('extra ' + t.name, e); } }
  console.log(reg.id, 'done; badges', r.badges.length, 'champion', r.champion, 'caught', Game.s.stats.caught, 'battles', battles);
}
console.log('battles', battles, 'scenes', scenes, 'errors', errors);
