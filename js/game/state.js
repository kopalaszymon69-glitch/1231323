/* Game state: creation, persistence, inventory, party/PC, Pokédex, trainer level and action points. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;

  const SAVE_KEY = 'pokewedrowka.save.v1';
  const BOXES = 16, BOX_SIZE = 30;

  const DEFAULT_SETTINGS = {
    ap: true, anim: true, cries: false, textSpeed: 2, expShare: true, scaling: true, gba: 'none', radio: 'off',
    autosave: true, confirmRun: false, nicknames: true, battleSpeed: 1, cheats: false,
  };

  function emptyRegion() {
    return { badges: [], champion: false, visited: {}, flags: {}, rival: 0, starter: false, center: null, gymProgress: {}, villain: 0, scale: null };
  }

  const Game = PW.Game = {
    s: null,
    listeners: [],
    SAVE_KEY, BOXES, BOX_SIZE,

    on(fn) { Game.listeners.push(fn); },
    changed(what) { for (const fn of Game.listeners) try { fn(what); } catch (e) { console.error(e); } Game.autosave(); },

    // --------------------------------------------------------------------- lifecycle
    newGame(o) {
      const now = Date.now();
      const s = {
        v: 1, created: now, saved: now, play: 0,
        player: { name: o.name || 'Trener', gender: o.gender || 'M', avatar: o.avatar || 'red', money: 3000, tlvl: 1, texp: 0, ap: 60, apTs: now, coins: 0, bp: 0,
          tid: U.int(0, 65535) },
        party: [], boxes: Array.from({ length: BOXES }, (_, i) => ({ name: 'Pudło ' + (i + 1), mons: [] })),
        bag: { items: {}, tms: {} },
        dex: { seen: {}, caught: {}, shiny: {}, forms: {} },
        region: o.region, loc: null, regions: {},
        daycare: { mons: [], steps: 0, egg: null },
        flags: {}, repel: 0, lure: 0, swarm: null, weatherOverride: {}, roamers: {},
        quests: { daily: null, done: {} }, ach: {}, hof: [],
        stats: { battles: 0, wins: 0, losses: 0, caught: 0, shinies: 0, eggs: 0, hatched: 0, evolved: 0, trainers: 0, explore: 0, items: 0, money: 0, released: 0, legends: 0, raids: 0 },
        settings: Object.assign({}, DEFAULT_SETTINGS),
        factory: { streak: 0, best: 0, active: null },
        log: [],
        v_tera: { charged: true },
      };
      Game.s = s;
      for (const r of PW.World.regions()) s.regions[r.id] = emptyRegion();
      const reg = PW.World.region(o.region);
      s.loc = reg.lab || reg.locs[0].id;
      s.regions[o.region].center = s.loc;
      s.regions[o.region].starter = true;
      // Starting bag
      Game.addItem(Dex.itemByKey('poke-ball'), 10, true);
      Game.addItem(Dex.itemByKey('potion'), 5, true);
      Game.addItem(Dex.itemByKey('town-map'), 1, true);
      Game.addItem(Dex.itemByKey('exp-share'), 1, true);
      const starter = Mon.create({ pid: o.starter, level: 5, ot: s.player.name, ball: Dex.itemByKey('poke-ball'), met: { r: o.region, l: s.loc, lvl: 5, d: now, how: 'gift' }, friendship: 70 });
      starter.starter = true;
      Game.addMon(starter, { silent: true });
      Game.log('Profesor ' + reg.prof[0].replace('Profesor ', '') + ' powierza ci ' + Mon.name(starter) + '. Twoja przygoda się zaczyna!');
      Game.save();
      return s;
    },

    load() {
      Game.loadError = null;
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw);
        Game.migrate(s);
        Game.s = s;
        return s;
      } catch (e) { console.error('load failed', e); Game.loadError = e.message || String(e); return null; }
    },
    migrate(s) {
      s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings || {});
      delete s.unlocked; // every region is open from the start
      if (s.player.tid === undefined) s.player.tid = U.int(0, 65535);
      for (const m of s.party.concat(...s.boxes.map(b => b.mons))) if (m.tid === undefined) m.tid = Game.tidFor(m, s);
      for (const r of PW.World.regions()) if (!s.regions[r.id]) s.regions[r.id] = emptyRegion();
      for (const r of Object.values(s.regions)) { r.gymProgress = r.gymProgress || {}; r.flags = r.flags || {}; }
      s.stats = Object.assign({ battles: 0, wins: 0, losses: 0, caught: 0, shinies: 0, eggs: 0, hatched: 0, evolved: 0, trainers: 0, explore: 0, items: 0, money: 0, released: 0, legends: 0, raids: 0 }, s.stats || {});
      s.factory = s.factory || { streak: 0, best: 0, active: null };
      s.quests = s.quests || { daily: null, done: {} };
      s.roamers = s.roamers || {};
      s.weatherOverride = s.weatherOverride || {};
      s.v_tera = s.v_tera || { charged: true };
    },
    save() {
      if (!Game.s) return false;
      try {
        Game.s.saved = Date.now();
        localStorage.setItem(SAVE_KEY, JSON.stringify(Game.s));
        return true;
      } catch (e) { console.error('save failed', e); return false; }
    },
    autosave() {
      if (!Game.s || !Game.s.settings.autosave) return;
      clearTimeout(Game._saveT);
      Game._saveT = setTimeout(Game.save, 400);
    },
    hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
    exportSave() { return JSON.stringify(Game.s); },
    importSave(text) {
      const s = JSON.parse(text);
      if (!s || !s.player || !s.party) throw new Error('To nie jest zapis gry.');
      Game.migrate(s);
      Game.s = s;
      Game.save();
    },
    wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } Game.s = null; },

    // --------------------------------------------------------------------- log
    log(text, kind) {
      const s = Game.s;
      s.log.unshift({ t: Date.now(), text, kind: kind || 'info' });
      if (s.log.length > 60) s.log.length = 60;
    },

    // --------------------------------------------------------------------- money
    money() { return Game.s.player.money; },
    addMoney(n) { Game.s.player.money = U.clamp(Game.s.player.money + Math.floor(n), 0, 9999999); if (n > 0) Game.s.stats.money += Math.floor(n); },
    pay(n) { if (Game.s.player.money < n) return false; Game.s.player.money -= n; return true; },

    // --------------------------------------------------------------------- inventory
    addItem(id, n, silent) {
      if (id === null || id === undefined) return;
      n = n || 1;
      if (typeof id === 'string' && id.startsWith('tm')) { Game.s.bag.tms[id.slice(2)] = 1; return; }
      const b = Game.s.bag.items;
      b[id] = (b[id] || 0) + n;
      if (PW.Items.KEY_ITEMS.includes(PW.Items.key(id))) b[id] = 1;
      if (!silent) Game.s.stats.items += n;
    },
    takeItem(id, n) {
      n = n || 1;
      const b = Game.s.bag.items;
      if ((b[id] || 0) < n) return false;
      b[id] -= n;
      if (b[id] <= 0) delete b[id];
      return true;
    },
    count(id) { return Game.s.bag.items[id] || 0; },
    has(key) { const id = typeof key === 'number' ? key : Dex.itemByKey(key); return !!(id && Game.count(id) > 0); },
    hasTM(mid) { return !!Game.s.bag.tms[mid]; },
    addTM(mid) { Game.s.bag.tms[mid] = 1; },

    // --------------------------------------------------------------------- party / PC
    party() { return Game.s.party; },
    // Trainer ID of a Pokémon: the player's for their own, a fixed one per name for other trainers'.
    tidFor(m, s) {
      s = s || Game.s; // migrate() runs before the loaded save becomes Game.s
      if (!m.ot || m.ot === s.player.name) return s.player.tid;
      let h = 7;
      for (const ch of m.ot) h = (h * 31 + ch.charCodeAt(0)) % 65536;
      return h;
    },
    addMon(m, o) {
      o = o || {};
      const s = Game.s;
      if (m.tid === undefined) m.tid = Game.tidFor(m);
      if (!m.egg) Game.markCaught(m.pid, m.shiny);
      if (s.party.length < 6) { s.party.push(m); return 'party'; }
      for (const box of s.boxes) if (box.mons.length < BOX_SIZE) { box.mons.push(m); if (!o.silent) Game.log(Mon.name(m) + ' trafia do PC (' + box.name + ').'); return 'box'; }
      return 'full';
    },
    boxOf(uid) {
      for (let b = 0; b < Game.s.boxes.length; b++) {
        const i = Game.s.boxes[b].mons.findIndex(m => m.uid === uid);
        if (i >= 0) return { b, i };
      }
      return null;
    },
    findMon(uid) {
      const p = Game.s.party.find(m => m.uid === uid);
      if (p) return p;
      const loc = Game.boxOf(uid);
      return loc ? Game.s.boxes[loc.b].mons[loc.i] : null;
    },
    depositMon(uid, boxIdx) {
      const s = Game.s;
      const i = s.party.findIndex(m => m.uid === uid);
      if (i < 0) return false;
      if (s.party.filter(m => !m.egg && m.hp > 0).length <= 1 && !s.party[i].egg && s.party[i].hp > 0) return 'last';
      const box = s.boxes[boxIdx !== undefined ? boxIdx : s.boxes.findIndex(b => b.mons.length < BOX_SIZE)];
      if (!box || box.mons.length >= BOX_SIZE) return 'full';
      box.mons.push(s.party.splice(i, 1)[0]);
      return true;
    },
    withdrawMon(uid) {
      const s = Game.s;
      if (s.party.length >= 6) return 'full';
      const loc = Game.boxOf(uid);
      if (!loc) return false;
      s.party.push(s.boxes[loc.b].mons.splice(loc.i, 1)[0]);
      return true;
    },
    releaseMon(uid) {
      const s = Game.s;
      const i = s.party.findIndex(m => m.uid === uid);
      if (i >= 0) {
        if (s.party.filter(m => !m.egg).length <= 1) return false;
        s.party.splice(i, 1);
      } else {
        const loc = Game.boxOf(uid);
        if (!loc) return false;
        s.boxes[loc.b].mons.splice(loc.i, 1);
      }
      s.stats.released++;
      return true;
    },
    allMons() { return Game.s.party.concat(...Game.s.boxes.map(b => b.mons)); },
    healParty() { for (const m of Game.s.party) if (!m.egg) Mon.heal(m); Game.s.v_tera.charged = true; },
    lead() { return Game.s.party.find(m => !m.egg && m.hp > 0) || null; },
    ableCount() { return Game.s.party.filter(m => !m.egg && m.hp > 0).length; },
    avgTopLevel(n) {
      const lv = Game.allMons().filter(m => !m.egg).map(m => m.lvl).sort((a, b) => b - a).slice(0, n || 3);
      return lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : 5;
    },

    // --------------------------------------------------------------------- Pokédex
    markSeen(pid) {
      const p = Dex.mon(pid); if (!p) return;
      Game.s.dex.seen[p.s] = 1;
    },
    markCaught(pid, shiny) {
      const p = Dex.mon(pid); if (!p) return;
      const d = Game.s.dex;
      const isNew = !d.caught[p.s];
      d.seen[p.s] = 1; d.caught[p.s] = 1; d.forms[pid] = 1;
      if (shiny) d.shiny[p.s] = 1;
      return isNew;
    },
    caughtCount(list) {
      const c = Game.s.dex.caught;
      if (!list) return Object.keys(c).length;
      return list.filter(s => c[s]).length;
    },
    seenCount(list) {
      const c = Game.s.dex.seen;
      if (!list) return Object.keys(c).length;
      return list.filter(s => c[s]).length;
    },
    caughtSpeciesSet() { return new Set(Object.keys(Game.s.dex.caught).map(Number)); },

    // --------------------------------------------------------------------- trainer level & PA
    texpNeeded(l) { return Math.floor(25 * Math.pow(l, 1.6)); },
    addTexp(n) {
      const p = Game.s.player;
      p.texp += n;
      let up = false;
      while (p.tlvl < 100 && p.texp >= Game.texpNeeded(p.tlvl)) { p.texp -= Game.texpNeeded(p.tlvl); p.tlvl++; up = true; }
      if (up) { Game.log('Awansujesz na ' + p.tlvl + ' poziom trenera!', 'good'); if (PW.UI) PW.UI.toast('Poziom trenera: ' + p.tlvl + '!', 'good'); }
      return up;
    },
    apMax() { return Math.min(300, 60 + 4 * (Game.s.player.tlvl - 1)); },
    apRegenMs: 20000,
    tickAP() {
      const p = Game.s.player, now = Date.now();
      const max = Game.apMax();
      if (p.ap >= max) { p.apTs = now; return; }
      const gained = Math.floor((now - p.apTs) / Game.apRegenMs);
      if (gained > 0) { p.ap = Math.min(max, p.ap + gained); p.apTs += gained * Game.apRegenMs; }
    },
    spendAP(n) {
      if (!Game.s.settings.ap) return true;
      Game.tickAP();
      if (Game.s.player.ap < n) return false;
      if (Game.s.player.ap >= Game.apMax()) Game.s.player.apTs = Date.now();
      Game.s.player.ap -= n;
      return true;
    },

    // --------------------------------------------------------------------- regions
    reg(id) { return Game.s.regions[id || Game.s.region]; },
    badges(id) { return (Game.reg(id) || { badges: [] }).badges.length; },
    isChampion(id) { return !!(Game.reg(id) || {}).champion; },
    anyChampion() { return Object.values(Game.s.regions).some(r => r.champion); },
    totalBadges() { return Object.values(Game.s.regions).reduce((a, r) => a + r.badges.length, 0); },
    // Trainer levels in regions visited after the first title are mapped onto the player's strength.
    scaleLevel(regionId, L) {
      if (!Game.s || !Game.s.settings.scaling) return L;
      const r = Game.reg(regionId);
      const sc = r && r.scale;
      if (!sc || !sc.from) return L;
      const [a, b] = sc.from, [c, d] = sc.to;
      const t = b > a ? (L - a) / (b - a) : 0;
      return Math.max(L, Math.min(100, Math.round(c + t * (d - c))));
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
