/* Exploration: location actions and the random event pool (wild Pokémon, trainers, items, story events). */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const Game = () => PW.Game;
  const W = () => PW.World;
  const I = k => Dex.itemByKey(k);

  // ---------------------------------------------------------------- loot tables
  const LOOT = [
    ['potion', 'poke-ball', 'antidote', 'paralyze-heal', 'oran-berry', 'pecha-berry', 'cheri-berry', 'escape-rope', 'repel', 'awakening'],
    ['super-potion', 'great-ball', 'burn-heal', 'ice-heal', 'ether', 'x-attack', 'x-defense', 'x-speed', 'tiny-mushroom', 'sitrus-berry',
      'rawst-berry', 'aspear-berry', 'persim-berry', 'chesto-berry', 'leppa-berry', 'super-repel', 'honey'],
    ['hyper-potion', 'ultra-ball', 'full-heal', 'revive', 'elixir', 'pearl', 'stardust', 'big-mushroom', 'net-ball', 'nest-ball',
      'dusk-ball', 'heart-scale', 'exp-candy-s', 'lum-berry', 'quick-ball', 'timer-ball', 'max-repel'],
    ['max-potion', 'full-restore', 'max-revive', 'max-ether', 'max-elixir', 'big-pearl', 'star-piece', 'nugget', 'exp-candy-m',
      'exp-candy-l', 'pp-up', 'rare-candy', 'comet-shard'],
  ];
  const RARE_LOOT = ['rare-candy', 'pp-up', 'pp-max', 'bottle-cap', 'ability-capsule', 'big-nugget', 'exp-candy-xl', 'master-ball'];
  const KIND_LOOT = {
    cave: ['fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone', 'sun-stone', 'shiny-stone', 'dusk-stone',
      'dawn-stone', 'ice-stone', 'hard-stone', 'everstone', 'star-piece', 'rare-bone', 'red-shard', 'blue-shard', 'yellow-shard', 'green-shard'],
    mountain: ['hard-stone', 'everstone', 'moon-stone', 'rare-bone', 'sun-stone', 'dusk-stone'],
    beach: ['pearl', 'big-pearl', 'star-piece', 'mystic-water', 'shoal-salt', 'shoal-shell', 'stardust', 'heart-scale'],
    sea: ['pearl', 'big-pearl', 'mystic-water', 'heart-scale', 'dive-ball', 'water-stone', 'prism-scale', 'deep-sea-tooth', 'deep-sea-scale'],
    forest: ['miracle-seed', 'silver-powder', 'leaf-stone', 'tiny-mushroom', 'big-mushroom', 'balm-mushroom', 'net-ball'],
    volcano: ['charcoal', 'fire-stone', 'heat-rock', 'magmarizer', 'flame-orb'],
    snow: ['never-melt-ice', 'ice-stone', 'icy-rock', 'snowball'],
    desert: ['soft-sand', 'sun-stone', 'smooth-rock', 'rare-bone'],
    tower: ['spell-tag', 'cleanse-tag', 'reaper-cloth', 'dusk-stone'],
    ruins: ['odd-keystone', 'relic-gold', 'relic-silver', 'relic-copper', 'dusk-stone', 'dawn-stone'],
    building: ['up-grade', 'magnet', 'electirizer', 'protector', 'dubious-disc', 'metal-coat', 'cell-battery'],
    city: ['lemonade', 'soda-pop', 'fresh-water', 'moomoo-milk', 'premier-ball', 'luxury-ball'],
    town: ['fresh-water', 'moomoo-milk', 'oran-berry', 'premier-ball'],
    meadow: ['miracle-seed', 'leaf-stone', 'sweet-heart', 'honey', 'sun-stone'],
    marsh: ['mystic-water', 'big-root', 'black-sludge', 'damp-rock'],
    lake: ['mystic-water', 'water-stone', 'damp-rock'],
  };
  const BERRIES = ['oran-berry', 'sitrus-berry', 'pecha-berry', 'cheri-berry', 'chesto-berry', 'rawst-berry', 'aspear-berry',
    'persim-berry', 'leppa-berry', 'lum-berry', 'figy-berry', 'wiki-berry', 'mago-berry', 'aguav-berry', 'iapapa-berry',
    'pomeg-berry', 'kelpsy-berry', 'qualot-berry', 'hondew-berry', 'grepa-berry', 'tamato-berry', 'occa-berry', 'passho-berry',
    'wacan-berry', 'rindo-berry', 'yache-berry', 'chople-berry', 'kebia-berry', 'shuca-berry', 'coba-berry', 'payapa-berry',
    'tanga-berry', 'charti-berry', 'kasib-berry', 'haban-berry', 'colbur-berry', 'babiri-berry', 'roseli-berry', 'chilan-berry',
    'liechi-berry', 'ganlon-berry', 'salac-berry', 'petaya-berry', 'apicot-berry'];
  const FOSSILS = {
    kanto: ['helix-fossil', 'dome-fossil', 'old-amber'], johto: ['helix-fossil', 'dome-fossil', 'old-amber'],
    hoenn: ['root-fossil', 'claw-fossil'], sinnoh: ['skull-fossil', 'armor-fossil', 'helix-fossil', 'dome-fossil', 'root-fossil', 'claw-fossil', 'old-amber'],
    unova: ['cover-fossil', 'plume-fossil', 'skull-fossil', 'armor-fossil'], kalos: ['jaw-fossil', 'sail-fossil', 'old-amber'],
    alola: ['skull-fossil', 'armor-fossil', 'cover-fossil', 'plume-fossil', 'jaw-fossil', 'sail-fossil', 'helix-fossil', 'dome-fossil', 'root-fossil', 'claw-fossil'],
    galar: ['fossilized-bird', 'fossilized-fish', 'fossilized-drake', 'fossilized-dino'], paldea: [],
  };
  // Pokémon each fossil revives into (accurate pairs).
  const FOSSIL_MON = {
    'helix-fossil': 'omanyte', 'dome-fossil': 'kabuto', 'old-amber': 'aerodactyl', 'root-fossil': 'lileep', 'claw-fossil': 'anorith',
    'skull-fossil': 'cranidos', 'armor-fossil': 'shieldon', 'cover-fossil': 'tirtouga', 'plume-fossil': 'archen', 'jaw-fossil': 'tyrunt',
    'sail-fossil': 'amaura',
  };
  const GALAR_FOSSILS = { 'fossilized-bird+fossilized-drake': 'dracozolt', 'fossilized-bird+fossilized-dino': 'arctozolt',
    'fossilized-fish+fossilized-drake': 'dracovish', 'fossilized-fish+fossilized-dino': 'arctovish' };

  function itemTier(badges) { return badges >= 6 ? 3 : badges >= 4 ? 2 : badges >= 2 ? 1 : 0; }
  function randomLoot(regionId, loc) {
    const b = Game().badges(regionId) + (Game().isChampion(regionId) ? 2 : 0);
    const tier = itemTier(b);
    if (U.chance(0.03)) return I(U.pick(RARE_LOOT.slice(0, b >= 8 ? 8 : 6)));
    if (KIND_LOOT[loc.k] && U.chance(0.3)) { const id = I(U.pick(KIND_LOOT[loc.k])); if (id) return id; }
    const t = U.chance(0.25) ? Math.max(0, tier - 1) : tier;
    return I(U.pick(LOOT[t])) || I('potion');
  }

  function scene(o) { return Object.assign({ title: '', text: '', choices: [] }, o); }
  function monName(pid) { return Dex.mon(pid).n; }

  // ---------------------------------------------------------------- wild encounters
  function wildScene(regionId, loc, method, o) {
    o = o || {};
    const pick = o.pick || W().pickWild(regionId, loc, method);
    if (!pick) return scene({ title: 'Cisza', text: 'Nic się tu nie pojawiło.', img: { icon: '🍃' } });
    const lead = Game().lead();
    if (Game().s.repel > 0 && lead && pick.level < lead.lvl && !o.force) {
      return scene({ title: 'Repel działa', text: 'Słabe dzikie Pokémony trzymają się z daleka.', img: { icon: '🧴' } });
    }
    const mon = W().makeWild(pick.pid, pick.level, { swarm: pick.swarm, shiny: o.shiny, perfectIvs: o.perfectIvs, hiddenChance: o.hiddenChance });
    return scene({
      battle: { kind: 'wild', foe: { team: [mon], ai: 'wild', totem: o.totem, raid: o.raid, noRun: o.noRun }, env: { method, locKind: loc.k }, tag: o.tag || 'wild', onEnd: o.onEnd },
    });
  }

  // ---------------------------------------------------------------- trainer battles
  function trainerScene(t, o) {
    o = o || {};
    return scene({
      battle: { kind: 'trainer', foe: { name: t.name, title: t.title, sprite: t.sprite, team: t.team, ai: t.ai || 'trainer', items: t.items || [], prize: t.prize, flags: t.flags || {} },
        env: { locKind: (W().here() || {}).k }, tag: o.tag || 'trainer', onEnd: o.onEnd, intro: o.intro },
    });
  }

  // ---------------------------------------------------------------- random events
  // Each event: {id, w (weight), when(ctx) -> bool, run(ctx) -> scene}
  const EVENTS = [
    {
      id: 'berry', w: 8, when: c => ['route', 'forest', 'meadow', 'wild', 'town', 'marsh', 'island', 'beach'].includes(c.loc.k),
      run(c) {
        const b = Game().badges(c.region);
        const pool = BERRIES.slice(0, b >= 6 ? BERRIES.length : b >= 3 ? 39 : 21);
        const got = [];
        const n = U.int(1, 3);
        for (let i = 0; i < n; i++) { const id = I(U.pick(pool)); if (id) { Game().addItem(id, 1); got.push(Dex.item(id).n); } }
        return scene({ title: 'Krzak jagód', text: 'Znajdujesz drzewko jagodowe i zrywasz: ' + got.join(', ') + '.', img: { item: I(pool[0]) }, gain: true });
      },
    },
    {
      id: 'hidden-item', w: 9, when: () => true,
      run(c) {
        const id = randomLoot(c.region, c.loc);
        const n = Dex.item(id).k.includes('ball') && U.chance(0.4) ? U.int(2, 3) : 1;
        Game().addItem(id, n);
        const txt = Game().has('dowsing-machine') ? 'Dowsing Machine zaczyna piszczeć! ' : '';
        return scene({ title: 'Znaleziony przedmiot', text: txt + 'Znajdujesz ' + Dex.item(id).n + (n > 1 ? ' ×' + n : '') + '!', img: { item: id }, gain: true });
      },
    },
    {
      id: 'money', w: 3, when: () => true,
      run(c) {
        const amt = U.int(1, 6) * 50 * (1 + Game().badges(c.region));
        Game().addMoney(amt);
        return scene({ title: 'Zgubiony portfel', text: 'Na ścieżce leży zgubiony portfel. Właściciela nie widać... Zabierasz ' + U.money(amt) + ' i obiecujesz sobie oddać je do Centrum Pokémon.', img: { icon: '👛' }, gain: true });
      },
    },
    {
      id: 'nurse', w: 2, when: c => c.loc.k !== 'town' && c.loc.k !== 'city',
      run() {
        Game().healParty();
        return scene({ title: 'Wędrowna pielęgniarka', text: 'Siostra Joy wracająca z dyżuru zauważa twoje zmęczone Pokémony i bezinteresownie je leczy. "Wszystkie są w pełni sił!"', img: { trainer: 'nurse' }, gain: true });
      },
    },
    {
      id: 'rustle', w: 4, when: c => c.walk,
      run(c) {
        return Object.assign(wildScene(c.region, c.loc, 'walk', { perfectIvs: 3, hiddenChance: 0.3, force: true, tag: 'rustle' }),
          { prelude: 'Trawa intensywnie szeleści... To silny Pokémon!' });
      },
    },
    {
      id: 'outbreak', w: 2, when: c => c.walk && !(Game().s.swarm && Game().s.swarm.left > 0),
      run(c) {
        const rows = (c.loc.w.walk || []);
        let swarmRows = rows.filter(e => (e[4] || []).includes('swarm-yes'));
        let pick;
        if (swarmRows.length) {
          const e = swarmRows[U.dayHash(c.loc.id) % swarmRows.length];
          pick = { pid: e[0], lo: e[2], hi: e[3] };
        } else {
          const tbl = W().table(c.region, c.loc, 'walk');
          if (!tbl.length) return null;
          const e = U.pick(tbl);
          pick = { pid: e.pid, lo: e.lo, hi: e.hi };
        }
        Game().s.swarm = { region: c.region, loc: c.loc.id, pid: pick.pid, lo: pick.lo, hi: pick.hi, left: 25 };
        Game().markSeen(pick.pid);
        return scene({ title: 'Wysyp Pokémonów!', text: 'W okolicy pojawiło się mnóstwo Pokémonów ' + monName(pick.pid) + '! Przez najbliższe wyprawy będą tu bardzo częste – a szansa na shiny jest większa.', img: { mon: pick.pid }, gain: true });
      },
    },
    {
      id: 'shiny', w: 0.15, when: c => c.walk,
      run(c) { return Object.assign(wildScene(c.region, c.loc, 'walk', { shiny: true, force: true, tag: 'shiny' }), { prelude: 'Coś błyszczy w trawie...!' }); },
    },
    {
      id: 'villain', w: 4, when: c => !['town'].includes(c.loc.k) && c.badges >= 1,
      run(c) {
        const reg = W().region(c.region);
        const v = reg.villain;
        const sprite = v.grunt2 && U.chance(0.5) ? v.grunt2 : v.grunt;
        const team = W().villainTeam(c.region, false);
        const t = { name: 'Grunt', title: v.team, sprite, team, prize: 30 * team[team.length - 1].lvl, ai: 'trainer' };
        const intros = [
          'Członek ' + v.team + ' zagradza ci drogę! "Twoje Pokémony przydadzą się naszemu szefowi!"',
          'Słyszysz krzyk – członek ' + v.team + ' próbuje ukraść Pokémona małemu chłopcu! Stajesz do walki!',
          '"Hej, ty! Widziałeś za dużo!" – członek ' + v.team + ' rzuca Poké Balla.',
        ];
        return Object.assign(trainerScene(t, {
          tag: 'villain',
          onEnd(res) {
            if (res !== 'win') return null;
            const r = Game().reg(c.region);
            r.villain = (r.villain || 0) + 1;
            const reward = I(U.pick(['ultra-ball', 'hyper-potion', 'revive', 'full-heal', 'great-ball', 'nugget']));
            Game().addItem(reward, 1);
            return scene({ title: v.team + ' ucieka!', text: '"Zapamiętamy to!" – grunt ucieka, gubiąc ' + Dex.item(reward).n + '. Mieszkańcy dziękują ci za pomoc.', img: { item: reward }, gain: true });
          },
        }), { prelude: U.pick(intros) });
      },
    },
    {
      id: 'villain-boss', w: 2, when: c => c.badges >= 5 && !Game().reg(c.region).flags.villainBoss && (Game().reg(c.region).villain || 0) >= 2,
      run(c) {
        const reg = W().region(c.region);
        const v = reg.villain;
        const team = W().villainTeam(c.region, true);
        const t = { name: v.boss, title: 'Szef ' + v.team, sprite: v.sprite, team, prize: 100 * team[team.length - 1].lvl, ai: 'elite',
          items: [I('hyper-potion'), I('hyper-potion')] };
        return Object.assign(trainerScene(t, {
          tag: 'villain-boss',
          onEnd(res) {
            if (res !== 'win') return null;
            Game().reg(c.region).flags.villainBoss = true;
            Game().addItem(I('master-ball'), 1);
            Game().addTexp(40);
            return scene({ title: 'Plany ' + v.team + ' pokrzyżowane!', text: v.boss + ' przyznaje się do porażki. W kryjówce znajdujesz prototyp Master Balla – kulę, która łapie każdego Pokémona!', img: { item: I('master-ball') }, gain: true });
          },
        }), { prelude: 'Wpadasz na trop głównej kryjówki ' + v.team + '. Na końcu korytarza czeka sam ' + v.boss + '!' });
      },
    },
    {
      id: 'rival', w: 5, when: c => {
        const r = Game().reg(c.region);
        const need = [0, 2, 4, 6, 8][r.rival];
        return r.rival < 5 && c.badges >= need && !r.champion && ['route', 'city', 'town', 'cave', 'forest', 'wild'].includes(c.loc.k) && Game().ableCount() > 0;
      },
      run(c) {
        const reg = W().region(c.region);
        const r = Game().reg(c.region);
        const team = W().rivalTeam(c.region, r.rival);
        const t = { name: reg.rival.name, title: 'Rywal', sprite: reg.rival.sprite, team, prize: 35 * team[team.length - 1].lvl, ai: 'gym' };
        return Object.assign(trainerScene(t, {
          tag: 'rival',
          onEnd(res) {
            r.rival++;
            if (res !== 'win') return scene({ title: 'Porażka z rywalem', text: reg.rival.name + ': "Jeszcze dużo nauki przed tobą! Do zobaczenia!"', img: { trainer: reg.rival.sprite } });
            Game().addTexp(15);
            const gift = I(['great-ball', 'super-potion', 'revive', 'ultra-ball', 'rare-candy'][Math.min(4, r.rival - 1)]);
            Game().addItem(gift, r.rival >= 4 ? 1 : 3);
            return scene({ title: 'Wygrana z rywalem!', text: reg.rival.name + ': "Ech, jesteś coraz lepszy! Masz, weź to – przyda ci się." Otrzymujesz ' + Dex.item(gift).n + '.', img: { trainer: reg.rival.sprite }, gain: true });
          },
        }), { prelude: reg.rival.name + ' wybiega zza zakrętu! "Hej! Sprawdźmy, kto trenuje lepiej!"' });
      },
    },
    {
      id: 'egg', w: 1.2, when: c => Game().s.party.length < 6,
      run(c) {
        const reg = W().region(c.region);
        const dex = Dex.data.core.dex[reg.dex] || [];
        const babies = dex.filter(sid => { const s = Dex.species(sid); return !s.ef && !s.leg && !s.myth && s.eg.indexOf(15) < 0; });
        const sid = U.pick(babies.length ? babies : dex);
        const pid = Dex.defaultForm(Dex.baseSpecies(sid));
        const egg = Mon.createEgg(pid, { ot: Game().s.player.name, met: { r: c.region, l: c.loc.id, d: Date.now(), how: 'egg' }, perfectIvs: 2 });
        Game().addMon(egg);
        Game().s.stats.eggs++;
        return scene({ title: 'Tajemnicze jajo', text: 'Starsza pani z pobliskiej hodowli wręcza ci jajo: "Nie mam już miejsca, a ty wyglądasz na dobrego trenera. Będzie się wykluwać, gdy będziesz podróżować."', img: { icon: '🥚' }, gain: true });
      },
    },
    {
      id: 'quiz', w: 3, when: () => true,
      run(c) { return PW.Quiz.scene(c); },
    },
    {
      id: 'fossil', w: 2.5, when: c => ['cave', 'mountain', 'desert', 'ruins', 'beach'].includes(c.loc.k) && (FOSSILS[c.region] || []).length,
      run(c) {
        const id = I(U.pick(FOSSILS[c.region]));
        if (!id) return null;
        Game().addItem(id, 1);
        return scene({ title: 'Skamielina!', text: 'Kopiąc w skałach znajdujesz ' + Dex.item(id).n + '! W laboratorium skamielin można przywrócić ją do życia.', img: { item: id }, gain: true });
      },
    },
    {
      id: 'tm', w: 1.5, when: c => c.badges >= 1,
      run(c) {
        const tms = Dex.data.core.tms;
        const n = Math.min(tms.length, 40 + c.badges * 22);
        const mid = U.pick(tms.slice(0, n))[1];
        Game().addTM(mid);
        return scene({ title: 'TM!', text: 'Na ziemi leży płyta TM. To ' + Dex.move(mid).n + '!', img: { tm: mid }, gain: true });
      },
    },
    {
      id: 'pokefan', w: 2, when: c => ['route', 'city', 'town', 'meadow', 'beach'].includes(c.loc.k),
      run(c) {
        const lead = Game().lead();
        const gifts = ['moomoo-milk', 'lemonade', 'fresh-water', 'soda-pop', 'super-potion', 'great-ball', 'luxury-ball', 'heal-ball'];
        const id = I(U.pick(gifts));
        Game().addItem(id, U.int(1, 3));
        if (lead) Mon.addFriendship(lead, 3);
        return scene({ title: 'Zachwycony Pokéfan', text: '"Ojej, jaki uroczy ' + (lead ? Mon.name(lead) : 'Pokémon') + '! Proszę, weź to w prezencie!" Otrzymujesz ' + Dex.item(id).n + '.', img: { trainer: 'pokefan' }, gain: true });
      },
    },
    {
      id: 'weather', w: 1.5, when: c => ['route', 'wild', 'meadow', 'forest', 'beach', 'sea', 'lake', 'marsh'].includes(c.loc.k),
      run(c) {
        const cond = U.pick(['weather-raining', 'weather-raining', 'weather-intense-sun', 'weather-fog', c.loc.k === 'beach' ? 'weather-raining' : 'weather-overcast']);
        Game().s.weatherOverride[c.region + '/' + c.loc.id] = { cond, until: Date.now() + 15 * 60000 };
        const info = W().weatherInfo(cond);
        return scene({ title: 'Zmiana pogody', text: 'Niebo się zmienia: ' + info.label.toLowerCase() + '. Inne Pokémony mogą się teraz pojawiać, a walki odbywają się w tej pogodzie.', img: { icon: info.icon } });
      },
    },
    {
      id: 'roamer', w: 1.5, when: c => {
        const reg = W().region(c.region);
        return (reg.roam || []).some(r => World_roamOK(c, r));
      },
      run(c) {
        const reg = W().region(c.region);
        const list = reg.roam.filter(r => World_roamOK(c, r));
        const r = U.pick(list);
        const key = c.region + ':' + r.p;
        const st = Game().s.roamers[key] || (Game().s.roamers[key] = { hp: null, st: null, ivs: null, seen: 0 });
        st.seen++;
        const mon = W().makeWild(r.p, r.l, { perfectIvs: 3 });
        if (st.ivs) mon.iv = st.ivs.slice(); else st.ivs = mon.iv.slice();
        if (st.hp !== null) mon.hp = Math.min(Mon.maxHp(mon), st.hp);
        mon.st = st.st;
        return scene({
          prelude: 'Przez trawę przemyka legendarny ' + monName(r.p) + '! To wędrujący Pokémon – może uciec w każdej chwili!',
          battle: { kind: 'wild', foe: { team: [mon], ai: 'wild', roamer: key }, env: { method: 'walk', locKind: c.loc.k }, tag: 'roamer',
            onEnd(res, b) {
              if (res === 'caught' || res === 'win') { delete Game().s.roamers[key]; Game().reg(c.region).flags['roam:' + r.p] = 1; if (res === 'caught') Game().s.stats.legends++; }
              else { st.hp = mon.hp; st.st = mon.st; }
              return null;
            } },
        });
      },
    },
    {
      id: 'ultra-wormhole', w: 1.2, when: c => c.region === 'alola' && Game().isChampion('alola'),
      run(c) {
        const ubs = ['nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord', 'poipole', 'stakataka', 'blacephalon'];
        const pid = Dex.monByKey(U.pick(ubs));
        const mon = W().makeWild(pid, U.int(55, 65), { perfectIvs: 3 });
        return scene({ prelude: 'W powietrzu otwiera się Ultra Tunel! Wyłania się z niego Ultra Bestia ' + monName(pid) + '!',
          battle: { kind: 'wild', foe: { team: [mon], ai: 'trainer' }, env: { method: 'walk', locKind: c.loc.k }, tag: 'ultra' } });
      },
    },
    {
      id: 'raid', w: 3, when: c => !!(c.loc.w && c.loc.w.raid) || (c.region === 'paldea' && c.loc.lv && c.badges >= 1),
      run(c) { return raidScene(c); },
    },
    {
      id: 'gimmighoul', w: 3, when: c => c.region === 'paldea',
      run(c) {
        const n = U.int(1, 5);
        Game().addItem(I('gimmighoul-coin'), n);
        if (U.chance(0.25)) {
          const pid = Dex.monByKey(U.chance(0.5) ? 'gimmighoul' : 'gimmighoul-roaming');
          return Object.assign(wildScene(c.region, c.loc, 'walk', { pick: { pid: pid || Dex.monByKey('gimmighoul'), level: U.int(c.loc.lv ? c.loc.lv[0] : 10, c.loc.lv ? c.loc.lv[1] : 20) }, force: true }),
            { prelude: 'Znajdujesz ' + n + ' Gimmighoul Coin... ale skrzynia się poruszyła! To Gimmighoul!' });
        }
        return scene({ title: 'Monety Gimmighoula', text: 'Znajdujesz ' + n + ' Gimmighoul Coin. Podobno 999 monet sprawi, że Gimmighoul ewoluuje!', img: { item: I('gimmighoul-coin') }, gain: true });
      },
    },
    {
      id: 'mega-stone', w: 1, when: c => Game().has('mega-ring'),
      run(c) {
        const stones = Object.values(Dex.data.pokemon).filter(p => p.ms && p.mega && !p.k.includes('primal')).map(p => p.ms);
        const owned = new Set(Object.keys(Game().s.bag.items).map(Number));
        const left = stones.filter(id => !owned.has(id));
        if (!left.length) return null;
        const id = U.pick(left);
        Game().addItem(id, 1);
        return scene({ title: 'Mega Kamień!', text: 'Coś mieni się tęczą... To ' + Dex.item(id).n + '! Daj go odpowiedniemu Pokémonowi, by mógł Mega Ewoluować.', img: { item: id }, gain: true });
      },
    },
    {
      id: 'z-crystal', w: 1, when: c => Game().has('z-ring') && c.region === 'alola',
      run() {
        const cr = Object.keys(PW.BD.Z_CRYSTALS).map(I).filter(id => id && !Game().count(id));
        if (!cr.length) return null;
        const id = U.pick(cr);
        Game().addItem(id, 1);
        return scene({ title: 'Kryształ Z!', text: 'Na kamiennym postumencie leży ' + Dex.item(id).n + '!', img: { item: id }, gain: true });
      },
    },
    {
      id: 'tera-shard', w: 2, when: c => c.region === 'paldea',
      run() {
        const shards = Object.values(Dex.data.items).filter(it => it.k.endsWith('-tera-shard'));
        if (!shards.length) return null;
        const it = U.pick(shards);
        const id = Dex.itemByKey(it.k);
        Game().addItem(id, U.int(1, 3));
        return scene({ title: 'Odłamek Tera', text: 'Znajdujesz ' + it.n + '. 50 odłamków zmienia Typ Tera Pokémona (w Centrum Pokémon).', img: { item: id }, gain: true });
      },
    },
    {
      id: 'pokerus', w: 0.3, when: () => Game().s.party.some(m => !m.egg && !m.pkrs),
      run() {
        const m = U.pick(Game().s.party.filter(x => !x.egg));
        m.pkrs = true;
        return scene({ title: 'Pokérus!', text: Mon.name(m) + ' wydaje się w niesamowitej formie! W Centrum Pokémon mówią, że to Pokérus – nieszkodliwy wirus, który podwaja zdobywane punkty wysiłku (EV).', img: { mon: m.pid, shiny: m.shiny }, gain: true });
      },
    },
    {
      id: 'friend', w: 2, when: () => Game().lead(),
      run() {
        const m = Game().lead();
        Mon.addFriendship(m, 5);
        const lines = [
          Mon.name(m) + ' radośnie biegnie przed tobą i bawi się w liściach.',
          Mon.name(m) + ' przytula się do ciebie. Wygląda na bardzo szczęśliwego!',
          'Odpoczywasz chwilę z ' + Mon.name(m) + ' w cieniu drzewa. Wasza więź się zacieśnia.',
          Mon.name(m) + ' znajduje ładny kamyk i z dumą ci go pokazuje.',
        ];
        return scene({ title: 'Chwila odpoczynku', text: U.pick(lines), img: { mon: m.pid, shiny: m.shiny } });
      },
    },
    {
      id: 'bug-contest', w: 6, when: c => c.region === 'johto' && c.loc.id === 'national-park' && ['tuesday', 'thursday', 'saturday'].includes(U.weekday()) && !Game().reg('johto').flags['contest:' + new Date().toDateString()],
      run(c) {
        Game().reg('johto').flags['contest:' + new Date().toDateString()] = 1;
        const bugs = ['caterpie', 'metapod', 'butterfree', 'weedle', 'kakuna', 'beedrill', 'paras', 'venonat', 'scyther', 'pinsir', 'ledyba', 'spinarak', 'nincada', 'kricketot', 'combee', 'sewaddle', 'venipede', 'karrablast', 'shelmet'].map(k => Dex.monByKey(k)).filter(Boolean);
        const pid = U.pick(bugs);
        const mon = W().makeWild(pid, U.int(10, 20), { perfectIvs: 1 });
        return scene({ prelude: 'Dziś w Parku Narodowym odbywa się Bug-Catching Contest! Złap najładniejszego robaka. Pojawia się ' + monName(pid) + '!',
          battle: { kind: 'wild', foe: { team: [mon], ai: 'wild' }, env: { method: 'walk', locKind: 'meadow' }, tag: 'contest',
            onEnd(res) {
              if (res !== 'caught') return scene({ title: 'Konkurs zakończony', text: 'Niestety nic nie złapałeś. Spróbuj w kolejny wtorek, czwartek lub sobotę!', img: { icon: '🐛' } });
              const prize = I(U.pick(['sun-stone', 'moon-stone', 'everstone', 'shiny-stone', 'gold-bottle-cap'])) || I('sun-stone');
              Game().addItem(prize, 1);
              return scene({ title: 'Wygrywasz konkurs!', text: 'Sędziowie są zachwyceni twoim ' + monName(pid) + '! Nagroda: ' + Dex.item(prize).n + '.', img: { item: prize }, gain: true });
            } },
        });
      },
    },
    {
      id: 'swimmer-help', w: 1, when: c => ['sea', 'beach', 'lake'].includes(c.loc.k),
      run() {
        const id = I(U.pick(['dive-ball', 'net-ball', 'mystic-water', 'pearl', 'big-pearl']));
        Game().addItem(id, 1);
        return scene({ title: 'Pływak w opałach', text: 'Pomagasz zmęczonemu pływakowi dotrzeć do brzegu. W podzięce daje ci ' + Dex.item(id).n + '.', img: { trainer: 'swimmer' }, gain: true });
      },
    },
  ];

  function World_roamOK(c, r) {
    const flags = Game().reg(c.region).flags;
    if (flags['roam:' + r.p]) return false;
    if (c.loc.k === 'town' || c.loc.k === 'city' || c.loc.k === 'building') return false;
    const conds = r.c || [];
    const ctx = W().context(c.region, c.loc);
    if (!conds.every(x => W().condOK(x, ctx))) return false;
    if (!conds.includes('postgame') && c.badges < 5 && !Game().isChampion(c.region)) return false;
    return true;
  }

  function raidScene(c) {
    let pick = null;
    const champ = Game().isChampion(c.region);
    if (c.loc.w && c.loc.w.raid) {
      const rows = c.loc.w.raid.filter(e => (e[4] || []).every(x => !x.startsWith('max-den-rarity-rare') || U.chance(0.5)));
      const e = U.weighted(rows.length ? rows : c.loc.w.raid, x => x[1]);
      const lvl = champ ? U.int(Math.max(e[2], 50), Math.max(e[3], 60)) : U.int(e[2], Math.max(e[2], Math.min(e[3], 15 + c.badges * 6)));
      pick = { pid: e[0], level: lvl };
    } else {
      const tbl = W().table(c.region, c.loc, 'walk');
      if (!tbl.length) return null;
      const e = U.weighted(tbl, x => x.w);
      pick = { pid: e.pid, level: U.clamp(e.hi + 5 + c.badges * 2, 10, 100) };
    }
    const galar = c.region === 'galar';
    const mon = W().makeWild(pick.pid, pick.level, { perfectIvs: galar ? 2 : 3, hiddenChance: 0.1 });
    if (!galar) mon.tera = U.int(0, 17);
    mon.moves = W().bestMoves(mon.pid, mon.lvl).map(id => ({ id, pp: Dex.move(id).pp, up: 0 }));
    return scene({
      prelude: galar ? 'Z jaskini Max Raid Den bije czerwone światło! W środku czeka Dynamaxowany ' + monName(pick.pid) + '!'
        : 'Lśniący kryształ Tera! W środku czeka Terastalizowany ' + monName(pick.pid) + ' (' + Dex.typeName(mon.tera) + ')!',
      battle: { kind: 'wild', foe: { team: [mon], ai: 'gym', raid: galar ? 'dyna' : 'tera', noRun: false }, env: { method: 'walk', locKind: c.loc.k }, tag: 'raid',
        onEnd(res) {
          if (res === 'win') {
            const reward0 = finishRaid(galar);
            return scene({ title: 'Rajd wygrany!', text: monName(mon.pid) + ' jest osłabiony. ' + reward0 + ' Możesz spróbować go złapać!', img: { mon: mon.pid, shiny: mon.shiny },
              choices: [{ label: 'Rzuć Poké Ballem', run: () => {
                const chance = galar ? 0.7 : 1;
                if (U.chance(chance)) {
                  mon.hp = Mon.maxHp(mon); mon.st = null;
                  mon.ball = I('poke-ball');
                  mon.ot = Game().s.player.name;
                  const isNew = Game().markCaught(mon.pid, mon.shiny);
                  Game().addMon(mon); Game().s.stats.caught++;
                  PW.Quests.track('catch', { pid: mon.pid });
                  return scene({ title: 'Złapany!', text: monName(mon.pid) + ' zostaje złapany!' + (isNew ? ' Nowy wpis w Pokédexie!' : ''), img: { mon: mon.pid, shiny: mon.shiny }, gain: true });
                }
                return scene({ title: 'Uciekł!', text: monName(mon.pid) + ' wyrywa się z Poké Balla i znika w świetle.', img: { icon: '💨' } });
              } }, { label: 'Odpuść', run: () => null }] });
          }
          if (res === 'caught') {
            Game().s.stats.raids++;
            const reward = I(U.pick(galar ? ['exp-candy-m', 'exp-candy-l', 'wishing-piece', 'dynite-ore', 'rare-candy', 'pp-up', 'bottle-cap', 'armorite-ore'] : ['exp-candy-m', 'exp-candy-l', 'rare-candy', 'ability-capsule', 'bottle-cap', 'pp-up'])) || I('rare-candy');
            Game().addItem(reward, U.int(1, 3));
            return scene({ title: 'Rajd zakończony!', text: 'Nagroda za rajd: ' + Dex.item(reward).n + '.', img: { item: reward }, gain: true });
          }
          return null;
        } },
    });
  }

  function finishRaid(galar) {
    Game().s.stats.raids++;
    const reward = I(U.pick(galar ? ['exp-candy-m', 'exp-candy-l', 'wishing-piece', 'dynite-ore', 'rare-candy', 'pp-up', 'bottle-cap', 'armorite-ore'] : ['exp-candy-m', 'exp-candy-l', 'rare-candy', 'ability-capsule', 'bottle-cap', 'pp-up'])) || I('rare-candy');
    const n = U.int(1, 3);
    Game().addItem(reward, n);
    return 'Nagroda: ' + Dex.item(reward).n + ' ×' + n + '.';
  }

  // ---------------------------------------------------------------- actions at a location
  const Explore = PW.Explore = {
    LOOT, FOSSIL_MON, GALAR_FOSSILS, FOSSILS,

    ctx(regionId, loc) {
      return { region: regionId, loc, badges: Game().badges(regionId), walk: !!(loc.w && loc.w.walk && loc.w.walk.length) };
    },

    actions(regionId, loc) {
      const out = [];
      const has = m => loc.w && loc.w[m] && loc.w[m].length;
      out.push({ id: 'explore', label: has('walk') ? 'Szukaj Pokémonów' : 'Rozejrzyj się', icon: has('walk') ? '🌿' : '👀', ap: 1 });
      if (has('surf')) out.push({ id: 'surf', label: 'Surfuj', icon: '🏄', ap: 1, ok: W().methodUnlocked(regionId, 'surf'), why: 'Surfowanie wymaga ' + (W().region(regionId).surf || 0) + ' odznak w tym regionie.' });
      for (const rod of ['old-rod', 'good-rod', 'super-rod']) {
        if (has(rod)) out.push({ id: rod, label: W().METHOD_PL[rod], icon: '🎣', ap: 1, ok: W().methodUnlocked(regionId, rod), why: 'Potrzebujesz: ' + Dex.item(I(rod)).n + '.' });
      }
      if (has('rock-smash')) out.push({ id: 'rock-smash', label: 'Rozbijaj skały', icon: '🪨', ap: 1, ok: W().methodUnlocked(regionId, 'rock-smash'), why: 'Wymaga 1 odznaki.' });
      if (has('headbutt')) out.push({ id: 'headbutt', label: 'Potrząsaj drzewami', icon: '🌳', ap: 1 });
      return out;
    },

    run(regionId, loc, method) {
      const s = Game().s;
      s.stats.explore++;
      if (s.repel > 0) s.repel--;
      if (s.lure > 0) s.lure--;
      if (s.swarm && s.swarm.left > 0 && s.swarm.region === regionId && s.swarm.loc === loc.id) s.swarm.left--;
      PW.Breeding.step(64);
      for (const m of s.party) if (!m.egg) m.walked = (m.walked || 0) + 1;
      if (U.chance(0.15)) { const m = Game().lead(); if (m) Mon.addFriendship(m, 1); }
      Game().addTexp(1);
      const hatched = PW.Breeding.hatchCheck();
      if (hatched) return hatched;
      if (method && method !== 'walk') {
        const sc = wildScene(regionId, loc, method, { force: method !== 'surf' });
        if (!sc.battle && method.endsWith('rod')) return scene({ title: 'Nic nie bierze...', text: 'Nic nie złapało przynęty.', img: { icon: '🎣' } });
        if (sc.battle && method.endsWith('rod')) sc.prelude = 'Coś bierze! Zacinasz wędkę!';
        if (sc.battle && method === 'headbutt') sc.prelude = 'Drzewo się trzęsie i spada z niego Pokémon!';
        if (sc.battle && method === 'rock-smash') sc.prelude = 'Skała pęka – wyskakuje z niej Pokémon!';
        return sc;
      }
      const c = Explore.ctx(regionId, loc);
      const urban = ['town', 'city', 'league'].includes(loc.k);
      let wildW = c.walk ? (urban ? 30 : 52) : 0;
      if (s.lure > 0) wildW *= 1.6;
      const weights = [
        ['wild', wildW],
        ['trainer', urban ? 10 : (c.walk ? 15 : 22)],
        ['event', urban ? 40 : 25],
        ['nothing', urban ? 14 : 8],
      ];
      const pick = U.weighted(weights, x => x[1])[0];
      if (pick === 'wild') return wildScene(regionId, loc, 'walk');
      if (pick === 'trainer' && Game().ableCount() > 0) {
        const t = W().randomTrainer(regionId, loc);
        return Object.assign(trainerScene(t, { tag: 'trainer' }), { prelude: t.title + ' ' + t.name + ' cię zauważa!' });
      }
      if (pick === 'event') {
        const pool = EVENTS.filter(e => { try { return e.when(c); } catch (x) { return false; } });
        for (let tries = 0; tries < 4 && pool.length; tries++) {
          const ev = U.weighted(pool, e => e.w);
          const sc = ev.run(c);
          if (sc) return sc;
        }
      }
      const flavor = {
        cave: ['Krople wody kapią ze stropu. Echo twoich kroków niesie się daleko...', 'W ciemności coś zatrzepotało skrzydłami. Pewnie Zubat.'],
        forest: ['Promienie słońca przebijają się przez liście. Słychać brzęczenie owadów.', 'Ścieżka gubi się między drzewami.'],
        sea: ['Fale kołyszą się spokojnie. W oddali skacze Wailmer?', 'Morska bryza pachnie solą.'],
        city: ['Tłum ludzi spieszy się w swoich sprawach.', 'Z pobliskiej kawiarni pachnie świeżymi wypiekami.', 'Na telebimie leci reklama nowego Poké Balla.'],
        town: ['W miasteczku panuje sielski spokój.', 'Ktoś macha ci z okna.'],
        default: ['Wiatr szumi w trawie. Nic ciekawego się nie dzieje.', 'Idziesz przed siebie, ale nic się nie wydarza.', 'Zatrzymujesz się, by napić się wody.'],
      };
      return scene({ title: 'Spokojnie...', text: U.pick(flavor[loc.k] || flavor.default), img: { icon: W().KIND_ICON[loc.k] || '🍃' } });
    },

    // One-time special events at a location: legendaries, gifts, trades, fossil revival, Game Corner prizes.
    special(regionId, loc) {
      const out = [];
      const reg = Game().reg(regionId);
      const regDef = W().region(regionId);
      const ctx = W().context(regionId, loc);
      const evs = loc.e || [];
      const flag = k => reg.flags[k];
      const party = Game().s.party;
      // Statics
      for (const e of evs.filter(x => x.t === 'static')) {
        const key = 'static:' + loc.id + ':' + e.p;
        if (flag(key)) continue;
        const sp = Dex.speciesOf(e.p);
        const conds = (e.c || []).filter(c => !c.startsWith('item-'));
        if (!conds.every(c => W().condOK(c, ctx))) continue;
        const req = e.req !== undefined ? e.req : (sp.myth ? 99 : sp.leg ? Math.max(loc.r, 0) : loc.r);
        if (req >= 99 && !Game().isChampion(regionId)) continue;
        if (req < 99 && Game().badges(regionId) < req && !Game().isChampion(regionId)) continue;
        if (sp.myth) {
          const dex = Dex.data.core.dex[regDef.dex] || [];
          if (Game().caughtCount(dex) < Math.floor(dex.length * 0.6)) {
            out.push({ key, icon: '🎫', label: '??? (Tajemniczy Bilet)', desc: 'Profesor mówi, że to miejsce otworzy się dla trenera, który zarejestruje 60% regionalnego Pokédexu.', locked: true });
            continue;
          }
        }
        out.push({
          key, icon: sp.leg || sp.myth ? '⭐' : '❗', label: (sp.leg || sp.myth ? 'Legenda: ' : 'Spotkanie: ') + monName(e.p) + ' (Lv ' + e.l + ')',
          desc: e.note || (sp.leg || sp.myth ? 'Czujesz potężną obecność...' : 'Coś na ciebie czeka.'),
          run: () => {
            const mon = W().makeWild(e.p, e.l, { perfectIvs: sp.leg || sp.myth ? 3 : 0, shiny: undefined });
            mon.moves = W().bestMoves(mon.pid, mon.lvl).map(id => ({ id, pp: Dex.move(id).pp, up: 0 }));
            return scene({
              prelude: sp.leg || sp.myth ? 'Legendarny ' + monName(e.p) + ' pojawia się przed tobą!' : monName(e.p) + ' atakuje!',
              battle: { kind: 'wild', foe: { team: [mon], ai: sp.leg || sp.myth ? 'trainer' : 'wild' }, env: { method: 'walk', locKind: loc.k }, tag: 'static',
                onEnd(res) {
                  if (res === 'caught' || res === 'win') { reg.flags[key] = 1; if (res === 'caught' && (sp.leg || sp.myth)) Game().s.stats.legends++; }
                  if (res === 'win' && (sp.leg || sp.myth)) return scene({ title: 'Legenda odchodzi', text: monName(e.p) + ' znika... Może jeszcze kiedyś wróci (spróbuj po kolejnym zwycięstwie w Lidze).', img: { mon: e.p } });
                  return null;
                } },
            });
          },
        });
      }
      // Gifts (grouped choices)
      const gifts = evs.filter(x => x.t === 'gift' && !(x.c || []).some(c => c.startsWith('item-') || c.startsWith('coins-')));
      const isStarterGift = gifts.length === 3 && gifts.every(g => regDef.starters.includes(g.p));
      if (gifts.length && !(isStarterGift && loc.id === regDef.lab)) {
        const groups = {};
        for (const g of gifts) { const k = g.l + ':' + (g.c || []).join(','); (groups[k] = groups[k] || []).push(g); }
        for (const [gk, list] of Object.entries(groups)) {
          const key = 'gift:' + loc.id + ':' + gk;
          if (flag(key)) continue;
          if ((list[0].c || []).length && !(list[0].c).every(c => W().condOK(c, ctx))) continue;
          const isStarters = list.length === 3 && list.every(g => regDef.starters.includes(g.p));
          if (isStarters && reg.starter && regionId !== Game().s.region) continue;
          if (isStarters && regionId === Game().s.region && reg.starter && list.some(g => g.p)) { if (Game().s.flags['starterChosen:' + regionId]) continue; }
          const egg = list[0].l <= 1;
          out.push({
            key, icon: egg ? '🥚' : '🎁', label: (egg ? 'Jajo w prezencie' : 'Prezent: ') + (egg ? '' : list.map(g => monName(g.p)).join(' / ')),
            desc: list.length > 1 ? 'Możesz wybrać jednego Pokémona.' : (egg ? 'Ktoś chce powierzyć ci jajo.' : 'Ktoś chce ci podarować Pokémona.'),
            run: () => scene({
              title: egg ? 'Jajo' : 'Prezent',
              text: list.length > 1 ? 'Którego Pokémona wybierasz?' : 'Czy przyjmujesz ' + (egg ? 'jajo' : monName(list[0].p)) + '?',
              img: { mon: egg ? null : list[0].p, icon: egg ? '🥚' : null },
              choices: list.map(g => ({
                label: egg ? 'Przyjmij jajo' : monName(g.p) + ' (Lv ' + g.l + ')',
                run: () => {
                  reg.flags[key] = 1;
                  if (isStarters) Game().s.flags['starterChosen:' + regionId] = 1;
                  const m = egg ? Mon.createEgg(g.p, { ot: Game().s.player.name, perfectIvs: 2 }) : Mon.create({ pid: g.p, level: g.l, ot: Game().s.player.name, perfectIvs: 1, met: { r: regionId, l: loc.id, lvl: g.l, d: Date.now(), how: 'gift' } });
                  const where = Game().addMon(m);
                  return scene({ title: egg ? 'Otrzymujesz jajo!' : 'Otrzymujesz ' + monName(g.p) + '!', text: where === 'box' ? 'Drużyna jest pełna – Pokémon trafia do PC.' : 'Nowy towarzysz dołącza do drużyny!', img: { mon: egg ? null : g.p, icon: egg ? '🥚' : null }, gain: true });
                },
              })).concat([{ label: 'Nie teraz', run: () => null }]),
            }),
          });
        }
      }
      // Game Corner prizes (coins)
      const prizes = evs.filter(x => x.t === 'gift' && (x.c || []).some(c => c.startsWith('coins-')));
      if (prizes.length) {
        const seen = new Set();
        const items = prizes.filter(p => { if (seen.has(p.p)) return false; seen.add(p.p); return true; });
        out.push({
          key: 'corner:' + loc.id, icon: '🎰', label: 'Game Corner – nagrody', desc: 'Wymień monety na Pokémony (50 monet = ₽1000).',
          run: () => {
            const coins = Game().s.player.coins;
            return scene({
              title: 'Game Corner', text: 'Masz ' + coins + ' monet. Kup monety lub wybierz nagrodę.', img: { icon: '🎰' },
              choices: [{ label: 'Kup 50 monet (₽1000)', run: () => { if (!Game().pay(1000)) return scene({ title: 'Za mało pieniędzy', text: 'Nie stać cię na monety.' }); Game().s.player.coins += 50; return Explore.special(regionId, loc).find(x => x.key === 'corner:' + loc.id).run(); } },
                { label: 'Kup 500 monet (₽10000)', run: () => { if (!Game().pay(10000)) return scene({ title: 'Za mało pieniędzy', text: 'Nie stać cię na monety.' }); Game().s.player.coins += 500; return Explore.special(regionId, loc).find(x => x.key === 'corner:' + loc.id).run(); } }]
                .concat(items.map(p => {
                  const cost = +(p.c.find(c => c.startsWith('coins-')).slice(6));
                  return { label: monName(p.p) + ' Lv' + p.l + ' – ' + cost + ' monet', run: () => {
                    if (Game().s.player.coins < cost) return scene({ title: 'Za mało monet', text: 'Potrzebujesz ' + cost + ' monet.' });
                    Game().s.player.coins -= cost;
                    const m = Mon.create({ pid: p.p, level: p.l, ot: Game().s.player.name });
                    Game().addMon(m);
                    return scene({ title: 'Nagroda!', text: 'Otrzymujesz ' + monName(p.p) + '!', img: { mon: p.p }, gain: true });
                  } };
                })).concat([{ label: 'Wyjdź', run: () => null }]),
            });
          },
        });
      }
      // In-game trades
      for (const e of evs.filter(x => x.t === 'trade')) {
        const key = 'trade:' + loc.id + ':' + e.p;
        if (flag(key)) continue;
        const want = (e.c || []).find(c => c.startsWith('trade-'));
        if (!want) continue;
        const wantKey = want.slice(6);
        const any = wantKey === 'any-pokemon';
        const wantSid = any ? null : Dex.mon(Dex.monByKey(wantKey) || 0) ? Dex.mon(Dex.monByKey(wantKey)).s : null;
        if (!any && !wantSid) continue;
        out.push({
          key, icon: '🔁', label: 'Wymiana: ' + (any ? 'dowolny Pokémon' : monName(Dex.monByKey(wantKey))) + ' → ' + monName(e.p),
          desc: 'Mieszkaniec chętnie się wymieni.',
          run: () => {
            const offer = party.filter(m => !m.egg && (any || Dex.mon(m.pid).s === wantSid));
            if (!offer.length) return scene({ title: 'Wymiana', text: '"Szukam ' + (any ? 'jakiegokolwiek Pokémona' : monName(Dex.monByKey(wantKey))) + '. Wróć, gdy będziesz go mieć w drużynie!"', img: { mon: e.p } });
            return scene({
              title: 'Wymiana', text: 'Którego Pokémona oddajesz w zamian za ' + monName(e.p) + '?', img: { mon: e.p },
              choices: offer.map(m => ({ label: Mon.name(m) + ' (Lv ' + m.lvl + ')', run: () => {
                if (Game().s.party.filter(x => !x.egg).length <= 1) return scene({ title: 'Wymiana', text: 'Nie możesz oddać ostatniego Pokémona.' });
                const idx = Game().s.party.indexOf(m);
                Game().s.party.splice(idx, 1);
                const got = Mon.create({ pid: e.p, level: Math.max(e.l, m.lvl), ot: U.pick(['Mimi', 'Saige', 'Ruby', 'Jasper', 'Kim', 'Leon']) });
                got.traded = true;
                Game().addMon(got);
                reg.flags[key] = 1;
                const evo = PW.Flow.tradeEvolution(got);
                return scene({ title: 'Wymiana udana!', text: 'Wysyłasz ' + Mon.name(m) + ' i otrzymujesz ' + Mon.name(got) + '! Pokémony od innych trenerów zdobywają więcej doświadczenia.' + (evo ? ' ' + evo : ''), img: { mon: got.pid }, gain: true });
              } })).concat([{ label: 'Rezygnuję', run: () => null }]),
            });
          },
        });
      }
      // Fossil revival
      if (loc.f.includes('fossil')) {
        out.push({ key: 'fossil:' + loc.id, icon: '🦴', label: 'Laboratorium skamielin', desc: 'Przywróć skamieliny do życia.', run: () => Explore.fossilLab(regionId, loc) });
      }
      // Regional professor
      if (loc.f.includes('lab')) {
        out.push({ key: 'lab:' + loc.id, icon: '🔬', label: 'Laboratorium: ' + regDef.prof[0], desc: 'Porozmawiaj z profesorem.', run: () => PW.Quests.professorScene(regionId) });
      }
      // Story key items
      PW.Story.locationHooks(regionId, loc, out);
      return out;
    },

    fossilLab(regionId, loc) {
      const owned = Object.keys(FOSSIL_MON).map(k => ({ k, id: I(k) })).filter(x => x.id && Game().count(x.id) > 0);
      const galar = Object.keys(GALAR_FOSSILS).map(pair => { const [a, b] = pair.split('+'); return { pair, a: I(a), b: I(b), mon: GALAR_FOSSILS[pair] }; }).filter(x => x.a && x.b && Game().count(x.a) && Game().count(x.b));
      if (!owned.length && !galar.length) return scene({ title: 'Laboratorium skamielin', text: '"Przynieś mi skamielinę, a przywrócę ją do życia!" Skamieliny znajdziesz w jaskiniach, górach i na pustyniach.', img: { icon: '🦴' } });
      return scene({
        title: 'Laboratorium skamielin', text: 'Którą skamielinę chcesz wskrzesić?', img: { icon: '🦴' },
        choices: owned.map(x => ({ label: Dex.item(x.id).n + ' → ' + monName(Dex.monByKey(FOSSIL_MON[x.k])), run: () => {
          Game().takeItem(x.id, 1);
          const pid = Dex.monByKey(FOSSIL_MON[x.k]);
          const m = Mon.create({ pid, level: regionId === 'kanto' ? 5 : 20, ot: Game().s.player.name, met: { r: regionId, l: loc.id, d: Date.now(), how: 'fossil' } });
          Game().addMon(m);
          return scene({ title: 'Udało się!', text: 'Skamielina ożywa! ' + monName(pid) + ' dołącza do ciebie.', img: { mon: pid }, gain: true });
        } })).concat(galar.map(x => ({ label: Dex.item(x.a).n + ' + ' + Dex.item(x.b).n + ' → ' + monName(Dex.monByKey(x.mon)), run: () => {
          Game().takeItem(x.a, 1); Game().takeItem(x.b, 1);
          const pid = Dex.monByKey(x.mon);
          Game().addMon(Mon.create({ pid, level: 10, ot: Game().s.player.name }));
          return scene({ title: 'Cara Liss zachwycona!', text: 'Z połączonych skamielin powstaje ' + monName(pid) + '!', img: { mon: pid }, gain: true });
        } }))).concat([{ label: 'Wyjdź', run: () => null }]),
      });
    },

    raidScene,
  };
})(typeof window !== 'undefined' ? window : globalThis);
