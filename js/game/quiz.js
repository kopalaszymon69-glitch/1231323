/* Pokémon quiz event: questions generated from the real game data. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex;

  const REGION_GEN = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'];

  function randomSpecies(maxGen) {
    const ids = Object.keys(Dex.data.species).map(Number).filter(id => Dex.species(id).gen <= maxGen);
    return U.pick(ids);
  }

  const GENERATORS = [
    // Type of a Pokémon
    (b) => {
      const sid = randomSpecies(b >= 6 ? 9 : 4);
      const pid = Dex.defaultForm(sid);
      const p = Dex.mon(pid);
      const correct = Dex.typeName(p.t[0]);
      const opts = new Set([correct]);
      while (opts.size < 4) opts.add(Dex.typeName(U.int(0, 17)));
      return { q: 'Jaki jest główny typ Pokémona ' + p.n + '?', img: pid, a: correct, opts: U.shuffle([...opts]) };
    },
    // Type effectiveness
    () => {
      const atk = U.int(0, 17);
      const pairs = [];
      for (let d = 0; d < 18; d++) pairs.push([d, Dex.eff(atk, [d])]);
      const se = pairs.filter(x => x[1] > 1);
      if (!se.length) return null;
      const right = U.pick(se)[0];
      const wrong = U.shuffle(pairs.filter(x => x[1] <= 1).map(x => x[0])).slice(0, 3);
      return { q: 'Przeciwko któremu typowi atak typu ' + Dex.typeName(atk) + ' jest super skuteczny?', a: Dex.typeName(right), opts: U.shuffle([right, ...wrong].map(Dex.typeName)) };
    },
    // Immunity
    () => {
      const imm = [];
      for (let a = 0; a < 18; a++) for (let d = 0; d < 18; d++) if (Dex.eff(a, [d]) === 0) imm.push([a, d]);
      const [a, d] = U.pick(imm);
      const wrong = U.shuffle([...Array(18).keys()].filter(x => Dex.eff(a, [x]) > 0)).slice(0, 3);
      return { q: 'Który typ jest całkowicie odporny na ataki typu ' + Dex.typeName(a) + '?', a: Dex.typeName(d), opts: U.shuffle([d, ...wrong].map(Dex.typeName)) };
    },
    // Evolution
    (b) => {
      const all = Object.keys(Dex.data.species).map(Number).filter(id => { const s = Dex.species(id); return s.evo && s.evo.length && s.gen <= (b >= 5 ? 9 : 5); });
      const sid = U.pick(all);
      const s = Dex.species(sid);
      const to = Dex.mon(s.evo[0].to);
      const correct = Dex.species(to.s).n;
      const opts = new Set([correct]);
      while (opts.size < 4) opts.add(Dex.species(randomSpecies(9)).n);
      return { q: 'W co ewoluuje ' + s.n + '?', img: Dex.defaultForm(sid), a: correct, opts: U.shuffle([...opts]) };
    },
    // Home region
    () => {
      const sid = randomSpecies(9);
      const s = Dex.species(sid);
      const correct = REGION_GEN[s.gen - 1];
      const opts = new Set([correct]);
      while (opts.size < 4) opts.add(U.pick(REGION_GEN));
      return { q: 'Z którego regionu (generacji) pochodzi ' + s.n + '?', img: Dex.defaultForm(sid), a: correct, opts: U.shuffle([...opts]) };
    },
    // National Dex number
    () => {
      const sid = U.int(1, 151);
      const s = Dex.species(sid);
      const opts = new Set([sid]);
      while (opts.size < 4) opts.add(U.clamp(sid + U.int(-12, 12), 1, 1025));
      return { q: 'Jaki numer w Krajowym Pokédexie ma ' + s.n + '?', img: Dex.defaultForm(sid), a: '#' + sid, opts: U.shuffle([...opts]).map(x => '#' + x) };
    },
    // Move type
    () => {
      const ids = Object.keys(Dex.data.moves).map(Number).filter(id => { const m = Dex.move(id); return !m.z && m.p >= 60 && m.g <= 4; });
      const mv = Dex.move(U.pick(ids));
      const correct = Dex.typeName(mv.t);
      const opts = new Set([correct]);
      while (opts.size < 4) opts.add(Dex.typeName(U.int(0, 17)));
      return { q: 'Jakiego typu jest ruch ' + mv.n + '?', a: correct, opts: U.shuffle([...opts]) };
    },
    // Genus
    () => {
      const sid = randomSpecies(9);
      const s = Dex.species(sid);
      if (!s.gn) return null;
      const opts = new Set([s.n]);
      while (opts.size < 4) opts.add(Dex.species(randomSpecies(9)).n);
      return { q: 'Który Pokémon to „' + s.gn + '”?', a: s.n, opts: U.shuffle([...opts]) };
    },
  ];

  PW.Quiz = {
    make(badges) {
      for (let i = 0; i < 10; i++) {
        const q = U.pick(GENERATORS)(badges || 0);
        if (q && new Set(q.opts).size === q.opts.length) return q;
      }
      return GENERATORS[0](0);
    },
    scene(c) {
      const q = PW.Quiz.make(c.badges);
      const Game = PW.Game;
      return {
        title: 'Quiz Pokémon!', text: 'Uczeń Szkoły Trenerów zaczepia cię: "Sprawdźmy twoją wiedzę! ' + q.q + '"',
        img: q.img ? { mon: q.img } : { icon: '❓' },
        choices: q.opts.map(o => ({
          label: o, run: () => {
            if (o === q.a) {
              const reward = Dex.itemByKey(U.pick(c.badges >= 4 ? ['rare-candy', 'pp-up', 'ultra-ball', 'exp-candy-m', 'nugget'] : ['great-ball', 'super-potion', 'exp-candy-s', 'rare-candy']));
              Game.addItem(reward, 1);
              Game.addTexp(5);
              Game.s.stats.quiz = (Game.s.stats.quiz || 0) + 1;
              return { title: 'Dobrze!', text: '"Brawo! Prawidłowa odpowiedź to ' + q.a + '." Otrzymujesz ' + Dex.item(reward).n + '.', img: { item: reward }, gain: true, choices: [] };
            }
            return { title: 'Pudło...', text: '"Niestety! Prawidłowa odpowiedź to ' + q.a + '. Następnym razem się uda!"', img: { icon: '📚' }, choices: [] };
          },
        })),
      };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
