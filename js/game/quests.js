/* Professors, Pokédex rewards, daily quests and achievements. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const I = k => Dex.itemByKey(k);
  const Game = () => PW.Game;

  const DEX_REWARDS = [
    [0.1, [['great-ball', 10]], 'Dobry początek!'],
    [0.25, [['exp-candy-m', 3], ['rare-candy', 2]], 'Świetnie ci idzie!'],
    [0.4, [['lucky-egg', 1], ['ultra-ball', 10]], 'Imponujące!'],
    [0.6, [['amulet-coin', 1], ['ability-capsule', 1]], 'Wspaniale! Dostałeś też Tajemniczy Bilet – miejsca mitycznych Pokémonów stoją przed tobą otworem.'],
    [0.75, [['oval-charm', 1], ['bottle-cap', 2]], 'Niesamowite – Oval Charm przyspieszy znajdowanie jaj!'],
    [1.0, [['shiny-charm', 1], ['master-ball', 1]], 'Ukończyłeś regionalny Pokédex! Oto Shiny Charm – błyszczące Pokémony będą pojawiać się częściej!'],
  ];

  const DAILY_TYPES = [
    { id: 'catch', n: [3, 6], text: n => 'Złap ' + n + ' Pokémonów', reward: 600 },
    { id: 'catch-type', n: [2, 3], text: (n, t) => 'Złap ' + n + ' Pokémony typu ' + Dex.typeName(t), reward: 1000 },
    { id: 'trainers', n: [3, 6], text: n => 'Pokonaj ' + n + ' trenerów', reward: 900 },
    { id: 'wild', n: [5, 12], text: n => 'Pokonaj ' + n + ' dzikich Pokémonów', reward: 700 },
    { id: 'explore', n: [15, 30], text: n => 'Wybierz się na ' + n + ' wypraw', reward: 500 },
    { id: 'items', n: [3, 6], text: n => 'Znajdź ' + n + ' przedmiotów', reward: 600 },
    { id: 'evolve', n: [1, 2], text: n => 'Ewoluuj ' + n + ' Pokémona', reward: 1200 },
    { id: 'quiz', n: [1, 2], text: n => 'Odpowiedz poprawnie na ' + n + ' pytanie quizowe', reward: 800 },
  ];

  const ACH = [
    ['first-catch', 'Pierwszy łów', 'Złap pierwszego Pokémona.', s => s.stats.caught >= 1],
    ['catch-50', 'Kolekcjoner', 'Złap 50 Pokémonów.', s => s.stats.caught >= 50],
    ['catch-250', 'Wielki kolekcjoner', 'Złap 250 Pokémonów.', s => s.stats.caught >= 250],
    ['dex-151', 'Klasyka', 'Zarejestruj 151 gatunków.', s => Object.keys(s.dex.caught).length >= 151],
    ['dex-400', 'Encyklopedysta', 'Zarejestruj 400 gatunków.', s => Object.keys(s.dex.caught).length >= 400],
    ['dex-1025', 'Mistrz Pokédexu', 'Zarejestruj wszystkie 1025 gatunków.', s => Object.keys(s.dex.caught).length >= 1025],
    ['shiny', 'Błysk!', 'Złap błyszczącego Pokémona.', s => s.stats.shinies >= 1],
    ['shiny-10', 'Łowca blasku', 'Złap 10 błyszczących Pokémonów.', s => s.stats.shinies >= 10],
    ['radar-40', 'Mistrz radaru', 'Zbuduj łańcuch Poké Radaru długości 40.', s => ((s.hunt || {}).best || 0) >= 40],
    ['research-10', 'Badacz terenowy', 'Ukończ badania 10 gatunków w Pokédexie.', () => PW.Research.completed() >= 10],
    ['mystery-mon', 'Dar z wydarzenia', 'Odbierz mitycznego Pokémona z Tajemniczego Prezentu.', s => PW.Gifts.EVENT_MONS.some(([k]) => ((s.gift || {}).got || {})[k])],
    ['badge-1', 'Pierwsza odznaka', 'Zdobądź pierwszą odznakę.', s => Object.values(s.regions).some(r => r.badges.length >= 1)],
    ['badge-8', 'Komplet', 'Zdobądź wszystkie odznaki w jednym regionie.', s => PW.World.regions().some(r => s.regions[r.id].badges.length >= r.gyms.length)],
    ['badges-40', 'Wędrowiec', 'Zdobądź łącznie 40 odznak.', s => Object.values(s.regions).reduce((a, r) => a + r.badges.length, 0) >= 40],
    ['champion', 'Mistrz', 'Zostań Mistrzem dowolnego regionu.', s => Object.values(s.regions).some(r => r.champion)],
    ['champion-all', 'Legenda wszystkich regionów', 'Zostań Mistrzem wszystkich 9 regionów.', s => PW.World.regions().every(r => s.regions[r.id].champion)],
    ['legend', 'Spotkanie z legendą', 'Złap legendarnego Pokémona.', s => s.stats.legends >= 1],
    ['legend-10', 'Strażnik legend', 'Złap 10 legendarnych Pokémonów.', s => s.stats.legends >= 10],
    ['trainers-100', 'Pogromca trenerów', 'Pokonaj 100 trenerów.', s => s.stats.trainers >= 100],
    ['wins-500', 'Weteran', 'Wygraj 500 walk.', s => s.stats.wins >= 500],
    ['egg', 'Nowe życie', 'Wykluj jajo.', s => s.stats.hatched >= 1],
    ['egg-50', 'Hodowca', 'Wykluj 50 jaj.', s => s.stats.hatched >= 50],
    ['evolve-25', 'Ewolucja!', 'Doprowadź do 25 ewolucji.', s => s.stats.evolved >= 25],
    ['rich', 'Milioner', 'Zgromadź ₽1 000 000.', s => s.player.money >= 1000000],
    ['lvl100', 'Poziom 100', 'Wytrenuj Pokémona do poziomu 100.', s => PW.Game.allMons().some(m => m.lvl >= 100)],
    ['raid-10', 'Rajdowiec', 'Ukończ 10 rajdów.', s => s.stats.raids >= 10],
    ['factory-7', 'Fabryka Walk', 'Wygraj 7 walk z rzędu w Battle Factory.', s => s.factory.best >= 7],
    ['factory-21', 'Szef fabryki', 'Wygraj 21 walk z rzędu w Battle Factory.', s => s.factory.best >= 21],
    ['tlvl-25', 'Doświadczony trener', 'Osiągnij 25 poziom trenera.', s => s.player.tlvl >= 25],
    ['regions-5', 'Podróżnik', 'Odwiedź 5 regionów.', s => Object.values(s.regions).filter(r => Object.keys(r.visited).length).length >= 5],
    ['quiz-20', 'Profesor w przebraniu', 'Odpowiedz poprawnie na 20 pytań quizowych.', s => (s.stats.quiz || 0) >= 20],
    ['team-6', 'Pełna drużyna', 'Miej 6 Pokémonów w drużynie.', s => s.party.filter(m => !m.egg).length >= 6],
  ];

  const Quests = PW.Quests = {
    ACH,
    professorScene(regionId) {
      const reg = PW.World.region(regionId);
      const r = Game().reg(regionId);
      const prof = reg.prof[0];
      // Region starter (once per region)
      if (!r.starter) {
        return {
          title: prof, img: { trainer: reg.prof[1] },
          text: 'Witaj w regionie ' + reg.name + '! Każdy trener, który do nas przybywa, otrzymuje Pokémona na start. Wybierz jednego z trzech:',
          choices: reg.starters.map(pid => ({ label: Dex.mon(pid).n + ' (' + Dex.mon(pid).t.map(Dex.typeName).join('/') + ')', run: () => {
            r.starter = true;
            const m = Mon.create({ pid, level: 5, ot: Game().s.player.name, friendship: 70, met: { r: regionId, l: Game().s.loc, lvl: 5, d: Date.now(), how: 'gift' } });
            Game().addMon(m);
            return { title: 'Nowy partner!', text: Dex.mon(pid).n + ' dołącza do ciebie. Zaopiekuj się nim!', img: { mon: pid }, gain: true, choices: [] };
          } })).concat([{ label: 'Może później', run: () => null }]),
        };
      }
      const dex = Dex.data.core.dex[reg.dex] || [];
      const caught = Game().caughtCount(dex), seen = Game().seenCount(dex);
      const frac = dex.length ? caught / dex.length : 0;
      r.dexRewards = r.dexRewards || 0;
      const lines = [];
      let reward = '';
      while (r.dexRewards < DEX_REWARDS.length && frac >= DEX_REWARDS[r.dexRewards][0]) {
        const [, items, msg] = DEX_REWARDS[r.dexRewards];
        for (const [k, n] of items) { const id = I(k); if (id) Game().addItem(id, n); }
        reward += ' ' + msg + ' (Otrzymujesz: ' + items.map(([k, n]) => (Dex.item(I(k)) || { n: k }).n + (n > 1 ? ' ×' + n : '')).join(', ') + ')';
        r.dexRewards++;
      }
      lines.push('Twój Pokédex regionu ' + reg.name + ': widziane ' + seen + ', złapane ' + caught + ' z ' + dex.length + ' (' + Math.floor(frac * 100) + '%).');
      const next = DEX_REWARDS[r.dexRewards];
      if (next) lines.push('Następna nagroda przy ' + Math.ceil(next[0] * dex.length) + ' złapanych gatunkach.');
      const praise = frac >= 0.9 ? '"Jesteś prawdziwym badaczem!"' : frac >= 0.5 ? '"Wspaniała praca!"' : frac >= 0.2 ? '"Tak trzymaj!"' : '"Każdy wielki badacz zaczynał od pierwszego wpisu!"';
      return { title: prof, img: { trainer: reg.prof[1] }, text: praise + ' ' + lines.join(' ') + (reward ? ' ' + reward : ''), gain: !!reward, choices: [] };
    },

    // ---------------------------------------------------------------- daily
    daily() {
      const s = Game().s;
      const today = new Date().toDateString();
      if (!s.quests.daily || s.quests.daily.date !== today) {
        const rng = U.dayHash('daily');
        const types = DAILY_TYPES.slice();
        const list = [];
        for (let i = 0; i < 3; i++) {
          const t = types.splice((rng >> (i * 4)) % types.length, 1)[0];
          const n = t.n[0] + ((rng >> (i * 3 + 1)) % (t.n[1] - t.n[0] + 1));
          const type = (rng >> (i * 5 + 2)) % 18;
          list.push({ id: t.id, n, type, have: 0, done: false, claimed: false, text: t.text(n, type), reward: t.reward + n * 50 });
        }
        s.quests.daily = { date: today, list };
      }
      return s.quests.daily.list;
    },
    track(kind, data) {
      const s = Game().s;
      if (!s) return;
      const list = Quests.daily();
      for (const q of list) {
        if (q.done) continue;
        let inc = 0;
        if (q.id === kind) inc = 1;
        if (q.id === 'catch-type' && kind === 'catch' && data && Dex.mon(data.pid).t.includes(q.type)) inc = 1;
        if (inc) { q.have += inc; if (q.have >= q.n) { q.done = true; if (PW.UI) PW.UI.toast('Zadanie dnia ukończone: ' + q.text, 'good'); } }
      }
      Quests.checkAch();
    },
    claim(i) {
      const q = Quests.daily()[i];
      if (!q || !q.done || q.claimed) return false;
      q.claimed = true;
      Game().addMoney(q.reward);
      Game().addTexp(20);
      const bonus = I(U.pick(['rare-candy', 'exp-candy-m', 'ultra-ball', 'pp-up', 'bottle-cap', 'heart-scale']));
      if (bonus) Game().addItem(bonus, 1);
      return { money: q.reward, item: bonus };
    },
    checkAch() {
      const s = Game().s;
      for (const [id, name, , test] of ACH) {
        if (s.ach[id]) continue;
        let ok = false;
        try { ok = test(s); } catch (e) { ok = false; }
        if (ok) {
          s.ach[id] = Date.now();
          Game().log('Osiągnięcie: ' + name + '!', 'good');
          if (PW.UI) PW.UI.toast('🏅 Osiągnięcie: ' + name, 'gold');
        }
      }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
