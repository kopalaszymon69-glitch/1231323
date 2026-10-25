/* Pokémon Nursery / Day Care: compatibility, egg creation (IV, nature, ability, ball, egg moves) and hatching. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;

  const DITTO_GROUP = 13, UNDISCOVERED = 15;
  // Incense babies and other special cases (base species without an evolves_from link).
  const BABY_SPECIAL = { 'nidoran-f': ['nidoran-f', 'nidoran-m'], 'illumise': ['volbeat', 'illumise'], 'volbeat': ['volbeat', 'illumise'] };

  const Breeding = PW.Breeding = {
    compat(a, b) {
      if (!a || !b || a.egg || b.egg) return 0;
      const sa = Dex.speciesOf(a.pid), sb = Dex.speciesOf(b.pid);
      if (sa.eg.includes(UNDISCOVERED) || sb.eg.includes(UNDISCOVERED)) return 0;
      const da = sa.eg.includes(DITTO_GROUP), db = sb.eg.includes(DITTO_GROUP);
      if (da && db) return 0;
      if (da || db) return sa.k === sb.k ? 0 : 20;
      if (a.gender === 'N' || b.gender === 'N' || a.gender === b.gender) return 0;
      if (!sa.eg.some(g => sb.eg.includes(g))) return 0;
      const same = Dex.mon(a.pid).s === Dex.mon(b.pid).s;
      const sameOT = a.ot === b.ot;
      return same ? (sameOT ? 50 : 70) : (sameOT ? 20 : 50);
    },
    compatText(n) {
      if (n >= 70) return 'Wydają się bardzo się lubić!';
      if (n >= 50) return 'Wydają się dobrze dogadywać.';
      if (n >= 20) return 'Nie przepadają za sobą zbytnio.';
      return 'Wolą bawić się z innymi Pokémonami.';
    },
    mother(a, b) {
      const da = Dex.speciesOf(a.pid).eg.includes(DITTO_GROUP);
      const db = Dex.speciesOf(b.pid).eg.includes(DITTO_GROUP);
      if (da) return b; if (db) return a;
      return a.gender === 'F' ? a : b;
    },
    babyPid(mother) {
      const sp = Dex.speciesOf(mother.pid);
      const special = BABY_SPECIAL[sp.k];
      if (special) return Dex.monByKey(U.pick(special));
      let sid = Dex.baseSpecies(Dex.mon(mother.pid).s);
      const p = Dex.mon(mother.pid);
      const base = Dex.species(sid);
      // Regional forms pass to the egg (e.g. Alolan Vulpix).
      if (p.fm) { const twin = base.f.find(fid => Dex.mon(fid).fm === p.fm); if (twin) return twin; }
      return Dex.defaultForm(sid);
    },
    makeEgg(a, b) {
      const mom = Breeding.mother(a, b);
      const dad = mom === a ? b : a;
      const pid = Breeding.babyPid(mom);
      const knot = [a, b].some(m => m.item && Dex.item(m.item) && Dex.item(m.item).k === 'destiny-knot');
      const ivs = [0, 0, 0, 0, 0, 0].map(() => U.int(0, 31));
      const picks = U.shuffle([0, 1, 2, 3, 4, 5]).slice(0, knot ? 5 : 3);
      for (const i of picks) ivs[i] = (U.chance(0.5) ? a : b).iv[i];
      let nat;
      const ever = [a, b].filter(m => m.item && Dex.item(m.item) && Dex.item(m.item).k === 'everstone');
      if (ever.length) nat = U.pick(ever).nat;
      const egg = Mon.createEgg(pid, { ivs, nat, ot: PW.Game.s.player.name, ball: Dex.speciesOf(mom.pid).eg.includes(DITTO_GROUP) ? dad.ball : mom.ball,
        shinyRolls: PW.Shiny.baseRolls(pid) + PW.Shiny.masudaRolls(a, b) });
      // Ability: hidden ability passes 60% from the mother.
      if (mom.abil === 2 && U.chance(0.6) && Dex.mon(pid).a[2]) egg.abil = 2;
      // Egg moves known by either parent.
      const em = Dex.learnset(pid).e || [];
      const parentMoves = new Set(a.moves.concat(b.moves).map(m => m.id));
      const inherit = em.filter(mid => parentMoves.has(mid));
      for (const mid of inherit) {
        if (egg.moves.some(x => x.id === mid)) continue;
        if (egg.moves.length >= 4) egg.moves.shift();
        egg.moves.push({ id: mid, pp: Dex.move(mid).pp, up: 0 });
      }
      egg.met = { r: PW.Game.s.region, l: 'daycare', d: Date.now(), how: 'egg' };
      return egg;
    },

    deposit(uid) {
      const s = PW.Game.s;
      if (s.daycare.mons.length >= 2) return 'full';
      const i = s.party.findIndex(m => m.uid === uid);
      if (i < 0) return false;
      if (s.party.filter(m => !m.egg).length <= 1) return 'last';
      const m = s.party.splice(i, 1)[0];
      m.dcSteps = 0;
      m.dcLevel = m.lvl;
      s.daycare.mons.push(m);
      return true;
    },
    withdraw(uid) {
      const s = PW.Game.s;
      if (s.party.length >= 6) return 'full';
      const i = s.daycare.mons.findIndex(m => m.uid === uid);
      if (i < 0) return false;
      const m = s.daycare.mons.splice(i, 1)[0];
      const levels = m.lvl - (m.dcLevel || m.lvl);
      const cost = 100 + 100 * levels;
      if (!PW.Game.pay(cost)) { s.daycare.mons.splice(i, 0, m); return 'money'; }
      delete m.dcSteps; delete m.dcLevel;
      s.party.push(m);
      return { cost, levels };
    },
    // Called on every exploration: Day Care Pokémon gain 1 EXP per step (Gen IV rule) and eggs appear.
    step(steps) {
      const s = PW.Game.s;
      if (!s) return;
      const dc = s.daycare;
      for (const m of dc.mons) {
        const ev = Mon.addExp(m, steps);
        for (const lv of ev) {
          // Day Care Pokémon replace their oldest move automatically.
          for (const mid of lv.pending) { m.moves.shift(); m.moves.push({ id: mid, pp: Dex.move(mid).pp, up: 0 }); }
        }
      }
      if (dc.mons.length === 2 && !dc.egg) {
        dc.steps = (dc.steps || 0) + steps;
        if (dc.steps >= 256) {
          dc.steps -= 256;
          let c = Breeding.compat(dc.mons[0], dc.mons[1]);
          if (PW.Game.has('oval-charm')) c = c >= 70 ? 88 : c >= 50 ? 80 : c >= 20 ? 40 : 0;
          if (c && U.int(1, 100) <= c) {
            dc.egg = Breeding.makeEgg(dc.mons[0], dc.mons[1]);
            PW.Game.log('W Hodowli Pokémonów znaleziono jajo!', 'good');
          }
        }
      }
      // Hatching progress for eggs in the party (Flame Body / Magma Armor / Steam Engine double it).
      const fast = s.party.some(m => !m.egg && ['flame-body', 'magma-armor', 'steam-engine'].includes(Dex.abilityKey(Mon.abilityId(m))));
      for (const m of s.party) if (m.egg) m.eggSteps -= steps * (fast ? 2 : 1);
    },
    collectEgg() {
      const s = PW.Game.s;
      if (!s.daycare.egg) return false;
      if (s.party.length >= 6) return 'full';
      s.party.push(s.daycare.egg);
      s.daycare.egg = null;
      s.stats.eggs++;
      return true;
    },
    // Returns a scene when an egg hatches.
    hatchCheck() {
      const s = PW.Game.s;
      const egg = s.party.find(m => m.egg && m.eggSteps <= 0);
      if (!egg) return null;
      egg.egg = false;
      delete egg.eggSteps;
      egg.hp = Mon.maxHp(egg);
      egg.fr = 120;
      egg.met = Object.assign({}, egg.met || {}, { hatched: Date.now(), l: s.loc, r: s.region });
      const isNew = PW.Game.markCaught(egg.pid, egg.shiny);
      PW.Research.track('hatched', egg.pid);
      s.stats.hatched++;
      if (egg.shiny) s.stats.shinies++;
      PW.Game.log('Z jaja wykluł się ' + Mon.name(egg) + '!', 'good');
      return { title: 'Coś się dzieje!', text: 'Jajo pęka... Wykluwa się ' + (egg.shiny ? '✨ błyszczący ' : '') + Dex.mon(egg.pid).n + '!' + (isNew ? ' (Nowy wpis w Pokédexie!)' : ''),
        img: { mon: egg.pid, shiny: egg.shiny }, gain: true, choices: [], nickname: egg.uid };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
