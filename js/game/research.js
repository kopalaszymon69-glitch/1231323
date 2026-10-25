/* Pokédex research, as in Legends: Arceus. Each species has tasks (catch, defeat, see a move, evolve,
   hatch); finished steps give points and 100 points make research level 10. Level 10 adds one shiny
   roll for the species and perfect research (every step) three, like the Legends: Arceus bonus. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const Dex = PW.Dex;
  const Game = () => PW.Game;
  const NO_EGGS = 15;
  const moveCache = {};

  const Research = PW.Research = {
    data(sid) {
      const s = Game().s;
      s.research = s.research || {};
      return s.research[sid] || (s.research[sid] = {});
    },

    // The move to watch for: the species' own-type attack it learns latest up to Lv40.
    taskMove(sid) {
      if (sid in moveCache) return moveCache[sid];
      const pid = Dex.defaultForm(sid);
      const types = Dex.mon(pid).t;
      let best = null, bestLv = -1;
      for (const [lv, mid] of Dex.levelMoves(pid)) {
        const mv = Dex.move(mid);
        if (!mv || mv.z || mv.c === 0 || !mv.p || lv > 40) continue;
        const own = types.includes(mv.t);
        const score = (own ? 100 : 0) + lv;
        if (score > bestLv) { best = mid; bestLv = score; }
      }
      return (moveCache[sid] = best);
    },

    tasks(sid) {
      const sp = Dex.species(sid);
      const special = !!(sp.leg || sp.myth);
      const out = [
        { k: 'caught', label: 'Złap', steps: special ? [1] : [1, 2, 4, 6, 10], pts: special ? 70 : 10 },
        { k: 'defeated', label: 'Pokonaj w walce', steps: special ? [1] : [1, 3, 6, 10, 20], pts: 10 },
      ];
      const mv = Research.taskMove(sid);
      if (mv) out.push({ k: 'move', label: 'Zobacz, jak używa ruchu ' + Dex.move(mv).n, steps: [1, 3, 6], pts: 10, move: mv });
      if (sp.evo && sp.evo.length) out.push({ k: 'evolved', label: 'Ewoluuj', steps: [1, 3], pts: 10 });
      if (!special && !sp.eg.includes(NO_EGGS)) out.push({ k: 'hatched', label: 'Wykluj z jaja', steps: [1, 3], pts: 10 });
      return out;
    },

    // {points, level 0-10, perfect, tasks with progress}
    status(sid) {
      const d = (Game().s.research || {})[sid] || {};
      let points = 0, perfect = true;
      const tasks = Research.tasks(sid).map(t => {
        const have = d[t.k] || 0;
        const done = t.steps.filter(x => have >= x).length;
        points += done * t.pts;
        if (done < t.steps.length) perfect = false;
        return Object.assign({ have, done }, t);
      });
      return { points, level: Math.min(10, Math.floor(points / 10)), perfect, tasks };
    },

    // Extra shiny rolls for wild encounters and eggs of this species.
    shinyRolls(sid) {
      if (!Game().s || !(Game().s.research || {})[sid]) return 0;
      const st = Research.status(sid);
      return st.perfect ? 3 : st.level >= 10 ? 1 : 0;
    },

    track(kind, pid, n) {
      if (!Game().s || !Dex.mon(pid)) return;
      const sid = Dex.mon(pid).s;
      const before = Research.status(sid);
      const d = Research.data(sid);
      d[kind] = (d[kind] || 0) + (n || 1);
      const after = Research.status(sid);
      const name = Dex.species(sid).n;
      if (after.level >= 10 && before.level < 10) {
        Game().addTexp(10);
        Game().log('Badania ukończone: ' + name + '! Większa szansa na shiny tego gatunku.', 'gold');
        if (PW.UI) PW.UI.toast('🔬 Badania ukończone: ' + name + ' (poz. 10)! Większa szansa na shiny.', 'gold');
      } else if (after.perfect && !before.perfect) {
        Game().log('Perfekcyjne badania: ' + name + '!', 'gold');
        if (PW.UI) PW.UI.toast('🔬 Perfekcyjne badania: ' + name + '! Szansa na shiny jeszcze większa.', 'gold');
      } else if (after.level > before.level && PW.UI) {
        PW.UI.toast('🔬 Badania: ' + name + ' – poziom ' + after.level + '/10', 'good');
      }
    },

    // After a battle: defeated opponents and the task moves seen during it.
    afterBattle(b) {
      for (const m of b.sides[1].team) if (m.hp <= 0 && !m.egg) Research.track('defeated', m._basePid || m.pid);
      for (const [sid, mid] of b.movesSeen || []) if (Research.taskMove(sid) === mid) Research.track('move', Dex.defaultForm(sid));
    },

    completed() {
      return Object.keys(Game().s.research || {}).filter(sid => Research.status(+sid).level >= 10).length;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
