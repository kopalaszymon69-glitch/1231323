/* Capture formula (Generation VIII/IX) with Poké Ball modifiers and critical captures. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;

  const ULTRA_BEASTS = ['nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord',
    'poipole', 'naganadel', 'stakataka', 'blacephalon'];

  function ballModifier(ballKey, foe, me, battle) {
    const p = foe.data, sp = Dex.speciesOf(foe.mon.pid);
    const env = battle.env || {};
    const t = foe.types.map(i => Dex.typeKey(i));
    switch (ballKey) {
      case 'great-ball': return 1.5;
      case 'ultra-ball': return 2;
      case 'safari-ball': case 'sport-ball': return 1.5;
      case 'net-ball': return (t.includes('water') || t.includes('bug')) ? 3.5 : 1;
      case 'dive-ball': return ['surf', 'old-rod', 'good-rod', 'super-rod'].includes(env.method) ? 3.5 : 1;
      case 'nest-ball': return Math.max(1, (41 - foe.mon.lvl) / 10);
      case 'repeat-ball': return env.caughtSpecies && env.caughtSpecies.has(p.s) ? 3.5 : 1;
      case 'timer-ball': return Math.min(4, 1 + battle.turn * 1229 / 4096);
      case 'quick-ball': return battle.turn <= 1 ? 5 : 1;
      case 'dusk-ball': return (env.time === 'night' || ['cave'].includes(env.locKind)) ? 3 : 1;
      case 'level-ball': {
        const a = me.mon.lvl, b = foe.mon.lvl;
        return a >= 4 * b ? 8 : a >= 2 * b ? 4 : a > b ? 2 : 1;
      }
      case 'lure-ball': return ['old-rod', 'good-rod', 'super-rod'].includes(env.method) ? 4 : 1;
      case 'moon-ball': return (sp.evo || []).some(e => e.item === Dex.itemByKey('moon-stone')) ? 4 : 1;
      case 'love-ball': return Dex.mon(me.mon.pid).s === p.s && me.mon.gender !== 'N' && foe.mon.gender !== 'N' && me.mon.gender !== foe.mon.gender ? 8 : 1;
      case 'fast-ball': return p.b[5] >= 100 ? 4 : 1;
      case 'dream-ball': return foe.mon.st === 'slp' ? 4 : 1;
      case 'beast-ball': return ULTRA_BEASTS.includes(p.k) ? 5 : 0.1;
      default: return 1;
    }
  }

  PW.Catch = {
    ULTRA_BEASTS,
    attempt(foe, me, ball, battle) {
      const key = ball.k;
      if (key === 'master-ball' || key === 'park-ball') return { ok: true, shakes: 3, crit: false };
      const sp = Dex.speciesOf(foe.mon.pid);
      let rate = sp.cr;
      if (key === 'heavy-ball') {
        const w = foe.weight;
        rate = Math.max(1, rate + (w >= 300 ? 30 : w >= 200 ? 20 : w >= 100 ? 0 : -20));
      }
      if (ULTRA_BEASTS.includes(foe.data.k) && key !== 'beast-ball') rate = Math.max(1, rate * 0.1);
      const M = foe.maxHp, H = foe.hp;
      let a = ((3 * M - 2 * H) * rate * ballModifier(key, foe, me, battle)) / (3 * M);
      const st = foe.mon.st;
      if (st === 'slp' || st === 'frz') a *= 2.5;
      else if (st) a *= 1.5;
      if (foe.mon.lvl < 13) a *= (36 - 2 * foe.mon.lvl) / 10; // Gen IX low-level bonus
      if (battle.opts.foe.raid || battle.opts.foe.totem) a *= 0.5;
      a = Math.min(255, Math.max(1, a));
      // Critical capture chance scales with Pokédex progress.
      const caught = (battle.env && battle.env.dexCaught) || 0;
      let cm = caught > 600 ? 2.5 : caught > 450 ? 2 : caught > 300 ? 1.5 : caught > 150 ? 1 : caught > 30 ? 0.5 : 0;
      if (battle.env && battle.env.catchingCharm) cm *= 2;
      const critChance = Math.min(255, a * cm) / 6 / 256;
      const crit = U.rand() < critChance;
      if (a >= 255) return { ok: true, shakes: 3, crit };
      const b = 65536 / Math.pow(255 / a, 3 / 16);
      const checks = crit ? 1 : 4;
      let shakes = 0;
      for (let i = 0; i < checks; i++) {
        if (U.int(0, 65535) < b) shakes++; else break;
      }
      const ok = shakes === checks;
      return { ok, shakes: ok ? (crit ? 1 : 3) : Math.min(3, shakes), crit };
    },
    // Rough success estimate for the UI (single throw).
    estimate(foe, me, ball, battle) {
      let ok = 0;
      const saved = U.rand;
      for (let i = 0; i < 200; i++) if (PW.Catch.attempt(foe, me, ball, battle).ok) ok++;
      void saved;
      return ok / 200;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
