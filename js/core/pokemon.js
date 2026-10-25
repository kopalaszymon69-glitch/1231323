/* Pokémon instances: creation, stats, experience, EVs, friendship and evolution. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex;

  // PokeAPI region ids, used by region-specific evolutions (Alolan Raichu, Galarian Weezing, ...).
  const REGION_NUM = { kanto: 1, johto: 2, hoenn: 3, sinnoh: 4, unova: 5, kalos: 6, alola: 7, galar: 8, hisui: 9, paldea: 10 };
  // Places that count as Moss Rock / Ice Rock / magnetic field in any game.
  const SPECIAL_PLACES = {
    moss: ['eterna-forest', 'pinwheel-forest', 'kalos-route-20', 'lush-jungle'],
    ice: ['sinnoh-route-217', 'twist-mountain', 'frost-cavern', 'mount-lanakila'],
    magnet: ['mt-coronet', 'chargestone-cave', 'kalos-route-13', 'vast-poni-canyon', 'blush-mountain', 'new-mauville'],
  };
  const SHINY_ODDS = 4096;

  function genderFor(sp) {
    if (sp.gr < 0) return 'N';
    if (sp.gr === 0) return 'M';
    if (sp.gr === 8) return 'F';
    return U.rand() < sp.gr / 8 ? 'F' : 'M';
  }

  const Mon = PW.Mon = {
    REGION_NUM, SPECIAL_PLACES, SHINY_ODDS,

    create(o) {
      const p = Dex.mon(o.pid);
      if (!p) throw new Error('Unknown Pokémon ' + o.pid);
      const sp = Dex.species(p.s);
      const level = U.clamp(o.level || 5, 1, 100);
      const abilSlots = [0, 1].filter(i => p.a[i]);
      let abil = o.abil;
      if (abil === undefined) abil = (o.hiddenChance && p.a[2] && U.chance(o.hiddenChance)) ? 2 : U.pick(abilSlots.length ? abilSlots : [0]);
      const ivs = o.ivs || [0, 0, 0, 0, 0, 0].map(() => U.int(0, 31));
      if (o.perfectIvs) {
        const idx = U.shuffle([0, 1, 2, 3, 4, 5]).slice(0, o.perfectIvs);
        for (const i of idx) ivs[i] = 31;
      }
      let shiny = o.shiny;
      if (shiny === undefined) {
        const rolls = o.shinyRolls || 1;
        shiny = false;
        for (let i = 0; i < rolls && !shiny; i++) shiny = U.int(1, SHINY_ODDS) === 1;
      }
      const m = {
        uid: U.uid(), pid: +o.pid, nick: o.nick || null, lvl: level, exp: Dex.expAt(sp.gw, level),
        nat: o.nat !== undefined ? o.nat : U.int(0, 24), iv: ivs, ev: o.evs || [0, 0, 0, 0, 0, 0],
        abil, gender: o.gender || genderFor(sp), shiny: !!shiny, moves: [], hp: 0, st: null, slp: 0,
        fr: o.friendship !== undefined ? o.friendship : sp.bh, item: o.item || null, ball: o.ball || Dex.itemByKey('poke-ball'),
        ot: o.ot || '', met: o.met || null, tera: o.tera !== undefined ? o.tera : U.pick(p.t), walked: 0,
        moveUse: {}, dmgTaken: 0,
      };
      const moveIds = o.moves || Dex.movesAtLevel(m.pid, level);
      m.moves = moveIds.filter(id => Dex.move(id)).slice(0, 4).map(id => ({ id: +id, pp: Dex.move(id).pp, up: 0 }));
      if (!m.moves.length) m.moves = [{ id: 33, pp: 35, up: 0 }]; // Tackle as a last resort
      m.hp = Mon.stats(m)[0];
      return m;
    },

    createEgg(pid, o) {
      const m = Mon.create(Object.assign({ pid, level: 1 }, o || {}));
      const sp = Dex.speciesOf(pid);
      m.egg = true;
      m.eggSteps = (sp.hc + 1) * 128; // egg cycles of 257 steps (Gen 8+ uses 128)
      m.fr = 120;
      return m;
    },

    data(m) { return Dex.mon(m.pid); },
    species(m) { return Dex.speciesOf(m.pid); },
    name(m) { return m.egg ? 'Jajo' : (m.nick || Dex.mon(m.pid).n); },
    abilityId(m) {
      const p = Dex.mon(m.pid);
      return p.a[m.abil] || p.a[0];
    },

    stats(m) {
      const p = Dex.mon(m.pid);
      const b = p.b, L = m.lvl, nat = Dex.nature(m.mint !== undefined && m.mint !== null ? m.mint : m.nat);
      const out = [];
      for (let i = 0; i < 6; i++) {
        const iv = m.ht && m.ht[i] ? 31 : m.iv[i];
        const core = Math.floor((2 * b[i] + iv + Math.floor(m.ev[i] / 4)) * L / 100);
        if (i === 0) {
          out.push(p.k === 'shedinja' ? 1 : core + L + 10);
        } else {
          let v = core + 5;
          if (nat.up === i) v = Math.floor(v * 1.1);
          if (nat.down === i) v = Math.floor(v * 0.9);
          out.push(v);
        }
      }
      return out;
    },
    maxHp(m) { return Mon.stats(m)[0]; },

    heal(m) {
      m.hp = Mon.maxHp(m);
      m.st = null; m.slp = 0; m.tox = 0;
      for (const mv of m.moves) mv.pp = Mon.maxPP(mv);
    },
    maxPP(mv) {
      const base = Dex.move(mv.id).pp;
      return base + Math.floor(base * (mv.up || 0) / 5);
    },

    expToNext(m) {
      if (m.lvl >= 100) return 0;
      return Dex.expAt(Mon.species(m).gw, m.lvl + 1) - m.exp;
    },
    expProgress(m) {
      if (m.lvl >= 100) return 1;
      const gw = Mon.species(m).gw;
      const a = Dex.expAt(gw, m.lvl), b = Dex.expAt(gw, m.lvl + 1);
      return U.clamp((m.exp - a) / Math.max(1, b - a), 0, 1);
    },

    // Gen VII+ scaled experience formula.
    expYield(defeated, receiver, o) {
      o = o || {};
      const b = Dex.mon(defeated.pid).x || 50;
      const Ld = defeated.lvl, Lp = receiver.lvl;
      const s = o.participated === false ? 2 : 1;
      let exp = (b * Ld / 5) * (1 / s) * Math.pow((2 * Ld + 10) / (Ld + Lp + 10), 2.5) + 1;
      exp = Math.floor(exp);
      if (receiver.item && Dex.item(receiver.item) && Dex.item(receiver.item).k === 'lucky-egg') exp = Math.floor(exp * 1.5);
      if (receiver.ot && o.playerName && receiver.ot !== o.playerName) exp = Math.floor(exp * 1.5);
      if (Mon.couldEvolveByLevel(receiver)) exp = Math.floor(exp * 1.2);
      if (receiver.fr >= 220) exp = Math.floor(exp * 1.2);
      if (o.multiplier) exp = Math.floor(exp * o.multiplier);
      return Math.max(1, exp);
    },

    couldEvolveByLevel(m) {
      const sp = Mon.species(m);
      return !!(sp.evo || []).some(e => e.trig === 'level-up' && e.lvl && m.lvl >= e.lvl && Object.keys(e).length <= 3);
    },

    // Adds experience; returns list of events {type:'level', lvl, learned:[...], pending:[...]}.
    addExp(m, amount) {
      const events = [];
      if (m.lvl >= 100 || m.egg) return events;
      m.exp += amount;
      const gw = Mon.species(m).gw;
      while (m.lvl < 100 && m.exp >= Dex.expAt(gw, m.lvl + 1)) {
        events.push(Mon.levelUp(m));
      }
      if (m.lvl >= 100) m.exp = Dex.expAt(gw, 100);
      return events;
    },

    levelUp(m) {
      const before = Mon.stats(m);
      m.lvl++;
      const gw = Mon.species(m).gw;
      if (m.exp < Dex.expAt(gw, m.lvl)) m.exp = Dex.expAt(gw, m.lvl);
      const after = Mon.stats(m);
      if (m.hp > 0) m.hp = Math.min(after[0], m.hp + (after[0] - before[0]));
      Mon.addFriendship(m, m.fr < 100 ? 5 : m.fr < 200 ? 3 : 2);
      const ev = { type: 'level', mon: m, lvl: m.lvl, before, after, learned: [], pending: [] };
      for (const mid of Dex.movesLearnedAt(m.pid, m.lvl)) Mon.offerMove(m, mid, ev);
      return ev;
    },

    offerMove(m, mid, ev) {
      if (m.moves.some(x => x.id === mid)) return;
      if (m.moves.length < 4) {
        m.moves.push({ id: mid, pp: Dex.move(mid).pp, up: 0 });
        ev.learned.push(mid);
      } else {
        ev.pending.push(mid);
      }
    },

    learnMove(m, mid, replaceIndex) {
      const mv = { id: +mid, pp: Dex.move(mid).pp, up: 0 };
      if (replaceIndex === undefined || replaceIndex < 0) {
        if (m.moves.length >= 4) return false;
        m.moves.push(mv);
      } else {
        m.moves[replaceIndex] = mv;
      }
      return true;
    },

    addEVs(m, yieldArr, mult) {
      let total = m.ev.reduce((a, b) => a + b, 0);
      for (let i = 0; i < 6; i++) {
        let add = (yieldArr[i] || 0) * (mult || 1);
        if (m.pkrs) add *= 2;
        add = Math.min(add, 252 - m.ev[i], 510 - total);
        if (add > 0) { m.ev[i] += add; total += add; }
      }
    },

    addFriendship(m, n) {
      if (n > 0) {
        const it = m.item && Dex.item(m.item);
        if (it && it.k === 'soothe-bell') n = Math.floor(n * 1.5);
        if (m.ball === Dex.itemByKey('luxury-ball')) n += 1;
      }
      m.fr = U.clamp(m.fr + n, 0, 255);
    },

    hasType(m, typeIdx) { return Dex.mon(m.pid).t.includes(typeIdx); },

    // ------------------------------------------------------------------ evolution
    // ctx: {trigger:'level'|'item'|'trade'|'spin'|'tower', item, region, time, loc, party, weather, upsideDown, tower}
    evolutions(m, ctx) {
      if (m.egg) return [];
      const sp = Mon.species(m);
      const p = Dex.mon(m.pid);
      let rows = sp.evo || [];
      if (!rows.length) return [];
      const isDefault = m.pid === Dex.defaultForm(p.s);
      const formRows = rows.filter(r => r.from === m.pid);
      rows = formRows.length ? formRows : rows.filter(r => !r.from && (isDefault || !rows.some(x => x.from)));
      if (!formRows.length && !isDefault) {
        // A regional form without form-specific rows keeps the generic rows (e.g. Hisuian Growlithe -> Arcanine row).
        rows = (sp.evo || []).filter(r => !r.from);
      }
      const ok = [];
      for (const r of rows) {
        if (Mon.rowMatches(m, r, ctx)) ok.push(r);
      }
      if (!ok.length) return [];
      const regionNum = REGION_NUM[ctx.region] || 0;
      // Region-specific rows win in their region and never apply elsewhere.
      const regional = ok.filter(r => r.region);
      const inRegion = regional.filter(r => r.region === regionNum);
      let result = ok.filter(r => !r.region);
      if (inRegion.length) {
        const targets = new Set(inRegion.map(r => Dex.mon(r.to).s));
        result = result.filter(r => !targets.has(Dex.mon(r.to).s)).concat(inRegion);
      }
      // A regional form evolves into the matching regional form when one exists (e.g. Alolan Sandshrew).
      return result.map(r => Object.assign({}, r, { to: Mon.formAwareTarget(m, r) }));
    },

    formAwareTarget(m, r) {
      if (r.from || r.region) return r.to;
      const p = Dex.mon(m.pid);
      if (!p.fm) return r.to;
      const target = Dex.speciesOf(r.to);
      const twin = target.f.find(fid => Dex.mon(fid).fm === p.fm);
      return twin || r.to;
    },

    rowMatches(m, r, ctx) {
      const trig = ctx.trigger;
      const held = m.item ? Dex.item(m.item) : null;
      switch (r.trig) {
        case 'level-up':
          if (trig !== 'level') return false;
          break;
        case 'use-item':
          if (trig !== 'item' || ctx.item !== r.item) return false;
          break;
        case 'trade':
          if (trig !== 'trade') return false;
          break;
        case 'spin':
          if (trig !== 'spin') return false;
          break;
        case 'tower-of-darkness':
          return trig === 'tower' && ctx.tower === 'darkness';
        case 'tower-of-waters':
          return trig === 'tower' && ctx.tower === 'waters';
        case 'three-critical-hits':
          return trig === 'level' && (m.crits3 || false) || trig === 'battle-end' && (m.crits3 || false);
        case 'take-damage':
          if (!(trig === 'level' || trig === 'loc')) return false;
          if ((m.dmgTaken || 0) < (r.damageTaken || 49)) return false;
          return !r.location || ctx.loc === r.location;
        case 'three-defeated-bisharp':
          return trig === 'level' && (m.bisharpKOs || 0) >= 3;
        case 'gimmighoul-coins':
          return trig === 'level' && (ctx.coins || 0) >= 999;
        case 'recoil-damage':
          return trig === 'level' && (m.recoilTaken || 0) >= 294;
        case 'use-move':
        case 'agile-style-move':
        case 'strong-style-move':
          if (trig !== 'level') return false;
          if (r.usedMove && (m.moveUse[r.usedMove] || 0) < (r.moveCount || 20)) return false;
          if (!r.usedMove) return false;
          break;
        case 'shed':
          return false;
        default:
          return false;
      }
      if (r.lvl && m.lvl < r.lvl) return false;
      if (r.happy && m.fr < r.happy) return false;
      if (r.affection && m.fr < 220) return false;
      if (r.beauty) return false;
      if (r.gender && ((r.gender === 1 && m.gender !== 'F') || (r.gender === 2 && m.gender !== 'M'))) return false;
      if (r.time) {
        const t = ctx.time || U.timeOfDay();
        if (r.time === 'day' && t === 'night') return false;
        if (r.time === 'night' && t !== 'night') return false;
        if (r.time === 'dusk' && !(ctx.dusk || U.isDusk())) return false;
      }
      if (r.held && (!held || m.item !== r.held)) return false;
      if (r.move && !m.moves.some(x => x.id === r.move)) return false;
      if (r.moveType !== undefined && !m.moves.some(x => Dex.move(x.id).t === r.moveType)) return false;
      if (r.relStats !== undefined) {
        const s = Mon.stats(m);
        const rel = s[1] > s[2] ? 1 : s[1] < s[2] ? -1 : 0;
        if (rel !== r.relStats) return false;
      }
      if (r.partySpecies && !(ctx.party || []).some(x => x !== m && !x.egg && Dex.mon(x.pid).s === r.partySpecies)) return false;
      if (r.partyType !== undefined && !(ctx.party || []).some(x => x !== m && !x.egg && Dex.mon(x.pid).t.includes(r.partyType))) return false;
      if (r.tradeSpecies && !(ctx.party || []).some(x => x !== m && !x.egg && Dex.mon(x.pid).s === r.tradeSpecies)) return false;
      if (r.rain && !(ctx.weather === 'rain' || ctx.weather === 'thunderstorm')) return false;
      if (r.upsideDown && !ctx.upsideDown) return false;
      if (r.specialRock || r.location) {
        const loc = ctx.loc || '';
        const kinds = [];
        if (SPECIAL_PLACES.moss.includes(loc)) kinds.push('moss');
        if (SPECIAL_PLACES.ice.includes(loc)) kinds.push('ice');
        if (SPECIAL_PLACES.magnet.includes(loc)) kinds.push('magnet');
        const want = r.location && SPECIAL_PLACES.moss.includes(r.location) ? 'moss'
          : r.location && SPECIAL_PLACES.ice.includes(r.location) ? 'ice'
            : r.location && SPECIAL_PLACES.magnet.includes(r.location) ? 'magnet' : null;
        if (want ? !kinds.includes(want) : loc !== r.location) return false;
      }
      if (r.natures !== undefined && !((r.natures >> m.nat) & 1)) {
        // nature bitmask indexes natures by game index
        return false;
      }
      if (r.steps && (m.walked || 0) * 50 < r.steps) return false;
      if (r.multiplayer && (m.walked || 0) * 50 < 1000) return false;
      if (r.chance) {
        // Wurmple style split: decided once per Pokémon.
        if (m.splitRoll === undefined) m.splitRoll = U.rand();
        const rowsSame = (Mon.species(m).evo || []).filter(x => x.chance && x.trig === r.trig);
        const idx = rowsSame.indexOf(r);
        if (idx >= 0 && rowsSame.length > 1 && Math.floor(m.splitRoll * rowsSame.length) !== idx) return false;
      }
      return true;
    },

    // Performs the evolution; returns {from, to, learned[], pending[], extra} for the UI.
    evolve(m, row, game) {
      const fromPid = m.pid;
      const oldHpMax = Mon.maxHp(m);
      const to = typeof row === 'object' ? row.to : row;
      m.pid = +to;
      const p = Dex.mon(m.pid);
      if (!p.a[m.abil]) m.abil = 0;
      const newMax = Mon.maxHp(m);
      if (m.hp > 0) m.hp = Math.min(newMax, m.hp + (newMax - oldHpMax));
      if (m.nick === null) m.nick = null;
      const ev = { type: 'evolve', mon: m, from: fromPid, to: m.pid, learned: [], pending: [] };
      for (const mid of Dex.evolutionMoves(m.pid)) Mon.offerMove(m, mid, ev);
      for (const mid of Dex.movesLearnedAt(m.pid, m.lvl)) Mon.offerMove(m, mid, ev);
      if (row && typeof row === 'object') {
        if (row.held && m.item === row.held) m.item = null;
      }
      // Nincada leaves a Shedinja behind if there is room and a spare Poké Ball.
      if (game && Dex.mon(fromPid).k === 'nincada') {
        const sp = Mon.species({ pid: fromPid });
        const shedRow = (sp.evo || []).find(e => e.trig === 'shed');
        if (shedRow && game.party.length < 6 && game.takeItem && game.takeItem(Dex.itemByKey('poke-ball'), 1)) {
          const sh = Mon.create({ pid: shedRow.to, level: m.lvl, ivs: m.iv.slice(), nat: m.nat, ot: m.ot, moves: m.moves.map(x => x.id) });
          sh.met = m.met;
          game.party.push(sh);
          ev.extra = sh;
        }
      }
      return ev;
    },

    // Everstone check helper
    blocksEvolution(m) {
      const it = m.item && Dex.item(m.item);
      return !!(it && it.k === 'everstone');
    },

    summary(m) {
      const p = Dex.mon(m.pid);
      return { name: Mon.name(m), species: p.n, lvl: m.lvl, types: p.t, hp: m.hp, maxHp: Mon.maxHp(m) };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
