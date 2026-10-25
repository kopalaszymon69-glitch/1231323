/* Item rules: bag pockets, medicine, vitamins, candies, mints and shop inventories. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;

  const POCKETS = [
    ['medicine', 'Leki'], ['balls', 'Poké Balle'], ['battle', 'Walka'], ['berries', 'Jagody'],
    ['held', 'Trzymane'], ['evo', 'Ewolucja i skarby'], ['other', 'Inne'], ['tm', 'TM'], ['key', 'Kluczowe'],
  ];
  const CAT_POCKET = {
    27: 'medicine', 28: 'medicine', 29: 'medicine', 30: 'medicine', 26: 'medicine',
    33: 'balls', 34: 'balls', 39: 'balls', 1: 'battle', 38: 'battle',
    3: 'berries', 4: 'berries', 5: 'berries', 6: 'berries', 7: 'berries',
    12: 'held', 13: 'held', 14: 'held', 15: 'held', 16: 'held', 17: 'held', 18: 'held', 19: 'held', 36: 'held', 42: 'held',
    44: 'held', 46: 'held', 10: 'evo', 9: 'evo', 35: 'evo', 24: 'other', 11: 'other', 48: 'other', 50: 'medicine', 52: 'other',
  };
  const KEY_ITEMS = ['old-rod', 'good-rod', 'super-rod', 'exp-share', 'shiny-charm', 'oval-charm', 'mega-ring', 'z-ring',
    'dynamax-band', 'dowsing-machine', 'poke-radar', 'bicycle', 'town-map', 'catching-charm', 'exp-charm', 'tera-orb',
    'silph-scope', 'poke-flute', 'devon-scope', 'red-orb', 'blue-orb', 'jade-orb', 'dna-splicers', 'reveal-glass',
    'prison-bottle', 'zygarde-cube', 'n-solarizer', 'n-lunarizer', 'reins-of-unity', 'rotom-catalog', 'gracidea',
    'secret-key', 'ss-ticket', 'card-key', 'lift-key', 'tidal-bell', 'clear-bell', 'rainbow-wing', 'silver-wing',
    'magma-stone', 'meteorite', 'azure-flute', 'linking-cord'];

  const HEAL = {
    potion: 20, 'super-potion': 60, 'hyper-potion': 120, 'max-potion': 9999, 'full-restore': 9999, 'fresh-water': 30,
    'soda-pop': 50, lemonade: 70, 'moomoo-milk': 100, 'energy-powder': 60, 'energy-root': 120, 'sweet-heart': 20,
    'berry-juice': 20, 'oran-berry': 10,
  };
  const CURES = {
    antidote: ['psn', 'tox'], 'burn-heal': ['brn'], 'ice-heal': ['frz'], awakening: ['slp'], 'paralyze-heal': ['par'],
    'full-heal': 'all', 'heal-powder': 'all', 'lava-cookie': 'all', 'old-gateau': 'all', casteliacone: 'all',
    'lumiose-galette': 'all', 'shalour-sable': 'all', 'big-malasada': 'all', 'pewter-crunchies': 'all', 'rage-candy-bar': 'all',
    'full-restore': 'all', 'cheri-berry': ['par'], 'chesto-berry': ['slp'], 'pecha-berry': ['psn', 'tox'], 'rawst-berry': ['brn'],
    'aspear-berry': ['frz'], 'lum-berry': 'all',
  };
  const VITAMINS = { 'hp-up': 0, protein: 1, iron: 2, calcium: 3, zinc: 4, carbos: 5 };
  const FEATHERS = { 'health-feather': 0, 'muscle-feather': 1, 'resist-feather': 2, 'genius-feather': 3, 'clever-feather': 4, 'swift-feather': 5 };
  const EV_BERRIES = { 'pomeg-berry': 0, 'kelpsy-berry': 1, 'qualot-berry': 2, 'hondew-berry': 3, 'grepa-berry': 4, 'tamato-berry': 5 };
  const EXP_CANDY = { 'exp-candy-xs': 100, 'exp-candy-s': 800, 'exp-candy-m': 3000, 'exp-candy-l': 10000, 'exp-candy-xl': 30000 };
  const X_ITEMS = { 'x-attack': 1, 'x-defense': 2, 'x-sp-atk': 3, 'x-sp-def': 4, 'x-speed': 5, 'x-accuracy': 6 };
  const REPELS = { repel: 15, 'super-repel': 25, 'max-repel': 40 };
  const LURES = { lure: 15, 'super-lure': 25, 'max-lure': 40 };

  // Polish summaries for the most common items (others show the English game text).
  const DESC_PL = {
    'poke-ball': 'Podstawowy Poké Ball do łapania dzikich Pokémonów.',
    'great-ball': 'Lepszy Poké Ball (×1.5) – wyższa skuteczność.',
    'ultra-ball': 'Bardzo skuteczny Poké Ball (×2).',
    'master-ball': 'Łapie każdego dzikiego Pokémona bez pudła.',
    'net-ball': 'Skuteczny (×3.5) na Pokémony typu Wodnego i Robaczego.',
    'dive-ball': 'Skuteczny (×3.5) podczas surfowania i łowienia.',
    'nest-ball': 'Tym skuteczniejszy, im niższy poziom dzikiego Pokémona.',
    'repeat-ball': 'Skuteczny (×3.5) na gatunki, które już złapałeś.',
    'timer-ball': 'Skuteczność rośnie z każdą turą walki (do ×4).',
    'quick-ball': 'Bardzo skuteczny (×5) w pierwszej turze walki.',
    'dusk-ball': 'Skuteczny (×3) w nocy i w jaskiniach.',
    'heal-ball': 'Złapany Pokémon jest od razu wyleczony.',
    'luxury-ball': 'Złapany Pokémon szybciej się do ciebie przywiązuje.',
    'premier-ball': 'Pamiątkowy Poké Ball (×1).',
    'beast-ball': 'Stworzony do łapania Ultra Bestii (×5), na inne słaby (×0.1).',
    potion: 'Przywraca 20 HP.', 'super-potion': 'Przywraca 60 HP.', 'hyper-potion': 'Przywraca 120 HP.',
    'max-potion': 'Przywraca całe HP.', 'full-restore': 'Przywraca całe HP i leczy wszystkie dolegliwości.',
    revive: 'Ożywia omdlałego Pokémona z połową HP.', 'max-revive': 'Ożywia omdlałego Pokémona z pełnym HP.',
    antidote: 'Leczy zatrucie.', 'burn-heal': 'Leczy poparzenie.', 'ice-heal': 'Leczy zamrożenie.', awakening: 'Budzi śpiącego Pokémona.',
    'paralyze-heal': 'Leczy paraliż.', 'full-heal': 'Leczy wszystkie dolegliwości statusowe.',
    ether: 'Przywraca 10 PP jednego ruchu.', 'max-ether': 'Przywraca wszystkie PP jednego ruchu.',
    elixir: 'Przywraca 10 PP wszystkich ruchów.', 'max-elixir': 'Przywraca wszystkie PP wszystkich ruchów.',
    'rare-candy': 'Podnosi poziom Pokémona o 1.', 'pp-up': 'Zwiększa maksymalne PP ruchu.', 'pp-max': 'Maksymalizuje PP ruchu.',
    repel: 'Odstrasza słabe dzikie Pokémony przez 15 wypraw.', 'super-repel': 'Odstrasza słabe dzikie Pokémony przez 25 wypraw.',
    'max-repel': 'Odstrasza słabe dzikie Pokémony przez 40 wypraw.', 'escape-rope': 'Natychmiast wraca do ostatniego Centrum Pokémon.',
    'fire-stone': 'Kamień ewolucji niektórych Pokémonów.', 'water-stone': 'Kamień ewolucji niektórych Pokémonów.',
    'thunder-stone': 'Kamień ewolucji niektórych Pokémonów.', 'leaf-stone': 'Kamień ewolucji niektórych Pokémonów.',
    'moon-stone': 'Kamień ewolucji niektórych Pokémonów.', 'sun-stone': 'Kamień ewolucji niektórych Pokémonów.',
    'linking-cord': 'Wywołuje ewolucję, która normalnie wymaga wymiany (jak w Legends: Arceus).',
    'exp-share': 'Cała drużyna otrzymuje doświadczenie z walk.', 'lucky-egg': 'Trzymający dostaje 50% więcej doświadczenia.',
    leftovers: 'Co turę przywraca 1/16 HP.', 'oran-berry': 'Przywraca 10 HP przy połowie HP.', 'sitrus-berry': 'Przywraca 1/4 HP przy połowie HP.',
    'lum-berry': 'Leczy każdą dolegliwość statusową.', 'old-rod': 'Wędka – łów Pokémony w wodzie.', 'good-rod': 'Lepsza wędka.', 'super-rod': 'Najlepsza wędka.',
    'x-attack': 'W walce: Atak +2 poziomy.', 'x-defense': 'W walce: Obrona +2 poziomy.', 'x-sp-atk': 'W walce: Sp. Atak +2 poziomy.',
    'x-sp-def': 'W walce: Sp. Obrona +2 poziomy.', 'x-speed': 'W walce: Szybkość +2 poziomy.', 'x-accuracy': 'W walce: Celność +2 poziomy.',
    'dire-hit': 'W walce: znacznie zwiększa szansę na trafienie krytyczne.', 'guard-spec': 'Przez 5 tur chroni drużynę przed spadkiem statystyk.',
    'fresh-water': 'Przywraca 30 HP.', 'soda-pop': 'Przywraca 50 HP.', lemonade: 'Przywraca 70 HP.', 'moomoo-milk': 'Przywraca 100 HP.',
    'energy-powder': 'Przywraca 60 HP (gorzki – Pokémon trochę cię mniej lubi).', 'energy-root': 'Przywraca 120 HP (bardzo gorzki).',
    'heal-powder': 'Leczy dolegliwości (gorzki).', 'revival-herb': 'Ożywia z pełnym HP (bardzo gorzki).', 'sacred-ash': 'Ożywia wszystkie omdlałe Pokémony.',
    'hp-up': '+10 EV HP.', protein: '+10 EV Ataku.', iron: '+10 EV Obrony.', calcium: '+10 EV Sp. Ataku.', zinc: '+10 EV Sp. Obrony.', carbos: '+10 EV Szybkości.',
    'exp-candy-xs': 'Daje 100 pkt doświadczenia.', 'exp-candy-s': 'Daje 800 pkt doświadczenia.', 'exp-candy-m': 'Daje 3000 pkt doświadczenia.',
    'exp-candy-l': 'Daje 10 000 pkt doświadczenia.', 'exp-candy-xl': 'Daje 30 000 pkt doświadczenia.',
    'ability-capsule': 'Zamienia zdolność na drugą zwykłą zdolność gatunku.', 'ability-patch': 'Daje Pokémonowi ukrytą zdolność.',
    'bottle-cap': 'Hyper Training: jedna statystyka jak przy IV 31 (od Lv 50).', 'gold-bottle-cap': 'Hyper Training wszystkich statystyk (od Lv 50).',
    'heart-scale': 'Przypominacz Ruchów przypomni za nią zapomniany ruch.', nugget: 'Cenny samorodek – sprzedaj za ₽5000.', 'big-nugget': 'Sprzedaj za ₽20 000.',
    pearl: 'Sprzedaj za ₽1000.', 'big-pearl': 'Sprzedaj za ₽4000.', stardust: 'Sprzedaj za ₽1500.', 'star-piece': 'Sprzedaj za ₽6000.',
    'tiny-mushroom': 'Sprzedaj za ₽250.', 'big-mushroom': 'Sprzedaj za ₽2500.', 'honey': 'Rozsmaruj na drzewie lub w trawie – przyciąga dzikiego Pokémona.',
    lure: 'Przez 15 wypraw częściej spotykasz dzikie Pokémony.', 'super-lure': 'Przez 25 wypraw częściej spotykasz dzikie Pokémony.', 'max-lure': 'Przez 40 wypraw częściej spotykasz dzikie Pokémony.',
    'ice-stone': 'Kamień ewolucji niektórych Pokémonów.', 'shiny-stone': 'Kamień ewolucji niektórych Pokémonów.', 'dusk-stone': 'Kamień ewolucji niektórych Pokémonów.',
    'dawn-stone': 'Kamień ewolucji niektórych Pokémonów.', everstone: 'Powstrzymuje ewolucję. Przy hodowli przekazuje naturę.',
    'destiny-knot': 'Przy hodowli przekazuje 5 IV rodziców.', 'amulet-coin': 'Podwaja nagrody pieniężne za walki z trenerami.', 'soothe-bell': 'Przyjaźń rośnie szybciej.',
    'choice-band': 'Atak ×1.5, ale tylko jeden ruch.', 'choice-specs': 'Sp. Atak ×1.5, ale tylko jeden ruch.', 'choice-scarf': 'Szybkość ×1.5, ale tylko jeden ruch.',
    'life-orb': 'Ataki silniejsze o 30%, ale każdy kosztuje 10% HP.', 'focus-sash': 'Przy pełnym HP przetrwa każdy cios z 1 HP.', 'assault-vest': 'Sp. Obrona ×1.5, tylko ruchy ofensywne.',
    'expert-belt': 'Super skuteczne ruchy +20%.', 'rocky-helmet': 'Atakujący kontaktem traci 1/6 HP.', eviolite: 'Obrona i Sp. Obrona ×1.5, jeśli Pokémon może jeszcze ewoluować.',
    'weakness-policy': 'Po super skutecznym trafieniu: Atak i Sp. Atak +2.', 'black-sludge': 'Trujące Pokémony odzyskują 1/16 HP co turę, inne tracą 1/8.',
    'quick-claw': 'Czasem pozwala ruszyć się pierwszym.', 'kings-rock': '10% szans na wzdrygnięcie celu; potrzebny do niektórych ewolucji.',
    'scope-lens': 'Zwiększa szansę na krytyka.', 'shell-bell': 'Odzyskuje 1/8 zadanych obrażeń.', 'light-clay': 'Ekrany działają 8 tur.',
    'mega-ring': 'Pozwala Mega Ewoluować Pokémona trzymającego Mega Kamień (raz na walkę).', 'z-ring': 'Pozwala użyć Z-Move z kryształem Z (raz na walkę).',
    'dynamax-band': 'Pozwala Dynamaxować w Galarze (sale, Liga, rajdy).', 'tera-orb': 'Pozwala Terastalizować (raz, ładuje się w Centrum Pokémon).',
    'shiny-charm': 'Zwiększa szansę na błyszczące Pokémony (×3).', 'oval-charm': 'Jaja w Hodowli pojawiają się częściej.', 'catching-charm': 'Częstsze krytyczne rzuty.',
    'exp-charm': 'Pamiątka zwycięstwa w Lidze.', 'dowsing-machine': 'Pomaga znajdować ukryte przedmioty.', 'poke-radar': 'Odkrywa Pokémony ukryte w trawie (Sinnoh).',
    'gimmighoul-coin': 'Moneta Gimmighoula. 999 monet sprawi, że Gimmighoul ewoluuje.',
  };

  function pocketOf(id) {
    if (typeof id === 'string' && id.startsWith('tm')) return 'tm';
    const it = Dex.item(id);
    if (!it) return 'other';
    if (KEY_ITEMS.includes(it.k)) return 'key';
    if (it.k.endsWith('-mint')) return 'medicine';
    if (EXP_CANDY[it.k] || ['rare-candy', 'pp-up', 'pp-max', 'ability-capsule', 'ability-patch', 'bottle-cap', 'gold-bottle-cap'].includes(it.k)) return 'medicine';
    if (FEATHERS[it.k] !== undefined) return 'medicine';
    if (it.k.endsWith('-sweet') || ['sweet-apple', 'tart-apple', 'syrupy-apple', 'cracked-pot', 'chipped-pot', 'masterpiece-teacup',
      'unremarkable-teacup', 'galarica-cuff', 'galarica-wreath', 'auspicious-armor', 'malicious-armor', 'leaders-crest', 'metal-alloy',
      'peat-block', 'black-augurite', 'gimmighoul-coin'].includes(it.k)) return 'evo';
    return CAT_POCKET[it.c] || 'other';
  }

  const Items = PW.Items = {
    POCKETS, KEY_ITEMS, HEAL, CURES, VITAMINS, EXP_CANDY, X_ITEMS, REPELS, LURES,
    pocketOf,
    name(id) {
      if (typeof id === 'string' && id.startsWith('tm')) { const mv = Dex.move(+id.slice(2)); return 'TM ' + (mv ? mv.n : '?'); }
      const it = Dex.item(id); return it ? it.n : '?';
    },
    desc(id) {
      if (typeof id === 'string' && id.startsWith('tm')) {
        const mv = Dex.move(+id.slice(2));
        return mv ? 'Uczy ruchu ' + mv.n + '. ' + (mv.d || '') : '';
      }
      const it = Dex.item(id);
      if (!it) return '';
      return DESC_PL[it.k] || it.d || '';
    },
    key(id) { const it = Dex.item(id); return it ? it.k : ''; },
    price(id) {
      if (typeof id === 'string' && id.startsWith('tm')) return Items.tmPrice(+id.slice(2));
      const it = Dex.item(id); return it ? it.p : 0;
    },
    tmPrice(mid) {
      const mv = Dex.move(mid);
      if (!mv) return 0;
      if (mv.c === 0) return 10000;
      return mv.p >= 100 ? 30000 : mv.p >= 80 ? 20000 : 10000;
    },
    sellPrice(id) {
      const it = Dex.item(id);
      if (!it) return 0;
      return Math.floor(it.p / 2);
    },
    isBall(id) { const it = Dex.item(id); return !!it && [33, 34, 39].includes(it.c); },
    isMedicine(id) { return pocketOf(id) === 'medicine' || ['berries'].includes(pocketOf(id)) && (HEAL[Items.key(id)] || CURES[Items.key(id)] || EV_BERRIES[Items.key(id)] !== undefined || Items.key(id) === 'leppa-berry' || Items.key(id) === 'sitrus-berry'); },
    usableInBattle(id) {
      const k = Items.key(id);
      return !!(HEAL[k] || CURES[k] || X_ITEMS[k] || ['revive', 'max-revive', 'revival-herb', 'ether', 'max-ether', 'elixir', 'max-elixir',
        'dire-hit', 'guard-spec', 'sitrus-berry', 'leppa-berry', 'poke-doll', 'fluffy-tail', 'poke-toy'].includes(k)) || Items.isBall(id);
    },
    canHold(id) {
      const p = pocketOf(id);
      return ['held', 'berries', 'evo', 'medicine', 'battle', 'balls', 'other'].includes(p) && !KEY_ITEMS.includes(Items.key(id));
    },
    // Whether the item targets a specific move slot.
    needsMove(id) { return ['ether', 'max-ether', 'pp-up', 'pp-max', 'leppa-berry'].includes(Items.key(id)); },

    // Applies a medicine-like item to a Pokémon. ctx: {battle, battler, moveIndex}. Returns {ok, text, events}.
    applyMedicine(mon, id, ctx) {
      ctx = ctx || {};
      const k = Items.key(id);
      const name = Mon.name(mon);
      const max = ctx.battler ? ctx.battler.maxHp : Mon.maxHp(mon);
      const fail = { ok: false, text: 'To nie przyniesie żadnego efektu.' };
      if (mon.egg) return fail;
      if (['revive', 'max-revive', 'revival-herb'].includes(k)) {
        if (mon.hp > 0) return fail;
        mon.hp = k === 'revive' ? Math.floor(max / 2) : max;
        if (k === 'revival-herb') Mon.addFriendship(mon, -10);
        return { ok: true, text: name + ' odzyskuje przytomność!' };
      }
      if (k === 'sacred-ash' && ctx.party) {
        let any = false;
        for (const m of ctx.party) if (m.hp <= 0 && !m.egg) { m.hp = Mon.maxHp(m); any = true; }
        return any ? { ok: true, text: 'Wszystkie omdlałe Pokémony odzyskują siły!' } : fail;
      }
      if (mon.hp <= 0 && !EXP_CANDY[k] && k !== 'rare-candy' && VITAMINS[k] === undefined && !k.endsWith('-mint')) return fail;
      let done = false;
      const texts = [];
      if (HEAL[k] !== undefined) {
        if (mon.hp < max) {
          let amt = HEAL[k];
          if (k === 'sitrus-berry') amt = Math.floor(max / 4);
          const before = mon.hp;
          mon.hp = Math.min(max, mon.hp + amt);
          texts.push(name + ' odzyskuje ' + (mon.hp - before) + ' HP.');
          if (['energy-powder', 'energy-root'].includes(k)) Mon.addFriendship(mon, k === 'energy-root' ? -10 : -5);
          done = true;
        }
      }
      if (k === 'sitrus-berry' && !done && mon.hp < max) { const b = mon.hp; mon.hp = Math.min(max, mon.hp + Math.floor(max / 4)); texts.push(name + ' odzyskuje ' + (mon.hp - b) + ' HP.'); done = true; }
      if (CURES[k]) {
        const c = CURES[k];
        const conf = ctx.battler && ctx.battler.v.confusion && (c === 'all' || k === 'persim-berry');
        if (mon.st && (c === 'all' || c.includes(mon.st))) { texts.push(name + ' zostaje uleczony!'); mon.st = null; mon.slp = 0; mon.tox = 0; done = true; }
        if (conf) { ctx.battler.v.confusion = 0; done = true; }
        if (k === 'heal-powder' && done) Mon.addFriendship(mon, -5);
      }
      if (['ether', 'max-ether', 'leppa-berry'].includes(k)) {
        const slot = mon.moves[ctx.moveIndex || 0];
        if (slot && slot.pp < Mon.maxPP(slot)) { slot.pp = k === 'max-ether' ? Mon.maxPP(slot) : Math.min(Mon.maxPP(slot), slot.pp + 10); texts.push('PP ruchu ' + Dex.move(slot.id).n + ' zostaje przywrócone.'); done = true; }
      }
      if (['elixir', 'max-elixir'].includes(k)) {
        for (const slot of mon.moves) if (slot.pp < Mon.maxPP(slot)) { slot.pp = k === 'max-elixir' ? Mon.maxPP(slot) : Math.min(Mon.maxPP(slot), slot.pp + 10); done = true; }
        if (done) texts.push('PP ruchów ' + name + ' zostają przywrócone.');
      }
      if (['pp-up', 'pp-max'].includes(k)) {
        const slot = mon.moves[ctx.moveIndex || 0];
        if (slot && (slot.up || 0) < 3) { slot.up = k === 'pp-max' ? 3 : (slot.up || 0) + 1; slot.pp = Mon.maxPP(slot); texts.push('Maksymalne PP ruchu ' + Dex.move(slot.id).n + ' rośnie!'); done = true; }
      }
      if (X_ITEMS[k] && ctx.battle && ctx.battler) { ctx.battle.boost(ctx.battler, X_ITEMS[k], 2, ctx.battler); done = true; }
      if (k === 'dire-hit' && ctx.battler) { ctx.battler.v.focusEnergy = true; texts.push(name + ' jest gotów do walki!'); done = true; }
      if (k === 'guard-spec' && ctx.battler) { ctx.battler.side.conds.mist = 5; texts.push('Drużyna jest chroniona przez mgłę!'); done = true; }
      if (VITAMINS[k] !== undefined) {
        const i = VITAMINS[k];
        const total = mon.ev.reduce((a, b) => a + b, 0);
        const add = Math.min(10, 252 - mon.ev[i], 510 - total);
        if (add > 0) { mon.ev[i] += add; Mon.addFriendship(mon, mon.fr < 100 ? 5 : mon.fr < 200 ? 3 : 2); texts.push(PW.Dex.STAT_PL[i] + ' ' + name + ' rośnie!'); done = true; }
      }
      if (FEATHERS[k] !== undefined) {
        const i = FEATHERS[k];
        const total = mon.ev.reduce((a, b) => a + b, 0);
        if (mon.ev[i] < 252 && total < 510) { mon.ev[i]++; texts.push(PW.Dex.STAT_PL[i] + ' ' + name + ' nieco rośnie.'); done = true; }
      }
      if (EV_BERRIES[k] !== undefined) {
        const i = EV_BERRIES[k];
        if (mon.ev[i] > 0 || mon.fr < 255) { mon.ev[i] = Math.max(0, mon.ev[i] - 10); Mon.addFriendship(mon, 10); texts.push(name + ' bardziej cię lubi! ' + PW.Dex.STAT_PL[i] + ' maleje.'); done = true; }
      }
      if (k.endsWith('-mint')) {
        const natName = k.replace('-mint', '');
        const idx = PW.Dex.data.core.natures.findIndex(n => n.n.toLowerCase() === natName);
        if (idx >= 0) { mon.mint = idx; done = true; }
        if (done) texts.push('Statystyki ' + name + ' zmieniają się jak przy naturze ' + PW.Dex.nature(mon.mint).n + '.');
      }
      if (k === 'ability-capsule') {
        const p = Dex.mon(mon.pid);
        if (mon.abil < 2 && p.a[1] && p.a[1] !== p.a[0]) { mon.abil = mon.abil === 0 ? 1 : 0; texts.push(name + ' zyskuje zdolność ' + Dex.ability(p.a[mon.abil]).n + '!'); done = true; }
      }
      if (k === 'ability-patch') {
        const p = Dex.mon(mon.pid);
        if (p.a[2] && mon.abil !== 2) { mon.abil = 2; texts.push(name + ' zyskuje ukrytą zdolność ' + Dex.ability(p.a[2]).n + '!'); done = true; }
      }
      if (k === 'bottle-cap' || k === 'gold-bottle-cap') {
        if (mon.lvl < 50) return { ok: false, text: 'Hyper Training wymaga poziomu 50.' };
        mon.ht = mon.ht || [0, 0, 0, 0, 0, 0];
        if (k === 'gold-bottle-cap') { mon.ht = [1, 1, 1, 1, 1, 1]; done = true; }
        else {
          const i = mon.iv.findIndex((v, j) => v < 31 && !mon.ht[j]);
          if (i >= 0) { mon.ht[i] = 1; done = true; texts.push(PW.Dex.STAT_PL[i] + ' ' + name + ' osiąga maksimum!'); }
        }
        if (done && !texts.length) texts.push(name + ' przechodzi Hyper Training!');
      }
      return done ? { ok: true, text: texts.join(' ') } : fail;
    },

    // Shop inventory for a location given the region badge count.
    martStock(badges, dept, regionId, locId) {
      const k = (...keys) => keys.map(x => Dex.itemByKey(x)).filter(Boolean);
      let stock = k('poke-ball', 'potion', 'antidote', 'paralyze-heal', 'awakening', 'burn-heal', 'ice-heal', 'escape-rope');
      if (badges >= 1) stock = stock.concat(k('great-ball', 'super-potion', 'repel', 'x-attack', 'x-defense', 'x-sp-atk', 'x-sp-def', 'x-speed', 'x-accuracy', 'dire-hit', 'guard-spec'));
      if (badges >= 2) stock = stock.concat(k('super-repel'));
      if (badges >= 3) stock = stock.concat(k('hyper-potion', 'full-heal', 'revive'));
      if (badges >= 5) stock = stock.concat(k('ultra-ball', 'max-repel'));
      if (badges >= 6) stock = stock.concat(k('max-potion'));
      if (badges >= 7) stock = stock.concat(k('full-restore'));
      if (dept) {
        stock = stock.concat(k('net-ball', 'nest-ball', 'dive-ball', 'repeat-ball', 'timer-ball', 'quick-ball', 'dusk-ball', 'heal-ball',
          'luxury-ball', 'premier-ball', 'hp-up', 'protein', 'iron', 'calcium', 'zinc', 'carbos', 'fire-stone', 'water-stone',
          'thunder-stone', 'leaf-stone', 'ice-stone', 'linking-cord', 'fresh-water', 'soda-pop', 'lemonade', 'lure', 'super-lure', 'max-lure'));
        if (badges >= 4) stock = stock.concat(k('sun-stone', 'moon-stone', 'shiny-stone', 'dusk-stone', 'dawn-stone', 'everstone',
          'exp-candy-s', 'exp-candy-m', 'ability-capsule', 'adamant-mint', 'modest-mint', 'jolly-mint', 'timid-mint', 'bold-mint', 'impish-mint', 'calm-mint', 'careful-mint'));
        if (badges >= 6) stock = stock.concat(k('choice-band', 'choice-specs', 'choice-scarf', 'life-orb', 'leftovers', 'focus-sash', 'assault-vest', 'expert-belt', 'rocky-helmet', 'eviolite', 'exp-candy-l', 'max-revive'));
      }
      if (locId === 'azalea-town') stock = stock.concat(k('level-ball', 'lure-ball', 'moon-ball', 'friend-ball', 'love-ball', 'heavy-ball', 'fast-ball'));
      if (regionId === 'alola' && badges >= 9) stock = stock.concat(k('beast-ball'));
      if (regionId === 'galar') stock = stock.concat(k('dynamax-candy')).filter(Boolean);
      return [...new Set(stock)].filter(id => Dex.item(id) && Dex.item(id).p > 0);
    },

    // TMs sold in department stores: a slice of the Scarlet/Violet TM list scaled by badges.
    tmStock(badges) {
      const tms = Dex.data.core.tms;
      const n = Math.min(tms.length, 30 + badges * 20);
      return tms.slice(0, n).map(([num, mid]) => 'tm' + mid);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
