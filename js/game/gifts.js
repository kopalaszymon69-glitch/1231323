/* Mystery Gift (once a day at any Pokémon Center) and the daily ID lotteries of Goldenrod Radio Tower
   (HeartGold/SoulSilver), Lilycove Department Store (Emerald) and Jubilife TV (Platinum). */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const Game = () => PW.Game;
  const I = k => Dex.itemByKey(k);

  // Event tickets: each opens a place in its region once you are that region's Champion.
  const TICKETS = [['auroraticket', 'kanto'], ['mysticticket', 'kanto'], ['old-sea-map', 'hoenn'], ['eon-ticket', 'hoenn'],
    ['member-card', 'sinnoh'], ['oaks-letter', 'sinnoh'], ['azure-flute', 'sinnoh'], ['liberty-pass', 'unova'], ['gs-ball', 'johto']];
  // Mythical Pokémon from real distributions: [key, level (0 = egg), origin, original OT and ID].
  const EVENT_MONS = [
    ['jirachi', 5, 'dysk bonusowy Pokémon Colosseum (2003)', 'WISHMKR', 20043],
    ['manaphy', 0, 'jajo z Pokémon Ranger (2006)', null, null],
    ['keldeo', 15, 'wydarzenie z 2012 roku', null, null],
    ['diancie', 50, 'wydarzenie z 2014 roku', null, null],
    ['hoopa', 50, 'wydarzenie z 2015 roku', null, null],
    ['volcanion', 70, 'bilet kinowy (Japonia, 2016)', null, null],
    ['magearna', 50, 'kod QR w Pokémon Sun/Moon', null, null],
    ['marshadow', 60, 'wydarzenie Galar (2020)', null, null],
    ['zarude', 60, 'wydarzenie z 2020 roku', null, null],
  ];
  // Everyday gifts: [item, count, weight].
  const ITEMS = [['rare-candy', 2, 10], ['pp-up', 1, 8], ['bottle-cap', 1, 5], ['ability-capsule', 1, 6], ['ultra-ball', 10, 10],
    ['exp-candy-m', 3, 9], ['max-revive', 2, 8], ['heart-scale', 3, 8], ['big-nugget', 1, 6], ['quick-ball', 5, 8],
    ['dusk-ball', 5, 6], ['pp-max', 1, 4], ['master-ball', 1, 1]];
  const EVENT_EVERY = 4; // every 4th gift is sure to be an event

  // Prize tables by number of matching digits, from the last digit.
  const LOTTERIES = {
    'goldenrod-city': { name: 'Loteria w Radio Tower', host: 'Felicity', prizes: { 1: 'ultra-ball', 2: 'pp-up', 3: 'exp-share', 4: 'max-revive', 5: 'master-ball' } },
    'jubilife-city': { name: 'Loto-ID w Jubilife TV', host: 'Prezenterka Jubilife TV', prizes: { 1: 'ultra-ball', 2: 'pp-up', 3: 'exp-share', 4: 'max-revive', 5: 'master-ball' } },
    'lilycove-city': { name: 'Loteria w Domu Towarowym', host: 'Pani z Lottery Corner', prizes: { 2: 'pp-up', 3: 'exp-share', 4: 'max-revive', 5: 'master-ball' } },
  };

  const today = () => new Date().toDateString();
  const pad = n => String(n).padStart(5, '0');

  const Gifts = PW.Gifts = {
    TICKETS, EVENT_MONS, LOTTERIES, EVENT_EVERY,
    state() { const s = Game().s; return s.gift || (s.gift = { last: '', n: 0, got: {} }); },
    giftReady() { return Gifts.state().last !== today(); },
    eventsLeft() {
      const g = Gifts.state();
      return TICKETS.filter(([k]) => !g.got[k] && !Game().has(k)).length + EVENT_MONS.filter(([k]) => !g.got[k]).length;
    },
    untilEvent() { const n = Gifts.state().n; return EVENT_EVERY - (n % EVENT_EVERY); },

    claim() {
      const g = Gifts.state();
      if (!Gifts.giftReady()) return null;
      g.last = today();
      g.n++;
      const events = TICKETS.filter(([k]) => !g.got[k] && !Game().has(k)).map(t => ({ ticket: t }))
        .concat(EVENT_MONS.filter(([k]) => !g.got[k]).map(m => ({ mon: m })));
      if (events.length && (g.n % EVENT_EVERY === 0 || U.chance(0.2))) {
        const ev = U.pick(events);
        if (ev.ticket) {
          const [k, region] = ev.ticket;
          g.got[k] = 1;
          Game().addItem(I(k), 1, true);
          return { title: '🎁 Tajemniczy Prezent: bilet z wydarzenia!', img: { item: I(k) }, gain: true, choices: [],
            text: 'Doręczyciel przynosi przesyłkę: <b>' + Dex.item(I(k)).n + '</b>! ' + PW.Items.desc(I(k)) +
              (Game().isChampion(region) ? ' Jesteś już Mistrzem regionu ' + PW.World.region(region).name + ', więc możesz ruszać od razu!' : '') };
        }
        const [key, lvl, origin, ot, tid] = ev.mon;
        g.got[key] = 1;
        const pid = Dex.monByKey(key);
        const met = { r: Game().s.region, l: Game().s.loc, lvl: lvl || 1, d: Date.now(), how: 'event' };
        const m = lvl ? Mon.create({ pid, level: lvl, ot: ot || Game().s.player.name, perfectIvs: 3, met, friendship: 70 })
          : Mon.createEgg(pid, { ot: Game().s.player.name, perfectIvs: 3, met });
        m.fateful = true;
        if (tid !== null) m.tid = tid;
        const where = Game().addMon(m);
        return { title: '🎁 Tajemniczy Prezent: mityczny Pokémon!', img: { mon: pid }, gain: true, choices: [],
          text: 'Doręczyciel przynosi ' + (lvl ? '<b>' + Dex.mon(pid).n + '</b> (Lv ' + lvl + ')' : '<b>jajo ' + Dex.mon(pid).n + '</b>') + '! Pochodzenie: ' + origin + '.' +
            (where === 'box' ? ' Trafia do PC.' : '') };
      }
      const [k, n] = U.weighted(ITEMS, x => x[2]);
      Game().addItem(I(k), n);
      return { title: '🎁 Tajemniczy Prezent', img: { item: I(k) }, gain: true, choices: [],
        text: 'Doręczyciel przynosi dzisiejszy prezent: <b>' + Dex.item(I(k)).n + (n > 1 ? ' ×' + n : '') + '</b>. Wróć jutro po kolejny!' +
          (Gifts.eventsLeft() ? ' Za ' + Gifts.untilEvent() + ' ' + U.plural(Gifts.untilEvent(), ['dzień', 'dni', 'dni']) + ' na pewno przyjdzie wydarzenie.' : '') };
    },

    // ---------------------------------------------------------------- lottery
    lotteryNumber() { return U.dayHash('lottery') % 100000; },
    lotteryReady() { const s = Game().s; return !s.lottery || s.lottery.last !== today(); },

    lotteryScene(regionId, loc) {
      const L = LOTTERIES[loc.id];
      const s = Game().s;
      const num = pad(Gifts.lotteryNumber());
      if (!Gifts.lotteryReady()) {
        return { title: L.name, img: { icon: '🎟️' }, choices: [],
          text: 'Dzisiejszy numer to <b>' + num + '</b> i już sprawdzałeś swoje Pokémony. Nowe losowanie jutro!' };
      }
      s.lottery = { last: today() };
      let best = null, digits = 0;
      for (const m of Game().allMons()) {
        if (m.egg || m.tid === undefined) continue;
        const id = pad(m.tid);
        let d = 0;
        while (d < 5 && id[4 - d] === num[4 - d]) d++;
        if (d > digits) { digits = d; best = m; }
      }
      const head = L.host + ': „Dzisiejszy numer to <b>' + num + '</b>! Sprawdzam numery ID twoich Pokémonów, także tych w PC...”<br><br>';
      const prize = L.prizes[digits];
      if (!best || !prize) {
        return { title: L.name, img: { icon: '🎟️' }, choices: [],
          text: head + 'Niestety, żaden numer się nie zgadza' + (digits ? ' (pasuje tylko ' + digits + ' ' + U.plural(digits, ['cyfra', 'cyfry', 'cyfr']) + ' od końca)' : '') +
            '. Pokémony od innych trenerów mają inne numery ID, więc wymiany zwiększają szanse. Wróć jutro!' };
      }
      // Exp. Share is a key item every trainer already has here, so that prize is swapped for a PP Max.
      const k = prize === 'exp-share' && Game().has('exp-share') ? 'pp-max' : prize;
      Game().addItem(I(k), 1);
      return { title: L.name + ' – wygrana!', img: { item: I(k) }, gain: true, choices: [],
        text: head + Mon.name(best) + ' (ID ' + pad(best.tid) + ') ma ' + digits + ' ' + U.plural(digits, ['zgodną cyfrę', 'zgodne cyfry', 'zgodnych cyfr']) + ' od końca! Nagroda: <b>' + Dex.item(I(k)).n + '</b>.' +
          (k !== prize ? ' (W grach nagrodą jest Exp. Share, ale już go masz.)' : '') };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
