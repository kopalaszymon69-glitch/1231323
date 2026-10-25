/* Screens: bag, shop, Pokémon Center, Pokédex, quests, profile, settings, Battle Factory. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const esc = U.esc;
  const S = PW.Screens;
  const UI = PW.UI;
  const Game = () => PW.Game;
  const I = k => Dex.itemByKey(k);

  // ====================================================================== BAG
  S.bag = {
    pocket: 'medicine',
    render(c) {
      const s = Game().s;
      const items = s.bag.items;
      const byPocket = {};
      for (const id of Object.keys(items).map(Number)) { const p = PW.Items.pocketOf(id); (byPocket[p] = byPocket[p] || []).push(id); }
      const tms = Object.keys(s.bag.tms).map(Number);
      const pocket = S.bag.pocket;
      let list = pocket === 'tm' ? tms.map(mid => 'tm' + mid) : (byPocket[pocket] || []);
      list = list.slice().sort((a, b) => PW.Items.name(a).localeCompare(PW.Items.name(b)));
      c.innerHTML = `<div class="card"><div class="section-title">👜 Plecak</div>
        <div class="tabs">${PW.Items.POCKETS.map(([k, n]) => `<button class="tab ${k === pocket ? 'active' : ''}" data-p="${k}">${n} (${k === 'tm' ? tms.length : (byPocket[k] || []).length})</button>`).join('')}</div>
        <div class="col">${list.map(id => {
          const isTm = typeof id === 'string';
          const count = isTm ? '' : '×' + items[id];
          const usable = !isTm && (['medicine', 'berries', 'evo', 'other'].includes(pocket) || ['poke-radar', 'poke-flute'].includes(PW.Items.key(id)));
          return `<div class="item-row">${UI.itemImg(id)}<div class="grow"><div class="n">${esc(PW.Items.name(id))} <span class="muted">${count}</span></div><div class="d">${esc(PW.Items.desc(id))}</div></div>
            <div class="row" style="gap:4px">${usable ? `<button class="btn sm" data-use="${id}">Użyj</button>` : ''}${isTm ? `<button class="btn sm" data-tm="${id.slice(2)}">Naucz</button>` : ''}${PW.Items.canHold(id) && !isTm ? `<button class="btn sm" data-give="${id}">Daj</button>` : ''}</div></div>`;
        }).join('') || '<div class="empty">Ta kieszeń jest pusta.</div>'}</div></div>`;
      for (const t of c.querySelectorAll('[data-p]')) t.onclick = () => { S.bag.pocket = t.dataset.p; S.bag.render(c); };
      for (const b of c.querySelectorAll('[data-use]')) b.onclick = () => S.bag.use(+b.dataset.use, c);
      for (const b of c.querySelectorAll('[data-give]')) b.onclick = async () => {
        const id = +b.dataset.give;
        const m = await UI.pickMon('Komu dać ' + esc(PW.Items.name(id)) + '?', x => x.egg ? 'Jajo' : true);
        if (!m) return;
        if (m.item) Game().addItem(m.item, 1, true);
        Game().takeItem(id, 1); m.item = id;
        UI.toast(Mon.name(m) + ' trzyma ' + PW.Items.name(id) + '.', 'good');
        S.bag.render(c);
      };
      for (const b of c.querySelectorAll('[data-tm]')) b.onclick = async () => {
        const mid = +b.dataset.tm;
        const m = await UI.pickMon('Kogo nauczyć ' + esc(Dex.move(mid).n) + '?', x => x.egg ? 'Jajo' : Dex.canLearnTM(x.pid, mid) ? (x.moves.some(y => y.id === mid) ? 'Już zna' : true) : 'Nie może się nauczyć');
        if (!m) return;
        const r = PW.Flow.teachTM(m, mid);
        if (r.text) UI.toast(r.text, r.ok ? 'good' : 'bad');
        await UI.runTasks(r.tasks);
      };
    },
    async use(id, c) {
      const k = PW.Items.key(id);
      const s = Game().s;
      if (PW.Items.REPELS[k]) { Game().takeItem(id, 1); s.repel = PW.Items.REPELS[k]; UI.toast('Repel działa przez ' + s.repel + ' wypraw.', 'good'); return S.bag.render(c); }
      if (PW.Items.LURES[k]) { Game().takeItem(id, 1); s.lure = PW.Items.LURES[k]; UI.toast('Przynęta przyciąga Pokémony przez ' + s.lure + ' wypraw.', 'good'); return S.bag.render(c); }
      if (k === 'poke-radar') { s.radarOn = !s.radarOn; UI.toast(s.radarOn ? 'Poké Radar włączony – w trawie Sinnoh pojawią się rzadkie Pokémony.' : 'Poké Radar wyłączony.', 'good'); return S.bag.render(c); }
      if (k === 'poke-flute') { for (const m of s.party) if (m.st === 'slp') { m.st = null; m.slp = 0; } UI.toast('Melodia Poké Flute budzi śpiące Pokémony!', 'good'); return S.bag.render(c); }
      if (k === 'escape-rope') {
        const center = Game().reg().center || PW.World.hereRegion().lab;
        Game().takeItem(id, 1); s.loc = center; UI.toast('Wracasz do: ' + PW.World.locName(s.region, center), 'good'); return UI.go('location');
      }
      if (k === 'honey') {
        const loc = PW.World.here();
        if (!(loc.w && (loc.w.walk || loc.w.headbutt))) return UI.toast('Tu nie ma gdzie rozsmarować miodu.', 'bad');
        Game().takeItem(id, 1);
        const sc = PW.Explore.run(s.region, loc, loc.w.headbutt ? 'headbutt' : 'walk');
        return UI.play(sc.battle ? sc : PW.Explore.run(s.region, loc, 'walk'));
      }
      if (k === 'sacred-ash') { const r = PW.Items.applyMedicine(s.party[0], id, { party: s.party }); if (r.ok) Game().takeItem(id, 1); UI.toast(r.text, r.ok ? 'good' : 'bad'); return S.bag.render(c); }
      if (['ability-capsule', 'ability-patch', 'bottle-cap', 'gold-bottle-cap'].includes(k) || k.endsWith('-mint') || PW.Items.pocketOf(id) !== 'key') {
        const m = await UI.pickMon('Na kim użyć ' + esc(PW.Items.name(id)) + '?', x => x.egg ? 'Jajo' : true);
        if (!m) return;
        let moveIndex;
        if (PW.Items.needsMove(id)) { moveIndex = await S.team.pickMove(m); if (moveIndex === null) return; }
        const r = PW.Flow.useItem(m, id, moveIndex);
        if (r.text) UI.toast(r.text, r.ok ? 'good' : 'bad');
        await UI.runTasks(r.tasks);
        S.bag.render(c);
      }
    },
  };

  // ====================================================================== SHOP
  S.shop = {
    tab: 'buy',
    render(c) {
      const s = Game().s;
      const loc = PW.World.here();
      if (!loc.f.includes('mart') && !loc.f.includes('dept')) { c.innerHTML = '<div class="card empty">Tu nie ma sklepu.</div>'; return; }
      const dept = loc.f.includes('dept');
      const badges = Game().isChampion(s.region) ? 8 : Game().badges(s.region);
      const stock = PW.Items.martStock(badges, dept, s.region, loc.id);
      const tms = dept ? PW.Items.tmStock(badges).filter(id => !s.bag.tms[id.slice(2)]) : [];
      const tab = S.shop.tab;
      let list;
      if (tab === 'buy') list = stock;
      else if (tab === 'tm') list = tms;
      else list = Object.keys(s.bag.items).map(Number).filter(id => PW.Items.pocketOf(id) !== 'key' && PW.Items.sellPrice(id) > 0);
      c.innerHTML = `<div class="card"><div class="section-title">🛒 ${dept ? 'Dom Towarowy' : 'Poké Mart'} – ${esc(loc.n)} <span class="right chip">💰 ${U.money(s.player.money)}</span></div>
        <div class="tabs"><button class="tab ${tab === 'buy' ? 'active' : ''}" data-t="buy">Kup</button>${dept ? `<button class="tab ${tab === 'tm' ? 'active' : ''}" data-t="tm">TM (${tms.length})</button>` : ''}<button class="tab ${tab === 'sell' ? 'active' : ''}" data-t="sell">Sprzedaj</button></div>
        <div class="col">${list.map(id => {
          const price = tab === 'sell' ? PW.Items.sellPrice(id) : PW.Items.price(id);
          const have = typeof id === 'string' ? '' : 'masz ' + (s.bag.items[id] || 0);
          return `<div class="item-row">${UI.itemImg(id)}<div class="grow"><div class="n">${esc(PW.Items.name(id))} <span class="muted small">${have}</span></div><div class="d">${esc(PW.Items.desc(id))}</div></div>
            <div class="row" style="gap:6px"><b>${U.money(price)}</b>${typeof id === 'string' ? '' : `<input type="number" min="1" max="99" value="1" data-q="${id}" style="width:62px">`}
            <button class="btn sm ${tab === 'sell' ? '' : 'primary'}" data-${tab === 'sell' ? 'sell' : 'buy'}="${id}">${tab === 'sell' ? 'Sprzedaj' : 'Kup'}</button></div></div>`;
        }).join('') || '<div class="empty">Nic tu nie ma.</div>'}</div>
        ${tab === 'buy' ? '<p class="tiny muted">Asortyment rośnie wraz z liczbą odznak w regionie (jak w grach od 4. generacji). Za każde 10 Poké Balli dostajesz Premier Ball gratis!</p>' : ''}</div>`;
      for (const t of c.querySelectorAll('[data-t]')) t.onclick = () => { S.shop.tab = t.dataset.t; S.shop.render(c); };
      for (const b of c.querySelectorAll('[data-buy]')) b.onclick = () => {
        const raw = b.dataset.buy;
        const id = raw.startsWith('tm') ? raw : +raw;
        const qEl = c.querySelector(`[data-q="${raw}"]`);
        const q = qEl ? U.clamp(+qEl.value || 1, 1, 99) : 1;
        const cost = PW.Items.price(id) * q;
        if (!Game().pay(cost)) return UI.toast('Nie masz dość pieniędzy.', 'bad');
        Game().addItem(id, q, true);
        if (Dex.item(id) && PW.Items.isBall(id) && q >= 10) Game().addItem(I('premier-ball'), Math.floor(q / 10), true);
        UI.toast('Kupiono: ' + PW.Items.name(id) + (q > 1 ? ' ×' + q : '') + ' za ' + U.money(cost) + '.', 'good');
        S.shop.render(c); UI.updateTop();
      };
      for (const b of c.querySelectorAll('[data-sell]')) b.onclick = () => {
        const id = +b.dataset.sell;
        const qEl = c.querySelector(`[data-q="${id}"]`);
        const q = Math.min(Game().count(id), U.clamp(+qEl.value || 1, 1, 99));
        if (!Game().takeItem(id, q)) return;
        Game().addMoney(PW.Items.sellPrice(id) * q);
        UI.toast('Sprzedano ' + PW.Items.name(id) + ' ×' + q + '.', 'good');
        S.shop.render(c); UI.updateTop();
      };
    },
  };

  // ====================================================================== POKÉMON CENTER
  S.center = {
    render(c) {
      const s = Game().s;
      const loc = PW.World.here();
      c.innerHTML = `<div class="card"><div class="row">${UI.trainerImg('nurse', 'height:110px')}
          <div class="grow"><h2>Centrum Pokémon – ${esc(loc.n)}</h2><p>"Witaj w Centrum Pokémon! Czy mamy zaopiekować się twoimi Pokémonami?"</p>
          <div class="row"><button class="btn primary lg" id="heal">💗 Ulecz drużynę</button><button class="btn" id="pc">💻 PC</button><button class="btn" id="team">🎒 Drużyna</button>
          ${Game().has('tera-orb') ? `<span class="pill">Tera Orb: ${s.v_tera.charged ? 'naładowany ✨' : 'rozładowany'}</span>` : ''}</div></div></div></div>
        <div class="card"><div class="grid g2">${s.party.map(m => UI.monCard(m)).join('')}</div></div>`;
      c.querySelector('#heal').onclick = async () => {
        Game().healParty();
        Game().reg().center = loc.id;
        UI.toast('♪ Ta-da-da-dam! Twoje Pokémony są w pełni sił!', 'good');
        S.center.render(c);
      };
      c.querySelector('#pc').onclick = () => UI.go('pc');
      c.querySelector('#team').onclick = () => UI.go('team');
    },
  };

  // ====================================================================== POKÉDEX
  S.dex = {
    dex: 'national', q: '', type: -1, show: 'all', limit: 180,
    render(c) {
      const s = Game().s;
      const dexes = [['national', 'Krajowy']].concat(PW.World.regions().map(r => [r.dex, r.name]));
      const ids = (Dex.data.core.dex[S.dex.dex] || Dex.data.core.dex.national);
      const q = S.dex.q.toLowerCase();
      let list = ids.map((sid, i) => ({ sid, n: i + 1 }));
      if (q) list = list.filter(x => Dex.species(x.sid).n.toLowerCase().includes(q) || String(x.sid) === q);
      if (S.dex.type >= 0) list = list.filter(x => s.dex.seen[x.sid] && Dex.mon(Dex.defaultForm(x.sid)).t.includes(S.dex.type));
      if (S.dex.show === 'caught') list = list.filter(x => s.dex.caught[x.sid]);
      if (S.dex.show === 'missing') list = list.filter(x => !s.dex.caught[x.sid]);
      const caught = Game().caughtCount(ids), seen = Game().seenCount(ids);
      const shown = list.slice(0, S.dex.limit);
      c.innerHTML = `<div class="card"><div class="section-title">📕 Pokédex <span class="right small muted">Widziane ${seen} · Złapane ${caught} / ${ids.length}</span></div>
        <div class="progress"><div style="width:${caught / ids.length * 100}%"></div></div>
        <div class="row" style="margin-top:10px">
          <select id="d-dex">${dexes.map(([k, n]) => `<option value="${k}" ${k === S.dex.dex ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
          <select id="d-type"><option value="-1">Wszystkie typy</option>${Dex.types().slice(0, 18).map((t, i) => `<option value="${i}" ${i === S.dex.type ? 'selected' : ''}>${Dex.TYPE_PL[t]}</option>`).join('')}</select>
          <select id="d-show"><option value="all">Wszystkie</option><option value="caught" ${S.dex.show === 'caught' ? 'selected' : ''}>Złapane</option><option value="missing" ${S.dex.show === 'missing' ? 'selected' : ''}>Brakujące</option></select>
          <input type="text" id="d-q" placeholder="Szukaj nazwy lub numeru…" value="${esc(S.dex.q)}" class="grow">
        </div></div>
        <div class="card"><div class="grid gauto-s">${shown.map(x => {
          const sp = Dex.species(x.sid);
          const seenX = s.dex.seen[x.sid], caughtX = s.dex.caught[x.sid];
          return `<div class="mon-tile ${seenX ? '' : 'unknown'}" data-s="${x.sid}">${caughtX ? '<span class="caught-dot"></span>' : ''}${s.dex.shiny[x.sid] ? '<span class="shiny-star" style="position:absolute;left:6px;top:4px">★</span>' : ''}
            ${UI.monImg(Dex.defaultForm(x.sid))}<span class="num">#${String(x.n).padStart(3, '0')}</span><b>${seenX ? esc(sp.n) : '???'}</b></div>`;
        }).join('') || '<div class="empty">Brak wyników.</div>'}</div>
        ${list.length > shown.length ? `<div class="center" style="margin-top:12px"><button class="btn" id="more">Pokaż więcej (${list.length - shown.length})</button></div>` : ''}</div>`;
      c.querySelector('#d-dex').onchange = e => { S.dex.dex = e.target.value; S.dex.limit = 180; S.dex.render(c); };
      c.querySelector('#d-type').onchange = e => { S.dex.type = +e.target.value; S.dex.render(c); };
      c.querySelector('#d-show').onchange = e => { S.dex.show = e.target.value; S.dex.render(c); };
      const qi = c.querySelector('#d-q');
      qi.oninput = () => { S.dex.q = qi.value; clearTimeout(S.dex._t); S.dex._t = setTimeout(() => { S.dex.render(c); const n = c.querySelector('#d-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
      const more = c.querySelector('#more');
      if (more) more.onclick = () => { S.dex.limit += 240; S.dex.render(c); };
      for (const t of c.querySelectorAll('[data-s]')) t.onclick = () => S.dex.detail(+t.dataset.s);
    },
    where(sid) {
      const out = [];
      for (const r of PW.World.regions()) for (const l of r.locs) {
        for (const [m, rows] of Object.entries(l.w || {})) for (const e of rows) {
          if (Dex.mon(e[0]).s !== sid) continue;
          out.push({ r: r.name, rid: r.id, l: l.n, m, lo: e[2], hi: e[3], conds: e[4] || [] });
        }
        for (const e of (l.e || [])) if (Dex.mon(e.p).s === sid) out.push({ r: r.name, rid: r.id, l: l.n, m: e.t, lo: e.l, hi: e.l, conds: e.c || [] });
      }
      const seen = new Set();
      return out.filter(x => { const k = x.rid + x.l + x.m; if (seen.has(k)) return false; seen.add(k); return true; });
    },
    detail(sid) {
      const s = Game().s;
      const sp = Dex.species(sid);
      if (!s.dex.seen[sid]) return UI.alert('???', '<div class="center">Jeszcze nie spotkałeś tego Pokémona.</div>');
      const pid = Dex.defaultForm(sid);
      const p = Dex.mon(pid);
      const where = S.dex.where(sid);
      const methodPL = { static: 'spotkanie', gift: 'prezent', trade: 'wymiana', raid: 'rajd' };
      const gender = sp.gr < 0 ? 'bezpłciowy' : sp.gr === 0 ? '100% ♂' : sp.gr === 8 ? '100% ♀' : (100 - sp.gr * 12.5) + '% ♂ / ' + sp.gr * 12.5 + '% ♀';
      const growth = { 1: 'Wolny', 2: 'Średni', 3: 'Szybki', 4: 'Średnio-wolny', 5: 'Erratyczny', 6: 'Fluktuujący' }[sp.gw];
      const forms = sp.f.filter(f => f !== pid);
      const lv = Dex.learnset(pid).l.filter(x => x[0] > 0).slice(0, 40);
      const body = `<div class="row" style="align-items:flex-start">
          <div class="center" style="width:210px">${UI.monImg(pid, { art: true, cls: 'big-sprite' })}${s.dex.shiny[sid] ? UI.monImg(pid, { shiny: true, style: 'width:96px;height:96px' }) : ''}</div>
          <div class="col grow" style="min-width:240px">
            <div><span class="muted">#${String(sid).padStart(4, '0')}</span> <b style="font-size:21px">${esc(sp.n)}</b> ${s.dex.caught[sid] ? '<span class="pill">złapany</span>' : '<span class="pill">widziany</span>'}</div>
            <div><i>${esc(sp.gn)}</i> · Gen ${sp.gen}${sp.leg ? ' · <span class="gold">Legendarny</span>' : ''}${sp.myth ? ' · <span class="gold">Mityczny</span>' : ''}</div>
            <div>${UI.types(p.t)}</div>
            <div class="small">Wzrost ${(p.h / 10).toFixed(1)} m · Waga ${(p.w / 10).toFixed(1)} kg · Płeć: ${gender} · Celność łapania: ${sp.cr} · Wzrost: ${growth}</div>
            <div class="small">Grupy jaj: ${sp.eg.map(g => Dex.data.core.eggGroups[g]).join(', ')} · Cykle jaja: ${sp.hc}</div>
            <div class="small">Zdolności: ${p.a.filter(Boolean).map((a, i) => esc(Dex.ability(a).n) + (i === 2 || (i === 1 && !p.a[1]) ? '' : '')).join(', ')}${p.a[2] ? ' (ukryta: ' + esc(Dex.ability(p.a[2]).n) + ')' : ''}</div>
            ${s.dex.caught[sid] ? `<div class="scene-text small">„${esc(Dex.dexText(sid))}”</div>` : '<div class="small muted">Złap tego Pokémona, by poznać wpis Pokédexu.</div>'}
          </div></div>
        <h3>Statystyki bazowe</h3>
        ${p.b.map((v, i) => `<div class="stat-row"><span>${Dex.STAT_PL[i]}</span><span>${v}</span><div class="stat-bar"><div style="width:${Math.min(100, v / 180 * 100)}%;background:${['#ff5959', '#f5ac78', '#fae078', '#9db7f5', '#a7db8d', '#fa92b2'][i]}"></div></div><span></span></div>`).join('')}
        <h3 style="margin-top:12px">Ewolucja</h3>${S.team.evoChain({ pid, lvl: 1, moves: [], fr: 0, item: null, gender: 'M', iv: [0, 0, 0, 0, 0, 0], ev: [0, 0, 0, 0, 0, 0], nat: 0, moveUse: {} }).replace(/<div class="center" style="margin-top:12px">[\s\S]*?<\/div>/, '')}
        ${forms.length ? `<h3>Formy</h3><div class="row">${forms.map(f => `<div class="mon-tile" title="${esc(Dex.mon(f).n)}">${UI.monImg(f)}<span class="tiny">${esc(Dex.mon(f).n)}</span>${UI.types(Dex.mon(f).t, true)}</div>`).join('')}</div>` : ''}
        <h3 style="margin-top:12px">Gdzie występuje</h3>
        ${where.length ? `<table class="tbl"><tr><th>Region</th><th>Lokacja</th><th>Sposób</th><th>Poz.</th></tr>${where.slice(0, 40).map(w => `<tr><td>${esc(w.r)}</td><td>${esc(w.l)}</td><td>${esc(PW.World.METHOD_PL[w.m] || methodPL[w.m] || w.m)}${w.conds.length ? ' <span class="tiny muted">(' + esc(w.conds.filter(c => !c.startsWith('radio-off')).map(c => c.replace('time-', '').replace('weather-', '').replace('season-', '')).join(', ')) + ')</span>' : ''}</td><td>${w.lo}${w.hi > w.lo ? '–' + w.hi : ''}</td></tr>`).join('')}</table>` : '<p class="muted small">Nie występuje dziko – zdobędziesz go przez ewolucję, jajo lub specjalne wydarzenie.</p>'}
        <h3 style="margin-top:12px">Ruchy (poziom)</h3>
        <div class="row" style="gap:4px">${lv.map(([l, mid]) => `<span class="pill" title="${esc(Dex.move(mid).d || '')}">${l} ${esc(Dex.move(mid).n)}</span>`).join('')}</div>`;
      UI.modal({ title: esc(sp.n), body, wide: true });
    },
  };

  // ====================================================================== QUESTS
  S.quests = {
    render(c) {
      const s = Game().s;
      const daily = PW.Quests.daily();
      const reg = PW.World.hereRegion();
      const r = Game().reg();
      const next = PW.World.nextGym(s.region);
      const story = [];
      if (next >= 0) { const g = reg.gyms[next]; story.push(`Następny cel: <b>${esc(g.leader)}</b> (${esc(Dex.TYPE_PL[g.type])}) w lokacji <b>${esc(PW.World.locName(s.region, g.loc))}</b>.`); }
      else if (!r.champion) story.push(`Masz komplet ${reg.trials ? 'pieczęci' : 'odznak'}! Udaj się do Ligi Pokémon: <b>${esc(PW.World.locName(s.region, reg.league))}</b>.`);
      else story.push('Jesteś Mistrzem regionu ' + esc(reg.name) + '! Odkrywaj lokacje po grze, łap legendy i podróżuj do innych regionów.');
      const rival = reg.rival;
      c.innerHTML = `<div class="card"><div class="section-title">📜 Główny cel – ${esc(reg.name)}</div><p>${story.join(' ')}</p>
          <p class="small muted">Rywal ${esc(rival.name)} pojawia się po kolejnych odznakach. Złoczyńcy (${esc(reg.villain.team)}) czyhają na trasach – pokonaj ich kilku, a wpadniesz na trop szefa.</p></div>
        <div class="card"><div class="section-title">📅 Zadania dnia <span class="right small muted">Odnowią się jutro</span></div>
          <div class="col">${daily.map((q, i) => `<div class="item-row"><span style="font-size:26px">${q.claimed ? '✅' : q.done ? '🎁' : '🎯'}</span>
            <div class="grow"><div class="n">${esc(q.text)}</div><div class="progress" style="margin-top:4px"><div style="width:${Math.min(100, q.have / q.n * 100)}%"></div></div><div class="d">${Math.min(q.have, q.n)}/${q.n} · Nagroda: ${U.money(q.reward)} + przedmiot</div></div>
            ${q.done && !q.claimed ? `<button class="btn yellow sm" data-claim="${i}">Odbierz</button>` : ''}</div>`).join('')}</div></div>
        <div class="card"><div class="section-title">🏅 Osiągnięcia <span class="right small muted">${Object.keys(s.ach).length}/${PW.Quests.ACH.length}</span></div>
          <div class="grid g2">${PW.Quests.ACH.map(([id, n, d]) => `<div class="item-row" style="${s.ach[id] ? 'border-color:var(--gold)' : 'opacity:.55'}"><span style="font-size:24px">${s.ach[id] ? '🏅' : '🔒'}</span><div><div class="n">${esc(n)}</div><div class="d">${esc(d)}</div></div></div>`).join('')}</div></div>`;
      for (const b of c.querySelectorAll('[data-claim]')) b.onclick = () => {
        const r2 = PW.Quests.claim(+b.dataset.claim);
        if (r2) UI.toast('Nagroda: ' + U.money(r2.money) + (r2.item ? ' i ' + Dex.item(r2.item).n : ''), 'gold');
        UI.refresh();
      };
    },
  };

  // ====================================================================== PROFILE
  S.profile = {
    render(c) {
      const s = Game().s;
      const p = s.player;
      const hrs = Math.floor(s.play / 3600), mins = Math.floor(s.play % 3600 / 60);
      const st = s.stats;
      c.innerHTML = `<div class="card"><div class="row" style="align-items:flex-start">
          ${UI.trainerImg(p.avatar, 'height:150px')}
          <div class="col grow"><h2 style="margin:0">Karta Trenera: ${esc(p.name)}</h2>
            <div>Poziom trenera <b>${p.tlvl}</b> <span class="muted small">(${p.texp}/${Game().texpNeeded(p.tlvl)} pkt)</span></div>
            <div class="progress"><div style="width:${p.texp / Game().texpNeeded(p.tlvl) * 100}%"></div></div>
            <div>Pieniądze: <b>${U.money(p.money)}</b> · BP: <b>${p.bp}</b> · Monety: <b>${p.coins}</b></div>
            <div>Pokédex: złapane <b>${Game().caughtCount()}</b> · widziane <b>${Game().seenCount()}</b> · shiny <b>${Object.keys(s.dex.shiny).length}</b></div>
            <div>Czas gry: ${hrs} h ${mins} min · Rozpoczęto: ${new Date(s.created).toLocaleDateString('pl-PL')}</div>
          </div></div></div>
        <div class="card"><div class="section-title">🎖️ Odznaki</div>${PW.World.regions().map(r => {
          const rr = s.regions[r.id];
          return `<div class="row" style="margin-bottom:8px"><b style="width:80px">${esc(r.name)}</b>${r.gyms.map((g, i) => `<span title="${esc(g.badge + ' – ' + g.leader)}">${UI.badge(g.type, !rr.badges.includes(i), 30)}</span>`).join('')}${rr.champion ? ' <span class="pill gold">🏆 Mistrz</span>' : ''}</div>`;
        }).join('')}</div>
        <div class="card"><div class="section-title">🏛️ Hall of Fame</div>${s.hof.length ? s.hof.slice().reverse().map(h => `<div class="item-row" style="margin-bottom:6px"><div style="width:120px"><b>${esc(PW.World.region(h.region).name)}</b><div class="tiny muted">${new Date(h.date).toLocaleDateString('pl-PL')}</div></div><div class="row" style="gap:0">${h.team.map(t => `<span title="${esc(t.name)} Lv${t.lvl}">${UI.monImg(t.pid, { shiny: t.shiny, style: 'width:56px;height:56px' })}</span>`).join('')}</div></div>`).join('') : '<div class="muted">Jeszcze nikt tu nie trafił. Zostań Mistrzem!</div>'}</div>
        <div class="card"><div class="section-title">📊 Statystyki</div><table class="tbl">
          ${[['Walki', st.battles], ['Zwycięstwa', st.wins], ['Porażki', st.losses], ['Pokonani trenerzy', st.trainers], ['Złapane Pokémony', st.caught], ['Shiny', st.shinies], ['Wyprawy', st.explore], ['Jaja otrzymane', st.eggs], ['Jaja wyklute', st.hatched], ['Ewolucje', st.evolved], ['Znalezione przedmioty', st.items], ['Zarobione pieniądze', U.money(st.money)], ['Złapane legendy', st.legends], ['Rajdy', st.raids], ['Rekord Battle Factory', s.factory.best]].map(([k, v]) => `<tr><td>${k}</td><td><b>${v}</b></td></tr>`).join('')}
        </table></div>`;
    },
  };

  // ====================================================================== SETTINGS
  S.settings = {
    render(c) {
      const s = Game().s;
      const st = s.settings;
      const chk = (k, label, desc) => `<label class="check"><input type="checkbox" data-k="${k}" ${st[k] ? 'checked' : ''}> <span><b>${label}</b><br><span class="small muted">${desc}</span></span></label>`;
      c.innerHTML = `<div class="card col"><div class="section-title">⚙️ Opcje</div>
          ${chk('ap', 'Punkty Akcji (PA)', 'Wyprawy kosztują PA, które odnawiają się z czasem (jak w PokeWars). Wyłącz, by grać bez limitu.')}
          ${PW.Assets.bundled ? '' : chk('anim', 'Animowane sprite\'y', 'W walkach używaj animowanych sprite\'ów (Pokémon Showdown).')}
          ${chk('cries', 'Odgłosy Pokémonów', 'Odtwarzaj okrzyk Pokémona, gdy pojawia się w walce.')}
          ${chk('nicknames', 'Pytaj o przezwiska', 'Po złapaniu lub wykluciu zaproponuj nadanie przezwiska.')}
          ${chk('scaling', 'Skalowanie trenerów w kolejnych regionach', 'Po zostaniu Mistrzem trenerzy w nowych regionach walczą na twoim poziomie (dzikie Pokémony pozostają oryginalne).')}
          ${chk('expShare', 'Exp. Share', 'Pokémony spoza walki dostają 50% doświadczenia.')}
          <div class="row"><b>Szybkość tekstu w walce</b><select data-sel="textSpeed">${['Wolna', 'Normalna', 'Szybka', 'Błyskawiczna'].map((n, i) => `<option value="${i}" ${st.textSpeed === i ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="row"><b>Slot GBA (Sinnoh, DS)</b><select data-sel="gba" ${Game().isChampion('sinnoh') ? '' : 'disabled'}>${['none', 'ruby', 'sapphire', 'emerald', 'firered', 'leafgreen'].map(n => `<option value="${n}" ${st.gba === n ? 'selected' : ''}>${n === 'none' ? 'Brak' : n}</option>`).join('')}</select><span class="small muted">Dual-slot: po zostaniu Mistrzem Sinnoh pojawiają się Pokémony z gier GBA.</span></div>
          <div class="row"><b>Radio PokéGear (Johto)</b><select data-sel="radio" ${s.flags.radio ? '' : 'disabled'}>${[['off', 'Wyłączone'], ['hoenn', 'Hoenn Sound'], ['sinnoh', 'Sinnoh Sound']].map(([v, n]) => `<option value="${v}" ${st.radio === v ? 'selected' : ''}>${n}</option>`).join('')}</select><span class="small muted">Odblokujesz w Radio Tower (Goldenrod) po zostaniu Mistrzem Johto.</span></div>
        </div>
        <div class="card col"><div class="section-title">💾 Zapis gry</div>
          <p class="small muted">Gra zapisuje się automatycznie w przeglądarce. Ostatni zapis: ${new Date(s.saved).toLocaleString('pl-PL')}.</p>
          <div class="row"><button class="btn primary" id="save">Zapisz teraz</button><button class="btn" id="export">📤 Eksportuj zapis</button><button class="btn" id="import">📂 Importuj zapis</button><input type="file" id="file" class="hidden" accept=".json,.txt">
          <button class="btn" id="title">↩ Ekran tytułowy</button><button class="btn" id="wipe" style="border-color:var(--danger)">🗑 Usuń zapis</button></div></div>`;
      for (const i of c.querySelectorAll('[data-k]')) i.onchange = () => { st[i.dataset.k] = i.checked; Game().save(); UI.updateTop(); };
      for (const i of c.querySelectorAll('[data-sel]')) i.onchange = () => { const v = i.value; st[i.dataset.sel] = /^\d+$/.test(v) ? +v : v; Game().save(); };
      c.querySelector('#save').onclick = () => { Game().save(); UI.toast('Zapisano grę.', 'good'); };
      // Export shows the save as text to copy; a file download is offered only where the page may start one.
      c.querySelector('#export').onclick = () => {
        const text = Game().exportSave();
        const buttons = [{ label: '📋 Kopiuj', cls: 'primary', onClick: m => {
          const ta = m.body.querySelector('textarea');
          const fallback = () => { ta.select(); UI.toast('Zaznaczono zapis – skopiuj go (Ctrl+C).'); };
          try { navigator.clipboard.writeText(text).then(() => UI.toast('Skopiowano zapis.', 'good'), fallback); } catch (e) { fallback(); }
        } }];
        if (!PW.Assets.bundled) buttons.push({ label: '💾 Pobierz plik', onClick: () => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
          a.download = 'pokewedrowka-' + s.player.name + '-' + new Date().toISOString().slice(0, 10) + '.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } });
        buttons.push({ label: 'Zamknij' });
        UI.modal({ title: 'Eksport zapisu', wide: true, buttons,
          body: `<p class="small muted">Skopiuj ten tekst i zachowaj go, np. w notatkach. Wklejisz go w „Importuj zapis”, także na innym urządzeniu.</p>
            <textarea id="save-out" readonly rows="8" style="width:100%;font-family:monospace;font-size:11px">${esc(text)}</textarea>` });
      };
      const load = text => { try { Game().importSave(text.trim()); while (UI.topModal()) UI.topModal().close(); UI.startGame(); UI.toast('Wczytano zapis.', 'good'); } catch (e) { UI.alert('Błąd', 'Nie udało się wczytać zapisu: ' + esc(e.message)); } };
      const file = c.querySelector('#file');
      file.onchange = () => {
        const f = file.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => load(r.result);
        r.readAsText(f);
      };
      c.querySelector('#import').onclick = () => UI.modal({ title: 'Import zapisu', wide: true,
        body: `<p class="small muted">Wklej tekst zapisu albo wybierz plik .json. Obecny postęp zostanie zastąpiony.</p>
          <textarea id="save-in" rows="8" style="width:100%;font-family:monospace;font-size:11px" placeholder="{&quot;player&quot;: …}"></textarea>`,
        buttons: [{ label: 'Wczytaj', cls: 'primary', onClick: m => load(m.body.querySelector('textarea').value) },
          { label: '📂 Z pliku', onClick: m => { m.close(); file.click(); } }, { label: 'Anuluj' }] });
      c.querySelector('#title').onclick = () => { Game().save(); PW.Screens.title.render(); };
      c.querySelector('#wipe').onclick = async () => {
        if (await UI.confirm('Usuń zapis', 'Na pewno usunąć zapis gry? Tej operacji nie da się cofnąć (chyba że masz kopię w pliku).', 'Usuń')) { Game().wipe(); PW.Screens.title.render(); }
      };
    },
  };

  // ====================================================================== BATTLE FACTORY
  const BP_SHOP = [['rare-candy', 2], ['pp-up', 3], ['pp-max', 8], ['bottle-cap', 12], ['gold-bottle-cap', 40], ['ability-capsule', 15], ['ability-patch', 50],
    ['adamant-mint', 10], ['modest-mint', 10], ['jolly-mint', 10], ['timid-mint', 10], ['bold-mint', 10], ['calm-mint', 10], ['choice-band', 25], ['choice-specs', 25],
    ['choice-scarf', 25], ['life-orb', 25], ['focus-sash', 20], ['leftovers', 20], ['assault-vest', 25], ['weakness-policy', 20], ['destiny-knot', 20], ['everstone', 5],
    ['exp-candy-xl', 15], ['master-ball', 150], ['shiny-charm', 300]];
  S.factory = {
    render(c) {
      const s = Game().s;
      const f = s.factory;
      if (!Game().anyChampion()) { c.innerHTML = '<div class="card empty">Battle Factory otwiera się dla Mistrzów Ligi.</div>'; return; }
      if (f.active && f.active.pick) return S.factory.pickScreen(c);
      c.innerHTML = `<div class="card"><div class="section-title">🏭 Battle Factory</div>
          <p>W Fabryce Walk nie liczą się twoje wytrenowane Pokémony – dostajesz losowe Pokémony do wypożyczenia. Wybierz 3 z 6, wygraj serię 7 walk i zdobywaj Battle Points (BP). Po każdej wygranej możesz wymienić jednego Pokémona na Pokémona przeciwnika.</p>
          <div class="row"><span class="chip">Seria: <b>${f.streak}</b></span><span class="chip">Rekord: <b>${f.best}</b></span><span class="chip">BP: <b>${s.player.bp}</b></span></div>
          <div class="row" style="margin-top:12px">${f.active ? `<button class="btn primary lg" id="cont">▶ Kontynuuj serię (${f.active.wins}/7)</button><button class="btn" id="quit">Zakończ serię</button>` : `<button class="btn primary lg" data-lv="50">Poziom 50</button><button class="btn blue lg" data-lv="100">Open Level (100)</button>`}</div></div>
        <div class="card"><div class="section-title">🛍️ Sklep BP</div><div class="col">${BP_SHOP.map(([k, cost]) => { const id = I(k); if (!id) return ''; return `<div class="item-row">${UI.itemImg(id)}<div class="grow"><div class="n">${esc(Dex.item(id).n)}</div><div class="d">${esc(PW.Items.desc(id))}</div></div><b>${cost} BP</b><button class="btn sm" data-bp="${k}" data-cost="${cost}">Kup</button></div>`; }).join('')}</div></div>`;
      for (const b of c.querySelectorAll('[data-lv]')) b.onclick = () => { f.active = { lv: +b.dataset.lv, wins: 0, pick: true, rentals: S.factory.rentals(+b.dataset.lv, 6, f.streak), team: [] }; S.factory.render(c); };
      const cont = c.querySelector('#cont');
      if (cont) cont.onclick = () => S.factory.next(c);
      const quit = c.querySelector('#quit');
      if (quit) quit.onclick = () => { f.active = null; f.streak = 0; S.factory.render(c); };
      for (const b of c.querySelectorAll('[data-bp]')) b.onclick = () => {
        const cost = +b.dataset.cost;
        if (s.player.bp < cost) return UI.toast('Za mało BP.', 'bad');
        s.player.bp -= cost; Game().addItem(I(b.dataset.bp), 1, true);
        UI.toast('Kupiono ' + Dex.item(I(b.dataset.bp)).n + '!', 'good'); S.factory.render(c);
      };
    },
    rentals(lv, n, streak) {
      const pool = Object.keys(Dex.data.pokemon).map(Number).filter(pid => {
        const p = Dex.mon(pid); const sp = Dex.species(p.s);
        return pid < 10000 && !sp.leg && !sp.myth && !(sp.evo && sp.evo.length) && p.b.reduce((a, b) => a + b, 0) >= 420 && !PW.Catch.ULTRA_BEASTS.includes(p.k);
      });
      const iv = Math.min(31, 8 + Math.floor(streak / 7) * 6);
      return U.shuffle(pool).slice(0, n).map(pid => Mon.create({ pid, level: lv, moves: PW.World.bestMoves(pid, 100), ivs: [iv, iv, iv, iv, iv, iv], ot: 'Factory', friendship: 255 }));
    },
    pickScreen(c) {
      const f = Game().s.factory;
      const a = f.active;
      c.innerHTML = `<div class="card"><div class="section-title">🏭 Wybierz 3 Pokémony do wypożyczenia (${a.team.length}/3)</div>
        <div class="grid g2">${a.rentals.map((m, i) => `<div data-i="${i}" style="${a.team.includes(i) ? 'outline:3px solid var(--yellow);border-radius:12px' : ''}">${UI.monCard(m, `<div class="tiny">${m.moves.map(x => esc(Dex.move(x.id).n)).join(', ')}<br>${esc(Dex.ability(Mon.abilityId(m)).n)} · ${esc(Dex.nature(m.nat).n)}</div>`)}</div>`).join('')}</div>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="go" ${a.team.length === 3 ? '' : 'disabled'}>Rozpocznij serię</button></div></div>`;
      for (const d of c.querySelectorAll('[data-i]')) d.onclick = () => {
        const i = +d.dataset.i;
        const k = a.team.indexOf(i);
        if (k >= 0) a.team.splice(k, 1); else if (a.team.length < 3) a.team.push(i);
        S.factory.pickScreen(c);
      };
      c.querySelector('#go').onclick = () => { a.pick = false; a.mons = a.team.map(i => a.rentals[i]); S.factory.next(c); };
    },
    next(c) {
      const s = Game().s;
      const f = s.factory;
      const a = f.active;
      for (const m of a.mons) Mon.heal(m);
      const foeTeam = S.factory.rentals(a.lv, 3, f.streak + 3);
      const trainer = U.pick(['acetrainer', 'veteran', 'psychic', 'blackbelt', 'beauty', 'gentleman', 'scientist']);
      const name = PW.World.trainerName(trainer);
      UI.play({
        prelude: 'Battle Factory – walka ' + (a.wins + 1) + '/7! Przeciwnik: ' + name + '.',
        battle: { kind: 'trainer', playerTeam: a.mons, foe: { name, title: PW.World.CLASSES[trainer][0], sprite: PW.World.CLASSES[trainer][1], team: foeTeam, ai: f.streak >= 14 ? 'champion' : 'elite', prize: 0 }, tag: 'factory',
          onEnd(res) {
            if (res !== 'win') {
              const st = f.streak; f.best = Math.max(f.best, f.streak); f.streak = 0; f.active = null;
              return { title: 'Koniec serii', text: 'Seria zakończona na ' + st + ' zwycięstwach. Rekord: ' + f.best + '.', img: { icon: '🏭' }, choices: [] };
            }
            a.wins++; f.streak++; f.best = Math.max(f.best, f.streak);
            PW.Quests.checkAch();
            if (a.wins >= 7) {
              const bp = 3 + Math.floor(f.streak / 7) * 2;
              s.player.bp += bp;
              a.wins = 0;
              a.rentals = S.factory.rentals(a.lv, 6, f.streak); a.team = []; a.pick = true;
              return { title: 'Seria 7 zwycięstw!', text: 'Zdobywasz ' + bp + ' BP! Twoja seria trwa: ' + f.streak + '. Wybierz nowe Pokémony na kolejną rundę.', img: { icon: '🏆' }, gain: true, choices: [{ label: 'Dalej', run: () => { UI.go('factory'); return null; } }] };
            }
            return { title: 'Wygrana! (' + a.wins + '/7)', text: 'Czy chcesz wymienić jednego Pokémona na Pokémona przeciwnika?', img: { icon: '🔁' },
              choices: foeTeam.map(fm => ({ label: 'Weź ' + Dex.mon(fm.pid).n, run: () => ({ title: 'Kogo oddajesz?', text: 'Wybierz Pokémona do oddania:', choices: a.mons.map((mm, j) => ({ label: Dex.mon(mm.pid).n, run: () => { a.mons[j] = fm; return { title: 'Wymieniono', text: 'Do drużyny dołącza ' + Dex.mon(fm.pid).n + '.', choices: [{ label: 'Następna walka', run: () => { S.factory.next(c); return null; } }] }; } })) }) }))
                .concat([{ label: 'Bez wymiany – następna walka', run: () => { S.factory.next(c); return null; } }, { label: 'Przerwa', run: () => null }]) };
          } },
      });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
