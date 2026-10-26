/* Cheats: a command console and the helpers behind the cheat screen's editor. Turned on in Options;
   a save that used them is marked as such on the trainer card. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const Game = () => PW.Game;
  const W = () => PW.World;

  // Names compared without case, spaces, dashes, dots, apostrophes or Polish/other diacritics.
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[\s\-_.'’♀♂:]/g, '');

  // Best match among {key, name, value}: exact, then prefix, then substring.
  function find(list, query) {
    const q = norm(query);
    if (!q) return null;
    return list.find(x => norm(x.k) === q || norm(x.n) === q) || list.find(x => norm(x.k).startsWith(q) || norm(x.n).startsWith(q)) ||
      list.find(x => norm(x.k).includes(q) || norm(x.n).includes(q)) || null;
  }
  let cache = null;
  function lists() {
    if (cache) return cache;
    const D = Dex.data;
    cache = {
      mons: Object.entries(D.pokemon).map(([id, p]) => ({ k: p.k, n: p.n, v: +id })).sort((a, b) => a.v - b.v),
      items: Object.entries(D.items).map(([id, it]) => ({ k: it.k, n: it.n, v: +id })),
      moves: Object.entries(D.moves).filter(([, m]) => !m.z).map(([id, m]) => ({ k: m.k, n: m.n, v: +id })),
      natures: D.core.natures.map((x, i) => ({ k: x.n, n: x.n, v: i })),
      types: D.core.types.map((t, i) => ({ k: t, n: Dex.TYPE_PL[t] || t, v: i })),
      regions: W().regions().map(r => ({ k: r.id, n: r.name, v: r.id })),
    };
    return cache;
  }
  const BALLS = ['poke-ball', 'great-ball', 'ultra-ball', 'master-ball', 'premier-ball', 'net-ball', 'nest-ball', 'dive-ball', 'repeat-ball',
    'timer-ball', 'quick-ball', 'dusk-ball', 'heal-ball', 'luxury-ball', 'level-ball', 'lure-ball', 'moon-ball', 'friend-ball', 'love-ball',
    'heavy-ball', 'fast-ball', 'dream-ball', 'beast-ball', 'safari-ball', 'sport-ball'];
  const MEDS = ['potion', 'super-potion', 'hyper-potion', 'max-potion', 'full-restore', 'revive', 'max-revive', 'full-heal', 'ether',
    'max-ether', 'elixir', 'max-elixir', 'rare-candy', 'pp-up', 'pp-max', 'hp-up', 'protein', 'iron', 'calcium', 'zinc', 'carbos'];
  const STONES = ['fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone', 'sun-stone', 'shiny-stone', 'dusk-stone',
    'dawn-stone', 'ice-stone', 'oval-stone', 'linking-cord', 'kings-rock', 'metal-coat', 'dragon-scale', 'upgrade', 'dubious-disc',
    'protector', 'electirizer', 'magmarizer', 'reaper-cloth', 'razor-claw', 'razor-fang', 'prism-scale', 'deep-sea-tooth', 'deep-sea-scale',
    'sachet', 'whipped-dream', 'everstone', 'sweet-apple', 'tart-apple', 'cracked-pot', 'galarica-cuff', 'galarica-wreath', 'peat-block',
    'black-augurite', 'auspicious-armor', 'malicious-armor', 'metal-alloy', 'syrupy-apple', 'gimmighoul-coin'];
  const TIME = { rano: 'morning', morning: 'morning', dzien: 'day', day: 'day', noc: 'night', night: 'night' };
  const WEATHER = { deszcz: 'weather-raining', rain: 'weather-raining', slonce: 'weather-intense-sun', sun: 'weather-intense-sun',
    burza: 'weather-thunderstorm', snieg: 'weather-snowing', snow: 'weather-snowing', zamiec: 'weather-snowstorm', piasek: 'weather-sandstorm',
    sand: 'weather-sandstorm', mgla: 'weather-fog', fog: 'weather-fog', pochmurno: 'weather-overcast', pogodnie: 'weather-normal', clear: 'weather-normal' };
  const TOGGLES = { catch: 'catchAll', lap: 'catchAll', shiny: 'shiny', ohko: 'ohko', nowild: 'noWild', notrainer: 'noTrainers' };
  const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

  const Cheats = PW.Cheats = {
    norm, find, lists, BALLS, TOGGLES,
    enabled() { const s = Game().s; return !!(s && s.settings.cheats); },
    flags() { const s = Game().s; return (s && s.settings.cheats && s.cheats) || {}; },
    state() { const s = Game().s; return s.cheats || (s.cheats = { catchAll: false, shiny: false, ohko: false, noWild: false, noTrainers: false, expMult: 1, time: null }); },
    mark() { Game().s.cheated = true; Game().save(); },

    findMon: q => { const x = find(lists().mons, q); return x && x.v; },
    findItem: q => { const x = find(lists().items, q); return x && x.v; },
    findMove: q => { const x = find(lists().moves, q); return x && x.v; },
    findNature: q => { const x = find(lists().natures, q); return x ? x.v : null; },
    findType: q => { const x = find(lists().types, q); return x ? x.v : null; },
    findRegion: q => { const x = find(lists().regions, q); return x && x.v; },

    // Party slot 1-6 (or a nickname/species name).
    slot(arg) {
      const party = Game().s.party;
      if (/^\d+$/.test(arg || '')) return party[+arg - 1] || null;
      return party.find(m => norm(Mon.name(m)) === norm(arg) || norm(Dex.mon(m.pid).n) === norm(arg)) || null;
    },

    // Applies edits from the editor form or commands, then recomputes HP keeping its share.
    edit(m, ch) {
      const frac = m.hp / Mon.maxHp(m);
      if (ch.pid !== undefined && Dex.mon(ch.pid)) { m.pid = +ch.pid; if (!Dex.mon(m.pid).a[m.abil]) m.abil = 0; }
      if (ch.lvl !== undefined) { m.lvl = U.clamp(+ch.lvl || 1, 1, 100); m.exp = Dex.expAt(Dex.speciesOf(m.pid).gw, m.lvl); }
      if (ch.iv) m.iv = ch.iv.map(v => U.clamp(Math.round(+v) || 0, 0, 31));
      if (ch.ev) m.ev = ch.ev.map(v => U.clamp(Math.round(+v) || 0, 0, 252));
      if (ch.nat !== undefined) m.nat = U.clamp(+ch.nat, 0, Dex.natureCount() - 1);
      if (ch.abil !== undefined) m.abil = +ch.abil;
      if (ch.shiny !== undefined) m.shiny = !!ch.shiny;
      if (ch.item !== undefined) m.item = ch.item || null;
      if (ch.tera !== undefined) m.tera = +ch.tera;
      if (ch.fr !== undefined) m.fr = U.clamp(+ch.fr || 0, 0, 255);
      if (ch.nick !== undefined) m.nick = ch.nick ? String(ch.nick).slice(0, 12) : null;
      if (ch.gender !== undefined) m.gender = ch.gender || null;
      if (ch.moves) {
        const ids = ch.moves.filter(id => id && Dex.move(id)).slice(0, 4);
        if (ids.length) m.moves = ids.map(id => m.moves.find(x => x.id === +id) || { id: +id, pp: Dex.move(id).pp, up: 0 });
      }
      m.hp = m.egg ? m.hp : Math.max(frac > 0 ? 1 : 0, Math.round(frac * Mon.maxHp(m)));
      if (m.shiny) Game().markCaught(m.pid, true); else Game().markCaught(m.pid);
      Cheats.mark();
    },

    give(id, n) { Game().addItem(id, n || 1); return Dex.item(id).n + (n > 1 ? ' ×' + n : ''); },

    HELP: [
      ['pomoc', 'ta lista'],
      ['item <przedmiot> [ilość]', 'dodaje przedmiot, np. item rare candy 10'],
      ['tm <ruch|all>', 'dodaje TM z ruchem albo wszystkie TM'],
      ['pakiet kule|leki|kamienie|bilety', 'po 99 kul, po 99 leków, przedmioty do ewolucji, wszystkie bilety z wydarzeń'],
      ['pokemon <gatunek> [poziom] [shiny] [natura] [max]', 'dodaje Pokémona, np. pokemon garchomp 50 shiny jolly max'],
      ['lvl <slot> <poziom>', 'zmienia poziom Pokémona z drużyny (slot 1–6)'],
      ['iv <slot> max | <wartość> | <hp atk def spa spd spe>', 'zmienia IV (0–31)'],
      ['ev <slot> <hp atk def spa spd spe> | clear', 'zmienia EV (0–252 każde)'],
      ['natura <slot> <natura>', 'np. natura 1 adamant'],
      ['zdolnosc <slot> 1|2|ukryta', 'zmienia zdolność'],
      ['shiny <slot> [off]', 'robi Pokémona błyszczącym (albo zwykłym)'],
      ['ruch <slot> <1–4> <ruch>', 'ustawia ruch, np. ruch 1 2 earthquake'],
      ['trzyma <slot> <przedmiot|brak>', 'przedmiot trzymany'],
      ['tera <slot> <typ>', 'typ Tera'],
      ['gatunek <slot> <gatunek/forma>', 'zmienia gatunek lub formę'],
      ['ewoluuj <slot>', 'ewoluuje do następnego etapu'],
      ['ulecz', 'leczy drużynę'],
      ['kasa <kwota> · bp <n> · monety <n> · pa', 'pieniądze, Battle Points, monety, pełne PA'],
      ['odznaki <region> <liczba|all>', 'ustawia odznaki w regionie'],
      ['mistrz <region>', 'tytuł Mistrza regionu'],
      ['tp <region> [lokacja]', 'teleport'],
      ['pokedex all', 'wszystkie gatunki złapane'],
      ['badania <gatunek|all>', 'ukończone badania (poziom 10)'],
      ['prezent reset · loteria reset', 'jeszcze raz dzisiaj'],
      ['czas rano|dzien|noc|auto', 'pora dnia w grze'],
      ['pogoda deszcz|slonce|burza|snieg|piasek|mgla|auto', 'pogoda w obecnej lokacji'],
      ['cheat catch|shiny|ohko|nowild|notrainer [on|off]', 'pewne łapanie, same shiny, nokaut jednym ciosem, bez dzikich, bez trenerów'],
      ['cheat exp <mnożnik>', 'mnożnik doświadczenia, np. cheat exp 5'],
    ],

    // Runs one console line; returns {ok, msg}.
    run(line) {
      const s = Game().s;
      const parts = String(line).trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return { ok: false, msg: '' };
      const cmd = norm(parts[0]);
      const args = parts.slice(1);
      const rest = args.join(' ');
      const ok = msg => { Cheats.mark(); return { ok: true, msg }; };
      const err = msg => ({ ok: false, msg });
      const needMon = () => { const m = Cheats.slot(args[0]); return m && !m.egg ? m : null; };
      // Splits trailing count from a name: "rare candy 10" -> ["rare candy", 10].
      const nameAndCount = a => (a.length > 1 && /^\d+$/.test(a[a.length - 1]) ? [a.slice(0, -1).join(' '), +a[a.length - 1]] : [a.join(' '), 1]);

      switch (cmd) {
        case 'pomoc': case 'help': case '?':
          return { ok: true, msg: Cheats.HELP.map(([c, d]) => c + ' – ' + d).join('\n') };
        case 'item': case 'daj': case 'give': {
          const [q, n] = nameAndCount(args);
          const id = Cheats.findItem(q);
          if (!id) return err('Nie znam przedmiotu: ' + q);
          return ok('Dodano: ' + Cheats.give(id, U.clamp(n, 1, 999)));
        }
        case 'tm': {
          if (norm(rest) === 'all' || norm(rest) === 'wszystkie') { for (const [, mid] of Dex.data.core.tms || []) Game().addTM(mid); return ok('Dodano wszystkie TM.'); }
          const mid = Cheats.findMove(rest);
          if (!mid) return err('Nie znam ruchu: ' + rest);
          Game().addTM(mid);
          return ok('Dodano TM: ' + Dex.move(mid).n);
        }
        case 'pakiet': case 'pack': {
          const k = norm(args[0]);
          const keys = k === 'kule' || k === 'balls' ? BALLS : k === 'leki' || k === 'meds' ? MEDS : k === 'kamienie' || k === 'stones' ? STONES : k === 'bilety' || k === 'tickets' ? PW.Gifts.TICKETS.map(t => t[0]) : null;
          if (!keys) return err('Pakiety: kule, leki, kamienie, bilety');
          const n = k === 'kamienie' || k === 'stones' ? 10 : k === 'bilety' || k === 'tickets' ? 1 : 99;
          let c = 0;
          for (const key of keys) { const id = Dex.itemByKey(key); if (id && !(n === 1 && Game().has(key))) { Game().addItem(id, n, true); c++; } }
          return ok('Dodano ' + c + ' rodzajów przedmiotów (po ' + n + ').');
        }
        case 'pokemon': case 'poke': case 'pkmn': {
          const words = args.slice();
          let lvl = 50, shiny = false, nat, max = false;
          const name = [];
          for (const w of words) {
            if (/^\d+$/.test(w)) lvl = U.clamp(+w, 1, 100);
            else if (norm(w) === 'shiny') shiny = true;
            else if (norm(w) === 'max') max = true;
            else if (Cheats.findNature(w) !== null && norm(lists().natures[Cheats.findNature(w)].k) === norm(w)) nat = Cheats.findNature(w);
            else name.push(w);
          }
          const pid = Cheats.findMon(name.join(' '));
          if (!pid) return err('Nie znam Pokémona: ' + name.join(' '));
          const m = Mon.create({ pid, level: lvl, shiny, nat, ivs: max ? [31, 31, 31, 31, 31, 31] : undefined, ot: s.player.name,
            met: { r: s.region, l: s.loc, lvl, d: Date.now(), how: 'gift' } });
          const where = Game().addMon(m);
          return ok('Dodano ' + (shiny ? '✨ ' : '') + Dex.mon(pid).n + ' (Lv ' + lvl + ')' + (where === 'box' ? ' do PC.' : ' do drużyny.'));
        }
        case 'lvl': case 'poziom': case 'level': {
          const m = needMon(); if (!m) return err('Podaj slot 1–6, np. lvl 1 50');
          Cheats.edit(m, { lvl: args[1] });
          return ok(Mon.name(m) + ' ma teraz poziom ' + m.lvl + '.');
        }
        case 'iv': case 'ev': {
          const m = needMon(); if (!m) return err('Podaj slot 1–6, np. ' + cmd + ' 1 max');
          const a = args.slice(1).map(x => norm(x));
          const cap = cmd === 'iv' ? 31 : 252;
          let vals;
          if (a[0] === 'max') vals = [cap, cap, cap, cap, cap, cap];
          else if (a[0] === 'clear' || a[0] === 'zero') vals = [0, 0, 0, 0, 0, 0];
          else if (a.length === 1 && /^\d+$/.test(a[0])) vals = Array(6).fill(+a[0]);
          else if (a.length === 6 && a.every(x => /^\d+$/.test(x))) vals = a.map(Number);
          else if (a.length === 2 && STAT_KEYS.includes(a[0])) { vals = (cmd === 'iv' ? m.iv : m.ev).slice(); vals[STAT_KEYS.indexOf(a[0])] = +a[1]; }
          else return err('Np. ' + cmd + ' 1 max · ' + cmd + ' 1 31 0 31 31 31 31 · ' + cmd + ' 1 spe 31');
          Cheats.edit(m, { [cmd]: vals });
          return ok(Mon.name(m) + ': ' + cmd.toUpperCase() + ' ' + (cmd === 'iv' ? m.iv : m.ev).join('/') + ' · statystyki ' + Mon.stats(m).join('/'));
        }
        case 'natura': case 'nature': {
          const m = needMon(); const nat = Cheats.findNature(args.slice(1).join(' '));
          if (!m || nat === null) return err('Np. natura 1 adamant');
          Cheats.edit(m, { nat });
          return ok(Mon.name(m) + ': natura ' + Dex.nature(nat).n + '.');
        }
        case 'zdolnosc': case 'ability': {
          const m = needMon(); if (!m) return err('Np. zdolnosc 1 ukryta');
          const a = norm(args[1] || '');
          const p = Dex.mon(m.pid);
          let slot = a === '1' ? 0 : a === '2' ? 1 : a === 'ukryta' || a === 'hidden' || a === 'h' || a === '3' ? 2 : p.a.findIndex(id => id && norm(Dex.ability(id).n) === a);
          if (slot < 0 || !p.a[slot]) return err('Zdolności: ' + p.a.map((id, i) => id ? (i + 1) + ' ' + Dex.ability(id).n : '').filter(Boolean).join(', '));
          Cheats.edit(m, { abil: slot });
          return ok(Mon.name(m) + ': zdolność ' + Dex.ability(p.a[slot]).n + '.');
        }
        case 'shiny': {
          const m = needMon(); if (!m) return err('Np. shiny 1');
          Cheats.edit(m, { shiny: norm(args[1] || '') !== 'off' });
          return ok(Mon.name(m) + (m.shiny ? ' błyszczy! ✨' : ' nie jest już shiny.'));
        }
        case 'ruch': case 'move': {
          const m = needMon(); const i = +args[1] - 1; const mid = Cheats.findMove(args.slice(2).join(' '));
          if (!m || !(i >= 0 && i < 4) || !mid) return err('Np. ruch 1 2 earthquake');
          const ids = m.moves.map(x => x.id);
          ids[Math.min(i, ids.length)] = mid;
          Cheats.edit(m, { moves: ids });
          return ok(Mon.name(m) + ' zna teraz: ' + m.moves.map(x => Dex.move(x.id).n).join(', ') + '.');
        }
        case 'trzyma': case 'held': {
          const m = needMon(); if (!m) return err('Np. trzyma 1 leftovers');
          const q = args.slice(1).join(' ');
          const none = ['brak', 'none', 'nic'].includes(norm(q));
          const id = none ? null : Cheats.findItem(q);
          if (!none && !id) return err('Nie znam przedmiotu: ' + q);
          Cheats.edit(m, { item: id });
          return ok(Mon.name(m) + (id ? ' trzyma ' + Dex.item(id).n + '.' : ' nic nie trzyma.'));
        }
        case 'tera': {
          const m = needMon(); const t = Cheats.findType(args.slice(1).join(' '));
          if (!m || t === null) return err('Np. tera 1 fire');
          Cheats.edit(m, { tera: t });
          return ok(Mon.name(m) + ': typ Tera ' + Dex.typeName(t) + '.');
        }
        case 'gatunek': case 'species': case 'forma': {
          const m = needMon(); const pid = Cheats.findMon(args.slice(1).join(' '));
          if (!m || !pid) return err('Np. gatunek 1 charizard-mega-x');
          Cheats.edit(m, { pid });
          return ok('Slot ' + args[0] + ' to teraz ' + Dex.mon(pid).n + '.');
        }
        case 'ewoluuj': case 'evolve': {
          const m = needMon(); if (!m) return err('Np. ewoluuj 1');
          const sp = Dex.speciesOf(m.pid);
          const row = (sp.evo || [])[0];
          if (!row) return err(Dex.mon(m.pid).n + ' już nie ewoluuje.');
          const before = Mon.name(m);
          PW.Flow.doEvolve(m, row);
          Cheats.mark();
          return ok(before + ' ewoluował w ' + Dex.mon(m.pid).n + '!');
        }
        case 'ulecz': case 'heal':
          Game().healParty();
          return ok('Drużyna wyleczona.');
        case 'kasa': case 'money': case 'pieniadze':
          s.player.money = U.clamp(+args[0] || 0, 0, 9999999);
          return ok('Pieniądze: ' + U.money(s.player.money));
        case 'bp':
          s.player.bp = Math.max(0, +args[0] || 0);
          return ok('Battle Points: ' + s.player.bp);
        case 'monety': case 'coins':
          s.player.coins = U.clamp(+args[0] || 0, 0, 99999);
          return ok('Monety: ' + s.player.coins);
        case 'pa': case 'ap':
          s.player.ap = Game().apMax();
          return ok('PA: ' + s.player.ap + '/' + Game().apMax());
        case 'odznaki': case 'badges': {
          const rid = Cheats.findRegion(args[0] || s.region) || s.region;
          const reg = W().region(rid);
          const n = ['all', 'wszystkie'].includes(norm(args[1] || 'all')) ? reg.gyms.length : U.clamp(+args[1] || 0, 0, reg.gyms.length);
          const r = Game().reg(rid);
          r.badges = Array.from({ length: n }, (_, i) => i);
          PW.Story.giveRods(rid, n);
          return ok(reg.name + ': ' + n + ' ' + U.plural(n, ['odznaka', 'odznaki', 'odznak']) + '.');
        }
        case 'mistrz': case 'champion': {
          const rid = Cheats.findRegion(args[0] || s.region) || s.region;
          const reg = W().region(rid);
          const r = Game().reg(rid);
          r.badges = reg.gyms.map((_, i) => i);
          if (!r.champion) PW.Flow.becomeChampion(rid, reg.champ);
          return ok('Jesteś Mistrzem regionu ' + reg.name + '!');
        }
        case 'tp': case 'teleport': {
          const rid = Cheats.findRegion(args[0] || '');
          if (!rid) return err('Np. tp johto goldenrod city');
          const reg = W().region(rid);
          const q = args.slice(1).join(' ');
          const loc = q ? find(reg.locs.map(l => ({ k: l.id, n: l.n, v: l.id })), q) : { v: Game().reg(rid).center || reg.lab };
          if (!loc) return err('Nie ma takiej lokacji w regionie ' + reg.name + '.');
          PW.Flow.travel(rid, loc.v);
          return ok('Teleport: ' + reg.name + ' – ' + W().locName(rid, loc.v) + '.');
        }
        case 'pokedex': case 'dex': {
          for (const sid of Object.keys(Dex.data.species)) Game().markCaught(Dex.defaultForm(+sid));
          return ok('Wszystkie gatunki oznaczone jako złapane.');
        }
        case 'badania': case 'research': {
          const all = ['all', 'wszystkie'].includes(norm(rest));
          const sids = all ? Object.keys(Dex.data.species).map(Number) : [Cheats.findMon(rest) && Dex.mon(Cheats.findMon(rest)).s].filter(Boolean);
          if (!sids.length) return err('Np. badania pikachu · badania all');
          for (const sid of sids) {
            const d = PW.Research.data(sid);
            for (const t of PW.Research.tasks(sid)) d[t.k] = Math.max(d[t.k] || 0, t.steps[t.steps.length - 1]);
          }
          return ok('Ukończone badania: ' + (all ? 'wszystkie gatunki' : Dex.species(sids[0]).n) + '.');
        }
        case 'prezent': case 'gift':
          PW.Gifts.state().last = '';
          return ok('Tajemniczy Prezent możesz odebrać jeszcze raz.');
        case 'loteria': case 'lottery':
          s.lottery = null;
          return ok('Loteria dostępna jeszcze raz.');
        case 'czas': case 'time': {
          const t = TIME[norm(args[0] || '')] || null;
          Cheats.state().time = t;
          return ok(t ? 'Pora dnia w grze: ' + ({ morning: 'rano', day: 'dzień', night: 'noc' })[t] + '.' : 'Pora dnia znów według zegara.');
        }
        case 'pogoda': case 'weather': {
          const loc = W().here();
          const key = s.region + '/' + loc.id;
          const cond = WEATHER[norm(args[0] || '')];
          if (!cond) { delete s.weatherOverride[key]; return ok('Pogoda w ' + loc.n + ' znów naturalna.'); }
          s.weatherOverride[key] = { cond, until: Date.now() + 24 * 3600 * 1000 };
          return ok('Pogoda w ' + loc.n + ': ' + W().weatherInfo(cond).label + ' (na 24 h).');
        }
        case 'cheat': {
          const k = norm(args[0] || '');
          const st = Cheats.state();
          if (k === 'exp') { st.expMult = U.clamp(+args[1] || 1, 1, 100); return ok('Mnożnik EXP: ×' + st.expMult); }
          const key = TOGGLES[k];
          if (!key) return err('cheat catch|shiny|ohko|nowild|notrainer [on|off] · cheat exp <mnożnik>');
          const v = norm(args[1] || '');
          st[key] = v === 'on' ? true : v === 'off' ? false : !st[key];
          return ok(k + ': ' + (st[key] ? 'włączone' : 'wyłączone'));
        }
      }
      return err('Nieznana komenda „' + parts[0] + '”. Wpisz pomoc.');
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
