/* Story beats tied to places and progress: key items, region gimmicks and NPC services. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const Dex = PW.Dex, Mon = PW.Mon;
  const I = k => Dex.itemByKey(k);
  const Game = () => PW.Game;

  function give(key, n) { const id = I(key); if (id) Game().addItem(id, n || 1, true); return id; }

  const Story = PW.Story = {
    // Region arrival: version choice for Galar, gimmick items.
    onArrive(regionId) {
      const r = Game().reg(regionId);
      const out = [];
      if (!r.flags.arrived) {
        r.flags.arrived = 1;
        if (regionId === 'galar') {
          r.flags.version = Math.random() < 0.5 ? 'sword' : 'shield';
          give('dynamax-band');
          out.push('Profesor Magnolia wręcza ci Dynamax Band! Na stadionach i w Max Raid Dens możesz Dynamaxować Pokémony. (Twoja wersja liderów: ' + (r.flags.version === 'sword' ? 'Sword' : 'Shield') + ')');
        }
        if (regionId === 'paldea') { give('tera-orb'); out.push('W Akademii otrzymujesz Tera Orb – raz na walkę możesz Terastalizować Pokémona (ładuje się w Centrum Pokémon).'); }
        if (regionId === 'alola') { give('z-ring'); out.push('Kahuna Hala wręcza ci Z-Ring wykonany z kamienia Sparkling Stone. Z kryształem Z twój Pokémon wykona Z-Move!'); }
        // Trainers in later regions match the player's strength (like rematches).
        if (Game().anyChampion() && r.scale === null) {
          const reg = PW.World.region(regionId);
          const lo = Math.max(...reg.gyms[0].team.map(t => t.l));
          const hi = Math.max(...reg.champ.team.map(t => t.l));
          const P = Math.min(100, Game().avgTopLevel(3));
          if (P - 10 > lo) r.scale = { from: [lo, hi], to: [Math.round(P - 10), Math.min(100, Math.max(hi, Math.round(P + 12)))] };
          else r.scale = 0;
          if (r.scale) out.push('Trenerzy w regionie ' + reg.name + ' słyszeli o twoich sukcesach – będą walczyć na wyższym poziomie (' + r.scale.to[0] + '–' + r.scale.to[1] + ').');
        }
      }
      return out;
    },

    // Rewards for gym badges beyond the TM: fishing rods and gimmick items.
    onBadge(regionId, count) {
      const reg = PW.World.region(regionId);
      const msgs = [];
      const rods = reg.rods || [0, 0, 0];
      const names = ['old-rod', 'good-rod', 'super-rod'];
      names.forEach((k, i) => {
        if (rods[i] && count >= rods[i] && !Game().has(k)) { give(k); msgs.push('Rybak w mieście daje ci ' + Dex.item(I(k)).n + '!'); }
      });
      if (regionId === 'kalos' && count >= 3 && !Game().has('mega-ring')) {
        give('mega-ring'); give('lucarionite');
        msgs.push('W Wieży Mistrzostwa Gurkinn wręcza ci Mega Ring i Lucarionite! Pokémony trzymające Mega Kamień mogą teraz Mega Ewoluować (raz na walkę).');
      }
      if (count >= 1 && !Game().has('dowsing-machine')) { give('dowsing-machine'); msgs.push('Otrzymujesz Dowsing Machine – łatwiej znajdziesz ukryte przedmioty.'); }
      return msgs;
    },

    onChampion(regionId) {
      const msgs = [];
      if (!Game().has('poke-radar') && regionId === 'sinnoh') { give('poke-radar'); msgs.push('Profesor Rowan daje ci Poké Radar!'); }
      if (!Game().has('exp-charm')) { give('exp-charm'); }
      if (!Game().has('catching-charm')) { give('catching-charm'); msgs.push('Otrzymujesz Catching Charm – rzuty krytyczne zdarzają się częściej.'); }
      if (!Game().has('mega-ring') && Game().anyChampion()) { /* Mega Ring is only from Kalos */ }
      return msgs;
    },

    locationHooks(regionId, loc, out) {
      const r = Game().reg(regionId);
      // Move Reminder at tutor houses (costs a Heart Scale, as in Gen II–VII).
      if (loc.f.includes('tutor')) {
        out.push({ key: 'tutor:' + loc.id, icon: '📝', label: 'Przypominacz Ruchów', desc: 'Za 1 Heart Scale przypomni Pokémonowi zapomniany ruch.', run: () => ({ ui: 'reminder' }) });
      }
      if (loc.f.includes('frontier') || (loc.f.includes('league') && Game().isChampion(regionId))) {
        out.push({ key: 'factory:' + loc.id, icon: '🏭', label: 'Battle Factory', desc: 'Walcz wypożyczonymi Pokémonami. Nagrody: Battle Points.', run: () => ({ ui: 'factory' }) });
      }
      if (loc.id === 'lavender-town' && Game().badges(regionId) >= 4 && !Game().has('poke-flute')) {
        out.push({ key: 'flute', icon: '🎶', label: 'Pan Fuji', desc: 'Starszy pan z Domu Pokémonów chce ci podziękować.', run: () => {
          give('poke-flute');
          return { title: 'Pan Fuji', text: '"Dziękuję, że przegnałeś Team Rocket z Wieży Pokémonów. Weź ten Poké Flute – jego melodia budzi śpiące Pokémony."', img: { item: I('poke-flute') }, gain: true, choices: [] };
        } });
      }
      if (loc.id === 'goldenrod-city' && Game().isChampion(regionId) && !r.flags.radioCard) {
        out.push({ key: 'radio', icon: '📻', label: 'Radio Tower', desc: 'Odbierz rozszerzenie PokéGear.', run: () => {
          r.flags.radioCard = 1; Game().s.flags.radio = 1;
          return { title: 'Radio Tower', text: 'Otrzymujesz rozszerzenie radia! W ustawieniach możesz włączyć "Hoenn Sound" lub "Sinnoh Sound" – na trasach Johto pojawią się Pokémony z tych regionów.', img: { icon: '📻' }, gain: true, choices: [] };
        } });
      }
      if (loc.id === 'mesagoza' && Game().s.party.some(m => !m.egg)) {
        out.push({ key: 'tera-change', icon: '💎', label: 'Zmiana Typu Tera', desc: 'Za 50 Odłamków Tera zmień Typ Tera Pokémona.', run: () => ({ ui: 'tera' }) });
      }
      if (loc.id === 'master-dojo' && Game().s.party.some(m => !m.egg && Dex.mon(m.pid).k === 'kubfu')) {
        out.push({ key: 'towers', icon: '🏯', label: 'Wieże Dwóch Pięści', desc: 'Kubfu może ewoluować w Urshifu po pokonaniu wieży.', run: () => ({
          title: 'Wieże Dwóch Pięści', text: 'Którą wieżę wybierzesz dla Kubfu?', img: { mon: Dex.monByKey('kubfu') },
          choices: [{ label: 'Tower of Darkness (Single Strike)', run: () => PW.Flow.evolveSpecial('tower', 'darkness') },
            { label: 'Tower of Waters (Rapid Strike)', run: () => PW.Flow.evolveSpecial('tower', 'waters') }, { label: 'Wróć', run: () => null }],
        }) });
      }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
