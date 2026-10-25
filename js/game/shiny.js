/* Shiny hunting: full odds 1/4096 with extra rolls from the Shiny Charm (+2), Mass Outbreaks (+2),
   Pokédex research (+1/+3), chain fishing (+2 per hook in a row, up to 20 hooks, as in X/Y) and the
   Masuda Method (+5 for parents from games in different languages). The Poké Radar uses its own chain
   odds from Diamond/Pearl/Platinum: about 1/8000 per patch at the start, 1/200 at a chain of 40. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const Game = () => PW.Game;
  const W = () => PW.World;
  const ODDS = 4096;

  // Game languages a foreign Pokémon can come from, with typical trainer names.
  const LANGS = {
    JPN: ['japoński', ['Takeshi', 'Yuki', 'Haruka', 'Kenji', 'Sakura']],
    FRE: ['francuski', ['Pierre', 'Camille', 'Louis', 'Chloé']],
    GER: ['niemiecki', ['Lukas', 'Anna', 'Felix', 'Lena']],
    ITA: ['włoski', ['Marco', 'Giulia', 'Luca', 'Sofia']],
    SPA: ['hiszpański', ['Alejandro', 'Lucía', 'Pablo', 'Carmen']],
    KOR: ['koreański', ['Minjun', 'Seoyeon', 'Jiho', 'Hana']],
    CHS: ['chiński', ['Wei', 'Mei', 'Jun', 'Xiu']],
  };
  const HOME_LANG = 'ENG';
  // Places where a Poké Radar works: tall grass, not caves, water or towns.
  const RADAR_KINDS = ['route', 'forest', 'meadow', 'wild', 'marsh', 'island', 'beach', 'mountain', 'desert', 'snow'];

  const Shiny = PW.Shiny = {
    LANGS, HOME_LANG,
    state() { const s = Game().s; return s.hunt || (s.hunt = { radar: null, fish: null }); },
    chance(rolls) { return 1 - Math.pow(1 - 1 / ODDS, rolls); },
    oddsText(p) { return '1/' + Math.max(1, Math.round(1 / p)).toLocaleString('pl-PL'); },
    lang(m) { return m.lang || HOME_LANG; },
    langName(code) { return code === HOME_LANG ? 'angielski (twoja gra)' : (LANGS[code] || [code])[0]; },

    // Full-odds rolls for a species before method bonuses.
    baseRolls(pid) {
      const sid = Dex.mon(pid) ? Dex.mon(pid).s : 0;
      return 1 + (Game().has('shiny-charm') ? 2 : 0) + PW.Research.shinyRolls(sid);
    },

    // Chain state belongs to one place; anything else (another place, other actions) breaks it.
    key(regionId, loc) { return regionId + '/' + loc.id; },
    breakChains(except) {
      const st = Shiny.state();
      if (except !== 'radar') st.radar = null;
      if (except !== 'fish') st.fish = null;
    },

    // ---------------------------------------------------------------- Poké Radar
    radarChance(chain) { const c = Math.min(40, chain); return Math.ceil(65535 / (8200 - 200 * c)) / 65536; },
    // The radar's patch roll comes on top of the normal rolls, so a short chain is never worse than walking.
    radarTotal(pid, chain) { return 1 - (1 - Shiny.radarChance(chain)) * (1 - Shiny.chance(Shiny.baseRolls(pid))); },
    radarOK(loc) { return Game().has('poke-radar') && !!(loc.w && loc.w.walk && loc.w.walk.length) && RADAR_KINDS.includes(loc.k); },

    radarScene(regionId, loc, scene, wildScene) {
      const st = Shiny.state();
      const k = Shiny.key(regionId, loc);
      if (st.radar && st.radar.loc !== k) st.radar = null;
      const chain = st.radar;
      // The radar reveals Pokémon that only appear with it on (Diamond/Pearl/Platinum tables).
      const ctx = Object.assign(W().context(regionId, loc), { radar: true });
      const tbl = W().table(regionId, loc, 'walk', ctx);
      if (!tbl.length) return scene({ title: 'Poké Radar', text: 'Trawa ani drgnie.', img: { item: Dex.itemByKey('poke-radar') } });
      // While chaining, most shaking patches hold the same species again.
      const entryOf = pid => tbl.find(e => e.pid === pid);
      let e = chain && entryOf(chain.pid) && U.chance(Math.min(0.95, 0.82 + chain.n * 0.003)) ? entryOf(chain.pid) : U.weighted(tbl, x => x.w);
      const level = U.int(e.lo, Math.max(e.lo, e.hi));
      const name = Dex.mon(e.pid).n;
      const start = (shiny, prelude) => {
        const sc = wildScene(regionId, loc, 'walk', {
          pick: { pid: e.pid, level }, force: true, shiny: shiny || undefined, tag: 'radar',
          onEnd(res) {
            const cur = Shiny.state();
            if (res === 'win' || res === 'caught') {
              const same = cur.radar && cur.radar.pid === e.pid && cur.radar.loc === k;
              cur.radar = { loc: k, pid: e.pid, n: same ? cur.radar.n + 1 : 1 };
              const n = cur.radar.n;
              cur.best = Math.max(cur.best || 0, n);
              PW.Quests.checkAch();
              if (n === 1 || n % 5 === 0 || n === 40) {
                return scene({ title: '📡 Łańcuch Poké Radaru: ' + name + ' ×' + n, img: { mon: e.pid },
                  text: 'Szansa, że następna trzęsąca się trawa będzie błyszczeć: ' + Shiny.oddsText(Shiny.radarTotal(e.pid, n)) + (n >= 40 ? ' (maksimum).' : '.') +
                    ' Łańcuch przerwie ucieczka, przegrana, walka z innym gatunkiem albo zwykłe szukanie w trawie.' });
              }
              return null;
            }
            const lost = cur.radar && cur.radar.n;
            cur.radar = null;
            return lost ? scene({ title: 'Łańcuch przerwany', text: 'Łańcuch Poké Radaru (' + name + ' ×' + lost + ') się urwał.', img: { item: Dex.itemByKey('poke-radar') } }) : null;
          },
        });
        sc.prelude = prelude;
        return sc;
      };
      if (chain && e.pid !== chain.pid) {
        return scene({ title: '📡 Poké Radar', img: { mon: e.pid },
          text: 'W tej trawie jest inny Pokémon: ' + name + ' (Lv ' + level + '). Walka z nim przerwie łańcuch ' + Dex.mon(chain.pid).n + ' ×' + chain.n + '.',
          choices: [
            { label: '🔍 Szukaj dalej (łańcuch zostaje)', cls: 'primary', run: () => null },
            { label: '⚔️ Walcz i przerwij łańcuch', run: () => { Shiny.state().radar = null; return start(false, 'Z trawy wyskakuje ' + name + '!'); } },
          ] });
      }
      const shiny = !!chain && U.chance(Shiny.radarChance(chain.n));
      return start(shiny, shiny ? '✨ Trawa błyszczy! ✨' : chain ? 'Trawa znowu się trzęsie... To ' + name + '! (łańcuch ' + chain.n + ')' : 'Poké Radar wykrywa drgającą trawę... To ' + name + '!');
    },

    // ---------------------------------------------------------------- chain fishing
    // Returns extra rolls for this hook and counts it; a cast with no bite resets the chain.
    fishHook(regionId, loc) {
      const st = Shiny.state();
      const k = Shiny.key(regionId, loc);
      if (!st.fish || st.fish.loc !== k) st.fish = { loc: k, n: 0 };
      const rolls = 2 * Math.min(20, st.fish.n);
      st.fish.n++;
      return rolls;
    },
    fishMiss() { const st = Shiny.state(); const lost = st.fish ? st.fish.n : 0; st.fish = null; return lost; },

    // ---------------------------------------------------------------- Masuda Method
    masudaRolls(a, b) { return Shiny.lang(a) !== Shiny.lang(b) ? 5 : 0; },

    // A tourist from abroad offers a Pokémon from a game in another language (often a Ditto, the
    // classic Masuda Method partner) for one of yours.
    touristScene(regionId, scene) {
      const code = U.pick(Object.keys(LANGS));
      const [langPL, names] = LANGS[code];
      const ot = U.pick(names);
      const lvl = U.clamp(W().progressLevel(regionId) - U.int(3, 8), 5, 100);
      let pid = Dex.monByKey('ditto');
      if (U.chance(0.35)) {
        const dex = (Dex.data.core.dex[W().region(regionId).dex] || []).filter(sid => !Dex.species(sid).leg && !Dex.species(sid).myth && !Dex.species(sid).baby);
        pid = W().stageForLevel(Dex.defaultForm(U.pick(dex)), lvl, regionId);
      }
      const offer = Game().s.party.filter(m => !m.egg);
      return scene({
        title: 'Turysta z zagranicy', img: { mon: pid },
        text: ot + ' przyjechał z wizytą. Jego ' + Dex.mon(pid).n + ' (Lv ' + lvl + ') pochodzi z gry w języku: ' + langName(code) +
          '. Chętnie wymieni go na jednego z twoich Pokémonów. Pokémon z gry w innym języku to partner do metody Masudy w hodowli (szansa na shiny ×6).',
        choices: offer.map(m => ({ label: 'Oddaj: ' + Mon.name(m) + ' (Lv ' + m.lvl + ')', run: () => {
          if (Game().s.party.filter(x => !x.egg).length <= 1) return scene({ title: 'Wymiana', text: 'Nie możesz oddać ostatniego Pokémona.' });
          Game().s.party.splice(Game().s.party.indexOf(m), 1);
          const got = Mon.create({ pid, level: lvl, ot });
          got.lang = code;
          got.tid = U.int(0, 65535);
          got.traded = true;
          got.met = { r: regionId, l: Game().s.loc, lvl, d: Date.now(), how: 'trade' };
          Game().addMon(got);
          const evo = PW.Flow.tradeEvolution(got);
          return scene({ title: 'Wymiana udana!', img: { mon: got.pid }, gain: true,
            text: 'Wysyłasz ' + Mon.name(m) + ' i otrzymujesz ' + Mon.name(got) + ' (' + langName(code) + ')!' + (evo ? ' ' + evo : '') });
        } })).concat([{ label: 'Nie, dziękuję', run: () => null }]),
      });
    },

    // Lines for the location screen: what the hunt looks like right here.
    summary(regionId, loc) {
      const st = Shiny.state();
      const k = Shiny.key(regionId, loc);
      const base = Shiny.chance(1 + (Game().has('shiny-charm') ? 2 : 0));
      const lines = ['Dzikie Pokémony: ' + Shiny.oddsText(base) + (Game().has('shiny-charm') ? ' (z Shiny Charm)' : '')];
      const s = Game().s;
      if (s.swarm && s.swarm.left > 0 && s.swarm.loc === loc.id) lines.push('🐝 Wysyp ' + Dex.mon(s.swarm.pid).n + ': ' + Shiny.oddsText(Shiny.chance(3 + (Game().has('shiny-charm') ? 2 : 0))));
      if (st.radar && st.radar.loc === k) lines.push('📡 Łańcuch ' + Dex.mon(st.radar.pid).n + ' ×' + st.radar.n + ': ' + Shiny.oddsText(Shiny.radarTotal(st.radar.pid, st.radar.n)) + ' na trzęsącą się trawę');
      if (st.fish && st.fish.loc === k && st.fish.n) {
        lines.push('🎣 Łańcuch wędkowania ×' + st.fish.n + ': ' + Shiny.oddsText(Shiny.chance(1 + (Game().has('shiny-charm') ? 2 : 0) + 2 * Math.min(20, st.fish.n))));
      }
      return lines;
    },
  };
  function langName(code) { return Shiny.langName(code); }
})(typeof window !== 'undefined' ? window : globalThis);
