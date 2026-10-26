/* Battle orchestration and consequences: gyms, the League, prizes, white-outs, catching, evolutions and items. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const I = k => Dex.itemByKey(k);
  const Game = () => PW.Game;
  const W = () => PW.World;

  // Prize multiplier on white-out by badge count (Gen V+).
  const LOSS_BASE = [8, 16, 24, 36, 48, 64, 80, 100, 120];

  const Flow = PW.Flow = {
    createBattle(spec) {
      const s = Game().s;
      const regionId = s.region;
      const loc = W().here();
      const party = spec.playerTeam || s.party;
      const tag = spec.tag || '';
      const bigStage = ['gym', 'league', 'champion', 'raid'].includes(tag);
      const flags = {
        mega: Game().has('mega-ring'),
        z: Game().has('z-ring'),
        tera: Game().has('tera-orb') && s.v_tera.charged,
        dyna: Game().has('dynamax-band') && regionId === 'galar' && bigStage,
      };
      const wInfo = loc ? W().weather(regionId, loc) : { w: null };
      const env = Object.assign({
        weather: wInfo.w, time: U.timeOfDay(), locKind: loc ? loc.k : 'route', region: regionId,
        dexCaught: Game().caughtCount(), caughtSpecies: Game().caughtSpeciesSet(), catchingCharm: Game().has('catching-charm'),
      }, spec.env || {});
      const foe = Object.assign({ name: '', team: [], ai: 'wild' }, spec.foe);
      if (spec.playerTeam) { flags.mega = false; flags.z = false; flags.tera = false; flags.dyna = false; }
      const b = new PW.Battle({
        kind: spec.kind,
        player: { name: s.player.name, team: party, flags, game: spec.playerTeam ? null : Game() },
        foe, env, cheats: spec.playerTeam ? {} : PW.Cheats.flags(),
      });
      b.spec = spec;
      return b;
    },

    // Called by the UI right after battle.start(): raid bosses get their gimmick.
    setupRaid(b) {
      const foe = b.sides[1].active;
      if (!foe) return [];
      if (b.opts.foe.raid === 'dyna') {
        foe.v.dyna = 999; foe.v.dynaMax = Mon.maxHp(foe.mon) * 2; foe.mon.hp = foe.v.dynaMax;
        b.msg(foe.name + ' jest Dynamaxowany!'); b.ev({ t: 'dyna', side: 1, on: true }); b.hpEv(foe);
      } else if (b.opts.foe.raid === 'tera') {
        b.sides[1].flags.tera = true; b.terastallize(foe);
        foe.v.raidBoost = true;
        const mult = 3;
        foe.v.dynaMax = Mon.maxHp(foe.mon) * mult; foe.mon.hp = foe.v.dynaMax; b.hpEv(foe);
        b.msg(foe.name + ' emanuje mocą Tera – jest wyjątkowo wytrzymały!');
      }
      return b.flush();
    },

    endBattle(b, spec) {
      const s = Game().s;
      const res = b.result;
      const out = { scenes: [], tasks: [], text: [] };
      s.stats.battles++;
      if (spec.playerTeam) {
        // Rental battles (Battle Factory): no money, EXP or white-out.
        if (res === 'win') s.stats.wins++;
        for (const m of spec.playerTeam) { if (m._basePid) { m.pid = m._basePid; delete m._basePid; } }
        return out;
      }
      // Restore Tera Orb charge use, temporary moves and raid HP.
      if (b.sides[0].used.tera) s.v_tera.charged = false;
      for (const m of s.party) {
        if (m.moves.some(x => x.temp)) m.moves = m.moves.filter(x => !x.temp);
        if (m.hp > Mon.maxHp(m)) m.hp = Mon.maxHp(m);
      }
      for (const x of b.sides[0].team) delete x._basePid;
      PW.Research.afterBattle(b);
      if (res === 'win') {
        s.stats.wins++;
        if (spec.kind === 'trainer') {
          s.stats.trainers++;
          PW.Quests.track('trainers');
          let prize = spec.foe.prize || 0;
          if (s.party.some(m => m.item && ['amulet-coin', 'luck-incense'].includes((Dex.item(m.item) || {}).k))) prize *= 2;
          if (prize) { Game().addMoney(prize); out.text.push('Otrzymujesz ' + U.money(prize) + ' za zwycięstwo!'); }
          Game().addTexp(spec.tag === 'gym' ? 25 : spec.tag === 'league' || spec.tag === 'champion' ? 40 : 3);
        } else {
          PW.Quests.track('wild');
          Game().addTexp(1);
        }
      }
      if (b.money) { Game().addMoney(b.money); }
      if (res === 'caught' && b.caught) {
        const m = b.caught;
        m.ot = s.player.name;
        m.met = { r: s.region, l: s.loc, lvl: m.lvl, d: Date.now(), how: 'caught' };
        m.st = m.st || null;
        const ballKey = (Dex.item(m.ball) || {}).k;
        if (ballKey === 'heal-ball') Mon.heal(m);
        if (ballKey === 'friend-ball') m.fr = Math.max(m.fr, 150);
        if (Dex.mon(m.pid).totem) {
          // Totem Pokémon keep their size but use their standard form.
          const sp = Dex.speciesOf(m.pid);
          m.pid = Math.min(...sp.f.filter(f => !Dex.mon(f).totem));
        }
        const isNew = !s.dex.caught[Dex.mon(m.pid).s];
        const where = Game().addMon(m);
        PW.Research.track('caught', m.pid);
        s.stats.caught++;
        if (m.shiny) s.stats.shinies++;
        PW.Quests.track('catch', { pid: m.pid });
        Game().addTexp(isNew ? 6 : 2);
        out.text.push(Mon.name(m) + (where === 'box' ? ' trafia do PC.' : ' dołącza do drużyny!') + (isNew ? ' Nowy wpis w Pokédexie!' : ''));
        if (s.settings.nicknames) out.tasks.push({ type: 'nickname', uid: m.uid });
        Game().log('Złapano ' + Dex.mon(m.pid).n + (m.shiny ? ' ✨' : '') + ' (Lv ' + m.lvl + ').', 'good');
      }
      if (res === 'lose') {
        s.stats.losses++;
        const badges = Math.min(8, Game().badges());
        const top = Math.max(...s.party.filter(m => !m.egg).map(m => m.lvl));
        const loss = Math.min(s.player.money, LOSS_BASE[badges] * top);
        s.player.money -= loss;
        const reg = Game().reg();
        const center = reg.center || W().hereRegion().lab;
        s.loc = center;
        Game().healParty();
        s.league = null;
        out.text.push('Tracisz ' + U.money(loss) + ' i w pośpiechu wracasz do Centrum Pokémon (' + W().locName(s.region, center) + ')... Twoje Pokémony zostały wyleczone.');
        Game().log('Przegrana walka. Powrót do ' + W().locName(s.region, center) + '.', 'bad');
      }
      // Level-up move prompts and evolutions
      const leveled = new Set();
      for (const lv of b.expLog) {
        leveled.add(lv.mon.uid);
        if (lv.pending.length) out.tasks.push({ type: 'learn', uid: lv.mon.uid, moves: lv.pending.slice() });
      }
      for (const m of s.party) {
        if (m.egg || m.hp <= 0 && !leveled.has(m.uid)) continue;
        if ((b.critCount[m.uid] || 0) >= 3) m.crits3 = true;
        const trig = leveled.has(m.uid) ? 'level' : (m.crits3 ? 'level' : null);
        if (!trig) continue;
        const ev = Flow.evoCandidates(m, 'level');
        if (ev.length) out.tasks.push({ type: 'evolve', uid: m.uid, row: ev[0] });
      }
      return out;
    },

    evoCtx(trigger, extra) {
      const s = Game().s;
      const loc = W().here();
      return Object.assign({ trigger, region: s.region, time: U.timeOfDay(), loc: s.loc, party: s.party,
        weather: loc ? (W().weather(s.region, loc).w) : null, coins: Game().count(I('gimmighoul-coin')) }, extra || {});
    },
    evoCandidates(m, trigger, extra) {
      if (Mon.blocksEvolution(m) && trigger !== 'item') return [];
      return Mon.evolutions(m, Flow.evoCtx(trigger, extra));
    },
    // Executes an evolution; returns the event (UI shows animation and new move prompts).
    doEvolve(m, row) {
      const before = Mon.name(m);
      PW.Research.track('evolved', m.pid);
      const ev = Mon.evolve(m, row, Game());
      Game().markCaught(m.pid, m.shiny);
      Game().s.stats.evolved++;
      PW.Quests.track('evolve');
      if (row.trig === 'gimmighoul-coins') Game().takeItem(I('gimmighoul-coin'), 999);
      if (row.tradeSpecies) {
        const partner = Game().s.party.find(x => x !== m && !x.egg && Dex.mon(x.pid).s === row.tradeSpecies);
        if (partner) { const prow = Flow.evoCandidates(partner, 'trade').find(r => r.tradeSpecies === Dex.mon(row.from || m.pid).s || true); if (prow) Mon.evolve(partner, prow, Game()); }
      }
      Game().log(before + ' ewoluował w ' + Dex.mon(m.pid).n + '!', 'good');
      return ev;
    },
    tradeEvolution(m) {
      const rows = Flow.evoCandidates(m, 'trade');
      if (!rows.length) return '';
      const before = Mon.name(m);
      Flow.doEvolve(m, rows[0]);
      return 'Co?! ' + before + ' ewoluuje w ' + Dex.mon(m.pid).n + '!';
    },
    evolveSpecial(trigger, param) {
      const s = Game().s;
      for (const m of s.party) {
        if (m.egg) continue;
        const rows = Mon.evolutions(m, Flow.evoCtx(trigger, { tower: param }));
        if (rows.length) {
          const before = Mon.name(m);
          Flow.doEvolve(m, rows[0]);
          return { title: 'Ewolucja!', text: before + ' ewoluuje w ' + Dex.mon(m.pid).n + '!', img: { mon: m.pid, shiny: m.shiny }, gain: true, choices: [] };
        }
      }
      return { title: 'Nic się nie dzieje', text: 'Żaden Pokémon nie może teraz ewoluować w ten sposób.', choices: [] };
    },

    // Out-of-battle item use. Returns {ok, text, tasks}.
    useItem(m, id, moveIndex) {
      const it = Dex.item(id);
      const k = it ? it.k : '';
      const out = { ok: false, text: '', tasks: [] };
      if (typeof id === 'string' && id.startsWith('tm')) return Flow.teachTM(m, +id.slice(2));
      if (m.egg) { out.text = 'Nie można użyć przedmiotu na jaju.'; return out; }
      // Evolution items
      const evoRows = Mon.evolutions(m, Flow.evoCtx('item', { item: id }));
      if (evoRows.length) {
        Game().takeItem(id, 1);
        out.ok = true;
        out.tasks.push({ type: 'evolve', uid: m.uid, row: evoRows[0], force: true });
        out.text = 'Używasz ' + it.n + ' na ' + Mon.name(m) + '...';
        return out;
      }
      if (k === 'linking-cord') {
        const rows = Flow.evoCandidates(m, 'trade');
        if (!rows.length) { out.text = 'To nie przyniesie żadnego efektu.'; return out; }
        Game().takeItem(id, 1);
        out.ok = true;
        out.tasks.push({ type: 'evolve', uid: m.uid, row: rows[0], force: true });
        out.text = 'Linking Cord świeci...';
        return out;
      }
      if (k === 'rare-candy' || PW.Items.EXP_CANDY[k]) {
        if (m.lvl >= 100) { out.text = 'Ten Pokémon ma już maksymalny poziom.'; return out; }
        Game().takeItem(id, 1);
        const evs = k === 'rare-candy' ? [Mon.levelUp(m)] : Mon.addExp(m, PW.Items.EXP_CANDY[k]);
        if (k === 'rare-candy') m.exp = Math.max(m.exp, Dex.expAt(Mon.species(m).gw, m.lvl));
        out.ok = true;
        out.text = evs.length ? Mon.name(m) + ' awansuje na poziom ' + m.lvl + '!' : Mon.name(m) + ' zdobywa doświadczenie.';
        for (const lv of evs) {
          if (lv.learned.length) out.text += ' Uczy się: ' + lv.learned.map(x => Dex.move(x).n).join(', ') + '.';
          if (lv.pending.length) out.tasks.push({ type: 'learn', uid: m.uid, moves: lv.pending.slice() });
        }
        if (evs.length) { const e = Flow.evoCandidates(m, 'level'); if (e.length) out.tasks.push({ type: 'evolve', uid: m.uid, row: e[0] }); }
        return out;
      }
      const ctx = { moveIndex, party: Game().s.party };
      const r = PW.Items.applyMedicine(m, id, ctx);
      if (r.ok) Game().takeItem(id, 1);
      return Object.assign(out, r);
    },
    teachTM(m, mid) {
      const mv = Dex.move(mid);
      if (!Dex.canLearnTM(m.pid, mid)) return { ok: false, text: Mon.name(m) + ' nie może nauczyć się ' + mv.n + '.', tasks: [] };
      if (m.moves.some(x => x.id === mid)) return { ok: false, text: Mon.name(m) + ' już zna ' + mv.n + '.', tasks: [] };
      if (m.moves.length < 4) { Mon.learnMove(m, mid); return { ok: true, text: Mon.name(m) + ' uczy się ' + mv.n + '!', tasks: [] }; }
      return { ok: true, text: '', tasks: [{ type: 'learn', uid: m.uid, moves: [mid] }] };
    },

    // ---------------------------------------------------------------- gyms
    gymLeaderTrainer(regionId, gi) {
      const reg = W().region(regionId);
      const g = reg.gyms[gi];
      const r = Game().reg(regionId);
      let def = g, leader = g.leader, sprite = g.sprite, type = g.type;
      if (g.alt && r.flags.version === 'shield') { def = g.alt; leader = g.alt.leader; sprite = g.alt.sprite; type = g.alt.type; }
      if (g.alt && r.flags.version !== 'shield') leader = g.leader.split(' / ')[0];
      const team = W().buildTeam(def.team, { smart: true, region: regionId, ot: leader, ivs: [20, 20, 20, 20, 20, 20] });
      const ace = team[team.length - 1];
      // Leaders use the TM they hand out (Misty's Starmie has Water Pulse), replacing their weakest attack.
      const tmRaw = def.tm || g.tm;
      const tmMove = typeof tmRaw === 'number' ? tmRaw : tmRaw && Dex.moveByKey(tmRaw);
      const mv = tmMove && Dex.move(tmMove);
      // Same-type TMs count too: the newest learnsets drop some old TM compatibility (Starmie and Water Pulse).
      if (mv && (Dex.canLearnTM(ace.pid, tmMove) || Dex.mon(ace.pid).t.includes(mv.t)) && !ace.moves.some(x => x.id === tmMove)) {
        const entry = { id: tmMove, pp: Mon.maxPP({ id: tmMove, up: 0 }), up: 0 };
        if (ace.moves.length < 4) ace.moves.push(entry);
        else {
          const attacks = ace.moves.filter(x => Dex.move(x.id).c !== 0);
          const weakest = (attacks.length ? attacks : ace.moves).reduce((a, b) => ((Dex.move(a.id).p || 0) <= (Dex.move(b.id).p || 0) ? a : b));
          if (mv.c === 0 || (Dex.move(weakest.id).p || 0) < (mv.p || 0)) ace.moves[ace.moves.indexOf(weakest)] = entry;
        }
      }
      const late = gi >= 5;
      const items = g.trial ? [] : [I(late ? 'full-restore' : 'hyper-potion'), I(late ? 'full-restore' : 'super-potion')].filter(Boolean);
      const flags = {};
      if (regionId === 'galar') flags.dyna = true;
      if (regionId === 'paldea') flags.tera = true;
      if (regionId === 'alola' && !g.trial) {
        flags.z = true;
        const zc = Object.entries(PW.BD.Z_CRYSTALS).find(([, t2]) => t2 === type);
        if (zc && !ace.item) ace.item = I(zc[0]);
      }
      const title = g.title || (g.trial ? 'Kapitan' : 'Lider Sali');
      return { name: leader, title, sprite, team, items, prize: 100 * ace.lvl, ai: 'gym', flags, totem: g.trial ? (def.team[0].totem || [0, 1, 1, 0, 0, 0]) : null, type };
    },

    gymScene(regionId, gi) {
      const reg = W().region(regionId);
      const g = reg.gyms[gi];
      const r = Game().reg(regionId);
      const prog = r.gymProgress[gi] || 0;
      const trainers = r['_gymTrainers' + gi] || (r['_gymTrainers' + gi] = null);
      void trainers;
      if (Game().ableCount() === 0) return { title: 'Sala', text: 'Twoje Pokémony są wyczerpane. Najpierw odwiedź Centrum Pokémon.', choices: [] };
      if (g.trial) return Flow.trialScene(regionId, gi);
      const count = gi < 2 ? 1 : 2;
      if (prog < count && !r.badges.includes(gi)) {
        const list = W().gymTrainers(regionId, gi);
        const t = list[Math.min(prog, list.length - 1)];
        return {
          prelude: 'Trener sali (' + (prog + 1) + '/' + count + ') zagradza drogę do lidera!',
          battle: { kind: 'trainer', foe: { name: t.name, title: t.title, sprite: t.sprite, team: t.team, ai: 'trainer', prize: t.prize }, tag: 'gym-trainer',
            onEnd(res) {
              if (res !== 'win') { r.gymProgress[gi] = 0; return null; }
              r.gymProgress[gi] = prog + 1;
              return { title: 'Trener sali pokonany', text: prog + 1 < count ? 'Przed tobą jeszcze jeden trener sali.' : 'Droga do lidera jest wolna!', img: { trainer: t.sprite },
                choices: [{ label: 'Idź dalej', run: () => Flow.gymScene(regionId, gi) }, { label: 'Wycofaj się (ulecz drużynę)', run: () => null }] };
            } },
        };
      }
      const leader = Flow.gymLeaderTrainer(regionId, gi);
      const rematch = r.badges.includes(gi);
      return {
        prelude: (rematch ? 'Rewanż! ' : '') + leader.title + ' ' + leader.name + ': "' + Flow.leaderLine(regionId, gi) + '"',
        battle: { kind: 'trainer', foe: leader, tag: 'gym',
          onEnd(res) {
            r.gymProgress[gi] = 0;
            if (res !== 'win') return null;
            if (rematch) { Game().addItem(I('rare-candy'), 1); return { title: 'Rewanż wygrany!', text: leader.name + ': "Wciąż jesteś najlepszy!" Otrzymujesz Rare Candy.', img: { trainer: leader.sprite }, gain: true, choices: [] }; }
            return Flow.awardBadge(regionId, gi, leader);
          } },
      };
    },

    trialScene(regionId, gi) {
      const reg = W().region(regionId);
      const g = reg.gyms[gi];
      const r = Game().reg(regionId);
      const leader = Flow.gymLeaderTrainer(regionId, gi);
      const totem = leader.team[0];
      totem.moves = W().bestMoves(totem.pid, totem.lvl).map(id => ({ id, pp: Dex.move(id).pp, up: 0 }));
      return {
        prelude: 'Kapitan ' + g.leader + ': "Próba się zaczyna! Pokonaj Pokémona Totemicznego!"',
        battle: { kind: 'wild', foe: { team: [totem], ai: 'gym', totem: leader.totem, noCatch: true, noRun: true }, tag: 'gym',
          onEnd(res) {
            if (res !== 'win') return null;
            if (r.badges.includes(gi)) return null;
            return Flow.awardBadge(regionId, gi, leader);
          } },
      };
    },

    leaderLine(regionId, gi) {
      const g = W().region(regionId).gyms[gi];
      const lines = {
        rock: 'Moje Pokémony są twarde jak skała!', water: 'Zmyję cię jak fala przypływu!', electric: 'Przygotuj się na porażenie!',
        grass: 'Moje kwiaty zakwitną na twoją porażkę!', poison: 'Trucizna to sztuka ninja!', psychic: 'Przewidziałam ten pojedynek...',
        fire: 'Mój ogień spali wszystko na swojej drodze!', ground: 'Ziemia zadrży pod twoimi stopami!', flying: 'Polecimy wysoko!',
        bug: 'Robaki są silniejsze niż myślisz!', normal: 'Siła tkwi w prostocie!', ghost: 'Duchy szepczą mi o twoim losie...',
        fighting: 'Liczy się tylko trening!', steel: 'Moja obrona jest nie do przebicia!', ice: 'Zamrożę twoje nadzieje!',
        dragon: 'Smoki nie znają strachu!', dark: 'W ciemności nie ma litości!', fairy: 'Pokażę ci baśniową moc!',
      };
      return lines[g.type] || 'Pokaż, na co cię stać!';
    },

    awardBadge(regionId, gi, leader) {
      const reg = W().region(regionId);
      const g = reg.gyms[gi];
      const r = Game().reg(regionId);
      if (!r.badges.includes(gi)) r.badges.push(gi);
      r.badges.sort((a, b) => a - b);
      const parts = [leader.name + ': "Brawo! Zasłużyłeś na to!"', 'Otrzymujesz: ' + g.badge + '!'];
      if (g.tm) { Game().addTM(g.tm); parts.push('Dostajesz też TM: ' + Dex.move(g.tm).n + '.'); }
      if (g.item) { Game().addItem(g.item, 1); parts.push('Dostajesz też ' + Dex.item(g.item).n + '.'); }
      for (const m of PW.Story.onBadge(regionId, r.badges.length)) parts.push(m);
      Game().log('Zdobyto: ' + g.badge + ' (' + reg.name + ').', 'gold');
      PW.Quests.checkAch();
      return { title: g.badge + '!', text: parts.join(' '), img: { badge: g.type }, gain: true, choices: [] };
    },

    // ---------------------------------------------------------------- league
    leagueScene(regionId) {
      const reg = W().region(regionId);
      const r = Game().reg(regionId);
      const s = Game().s;
      if (r.badges.length < reg.gyms.length && !r.champion) return { title: 'Liga Pokémon', text: 'Strażnik: "Potrzebujesz wszystkich ' + reg.gyms.length + ' odznak, by wejść do Ligi."', img: { icon: '🏆' }, choices: [] };
      if (!s.league || s.league.region !== regionId) s.league = { region: regionId, step: 0 };
      const step = s.league.step;
      const list = reg.e4.concat([reg.champ]);
      const t = list[step];
      const isChamp = step === list.length - 1;
      const resolve = (key) => {
        if (key === '$starter' || key === '$rivalStarter') return W().evolveForLevel(W().rivalStarter(regionId), 60, regionId);
        if (key === '$late') { const late = reg.rival.late.slice(); const pidx = (s._lateIdx = ((s._lateIdx || 0) + 1)) % late.length; return W().evolveForLevel(late[pidx] || late[0], 60, regionId); }
        return null;
      };
      const team = W().buildTeam(t.team, { smart: true, region: regionId, ot: t.name, ivs: [26, 26, 26, 26, 26, 26], resolve });
      const ace = team[team.length - 1];
      const flags = {};
      if (regionId === 'kalos' && isChamp) flags.mega = true;
      if (regionId === 'alola') flags.z = true;
      if (regionId === 'galar') flags.dyna = true;
      if (regionId === 'paldea') flags.tera = true;
      if (flags.z && !ace.item) { const tk = Dex.typeKey(Dex.mon(ace.pid).t[0]); const zc = Object.entries(PW.BD.Z_CRYSTALS).find(([, t2]) => t2 === tk); if (zc) ace.item = I(zc[0]); }
      const title = isChamp ? 'Mistrz' : (t.title || 'Elitarna Czwórka');
      const foe = { name: t.name, title, sprite: t.sprite, team, items: [I('full-restore'), I('full-restore')].filter(Boolean), prize: (isChamp ? 200 : 120) * ace.lvl, ai: isChamp ? 'champion' : 'elite', flags };
      return {
        prelude: (step === 0 ? 'Wchodzisz do Ligi Pokémon ' + reg.name + '. ' : '') + title + ' ' + t.name + ' czeka na ciebie! (' + (step + 1) + '/' + list.length + ')',
        battle: { kind: 'trainer', foe, tag: isChamp ? 'champion' : 'league',
          onEnd(res) {
            if (res !== 'win') { s.league = null; return { title: 'Porażka w Lidze', text: 'Musisz zacząć wyzwanie Ligi od początku.', choices: [] }; }
            if (!isChamp) {
              s.league.step++;
              return { title: t.name + ' pokonany!', text: 'Przed tobą kolejny przeciwnik. Możesz użyć przedmiotów z plecaka, ale nie wrócisz do Centrum Pokémon bez przerywania wyzwania.', img: { trainer: t.sprite },
                choices: [{ label: 'Następny przeciwnik', run: () => Flow.leagueScene(regionId) }, { label: 'Przygotuj się (plecak / drużyna)', run: () => null }] };
            }
            s.league = null;
            return Flow.becomeChampion(regionId, t);
          } },
      };
    },

    becomeChampion(regionId, champ) {
      const reg = W().region(regionId);
      const r = Game().reg(regionId);
      const s = Game().s;
      const first = !r.champion;
      r.champion = true;
      s.hof.push({ region: regionId, date: Date.now(), team: s.party.filter(m => !m.egg).map(m => ({ pid: m.pid, lvl: m.lvl, name: Mon.name(m), shiny: m.shiny })) });
      const msgs = PW.Story.onChampion(regionId);
      Game().addTexp(100);
      Game().log('Zostajesz Mistrzem regionu ' + reg.name + '!', 'gold');
      PW.Quests.checkAch();
      return {
        title: '🏆 Nowy Mistrz ' + reg.name + '!', img: { trainer: champ.sprite }, gain: true, choices: [],
        text: champ.name + ': "Gratulacje! Od dziś jesteś Mistrzem regionu ' + reg.name + '!" Twoja drużyna zostaje wpisana do Hall of Fame.' +
          (first ? ' Odblokowano lokacje po grze (legendy, nowe trasy i Battle Factory).' : '') + (msgs.length ? ' ' + msgs.join(' ') : ''),
      };
    },

    extraTrainerScene(regionId, t) {
      const team = W().buildTeam(t.team, { smart: true, region: regionId, ot: t.name, ivs: [31, 31, 31, 31, 31, 31] });
      const key = 'extra:' + t.name;
      const r = Game().reg(regionId);
      return {
        prelude: t.title + ' ' + t.name + ' patrzy na ciebie w milczeniu...',
        battle: { kind: 'trainer', foe: { name: t.name, title: t.title, sprite: t.sprite, team, items: [I('full-restore'), I('full-restore')], ai: 'champion', prize: 300 * team[team.length - 1].lvl, flags: { mega: true } }, tag: 'champion',
          onEnd(res) {
            if (res !== 'win') return null;
            const firstTime = !r.flags[key];
            r.flags[key] = 1;
            if (firstTime) { Game().addItem(I('master-ball'), 1); Game().addItem(I('gold-bottle-cap'), 1); }
            return { title: 'Legendarne zwycięstwo!', text: t.name + ' uśmiecha się lekko. ' + (firstTime ? 'Otrzymujesz Master Ball i Gold Bottle Cap!' : ''), img: { trainer: t.sprite }, gain: true, choices: [] };
          } },
      };
    },

    // ---------------------------------------------------------------- travel
    travel(regionId, locId) {
      const s = Game().s;
      const msgs = [];
      if (s.league && (s.league.region !== regionId || locId !== W().region(regionId).league)) { s.league = null; msgs.push('Opuszczasz Ligę – wyzwanie trzeba będzie zacząć od nowa.'); }
      if (regionId !== s.region || locId !== s.loc) PW.Shiny.breakChains();
      if (regionId !== s.region) {
        s.region = regionId;
        msgs.push(...PW.Story.onArrive(regionId));
      }
      s.loc = locId;
      const r = Game().reg(regionId);
      msgs.push(...PW.Story.giveRods(regionId, r.badges.length));
      r.visited[locId] = 1;
      const loc = W().loc(regionId, locId);
      if (loc && loc.f.includes('pc')) r.center = locId;
      if (!r.center) r.center = W().region(regionId).lab;
      return msgs;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
