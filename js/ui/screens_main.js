/* Screens: title / new game, current location, region map. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const esc = U.esc;
  const S = PW.Screens;
  const UI = PW.UI;

  const AVATARS = [['red', 'M'], ['leaf-gen3', 'F'], ['ethan', 'M'], ['lyra', 'F'], ['kris', 'F'], ['brendan', 'M'], ['may', 'F'], ['lucas', 'M'], ['dawn', 'F'],
    ['hilbert', 'M'], ['hilda', 'F'], ['nate', 'M'], ['rosa', 'F'], ['calem', 'M'], ['serena', 'F'], ['elio', 'M'], ['selene', 'F'],
    ['victor', 'M'], ['gloria', 'F'], ['chase', 'M'], ['elaine', 'F']];

  // ====================================================================== TITLE
  S.title = {
    render() {
      const el = UI.el;
      const hasSave = PW.Game.hasSave();
      const mons = U.shuffle([1, 4, 7, 25, 133, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501, 650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912]).slice(0, 3);
      el.innerHTML = `<div class="title-screen"><div class="title-box">
        <h1 class="title-logo">POKÉ<br>WĘDRÓWKA</h1>
        <div class="title-sub">Gra Pokémon dla jednego gracza w przeglądarce · 9 regionów · 1025 Pokémonów · prawdziwe dane z gier</div>
        <div class="title-mons">${mons.map(id => UI.monImg(id, { anim: true })).join('')}</div>
        <div class="card col" style="max-width:420px;margin:0 auto">
          ${hasSave ? '<button class="btn primary lg block" id="t-cont">▶ Kontynuuj</button>' : ''}
          <button class="btn ${hasSave ? '' : 'primary'} lg block" id="t-new">✨ Nowa gra</button>
          <button class="btn block" id="t-import">📂 Wczytaj zapis z pliku</button>
          <input type="file" id="t-file" accept=".json,application/json" class="hidden">
        </div>
        <p class="tiny muted" style="margin-top:20px">Pokémon i nazwy postaci są własnością Nintendo / Creatures / GAME FREAK. Fanowski projekt niekomercyjny.<br>Dane: PokeAPI, Serebii (Paldea). Grafiki ładowane z PokeAPI Sprites i Pokémon Showdown.</p>
      </div></div>`;
      if (hasSave) el.querySelector('#t-cont').onclick = () => { if (PW.Game.load()) UI.startGame(); };
      el.querySelector('#t-new').onclick = async () => {
        if (hasSave && !(await UI.confirm('Nowa gra', 'Rozpoczęcie nowej gry nadpisze obecny zapis. Kontynuować?', 'Nowa gra'))) return;
        S.title.wizard();
      };
      const file = el.querySelector('#t-file');
      el.querySelector('#t-import').onclick = () => file.click();
      file.onchange = () => {
        const f = file.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => { try { PW.Game.importSave(r.result); UI.startGame(); } catch (e) { UI.alert('Błąd', 'Nie udało się wczytać zapisu: ' + esc(e.message)); } };
        r.readAsText(f);
      };
    },

    wizard() {
      const st = { step: 0, name: '', avatar: 'red', gender: 'M', region: 'kanto', starter: null };
      const el = UI.el;
      const draw = () => {
        const dots = `<div class="step-dots">${[0, 1, 2].map(i => `<span class="${i <= st.step ? 'on' : ''}"></span>`).join('')}</div>`;
        let body = '';
        if (st.step === 0) {
          body = `<h2>Kim jesteś?</h2>
            <div class="col"><label>Imię trenera</label><input type="text" id="w-name" maxlength="12" value="${esc(st.name)}" placeholder="np. Ash"></div>
            <h3 style="margin-top:16px">Wygląd</h3>
            <div class="choice-grid">${AVATARS.map(([a, g]) => `<div class="choice ${st.avatar === a ? 'sel' : ''}" data-a="${a}" data-g="${g}">${UI.trainerImg(a, 'height:80px')}</div>`).join('')}</div>`;
        } else if (st.step === 1) {
          body = `<h2>Gdzie zaczynasz przygodę?</h2><p class="muted">Pozostałe regiony odblokujesz, zostając Mistrzem Ligi. Każdy region to inne Pokémony, liderzy i legendy – tak jak w oryginalnych grach.</p>
            <div class="grid g3">${PW.World.regions().map(r => `<div class="choice ${st.region === r.id ? 'sel' : ''}" data-r="${r.id}" style="text-align:left">
              <div class="row">${UI.monImg(r.starters[0], { style: 'width:44px;height:44px' })}${UI.monImg(r.starters[1], { style: 'width:44px;height:44px' })}${UI.monImg(r.starters[2], { style: 'width:44px;height:44px' })}</div>
              <div class="n">${esc(r.name)} <span class="pill">Gen ${r.gen}</span></div><div class="tiny muted">${esc(r.game)}</div><div class="small" style="margin-top:4px">${esc(r.desc)}</div></div>`).join('')}</div>`;
        } else {
          const reg = PW.World.region(st.region);
          const opts = reg.starters.slice();
          if (st.region === 'kanto') opts.push(Dex.monByKey('pikachu'));
          if (st.region === 'kanto') opts.push(Dex.monByKey('eevee'));
          body = `<h2>${esc(reg.prof[0])}</h2><p>"Witaj w świecie Pokémonów! Mam tu kilka Pokémonów. Wybierz swojego pierwszego partnera!"</p>
            <div class="choice-grid">${opts.map(pid => `<div class="choice ${st.starter === pid ? 'sel' : ''}" data-s="${pid}">${UI.monImg(pid, { art: true })}<div class="n">${esc(Dex.mon(pid).n)}</div><div>${UI.types(Dex.mon(pid).t, true)}</div></div>`).join('')}</div>
            ${st.region === 'kanto' ? '<p class="tiny muted">Pikachu jak w Pokémon Yellow, Eevee jak w Let\'s Go Eevee.</p>' : ''}`;
        }
        el.innerHTML = `<div class="title-screen"><div class="title-box" style="width:min(860px,100%);text-align:left">
          <h1 class="title-logo center" style="font-size:22px">POKÉWĘDRÓWKA</h1>${dots}
          <div class="card">${body}
            <div class="row" style="margin-top:16px"><button class="btn" id="w-back">← Wstecz</button><button class="btn primary right" id="w-next">${st.step === 2 ? 'Rozpocznij przygodę!' : 'Dalej →'}</button></div>
          </div></div></div>`;
        const name = el.querySelector('#w-name');
        if (name) { name.oninput = () => { st.name = name.value; }; name.focus(); }
        for (const c of el.querySelectorAll('[data-a]')) c.onclick = () => { st.avatar = c.dataset.a; st.gender = c.dataset.g; draw(); };
        for (const c of el.querySelectorAll('[data-r]')) c.onclick = () => { st.region = c.dataset.r; st.starter = null; draw(); };
        for (const c of el.querySelectorAll('[data-s]')) c.onclick = () => { st.starter = +c.dataset.s; draw(); };
        el.querySelector('#w-back').onclick = () => { if (st.step === 0) S.title.render(); else { st.step--; draw(); } };
        el.querySelector('#w-next').onclick = () => {
          if (st.step === 0 && !st.name.trim()) { name.focus(); name.style.borderColor = 'var(--danger)'; return; }
          if (st.step === 2) {
            if (!st.starter) return;
            PW.Game.newGame({ name: st.name.trim(), gender: st.gender, avatar: st.avatar, region: st.region, starter: st.starter });
            PW.Flow.travel(st.region, PW.Game.s.loc);
            PW.Game.reg(st.region).flags.arrived = 0;
            const msgs = PW.Story.onArrive(st.region);
            UI.startGame();
            const reg = PW.World.region(st.region);
            UI.play({ title: reg.prof[0], img: { trainer: reg.prof[1] },
              text: '"' + esc(st.name.trim()) + ', twój ' + esc(Dex.mon(st.starter).n) + ' już cię uwielbia! Twoim celem jest zebrać ' + reg.gyms.length + (reg.trials ? ' pieczęci Prób Wyspowych' : ' odznak') + ', pokonać Elitarną Czwórkę i zostać Mistrzem. Po drodze uzupełniaj Pokédex – zajrzyj do mnie, a nagrodzę twoje postępy!" ' + msgs.map(esc).join(' ') +
                '<br><br><span class="small muted">Wskazówka: klikaj „Szukaj Pokémonów”, by spotykać dzikie Pokémony, trenerów i wydarzenia. Pora dnia i pogoda (prawdziwy czas) zmieniają spotkania!</span>' });
            return;
          }
          st.step++; draw();
        };
      };
      draw();
    },
  };

  // ====================================================================== LOCATION
  S.location = {
    render(c) {
      const s = PW.Game.s;
      const reg = PW.World.hereRegion();
      const loc = PW.World.here();
      if (!loc) { s.loc = reg.lab; return S.location.render(c); }
      const r = PW.Game.reg(s.region);
      const w = PW.World.weather(s.region, loc);
      const tod = U.timeOfDay();
      const lr = PW.World.levelRange(loc);
      const residents = PW.World.residents(s.region, loc).slice(0, 4);
      const wcls = w.w ? 'weather-' + w.w : '';
      const facs = loc.f;
      const acts = PW.Explore.actions(s.region, loc);
      const special = PW.Explore.special(s.region, loc);
      const gyms = PW.World.gymAt(s.region, loc.id);
      const extra = (reg.extra || []).filter(t => t.loc === loc.id && (t.req < 99 || PW.Game.isChampion(s.region)));
      const apOn = s.settings.ap;
      c.innerHTML = `
        <div class="loc-hero kind-${loc.k} ${tod} ${wcls}">
          <div class="bg"></div>
          <div class="big-ico">${PW.World.KIND_ICON[loc.k] || '📍'}</div>
          <div class="residents">${residents.map(x => PW.Game.s.dex.seen[Dex.mon(x.pid).s] ? UI.monImg(x.pid) : '').join('')}</div>
          <div class="content-z">
            <div class="sub small">${esc(reg.name)} · ${esc(PW.World.KIND_PL[loc.k] || '')}${lr ? ' · Dzikie Pokémony: poz. ' + lr[0] + '–' + lr[1] : ''}</div>
            <h1>${esc(loc.n)}</h1>
            <div class="sub small">${w.icon} ${esc(w.label)} · ${({ morning: 'Rano', day: 'Dzień', night: 'Noc' })[tod]}${reg.id === 'unova' ? ' · Pora roku: ' + ({ spring: 'wiosna', summer: 'lato', autumn: 'jesień', winter: 'zima' })[U.season()] : ''}${s.swarm && s.swarm.left > 0 && s.swarm.loc === loc.id ? ' · 🐝 Wysyp: ' + esc(Dex.mon(s.swarm.pid).n) : ''}</div>
            ${loc.d ? `<div class="sub" style="margin-top:6px;max-width:640px">${esc(loc.d)}</div>` : ''}
          </div>
        </div>
        <div class="row" id="nearby">${S.location.nearbyHtml(reg, loc)}</div>
        ${s.league && s.league.region === s.region ? `<div class="card" style="border-color:var(--gold)"><b>🏆 Trwa wyzwanie Ligi (${s.league.step + 1}/5).</b> <button class="btn yellow sm" id="league-cont">Kontynuuj</button></div>` : ''}
        <div class="card">
          <div class="section-title">🧭 Działania ${apOn ? `<span class="pill right">⚡ ${s.player.ap} PA</span>` : ''}</div>
          <div class="actions" id="acts">
            ${acts.map(a => `<button class="action ${a.id === 'explore' ? 'hero-act' : ''} ${a.ok === false ? 'locked' : ''}" data-act="${a.id}" title="${a.ok === false ? esc(a.why) : ''}">
              <span class="ic">${a.icon}</span><span><div class="t">${esc(a.label)}</div><div class="d">${a.ok === false ? esc(a.why) : (apOn ? '−' + a.ap + ' PA' : 'Wyprawa')}</div></span></button>`).join('')}
            ${facs.includes('pc') ? `<button class="action" data-fac="pc"><span class="ic">🏥</span><span><div class="t">Centrum Pokémon</div><div class="d">Leczenie i PC</div></span></button>` : ''}
            ${facs.includes('mart') || facs.includes('dept') ? `<button class="action" data-fac="shop"><span class="ic">🛒</span><span><div class="t">${facs.includes('dept') ? 'Dom Towarowy' : 'Poké Mart'}</div><div class="d">Kupuj i sprzedawaj</div></span></button>` : ''}
            ${gyms.map(gi => { const g = reg.gyms[gi]; const has = r.badges.includes(gi); const can = r.badges.length >= gi || r.champion;
              return `<button class="action special ${can ? '' : 'locked'}" data-gym="${gi}"><span class="ic">${UI.badge(g.type, !has, 34)}</span><span><div class="t">${g.trial ? 'Próba' : 'Sala'}: ${esc(g.leader)}</div><div class="d">${has ? '✔ ' + esc(g.badge) + ' (rewanż)' : can ? esc(Dex.TYPE_PL[g.type]) + ' · ' + esc(g.badge) : 'Najpierw zdobądź ' + gi + ' odznak'}</div></span></button>`; }).join('')}
            ${facs.includes('league') ? `<button class="action special" data-fac="league"><span class="ic">🏆</span><span><div class="t">Liga Pokémon</div><div class="d">${r.champion ? 'Jesteś Mistrzem – obroń tytuł!' : 'Elitarna Czwórka i Mistrz'}</div></span></button>` : ''}
            ${facs.includes('daycare') ? `<button class="action" data-fac="daycare"><span class="ic">🥚</span><span><div class="t">Hodowla Pokémonów</div><div class="d">${s.daycare.egg ? 'Czeka jajo!' : s.daycare.mons.length + '/2 Pokémonów'}</div></span></button>` : ''}
            ${extra.map((t, i) => `<button class="action special" data-extra="${i}"><span class="ic">🌟</span><span><div class="t">${esc(t.title)}: ${esc(t.name)}</div><div class="d">Najsilniejszy przeciwnik regionu</div></span></button>`).join('')}
            ${special.map((x, i) => `<button class="action special ${x.locked ? 'locked' : ''}" data-sp="${i}"><span class="ic">${x.icon}</span><span><div class="t">${esc(x.label)}</div><div class="d">${esc(x.desc || '')}</div></span></button>`).join('')}
          </div>
        </div>
        <div class="grid g2">
          <div class="card"><div class="section-title">🐾 Pokémony w okolicy <button class="btn sm right" id="show-all">Wszystkie</button></div><div id="res"></div></div>
          <div class="card"><div class="section-title">📰 Dziennik</div><div class="feed">${s.log.slice(0, 20).map(l => `<div class="it ${l.kind}"><span class="time">${new Date(l.t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</span>${esc(l.text)}</div>`).join('') || '<div class="muted">Pusto.</div>'}</div></div>
        </div>`;
      S.location.drawResidents(c.querySelector('#res'), false);
      c.querySelector('#show-all').onclick = () => S.location.drawResidents(c.querySelector('#res'), true);
      for (const b of c.querySelectorAll('[data-act]')) b.onclick = () => S.location.act(b.dataset.act);
      for (const b of c.querySelectorAll('[data-fac]')) b.onclick = () => S.location.facility(b.dataset.fac);
      for (const b of c.querySelectorAll('[data-gym]')) b.onclick = () => {
        const gi = +b.dataset.gym;
        if (!(r.badges.length >= gi || r.champion)) return UI.toast('Najpierw zdobądź wcześniejsze odznaki.', 'bad');
        UI.play(PW.Flow.gymScene(s.region, gi));
      };
      for (const b of c.querySelectorAll('[data-sp]')) b.onclick = () => { const x = special[+b.dataset.sp]; if (x.locked) return UI.alert(esc(x.label), esc(x.desc)); UI.play(x.run()); };
      for (const b of c.querySelectorAll('[data-extra]')) b.onclick = () => UI.play(PW.Flow.extraTrainerScene(s.region, extra[+b.dataset.extra]));
      for (const b of c.querySelectorAll('[data-go-loc]')) b.onclick = () => {
        const msgs = PW.Flow.travel(s.region, b.dataset.goLoc);
        UI.go('location');
        for (const m of msgs) UI.toast(m, 'gold');
      };
      const lc = c.querySelector('#league-cont');
      if (lc) lc.onclick = () => UI.play(PW.Flow.leagueScene(s.region));
    },
    // Previous / next accessible locations in story order for quick travel.
    nearbyHtml(reg, loc) {
      const list = reg.locs.filter(l => PW.World.accessible(reg.id, l));
      const i = list.findIndex(l => l.id === loc.id);
      const prev = i > 0 ? list[i - 1] : null, next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
      const center = PW.Game.reg(reg.id).center;
      const btn = (l, label) => `<button class="btn sm" data-go-loc="${l.id}">${label}</button>`;
      return (prev ? btn(prev, '← ' + esc(prev.n)) : '') + (next ? btn(next, esc(next.n) + ' →') : '') +
        (center && center !== loc.id ? btn({ id: center }, '🏥 ' + esc(PW.World.locName(reg.id, center))) : '') +
        `<button class="btn sm right" onclick="PW.UI.go('map')">🗺️ Mapa regionu</button>`;
    },
    drawResidents(box, all) {
      const s = PW.Game.s;
      const loc = PW.World.here();
      const list = PW.World.residents(s.region, loc, all);
      if (!list.length) { box.innerHTML = '<div class="muted small">Brak dzikich Pokémonów w tym miejscu. Możesz tu spotkać ludzi i wydarzenia.</div>'; return; }
      const total = list.reduce((a, x) => a + x.w, 0);
      const condPL = c => ({ 'time-morning': 'rano', 'time-day': 'w dzień', 'time-night': 'w nocy', 'swarm-yes': 'wysyp', 'radar-on': 'Poké Radar', postgame: 'po Lidze' })[c] || (c.startsWith('season-') ? ({ 'season-spring': 'wiosna', 'season-summer': 'lato', 'season-autumn': 'jesień', 'season-winter': 'zima' })[c] : c.startsWith('weather-') ? PW.World.weatherInfo(c).label.toLowerCase() : c.startsWith('slot2-') ? 'GBA: ' + c.slice(6) : c.startsWith('radio-') ? (c === 'radio-off' ? '' : 'radio ' + c.slice(6)) : '');
      box.innerHTML = `<div class="grid gauto-s">${list.map(x => {
        const sp = Dex.speciesOf(x.pid);
        const seen = s.dex.seen[sp.k ? Dex.mon(x.pid).s : 0];
        const caught = s.dex.caught[Dex.mon(x.pid).s];
        const pct = all ? '' : Math.max(1, Math.round(x.w / total * 100)) + '%';
        const conds = [...x.conds].map(condPL).filter(Boolean);
        return `<div class="mon-tile ${seen ? '' : 'unknown'}" title="${seen ? esc(Dex.mon(x.pid).n) : '???'} – ${[...x.methods].map(m => PW.World.METHOD_PL[m]).join(', ')}${conds.length ? ' (' + conds.join(', ') + ')' : ''}">
          ${caught ? '<span class="caught-dot"></span>' : ''}${UI.monImg(x.pid)}<div><b>${seen ? esc(Dex.mon(x.pid).n) : '???'}</b></div>
          <div class="num">Lv ${x.lo}${x.hi > x.lo ? '–' + x.hi : ''} ${pct ? '· ' + pct : ''}</div>
          <div class="tiny muted">${[...x.methods].map(m => ({ walk: '🌿', surf: '🌊', 'old-rod': '🎣', 'good-rod': '🎣', 'super-rod': '🎣', 'rock-smash': '🪨', headbutt: '🌳' })[m]).join('')}</div></div>`;
      }).join('')}</div>${all ? '<p class="tiny muted">Lista wszystkich Pokémonów w tym miejscu (każda pora dnia, pogoda i metoda).</p>' : '<p class="tiny muted">Szanse na spotkanie teraz (pora dnia, pogoda, wysypy). ◓ = złapany.</p>'}`;
    },
    act(method) {
      const s = PW.Game.s;
      const loc = PW.World.here();
      const a = PW.Explore.actions(s.region, loc).find(x => x.id === method);
      if (a && a.ok === false) return UI.toast(a.why, 'bad');
      if (PW.Game.ableCount() === 0 && !PW.Game.s.party.some(m => m.egg)) return UI.toast('Twoje Pokémony są wyczerpane! Odwiedź Centrum Pokémon.', 'bad');
      if (PW.Game.ableCount() === 0) return UI.toast('Nie masz Pokémona zdolnego do walki!', 'bad');
      if (!PW.Game.spendAP(a ? a.ap : 1)) return UI.toast('Brak Punktów Akcji! Odnawiają się z czasem (1 PA / 20 s). Możesz je wyłączyć w Opcjach.', 'bad');
      const sc = PW.Explore.run(s.region, loc, method === 'explore' ? 'walk' : method);
      UI.updateTop();
      UI.play(sc);
    },
    facility(f) {
      const s = PW.Game.s;
      if (f === 'pc') return UI.go('center');
      if (f === 'shop') return UI.go('shop');
      if (f === 'league') return UI.play(PW.Flow.leagueScene(s.region));
      if (f === 'daycare') return UI.go('daycare');
    },
  };

  // ====================================================================== MAP
  S.map = {
    render(c, params) {
      const s = PW.Game.s;
      const regionId = (params && params.region) || s.region;
      const reg = PW.World.region(regionId);
      const r = PW.Game.reg(regionId);
      const unlocked = s.unlocked.includes(regionId);
      const dex = Dex.data.core.dex[reg.dex] || [];
      const tabs = PW.World.regions().map(x => `<button class="region-tab ${x.id === regionId ? 'active' : ''} ${s.unlocked.includes(x.id) ? '' : 'locked'}" data-r="${x.id}">${esc(x.name)}${PW.Game.isChampion(x.id) ? ' 🏆' : ''}</button>`).join('');
      const groups = {};
      for (const l of reg.locs) {
        const key = l.r >= 99 ? 'Po zostaniu Mistrzem' : l.r === 0 ? 'Początek przygody' : 'Wymaga ' + l.r + ' ' + (reg.trials ? 'pieczęci' : 'odznak');
        (groups[key] = groups[key] || []).push(l);
      }
      c.innerHTML = `
        <div class="card">
          <div class="region-tabs">${tabs}</div>
        </div>
        <div class="card">
          <div class="row"><h2 style="margin:0">${esc(reg.name)}</h2><span class="pill">Gen ${reg.gen} · ${esc(reg.game)}</span>
            <span class="right small muted">Pokédex: ${PW.Game.caughtCount(dex)}/${dex.length} · ${reg.trials ? 'Pieczęcie' : 'Odznaki'}: ${r.badges.length}/${reg.gyms.length}${r.champion ? ' · 🏆 Mistrz' : ''}</span></div>
          <p class="muted">${esc(reg.desc)}</p>
          <div class="row" style="gap:6px">${reg.gyms.map((g, i) => `<span title="${esc(g.leader + ' – ' + g.badge)}">${UI.badge(g.type, !r.badges.includes(i), 36)}</span>`).join('')}</div>
          ${!unlocked ? '<p class="bad"><b>Region zablokowany.</b> Zostań Mistrzem dowolnego regionu, by tu podróżować.</p>' : ''}
        </div>
        ${Object.entries(groups).map(([k, list]) => `<div class="card"><h3>${esc(k)}</h3><div class="loc-list">${list.map(l => {
          const ok = unlocked && PW.World.accessible(regionId, l);
          const here = regionId === s.region && l.id === s.loc;
          const lr = PW.World.levelRange(l);
          const gym = reg.gyms.some(g => g.loc === l.id);
          return `<div class="loc-item ${ok ? '' : 'locked'} ${here ? 'here' : ''}" data-l="${l.id}">
            <span class="ic">${PW.World.KIND_ICON[l.k] || '📍'}</span>
            <span><div class="n">${esc(l.n)}</div><div class="m">${esc(PW.World.KIND_PL[l.k] || '')}${lr ? ' · Lv ' + lr[0] + '–' + lr[1] : ''}${r.visited[l.id] ? '' : ' · nieodwiedzone'}</div></span>
            <span class="tags">${l.f.includes('pc') ? '🏥' : ''}${l.f.includes('mart') || l.f.includes('dept') ? '🛒' : ''}${gym ? '🏅' : ''}${l.f.includes('league') ? '🏆' : ''}${(l.e || []).some(e => e.t === 'static' && (Dex.speciesOf(e.p).leg || Dex.speciesOf(e.p).myth)) ? '⭐' : ''}</span></div>`;
        }).join('')}</div></div>`).join('')}`;
      for (const t of c.querySelectorAll('[data-r]')) t.onclick = () => {
        if (!s.unlocked.includes(t.dataset.r)) return UI.toast('Region zablokowany – zostań Mistrzem, by tu podróżować.', 'bad');
        S.map.render(c, { region: t.dataset.r });
      };
      for (const it of c.querySelectorAll('[data-l]')) it.onclick = () => {
        const l = reg._loc[it.dataset.l];
        if (!unlocked) return UI.toast('Region zablokowany.', 'bad');
        if (!PW.World.accessible(regionId, l)) return UI.toast(l.r >= 99 ? 'Dostępne po zostaniu Mistrzem regionu.' : 'Potrzebujesz ' + l.r + ' odznak w tym regionie.', 'bad');
        const msgs = PW.Flow.travel(regionId, l.id);
        UI.go('location');
        for (const m of msgs) UI.toast(m, 'gold');
        if (msgs.length) UI.alert('Podróż', msgs.map(esc).join('<br><br>'));
      };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
