/* Turn-based single battle engine following Generation IX mechanics.
 *
 * The engine is UI-agnostic: every turn produces a list of events ({t:'msg'|'hp'|'switch'|...})
 * that the battle screen animates. State lives on Battle / Side / Battler objects.
 */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon, BD = PW.BD;

  let TY = null; // type name -> index
  function ty(name) {
    if (!TY) { TY = {}; Dex.types().forEach((t, i) => { TY[t] = i; }); }
    return TY[name];
  }
  const STAGE_NAMES = ['', 'Atak', 'Obrona', 'Sp. Atak', 'Sp. Obrona', 'Szybkość', 'Celność', 'Unik'];
  function stageMult(n) { return n >= 0 ? (2 + n) / 2 : 2 / (2 - n); }
  function accMult(n) { return n >= 0 ? (3 + n) / 3 : 3 / (3 - n); }
  const SELF_TARGETS = ['user', 'users-field', 'user-and-allies', 'user-or-ally', 'ally', 'all-allies'];
  const CONTACT = 'contact';

  // ======================================================================= Battler
  class Battler {
    constructor(battle, side, mon) {
      this.b = battle; this.side = side; this.mon = mon;
      this.stages = [0, 0, 0, 0, 0, 0, 0, 0];
      this.v = {};
      this.turnsIn = 0;
      this.basePid = mon.pid;
      this.resetTypes();
      this.abil = Dex.abilityKey(Mon.abilityId(mon));
      this.lastMove = null;
      this.movedThisTurn = false;
      this.damagedThisTurn = false;
      this.statCache = null;
    }
    get name() { return Mon.name(this.mon); }
    get foe() { return this.b.sides[1 - this.side.id].active; }
    get hp() { return this.mon.hp; }
    get maxHp() { return this.v.dynaMax || Mon.maxHp(this.mon); }
    get fainted() { return this.mon.hp <= 0; }
    get data() { return Dex.mon(this.mon.pid); }
    get item() { return this.mon.item && !this.v.itemLost ? Dex.item(this.mon.item) : null; }
    get itemKey() { const i = this.item; return i ? i.k : ''; }
    get weight() { return this.data.w / 10 * (this.abil === 'heavy-metal' ? 2 : this.abil === 'light-metal' ? 0.5 : 1); }
    resetTypes() { this.types = Dex.mon(this.mon.pid).t.slice(); }
    hasType(name) { return this.types.includes(ty(name)); }
    rawStat(i) {
      if (!this.statCache || this.statCache.pid !== this.mon.pid) this.statCache = { pid: this.mon.pid, s: Mon.stats(this.mon) };
      if (this.v.transform && i > 0) return this.v.transform[i];
      return this.statCache.s[i];
    }
    isGrounded() {
      if (this.b.field.gravity) return true;
      if (this.v.smackedDown || this.v.ingrain || this.itemKey === 'iron-ball') return true;
      if (this.hasType('flying') && !this.v.roosted) return false;
      if (this.ability() === 'levitate' || this.itemKey === 'air-balloon' || this.v.magnetRise || this.v.telekinesis) return false;
      return true;
    }
    // Ability with suppression (Mold Breaker is checked by callers, Gastro Acid here).
    ability() { return this.v.noAbility ? '' : this.abil; }
    hpFrac() { return this.mon.hp / this.maxHp; }
    isNFE() { const sp = Dex.speciesOf(this.basePid); return !!(sp.evo && sp.evo.length); }
  }

  // ======================================================================= Battle
  class Battle {
    /* opts: {kind:'wild'|'trainer', player:{name, team, flags, game}, foe:{name, title, sprite, team, ai, items, flags},
              env:{weather, terrain, locKind, method, time, region, dexCaught, caughtSpecies:Set, charm}} */
    constructor(opts) {
      this.opts = opts;
      this.kind = opts.kind;
      this.events = [];
      this.env = opts.env || {};
      this.field = { weather: null, wturns: 0, terrain: null, tturns: 0, trickRoom: 0, gravity: 0 };
      this.turn = 0;
      this.over = false;
      this.result = null;
      this.runAttempts = 0;
      this.ballThrows = 0;
      this.money = 0; // Pay Day / Make It Rain
      this.participants = {}; // foe uid -> Set(player uid)
      this.sides = [this.makeSide(0, opts.player, true), this.makeSide(1, opts.foe, false)];
      this.needSwitch = false;
      this.pendingSwitchReason = null;
      this.expLog = [];
      this.movesSeen = []; // [species, move] for Pokédex research
      this.stolen = [];
      this.critCount = {};
    }

    makeSide(id, o, isPlayer) {
      return {
        id, isPlayer, name: o.name || '', title: o.title || '', sprite: o.sprite || '', team: o.team,
        active: null, conds: {}, flags: o.flags || {}, ai: o.ai || (isPlayer ? null : 'wild'),
        items: (o.items || []).slice(), used: {}, faintedCount: 0, wish: null, futureSight: null,
      };
    }

    // ------------------------------------------------------------------ messages / events
    msg(text) { this.events.push({ t: 'msg', text }); }
    ev(e) { this.events.push(e); }
    hpEv(bt) { this.ev({ t: 'hp', side: bt.side.id, hp: Math.max(0, bt.mon.hp), max: bt.maxHp }); }
    flush() { const e = this.events; this.events = []; return e; }
    nm(bt) {
      if (bt.side.isPlayer) return bt.name;
      return (this.kind === 'wild' ? 'Dziki ' : 'Przeciwnik ') + bt.name;
    }

    // ------------------------------------------------------------------ start
    start() {
      const foeSide = this.sides[1], me = this.sides[0];
      if (this.kind === 'wild') {
        const w = foeSide.team[0];
        this.msg((w.shiny ? '✨ ' : '') + 'Dziki ' + Mon.name(w) + ' pojawił się!');
        if (this.opts.foe.totem || this.opts.foe.raid) this.msg(this.opts.foe.raid ? 'To potężny Pokémon z rajdu!' : 'Pokémon Totemiczny emanuje aurą!');
      } else {
        this.msg((foeSide.title ? foeSide.title + ' ' : '') + foeSide.name + ' wyzywa cię na pojedynek!');
      }
      if (this.env.weather) this.setWeather(this.env.weather, 0, null, true);
      if (this.env.terrain) this.setTerrain(this.env.terrain, 0, null);
      const firstFoe = this.firstAble(foeSide);
      if (this.kind !== 'wild') this.msg(foeSide.name + ' wysyła ' + Mon.name(foeSide.team[firstFoe]) + '!');
      this.sendOut(foeSide, firstFoe, true);
      const firstMe = this.firstAble(me);
      this.msg('Naprzód, ' + Mon.name(me.team[firstMe]) + '!');
      this.sendOut(me, firstMe, true);
      this.entryAbilities([me.active, foeSide.active].sort((a, b) => this.speed(b) - this.speed(a)));
      if (this.opts.foe.totem && foeSide.active) {
        const boosts = this.opts.foe.totem;
        for (let i = 1; i < 6; i++) if (boosts[i]) this.boost(foeSide.active, i, boosts[i], null, true);
      }
      return this.flush();
    }

    firstAble(side) {
      for (let i = 0; i < side.team.length; i++) if (side.team[i].hp > 0 && !side.team[i].egg) return i;
      return -1;
    }
    ableCount(side) { return side.team.filter(m => m.hp > 0 && !m.egg).length; }

    sendOut(side, idx, silent) {
      const mon = side.team[idx];
      const bt = new Battler(this, side, mon);
      if (side.active && side.active.v.batonPass) {
        bt.stages = side.active.stages.slice();
        for (const k of ['sub', 'focusEnergy', 'leechSeed', 'ingrain', 'aquaRing', 'confusion']) if (side.active.v[k]) bt.v[k] = side.active.v[k];
      }
      side.active = bt;
      side.activeIdx = idx;
      if (mon.st === 'tox') mon.tox = 0;
      this.ev({ t: 'switch', side: side.id, uid: mon.uid, pid: mon.pid, shiny: mon.shiny, name: Mon.name(mon), lvl: mon.lvl, hp: mon.hp, max: bt.maxHp, st: mon.st, gender: mon.gender });
      if (!side.isPlayer) {
        if (!this.participants[mon.uid]) this.participants[mon.uid] = new Set();
        const mine = this.sides[0].active;
        if (mine) this.participants[mon.uid].add(mine.mon.uid);
      } else {
        const foe = this.sides[1].active;
        if (foe) {
          if (!this.participants[foe.mon.uid]) this.participants[foe.mon.uid] = new Set();
          this.participants[foe.mon.uid].add(mon.uid);
        }
      }
      if (!silent) this.entryHazards(bt);
      return bt;
    }

    entryHazards(bt) {
      const c = bt.side.conds;
      if (bt.itemKey === 'heavy-duty-boots') return;
      if (c.rocks && bt.ability() !== 'magic-guard') {
        const eff = Dex.eff(ty('rock'), bt.types);
        this.damage(bt, Math.max(1, Math.floor(bt.maxHp * eff / 8)), 'Ostre kamienie wbijają się w ' + bt.name + '!');
      }
      if (bt.fainted) return;
      if (c.spikes && bt.isGrounded() && bt.ability() !== 'magic-guard') {
        const frac = [0, 1 / 8, 1 / 6, 1 / 4][c.spikes];
        this.damage(bt, Math.max(1, Math.floor(bt.maxHp * frac)), bt.name + ' rani się o kolce!');
      }
      if (bt.fainted) return;
      if (c.tspikes && bt.isGrounded()) {
        if (bt.hasType('poison')) { delete c.tspikes; this.msg(bt.name + ' wchłania trujące kolce!'); }
        else if (!bt.hasType('steel')) this.setStatus(bt, c.tspikes >= 2 ? 'tox' : 'psn', null, true);
      }
      if (c.web && bt.isGrounded()) { this.msg(bt.name + ' wpada w lepką sieć!'); this.boost(bt, 5, -1, null); }
      this.entryAbilities([bt]);
      this.healOnEntry(bt);
    }

    healOnEntry(bt) {
      const side = bt.side;
      if (side.healingWish) {
        side.healingWish = false;
        bt.mon.hp = bt.maxHp; bt.mon.st = null; this.hpEv(bt);
        this.msg('Uzdrawiające życzenie spełnia się dla ' + bt.name + '!');
      }
    }

    entryAbilities(list) {
      for (const bt of list) {
        if (!bt || bt.fainted) continue;
        const a = bt.ability(), foe = bt.foe;
        switch (a) {
          case 'intimidate':
            if (foe && !foe.fainted) {
              this.msg('Zastraszenie ' + bt.name + ' działa!');
              if (['inner-focus', 'oblivious', 'own-tempo', 'scrappy'].includes(foe.ability())) this.msg(foe.name + ' nie daje się zastraszyć!');
              else this.boost(foe, 1, -1, bt);
              if (foe.ability() === 'rattled') this.boost(foe, 5, 1, foe);
            }
            break;
          case 'drizzle': this.setWeather('rain', 5, bt); break;
          case 'drought': case 'orichalcum-pulse': this.setWeather('sun', 5, bt); break;
          case 'sand-stream': this.setWeather('sand', 5, bt); break;
          case 'snow-warning': this.setWeather('snow', 5, bt); break;
          case 'electric-surge': case 'hadron-engine': this.setTerrain('electric', 5, bt); break;
          case 'psychic-surge': this.setTerrain('psychic', 5, bt); break;
          case 'grassy-surge': this.setTerrain('grassy', 5, bt); break;
          case 'misty-surge': this.setTerrain('misty', 5, bt); break;
          case 'pressure': this.msg(bt.name + ' wywiera presję!'); break;
          case 'mold-breaker': this.msg(bt.name + ' łamie zasady!'); break;
          case 'air-lock': case 'cloud-nine': this.msg('Pogoda przestaje mieć znaczenie.'); break;
          case 'download':
            if (foe) this.boost(bt, foe.rawStat(2) < foe.rawStat(4) ? 1 : 3, 1, bt);
            break;
          case 'intrepid-sword': if (!bt.side.used.sword) { bt.side.used.sword = 1; this.boost(bt, 1, 1, bt); } break;
          case 'dauntless-shield': if (!bt.side.used.shield) { bt.side.used.shield = 1; this.boost(bt, 2, 1, bt); } break;
          case 'sword-of-ruin': case 'beads-of-ruin': case 'tablets-of-ruin': case 'vessel-of-ruin':
            this.msg('Zdolność ' + Dex.ability(Mon.abilityId(bt.mon)).n + ' osłabia wszystkich wokół!'); break;
          case 'slow-start': bt.v.slowStart = 5; this.msg(bt.name + ' nie może się rozkręcić!'); break;
          case 'comatose': this.msg(bt.name + ' jest pogrążony w śpiączce!'); break;
        }
      }
    }

    // ------------------------------------------------------------------ weather / terrain
    weather() {
      const a = this.sides[0].active, b = this.sides[1].active;
      const lock = [a, b].some(x => x && !x.fainted && ['air-lock', 'cloud-nine'].includes(x.ability()));
      return lock ? null : this.field.weather;
    }
    setWeather(w, turns, src, silent) {
      if (this.field.weather === w) { if (!silent && src && !src.v.dyna) this.msg('Ale nic się nie stało!'); return false; }
      this.field.weather = w;
      let t = turns === 0 && silent ? 0 : 5;
      if (src && src.itemKey === BD.SETS.weatherRocks[w]) t = 8;
      this.field.wturns = t; // 0 = permanent (overworld weather)
      const txt = { rain: 'Zaczyna padać deszcz!', sun: 'Słońce zaczyna mocno świecić!', sand: 'Zrywa się burza piaskowa!', snow: 'Zaczyna padać śnieg!', fog: 'Mgła spowija pole walki.' }[w];
      this.msg(txt);
      this.ev({ t: 'weather', w });
      return true;
    }
    setTerrain(tt, turns, src) {
      if (this.field.terrain === tt) return false;
      this.field.terrain = tt;
      this.field.tturns = turns === 0 ? 0 : (src && src.itemKey === 'terrain-extender' ? 8 : 5);
      this.msg({ electric: 'Pole walki naelektryzowało się!', grassy: 'Pole walki porasta trawa!', misty: 'Mgła spowija pole walki!', psychic: 'Pole walki staje się dziwne!' }[tt]);
      this.ev({ t: 'terrain', terrain: tt });
      return true;
    }

    // ------------------------------------------------------------------ stats
    speed(bt) {
      if (!bt) return 0;
      let s = bt.rawStat(5) * stageMult(bt.stages[5]);
      const a = bt.ability(), w = this.weather();
      if (a === 'swift-swim' && w === 'rain') s *= 2;
      if (a === 'chlorophyll' && w === 'sun') s *= 2;
      if (a === 'sand-rush' && w === 'sand') s *= 2;
      if (a === 'slush-rush' && w === 'snow') s *= 2;
      if (a === 'quick-feet' && bt.mon.st) s *= 1.5;
      else if (bt.mon.st === 'par') s *= 0.5;
      if (a === 'slow-start' && bt.v.slowStart) s *= 0.5;
      if (bt.itemKey === 'choice-scarf') s *= 1.5;
      if (bt.itemKey === 'iron-ball' || bt.itemKey === 'macho-brace' || bt.itemKey.startsWith('power-')) s *= 0.5;
      if (bt.side.conds.tailwind) s *= 2;
      if (bt.v.unburden) s *= 2;
      if (bt.itemKey === 'quick-powder' && bt.data.k === 'ditto') s *= 2;
      return Math.floor(s);
    }

    boost(bt, stat, n, src, silent) {
      if (!bt || bt.fainted || !n) return false;
      const a = bt.ability();
      if (n < 0 && src && src !== bt) {
        if (bt.side.conds.mist && !(src && src.ability() === 'infiltrator')) { this.msg(bt.name + ' jest chroniony przez Mgłę!'); return false; }
        if (['clear-body', 'white-smoke', 'full-metal-body'].includes(a) || (bt.itemKey === 'clear-amulet')) { if (!silent) this.msg('Zdolność ' + bt.name + ' zapobiega spadkowi statystyk!'); return false; }
        if (a === 'hyper-cutter' && stat === 1) { this.msg(bt.name + ' nie traci Ataku!'); return false; }
        if (a === 'keen-eye' && stat === 6) { this.msg(bt.name + ' nie traci Celności!'); return false; }
        if (a === 'big-pecks' && stat === 2) { this.msg(bt.name + ' nie traci Obrony!'); return false; }
        if (a === 'mirror-armor' && src) { this.msg(bt.name + ' odbija spadek statystyk!'); return this.boost(src, stat, n, null); }
      }
      if (a === 'contrary') n = -n;
      if (a === 'simple') n *= 2;
      const before = bt.stages[stat];
      const after = U.clamp(before + n, -6, 6);
      const diff = after - before;
      if (!diff) {
        this.msg(STAGE_NAMES[stat] + ' ' + bt.name + (n > 0 ? ' nie może już wzrosnąć!' : ' nie może już spaść!'));
        return false;
      }
      bt.stages[stat] = after;
      const words = diff > 0 ? (diff === 1 ? 'wzrasta' : diff === 2 ? 'znacznie wzrasta' : 'drastycznie wzrasta')
        : (diff === -1 ? 'spada' : diff === -2 ? 'znacznie spada' : 'drastycznie spada');
      this.msg(STAGE_NAMES[stat] + ' ' + bt.name + ' ' + words + '!');
      this.ev({ t: 'anim', side: bt.side.id, kind: diff > 0 ? 'stat-up' : 'stat-down' });
      if (diff < 0 && src && src !== bt) {
        if (a === 'defiant') { this.msg('Bunt ' + bt.name + ' się aktywuje!'); this.boost(bt, 1, 2, bt); }
        if (a === 'competitive') { this.msg('Rywalizacja ' + bt.name + ' się aktywuje!'); this.boost(bt, 3, 2, bt); }
        if (bt.itemKey === 'eject-pack') { /* not implemented in singles AI */ }
      }
      return true;
    }

    // ------------------------------------------------------------------ status
    setStatus(bt, st, src, silent, move) {
      if (!bt || bt.fainted) return false;
      const a = bt.ability();
      const fail = (t) => { if (!silent) this.msg(t || 'Ale nic się nie stało!'); return false; };
      if (bt.mon.st) return fail(bt.mon.st === st ? bt.name + ' już ma ' + BD.STATUS_NAME[st] + '!' : null);
      if (a === 'comatose' || a === 'purifying-salt') return fail();
      if (bt.v.sub && src && src !== bt && move && !BD.SETS.sound) return fail();
      if (bt.side.conds.safeguard && src && src !== bt) return fail(bt.name + ' jest chroniony przez Safeguard!');
      if (this.field.terrain === 'misty' && bt.isGrounded()) return fail(bt.name + ' otacza ochronna mgła!');
      if (a === 'leaf-guard' && this.weather() === 'sun') return fail();
      if (a === 'flower-veil' && bt.hasType('grass')) return fail();
      switch (st) {
        case 'brn':
          if (bt.hasType('fire')) return fail();
          if (['water-veil', 'water-bubble', 'thermal-exchange', 'well-baked-body'].includes(a)) return fail('Zdolność ' + bt.name + ' zapobiega poparzeniu!');
          break;
        case 'par':
          if (bt.hasType('electric')) return fail();
          if (a === 'limber') return fail('Zdolność ' + bt.name + ' zapobiega paraliżowi!');
          break;
        case 'slp':
          if (['insomnia', 'vital-spirit', 'sweet-veil'].includes(a)) return fail('Zdolność ' + bt.name + ' nie pozwala zasnąć!');
          if (this.field.terrain === 'electric' && bt.isGrounded()) return fail();
          break;
        case 'frz':
          if (bt.hasType('ice') || this.weather() === 'sun') return fail();
          if (a === 'magma-armor') return fail();
          break;
        case 'psn': case 'tox':
          if ((bt.hasType('poison') || bt.hasType('steel')) && !(src && src.ability() === 'corrosion')) return fail();
          if (a === 'immunity') return fail('Odporność ' + bt.name + ' chroni przed trucizną!');
          break;
      }
      bt.mon.st = st;
      if (st === 'slp') bt.mon.slp = U.int(1, 3);
      if (st === 'tox') bt.mon.tox = 0;
      const txt = { brn: ' zostaje poparzony!', par: ' zostaje sparaliżowany! Może nie móc się ruszyć!', slp: ' zasypia!', frz: ' zostaje zamrożony!', psn: ' zostaje zatruty!', tox: ' zostaje ciężko zatruty!' }[st];
      this.msg(this.nm(bt) + txt);
      this.ev({ t: 'status', side: bt.side.id, st });
      // Synchronize passes burn/poison/paralysis back.
      if (a === 'synchronize' && src && src !== bt && ['brn', 'par', 'psn', 'tox'].includes(st) && !src.mon.st) {
        this.msg('Synchronizacja ' + bt.name + ' przenosi status!');
        this.setStatus(src, st === 'tox' ? 'tox' : st, bt, true);
      }
      this.checkCureBerry(bt);
      return true;
    }

    confuse(bt, src, silent) {
      if (!bt || bt.fainted) return false;
      if (bt.v.confusion) { if (!silent) this.msg(this.nm(bt) + ' jest już zdezorientowany!'); return false; }
      if (bt.ability() === 'own-tempo') { if (!silent) this.msg('Własne tempo ' + bt.name + ' chroni przed dezorientacją!'); return false; }
      if (this.field.terrain === 'misty' && bt.isGrounded()) return false;
      if (bt.side.conds.safeguard && src && src !== bt) return false;
      bt.v.confusion = U.int(2, 5);
      this.msg(this.nm(bt) + ' jest zdezorientowany!');
      this.checkCureBerry(bt);
      return true;
    }

    cureStatus(bt, silent) {
      if (!bt.mon.st) return;
      const st = bt.mon.st;
      bt.mon.st = null; bt.mon.slp = 0; bt.mon.tox = 0;
      if (!silent) {
        const txt = { brn: ' nie jest już poparzony!', par: ' nie jest już sparaliżowany!', slp: ' budzi się!', frz: ' odtaja!', psn: ' nie jest już zatruty!', tox: ' nie jest już zatruty!' }[st];
        this.msg(this.nm(bt) + txt);
      }
      this.ev({ t: 'status', side: bt.side.id, st: null });
    }

    // ------------------------------------------------------------------ HP changes
    damage(bt, amount, text, defer) {
      if (bt.fainted || amount <= 0) return 0;
      const dealt = Math.min(bt.mon.hp, Math.floor(amount));
      bt.mon.hp -= dealt;
      if (text) this.msg(text);
      this.hpEv(bt);
      if (bt.mon.hp <= 0) { if (defer) bt.v.faintPending = true; else this.faint(bt); }
      else this.checkPinchItems(bt);
      return dealt;
    }
    processFaints() {
      for (const s of this.sides) {
        const bt = s.active;
        if (bt && bt.v.faintPending) { bt.v.faintPending = false; this.faint(bt); }
      }
    }
    heal(bt, amount, text) {
      if (bt.fainted || amount <= 0) return 0;
      if (bt.v.healBlock) return 0;
      const before = bt.mon.hp;
      bt.mon.hp = Math.min(bt.maxHp, bt.mon.hp + Math.floor(amount));
      const healed = bt.mon.hp - before;
      if (healed > 0) {
        if (text) this.msg(text);
        this.hpEv(bt);
      }
      return healed;
    }
    faint(bt) {
      bt.mon.hp = 0;
      bt.mon.st = null;
      this.msg(this.nm(bt) + ' mdleje!');
      this.ev({ t: 'faint', side: bt.side.id });
      bt.side.faintedCount++;
      if (bt.side.isPlayer) Mon.addFriendship(bt.mon, -1);
      if (bt.v.destinyBond && bt.v.lastAttacker && !bt.v.lastAttacker.fainted) {
        this.msg(bt.name + ' zabiera przeciwnika ze sobą!');
        this.faint(bt.v.lastAttacker);
      }
      if (!bt.side.isPlayer) this.awardExp(bt);
    }

    checkPinchItems(bt) {
      const k = bt.itemKey;
      if (!k || bt.fainted || bt.v.noItem) return;
      const frac = bt.hpFrac();
      const gluttony = bt.ability() === 'gluttony' ? 0.5 : 0.25;
      if (k === 'sitrus-berry' && frac <= 0.5) { this.consumeItem(bt); this.heal(bt, bt.maxHp / 4, bt.name + ' zjada Sitrus Berry i odzyskuje HP!'); }
      else if (k === 'oran-berry' && frac <= 0.5) { this.consumeItem(bt); this.heal(bt, 10, bt.name + ' zjada Oran Berry i odzyskuje HP!'); }
      else if (BD.FLAVOR_BERRIES.includes(k) && frac <= gluttony) { this.consumeItem(bt); this.heal(bt, bt.maxHp / 3, bt.name + ' zjada jagodę i odzyskuje HP!'); }
      else if (BD.PINCH_BERRIES[k] && frac <= gluttony) { this.consumeItem(bt); this.msg(bt.name + ' zjada jagodę!'); this.boost(bt, BD.PINCH_BERRIES[k], 1, bt); }
      else if (k === 'starf-berry' && frac <= gluttony) { this.consumeItem(bt); this.boost(bt, U.int(1, 5), 2, bt); }
      else if (k === 'berry-juice' && frac <= 0.5) { this.consumeItem(bt); this.heal(bt, 20, bt.name + ' wypija Berry Juice!'); }
    }
    checkCureBerry(bt) {
      const k = bt.itemKey;
      const cures = BD.CURE_BERRIES[k];
      if (!cures) return;
      const st = bt.mon.st;
      if (st && cures.includes(st)) { const n = bt.item.n; this.consumeItem(bt); this.msg(bt.name + ' zjada ' + n + '!'); this.cureStatus(bt); }
      else if (bt.v.confusion && cures.includes('conf')) { this.consumeItem(bt); bt.v.confusion = 0; this.msg(bt.name + ' nie jest już zdezorientowany!'); }
    }
    consumeItem(bt) {
      if (!bt.mon.item) return;
      bt.v.consumed = bt.mon.item;
      if (bt.side.isPlayer && this.kind !== 'wild') { bt.v.itemLost = true; }
      else bt.mon.item = null;
      if (bt.ability() === 'unburden') bt.v.unburden = true;
    }

    // ------------------------------------------------------------------ experience
    awardExp(foeBt) {
      const me = this.sides[0];
      const foe = foeBt.mon;
      const set = this.participants[foe.uid] || new Set();
      const game = this.opts.player.game;
      const shareAll = !(game && game.s && game.s.settings && game.s.settings.expShare === false);
      const evYield = Dex.mon(foeBt.basePid).e;
      const mult = (this.opts.cheats || {}).expMult || 1;
      for (const m of me.team) {
        if (m.egg || m.hp <= 0 || m.lvl >= 100 && !set.has(m.uid)) continue;
        const part = set.has(m.uid);
        if (!part && !shareAll) continue;
        const exp = Mon.expYield(foe, m, { participated: part, multiplier: mult, playerName: this.opts.player.name });
        const evm = (m.item && Dex.item(m.item) && Dex.item(m.item).k === 'macho-brace') ? 2 : 1;
        Mon.addEVs(m, evYield, evm);
        const pitem = m.item && Dex.item(m.item) ? Dex.item(m.item).k : '';
        const POWER = { 'power-weight': 0, 'power-bracer': 1, 'power-belt': 2, 'power-lens': 3, 'power-band': 4, 'power-anklet': 5 };
        if (pitem in POWER) { const arr = [0, 0, 0, 0, 0, 0]; arr[POWER[pitem]] = 8; Mon.addEVs(m, arr, 1); }
        if (m.lvl >= 100) continue;
        this.msg(Mon.name(m) + ' zdobywa ' + exp + ' pkt doświadczenia!');
        const levels = Mon.addExp(m, exp);
        this.ev({ t: 'exp', uid: m.uid, exp: m.exp, lvl: m.lvl });
        for (const lv of levels) {
          this.msg(Mon.name(m) + ' awansuje na poziom ' + lv.lvl + '!');
          this.ev({ t: 'level', uid: m.uid, lvl: lv.lvl, side: me.active && me.active.mon === m ? 0 : -1 });
          for (const mid of lv.learned) this.msg(Mon.name(m) + ' uczy się ' + Dex.move(mid).n + '!');
          this.expLog.push(lv);
          if (me.active && me.active.mon === m) { me.active.statCache = null; this.hpEv(me.active); }
        }
      }
      if (foeBt.v && foeBt.data.k === 'bisharp') {
        const killer = me.active;
        if (killer && killer.mon.hp > 0 && killer.itemKey === 'leaders-crest') killer.mon.bisharpKOs = (killer.mon.bisharpKOs || 0) + 1;
      }
    }

    // ================================================================== TURN
    // action: {type:'move', index, mega, z, dyna, tera} | {type:'switch', index} | {type:'item', item, target}
    //         | {type:'ball', item} | {type:'run'}
    turnPlayer(action) {
      if (this.over) return [];
      this.turn++;
      const me = this.sides[0], foe = this.sides[1];
      const myBt = me.active, foeBt = foe.active;
      for (const s of this.sides) if (s.active) { s.active.movedThisTurn = false; s.active.damagedThisTurn = false; s.active.v.protect = false; s.active.v.hitBy = null; }
      const foeAction = this.chooseAI(foe);
      const acts = [];
      acts.push({ side: me, bt: myBt, a: this.lockedAction(myBt) || action });
      acts.push({ side: foe, bt: foeBt, a: this.lockedAction(foeBt) || foeAction });

      // Non-move actions first: run, ball, item, switch.
      for (const x of acts) {
        if (this.over) break;
        if (x.a.type === 'run' && x.side.isPlayer) { if (this.tryRun()) { this.finish('run'); return this.flush(); } x.done = true; }
        else if (x.a.type === 'run') {
          const bt = x.side.active;
          if (bt.v.trapped || bt.mon.st === 'slp' || bt.mon.st === 'frz' || (myBt && ['shadow-tag', 'arena-trap'].includes(myBt.ability()))) { x.a = { type: 'move', index: 0 }; continue; }
          this.msg(this.nm(bt) + ' ucieka!');
          this.finish('fled');
          return this.flush();
        }
      }
      for (const x of acts) {
        if (this.over || x.done) continue;
        if (x.a.type === 'ball') { this.throwBall(x.a.item); x.done = true; if (this.over) return this.finishEvents(); }
        else if (x.a.type === 'item') { this.useBattleItem(x.side, x.a.item, x.a.target); x.done = true; }
      }
      for (const x of acts) {
        if (this.over || x.done) continue;
        if (x.a.type === 'switch') { this.doSwitch(x.side, x.a.index); x.done = true; }
      }
      // Gimmicks happen before moves.
      for (const x of acts.filter(x => !x.done && x.a.type === 'move').sort((p, q) => this.speed(q.bt) - this.speed(p.bt))) {
        const bt = x.side.active;
        if (x.a.mega) this.megaEvolve(bt);
        if (x.a.tera) this.terastallize(bt);
        if (x.a.dyna) this.dynamax(bt);
      }
      // Moves ordered by priority, then speed.
      const moveActs = acts.filter(x => !x.done && x.a.type === 'move');
      for (const x of moveActs) {
        x.bt = x.side.active;
        x.moveId = this.resolveMoveId(x.bt, x.a);
        const mv = Dex.move(x.moveId);
        x.prio = this.priority(x.bt, mv, x.a);
        x.spd = this.speed(x.bt);
        if (x.bt.itemKey === 'quick-claw' && U.chance(0.2)) { x.quick = true; }
      }
      moveActs.sort((p, q) => {
        if (p.prio !== q.prio) return q.prio - p.prio;
        if (p.quick !== q.quick) return p.quick ? -1 : 1;
        if (p.spd !== q.spd) return this.field.trickRoom ? p.spd - q.spd : q.spd - p.spd;
        return U.rand() < 0.5 ? -1 : 1;
      });
      moveActs.forEach((x, i) => { x.order = i; x.bt.lastIntent = x.moveId; });
      this.turnOrder = moveActs.map(x => x.bt);
      this.queue = moveActs;
      return this.runQueue();
    }

    // Runs the remaining move actions of the turn; pauses when the player must pick a U-turn replacement.
    runQueue() {
      while (this.queue && this.queue.length) {
        const x = this.queue.shift();
        if (this.over) break;
        const bt = x.side.active;
        if (!bt || bt.fainted || bt !== x.bt) continue;
        if (x.quick) this.msg('Quick Claw pozwala ' + bt.name + ' ruszyć się pierwszym!');
        this.executeMove(bt, x.moveId, x.a);
        bt.movedThisTurn = true;
        if (this.checkEnd()) return this.finishEvents();
        if (this.needSwitch && this.pendingSwitchReason === 'pivot') return this.flush();
      }
      this.queue = null;
      if (!this.over) this.endOfTurn();
      if (this.checkEnd()) return this.finishEvents();
      this.handleFaintReplacements();
      return this.flush();
    }

    lockedAction(bt) {
      if (!bt || bt.fainted) return null;
      if (bt.v.recharge) return { type: 'move', recharge: true };
      if (bt.v.charging) return { type: 'move', forced: bt.v.charging };
      if (bt.v.rampage) return { type: 'move', forced: bt.v.rampage.move };
      if (bt.v.rollout) return { type: 'move', forced: bt.v.rollout.move };
      return null;
    }

    resolveMoveId(bt, a) {
      if (a.recharge) return -1;
      if (a.forced) return a.forced;
      if (a.struggle) return 165;
      if (bt.v.encore && bt.v.encore.turns > 0) return bt.v.encore.move;
      const slot = bt.mon.moves[a.index];
      if (!slot) return 165;
      return slot.id;
    }

    priority(bt, mv, a) {
      if (!mv) return 0;
      let p = mv.pr || 0;
      const k = mv.k;
      if (bt.ability() === 'prankster' && mv.c === 0) p += 1;
      if (bt.ability() === 'gale-wings' && mv.t === ty('flying') && bt.hpFrac() >= 1) p += 1;
      if (bt.ability() === 'triage' && (mv.m && (mv.m[0] === 3 || mv.m[6] > 0))) p += 3;
      if (k === 'grassy-glide' && this.field.terrain === 'grassy') p += 1;
      if (a && a.dyna || bt.v.dyna) p = mv.c === 0 ? 4 : mv.pr;
      return p;
    }

    tryRun() {
      if (this.kind !== 'wild') { this.msg('Nie możesz uciec z walki z trenerem!'); return false; }
      const me = this.sides[0].active, w = this.sides[1].active;
      if (this.opts.foe.noRun) { this.msg('Nie możesz uciec!'); return false; }
      if (me.itemKey === 'smoke-ball' || me.ability() === 'run-away' || me.hasType('ghost')) { this.msg('Udało się uciec!'); return true; }
      if (me.v.trapped || (w.ability() === 'shadow-tag' && me.ability() !== 'shadow-tag') || (w.ability() === 'arena-trap' && me.isGrounded()) || (w.ability() === 'magnet-pull' && me.hasType('steel'))) {
        this.msg('Nie możesz uciec!'); return false;
      }
      this.runAttempts++;
      const ps = this.speed(me), ws = this.speed(w);
      if (ps >= ws) { this.msg('Udało się uciec!'); return true; }
      const f = Math.floor(ps * 128 / Math.max(1, ws)) + 30 * this.runAttempts;
      if (f > 255 || U.int(0, 255) < f) { this.msg('Udało się uciec!'); return true; }
      this.msg('Nie udało się uciec!');
      return false;
    }

    doSwitch(side, idx, forced) {
      const old = side.active;
      if (old && !old.fainted) {
        if (!forced) {
          const foe = old.foe;
          const trapped = old.v.trapped || (foe && !foe.fainted && ((foe.ability() === 'shadow-tag' && old.ability() !== 'shadow-tag') || (foe.ability() === 'arena-trap' && old.isGrounded()) || (foe.ability() === 'magnet-pull' && old.hasType('steel'))));
          if (trapped && !old.hasType('ghost') && old.itemKey !== 'shed-shell') { this.msg(old.name + ' nie może zostać wycofany!'); return false; }
        }
        this.switchOutEffects(old);
        this.msg(side.isPlayer ? (old.name + ', wracaj!') : (side.name + ' wycofuje ' + old.name + '!'));
      }
      if (side.isPlayer) this.msg('Naprzód, ' + Mon.name(side.team[idx]) + '!');
      else this.msg(side.name + ' wysyła ' + Mon.name(side.team[idx]) + '!');
      const bt = this.sendOut(side, idx);
      return bt;
    }

    switchOutEffects(bt) {
      const a = bt.ability();
      if (a === 'natural-cure' && bt.mon.st) { bt.mon.st = null; bt.mon.slp = 0; }
      if (a === 'regenerator' && !bt.fainted) bt.mon.hp = Math.min(bt.maxHp, bt.mon.hp + Math.floor(bt.maxHp / 3));
      if (bt.v.dyna) this.endDynamax(bt, true);
      if (bt.v.transform) bt.v.transform = null;
      if (bt.mon.st === 'tox') bt.mon.tox = 0;
    }

    // Called by the UI when the player's active Pokémon fainted or used U-turn.
    choosePlayerSwitch(idx) {
      const me = this.sides[0];
      if (!this.needSwitch) return [];
      this.needSwitch = false;
      const reason = this.pendingSwitchReason;
      this.pendingSwitchReason = null;
      if (reason === 'pivot' && me.active && !me.active.fainted) {
        this.switchOutEffects(me.active);
        this.msg(me.active.name + ' wraca!');
      }
      this.msg('Naprzód, ' + Mon.name(me.team[idx]) + '!');
      this.sendOut(me, idx);
      if (reason === 'pivot') return this.runQueue();
      if (this.checkEnd()) return this.finishEvents();
      this.handleFaintReplacements();
      return this.flush();
    }

    handleFaintReplacements() {
      const foe = this.sides[1], me = this.sides[0];
      if (foe.active && foe.active.fainted && this.ableCount(foe) > 0) {
        const idx = this.aiChooseReplacement(foe);
        this.msg(foe.name + ' wysyła ' + Mon.name(foe.team[idx]) + '!');
        this.sendOut(foe, idx);
      }
      if (me.active && me.active.fainted && this.ableCount(me) > 0) {
        this.needSwitch = true;
        this.pendingSwitchReason = 'faint';
      }
    }

    checkEnd() {
      if (this.over) return true;
      const me = this.sides[0], foe = this.sides[1];
      if (this.ableCount(foe) === 0) { this.finish('win'); return true; }
      if (this.ableCount(me) === 0) { this.finish('lose'); return true; }
      return false;
    }
    finish(result) {
      if (this.over) return;
      this.over = true;
      this.result = result;
      const me = this.sides[0];
      // Revert battle-only forms.
      for (const side of this.sides) {
        if (side.active && side.active.v.dyna) this.endDynamax(side.active, true);
        for (const m of side.team) {
          if (m._basePid) { m.pid = m._basePid; delete m._basePid; }
          if (m.hp > Mon.maxHp(m)) m.hp = Mon.maxHp(m);
        }
      }
      for (const m of me.team) {
        // Trainer battles hand consumed items back (Gen V+).
        if (m.uid && this.kind !== 'wild') { /* itemLost flag lives on battler only */ }
      }
      if (result === 'win' && this.money) this.msg('Zbierasz ' + U.money(this.money) + ' rozsypane na polu walki!');
      if (result === 'lose') this.msg('Nie masz już Pokémonów zdolnych do walki...');
      this.ev({ t: 'end', result });
    }
    finishEvents() { return this.flush(); }

    // ================================================================== MOVE EXECUTION
    executeMove(bt, moveId, a) {
      const foe = bt.foe;
      if (moveId === -1) {
        this.msg(bt.name + ' musi odpocząć!');
        bt.v.recharge = false;
        return;
      }
      let mv = Dex.move(moveId);
      if (!mv) return;
      if (!this.canMove(bt, mv)) { bt.v.rampage = null; bt.v.charging = null; bt.v.rollout = null; return; }
      // Choice lock / Encore / Taunt / Disable / Assault Vest
      if (bt.v.taunt && mv.c === 0 && !a.forced) { this.msg(bt.name + ' nie może użyć ' + mv.n + ' po prowokacji!'); return; }
      if (bt.v.disabled && bt.v.disabled.move === moveId) { this.msg(mv.n + ' jest zablokowany!'); return; }
      if (bt.itemKey === 'assault-vest' && mv.c === 0 && !a.forced) { this.msg(bt.name + ' nie może używać ruchów statusowych z Assault Vest!'); return; }
      // PP
      const slot = bt.mon.moves.find(x => x.id === moveId);
      const fromSlot = slot && !a.forced && !a.struggle;
      if (fromSlot) {
        if (slot.pp <= 0) { moveId = 165; mv = Dex.move(165); }
        else slot.pp -= (foe && foe.ability() === 'pressure' && mv.tg !== 'user') ? Math.min(2, slot.pp) : 1;
      }
      bt.mon.moveUse[moveId] = (bt.mon.moveUse[moveId] || 0) + 1;
      this.movesSeen.push([Dex.mon(bt.mon.pid).s, moveId]);
      // Z-Move / Max Move transformation
      let zInfo = null, maxInfo = null;
      if (a.z && this.canZ(bt, mv)) zInfo = this.zMove(bt, mv);
      else if (bt.v.dyna) maxInfo = this.maxMove(bt, mv);
      const displayName = zInfo ? zInfo.name : maxInfo ? maxInfo.name : mv.n;
      if (!a.forced || !bt.v.charging) this.msg(this.nm(bt) + ' używa ' + displayName + '!');
      this.ev({ t: 'anim', side: bt.side.id, kind: 'attack', type: Dex.typeKey(this.moveType(bt, mv)), cls: mv.c, move: mv.k });
      bt.lastMove = moveId;
      this.b_lastMoveUsedPrev = this.b_lastMoveUsed;
      this.b_lastMoveUsed = moveId;
      if (bt.v.choiceLock === undefined && ['choice-band', 'choice-specs', 'choice-scarf'].includes(bt.itemKey)) bt.v.choiceLock = moveId;
      if (bt.ability() === 'gorilla-tactics' && bt.v.choiceLock === undefined) bt.v.choiceLock = moveId;
      if (zInfo) { bt.side.used.z = true; }
      // Two-turn moves
      const ch = BD.SETS.charge[mv.k];
      if (ch && !maxInfo && !zInfo) {
        if (!bt.v.charging) {
          const skipSun = ch.sun && this.weather() === 'sun';
          const skipRain = ch.rain && this.weather() === 'rain';
          if (!skipSun && !skipRain) {
            this.msg(ch.msg.replace('%s', bt.name));
            if (ch.boost) this.boost(bt, ch.boost[0], ch.boost[1], bt);
            if (bt.itemKey === 'power-herb') { this.consumeItem(bt); this.msg(bt.name + ' w pełni naładowany dzięki Power Herb!'); }
            else {
              bt.v.charging = moveId;
              if (ch.invuln) bt.v.invuln = ch.invuln;
              return;
            }
          }
        } else {
          bt.v.charging = null;
          bt.v.invuln = null;
        }
      }
      // Target
      const selfTarget = SELF_TARGETS.includes(mv.tg) || mv.tg === 'entire-field' && mv.c === 0;
      const target = selfTarget ? bt : foe;
      if (!selfTarget && (!foe || foe.fainted)) { this.msg('Ale nie ma celu...'); return; }
      // Sucker Punch etc
      if (['sucker-punch', 'thunderclap'].includes(mv.k)) {
        const fa = this.turnOrder || [];
        const foeAct = foe && !foe.movedThisTurn && fa.includes(foe);
        const foeMove = foe && foe.lastIntent;
        if (!foeAct || (foeMove && Dex.move(foeMove) && Dex.move(foeMove).c === 0)) { this.msg('Ale ruch się nie udaje!'); return; }
      }
      if (['fake-out', 'first-impression', 'mat-block'].includes(mv.k) && bt.turnsIn > 0) { this.msg('Ale ruch się nie udaje!'); return; }
      if (mv.k === 'focus-punch' && bt.damagedThisTurn) { this.msg(bt.name + ' traci koncentrację i nie może się ruszyć!'); return; }
      if (mv.k === 'dream-eater' && foe && foe.mon.st !== 'slp' && foe.ability() !== 'comatose') { this.msg('Ale ' + foe.name + ' nie śpi!'); return; }
      if (['snore', 'sleep-talk'].includes(mv.k) && bt.mon.st !== 'slp') { this.msg('Ale ruch się nie udaje!'); return; }
      if (mv.k === 'last-resort' && bt.mon.moves.length < 2) { this.msg('Ale ruch się nie udaje!'); return; }
      if (['gigaton-hammer', 'blood-moon'].includes(mv.k) && bt.v.lastWas === moveId) { this.msg('Nie można użyć tego ruchu dwa razy z rzędu!'); return; }
      bt.v.lastWas = moveId;

      // Queenly Majesty / Dazzling / Armor Tail block priority moves aimed at the holder.
      if (!selfTarget && this.priority(bt, mv, a) > 0 && ['queenly-majesty', 'dazzling', 'armor-tail'].includes(target.ability()) && !this.moldBreaks(bt)) {
        this.msg(target.name + ' nie pozwala użyć tego ruchu!'); return;
      }
      // Protection
      const unseen = bt.ability() === 'unseen-fist' && (mv.fl || []).includes(CONTACT);
      if (!selfTarget && target.v.protect && (mv.fl || []).includes('protect') && !zInfo && !maxInfo && !unseen) {
        if (['feint', 'shadow-force', 'phantom-force', 'hyperspace-hole', 'hyperspace-fury'].includes(mv.k)) {
          target.v.protect = false; this.msg(target.name + ' traci osłonę!');
        } else {
          this.msg(this.nm(target) + ' chroni się!');
          if (target.v.protectKind === 'spiky-shield' && (mv.fl || []).includes(CONTACT)) this.damage(bt, bt.maxHp / 8, bt.name + ' rani się o kolce!');
          if (target.v.protectKind === 'baneful-bunker' && (mv.fl || []).includes(CONTACT)) this.setStatus(bt, 'psn', target, true);
          if (target.v.protectKind === 'burning-bulwark' && (mv.fl || []).includes(CONTACT)) this.setStatus(bt, 'brn', target, true);
          if (target.v.protectKind === 'kings-shield' && (mv.fl || []).includes(CONTACT)) this.boost(bt, 1, -1, target);
          if (target.v.protectKind === 'silk-trap' && (mv.fl || []).includes(CONTACT)) this.boost(bt, 5, -1, target);
          if (target.v.protectKind === 'obstruct' && (mv.fl || []).includes(CONTACT)) this.boost(bt, 2, -2, target);
          bt.v.rampage = null;
          return;
        }
      }
      // Max Guard for status max moves
      if (maxInfo && mv.c === 0) { this.protectMove(bt, 'max-guard'); return; }

      // Accuracy
      if (!selfTarget && !this.hits(bt, target, mv)) {
        this.msg(this.nm(bt) + ' pudłuje!');
        if (['jump-kick', 'high-jump-kick', 'axe-kick', 'supercell-slam'].includes(mv.k)) this.damage(bt, bt.maxHp / 2, bt.name + ' upada i rani się!');
        bt.v.rampage = null; bt.v.rollout = null; bt.v.furyCutter = 0;
        if (bt.itemKey === 'blunder-policy') { this.consumeItem(bt); this.boost(bt, 5, 2, bt); }
        return;
      }

      if (mv.c === 0 && !zInfo) {
        this.statusMove(bt, target, mv);
      } else if (mv.c === 0 && zInfo) {
        this.msg(bt.name + ' wzmacnia się mocą Z!');
        this.boost(bt, 1, 1, bt);
        this.statusMove(bt, target, mv);
      } else {
        this.damagingMove(bt, target, mv, { z: zInfo, max: maxInfo });
      }
      if (BD.SETS.recharge.includes(mv.k) && !bt.fainted && !maxInfo) bt.v.recharge = true;
      if (BD.SETS.rampage.includes(mv.k) && !maxInfo) {
        if (!bt.v.rampage) bt.v.rampage = { move: moveId, turns: U.int(2, 3) };
        bt.v.rampage.turns--;
        if (bt.v.rampage.turns <= 0) {
          bt.v.rampage = null;
          this.msg(bt.name + ' jest wyczerpany szałem!');
          this.confuse(bt, bt);
        }
      }
    }

    canMove(bt, mv) {
      const name = this.nm(bt);
      if (bt.v.flinch) { bt.v.flinch = false; this.msg(name + ' wzdryga się i nie może się ruszyć!'); if (bt.ability() === 'steadfast') this.boost(bt, 5, 1, bt); return false; }
      if (bt.ability() === 'truant' && bt.v.truantSkip) { bt.v.truantSkip = false; this.msg(name + ' leniuchuje!'); return false; }
      if (bt.ability() === 'truant') bt.v.truantSkip = true;
      const st = bt.mon.st;
      if (st === 'slp') {
        bt.mon.slp--;
        if (bt.ability() === 'early-bird') bt.mon.slp--;
        if (bt.mon.slp <= 0) { this.cureStatus(bt); }
        else if (!['snore', 'sleep-talk'].includes(mv.k)) { this.msg(name + ' śpi głęboko.'); return false; }
      }
      if (st === 'frz') {
        if ((mv.fl || []).includes('defrost') || U.chance(0.2)) this.cureStatus(bt);
        else { this.msg(name + ' jest zamrożony!'); return false; }
      }
      if (bt.v.confusion) {
        bt.v.confusion--;
        if (bt.v.confusion <= 0) { this.msg(name + ' nie jest już zdezorientowany!'); }
        else {
          this.msg(name + ' jest zdezorientowany!');
          if (U.chance(1 / 3)) {
            const atk = bt.rawStat(1) * stageMult(bt.stages[1]), def = bt.rawStat(2) * stageMult(bt.stages[2]);
            const dmg = Math.floor(Math.floor(Math.floor(2 * bt.mon.lvl / 5 + 2) * 40 * atk / def) / 50 + 2) * U.int(85, 100) / 100;
            this.damage(bt, Math.max(1, dmg), 'Uderza sam siebie w zamieszaniu!');
            return false;
          }
        }
      }
      if (st === 'par' && U.chance(0.25)) { this.msg(name + ' jest sparaliżowany! Nie może się ruszyć!'); return false; }
      if (bt.v.attract && bt.foe && !bt.foe.fainted) {
        this.msg(name + ' jest zakochany w ' + bt.foe.name + '!');
        if (U.chance(0.5)) { this.msg(name + ' nie może się ruszyć z miłości!'); return false; }
      }
      return true;
    }

    moveType(bt, mv) {
      let t = mv.t;
      const k = mv.k, a = bt.ability(), w = this.weather();
      if (k === 'weather-ball' && w) t = ty({ sun: 'fire', rain: 'water', sand: 'rock', snow: 'ice' }[w] || 'normal');
      if (k === 'terrain-pulse' && this.field.terrain && bt.isGrounded()) t = ty(this.field.terrain === 'grassy' ? 'grass' : this.field.terrain === 'misty' ? 'fairy' : this.field.terrain);
      if (k === 'tera-blast' && bt.v.tera !== undefined) t = bt.v.tera;
      if (k === 'judgment' || k === 'multi-attack' || k === 'techno-blast') {
        const plate = Object.entries(BD.TYPE_ITEMS).find(([key]) => key === bt.itemKey && key.endsWith('plate'));
        if (plate) t = ty(plate[1]);
      }
      if (k === 'revelation-dance') t = bt.types[0];
      if (k === 'ivy-cudgel') {
        const masks = { 'wellspring-mask': 'water', 'hearthflame-mask': 'fire', 'cornerstone-mask': 'rock' };
        if (masks[bt.itemKey]) t = ty(masks[bt.itemKey]);
      }
      if (k === 'raging-bull') {
        const pk = bt.data.k;
        if (pk.includes('combat')) t = ty('fighting'); else if (pk.includes('blaze')) t = ty('fire'); else if (pk.includes('aqua')) t = ty('water');
      }
      if (k === 'aura-wheel' && bt.data.k.includes('hangry')) t = ty('dark');
      if (t === ty('normal') && mv.c !== 0) {
        if (a === 'pixilate') t = ty('fairy');
        else if (a === 'aerilate') t = ty('flying');
        else if (a === 'refrigerate') t = ty('ice');
        else if (a === 'galvanize') t = ty('electric');
      }
      if (a === 'normalize' && mv.c !== 0) t = ty('normal');
      if (a === 'liquid-voice' && (mv.fl || []).includes('sound')) t = ty('water');
      return t;
    }

    hits(bt, target, mv) {
      const k = mv.k;
      // Semi-invulnerable targets
      if (target.v.invuln) {
        const inv = target.v.invuln;
        const ok = (inv === 'fly' && ['thunder', 'hurricane', 'gust', 'twister', 'sky-uppercut', 'smack-down', 'thousand-arrows'].includes(k))
          || (inv === 'dig' && ['earthquake', 'magnitude', 'fissure'].includes(k))
          || (inv === 'dive' && ['surf', 'whirlpool'].includes(k));
        if (!ok && bt.ability() !== 'no-guard' && target.ability() !== 'no-guard') return false;
      }
      if (bt.ability() === 'no-guard' || target.ability() === 'no-guard') return true;
      if (bt.v.lockOn) { bt.v.lockOn = false; return true; }
      if (k === 'toxic' && bt.hasType('poison')) return true;
      if (target.v.minimized && ['stomp', 'body-slam', 'dragon-rush', 'heat-crash', 'heavy-slam', 'flying-press', 'steamroller', 'malicious-moonsault'].includes(k)) return true;
      let acc = mv.a;
      const w = this.weather();
      if (['thunder', 'hurricane', 'bleakwind-storm', 'wildbolt-storm', 'sandsear-storm'].includes(k)) {
        if (w === 'rain') return true;
        if (w === 'sun' && ['thunder', 'hurricane'].includes(k)) acc = 50;
      }
      if (k === 'blizzard' && w === 'snow') return true;
      if (mv.m && mv.m[0] === 9) {
        // OHKO: (user level - target level + 30)%
        if (target.mon.lvl > bt.mon.lvl) return false;
        if (target.ability() === 'sturdy') return false;
        acc = bt.mon.lvl - target.mon.lvl + (k === 'sheer-cold' && !bt.hasType('ice') ? 20 : 30);
        return U.int(1, 100) <= acc;
      }
      if (!acc) return true; // moves that never miss
      const ign = target.ability() === 'unaware';
      let stage = bt.stages[6] - (bt.ability() === 'unaware' || bt.v.foresight ? 0 : target.stages[7]);
      if (ign) stage = 0 - target.stages[7];
      stage = U.clamp(stage, -6, 6);
      let mult = accMult(stage);
      if (bt.ability() === 'compound-eyes') mult *= 1.3;
      if (bt.ability() === 'hustle' && mv.c === 1) mult *= 0.8;
      if (bt.itemKey === 'wide-lens') mult *= 1.1;
      if (bt.itemKey === 'zoom-lens' && target.movedThisTurn) mult *= 1.2;
      if (target.itemKey === 'bright-powder' || target.itemKey === 'lax-incense') mult *= 0.9;
      if ((target.ability() === 'sand-veil' && w === 'sand') || (target.ability() === 'snow-cloak' && w === 'snow')) mult *= 0.8;
      if (w === 'fog') mult *= 0.6;
      if (this.field.gravity) mult *= 5 / 3;
      return U.rand() * 100 < acc * mult;
    }

    // ------------------------------------------------------------------ status moves
    statusMove(bt, target, mv) {
      const k = mv.k;
      if (target !== bt && target.v.sub && !(mv.fl || []).includes('sound') && !['transform', 'roar', 'whirlwind'].includes(k) && mv.tg !== 'opponents-field' && mv.tg !== 'entire-field') {
        this.msg('Ale ruch się nie udaje!'); return;
      }
      // Powder immunity
      if ((mv.fl || []).includes('powder') && target !== bt && (target.hasType('grass') || target.ability() === 'overcoat' || target.itemKey === 'safety-goggles')) {
        this.msg('Nie działa na ' + target.name + '...'); return;
      }
      if (this.uniqueStatus(bt, target, mv)) return;
      const m = mv.m || [0, 0];
      const cat = m[0];
      let did = false;
      // ailment
      if (m[1] > 0 && (cat === 1 || cat === 5)) {
        if (target !== bt && this.statusImmuneByType(target, mv)) { this.msg('Nie działa na ' + target.name + '...'); return; }
        did = this.applyAilment(bt, target, mv, m[1], false) || did;
      }
      if (cat === 5) {
        // Swagger / Flatter: raise target then confuse
        for (const [stat, ch] of mv.sc || []) this.boost(target, stat - 1, ch, bt);
        did = true;
      }
      if (cat === 2 || (cat === 1 && mv.sc)) {
        const tgt = SELF_TARGETS.includes(mv.tg) ? bt : target;
        let any = false;
        for (const [stat, ch] of mv.sc || []) any = this.boost(tgt, stat - 1, ch, bt) || any;
        did = did || any;
        if (!(mv.sc || []).length) { this.msg('Ale nic się nie stało!'); }
        return;
      }
      if (cat === 3) {
        // Heal moves
        let frac = (m[7] || 50) / 100;
        const w = this.weather();
        if (['synthesis', 'moonlight', 'morning-sun'].includes(k)) frac = w === 'sun' ? 2 / 3 : (w ? 0.25 : 0.5);
        if (k === 'shore-up' && w === 'sand') frac = 2 / 3;
        if (bt.hp >= bt.maxHp) { this.msg('HP ' + bt.name + ' jest pełne!'); return; }
        if (k === 'roost') bt.v.roosted = true;
        this.heal(bt, Math.ceil(bt.maxHp * frac), bt.name + ' odzyskuje HP!');
        return;
      }
      if (cat === 9) return; // OHKO status (none)
      if (!did && cat !== 1) this.msg('Ale nic się nie stało!');
    }

    statusImmuneByType(target, mv) {
      if (mv.k === 'thunder-wave' && (target.hasType('ground') || target.hasType('electric'))) return true;
      if (mv.k === 'will-o-wisp' && target.hasType('fire')) return true;
      if (['toxic', 'poison-powder', 'poison-gas'].includes(mv.k) && (target.hasType('poison') || target.hasType('steel'))) return true;
      if (mv.k === 'leech-seed' && target.hasType('grass')) return true;
      return false;
    }

    applyAilment(src, target, mv, ail, secondary) {
      const badly = ['toxic', 'poison-fang', 'malignant-chain'].includes(mv.k) || mv.ef === 34;
      switch (ail) {
        case 1: return this.setStatus(target, 'par', src, secondary, mv);
        case 2: return this.setStatus(target, 'slp', src, secondary, mv);
        case 3: return this.setStatus(target, 'frz', src, secondary, mv);
        case 4: return this.setStatus(target, 'brn', src, secondary, mv);
        case 5: return this.setStatus(target, badly ? 'tox' : 'psn', src, secondary, mv);
        case 6: return this.confuse(target, src, secondary);
        case 7:
          if (target.mon.gender === 'N' || src.mon.gender === 'N' || target.mon.gender === src.mon.gender || target.ability() === 'oblivious') { if (!secondary) this.msg('Ale nic się nie stało!'); return false; }
          target.v.attract = true; this.msg(this.nm(target) + ' zakochuje się!'); return true;
        case 8: {
          if (target.v.trapped) return false;
          const turns = mv.m && mv.m[4] ? U.int(mv.m[4], mv.m[5] || mv.m[4]) : 0;
          target.v.trapped = turns ? { turns: src.itemKey === 'grip-claw' ? 7 : turns, by: src, move: mv.n } : { turns: 99, by: src, move: mv.n, noDmg: true };
          this.msg(turns ? this.nm(target) + ' zostaje uwięziony przez ' + mv.n + '!' : this.nm(target) + ' nie może uciec!');
          return true;
        }
        case 9:
          if (target.mon.st !== 'slp') { this.msg('Ale nic się nie stało!'); return false; }
          target.v.nightmare = true; this.msg(target.name + ' zaczyna mieć koszmary!'); return true;
        case 12: target.v.torment = true; this.msg(target.name + ' zostaje poddany torturze!'); return true;
        case 13:
          if (!target.lastMove) { this.msg('Ale ruch się nie udaje!'); return false; }
          target.v.disabled = { move: target.lastMove, turns: 4 }; this.msg(Dex.move(target.lastMove).n + ' ' + target.name + ' zostaje zablokowany!'); return true;
        case 14:
          if (target.mon.st || target.v.yawn) { this.msg('Ale ruch się nie udaje!'); return false; }
          target.v.yawn = 2; this.msg(src.name + ' wywołuje senność u ' + target.name + '!'); return true;
        case 15: target.v.healBlock = 5; this.msg(target.name + ' nie może się leczyć!'); return true;
        case 17: target.v.foresighted = true; this.msg(src.name + ' przejrzał ' + target.name + '!'); return true;
        case 18:
          if (target.hasType('grass') || target.v.leechSeed) { this.msg('Nie działa na ' + target.name + '...'); return false; }
          target.v.leechSeed = true; this.msg(this.nm(target) + ' zostaje obsiany!'); return true;
        case 19: target.v.embargo = 5; this.msg(target.name + ' nie może używać przedmiotów!'); return true;
        case 20:
          for (const x of [src, target]) if (x && !x.fainted && !x.v.perish && x.ability() !== 'soundproof') x.v.perish = 4;
          this.msg('Wszyscy, którzy usłyszeli pieśń, zemdleją za trzy tury!'); return true;
        case 21: src.v.ingrain = true; this.msg(src.name + ' zapuszcza korzenie!'); return true;
        case 42: target.v.tarShot = true; this.boost(target, 5, -1, src); this.msg(target.name + ' staje się podatny na ogień!'); return true;
        default:
          if (!secondary) this.msg('Ale nic się nie stało!');
          return false;
      }
    }

    protectMove(bt, kind) {
      const n = bt.v.protectChain || 0;
      if (n > 0 && !U.chance(Math.pow(1 / 3, n))) {
        bt.v.protectChain = 0;
        this.msg('Ale ruch się nie udaje!');
        return;
      }
      bt.v.protect = true;
      bt.v.protectKind = kind;
      bt.v.protectChain = n + 1;
      bt.v.protectedTurn = this.turn;
      this.msg(this.nm(bt) + ' osłania się!');
    }

    // Unique status moves; returns true if handled.
    uniqueStatus(bt, target, mv) {
      const k = mv.k, foe = bt.foe, side = bt.side, foeSide = this.sides[1 - side.id];
      if (BD.SETS.protect.includes(k) || k === 'endure') {
        if (k === 'endure') { bt.v.endure = true; bt.v.protectedTurn = this.turn; this.msg(bt.name + ' przygotowuje się na cios!'); return true; }
        this.protectMove(bt, k); return true;
      }
      if (BD.SETS.weatherMoves[k]) {
        this.setWeather(BD.SETS.weatherMoves[k], 5, bt);
        if (k === 'chilly-reception') this.pivot(bt);
        return true;
      }
      if (BD.SETS.terrainMoves[k]) { if (!this.setTerrain(BD.SETS.terrainMoves[k], 5, bt)) this.msg('Ale nic się nie stało!'); return true; }
      switch (k) {
        case 'splash': this.msg('Ale nic się nie stało!'); return true;
        case 'celebrate': this.msg('Gratulacje, ' + (this.opts.player.name || 'Trenerze') + '!'); return true;
        case 'hold-hands': case 'happy-hour': this.msg('Wszyscy są szczęśliwi!'); return true;
        case 'rest':
          if (bt.hp >= bt.maxHp || ['insomnia', 'vital-spirit'].includes(bt.ability())) { this.msg('Ale ruch się nie udaje!'); return true; }
          bt.mon.st = null;
          this.setStatus(bt, 'slp', bt, true);
          bt.mon.slp = 2;
          this.heal(bt, bt.maxHp, bt.name + ' zasypia i odzyskuje siły!');
          return true;
        case 'haze':
          for (const x of [bt, foe]) if (x) x.stages = [0, 0, 0, 0, 0, 0, 0, 0];
          this.msg('Wszystkie zmiany statystyk zostają usunięte!'); return true;
        case 'trick-room':
          this.field.trickRoom = this.field.trickRoom ? 0 : 5;
          this.msg(this.field.trickRoom ? bt.name + ' zakrzywia wymiary!' : 'Zakrzywione wymiary wracają do normy!'); return true;
        case 'gravity': this.field.gravity = 5; this.msg('Grawitacja wzrasta!'); return true;
        case 'reflect': case 'light-screen': case 'aurora-veil': {
          const key = { reflect: 'reflect', 'light-screen': 'lightScreen', 'aurora-veil': 'auroraVeil' }[k];
          if (k === 'aurora-veil' && this.weather() !== 'snow') { this.msg('Ale ruch się nie udaje!'); return true; }
          if (side.conds[key]) { this.msg('Ale ruch się nie udaje!'); return true; }
          side.conds[key] = bt.itemKey === 'light-clay' ? 8 : 5;
          this.msg({ reflect: 'Reflect zwiększa odporność na ataki fizyczne!', lightScreen: 'Light Screen zwiększa odporność na ataki specjalne!', auroraVeil: 'Aurora Veil zwiększa odporność na ataki!' }[key]);
          return true;
        }
        case 'tailwind': side.conds.tailwind = 4; this.msg('Za drużyną zaczyna wiać tylny wiatr!'); return true;
        case 'safeguard': side.conds.safeguard = 5; this.msg('Drużyna jest otoczona tajemniczą zasłoną!'); return true;
        case 'mist': side.conds.mist = 5; this.msg('Drużyna jest spowita mgłą!'); return true;
        case 'lucky-chant': side.conds.luckyChant = 5; this.msg('Zaklęcie chroni przed trafieniami krytycznymi!'); return true;
        case 'spikes':
          if ((foeSide.conds.spikes || 0) >= 3) { this.msg('Ale ruch się nie udaje!'); return true; }
          foeSide.conds.spikes = (foeSide.conds.spikes || 0) + 1; this.msg('Kolce rozsypują się wokół przeciwnika!'); return true;
        case 'toxic-spikes':
          if ((foeSide.conds.tspikes || 0) >= 2) { this.msg('Ale ruch się nie udaje!'); return true; }
          foeSide.conds.tspikes = (foeSide.conds.tspikes || 0) + 1; this.msg('Trujące kolce rozsypują się wokół przeciwnika!'); return true;
        case 'stealth-rock':
          if (foeSide.conds.rocks) { this.msg('Ale ruch się nie udaje!'); return true; }
          foeSide.conds.rocks = 1; this.msg('Ostre kamienie unoszą się wokół przeciwnika!'); return true;
        case 'sticky-web':
          if (foeSide.conds.web) { this.msg('Ale ruch się nie udaje!'); return true; }
          foeSide.conds.web = 1; this.msg('Lepka sieć rozciąga się pod przeciwnikiem!'); return true;
        case 'defog':
          for (const s of this.sides) for (const c of ['spikes', 'tspikes', 'rocks', 'web']) delete s.conds[c];
          for (const c of ['reflect', 'lightScreen', 'auroraVeil', 'safeguard', 'mist']) delete foeSide.conds[c];
          this.field.terrain = null;
          this.boost(foe, 7, -1, bt);
          this.msg('Mgła i przeszkody zostają rozwiane!'); return true;
        case 'tidy-up':
          for (const s of this.sides) for (const c of ['spikes', 'tspikes', 'rocks', 'web']) delete s.conds[c];
          if (foe) foe.v.sub = 0;
          this.msg('Wszystko zostaje posprzątane!'); this.boost(bt, 1, 1, bt); this.boost(bt, 5, 1, bt); return true;
        case 'substitute': {
          if (bt.v.sub) { this.msg(bt.name + ' ma już zastępcę!'); return true; }
          const cost = Math.floor(bt.maxHp / 4);
          if (bt.hp <= cost) { this.msg('Za mało HP, by stworzyć zastępcę!'); return true; }
          this.damage(bt, cost);
          bt.v.sub = cost;
          this.msg(bt.name + ' tworzy zastępcę!'); this.ev({ t: 'sub', side: side.id, on: true });
          return true;
        }
        case 'shed-tail': {
          const cost = Math.ceil(bt.maxHp / 2);
          if (bt.hp <= cost || this.ableCount(side) < 2) { this.msg('Ale ruch się nie udaje!'); return true; }
          this.damage(bt, cost);
          bt.v.batonPass = true; bt.v.sub = Math.floor(bt.maxHp / 4);
          this.msg(bt.name + ' zrzuca ogon i tworzy zastępcę!');
          this.pivot(bt);
          return true;
        }
        case 'roar': case 'whirlwind':
          if (target.v.ingrain || target.ability() === 'suction-cups' || target.v.dyna) { this.msg('Ale ruch się nie udaje!'); return true; }
          if (this.kind === 'wild') {
            this.msg(this.nm(target) + ' zostaje zdmuchnięty!');
            this.finish(side.isPlayer ? 'run' : 'fled');
            return true;
          }
          this.forceRandomSwitch(target);
          return true;
        case 'teleport':
          if (this.kind === 'wild') { this.msg(this.nm(bt) + ' teleportuje się!'); this.finish(side.isPlayer ? 'run' : 'fled'); return true; }
          if (this.ableCount(side) > 1) { this.pivot(bt); return true; }
          this.msg('Ale ruch się nie udaje!'); return true;
        case 'baton-pass':
          if (this.ableCount(side) < 2) { this.msg('Ale ruch się nie udaje!'); return true; }
          bt.v.batonPass = true; this.pivot(bt); return true;
        case 'parting-shot':
          this.boost(foe, 1, -1, bt); this.boost(foe, 3, -1, bt);
          if (this.ableCount(side) > 1) this.pivot(bt);
          return true;
        case 'belly-drum':
          if (bt.hp <= bt.maxHp / 2 || bt.stages[1] >= 6) { this.msg('Ale ruch się nie udaje!'); return true; }
          this.damage(bt, Math.floor(bt.maxHp / 2));
          bt.stages[1] = 6; this.msg(bt.name + ' poświęca HP i maksymalizuje Atak!'); return true;
        case 'fillet-away':
          if (bt.hp <= bt.maxHp / 2) { this.msg('Ale ruch się nie udaje!'); return true; }
          this.damage(bt, Math.floor(bt.maxHp / 2));
          this.boost(bt, 1, 2, bt); this.boost(bt, 3, 2, bt); this.boost(bt, 5, 2, bt); return true;
        case 'clangorous-soul':
          if (bt.hp <= bt.maxHp / 3) { this.msg('Ale ruch się nie udaje!'); return true; }
          this.damage(bt, Math.floor(bt.maxHp / 3));
          for (let i = 1; i <= 5; i++) this.boost(bt, i, 1, bt); return true;
        case 'no-retreat':
          for (let i = 1; i <= 5; i++) this.boost(bt, i, 1, bt);
          bt.v.trapped = { turns: 99, noDmg: true }; return true;
        case 'curse':
          if (bt.hasType('ghost')) {
            this.damage(bt, Math.floor(bt.maxHp / 2));
            foe.v.curse = true; this.msg(bt.name + ' rzuca klątwę na ' + foe.name + '!'); return true;
          }
          this.boost(bt, 5, -1, bt); this.boost(bt, 1, 1, bt); this.boost(bt, 2, 1, bt); return true;
        case 'pain-split': {
          const avg = Math.floor((bt.hp + foe.hp) / 2);
          bt.mon.hp = Math.min(bt.maxHp, avg); foe.mon.hp = Math.min(foe.maxHp, avg);
          this.hpEv(bt); this.hpEv(foe); this.msg('Walczący dzielą się bólem!'); return true;
        }
        case 'wish': side.wish = { turns: 2, amount: Math.floor(bt.maxHp / 2), from: bt.name }; this.msg(bt.name + ' wypowiada życzenie!'); return true;
        case 'heal-bell': case 'aromatherapy': case 'jungle-healing': case 'lunar-blessing':
          for (const m of side.team) { m.st = null; m.slp = 0; }
          if (k === 'jungle-healing' || k === 'lunar-blessing') this.heal(bt, bt.maxHp / 4, bt.name + ' odzyskuje HP!');
          this.ev({ t: 'status', side: side.id, st: null });
          this.msg('Drużyna zostaje uleczona z dolegliwości!'); return true;
        case 'refresh': case 'take-heart':
          if (bt.mon.st) this.cureStatus(bt); else if (k === 'refresh') this.msg('Ale nic się nie stało!');
          if (k === 'take-heart') { this.boost(bt, 3, 1, bt); this.boost(bt, 4, 1, bt); }
          return true;
        case 'life-dew': this.heal(bt, bt.maxHp / 4, bt.name + ' odzyskuje HP!'); return true;
        case 'sleep-talk': {
          const opts = bt.mon.moves.map(x => x.id).filter(id => { const mm = Dex.move(id); return mm && !['sleep-talk', 'rest', 'assist', 'metronome', 'mirror-move', 'copycat'].includes(mm.k) && !BD.SETS.charge[mm.k]; });
          if (!opts.length) { this.msg('Ale ruch się nie udaje!'); return true; }
          const pick = U.pick(opts);
          this.useCalledMove(bt, pick);
          return true;
        }
        case 'metronome': {
          const all = Object.keys(Dex.data.moves).map(Number).filter(id => { const mm = Dex.move(id); return mm && !mm.z && mm.g <= 9 && !['metronome', 'struggle', 'assist', 'mirror-move', 'copycat', 'sleep-talk', 'transform', 'sketch', 'mimic', 'protect', 'detect', 'endure', 'counter', 'mirror-coat'].includes(mm.k); });
          this.useCalledMove(bt, U.pick(all));
          return true;
        }
        case 'mirror-move': case 'copycat': {
          const last = k === 'mirror-move' ? (foe && foe.lastMove) : this.b_lastMoveUsedPrev;
          if (!last || last === Dex.moveByKey(k)) { this.msg('Ale ruch się nie udaje!'); return true; }
          this.useCalledMove(bt, last);
          return true;
        }
        case 'encore':
          if (!foe.lastMove || foe.v.encore) { this.msg('Ale ruch się nie udaje!'); return true; }
          foe.v.encore = { move: foe.lastMove, turns: 3 }; this.msg(foe.name + ' musi powtarzać ruch!'); return true;
        case 'taunt': foe.v.taunt = 3; this.msg(this.nm(foe) + ' daje się sprowokować!'); return true;
        case 'focus-energy':
          if (bt.v.focusEnergy) { this.msg('Ale ruch się nie udaje!'); return true; }
          bt.v.focusEnergy = true; this.msg(bt.name + ' koncentruje się!'); return true;
        case 'laser-focus': bt.v.laserFocus = 2; this.msg(bt.name + ' wyostrza koncentrację!'); return true;
        case 'lock-on': case 'mind-reader': bt.v.lockOn = true; this.msg(bt.name + ' namierza cel!'); return true;
        case 'foresight': case 'odor-sleuth': case 'miracle-eye': bt.v.foresight = true; this.msg(bt.name + ' przejrzał ' + foe.name + '!'); return true;
        case 'charge': bt.v.charged = true; this.msg(bt.name + ' gromadzi energię!'); this.boost(bt, 4, 1, bt); return true;
        case 'aqua-ring': bt.v.aquaRing = true; this.msg(bt.name + ' otacza się wodnym pierścieniem!'); return true;
        case 'ingrain': bt.v.ingrain = true; this.msg(bt.name + ' zapuszcza korzenie!'); return true;
        case 'destiny-bond': bt.v.destinyBond = true; this.msg(bt.name + ' próbuje zabrać przeciwnika ze sobą!'); return true;
        case 'memento':
          this.boost(foe, 1, -2, bt); this.boost(foe, 3, -2, bt);
          this.damage(bt, bt.hp); return true;
        case 'healing-wish': case 'lunar-dance':
          if (this.ableCount(side) < 2) { this.msg('Ale ruch się nie udaje!'); return true; }
          side.healingWish = true; this.damage(bt, bt.hp); return true;
        case 'transform': {
          if (!foe || foe.v.transform) { this.msg('Ale ruch się nie udaje!'); return true; }
          bt.v.transform = Mon.stats(foe.mon);
          bt.types = foe.types.slice();
          bt.abil = foe.abil;
          bt.stages = foe.stages.slice();
          bt.v.origMoves = bt.mon.moves;
          bt.mon.moves = foe.mon.moves.map(x => ({ id: x.id, pp: 5, up: 0, temp: true }));
          this.msg(bt.name + ' zmienia się w ' + foe.name + '!');
          this.ev({ t: 'transform', side: side.id, pid: foe.mon.pid });
          return true;
        }
        case 'conversion': {
          const t = Dex.move(bt.mon.moves[0].id).t;
          bt.types = [t]; this.msg(bt.name + ' zmienia typ na ' + Dex.typeName(t) + '!'); return true;
        }
        case 'soak': foe.types = [ty('water')]; this.msg(foe.name + ' staje się typu Wodnego!'); return true;
        case 'magic-powder': foe.types = [ty('psychic')]; this.msg(foe.name + ' staje się typu Psychicznego!'); return true;
        case 'forests-curse': if (!foe.hasType('grass')) foe.types = foe.types.concat([ty('grass')]); this.msg(foe.name + ' zyskuje typ Trawiasty!'); return true;
        case 'trick-or-treat': if (!foe.hasType('ghost')) foe.types = foe.types.concat([ty('ghost')]); this.msg(foe.name + ' zyskuje typ Duchowy!'); return true;
        case 'reflect-type': bt.types = foe.types.slice(); this.msg(bt.name + ' przyjmuje typ ' + foe.name + '!'); return true;
        case 'worry-seed': foe.abil = 'insomnia'; this.msg(foe.name + ' zyskuje Bezsenność!'); return true;
        case 'simple-beam': foe.abil = 'simple'; this.msg(foe.name + ' zyskuje zdolność Simple!'); return true;
        case 'gastro-acid': foe.v.noAbility = true; this.msg('Zdolność ' + foe.name + ' zostaje stłumiona!'); return true;
        case 'skill-swap': case 'role-play': { const a = bt.abil; bt.abil = foe.abil; if (k === 'skill-swap') foe.abil = a; this.msg(bt.name + ' wymienia zdolność!'); return true; }
        case 'psych-up': bt.stages = foe.stages.slice(); this.msg(bt.name + ' kopiuje zmiany statystyk!'); return true;
        case 'topsy-turvy': foe.stages = foe.stages.map(x => -x); this.msg('Zmiany statystyk ' + foe.name + ' zostają odwrócone!'); return true;
        case 'spite': {
          const s = foe.lastMove && foe.mon.moves.find(x => x.id === foe.lastMove);
          if (!s) { this.msg('Ale ruch się nie udaje!'); return true; }
          s.pp = Math.max(0, s.pp - 4); this.msg('PP ruchu ' + Dex.move(s.id).n + ' spada!'); return true;
        }
        case 'trick': case 'switcheroo': {
          if (this.kind === 'wild' && !side.isPlayer) { this.msg('Ale ruch się nie udaje!'); return true; }
          const a = bt.mon.item; bt.mon.item = foe.mon.item; foe.mon.item = a;
          this.msg(bt.name + ' zamienia się przedmiotami!'); return true;
        }
        case 'stockpile': bt.v.stockpile = Math.min(3, (bt.v.stockpile || 0) + 1); this.msg(bt.name + ' gromadzi zapasy: ' + bt.v.stockpile + '!'); this.boost(bt, 2, 1, bt); this.boost(bt, 4, 1, bt); return true;
        case 'swallow':
          if (!bt.v.stockpile) { this.msg('Ale ruch się nie udaje!'); return true; }
          this.heal(bt, bt.maxHp * [0, 0.25, 0.5, 1][bt.v.stockpile], bt.name + ' odzyskuje HP!'); bt.v.stockpile = 0; return true;
        case 'revival-blessing': {
          const idx = side.team.findIndex(m => m.hp <= 0 && !m.egg);
          if (idx < 0) { this.msg('Ale ruch się nie udaje!'); return true; }
          side.team[idx].hp = Math.floor(Mon.maxHp(side.team[idx]) / 2);
          this.msg(Mon.name(side.team[idx]) + ' wraca do walki!'); return true;
        }
        case 'perish-song': this.applyAilment(bt, foe, mv, 20, false); return true;
        case 'attract': this.applyAilment(bt, foe, mv, 7, false); return true;
        case 'mean-look': case 'block': case 'spider-web':
          if (foe.v.trapped) { this.msg('Ale ruch się nie udaje!'); return true; }
          foe.v.trapped = { turns: 99, noDmg: true }; this.msg(this.nm(foe) + ' nie może uciec!'); return true;
        case 'nightmare': this.applyAilment(bt, foe, mv, 9, false); return true;
        case 'yawn': this.applyAilment(bt, foe, mv, 14, false); return true;
        case 'leech-seed': this.applyAilment(bt, foe, mv, 18, false); return true;
        case 'heal-pulse': case 'floral-healing': this.heal(target, target.maxHp / 2, target.name + ' odzyskuje HP!'); return true;
        case 'court-change': { const a = side.conds; side.conds = foeSide.conds; foeSide.conds = a; this.msg('Efekty pól zostają zamienione!'); return true; }
        case 'power-split': case 'guard-split': case 'power-swap': case 'guard-swap': case 'heart-swap': case 'speed-swap':
          this.msg(bt.name + ' wymienia się mocą z przeciwnikiem!');
          if (k === 'heart-swap') { const s = bt.stages; bt.stages = foe.stages; foe.stages = s; }
          return true;
        case 'mimic': case 'sketch': {
          if (!foe.lastMove) { this.msg('Ale ruch się nie udaje!'); return true; }
          const s = bt.mon.moves.find(x => x.id === Dex.moveByKey(k));
          if (s) { s.id = foe.lastMove; s.pp = Dex.move(foe.lastMove).pp; if (k === 'mimic') s.temp = true; }
          this.msg(bt.name + ' uczy się ' + Dex.move(foe.lastMove).n + '!'); return true;
        }
      }
      return false;
    }

    useCalledMove(bt, moveId) {
      const mv = Dex.move(moveId);
      this.msg(bt.name + ' używa ' + mv.n + '!');
      const target = SELF_TARGETS.includes(mv.tg) ? bt : bt.foe;
      if (target !== bt && !this.hits(bt, target, mv)) { this.msg(this.nm(bt) + ' pudłuje!'); return; }
      if (mv.c === 0) this.statusMove(bt, target, mv);
      else this.damagingMove(bt, target, mv, {});
    }

    forceRandomSwitch(target) {
      const side = target.side;
      const opts = side.team.map((m, i) => i).filter(i => i !== side.activeIdx && side.team[i].hp > 0 && !side.team[i].egg);
      if (!opts.length) { this.msg('Ale ruch się nie udaje!'); return; }
      const idx = U.pick(opts);
      this.switchOutEffects(target);
      this.msg(target.name + ' zostaje przepędzony!');
      this.sendOut(side, idx);
      this.msg(Mon.name(side.team[idx]) + ' zostaje wciągnięty do walki!');
    }

    // U-turn / Volt Switch / Baton Pass: the user leaves the field.
    pivot(bt) {
      const side = bt.side;
      if (this.ableCount(side) < 2 || bt.fainted) return;
      if (side.isPlayer) {
        this.needSwitch = true;
        this.pendingSwitchReason = 'pivot';
      } else {
        const idx = this.aiChooseReplacement(side, true);
        if (idx >= 0) {
          this.switchOutEffects(bt);
          this.msg(bt.name + ' wraca do ' + side.name + '!');
          this.msg(side.name + ' wysyła ' + Mon.name(side.team[idx]) + '!');
          this.sendOut(side, idx);
        }
      }
    }

    // ------------------------------------------------------------------ damaging moves
    damagingMove(bt, target, mv, x) {
      const k = mv.k;
      x = x || {};
      const moveT = x.z ? this.moveType(bt, mv) : this.moveType(bt, mv);
      let eff = this.typeEffect(bt, target, mv, moveT);
      // Ability immunities
      if (this.abilityAbsorbs(bt, target, mv, moveT)) return;
      if (eff === 0 && !['struggle'].includes(k)) {
        this.msg('Nie działa na ' + this.nm(target) + '...');
        bt.v.rampage = null;
        if (['jump-kick', 'high-jump-kick'].includes(k)) this.damage(bt, bt.maxHp / 2, bt.name + ' upada i rani się!');
        return;
      }
      if (target.ability() === 'wonder-guard' && eff <= 1 && !this.moldBreaks(bt) && mv.c !== 0 && k !== 'struggle') {
        this.msg('Cudowna Osłona chroni ' + target.name + '!'); return;
      }
      // Fixed-damage moves
      const fixed = this.fixedDamage(bt, target, mv);
      if (fixed !== null) {
        if (fixed <= 0) { this.msg('Ale ruch się nie udaje!'); return; }
        this.applyHit(bt, target, mv, Math.floor(fixed), { eff: 1, crit: false, fixed: true });
        this.processFaints();
        this.afterDamage(bt, target, mv, x, Math.floor(fixed));
        return;
      }
      // OHKO
      if (mv.m && mv.m[0] === 9) {
        this.applyHit(bt, target, mv, target.hp, { eff: 1, crit: false, ohko: true });
        if (target.hp <= 0) this.msg('To nokaut jednym ciosem!');
        this.processFaints();
        return;
      }
      // Multi-hit
      let hits = 1;
      if (mv.m && mv.m[3] > 1 && !x.max && !x.z) {
        const lo = mv.m[2], hi = mv.m[3];
        if (lo === hi) hits = lo;
        else if (bt.ability() === 'skill-link') hits = hi;
        else if (bt.itemKey === 'loaded-dice') hits = U.int(Math.max(lo, hi - 1), hi);
        else if (hi === 5) { const r = U.rand(); hits = r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5; }
        else hits = U.int(lo, hi);
        if (k === 'population-bomb' && bt.itemKey !== 'loaded-dice' && bt.ability() !== 'skill-link') hits = 10;
      }
      let total = 0, hitCount = 0;
      for (let i = 0; i < hits; i++) {
        if (target.fainted || bt.fainted) break;
        if (i > 0 && ['triple-kick', 'triple-axel', 'population-bomb'].includes(k) && !this.hits(bt, target, mv) && bt.ability() !== 'skill-link') break;
        const res = this.calcDamage(bt, target, mv, { hitIndex: i, z: x.z, max: x.max, moveType: moveT });
        if (res.crit) this.msg('Trafienie krytyczne!');
        const dealt = this.applyHit(bt, target, mv, res.damage, res);
        total += dealt; hitCount++;
        if (res.crit) this.critCount[bt.mon.uid] = (this.critCount[bt.mon.uid] || 0) + 1;
      }
      eff = this.typeEffect(bt, target, mv, moveT);
      if (eff > 1) this.msg('To jest super skuteczne!');
      else if (eff < 1) this.msg('To nie jest zbyt skuteczne...');
      if (hits > 1) this.msg('Trafiono ' + hitCount + (hitCount === 1 ? ' raz' : ' razy') + '!');
      this.processFaints();
      this.afterDamage(bt, target, mv, x, total);
    }

    typeEffect(bt, target, mv, moveT) {
      if (mv.k === 'struggle') return 1;
      let eff = Dex.eff(moveT, target.types);
      const k = mv.k;
      if (k === 'freeze-dry' && target.hasType('water')) eff = eff / Dex.eff(moveT, [ty('water')]) * 2;
      if (k === 'flying-press') eff *= Dex.eff(ty('flying'), target.types);
      if (k === 'thousand-arrows' && target.hasType('flying') && eff === 0) eff = 1;
      if (eff === 0 && (bt.ability() === 'scrappy' || bt.v.foresight) && target.hasType('ghost') && [ty('normal'), ty('fighting')].includes(moveT)) {
        eff = Dex.eff(moveT, target.types.filter(t => t !== ty('ghost')));
      }
      if (moveT === ty('ground') && !target.isGrounded() && k !== 'thousand-arrows') eff = 0;
      if (moveT === ty('ground') && target.isGrounded() && target.hasType('flying') && eff === 0) eff = Dex.eff(moveT, target.types.filter(t => t !== ty('flying')));
      if (target.v.tarShot && moveT === ty('fire')) eff *= 2;
      if (this.weather() === 'strong-winds' && target.hasType('flying') && Dex.eff(moveT, [ty('flying')]) > 1) eff /= 2;
      return eff;
    }

    moldBreaks(bt) { return ['mold-breaker', 'teravolt', 'turboblaze'].includes(bt.ability()); }

    abilityAbsorbs(bt, target, mv, moveT) {
      if (this.moldBreaks(bt)) return false;
      const a = target.ability();
      const t = Dex.typeKey(moveT);
      const absorb = (heal, txt) => {
        if (heal) { if (target.hp < target.maxHp) this.heal(target, target.maxHp / 4, txt || target.name + ' odzyskuje HP!'); else this.msg('Nie działa na ' + target.name + '...'); }
        return true;
      };
      if (t === 'water' && (a === 'water-absorb' || a === 'dry-skin')) return absorb(true);
      if (t === 'water' && a === 'storm-drain') { this.boost(target, 3, 1, target); return true; }
      if (t === 'electric' && a === 'volt-absorb') return absorb(true);
      if (t === 'electric' && a === 'lightning-rod') { this.boost(target, 3, 1, target); return true; }
      if (t === 'electric' && a === 'motor-drive') { this.boost(target, 5, 1, target); return true; }
      if (t === 'grass' && a === 'sap-sipper') { this.boost(target, 1, 1, target); return true; }
      if (t === 'fire' && a === 'flash-fire') { target.v.flashFire = true; this.msg('Moc ognia ' + target.name + ' rośnie!'); return true; }
      if (t === 'fire' && a === 'well-baked-body') { this.boost(target, 2, 2, target); return true; }
      if (t === 'ground' && a === 'earth-eater') return absorb(true);
      if (t === 'ground' && a === 'levitate' && !this.field.gravity && target.isGrounded() === false) { this.msg(target.name + ' lewituje!'); return true; }
      if ((mv.fl || []).includes('sound') && a === 'soundproof') { this.msg('Nie działa na ' + target.name + '...'); return true; }
      if ((mv.fl || []).includes('ballistics') && a === 'bulletproof') { this.msg('Nie działa na ' + target.name + '...'); return true; }
      if (a === 'good-as-gold' && mv.c === 0) { this.msg('Nie działa na ' + target.name + '...'); return true; }
      return false;
    }

    fixedDamage(bt, target, mv) {
      const k = mv.k;
      switch (k) {
        case 'seismic-toss': case 'night-shade': return bt.mon.lvl;
        case 'dragon-rage': return 40;
        case 'sonic-boom': return 20;
        case 'super-fang': case 'natures-madness': case 'ruination': return Math.max(1, Math.floor(target.hp / 2));
        case 'endeavor': return target.hp > bt.hp ? target.hp - bt.hp : 0;
        case 'psywave': return Math.max(1, Math.floor(bt.mon.lvl * U.int(50, 150) / 100));
        case 'final-gambit': { const d = bt.hp; this.damage(bt, bt.hp); return d; }
        case 'counter': return bt.v.lastHit && bt.v.lastHit.cls === 1 && bt.v.lastHit.turn === this.turn ? bt.v.lastHit.dmg * 2 : 0;
        case 'mirror-coat': return bt.v.lastHit && bt.v.lastHit.cls === 2 && bt.v.lastHit.turn === this.turn ? bt.v.lastHit.dmg * 2 : 0;
        case 'metal-burst': case 'comeuppance': return bt.v.lastHit && bt.v.lastHit.turn === this.turn ? Math.floor(bt.v.lastHit.dmg * 1.5) : 0;
        case 'guardian-of-alola': return Math.max(1, Math.floor(target.hp * 3 / 4));
      }
      return null;
    }

    basePower(bt, target, mv, o) {
      const k = mv.k;
      let p = mv.p || 0;
      if (o && o.preview && ['magnitude', 'present', 'fury-cutter', 'rollout', 'ice-ball', 'echoed-voice'].includes(k)) {
        return k === 'magnitude' ? 70 : k === 'present' ? 60 : k === 'echoed-voice' ? 40 : 30;
      }
      const w = this.weather();
      const ratio = (a, b) => a / Math.max(1, b);
      switch (k) {
        case 'low-kick': case 'grass-knot': {
          const wt = target.weight;
          p = wt >= 200 ? 120 : wt >= 100 ? 100 : wt >= 50 ? 80 : wt >= 25 ? 60 : wt >= 10 ? 40 : 20; break;
        }
        case 'heavy-slam': case 'heat-crash': {
          const r = ratio(bt.weight, target.weight);
          p = r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40; break;
        }
        case 'gyro-ball': p = Math.min(150, Math.floor(25 * this.speed(target) / Math.max(1, this.speed(bt))) + 1); break;
        case 'electro-ball': { const r = ratio(this.speed(bt), this.speed(target)); p = r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40; break; }
        case 'flail': case 'reversal': {
          const x = Math.floor(48 * bt.hp / bt.maxHp);
          p = x <= 1 ? 200 : x <= 4 ? 150 : x <= 9 ? 100 : x <= 16 ? 80 : x <= 32 ? 40 : 20; break;
        }
        case 'eruption': case 'water-spout': case 'dragon-energy': p = Math.max(1, Math.floor(150 * bt.hp / bt.maxHp)); break;
        case 'crush-grip': case 'wring-out': p = Math.max(1, Math.floor(120 * target.hp / target.maxHp)); break;
        case 'hard-press': p = Math.max(1, Math.floor(100 * target.hp / target.maxHp)); break;
        case 'return': p = Math.max(1, Math.floor(bt.mon.fr / 2.5)); break;
        case 'frustration': p = Math.max(1, Math.floor((255 - bt.mon.fr) / 2.5)); break;
        case 'facade': if (bt.mon.st) p *= 2; break;
        case 'hex': case 'infernal-parade': if (target.mon.st || target.ability() === 'comatose') p *= 2; break;
        case 'venoshock': case 'barb-barrage': if (target.mon.st === 'psn' || target.mon.st === 'tox') p *= 2; break;
        case 'brine': if (target.hp <= target.maxHp / 2) p *= 2; break;
        case 'acrobatics': if (!bt.item) p *= 2; break;
        case 'knock-off': if (target.item && !target.itemKey.endsWith('ite')) p = Math.floor(p * 1.5); break;
        case 'weather-ball': if (w && w !== 'fog') p *= 2; break;
        case 'terrain-pulse': if (this.field.terrain && bt.isGrounded()) p *= 2; break;
        case 'stored-power': case 'power-trip': p = 20 + 20 * bt.stages.slice(1).reduce((a, b) => a + Math.max(0, b), 0); break;
        case 'punishment': p = Math.min(200, 60 + 20 * target.stages.slice(1).reduce((a, b) => a + Math.max(0, b), 0)); break;
        case 'avalanche': case 'revenge': if (bt.damagedThisTurn) p *= 2; break;
        case 'payback': if (target.movedThisTurn) p *= 2; break;
        case 'assurance': if (target.damagedThisTurn) p *= 2; break;
        case 'bolt-beak': case 'fishious-rend': if (!target.movedThisTurn) p *= 2; break;
        case 'retaliate': if (bt.side.lastFaintTurn === this.turn - 1) p *= 2; break;
        case 'magnitude': { const r = U.int(1, 100); const t = [[5, 10, 4], [15, 30, 5], [35, 50, 6], [65, 70, 7], [85, 90, 8], [95, 110, 9], [100, 150, 10]].find(z => r <= z[0]); p = t[1]; this.msg('Magnitude ' + t[2] + '!'); break; }
        case 'present': { const r = U.rand(); p = r < 0.4 ? 40 : r < 0.7 ? 80 : r < 0.8 ? 120 : 0; if (!p) { this.heal(target, target.maxHp / 4, target.name + ' odzyskuje HP!'); } break; }
        case 'fury-cutter': bt.v.furyCutter = Math.min(3, (bt.v.furyCutter || 0) + 1); p = 40 * Math.pow(2, bt.v.furyCutter - 1); break;
        case 'rollout': case 'ice-ball': {
          if (!bt.v.rollout) bt.v.rollout = { move: mv.id || Dex.moveByKey(k), n: 0 };
          p = 30 * Math.pow(2, bt.v.rollout.n) * (bt.v.defenseCurl ? 2 : 1);
          bt.v.rollout.n++; if (bt.v.rollout.n >= 5) bt.v.rollout = null; break;
        }
        case 'echoed-voice': bt.v.echo = Math.min(5, (bt.v.echo || 0) + 1); p = 40 * bt.v.echo; break;
        case 'triple-kick': p = 10 * ((o.hitIndex || 0) + 1); break;
        case 'triple-axel': p = 20 * ((o.hitIndex || 0) + 1); break;
        case 'rising-voltage': if (this.field.terrain === 'electric' && target.isGrounded()) p *= 2; break;
        case 'expanding-force': if (this.field.terrain === 'psychic' && bt.isGrounded()) p = Math.floor(p * 1.5); break;
        case 'misty-explosion': if (this.field.terrain === 'misty' && bt.isGrounded()) p = Math.floor(p * 1.5); break;
        case 'psyblade': if (this.field.terrain === 'electric') p = Math.floor(p * 1.5); break;
        case 'grav-apple': if (this.field.gravity) p = Math.floor(p * 1.5); break;
        case 'lash-out': if (bt.v.statDropped) p *= 2; break;
        case 'rage-fist': p = Math.min(350, 50 + 50 * (bt.mon.timesHit || 0)); break;
        case 'last-respects': p = Math.min(5050, 50 + 50 * bt.side.faintedCount); break;
        case 'solar-beam': case 'solar-blade': if (w && w !== 'sun') p = Math.floor(p / 2); break;
        case 'fling': p = bt.item ? (bt.item.fp || 30) : 0; break;
        case 'spit-up': p = 100 * (bt.v.stockpile || 0); break;
        case 'beat-up': p = 5 + Math.floor(Dex.mon(bt.mon.pid).b[1] / 10); break;
        case 'trump-card': { const s = bt.mon.moves.find(z => z.id === mv.id); const pp = s ? s.pp : 4; p = pp >= 4 ? 40 : pp === 3 ? 50 : pp === 2 ? 60 : pp === 1 ? 80 : 200; break; }
        case 'tera-blast': if (bt.v.tera === ty('stellar')) p = 100; break;
        case 'pursuit': break;
        case 'collision-course': case 'electro-drift': break;
      }
      return p;
    }

    calcDamage(bt, target, mv, o) {
      o = o || {};
      const k = mv.k;
      const moveT = o.moveType !== undefined ? o.moveType : this.moveType(bt, mv);
      const tKey = Dex.typeKey(moveT);
      let power = this.basePower(bt, target, mv, o);
      if (o.z) power = o.z.power;
      if (o.max) power = o.max.power;
      if (!power) return { damage: 0, crit: false, eff: 1 };
      let cls = mv.c;
      if (k === 'tera-blast' && bt.v.tera !== undefined && this.effStat(bt, 1, false) > this.effStat(bt, 3, false)) cls = 1;
      if (k === 'photon-geyser' && this.effStat(bt, 1, false) > this.effStat(bt, 3, false)) cls = 1;
      if (k === 'shell-side-arm') {
        const phys = this.effStat(bt, 1, false) / this.effStat(target, 2, false), spec = this.effStat(bt, 3, false) / this.effStat(target, 4, false);
        if (phys > spec) cls = 1;
      }
      // Critical hit
      let crit = false;
      const tA = target.ability();
      if (!['battle-armor', 'shell-armor'].includes(tA) && !target.side.conds.luckyChant) {
        let stage = (mv.m ? mv.m[8] : 0);
        if (bt.v.focusEnergy) stage += 2;
        if (['scope-lens', 'razor-claw'].includes(bt.itemKey)) stage += 1;
        if (bt.ability() === 'super-luck') stage += 1;
        if ((bt.itemKey === 'leek' || bt.itemKey === 'stick') && ['farfetchd', 'sirfetchd', 'farfetchd-galar'].includes(bt.data.k)) stage += 2;
        if (bt.itemKey === 'lucky-punch' && bt.data.k === 'chansey') stage += 2;
        if (BD.SETS.alwaysCrit.includes(k) || bt.v.laserFocus || stage >= 3) crit = true;
        else crit = U.rand() < [1 / 24, 1 / 8, 1 / 2][stage];
        if (bt.ability() === 'merciless' && (target.mon.st === 'psn' || target.mon.st === 'tox')) crit = true;
      }
      // Attack / defense stats
      const atkStat = k === 'body-press' ? 2 : cls === 1 ? 1 : 3;
      let defStat = cls === 1 ? 2 : 4;
      if (['psyshock', 'psystrike', 'secret-sword'].includes(k)) defStat = 2;
      const attacker = k === 'foul-play' ? target : bt;
      let A = this.effStat(attacker, atkStat, crit, target, true);
      let Dd = this.effStat(target, defStat, crit, bt, false);
      if (k === 'foul-play') A = this.effStat(target, 1, crit, target, true);
      // Ability / item stat modifiers
      const a = bt.ability();
      if (atkStat === 1 || k === 'foul-play') {
        if (['huge-power', 'pure-power'].includes(a) && k !== 'foul-play') A *= 2;
        if (a === 'hustle') A *= 1.5;
        if (a === 'guts' && bt.mon.st) A *= 1.5;
        if (a === 'gorilla-tactics') A *= 1.5;
        if (bt.itemKey === 'choice-band') A *= 1.5;
        if (bt.itemKey === 'thick-club' && ['cubone', 'marowak', 'marowak-alola'].includes(bt.data.k)) A *= 2;
        if (a === 'slow-start' && bt.v.slowStart) A *= 0.5;
        if (a === 'toxic-boost' && (bt.mon.st === 'psn' || bt.mon.st === 'tox')) A *= 1.5;
      }
      if (atkStat === 3) {
        if (bt.itemKey === 'choice-specs') A *= 1.5;
        if (a === 'solar-power' && this.weather() === 'sun') A *= 1.5;
        if (bt.itemKey === 'deep-sea-tooth' && bt.data.k === 'clamperl') A *= 2;
        if (a === 'flare-boost' && bt.mon.st === 'brn') A *= 1.5;
      }
      if (bt.itemKey === 'light-ball' && bt.data.k.startsWith('pikachu')) A *= 2;
      if (a === 'defeatist' && bt.hpFrac() <= 0.5) A *= 0.5;
      const ruin = (key) => [bt, target].some(x => x.ability() === key);
      if (atkStat === 1 && [bt, target].some(x => x !== bt && x.ability() === 'tablets-of-ruin')) A *= 0.75;
      if (atkStat === 3 && [bt, target].some(x => x !== bt && x.ability() === 'vessel-of-ruin')) A *= 0.75;
      if (defStat === 2 && bt.ability() === 'sword-of-ruin') Dd *= 0.75;
      if (defStat === 4 && bt.ability() === 'beads-of-ruin') Dd *= 0.75;
      void ruin;
      if (defStat === 2) {
        if (tA === 'marvel-scale' && target.mon.st && !this.moldBreaks(bt)) Dd *= 1.5;
        if (tA === 'fur-coat' && !this.moldBreaks(bt)) Dd *= 2;
        if (this.weather() === 'snow' && target.hasType('ice')) Dd *= 1.5;
      } else {
        if (target.itemKey === 'assault-vest') Dd *= 1.5;
        if (this.weather() === 'sand' && target.hasType('rock')) Dd *= 1.5;
        if (target.itemKey === 'deep-sea-scale' && target.data.k === 'clamperl') Dd *= 2;
      }
      if (target.itemKey === 'eviolite' && target.isNFE()) Dd *= 1.5;
      if (target.itemKey === 'metal-powder' && target.data.k === 'ditto') Dd *= 2;
      // Base power modifiers
      let bp = power;
      if (a === 'technician' && bp <= 60) bp *= 1.5;
      if (mv.c !== 0 && ((mv.t === ty('normal') && ['pixilate', 'aerilate', 'refrigerate', 'galvanize'].includes(a)) || a === 'normalize')) bp *= 1.2;
      if (a === 'iron-fist' && (mv.fl || []).includes('punch')) bp *= 1.2;
      if (a === 'strong-jaw' && (mv.fl || []).includes('bite')) bp *= 1.5;
      if (a === 'mega-launcher' && (mv.fl || []).includes('pulse')) bp *= 1.5;
      if (a === 'tough-claws' && (mv.fl || []).includes(CONTACT)) bp *= 1.3;
      if (a === 'sharpness' && /slash|cut|blade|sword|razor|leaf-blade|sacred-sword|aqua-cutter|kowtow|psycho-cut|night-slash|x-scissor|fury-cutter|air-cutter|ceaseless|bitter-blade|population/.test(k)) bp *= 1.5;
      if (a === 'reckless' && mv.m && mv.m[6] < 0) bp *= 1.2;
      if (a === 'sheer-force' && this.hasSecondary(mv)) bp *= 1.3;
      if (a === 'sand-force' && this.weather() === 'sand' && ['rock', 'ground', 'steel'].includes(tKey)) bp *= 1.3;
      if (a === 'analytic' && target.movedThisTurn) bp *= 1.3;
      if (a === 'punk-rock' && (mv.fl || []).includes('sound')) bp *= 1.3;
      if (a === 'steelworker' && tKey === 'steel') bp *= 1.5;
      if (a === 'transistor' && tKey === 'electric') bp *= 1.3;
      if (a === 'dragons-maw' && tKey === 'dragon') bp *= 1.5;
      if (a === 'rocky-payload' && tKey === 'rock') bp *= 1.5;
      if (a === 'water-bubble' && tKey === 'water') bp *= 2;
      if (a === 'supreme-overlord') bp *= 1 + 0.1 * Math.min(5, bt.side.faintedCount);
      if (['overgrow', 'blaze', 'torrent', 'swarm'].includes(a) && bt.hpFrac() <= 1 / 3) {
        if ((a === 'overgrow' && tKey === 'grass') || (a === 'blaze' && tKey === 'fire') || (a === 'torrent' && tKey === 'water') || (a === 'swarm' && tKey === 'bug')) bp *= 1.5;
      }
      if (bt.v.flashFire && tKey === 'fire') bp *= 1.5;
      if (bt.v.charged && tKey === 'electric') { bp *= 2; if (!o.preview) bt.v.charged = false; }
      if (BD.TYPE_ITEMS[bt.itemKey] === tKey) bp *= 1.2;
      if (bt.itemKey === 'muscle-band' && cls === 1) bp *= 1.1;
      if (bt.itemKey === 'wise-glasses' && cls === 2) bp *= 1.1;
      if (bt.itemKey === 'punching-glove' && (mv.fl || []).includes('punch')) bp *= 1.1;
      if (bt.itemKey === 'adamant-orb' && bt.data.k.startsWith('dialga') && ['dragon', 'steel'].includes(tKey)) bp *= 1.2;
      if (bt.itemKey === 'lustrous-orb' && bt.data.k.startsWith('palkia') && ['dragon', 'water'].includes(tKey)) bp *= 1.2;
      if (bt.itemKey === 'griseous-orb' && bt.data.k.startsWith('giratina') && ['dragon', 'ghost'].includes(tKey)) bp *= 1.2;
      if (bt.itemKey === 'soul-dew' && ['latias', 'latios'].includes(bt.data.k) && ['dragon', 'psychic'].includes(tKey)) bp *= 1.2;
      const ter = this.field.terrain;
      if (ter && bt.isGrounded()) {
        if ((ter === 'electric' && tKey === 'electric') || (ter === 'grassy' && tKey === 'grass') || (ter === 'psychic' && tKey === 'psychic')) bp *= 1.3;
      }
      if (ter === 'misty' && tKey === 'dragon' && target.isGrounded()) bp *= 0.5;
      if (ter === 'grassy' && ['earthquake', 'bulldoze', 'magnitude'].includes(k) && target.isGrounded()) bp *= 0.5;
      if (k === 'knock-off') { /* handled in basePower */ }
      if (tA === 'heatproof' && tKey === 'fire' && !this.moldBreaks(bt)) bp *= 0.5;
      if (tA === 'dry-skin' && tKey === 'fire' && !this.moldBreaks(bt)) bp *= 1.25;
      if (target.v.dyna && ['low-kick', 'grass-knot', 'heavy-slam', 'heat-crash'].includes(k)) bp = 0;
      bp = Math.max(1, Math.floor(bp));
      // Base damage
      const L = bt.mon.lvl;
      let dmg = Math.floor(Math.floor(Math.floor(2 * L / 5 + 2) * bp * A / Math.max(1, Dd)) / 50) + 2;
      // Weather
      const w = this.weather();
      if (w === 'rain') { if (tKey === 'water') dmg *= 1.5; if (tKey === 'fire') dmg *= 0.5; }
      if (w === 'sun') { if (tKey === 'fire') dmg *= 1.5; if (tKey === 'water' && k !== 'hydro-steam') dmg *= 0.5; if (k === 'hydro-steam') dmg *= 1.5; }
      if (crit) dmg *= (a === 'sniper' ? 2.25 : 1.5);
      // Random 85-100%
      if (!o.noRandom) dmg = Math.floor(dmg * U.int(85, 100) / 100);
      else if (o.avgRandom) dmg = Math.floor(dmg * 0.925);
      // STAB
      let stab = 1;
      const orig = Dex.mon(bt.basePid).t;
      const hasStab = bt.types.includes(moveT) || (bt.v.tera !== undefined && orig.includes(moveT));
      if (bt.v.tera !== undefined && bt.v.tera === moveT) stab = orig.includes(moveT) ? 2 : 1.5;
      else if (hasStab) stab = 1.5;
      if (a === 'adaptability' && stab > 1) stab = stab === 2 ? 2.25 : 2;
      if (k === 'struggle') stab = 1;
      dmg *= stab;
      // Type effectiveness
      const eff = this.typeEffect(bt, target, mv, moveT);
      dmg *= eff;
      if (eff > 1 && ['collision-course', 'electro-drift'].includes(k)) dmg *= 5461 / 4096;
      // Burn
      if (bt.mon.st === 'brn' && cls === 1 && a !== 'guts' && k !== 'facade') dmg *= 0.5;
      // Screens
      if (!crit && a !== 'infiltrator') {
        const c = target.side.conds;
        if ((cls === 1 && (c.reflect || c.auroraVeil)) || (cls === 2 && (c.lightScreen || c.auroraVeil))) dmg *= 0.5;
      }
      // Defensive abilities
      if (!this.moldBreaks(bt)) {
        if (['multiscale', 'shadow-shield'].includes(tA) && target.hp >= target.maxHp) dmg *= 0.5;
        if (['filter', 'solid-rock', 'prism-armor'].includes(tA) && eff > 1) dmg *= 0.75;
        if (tA === 'thick-fat' && ['fire', 'ice'].includes(tKey)) dmg *= 0.5;
        if (tA === 'ice-scales' && cls === 2) dmg *= 0.5;
        if (tA === 'fluffy') { if ((mv.fl || []).includes(CONTACT)) dmg *= 0.5; if (tKey === 'fire') dmg *= 2; }
        if (tA === 'punk-rock' && (mv.fl || []).includes('sound')) dmg *= 0.5;
        if (tA === 'purifying-salt' && tKey === 'ghost') dmg *= 0.5;
        if (tA === 'water-bubble' && tKey === 'fire') dmg *= 0.5;
      }
      if (a === 'tinted-lens' && eff < 1) dmg *= 2;
      if (bt.itemKey === 'expert-belt' && eff > 1) dmg *= 1.2;
      if (bt.itemKey === 'life-orb') dmg *= 1.3;
      if (target.v.minimized && ['stomp', 'body-slam', 'dragon-rush', 'heat-crash', 'heavy-slam', 'steamroller'].includes(k)) dmg *= 2;
      if (target.v.invuln === 'dig' && ['earthquake', 'magnitude'].includes(k)) dmg *= 2;
      if (target.v.invuln === 'dive' && ['surf', 'whirlpool'].includes(k)) dmg *= 2;
      if (target.v.invuln === 'fly' && ['gust', 'twister'].includes(k)) dmg *= 2;
      if (target.v.glaiveRush) dmg *= 2;
      if (target.v.dyna && ['behemoth-blade', 'behemoth-bash', 'dynamax-cannon'].includes(k)) dmg *= 2;
      if (o.z && target.v.protect) dmg *= 0.25;
      // Resist berries
      const berry = target.itemKey;
      if (!o.noBerry && BD.RESIST_BERRIES[berry] === tKey && (eff > 1 || tKey === 'normal')) {
        dmg *= 0.5;
        if (!o.preview) { this.msg(target.name + ' zjada jagodę, która osłabia cios!'); this.consumeItem(target); }
      }
      dmg = Math.max(1, Math.floor(dmg));
      return { damage: dmg, crit, eff, cls };
    }

    effStat(bt, idx, crit, other, attacking) {
      let st = bt.rawStat(idx);
      let stage = bt.stages[idx];
      if (other && other.ability() === 'unaware' && !this.moldBreaks(bt)) stage = 0;
      if (crit) stage = attacking ? Math.max(0, stage) : Math.min(0, stage);
      return st * stageMult(stage);
    }

    hasSecondary(mv) {
      const m = mv.m;
      if (!m) return false;
      return (m[9] > 0 && m[0] !== 1) || m[10] > 0 || (m[11] > 0 && m[0] === 6) || ['tri-attack', 'secret-power', 'dire-claw'].includes(mv.k);
    }

    // Applies one hit; returns damage dealt.
    applyHit(bt, target, mv, dmg, res) {
      if (dmg <= 0) return 0;
      if ((this.opts.cheats || {}).ohko && bt.side.id === 0 && target.side.id === 1) dmg = Math.max(dmg, target.mon.hp + (target.v.sub || 0));
      this.ev({ t: 'anim', side: target.side.id, kind: 'hit', eff: res.eff });
      // Substitute
      if (target.v.sub && !(mv.fl || []).includes('sound') && bt.ability() !== 'infiltrator') {
        const d = Math.min(target.v.sub, dmg);
        target.v.sub -= d;
        this.msg('Zastępca przyjmuje cios za ' + target.name + '!');
        if (target.v.sub <= 0) { target.v.sub = 0; this.msg('Zastępca ' + target.name + ' znika!'); this.ev({ t: 'sub', side: target.side.id, on: false }); }
        return d;
      }
      // Disguise
      if (target.ability() === 'disguise' && !target.v.disguiseBroken && !this.moldBreaks(bt)) {
        target.v.disguiseBroken = true;
        this.msg('Przebranie ' + target.name + ' przyjmuje cios!');
        this.damage(target, Math.floor(target.maxHp / 8), target.name + ' traci przebranie!');
        return 0;
      }
      // False Swipe
      if (['false-swipe', 'hold-back'].includes(mv.k) && dmg >= target.hp) dmg = target.hp - 1;
      // Survive with Sturdy / Focus Sash / Focus Band / Endure
      if (dmg >= target.hp) {
        const full = target.hp >= target.maxHp;
        if (target.v.endure && target.v.protectedTurn === this.turn) { dmg = target.hp - 1; this.msg(target.name + ' wytrzymuje cios!'); }
        else if (full && target.ability() === 'sturdy' && !this.moldBreaks(bt)) { dmg = target.hp - 1; this.msg(target.name + ' wytrzymuje cios dzięki Sturdy!'); }
        else if (full && target.itemKey === 'focus-sash') { dmg = target.hp - 1; this.consumeItem(target); this.msg(target.name + ' wytrzymuje cios dzięki Focus Sash!'); }
        else if (target.itemKey === 'focus-band' && U.chance(0.1)) { dmg = target.hp - 1; this.msg(target.name + ' wytrzymuje cios dzięki Focus Band!'); }
      }
      if (dmg <= 0) return 0;
      target.v.lastAttacker = bt;
      const dealt = this.damage(target, dmg, null, true);
      target.damagedThisTurn = true;
      target.v.lastHit = { dmg: dealt, cls: res.cls !== undefined ? res.cls : mv.c, turn: this.turn };
      target.mon.dmgTaken = (target.mon.dmgTaken || 0) + dealt;
      target.mon.timesHit = (target.mon.timesHit || 0) + 1;
      if (!target.fainted) {
        // Reactive abilities
        const ta = target.ability();
        if (ta === 'stamina') this.boost(target, 2, 1, target);
        if (ta === 'weak-armor' && (res.cls || mv.c) === 1) { this.boost(target, 2, -1, target); this.boost(target, 5, 2, target); }
        if (ta === 'justified' && Dex.typeKey(this.moveType(bt, mv)) === 'dark') this.boost(target, 1, 1, target);
        if (ta === 'rattled' && ['dark', 'bug', 'ghost'].includes(Dex.typeKey(this.moveType(bt, mv)))) this.boost(target, 5, 1, target);
        if (ta === 'anger-point' && res.crit) { target.stages[1] = 6; this.msg('Gniew ' + target.name + ' maksymalizuje Atak!'); }
        if (ta === 'water-compaction' && Dex.typeKey(this.moveType(bt, mv)) === 'water') this.boost(target, 2, 2, target);
        if (ta === 'cotton-down') this.boost(bt, 5, -1, target);
        if (target.itemKey === 'weakness-policy' && res.eff > 1) { this.consumeItem(target); this.boost(target, 1, 2, target); this.boost(target, 3, 2, target); }
        if (target.v.rage) this.boost(target, 1, 1, target);
      }
      // Contact effects
      if ((mv.fl || []).includes(CONTACT) && bt.itemKey !== 'protective-pads' && bt.ability() !== 'long-reach' && !bt.fainted) {
        const ta = target.ability();
        if ((ta === 'rough-skin' || ta === 'iron-barbs') && bt.ability() !== 'magic-guard') this.damage(bt, bt.maxHp / 8, bt.name + ' rani się o ' + (ta === 'rough-skin' ? 'szorstką skórę' : 'żelazne kolce') + '!');
        if (target.itemKey === 'rocky-helmet' && bt.ability() !== 'magic-guard') this.damage(bt, bt.maxHp / 6, bt.name + ' rani się o Rocky Helmet!');
        if (!bt.fainted && U.chance(0.3)) {
          if (ta === 'static') this.setStatus(bt, 'par', target, true);
          else if (ta === 'flame-body') this.setStatus(bt, 'brn', target, true);
          else if (ta === 'poison-point') this.setStatus(bt, 'psn', target, true);
          else if (ta === 'effect-spore' && !bt.hasType('grass') && bt.ability() !== 'overcoat') this.setStatus(bt, U.pick(['psn', 'par', 'slp']), target, true);
          else if (ta === 'cute-charm') this.applyAilment(target, bt, { k: 'attract' }, 7, true);
        }
        if (bt.ability() === 'poison-touch' && U.chance(0.3)) this.setStatus(target, 'psn', bt, true);
        if (ta === 'mummy' || ta === 'lingering-aroma') { bt.abil = ta; }
      }
      return dealt;
    }

    afterDamage(bt, target, mv, x, total) {
      const k = mv.k, m = mv.m || [];
      const a = bt.ability();
      // Drain / recoil
      if (m[6] > 0 && total > 0) {
        let amt = Math.max(1, Math.floor(total * m[6] / 100));
        if (bt.itemKey === 'big-root') amt = Math.floor(amt * 1.3);
        if (target.ability() === 'liquid-ooze') this.damage(bt, amt, bt.name + ' wchłania szlam!');
        else this.heal(bt, amt, target.name + ' traci energię!');
      } else if (m[6] < 0 && total > 0 && a !== 'rock-head' && a !== 'magic-guard' && !x.max && !x.z) {
        const rec = Math.max(1, Math.floor(total * -m[6] / 100));
        bt.mon.recoilTaken = (bt.mon.recoilTaken || 0) + rec;
        this.damage(bt, rec, bt.name + ' otrzymuje obrażenia odrzutu!');
      }
      if (k === 'struggle') this.damage(bt, Math.max(1, Math.floor(bt.maxHp / 4)), bt.name + ' otrzymuje obrażenia odrzutu!');
      if (['mind-blown', 'steel-beam'].includes(k) && a !== 'magic-guard') this.damage(bt, Math.ceil(bt.maxHp / 2), bt.name + ' rani się!');
      if (BD.SETS.selfKO.includes(k) && ['explosion', 'self-destruct', 'misty-explosion'].includes(k)) this.damage(bt, bt.hp);
      // Life Orb
      if (bt.itemKey === 'life-orb' && total > 0 && a !== 'magic-guard' && !bt.fainted && !(a === 'sheer-force' && this.hasSecondary(mv))) {
        this.damage(bt, Math.max(1, Math.floor(bt.maxHp / 10)), bt.name + ' traci HP przez Life Orb!');
      }
      if (bt.itemKey === 'shell-bell' && total > 0 && !bt.fainted) this.heal(bt, total / 8, bt.name + ' odzyskuje HP dzięki Shell Bell!');
      // Moxie / Beast Boost
      if (target.fainted && !bt.fainted) {
        if (a === 'moxie' || a === 'chilling-neigh') this.boost(bt, 1, 1, bt);
        if (a === 'grim-neigh') this.boost(bt, 3, 1, bt);
        if (a === 'beast-boost') {
          let best = 1; for (let i = 2; i <= 5; i++) if (bt.rawStat(i) > bt.rawStat(best)) best = i;
          this.boost(bt, best, 1, bt);
        }
      }
      // Max Move side effects
      if (x.max && !bt.fainted) {
        const eff = x.max.effect;
        if (eff[0] === 'self') this.boost(bt, eff[1], eff[2], bt);
        else if (eff[0] === 'foe' && !target.fainted) this.boost(target, eff[1], eff[2], bt);
        else if (eff[0] === 'weather') this.setWeather(eff[1], 5, bt);
        else if (eff[0] === 'terrain') this.setTerrain(eff[1], 5, bt);
        return;
      }
      if (x.z) return;
      // Secondary effects
      const sheer = a === 'sheer-force' && this.hasSecondary(mv);
      const shield = target.ability() === 'shield-dust' || target.itemKey === 'covert-cloak';
      const serene = a === 'serene-grace' ? 2 : 1;
      if (!sheer && !target.fainted && total > 0 && !target.v.sub) {
        if (!shield) {
          if (m[1] > 0 && m[9] > 0 && U.int(1, 100) <= m[9] * serene) this.applyAilment(bt, target, mv, m[1], true);
          if (k === 'tri-attack' && U.chance(0.2 * serene)) this.setStatus(target, U.pick(['brn', 'par', 'frz']), bt, true);
          if (k === 'dire-claw' && U.chance(0.5 * serene)) this.setStatus(target, U.pick(['psn', 'par', 'slp']), bt, true);
          let flinch = m[10] || 0;
          if (!flinch && ['kings-rock', 'razor-fang'].includes(bt.itemKey)) flinch = 10;
          if (a === 'stench' && !flinch) flinch = 10;
          if (flinch && !target.movedThisTurn && target.ability() !== 'inner-focus' && !target.v.dyna && U.int(1, 100) <= flinch * serene) target.v.flinch = true;
          if (m[0] === 6 && mv.sc && U.int(1, 100) <= (m[11] || 100) * serene) {
            for (const [stat, ch] of mv.sc) this.boost(target, stat - 1, ch, bt);
          }
        }
      }
      if (!sheer && m[0] === 7 && mv.sc && !bt.fainted && U.int(1, 100) <= (m[11] || 100) * (m[11] ? serene : 1)) {
        for (const [stat, ch] of mv.sc) this.boost(bt, stat - 1, ch, bt);
      }
      // Unique damaging effects
      if (!bt.fainted) this.uniqueDamageEffects(bt, target, mv, total);
      if (target.mon.st === 'frz' && !target.fainted && (Dex.typeKey(this.moveType(bt, mv)) === 'fire' || ['scald', 'steam-eruption', 'scorching-sands'].includes(k))) this.cureStatus(target);
    }

    uniqueDamageEffects(bt, target, mv, total) {
      const k = mv.k, side = bt.side, foeSide = target.side;
      switch (k) {
        case 'rapid-spin': case 'mortal-spin':
          for (const c of ['spikes', 'tspikes', 'rocks', 'web']) delete side.conds[c];
          bt.v.trapped = null; bt.v.leechSeed = false;
          if (k === 'rapid-spin') this.boost(bt, 5, 1, bt);
          if (k === 'mortal-spin' && !target.fainted) this.setStatus(target, 'psn', bt, true);
          break;
        case 'brick-break': case 'psychic-fangs': case 'raging-bull':
          for (const c of ['reflect', 'lightScreen', 'auroraVeil']) if (foeSide.conds[c]) { delete foeSide.conds[c]; this.msg('Osłona przeciwnika pęka!'); }
          break;
        case 'knock-off':
          if (!target.fainted && target.item && !target.itemKey.endsWith('ite') && !target.itemKey.endsWith('-z')) {
            this.msg(bt.name + ' strąca ' + target.item.n + ' ' + target.name + '!');
            if (this.kind === 'trainer' || !target.side.isPlayer) target.v.itemLost = true; else target.mon.item = null;
            if (!target.side.isPlayer && this.kind === 'trainer') target.v.itemLost = true;
          }
          break;
        case 'thief': case 'covet':
          if (!bt.mon.item && target.item && !target.itemKey.endsWith('ite')) {
            this.msg(bt.name + ' kradnie ' + target.item.n + '!');
            bt.mon.item = target.mon.item;
            if (this.kind === 'wild') target.mon.item = null; else { target.v.itemLost = true; this.stolen.push({ mon: bt.mon, item: bt.mon.item }); }
          }
          break;
        case 'bug-bite': case 'pluck':
          if (target.itemKey.endsWith('-berry')) { this.msg(bt.name + ' zjada jagodę przeciwnika!'); target.v.itemLost = true; }
          break;
        case 'incinerate':
          if (target.itemKey.endsWith('-berry')) { this.msg('Jagoda ' + target.name + ' spłonęła!'); target.v.itemLost = true; }
          break;
        case 'pay-day':
          this.money += bt.mon.lvl * 5;
          this.msg('Monety rozsypują się wokół!');
          break;
        case 'make-it-rain':
          this.money += bt.mon.lvl * 5;
          this.msg('Złote monety spadają z nieba!');
          break;
        case 'smack-down': case 'thousand-arrows':
          if (!target.fainted && !target.isGrounded()) { target.v.smackedDown = true; this.msg(target.name + ' spada na ziemię!'); }
          break;
        case 'u-turn': case 'volt-switch': case 'flip-turn':
          if (!target.fainted || this.ableCount(foeSide) > 0) this.pivot(bt);
          break;
        case 'dragon-tail': case 'circle-throw':
          if (!target.fainted && !target.v.dyna) {
            if (this.kind === 'wild') { this.msg(this.nm(target) + ' zostaje odrzucony!'); this.finish(side.isPlayer ? 'run' : 'fled'); }
            else this.forceRandomSwitch(target);
          }
          break;
        case 'clear-smog':
          if (!target.fainted) { target.stages = [0, 0, 0, 0, 0, 0, 0, 0]; this.msg('Zmiany statystyk ' + target.name + ' zostają usunięte!'); }
          break;
        case 'salt-cure':
          if (!target.fainted) { target.v.saltCure = true; this.msg(target.name + ' zostaje zasolony!'); }
          break;
        case 'spirit-shackle': case 'anchor-shot': case 'thousand-waves': case 'jaw-lock':
          if (!target.fainted && !target.v.trapped) { target.v.trapped = { turns: 99, noDmg: true }; this.msg(this.nm(target) + ' nie może uciec!'); }
          break;
        case 'burn-up':
          bt.types = bt.types.filter(t => t !== ty('fire')); if (!bt.types.length) bt.types = [ty('normal')];
          this.msg(bt.name + ' wypala się!');
          break;
        case 'double-shock':
          bt.types = bt.types.filter(t => t !== ty('electric')); if (!bt.types.length) bt.types = [ty('normal')];
          break;
        case 'glaive-rush': bt.v.glaiveRush = this.turn + 1; break;
        case 'outrage': case 'thrash': case 'petal-dance': break;
        case 'fake-out': break;
        case 'future-sight': case 'doom-desire':
          break;
        case 'rage': bt.v.rage = true; break;
        case 'defense-curl': bt.v.defenseCurl = true; break;
      }
      if (['ice-hammer', 'hammer-arm'].includes(k)) { /* covered by meta stat changes */ }
    }

    // Darmanitan switches to Zen Mode at half HP or less and back above it.
    zenMode(bt) {
      const k = bt.data.k;
      const toZen = bt.hpFrac() <= 0.5;
      const map = { 'darmanitan-standard': 'darmanitan-zen', 'darmanitan-galar-standard': 'darmanitan-galar-zen' };
      const rev = { 'darmanitan-zen': 'darmanitan-standard', 'darmanitan-galar-zen': 'darmanitan-galar-standard' };
      const target = toZen ? map[k] : rev[k];
      if (!target) return;
      const pid = Dex.monByKey(target);
      if (!pid) return;
      if (!bt.mon._basePid) bt.mon._basePid = bt.mon.pid;
      bt.mon.pid = pid; bt.statCache = null; bt.resetTypes();
      this.msg(toZen ? bt.name + ' wchodzi w Tryb Zen!' : bt.name + ' wychodzi z Trybu Zen!');
      this.ev({ t: 'transform', side: bt.side.id, pid });
    }

    // ------------------------------------------------------------------ gimmicks
    canMega(bt) {
      const side = bt.side;
      if (side.used.mega || bt.v.dyna || bt.v.tera !== undefined) return null;
      if (!side.flags.mega) return null;
      const item = bt.mon.item;
      const sp = Dex.speciesOf(bt.mon.pid);
      for (const fid of sp.f) {
        const f = Dex.mon(fid);
        if (!f.mega || !f.ms) continue;
        if (f.ms === item) return fid;
        if (f.k === 'rayquaza-mega' && bt.mon.moves.some(x => Dex.move(x.id).k === 'dragon-ascent')) return fid;
      }
      return null;
    }
    megaEvolve(bt) {
      const fid = this.canMega(bt);
      if (!fid) return;
      bt.side.used.mega = true;
      const before = Mon.name(bt.mon);
      if (!bt.mon._basePid) bt.mon._basePid = bt.mon.pid;
      bt.mon.pid = fid;
      bt.statCache = null;
      bt.resetTypes();
      bt.abil = Dex.abilityKey(Dex.mon(fid).a[0]);
      const primal = Dex.mon(fid).k.includes('primal');
      this.msg(primal ? before + ' przechodzi Pierwotny Powrót!' : before + ' reaguje na Mega Ring! ' + before + ' Mega Ewoluuje!');
      this.ev({ t: 'mega', side: bt.side.id, pid: fid, name: Dex.mon(fid).n });
      this.entryAbilities([bt]);
    }
    canZ(bt, mv) {
      const side = bt.side;
      if (!side.flags.z || side.used.z || bt.v.dyna) return false;
      const ik = bt.itemKey;
      const t = BD.Z_CRYSTALS[ik];
      if (!t || !mv) return false;
      return mv.t === ty(t);
    }
    zMove(bt, mv) {
      const t = Dex.typeKey(mv.t);
      this.msg(bt.name + ' otacza się Mocą Z! Uwalnia pełną moc!');
      this.ev({ t: 'z', side: bt.side.id });
      if (mv.c === 0) return { name: 'Z-' + mv.n, power: 0 };
      return { name: BD.Z_MOVES[t], power: BD.zPower(mv.p || 0) };
    }
    canDynamax(bt) {
      const side = bt.side;
      return !!(side.flags.dyna && !side.used.dyna && !bt.v.dyna && !side.used.mega && bt.v.tera === undefined && !bt.data.mega
        && !['zacian', 'zamazenta', 'eternatus'].some(k => bt.data.k.startsWith(k)));
    }
    dynamax(bt) {
      if (!this.canDynamax(bt)) return;
      bt.side.used.dyna = true;
      const max = Mon.maxHp(bt.mon);
      bt.v.dyna = 3;
      bt.v.dynaMax = max * 2;
      bt.mon.hp = bt.mon.hp * 2;
      this.msg(bt.name + ' Dynamaxuje się!');
      this.ev({ t: 'dyna', side: bt.side.id, on: true });
      this.hpEv(bt);
    }
    endDynamax(bt, silent) {
      if (!bt.v.dyna) return;
      bt.v.dyna = 0;
      bt.v.dynaMax = 0;
      bt.mon.hp = Math.ceil(bt.mon.hp / 2);
      if (!silent) this.msg(bt.name + ' wraca do normalnych rozmiarów!');
      this.ev({ t: 'dyna', side: bt.side.id, on: false });
      this.hpEv(bt);
    }
    maxMove(bt, mv) {
      if (mv.c === 0) return { name: 'Max Guard', power: 0, effect: ['none'] };
      const t = Dex.typeKey(this.moveType(bt, mv));
      const def = BD.MAX_MOVES[t];
      return { name: def[0], power: BD.maxPower(mv.p || 0, t), effect: def[1] };
    }
    canTera(bt) {
      const side = bt.side;
      return !!(side.flags.tera && !side.used.tera && bt.v.tera === undefined && !bt.v.dyna && !bt.data.mega);
    }
    terastallize(bt) {
      if (!this.canTera(bt)) return;
      bt.side.used.tera = true;
      bt.v.tera = bt.mon.tera;
      bt.types = [bt.mon.tera];
      this.msg(bt.name + ' Terastalizuje się! Staje się typu ' + Dex.typeName(bt.mon.tera) + '!');
      this.ev({ t: 'tera', side: bt.side.id, type: Dex.typeKey(bt.mon.tera) });
    }

    // ------------------------------------------------------------------ end of turn
    endOfTurn() {
      const order = [this.sides[0].active, this.sides[1].active].filter(Boolean).sort((a, b) => this.speed(b) - this.speed(a));
      const w = this.weather();
      // Weather
      if (this.field.weather && this.field.wturns > 0) {
        this.field.wturns--;
        if (this.field.wturns === 0) {
          this.msg({ rain: 'Deszcz przestaje padać.', sun: 'Słońce przestaje palić.', sand: 'Burza piaskowa ustaje.', snow: 'Śnieg przestaje padać.' }[this.field.weather] || 'Pogoda wraca do normy.');
          this.field.weather = null;
          this.ev({ t: 'weather', w: null });
        }
      }
      if (w === 'sand') {
        for (const bt of order) {
          if (bt.fainted || ['rock', 'ground', 'steel'].some(t => bt.hasType(t)) || ['sand-veil', 'sand-rush', 'sand-force', 'overcoat', 'magic-guard'].includes(bt.ability()) || bt.itemKey === 'safety-goggles') continue;
          this.damage(bt, Math.max(1, Math.floor(bt.maxHp / 16)), 'Burza piaskowa rani ' + bt.name + '!');
        }
      }
      for (const bt of order) {
        if (bt.fainted) continue;
        const a = bt.ability();
        if (w === 'rain' && (a === 'rain-dish' || a === 'dry-skin')) this.heal(bt, bt.maxHp / (a === 'dry-skin' ? 8 : 16), bt.name + ' odzyskuje HP w deszczu!');
        if (w === 'sun' && (a === 'dry-skin' || a === 'solar-power')) this.damage(bt, bt.maxHp / 8, bt.name + ' cierpi w słońcu!');
        if (w === 'snow' && a === 'ice-body') this.heal(bt, bt.maxHp / 16, bt.name + ' odzyskuje HP w śniegu!');
      }
      // Wish
      for (const s of this.sides) {
        if (s.wish) {
          s.wish.turns--;
          if (s.wish.turns <= 0) { const bt = s.active; if (bt && !bt.fainted) this.heal(bt, s.wish.amount, 'Życzenie ' + s.wish.from + ' spełnia się!'); s.wish = null; }
        }
      }
      // Terrain healing
      if (this.field.terrain === 'grassy') for (const bt of order) if (!bt.fainted && bt.isGrounded()) this.heal(bt, bt.maxHp / 16, bt.name + ' odzyskuje HP dzięki trawie!');
      for (const bt of order) {
        if (bt.fainted) continue;
        const a = bt.ability(), mg = a === 'magic-guard';
        // Items & abilities
        if (bt.itemKey === 'leftovers') this.heal(bt, bt.maxHp / 16, bt.name + ' odzyskuje HP dzięki Leftovers!');
        if (bt.itemKey === 'black-sludge') { if (bt.hasType('poison')) this.heal(bt, bt.maxHp / 16, bt.name + ' odzyskuje HP dzięki Black Sludge!'); else if (!mg) this.damage(bt, bt.maxHp / 8, bt.name + ' rani się o Black Sludge!'); }
        if (bt.v.aquaRing) this.heal(bt, bt.maxHp / 16, 'Wodny pierścień przywraca HP ' + bt.name + '!');
        if (bt.v.ingrain) this.heal(bt, bt.maxHp / 16, bt.name + ' wchłania składniki korzeniami!');
        if (bt.fainted) continue;
        if (bt.v.leechSeed && bt.foe && !bt.foe.fainted && !mg) {
          const d = this.damage(bt, Math.max(1, Math.floor(bt.maxHp / 8)), 'Pnącza wysysają energię z ' + bt.name + '!');
          if (bt.foe && !bt.foe.fainted) this.heal(bt.foe, d);
        }
        if (bt.fainted) continue;
        // Status damage
        if ((bt.mon.st === 'psn' || bt.mon.st === 'tox') && a === 'poison-heal') this.heal(bt, bt.maxHp / 8, bt.name + ' leczy się trucizną!');
        else if (bt.mon.st === 'psn' && !mg) this.damage(bt, Math.max(1, Math.floor(bt.maxHp / 8)), this.nm(bt) + ' cierpi z powodu trucizny!');
        else if (bt.mon.st === 'tox' && !mg) { bt.mon.tox = Math.min(15, (bt.mon.tox || 0) + 1); this.damage(bt, Math.max(1, Math.floor(bt.maxHp * bt.mon.tox / 16)), this.nm(bt) + ' cierpi z powodu trucizny!'); }
        else if (bt.mon.st === 'brn' && !mg) this.damage(bt, Math.max(1, Math.floor(bt.maxHp / (a === 'heatproof' ? 32 : 16))), this.nm(bt) + ' cierpi z powodu poparzenia!');
        if (bt.fainted) continue;
        if (bt.v.nightmare && bt.mon.st === 'slp') this.damage(bt, bt.maxHp / 4, bt.name + ' ma koszmary!');
        if (bt.v.curse && !mg) this.damage(bt, bt.maxHp / 4, bt.name + ' cierpi z powodu klątwy!');
        if (bt.v.saltCure && !mg) this.damage(bt, bt.maxHp / ((bt.hasType('water') || bt.hasType('steel')) ? 4 : 8), bt.name + ' cierpi przez sól!');
        if (bt.fainted) continue;
        if (bt.v.trapped && !bt.v.trapped.noDmg) {
          bt.v.trapped.turns--;
          if (bt.v.trapped.turns <= 0) { this.msg(bt.name + ' uwalnia się z ' + bt.v.trapped.move + '!'); bt.v.trapped = null; }
          else if (!mg) this.damage(bt, Math.max(1, Math.floor(bt.maxHp / (bt.v.trapped.by && bt.v.trapped.by.itemKey === 'binding-band' ? 6 : 8))), bt.name + ' cierpi z powodu ' + bt.v.trapped.move + '!');
        }
        if (bt.fainted) continue;
        // Volatile countdowns
        if (bt.v.taunt) { bt.v.taunt--; if (!bt.v.taunt) this.msg(bt.name + ' nie jest już sprowokowany.'); }
        if (bt.v.encore) { bt.v.encore.turns--; if (bt.v.encore.turns <= 0) bt.v.encore = null; }
        if (bt.v.disabled) { bt.v.disabled.turns--; if (bt.v.disabled.turns <= 0) bt.v.disabled = null; }
        if (bt.v.healBlock) bt.v.healBlock--;
        if (bt.v.laserFocus) bt.v.laserFocus--;
        if (bt.v.yawn) { bt.v.yawn--; if (!bt.v.yawn) this.setStatus(bt, 'slp', null); }
        if (bt.v.perish) {
          bt.v.perish--;
          this.msg('Licznik zagłady ' + bt.name + ': ' + bt.v.perish + '!');
          if (bt.v.perish <= 0) this.damage(bt, bt.hp);
        }
        if (bt.fainted) continue;
        if (a === 'speed-boost' && bt.turnsIn > 0) this.boost(bt, 5, 1, bt);
        if (a === 'shed-skin' && bt.mon.st && U.chance(1 / 3)) { this.msg('Zrzucenie skóry ' + bt.name + ' leczy status!'); this.cureStatus(bt); }
        if (a === 'slow-start' && bt.v.slowStart) { bt.v.slowStart--; if (!bt.v.slowStart) this.msg(bt.name + ' w końcu się rozkręca!'); }
        if (bt.itemKey === 'toxic-orb' && !bt.mon.st) this.setStatus(bt, 'tox', bt, true);
        if (bt.itemKey === 'flame-orb' && !bt.mon.st) this.setStatus(bt, 'brn', bt, true);
        if (bt.v.dyna) { bt.v.dyna--; if (!bt.v.dyna) { bt.v.dyna = 1; this.endDynamax(bt); } }
        if (a === 'zen-mode') this.zenMode(bt);
        if (bt.v.roosted) bt.v.roosted = false;
        if (bt.v.protectedTurn !== this.turn) bt.v.protectChain = 0;
        bt.turnsIn++;
      }
      // Side conditions
      for (const s of this.sides) {
        for (const key of ['reflect', 'lightScreen', 'auroraVeil', 'tailwind', 'safeguard', 'mist', 'luckyChant']) {
          if (s.conds[key]) {
            s.conds[key]--;
            if (!s.conds[key]) {
              delete s.conds[key];
              this.msg({ reflect: 'Reflect przestaje działać.', lightScreen: 'Light Screen przestaje działać.', auroraVeil: 'Aurora Veil przestaje działać.', tailwind: 'Tylny wiatr ustaje.', safeguard: 'Safeguard przestaje działać.', mist: 'Mgła się rozwiewa.', luckyChant: 'Zaklęcie przestaje działać.' }[key]);
            }
          }
        }
      }
      if (this.field.terrain && this.field.tturns > 0) {
        this.field.tturns--;
        if (!this.field.tturns) { this.msg('Pole walki wraca do normy.'); this.field.terrain = null; this.ev({ t: 'terrain', terrain: null }); }
      }
      if (this.field.trickRoom) { this.field.trickRoom--; if (!this.field.trickRoom) this.msg('Zakrzywione wymiary wracają do normy!'); }
      if (this.field.gravity) this.field.gravity--;
      for (const s of this.sides) { const bt = s.active; if (bt && bt.fainted) s.lastFaintTurn = this.turn; }
    }

    // ================================================================== ITEMS IN BATTLE
    useBattleItem(side, itemId, targetIdx) {
      const it = Dex.item(itemId);
      if (!it) return;
      const game = this.opts.player.game;
      const target = targetIdx !== undefined ? side.team[targetIdx] : side.active.mon;
      const bt = side.active && side.active.mon === target ? side.active : null;
      const who = side.isPlayer ? (this.opts.player.name || 'Ty') : side.name;
      this.msg(who + ' używa ' + it.n + '!');
      const res = PW.Items ? PW.Items.applyMedicine(target, itemId, { battle: this, battler: bt }) : null;
      if (res && res.text) this.msg(res.text);
      if (bt) { this.hpEv(bt); this.ev({ t: 'status', side: side.id, st: target.st }); }
      if (side.isPlayer && game && res && res.ok) game.takeItem(itemId, 1);
      if (!side.isPlayer) side.used.items = (side.used.items || 0) + 1;
    }

    // ================================================================== CATCHING
    throwBall(itemId) {
      const game = this.opts.player.game;
      const it = Dex.item(itemId);
      const me = this.sides[0].active, foe = this.sides[1].active;
      if (game) game.takeItem(itemId, 1);
      this.ballThrows++;
      this.msg((this.opts.player.name || 'Ty') + ' rzuca ' + it.n + '!');
      if (this.kind !== 'wild') { this.msg('Trener blokuje Poké Balla! Nie wolno kraść cudzych Pokémonów!'); return; }
      if (this.opts.foe.noCatch) { this.msg('Nie da się złapać tego Pokémona!'); return; }
      const r = (this.opts.cheats || {}).catchAll ? { ok: true, shakes: 3, crit: false } : PW.Catch.attempt(foe, me, it, this);
      this.ev({ t: 'ball', item: it.k, shakes: r.shakes, ok: r.ok, crit: r.crit });
      if (r.crit) this.msg('Krytyczny rzut!');
      if (r.ok) {
        this.msg('Gotowe! ' + foe.name + ' zostaje złapany!');
        foe.mon.ball = itemId;
        if (foe.v.dyna) this.endDynamax(foe, true);
        if (foe.mon._basePid) { foe.mon.pid = foe.mon._basePid; delete foe.mon._basePid; }
        this.caught = foe.mon;
        this.finish('caught');
      } else {
        this.msg(['O nie! Pokémon się wyrwał!', 'Ach! Już prawie!', 'Argh! Tak blisko!', 'Kurczę! Było tak blisko!'][Math.min(3, r.shakes)]);
      }
    }

    // ================================================================== AI
    chooseAI(side) {
      const bt = side.active;
      if (!bt || bt.fainted) return { type: 'move', index: 0 };
      return PW.AI.choose(this, side);
    }
    aiChooseReplacement(side, pivot) {
      return PW.AI.replacement(this, side, pivot);
    }
  }

  PW.Battle = Battle;
  PW.Battler = Battler;
  PW.stageMult = stageMult;
})(typeof window !== 'undefined' ? window : globalThis);
