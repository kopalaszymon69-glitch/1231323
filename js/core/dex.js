/* Data access layer over the generated PW_DATA tables. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const D = () => G.PW_DATA;

  const TYPE_PL = {
    normal: 'Normalny', fighting: 'Walczący', flying: 'Latający', poison: 'Trujący', ground: 'Ziemny',
    rock: 'Skalny', bug: 'Robaczy', ghost: 'Duchowy', steel: 'Stalowy', fire: 'Ognisty', water: 'Wodny',
    grass: 'Trawiasty', electric: 'Elektryczny', psychic: 'Psychiczny', ice: 'Lodowy', dragon: 'Smoczy',
    dark: 'Mroczny', fairy: 'Baśniowy', stellar: 'Gwiezdny',
  };
  const STAT_PL = ['HP', 'Atak', 'Obrona', 'Sp. Atak', 'Sp. Obrona', 'Szybkość', 'Celność', 'Unik'];
  const STAT_SHORT = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
  const CLASS_PL = ['Statusowy', 'Fizyczny', 'Specjalny'];

  const learnCache = {};
  const levelCache = {};

  const Dex = PW.Dex = {
    TYPE_PL, STAT_PL, STAT_SHORT, CLASS_PL,
    get data() { return D(); },
    types() { return D().core.types; },
    typeIndex(name) { return D().core.types.indexOf(name); },
    typeName(i) { const t = D().core.types[i]; return TYPE_PL[t] || t; },
    typeKey(i) { return D().core.types[i]; },
    eff(atkType, defTypes) {
      const chart = D().core.chart;
      let m = 1;
      for (const t of defTypes) m *= chart[atkType][t];
      return m;
    },
    mon(pid) { return D().pokemon[pid]; },
    species(sid) { return D().species[sid]; },
    speciesOf(pid) { const p = D().pokemon[pid]; return p ? D().species[p.s] : null; },
    defaultForm(sid) {
      const s = D().species[sid];
      return s ? Math.min.apply(null, s.f) : null;
    },
    move(mid) { return D().moves[mid]; },
    moveByKey(k) {
      if (!Dex._moveKey) { Dex._moveKey = {}; for (const id in D().moves) Dex._moveKey[D().moves[id].k] = +id; }
      return Dex._moveKey[k];
    },
    item(iid) { return D().items[iid]; },
    itemByKey(k) {
      if (!Dex._itemKey) { Dex._itemKey = {}; for (const id in D().items) Dex._itemKey[D().items[id].k] = +id; }
      return Dex._itemKey[k];
    },
    monByKey(k) {
      if (!Dex._monKey) {
        Dex._monKey = {};
        for (const id in D().pokemon) Dex._monKey[D().pokemon[id].k] = +id;
        for (const sid in D().species) {
          const s = D().species[sid];
          if (!(s.k in Dex._monKey)) Dex._monKey[s.k] = Math.min.apply(null, s.f);
        }
      }
      return Dex._monKey[k];
    },
    ability(aid) { return D().abilities[aid]; },
    abilityKey(aid) { const a = D().abilities[aid]; return a ? a.k : ''; },
    nature(i) { return D().core.natures[i]; },
    natureCount() { return D().core.natures.length; },
    expAt(growthId, level) { return D().core.growth[growthId][Math.max(1, Math.min(100, level))]; },
    dexText(sid) { return (D().dexText || {})[sid] || ''; },
    learnset(pid) {
      if (learnCache[pid]) return learnCache[pid];
      let p = D().pokemon[pid];
      let ls = D().learnsets[pid];
      if (!ls && p && p.ls) ls = D().learnsets[p.ls];
      if (!ls && p) ls = D().learnsets[Dex.defaultForm(p.s)];
      ls = ls || { l: [], m: [], e: [], t: [] };
      learnCache[pid] = ls;
      return ls;
    },
    // Pre-evolution of a form (regional forms keep their region: Galarian Linoone -> Galarian Zigzagoon).
    preForm(pid) {
      const p = D().pokemon[pid];
      const sp = p && D().species[p.s];
      if (!sp || !sp.ef) return null;
      const pre = D().species[sp.ef];
      return (p.fm && pre.f.find(f => D().pokemon[f] && D().pokemon[f].fm === p.fm)) || Dex.defaultForm(sp.ef);
    },
    // Level-up moves at the levels older games used, for Pokémon that NPCs bring. Scarlet/Violet list
    // nearly every move of an evolved Pokémon at Lv1, so a Lv1 move takes the level its pre-evolution
    // learns it at: a Lv21 Starmie has Swift and Rapid Spin, not Psychic and Hydro Pump. A strong Lv1
    // move the pre-evolution never learns (Mismagius's Phantom Force) comes after its last move.
    levelMoves(pid) {
      if (levelCache[pid]) return levelCache[pid];
      const pre = Dex.preForm(pid);
      const preLv = new Map();
      let preLast = 1;
      if (pre && pre !== pid) for (const [lv, mid] of Dex.levelMoves(pre)) { if (lv > 0 && !preLv.has(mid)) preLv.set(mid, lv); preLast = Math.max(preLast, lv); }
      const eff = (lv, mid) => {
        if (lv !== 1 || !pre) return lv;
        if (preLv.has(mid)) return preLv.get(mid);
        return (D().moves[mid].p || 0) >= 75 ? preLast : 1;
      };
      const out = Dex.learnset(pid).l.map(([lv, mid]) => [eff(lv, mid), mid]);
      // An evolved Pokémon keeps what it learned before evolving (up to the evolution level when it has one).
      if (pre && pre !== pid) {
        const own = new Set(out.map(x => x[1]));
        const row = (D().species[D().pokemon[pre].s].evo || []).find(r => r.to === pid || D().pokemon[r.to].s === D().pokemon[pid].s);
        const cap = row && row.trig === 'level-up' && row.lvl ? row.lvl : 100;
        for (const [lv, mid] of Dex.levelMoves(pre)) if (lv > 0 && lv <= cap && !own.has(mid)) { out.push([lv, mid]); own.add(mid); }
      }
      out.sort((a, b) => a[0] - b[0]);
      return (levelCache[pid] = out);
    },
    // Moves a wild/trainer Pokémon knows at a level: the last four level-up moves (as in the games).
    movesAtLevel(pid, level) {
      const ls = Dex.levelMoves(pid);
      const known = [];
      for (const [lv, mid] of ls) {
        if (lv > level) break;
        if (lv === 0) continue; // evolution moves are handled when evolving
        const i = known.indexOf(mid);
        if (i >= 0) known.splice(i, 1);
        known.push(mid);
      }
      if (!known.length) {
        for (const [lv, mid] of ls) if (lv <= 1 && !known.includes(mid)) known.push(mid);
      }
      return known.slice(-4);
    },
    movesLearnedAt(pid, level) {
      return Dex.learnset(pid).l.filter(([lv]) => lv === level).map(x => x[1]);
    },
    evolutionMoves(pid) {
      return Dex.learnset(pid).l.filter(([lv]) => lv === 0).map(x => x[1]);
    },
    // Move Reminder pool: every level-up move up to the current level.
    relearnable(pid, level) {
      const set = new Set();
      for (const [lv, mid] of Dex.learnset(pid).l) if (lv <= level) set.add(mid);
      return [...set];
    },
    canLearnTM(pid, mid) {
      const ls = Dex.learnset(pid);
      return ls.m.includes(mid) || ls.t.includes(mid);
    },
    sprite(pid, opts) {
      opts = opts || {};
      const A = PW.Assets;
      if (A && A.bundled) {
        const p = D().pokemon[pid];
        const ids = [pid, p ? Dex.defaultForm(p.s) : pid];
        const groups = opts.back ? [opts.shiny ? 'backshiny' : 'back', 'back'] : [];
        groups.push(opts.shiny ? 'shiny' : 'front', 'front');
        for (const id of ids) for (const gr of groups) { const u = A.get(gr, id); if (u) return u; }
        return '';
      }
      const base = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
      if (opts.art) return base + 'other/official-artwork/' + (opts.shiny ? 'shiny/' : '') + pid + '.png';
      if (opts.home) return base + 'other/home/' + (opts.shiny ? 'shiny/' : '') + pid + '.png';
      return base + (opts.back ? 'back/' : '') + (opts.shiny ? 'shiny/' : '') + pid + '.png';
    },
    spriteFallback(pid, opts) {
      const base = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
      return base + 'other/home/' + (opts && opts.shiny ? 'shiny/' : '') + pid + '.png';
    },
    cry(pid) {
      const p = D().pokemon[pid];
      return 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/' + (p && pid > 10000 ? pid : (p ? p.s : pid)) + '.ogg';
    },
    itemSprite(iid) {
      const it = D().items[iid];
      return it ? Dex.itemSpriteKey(it.k) : '';
    },
    itemSpriteKey(k) {
      const A = PW.Assets;
      if (A && A.bundled) return A.get('items', k) || A.get('items', k + '--held') || A.get('items', 'poke-ball');
      return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/' + k + '.png';
    },
    trainerSprite(name) {
      const A = PW.Assets;
      if (A && A.bundled) return A.get('trainers', name) || A.get('trainers', 'youngster');
      return 'https://play.pokemonshowdown.com/sprites/trainers/' + name + '.png';
    },
    isFullyEvolved(pid) {
      const p = D().pokemon[pid];
      const s = D().species[p.s];
      return !(s.evo && s.evo.length);
    },
    // Walk up the chain to the base species (used for eggs).
    baseSpecies(sid) {
      let s = D().species[sid];
      let id = sid;
      while (s && s.ef) { id = s.ef; s = D().species[id]; }
      return +id;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
