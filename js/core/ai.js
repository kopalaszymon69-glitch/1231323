/* Opponent AI: wild Pokémon pick moves at random, trainers score moves by expected damage and situation. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;

  const HEAL_ITEMS = ['full-restore', 'max-potion', 'hyper-potion', 'super-potion', 'potion'];

  function usableMoves(battle, bt) {
    const out = [];
    bt.mon.moves.forEach((slot, i) => {
      const mv = Dex.move(slot.id);
      if (!mv || slot.pp <= 0) return;
      if (bt.v.disabled && bt.v.disabled.move === slot.id) return;
      if (bt.v.taunt && mv.c === 0) return;
      if (bt.itemKey === 'assault-vest' && mv.c === 0) return;
      if (bt.v.choiceLock !== undefined && bt.v.choiceLock !== slot.id && bt.mon.moves.some(x => x.id === bt.v.choiceLock && x.pp > 0)) return;
      if (bt.v.encore && bt.v.encore.move !== slot.id) return;
      out.push({ i, mv, slot });
    });
    return out;
  }

  function estimate(battle, bt, target, mv) {
    if (mv.c === 0) return 0;
    const moveT = battle.moveType(bt, mv);
    const eff = battle.typeEffect(bt, target, mv, moveT);
    if (eff === 0) return 0;
    const fixed = ['seismic-toss', 'night-shade'].includes(mv.k) ? bt.mon.lvl
      : ['super-fang', 'natures-madness', 'ruination'].includes(mv.k) ? Math.floor(target.hp / 2)
        : ['dragon-rage'].includes(mv.k) ? 40 : ['sonic-boom'].includes(mv.k) ? 20 : null;
    if (fixed !== null) return fixed;
    if (mv.m && mv.m[0] === 9) return target.mon.lvl > bt.mon.lvl ? 0 : target.hp * 0.3;
    if (['counter', 'mirror-coat', 'metal-burst', 'endeavor', 'final-gambit', 'bide', 'comeuppance'].includes(mv.k)) return target.hp * 0.15;
    const res = battle.calcDamage(bt, target, mv, { noRandom: true, avgRandom: true, preview: true, noBerry: true, moveType: moveT });
    let d = res.damage;
    if (mv.m && mv.m[3] > 1) d *= mv.m[2] === mv.m[3] ? mv.m[2] : 3;
    if (battle.constructor && BD_CHARGE(mv.k) && battle.weather() !== 'sun') d *= 0.55;
    if (['hyper-beam', 'giga-impact'].includes(mv.k)) d *= 0.75;
    if (['self-destruct', 'explosion', 'memento', 'final-gambit'].includes(mv.k)) d *= bt.hpFrac() < 0.3 ? 1 : 0.2;
    if (mv.k === 'dream-eater' && target.mon.st !== 'slp') d = 0;
    if (['fake-out', 'first-impression'].includes(mv.k) && bt.turnsIn > 0) d = 0;
    if (mv.k === 'focus-punch') d *= 0.5;
    if (['sucker-punch'].includes(mv.k)) d *= 0.7;
    return d;
  }
  function BD_CHARGE(k) { return !!PW.BD.SETS.charge[k] && !['solar-beam', 'solar-blade'].includes(k) || ['solar-beam', 'solar-blade'].includes(k); }

  function statusScore(battle, bt, target, mv) {
    const k = mv.k, m = mv.m || [0, 0];
    const cat = m[0];
    const st = target.mon.st;
    if (['splash', 'celebrate', 'hold-hands', 'teleport'].includes(k)) return battle.kind === 'wild' ? 5 : 0;
    if (PW.BD.SETS.protect.includes(k)) return bt.v.protectChain ? 0 : 12;
    if ((m[1] >= 1 && m[1] <= 5) && cat === 1) {
      if (st || target.v.sub || battle.statusImmuneByType(target, mv)) return 0;
      if (m[1] === 2) return 65;
      if (m[1] === 1) return battle.speed(target) > battle.speed(bt) ? 55 : 35;
      if (m[1] === 4) return target.rawStat(1) > target.rawStat(3) ? 55 : 25;
      return 45;
    }
    if (m[1] === 6 && cat === 1) return target.v.confusion ? 0 : 30;
    if (m[1] === 18) return target.v.leechSeed || target.hasType('grass') ? 0 : 40;
    if (m[1] === 14) return st || target.v.yawn ? 0 : 40;
    if (cat === 2 && mv.sc) {
      const self = ['user', 'users-field', 'user-and-allies'].includes(mv.tg);
      const who = self ? bt : target;
      const sum = mv.sc.reduce((a, [s, c]) => a + c, 0);
      if (self) {
        const cur = mv.sc.reduce((a, [s]) => a + who.stages[s - 1], 0) / mv.sc.length;
        if (cur >= 2) return 2;
        return bt.hpFrac() > 0.6 ? 30 + 10 * Math.min(2, sum) : 5;
      }
      const cur = mv.sc.reduce((a, [s]) => a + who.stages[s - 1], 0) / mv.sc.length;
      if (cur <= -2) return 2;
      return 18;
    }
    if (cat === 3) return bt.hpFrac() < 0.45 ? 75 : bt.hpFrac() < 0.7 ? 20 : 0;
    if (PW.BD.SETS.weatherMoves[k]) return battle.weather() === PW.BD.SETS.weatherMoves[k] ? 0 : 25;
    if (PW.BD.SETS.terrainMoves[k]) return battle.field.terrain === PW.BD.SETS.terrainMoves[k] ? 0 : 22;
    const foeSide = target.side, side = bt.side;
    switch (k) {
      case 'stealth-rock': return foeSide.conds.rocks || battle.ableCount(foeSide) < 2 ? 0 : 40;
      case 'spikes': return (foeSide.conds.spikes || 0) >= 3 || battle.ableCount(foeSide) < 2 ? 0 : 30;
      case 'toxic-spikes': return (foeSide.conds.tspikes || 0) >= 2 || battle.ableCount(foeSide) < 2 ? 0 : 25;
      case 'sticky-web': return foeSide.conds.web ? 0 : 25;
      case 'reflect': return side.conds.reflect ? 0 : 30;
      case 'light-screen': return side.conds.lightScreen ? 0 : 30;
      case 'aurora-veil': return side.conds.auroraVeil || battle.weather() !== 'snow' ? 0 : 45;
      case 'substitute': return bt.v.sub || bt.hpFrac() < 0.5 ? 0 : 25;
      case 'rest': return bt.hpFrac() < 0.4 ? 60 : 0;
      case 'taunt': return 15;
      case 'roar': case 'whirlwind': return battle.kind === 'wild' ? 0 : target.stages.some(x => x > 1) ? 50 : 5;
      case 'haze': return target.stages.some(x => x > 1) ? 50 : 0;
      case 'belly-drum': return bt.hpFrac() > 0.8 ? 40 : 0;
      case 'trick-room': return battle.speed(bt) < battle.speed(target) && !battle.field.trickRoom ? 35 : 0;
      case 'tailwind': return side.conds.tailwind ? 0 : 28;
      case 'perish-song': return 5;
      case 'destiny-bond': return bt.hpFrac() < 0.25 ? 40 : 0;
      case 'pain-split': return bt.hpFrac() < target.hpFrac() - 0.3 ? 45 : 0;
      case 'wish': return bt.hpFrac() < 0.6 ? 35 : 0;
      case 'encore': return target.lastMove && Dex.move(target.lastMove).c === 0 ? 35 : 5;
      case 'metronome': return 20;
    }
    return 12;
  }

  const AI = PW.AI = {
    choose(battle, side) {
      const bt = side.active, target = battle.sides[1 - side.id].active;
      const moves = usableMoves(battle, bt);
      if (!moves.length) return { type: 'move', struggle: true, index: 0 };
      if (side.ai === 'wild') {
        if (battle.opts.foe.roamer && battle.turn >= 1 && U.chance(0.75)) return { type: 'run' };
        const m = U.pick(moves);
        return { type: 'move', index: m.i };
      }
      const smart = side.ai === 'gym' || side.ai === 'elite' || side.ai === 'champion';
      // Items: leaders heal once or twice per battle.
      if (side.items.length && bt.hpFrac() < 0.25 && (side.used.items || 0) < (smart ? 2 : 1) && !bt.v.dyna && U.chance(0.75)) {
        const it = HEAL_ITEMS.map(k => Dex.itemByKey(k)).find(id => side.items.includes(id));
        if (it) { side.items.splice(side.items.indexOf(it), 1); return { type: 'item', item: it }; }
      }
      // Smart trainers switch out of terrible matchups.
      if (smart && U.chance(0.3) && battle.ableCount(side) > 1 && !bt.v.trapped && bt.turnsIn > 0) {
        const threat = AI.threat(battle, target, bt);
        const best = moves.reduce((a, m) => Math.max(a, estimate(battle, bt, target, m.mv)), 0);
        if (threat >= bt.hp && best < target.hp * 0.5) {
          const idx = AI.replacement(battle, side, true);
          if (idx >= 0 && idx !== side.activeIdx) {
            const cand = side.team[idx];
            const cb = new PW.Battler(battle, side, cand);
            if (AI.threat(battle, target, cb) < threat * 0.5) return { type: 'switch', index: idx };
          }
        }
      }
      let best = null;
      for (const m of moves) {
        let score;
        if (m.mv.c === 0) score = statusScore(battle, bt, target, m.mv);
        else {
          const d = estimate(battle, bt, target, m.mv);
          const acc = (m.mv.a || 100) / 100;
          if (d >= target.hp) score = 200 + (m.mv.pr > 0 ? 50 : 0) + acc * 20;
          else score = (d / target.maxHp) * 100 * acc;
          if (m.mv.pr > 0 && target.hpFrac() < 0.2) score += 20;
          if (m.mv.m && m.mv.m[6] < 0 && bt.hpFrac() < 0.3) score *= 0.8;
          if (m.mv.m && m.mv.m[6] > 0 && bt.hpFrac() < 0.6) score *= 1.2;
          if (m.mv.m && m.mv.m[0] === 7 && m.mv.sc && m.mv.sc.some(x => x[1] < 0)) score *= 0.9;
        }
        score *= smart ? U.int(90, 110) / 100 : U.int(70, 130) / 100;
        if (!best || score > best.score) best = { m, score };
      }
      const action = { type: 'move', index: best.m.i };
      // Gimmicks for the ace / last Pokémon.
      const last = battle.ableCount(side) === 1;
      const ace = side.activeIdx === side.team.length - 1;
      if (battle.canMega(bt)) action.mega = true;
      else if ((last || ace) && battle.canDynamax(bt)) action.dyna = true;
      else if ((last || ace || bt.mon.teraAce) && battle.canTera(bt) && smart) action.tera = true;
      if (battle.canZ(bt, best.m.mv) && best.m.mv.c !== 0 && (last || ace || target.hpFrac() > 0.5)) action.z = true;
      return action;
    },

    // Rough damage the target can deal to bt with its best move.
    threat(battle, attacker, bt) {
      let best = 0;
      for (const slot of attacker.mon.moves) {
        const mv = Dex.move(slot.id);
        if (!mv || mv.c === 0) continue;
        const d = estimate(battle, attacker, bt, mv);
        if (d > best) best = d;
      }
      return best;
    },

    replacement(battle, side, pivot) {
      const opts = side.team.map((m, i) => i).filter(i => side.team[i].hp > 0 && !side.team[i].egg && (!pivot || i !== side.activeIdx));
      if (!opts.length) return -1;
      if (side.ai === 'trainer' || side.ai === 'wild' || side.ai === 'gym') {
        // In-game trainers send their Pokémon in order (ace last).
        return opts[0];
      }
      const target = battle.sides[1 - side.id].active;
      if (!target) return opts[0];
      const aceIdx = side.team.length - 1;
      let best = opts[0], bestScore = -1e9;
      for (const i of opts) {
        const cb = new PW.Battler(battle, side, side.team[i]);
        let off = 0;
        for (const slot of cb.mon.moves) { const mv = Dex.move(slot.id); if (mv && mv.c) off = Math.max(off, estimate(battle, cb, target, mv)); }
        const def = AI.threat(battle, target, cb);
        let score = off / Math.max(1, target.hp) * 100 - def / Math.max(1, cb.hp) * 80;
        if (i === aceIdx && opts.length > 1) score -= 200;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      return best;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
