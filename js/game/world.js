/* World logic: regions, locations, weather, wild encounter tables, trainer and team generation. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const POST = 99;

  const KIND_PL = {
    town: 'Miasteczko', city: 'Miasto', route: 'Trasa', sea: 'Trasa morska', cave: 'Jaskinia', forest: 'Las',
    mountain: 'Góry', tower: 'Wieża', ruins: 'Ruiny', desert: 'Pustynia', snow: 'Ośnieżony teren', volcano: 'Wulkan',
    lake: 'Jezioro', beach: 'Plaża', meadow: 'Łąka', island: 'Wyspa', wild: 'Dzika Strefa', marsh: 'Bagna',
    building: 'Budynek', league: 'Liga Pokémon', special: 'Miejsce szczególne',
  };
  const KIND_ICON = {
    town: '🏘️', city: '🏙️', route: '🛤️', sea: '🌊', cave: '🕳️', forest: '🌲', mountain: '⛰️', tower: '🗼', ruins: '🏛️',
    desert: '🏜️', snow: '❄️', volcano: '🌋', lake: '💧', beach: '🏖️', meadow: '🌼', island: '🏝️', wild: '🌾', marsh: '🪷',
    building: '🏢', league: '🏆', special: '✨',
  };
  const METHOD_PL = {
    walk: 'Trawa / teren', surf: 'Surfowanie', 'old-rod': 'Stara wędka', 'good-rod': 'Dobra wędka', 'super-rod': 'Super wędka',
    'rock-smash': 'Rozbijanie skał', headbutt: 'Potrząsanie drzew', raid: 'Rajd',
  };

  // Trainer classes: [display name, sprite, prize base, preferred types]
  const CLASSES = {
    youngster: ['Youngster', 'youngster', 16, ['normal', 'bug', 'flying', 'poison']],
    lass: ['Lass', 'lass', 16, ['normal', 'grass', 'fairy', 'bug']],
    bugcatcher: ['Bug Catcher', 'bugcatcher', 16, ['bug']],
    camper: ['Camper', 'camper', 20, ['ground', 'normal', 'fire', 'rock']],
    picnicker: ['Picnicker', 'picnicker', 20, ['grass', 'normal', 'fairy']],
    hiker: ['Hiker', 'hiker', 40, ['rock', 'ground', 'fighting', 'steel']],
    fisherman: ['Fisherman', 'fisherman', 40, ['water']],
    swimmer: ['Swimmer', 'swimmer', 20, ['water']],
    birdkeeper: ['Bird Keeper', 'birdkeeper', 32, ['flying']],
    blackbelt: ['Black Belt', 'blackbelt', 32, ['fighting']],
    psychic: ['Psychic', 'psychic', 32, ['psychic']],
    hexmaniac: ['Hex Maniac', 'hexmaniac-gen3', 24, ['ghost', 'dark', 'psychic']],
    beauty: ['Beauty', 'beauty', 56, ['fairy', 'normal', 'grass', 'water']],
    gentleman: ['Gentleman', 'gentleman', 72, ['normal', 'fire', 'electric']],
    acetrainer: ['Ace Trainer', 'acetrainer', 60, []],
    pokefan: ['Pokéfan', 'pokefan', 40, ['normal', 'fairy', 'electric']],
    breeder: ['Pokémon Breeder', 'pokemonbreeder', 48, []],
    sailor: ['Sailor', 'sailor', 32, ['water', 'fighting']],
    scientist: ['Scientist', 'scientist', 48, ['electric', 'poison', 'steel', 'psychic']],
    worker: ['Worker', 'worker', 40, ['rock', 'steel', 'fighting', 'ground']],
    ruinmaniac: ['Ruin Maniac', 'ruinmaniac', 48, ['ground', 'rock']],
    channeler: ['Channeler', 'channeler-gen1', 32, ['ghost']],
    sage: ['Sage', 'sage', 32, ['grass', 'normal', 'psychic']],
    skier: ['Skier', 'skier', 32, ['ice']],
    veteran: ['Veteran', 'veteran', 80, []],
    ranger: ['Pokémon Ranger', 'pokemonranger', 60, ['grass', 'bug', 'water']],
    backpacker: ['Backpacker', 'backpacker', 20, []],
    kindler: ['Kindler', 'kindler-gen3', 32, ['fire']],
    guitarist: ['Guitarist', 'guitarist', 32, ['electric']],
    biker: ['Biker', 'biker', 32, ['poison', 'dark']],
    juggler: ['Juggler', 'juggler', 40, ['psychic', 'electric', 'ghost']],
  };
  const KIND_CLASSES = {
    route: ['youngster', 'lass', 'bugcatcher', 'camper', 'picnicker', 'birdkeeper', 'pokefan', 'backpacker'],
    forest: ['bugcatcher', 'lass', 'picnicker', 'ranger', 'sage'],
    cave: ['hiker', 'blackbelt', 'ruinmaniac', 'backpacker', 'worker'],
    mountain: ['hiker', 'blackbelt', 'birdkeeper', 'backpacker', 'acetrainer'],
    sea: ['swimmer', 'fisherman', 'sailor', 'swimmer'], beach: ['swimmer', 'fisherman', 'beauty', 'camper', 'picnicker'],
    lake: ['fisherman', 'swimmer', 'picnicker'], tower: ['channeler', 'hexmaniac', 'sage', 'psychic'],
    ruins: ['ruinmaniac', 'hexmaniac', 'psychic', 'backpacker'], building: ['scientist', 'worker', 'gentleman', 'beauty', 'guitarist'],
    snow: ['skier', 'hiker', 'acetrainer'], desert: ['kindler', 'ruinmaniac', 'hiker', 'backpacker'],
    volcano: ['kindler', 'hiker', 'blackbelt'], city: ['youngster', 'lass', 'gentleman', 'beauty', 'pokefan', 'guitarist', 'biker', 'juggler'],
    town: ['youngster', 'lass', 'pokefan', 'gentleman'], wild: ['camper', 'picnicker', 'ranger', 'backpacker', 'breeder', 'acetrainer'],
    meadow: ['picnicker', 'lass', 'bugcatcher', 'breeder'], marsh: ['fisherman', 'bugcatcher', 'ranger'], island: ['swimmer', 'fisherman', 'beauty'],
    league: ['acetrainer', 'veteran'], special: ['acetrainer', 'veteran', 'psychic'],
  };
  const TYPE_CLASS = {
    water: 'swimmer', fire: 'kindler', grass: 'picnicker', bug: 'bugcatcher', rock: 'hiker', ground: 'hiker', electric: 'guitarist',
    psychic: 'psychic', fighting: 'blackbelt', ghost: 'channeler', ice: 'skier', dragon: 'acetrainer', flying: 'birdkeeper',
    poison: 'biker', steel: 'worker', dark: 'biker', normal: 'lass', fairy: 'beauty',
  };
  const NAMES_M = ['Joey', 'Ben', 'Calvin', 'Mikey', 'Kent', 'Brian', 'Liam', 'Alex', 'Max', 'Leo', 'Noah', 'Theo', 'Oscar', 'Felix',
    'Hugo', 'Adam', 'Jan', 'Kuba', 'Tomek', 'Marek', 'Piotr', 'Olek', 'Ryan', 'Dylan', 'Tyler', 'Wade', 'Gus', 'Ricky', 'Owen', 'Ivan'];
  const NAMES_F = ['Janice', 'Sally', 'Robin', 'Dana', 'Zoe', 'Emma', 'Mia', 'Lily', 'Ivy', 'Ruby', 'Nora', 'Ola', 'Zosia', 'Kasia',
    'Ania', 'Julia', 'Gina', 'Beth', 'Lola', 'Erin', 'Tara', 'Maya', 'Ella', 'Cora', 'Rita', 'Hana', 'Vera', 'Lena', 'Iza', 'Nina'];
  const FEMALE_CLASSES = ['lass', 'picnicker', 'beauty', 'hexmaniac', 'channeler', 'skier'];
  // Classes the games have in both genders, with the female trainer sprite.
  const FEMALE_VARIANT = { acetrainer: 'acetrainerf', swimmer: 'swimmerf', pokefan: 'pokefanf', breeder: 'pokemonbreederf',
    ranger: 'pokemonrangerf', scientist: 'scientistf', veteran: 'veteranf', backpacker: 'backpackerf', psychic: 'psychicf' };
  const WATER_CLASSES = ['fisherman', 'swimmer', 'sailor'];

  let byRegion = null;

  const World = PW.World = {
    POST, KIND_PL, KIND_ICON, METHOD_PL, CLASSES, FEMALE_VARIANT,
    regions() { return Dex.data.world; },
    region(id) {
      if (!byRegion) { byRegion = {}; for (const r of Dex.data.world) { byRegion[r.id] = r; r._loc = {}; for (const l of r.locs) r._loc[l.id] = l; } }
      return byRegion[id];
    },
    loc(regionId, locId) { const r = World.region(regionId); return r ? r._loc[locId] : null; },
    here() { const s = PW.Game.s; return World.loc(s.region, s.loc); },
    hereRegion() { return World.region(PW.Game.s.region); },
    locName(regionId, locId) { const l = World.loc(regionId, locId); return l ? l.n : locId; },

    accessible(regionId, loc) {
      const r = PW.Game.reg(regionId);
      if (loc.r >= POST) return r.champion;
      return r.badges.length >= loc.r || r.champion;
    },
    locsFor(regionId) { return World.region(regionId).locs; },
    gymAt(regionId, locId) {
      const reg = World.region(regionId);
      const out = [];
      reg.gyms.forEach((g, i) => { if (g.loc === locId) out.push(i); });
      return out;
    },
    nextGym(regionId) {
      const r = PW.Game.reg(regionId);
      const reg = World.region(regionId);
      return r.badges.length < reg.gyms.length ? r.badges.length : -1;
    },
    // Expected level band for trainers in a region at the player's progress.
    progressLevel(regionId) {
      const reg = World.region(regionId);
      const r = PW.Game.reg(regionId);
      const i = Math.min(r.badges.length, reg.gyms.length - 1);
      if (r.champion) return Math.max(...reg.champ.team.map(t => t.l)) + 5;
      const g = reg.gyms[i];
      return Math.max(...g.team.map(t => t.l)) - 3;
    },

    // ---------------------------------------------------------------- weather
    // Returns {w: battle weather or null, cond: overworld condition for encounter filtering, label}
    weather(regionId, loc) {
      const s = PW.Game.s;
      const key = regionId + '/' + loc.id;
      const ov = s.weatherOverride[key];
      if (ov && ov.until > Date.now()) return World.weatherInfo(ov.cond);
      // Galar Wild Area: weather comes from the location's real encounter conditions.
      const conds = new Set();
      for (const tbl of Object.values(loc.w || {})) for (const e of tbl) for (const c of (e[4] || [])) if (c.startsWith('weather-')) conds.add(c);
      if (conds.size) {
        const list = [...conds];
        const weights = list.map(c => c === 'weather-normal' ? 5 : c === 'weather-overcast' ? 3 : 1);
        let h = U.dayHash(key) % weights.reduce((a, b) => a + b, 0);
        for (let i = 0; i < list.length; i++) { h -= weights[i]; if (h < 0) return World.weatherInfo(list[i]); }
      }
      const kind = loc.k;
      const id = loc.id;
      const rainy = ['hoenn-route-119', 'hoenn-route-120', 'hoenn-route-123', 'sinnoh-route-212', 'sinnoh-route-213', 'sinnoh-route-215', 'kalos-route-14', 'kalos-route-19', 'alola-route-17', 'johto-route-43'];
      if (['desert'].includes(kind) || ['hoenn-route-111', 'sinnoh-route-228', 'haina-desert', 'unova-route-4', 'desert-resort', 'galar-route-6'].includes(id)) {
        return World.weatherInfo(U.dayHash(key) % 4 ? 'weather-sandstorm' : 'weather-normal');
      }
      if (kind === 'snow' || ['sinnoh-route-216', 'sinnoh-route-217', 'snowpoint-city', 'mount-lanakila', 'kalos-route-17', 'galar-route-8', 'galar-route-10', 'icirrus-city'].includes(id)) {
        return World.weatherInfo(U.dayHash(key) % 3 ? 'weather-snowing' : 'weather-normal');
      }
      if (rainy.includes(id)) return World.weatherInfo(U.dayHash(key) % 3 ? 'weather-raining' : 'weather-normal');
      if (regionId === 'unova' && U.season() === 'winter' && ['route', 'town', 'city'].includes(kind)) return World.weatherInfo(U.dayHash(key) % 4 === 0 ? 'weather-snowing' : 'weather-normal');
      if (['route', 'forest', 'meadow', 'lake', 'marsh', 'wild', 'beach'].includes(kind)) {
        const h = U.dayHash(key) % 20;
        if (h === 0) return World.weatherInfo('weather-raining');
        if (h === 1 && regionId !== 'kanto') return World.weatherInfo('weather-intense-sun');
        if (h === 2 && ['forest', 'marsh'].includes(kind)) return World.weatherInfo('weather-fog');
      }
      return World.weatherInfo('weather-normal');
    },
    weatherInfo(cond) {
      const map = {
        'weather-normal': [null, 'Pogodnie', '☀️'], 'weather-overcast': [null, 'Pochmurno', '☁️'],
        'weather-raining': ['rain', 'Deszcz', '🌧️'], 'weather-thunderstorm': ['rain', 'Burza', '⛈️'],
        'weather-snowing': ['snow', 'Śnieg', '🌨️'], 'weather-snowstorm': ['snow', 'Zamieć', '❄️'],
        'weather-sandstorm': ['sand', 'Burza piaskowa', '🌪️'], 'weather-intense-sun': ['sun', 'Upał', '🔆'],
        'weather-fog': [null, 'Mgła', '🌫️'],
      };
      const m = map[cond] || map['weather-normal'];
      return { cond, w: m[0], label: m[1], icon: m[2] };
    },

    // ---------------------------------------------------------------- encounter tables
    context(regionId, loc) {
      const s = PW.Game.s;
      const time = U.timeOfDay();
      return {
        region: regionId, loc, time, season: U.season(), weekday: U.weekday(), weather: World.weather(regionId, loc),
        swarm: s.swarm && s.swarm.region === regionId && s.swarm.loc === loc.id && s.swarm.left > 0 ? s.swarm : null,
        champion: PW.Game.isChampion(regionId), gba: s.settings.gba, radio: s.settings.radio, radar: !!s.radarOn,
      };
    },
    condOK(c, ctx) {
      if (c.startsWith('time-')) return c === 'time-' + ctx.time;
      if (c.startsWith('season-')) return c === 'season-' + ctx.season;
      if (c.startsWith('weather-')) return c === ctx.weather.cond || (c === 'weather-normal' && ctx.weather.cond === 'weather-overcast' && false);
      if (c === 'swarm-yes') return !!ctx.swarm;
      if (c === 'radar-on') return ctx.radar;
      if (c.startsWith('slot2-')) return c === 'slot2-' + ctx.gba;
      if (c === 'radio-off') return ctx.radio === 'off';
      if (c.startsWith('radio-')) return c === 'radio-' + ctx.radio;
      if (c.startsWith('weekday-')) return c === 'weekday-' + ctx.weekday;
      if (c === 'postgame') return ctx.champion;
      if (c.startsWith('max-den')) return true;
      if (c.startsWith('starter-')) return c === 'starter-' + World.starterKey(ctx.region);
      return true;
    },
    // Which of the region's three starters the player's starter corresponds to (by species or by type).
    starterKey(regionId) {
      const reg = World.region(regionId);
      const s = PW.Game.s;
      const mine = PW.Game.allMons().find(m => m.starter) || s.party[0];
      const keys = reg.starters.map(pid => Dex.species(Dex.mon(pid).s).k);
      if (!mine) return keys[0];
      const base = Dex.baseSpecies(Dex.mon(mine.pid).s);
      const idx = reg.starters.findIndex(pid => Dex.baseSpecies(Dex.mon(pid).s) === base);
      if (idx >= 0) return keys[idx];
      const t = Dex.typeKey(Dex.mon(mine.pid).t[0]);
      return keys[t === 'fire' ? 1 : t === 'water' ? 2 : 0];
    },
    // Eligible entries [{pid, w, lo, hi}] for a method under current conditions.
    table(regionId, loc, method, ctx) {
      ctx = ctx || World.context(regionId, loc);
      const rows = (loc.w || {})[method] || [];
      const out = [];
      for (const e of rows) {
        const [pid, w, lo, hi, conds, post] = e;
        if (conds && !conds.every(c => World.condOK(c, ctx))) continue;
        let a = lo, b = hi;
        if (post && post.length === 2 && ctx.champion) { a = post[0]; b = post[1]; }
        out.push({ pid, w, lo: a, hi: b, conds: conds || [] });
      }
      // Paldea/Galar style: if weather filtering removed everything, fall back to "normal" rows.
      if (!out.length && rows.some(e => (e[4] || []).some(c => c.startsWith('weather-')))) {
        return World.table(regionId, loc, method, Object.assign({}, ctx, { weather: World.weatherInfo('weather-normal') }));
      }
      if (ctx.swarm && method === 'walk') {
        const sw = ctx.swarm;
        out.push({ pid: sw.pid, w: out.reduce((a, x) => a + x.w, 0) * 1.5 + 10, lo: sw.lo, hi: sw.hi, conds: ['swarm-yes'], swarm: true });
      }
      return out;
    },
    methods(regionId, loc) {
      return Object.keys(loc.w || {}).filter(m => m !== 'raid');
    },
    methodUnlocked(regionId, method) {
      const reg = World.region(regionId);
      const b = PW.Game.badges(regionId), champ = PW.Game.isChampion(regionId);
      const G2 = PW.Game;
      if (method === 'walk' || method === 'headbutt') return true;
      if (method === 'surf') return champ || b >= (reg.surf || 0);
      if (method === 'rock-smash') return champ || b >= 1;
      if (method === 'old-rod') return G2.has('old-rod') || G2.has('good-rod') || G2.has('super-rod');
      if (method === 'good-rod') return G2.has('good-rod') || G2.has('super-rod');
      if (method === 'super-rod') return G2.has('super-rod');
      return true;
    },
    // Every species that can appear here right now (for the location screen).
    residents(regionId, loc, all) {
      const ctx = World.context(regionId, loc);
      const res = {};
      for (const m of Object.keys(loc.w || {})) {
        const rows = all ? (loc.w[m] || []).map(e => ({ pid: e[0], lo: e[2], hi: e[3], w: e[1], conds: e[4] || [] })) : World.table(regionId, loc, m, ctx);
        for (const e of rows) {
          const key = e.pid;
          if (!res[key]) res[key] = { pid: e.pid, methods: new Set(), lo: e.lo, hi: e.hi, w: 0, conds: new Set() };
          res[key].methods.add(m);
          res[key].lo = Math.min(res[key].lo, e.lo); res[key].hi = Math.max(res[key].hi, e.hi);
          res[key].w += e.w;
          for (const c of e.conds) res[key].conds.add(c);
        }
      }
      return Object.values(res).sort((a, b) => b.w - a.w);
    },
    // Level ranges shown to the player, land and water apart: an early town's Super Rod table
    // should not make the whole place look like Lv40.
    levelText(loc) {
      if (loc.lv) return 'Lv ' + loc.lv[0] + '–' + loc.lv[1];
      const land = [999, 0], water = [999, 0];
      for (const m of Object.keys(loc.w || {})) for (const e of loc.w[m]) {
        if ((e[4] || []).includes('postgame') || m === 'raid') continue;
        const r = ['surf', 'old-rod', 'good-rod', 'super-rod'].includes(m) ? water : land;
        r[0] = Math.min(r[0], e[2]); r[1] = Math.max(r[1], e[3]);
      }
      const parts = [];
      if (land[1]) parts.push('Lv ' + land[0] + '–' + land[1]);
      if (water[1]) parts.push('🎣 Lv ' + water[0] + '–' + water[1]);
      return parts.join(' · ');
    },
    // Highest land encounter level (grass, caves), without Surf, rods or postgame rows.
    landLevel(loc) {
      if (loc.lv) return loc.lv[1];
      let hi = 0;
      for (const e of (loc.w && loc.w.walk) || []) if (!(e[4] || []).includes('postgame')) hi = Math.max(hi, e[3]);
      return hi;
    },
    // Level of the trainers met at a location. Follows its land encounters, kept between the ace of
    // the last gym its badge requirement implies and just under the next one, so an early route
    // never gets Lv40 trainers from its Super Rod table.
    trainerLevel(regionId, loc) {
      const reg = World.region(regionId);
      const ace = team => Math.max(...team.map(t => t.l));
      const land = World.landLevel(loc);
      const r = loc.r || 0;
      const n = reg.gyms.length;
      if (r >= 99) return Math.max(land, ace(reg.champ.team) - 6);
      const lo = r > 0 ? ace(reg.gyms[Math.min(r, n) - 1].team) - 4 : 5;
      const hi = r < n ? ace(reg.gyms[r].team) - 2 : ace(reg.e4[0].team) - 4;
      return U.clamp(land || lo, Math.min(lo, hi), hi);
    },

    pickWild(regionId, loc, method) {
      const tbl = World.table(regionId, loc, method);
      if (!tbl.length) return null;
      const e = U.weighted(tbl, x => x.w);
      return { pid: e.pid, level: U.int(e.lo, Math.max(e.lo, e.hi)), swarm: !!e.swarm };
    },

    // Creates a wild Pokémon with game-accurate shiny odds, held items and hidden ability chance.
    makeWild(pid, level, o) {
      o = o || {};
      const s = PW.Game.s;
      let rolls = 1;
      if (PW.Game.has('shiny-charm')) rolls += 2;
      if (o.swarm) rolls += 2; // Mass Outbreak bonus
      if (o.rolls) rolls += o.rolls;
      const p = Dex.mon(pid);
      let item = null;
      for (const [iid, rate] of (p.hi || [])) if (!item && U.int(1, 100) <= rate) item = iid;
      const m = Mon.create({ pid, level, shinyRolls: rolls, hiddenChance: o.hiddenChance || 0.02, item, shiny: o.shiny,
        perfectIvs: o.perfectIvs, ot: '' });
      if (U.int(1, 21845) === 1) m.pkrs = true;
      PW.Game.markSeen(pid);
      void s;
      return m;
    },

    // ---------------------------------------------------------------- teams
    // Follows level-up evolutions (and stone / trade / friendship ones at sensible levels) to the stage fitting a level.
    evolveForLevel(pid, lvl, regionId) {
      let cur = pid;
      for (let guard = 0; guard < 3; guard++) {
        const p = Dex.mon(cur);
        const sp = Dex.species(p.s);
        if (!sp.evo || !sp.evo.length) break;
        const isDefault = cur === Dex.defaultForm(p.s);
        let rows = sp.evo.filter(r => r.from === cur);
        if (!rows.length) rows = sp.evo.filter(r => !r.from && (isDefault || p.fm));
        const regionNum = Mon.REGION_NUM[regionId] || 0;
        rows = rows.filter(r => !r.region || r.region === regionNum);
        let next = null;
        for (const r of rows) {
          if (r.gender && r.gender === 1 && U.chance(0.5)) continue;
          if (lvl >= World.evoNeed(r, sp)) { next = r; break; }
        }
        if (!next) break;
        let to = next.to;
        if (!next.from && !next.region && p.fm) {
          const target = Dex.speciesOf(to);
          const twin = target.f.find(fid => Dex.mon(fid).fm === p.fm);
          if (twin) to = twin;
        }
        cur = to;
      }
      return cur;
    },

    // Level from which trainers carry the evolved stage of an evolution row.
    evoNeed(r, sp) {
      if (r.trig === 'level-up' && r.lvl) return r.lvl;
      if (r.trig === 'level-up' && (r.happy || r.affection)) return 22;
      if (r.trig === 'level-up') return 34;
      if (r.trig === 'use-item') return sp.baby ? 20 : 32;
      if (r.trig === 'trade') return 38;
      return 40;
    },

    // Steps back down the line while the level is too low for the stage (no Lv20 Dusclops).
    devolveForLevel(pid, lvl) {
      let cur = pid;
      for (let guard = 0; guard < 3; guard++) {
        const p = Dex.mon(cur);
        const sp = Dex.species(p.s);
        if (!sp.ef) break;
        const pre = Dex.species(sp.ef);
        if (pre.baby) break;
        const rows = (pre.evo || []).filter(r => Dex.mon(r.to) && Dex.mon(r.to).s === p.s);
        const row = rows.find(r => r.to === cur) || rows[0];
        if (!row || lvl >= World.evoNeed(row, pre)) break;
        if (row.from) cur = row.from;
        else cur = pre.f.find(fid => Dex.mon(fid).fm && Dex.mon(fid).fm === p.fm) || Dex.defaultForm(sp.ef);
      }
      return cur;
    },

    // Stage of a species line that fits a level, from either direction.
    stageForLevel(pid, lvl, regionId) {
      return World.evolveForLevel(World.devolveForLevel(pid, lvl), lvl, regionId);
    },

    // Strong but legal level-up moveset for important trainers.
    bestMoves(pid, lvl) {
      const ls = Dex.learnset(pid).l;
      const types = Dex.mon(pid).t;
      const cands = new Map();
      for (const [lv, mid] of ls) if (lv <= lvl) cands.set(mid, Dex.move(mid));
      const scored = [];
      const bad = ['self-destruct', 'explosion', 'memento', 'final-gambit', 'healing-wish', 'lunar-dance', 'hyper-beam', 'giga-impact',
        'focus-punch', 'last-resort', 'dream-eater', 'snore', 'fake-out', 'struggle', 'belch', 'synchronoise', 'natural-gift', 'spit-up'];
      for (const [mid, mv] of cands) {
        if (!mv || mv.z || bad.includes(mv.k)) continue;
        if (mv.c === 0) continue;
        let p = mv.p || 60;
        if (['seismic-toss', 'night-shade'].includes(mv.k)) p = lvl;
        if (PW.BD.SETS.charge[mv.k] && !['solar-beam'].includes(mv.k)) p *= 0.6;
        if (mv.m && mv.m[3] > 1) p *= mv.m[2] === mv.m[3] ? mv.m[2] : 3;
        let sc = p * ((mv.a || 100) / 100) * (types.includes(mv.t) ? 1.5 : 1);
        if (mv.m && mv.m[6] < 0) sc *= 0.92;
        scored.push({ mid, mv, sc });
      }
      scored.sort((a, b) => b.sc - a.sc);
      const pick = [];
      const usedTypes = new Set();
      for (const x of scored) { if (pick.length >= 3) break; if (usedTypes.has(x.mv.t) && scored.length > 4) continue; pick.push(x.mid); usedTypes.add(x.mv.t); }
      for (const x of scored) { if (pick.length >= 3) break; if (!pick.includes(x.mid)) pick.push(x.mid); }
      // One utility status move if available.
      const statusPref = ['swords-dance', 'dragon-dance', 'nasty-plot', 'calm-mind', 'quiver-dance', 'bulk-up', 'shell-smash', 'will-o-wisp',
        'thunder-wave', 'toxic', 'spore', 'sleep-powder', 'hypnosis', 'stealth-rock', 'recover', 'roost', 'synthesis', 'leech-seed',
        'protect', 'reflect', 'light-screen', 'iron-defense', 'agility', 'rain-dance', 'sunny-day', 'sandstorm', 'snowscape', 'trick-room', 'yawn'];
      let status = null;
      for (const key of statusPref) { const id = Dex.moveByKey(key); if (id && cands.has(id)) { status = id; break; } }
      if (status && pick.length >= 3) pick.push(status);
      for (const x of scored) { if (pick.length >= 4) break; if (!pick.includes(x.mid)) pick.push(x.mid); }
      if (!pick.length) return Dex.movesAtLevel(pid, lvl);
      return pick.slice(0, 4);
    },

    // Builds trainer Pokémon from a team definition [{p, l, item, tera, totem}].
    buildTeam(def, o) {
      o = o || {};
      return def.map((t, i) => {
        let pid = t.p;
        if (typeof pid === 'string') pid = o.resolve ? o.resolve(pid, i) : null;
        if (!pid) pid = Dex.monByKey('pikachu');
        const lvl = U.clamp(o.region ? PW.Game.scaleLevel(o.region, t.l) : t.l, 1, 100);
        if (lvl > t.l + 4 && !Dex.mon(pid).totem) pid = World.evolveForLevel(pid, lvl, o.region);
        const moves = o.smart ? World.bestMoves(pid, lvl) : Dex.movesAtLevel(pid, lvl);
        const m = Mon.create({ pid, level: lvl, moves, ivs: o.ivs ? o.ivs.slice() : undefined, item: t.item || null, ot: o.ot || 'Trener',
          friendship: 255, shiny: false });
        if (t.tera) { m.tera = Dex.typeIndex(t.tera); m.teraAce = true; }
        if (t.totem) m.totem = t.totem;
        return m;
      });
    },

    // Names follow the class sprite's gender.
    trainerName(cls, female) {
      return U.pick(female === undefined ? (FEMALE_CLASSES.includes(cls) ? NAMES_F : NAMES_M) : female ? NAMES_F : NAMES_M);
    },

    // Random route trainer appropriate for the location.
    randomTrainer(regionId, loc) {
      const reg = World.region(regionId);
      // How far into the region the location is, in badges; trainers there match that stage.
      const stage = Math.min(loc.r || 0, reg.gyms.length);
      let pool = (KIND_CLASSES[loc.k] || KIND_CLASSES.route).slice();
      if (stage >= 3) pool.push('blackbelt', 'psychic', 'beauty', 'gentleman');
      if (stage >= 5) pool.push('acetrainer', 'veteran', 'breeder', 'ranger');
      const cls = U.pick(pool);
      const c = CLASSES[cls];
      const female = FEMALE_CLASSES.includes(cls) || (!!FEMALE_VARIANT[cls] && U.chance(0.5));
      const sprite = female && FEMALE_VARIANT[cls] ? FEMALE_VARIANT[cls] : c[1];
      const name = World.trainerName(cls, female);
      // Species: the location's land Pokémon (water classes also fish and surf), narrowed to the
      // class's types; when the location has too few of those, early regional Pokédex species of them.
      const ctx = World.context(regionId, loc);
      const from = methods => [].concat(...methods.map(m => World.table(regionId, loc, m, ctx)));
      const water = from(['surf', 'super-rod', 'good-rod', 'old-rod']);
      let species = WATER_CLASSES.includes(cls) ? water.concat(from(['walk'])) : from(['walk']);
      if (!species.length) species = water;
      const pref = c[3].map(t => Dex.typeIndex(t));
      const ofType = list => list.filter(e => Dex.mon(e.pid).t.some(t => pref.includes(t)));
      const dexPool = () => (Dex.data.core.dex[reg.dex] || []).slice(0, 60 + stage * 20)
        .filter(sid => !Dex.species(sid).leg && !Dex.species(sid).myth && !Dex.species(sid).baby).map(sid => ({ pid: Dex.defaultForm(sid) }));
      if (pref.length && ofType(species).length >= 2) species = ofType(species);
      else if (pref.length && ofType(dexPool()).length >= 2) species = ofType(dexPool());
      else if (!species.length) species = dexPool();
      const base = World.trainerLevel(regionId, loc);
      const strong = cls === 'acetrainer' || cls === 'veteran';
      const n = U.clamp(1 + Math.floor(stage / 3) + (U.chance(0.4) ? 1 : 0), 1, strong ? 6 : 4);
      const team = [];
      for (let i = 0; i < n; i++) {
        // The last Pokémon is the trainer's strongest, as in the games.
        const lvl = U.clamp(PW.Game.scaleLevel(regionId, base + (i === n - 1 ? U.int(0, 1) : U.int(-2, 0)) + (strong ? 2 : 0)), 2, 100);
        // Re-pick when the stage for this level lost the class's type (a Bird Keeper's Gyarados is a Magikarp at Lv9).
        let pid = World.stageForLevel(U.pick(species).pid, lvl, regionId);
        for (let tries = 0; tries < 6 && pref.length && !Dex.mon(pid).t.some(t => pref.includes(t)); tries++) pid = World.stageForLevel(U.pick(species).pid, lvl, regionId);
        team.push(Mon.create({ pid, level: lvl, ot: name }));
      }
      const prize = c[2] * team[team.length - 1].lvl;
      return { cls, title: c[0], name, sprite, team, prize, ai: strong ? 'elite' : 'trainer' };
    },

    // Gym trainers before the leader.
    gymTrainers(regionId, gi) {
      const reg = World.region(regionId);
      const g = reg.gyms[gi];
      const type = Dex.typeIndex(g.type);
      const dex = (Dex.data.core.dex[reg.dex] || Dex.data.core.dex.national).map(sid => Dex.defaultForm(sid));
      const pool = dex.filter(pid => Dex.mon(pid).t.includes(type) && !Dex.speciesOf(pid).leg && !Dex.speciesOf(pid).myth);
      const ace = Math.max(...g.team.map(t => t.l));
      const cls = TYPE_CLASS[g.type] || 'acetrainer';
      const out = [];
      const count = gi < 2 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const name = World.trainerName(cls);
        const n = gi < 3 ? 2 : 3;
        const team = [];
        for (let j = 0; j < n; j++) {
          const lvl = U.clamp(PW.Game.scaleLevel(regionId, ace - U.int(3, 6)), 2, 100);
          const base = pool.length ? U.pick(pool) : Dex.monByKey('rattata');
          team.push(Mon.create({ pid: World.stageForLevel(base, lvl, regionId), level: lvl, ot: name }));
        }
        out.push({ cls, title: CLASSES[cls][0], name, sprite: CLASSES[cls][1], team, prize: CLASSES[cls][2] * team[team.length - 1].lvl, ai: 'trainer' });
      }
      return out;
    },

    // Picks the rival's starter: the one strong against the player's starter (classic rule).
    rivalStarter(regionId) {
      const reg = World.region(regionId);
      const s = PW.Game.s;
      const mine = s.party.concat(...s.boxes.map(b => b.mons)).find(m => m.starter);
      const st = reg.starters;
      if (!mine) return st[1];
      const sp = Dex.mon(mine.pid).s;
      const idx = st.findIndex(pid => Dex.baseSpecies(Dex.mon(pid).s) === Dex.baseSpecies(sp));
      if (idx >= 0) return st[(idx + 1) % 3]; // grass->fire->water->grass
      const t = Dex.typeKey(Dex.mon(mine.pid).t[0]);
      if (t === 'grass') return st[1]; if (t === 'fire') return st[2]; if (t === 'water') return st[0];
      return U.pick(st);
    },

    rivalTeam(regionId, stage) {
      const reg = World.region(regionId);
      // First battle mirrors the games: just the rival's starter at level 5.
      const lvl = stage === 0 ? 5 : Math.max(5, PW.Game.scaleLevel(regionId, World.progressLevel(regionId) - 2));
      const ids = [];
      const n = stage === 0 ? 1 : Math.min(6, 2 + stage);
      const pool = reg.rival.mons.concat(stage >= 2 ? reg.rival.late : []);
      for (let i = 0; i < n - 1 && i < pool.length; i++) ids.push(pool[i]);
      const team = ids.map(pid => {
        const l = U.clamp(lvl - U.int(1, 3), 2, 100);
        const evo = World.evolveForLevel(pid, l, regionId);
        return Mon.create({ pid: evo, level: l, moves: World.bestMoves(evo, l), ot: reg.rival.name });
      });
      const sl = U.clamp(stage === 0 ? lvl : lvl + 1, 5, 100);
      const st = World.evolveForLevel(World.rivalStarter(regionId), sl, regionId);
      team.push(Mon.create({ pid: st, level: sl, moves: World.bestMoves(st, sl), ot: reg.rival.name }));
      return team;
    },

    villainTeam(regionId, boss) {
      const reg = World.region(regionId);
      const loc = World.here();
      const local = loc ? World.trainerLevel(regionId, loc) : 5;
      const base = PW.Game.scaleLevel(regionId, boss ? Math.max(local, World.progressLevel(regionId) + 2) : local);
      const n = boss ? Math.min(5, 3 + Math.floor(PW.Game.badges(regionId) / 4)) : U.int(1, 3);
      const team = [];
      for (let i = 0; i < n; i++) {
        const lvl = U.clamp(base + (boss ? i : U.int(-2, 1)), 3, 100);
        const pid = World.evolveForLevel(U.pick(reg.villain.mons), lvl, regionId);
        team.push(Mon.create({ pid, level: lvl, moves: boss ? World.bestMoves(pid, lvl) : undefined, ot: reg.villain.team }));
      }
      return team;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
