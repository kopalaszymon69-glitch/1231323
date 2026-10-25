/* Screens: team, Pokémon summary, PC boxes, Day Care, Move Reminder, Tera type change. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const esc = U.esc;
  const S = PW.Screens;
  const UI = PW.UI;
  const Game = () => PW.Game;
  const STAT_COLORS = ['#ff5959', '#f5ac78', '#fae078', '#9db7f5', '#a7db8d', '#fa92b2'];

  // Polish description of an evolution condition row.
  UI.evoText = function (r) {
    const parts = [];
    const it = id => (Dex.item(id) || { n: '?' }).n;
    switch (r.trig) {
      case 'level-up': parts.push(r.lvl ? 'Poziom ' + r.lvl : 'Awans na poziom'); break;
      case 'use-item': parts.push('Użyj: ' + it(r.item)); break;
      case 'trade': parts.push('Wymiana (lub Linking Cord)'); break;
      case 'shed': parts.push('Pojawia się przy ewolucji Nincady (wolne miejsce + Poké Ball)'); break;
      case 'spin': parts.push('Trzymając słodycz, zakręć się (Linking Cord nie działa)'); break;
      case 'tower-of-darkness': return 'Pokonaj Tower of Darkness (Master Dojo)';
      case 'tower-of-waters': return 'Pokonaj Tower of Waters (Master Dojo)';
      case 'three-critical-hits': return '3 trafienia krytyczne w jednej walce';
      case 'take-damage': return 'Otrzymaj 49+ obrażeń i odwiedź Dusty Bowl';
      case 'three-defeated-bisharp': return 'Pokonaj 3 Bisharpy trzymając Leader\'s Crest';
      case 'gimmighoul-coins': return 'Zbierz 999 Gimmighoul Coin i awansuj';
      case 'recoil-damage': return 'Otrzymaj 294 HP odrzutu i awansuj';
      case 'use-move': case 'agile-style-move': case 'strong-style-move': parts.push('Użyj ' + (Dex.move(r.usedMove) || { n: '?' }).n + ' ' + (r.moveCount || 20) + '×'); break;
      default: parts.push(r.trig);
    }
    if (r.happy) parts.push('wysoka przyjaźń');
    if (r.affection) parts.push('wysoka przyjaźń');
    if (r.time) parts.push(({ day: 'w dzień', night: 'w nocy', dusk: 'o zmierzchu (17–18)' })[r.time] || r.time);
    if (r.gender) parts.push(r.gender === 1 ? 'tylko samica' : 'tylko samiec');
    if (r.held) parts.push('trzymając ' + it(r.held));
    if (r.move) parts.push('znając ' + (Dex.move(r.move) || { n: '?' }).n);
    if (r.moveType !== undefined) parts.push('znając ruch typu ' + Dex.typeName(r.moveType));
    if (r.relStats !== undefined) parts.push(r.relStats > 0 ? 'Atak > Obrona' : r.relStats < 0 ? 'Atak < Obrona' : 'Atak = Obrona');
    if (r.partySpecies) parts.push('z ' + Dex.species(r.partySpecies).n + ' w drużynie');
    if (r.partyType !== undefined) parts.push('z Pokémonem typu ' + Dex.typeName(r.partyType) + ' w drużynie');
    if (r.tradeSpecies) parts.push('za ' + Dex.species(r.tradeSpecies).n);
    if (r.rain) parts.push('w deszczu');
    if (r.upsideDown) parts.push('konsola do góry nogami');
    if (r.specialRock || r.location) parts.push('w specjalnym miejscu (' + (PW.Mon.SPECIAL_PLACES.moss.includes(r.location) ? 'Mchowy Kamień' : PW.Mon.SPECIAL_PLACES.ice.includes(r.location) ? 'Lodowy Kamień' : 'pole magnetyczne') + ')');
    if (r.region) parts.push('w regionie ' + (['', 'Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Hisui', 'Paldea'][r.region]));
    if (r.steps) parts.push('po ' + r.steps + ' krokach');
    if (r.beauty) parts.push('wysokie Beauty');
    if (r.natures !== undefined) parts.push('zależnie od natury');
    if (r.chance) parts.push('losowo');
    return parts.join(', ');
  };

  // ====================================================================== TEAM
  S.team = {
    render(c) {
      const s = Game().s;
      c.innerHTML = `<div class="card"><div class="section-title">🎒 Drużyna (${s.party.length}/6)
          <span class="right small muted">Kliknij Pokémona, by zobaczyć szczegóły</span></div>
        <div class="grid g2" id="party">${s.party.map((m, i) => `<div data-i="${i}">${UI.monCard(m)}</div>`).join('')}</div>
        </div>
        <div class="card"><div class="small muted">Kolejność drużyny: pierwszy Pokémon walczy jako pierwszy. Exp. Share jest zawsze włączony – Pokémony spoza walki dostają 50% doświadczenia (zgodnie z 9. generacją).</div></div>`;
      for (const d of c.querySelectorAll('[data-i]')) d.onclick = () => S.team.detail(s.party[+d.dataset.i]);
    },

    detail(m, tab) {
      tab = tab || 'info';
      const s = Game().s;
      const inParty = s.party.includes(m);
      const p = Dex.mon(m.pid);
      const sp = Dex.species(p.s);
      const tabs = m.egg ? ['info'] : ['info', 'stats', 'moves', 'evo'];
      const body = document.createElement('div');
      const draw = () => {
        let inner = '';
        if (m.egg) {
          inner = `<div class="center">${UI.eggImg('font-size:120px')}<p>${m.eggSteps > 2000 ? 'To jajo jeszcze długo się nie wykluje.' : m.eggSteps > 800 ? 'Czasem coś się w nim porusza.' : 'Słychać dźwięki ze środka!'}</p><p class="small muted">Jaja wykluwają się podczas wypraw, gdy są w drużynie. Pokémon z Flame Body / Magma Armor przyspiesza wykluwanie.</p></div>`;
        } else if (tab === 'info') {
          const nat = Dex.nature(m.nat);
          const eNat = Dex.nature(m.mint !== undefined && m.mint !== null ? m.mint : m.nat);
          const ab = Dex.ability(Mon.abilityId(m));
          const impl = ab && PW.BD.IMPLEMENTED_ABILITIES.has(ab.k);
          const hearts = Math.round(m.fr / 255 * 5);
          inner = `
            <div class="row" style="align-items:flex-start">
              <div class="center" style="width:210px">${UI.monImg(m.pid, { shiny: m.shiny, art: true, cls: 'big-sprite' })}</div>
              <div class="col grow" style="min-width:220px">
                <div><span class="muted">#${String(p.s).padStart(4, '0')}</span> <b style="font-size:20px">${esc(Mon.name(m))}</b> ${UI.gender(m.gender)} ${m.shiny ? '<span class="shiny-star">★ shiny</span>' : ''}</div>
                <div>${esc(p.n)} · <i>${esc(sp.gn)}</i></div>
                <div>${UI.types(p.t)} ${PW.Game.s.region === 'paldea' || Game().has('tera-orb') ? `<span class="pill">Tera: ${esc(Dex.typeName(m.tera))}</span>` : ''}</div>
                <div>Poziom <b>${m.lvl}</b> · EXP ${m.exp.toLocaleString('pl-PL')} ${m.lvl < 100 ? '· do awansu: ' + Mon.expToNext(m).toLocaleString('pl-PL') : ''}</div>
                <div class="exp" style="height:7px"><div style="width:${Mon.expProgress(m) * 100}%"></div></div>
                <div>HP ${m.hp}/${Mon.maxHp(m)} ${m.hp <= 0 ? '<span class="status st-fnt">FNT</span>' : UI.status(m.st)}</div>
                <div>Natura: <b>${esc(nat.n)}</b> ${nat.up ? `<span class="nat-up">+${Dex.STAT_PL[nat.up]}</span> <span class="nat-down">−${Dex.STAT_PL[nat.down]}</span>` : '<span class="muted">(neutralna)</span>'}${eNat !== nat ? ` · Mięta: <b>${esc(eNat.n)}</b>` : ''}</div>
                <div>Zdolność: <b>${esc(ab ? ab.n : '?')}</b>${m.abil === 2 ? ' <span class="pill">ukryta</span>' : ''} ${impl ? '' : '<span class="pill" title="Efekt tej zdolności nie jest symulowany w walce">opis</span>'}<div class="small muted">${esc(ab ? ab.d : '')}</div></div>
                <div>Przyjaźń: ${'❤'.repeat(hearts)}${'♡'.repeat(5 - hearts)} <span class="small muted">(${m.fr}/255)</span> ${m.pkrs ? '<span class="pill">Pokérus</span>' : ''}</div>
                <div>Przedmiot: ${m.item ? UI.itemImg(m.item, 'width:24px;height:24px;vertical-align:middle') + ' <b>' + esc(PW.Items.name(m.item)) + '</b>' : '<span class="muted">brak</span>'}</div>
                <div class="small muted">Trener: ${esc(m.ot || '?')} (ID ${String(m.tid !== undefined ? m.tid : '?').padStart(5, '0')}) · Gra: ${esc(PW.Shiny.langName(PW.Shiny.lang(m)))}${m.fateful ? ' · ✦ wydarzenie' : ''} · Ball: ${esc(PW.Items.name(m.ball))}${m.met ? ' · Spotkany: ' + esc(PW.World.locName(m.met.r, m.met.l)) + (m.met.lvl ? ' (Lv ' + m.met.lvl + ')' : '') : ''}</div>
              </div>
            </div>`;
        } else if (tab === 'stats') {
          const st = Mon.stats(m);
          const nat = Dex.nature(m.mint !== undefined && m.mint !== null ? m.mint : m.nat);
          const total = p.b.reduce((a, b) => a + b, 0);
          inner = `<div class="col" style="gap:6px">
            <div class="stat-row small muted"><span>Statystyka</span><span>Bazowa</span><span></span><span>Wartość</span></div>
            ${st.map((v, i) => `<div class="stat-row"><span class="${nat.up === i ? 'nat-up' : nat.down === i ? 'nat-down' : ''}">${Dex.STAT_PL[i]}</span><span>${p.b[i]}</span>
              <div class="stat-bar"><div style="width:${Math.min(100, p.b[i] / 180 * 100)}%;background:${STAT_COLORS[i]}"></div></div><b>${v}</b></div>`).join('')}
            <div class="small muted">Suma statystyk bazowych: <b>${total}</b></div>
            <table class="tbl" style="margin-top:8px"><tr><th>Stat</th>${Dex.STAT_SHORT.map(x => `<th>${x}</th>`).join('')}</tr>
              <tr><td>IV</td>${m.iv.map((v, i) => `<td>${m.ht && m.ht[i] ? '<span class="gold" title="Hyper Training">31*</span>' : v}</td>`).join('')}</tr>
              <tr><td>EV</td>${m.ev.map(v => `<td>${v}</td>`).join('')}</tr></table>
            <div class="small muted">EV łącznie: ${m.ev.reduce((a, b) => a + b, 0)}/510. IV 0–31 (Hyper Training za Bottle Cap od Lv 50).</div></div>`;
        } else if (tab === 'moves') {
          inner = `<div class="col" style="gap:4px">${m.moves.map((x, i) => `<div>${UI.moveRow(x.id, false, x)}<div class="row" style="gap:4px;margin:-2px 0 8px 4px">
              ${i > 0 ? `<button class="btn sm" data-up="${i}">↑</button>` : ''}${m.moves.length > 1 ? `<button class="btn sm" data-forget="${i}">Zapomnij</button>` : ''}</div></div>`).join('')}
            <div class="row"><button class="btn blue sm" id="teach-tm">💿 Naucz TM</button><span class="small muted">Masz ${Object.keys(s.bag.tms).length} TM.</span></div></div>`;
        } else if (tab === 'evo') {
          inner = S.team.evoChain(m);
        }
        body.innerHTML = `<div class="tabs">${tabs.map(t => `<button class="tab ${t === tab ? 'active' : ''}" data-tab="${t}">${({ info: 'Informacje', stats: 'Statystyki', moves: 'Ruchy', evo: 'Ewolucja' })[t]}</button>`).join('')}</div>${inner}`;
        for (const t of body.querySelectorAll('[data-tab]')) t.onclick = () => { tab = t.dataset.tab; draw(); };
        for (const b of body.querySelectorAll('[data-up]')) b.onclick = () => { const i = +b.dataset.up; [m.moves[i - 1], m.moves[i]] = [m.moves[i], m.moves[i - 1]]; draw(); };
        for (const b of body.querySelectorAll('[data-forget]')) b.onclick = async () => { const i = +b.dataset.forget; if (await UI.confirm('Zapomnij ruch', 'Czy ' + esc(Mon.name(m)) + ' ma zapomnieć ' + esc(Dex.move(m.moves[i].id).n) + '?')) { m.moves.splice(i, 1); draw(); } };
        const tm = body.querySelector('#teach-tm');
        if (tm) tm.onclick = () => S.team.teachTM(m, draw);
        const ev = body.querySelector('#do-evo');
        if (ev) ev.onclick = async () => { const rows = PW.Flow.evoCandidates(m, 'level'); if (rows.length) { md.close(); await UI.evolveFlow(m, rows[0]); UI.refresh(); } };
      };
      const buttons = [];
      if (!m.egg) {
        buttons.push({ label: '✏️ Przezwisko', onClick: async () => { const n = await UI.prompt('Przezwisko', 'Nowe przezwisko (puste = nazwa gatunku):', m.nick || '', 12); if (n !== null) { m.nick = n || null; draw(); UI.refresh(); } } });
        buttons.push({ label: '🧪 Użyj przedmiotu', onClick: () => S.team.useItemOn(m, draw) });
        buttons.push({ label: m.item ? '🎁 Zabierz przedmiot' : '🎁 Daj przedmiot', onClick: () => S.team.toggleHeld(m, draw) });
      }
      if (inParty) {
        buttons.push({ label: '⬆ Na początek', onClick: () => { const i = s.party.indexOf(m); s.party.splice(i, 1); s.party.unshift(m); UI.refresh(); md.close(); } });
        buttons.push({ label: '💻 Do PC', onClick: () => { const r = Game().depositMon(m.uid); if (r === true) { md.close(); UI.refresh(); } else UI.toast(r === 'last' ? 'To twój ostatni zdolny do walki Pokémon.' : 'PC jest pełne.', 'bad'); } });
      } else {
        buttons.push({ label: '🎒 Do drużyny', onClick: () => { const r = Game().withdrawMon(m.uid); if (r === true) { md.close(); UI.refresh(); } else UI.toast('Drużyna jest pełna.', 'bad'); } });
      }
      buttons.push({ label: '🕊 Wypuść', onClick: async () => {
        if (m.starter && !(await UI.confirm('Twój pierwszy partner!', 'To twój startowy Pokémon. Na pewno chcesz go wypuścić?'))) return;
        if (await UI.confirm('Wypuść', 'Wypuścić ' + esc(Mon.name(m)) + ' na wolność? Tej operacji nie da się cofnąć.', 'Wypuść')) { if (Game().releaseMon(m.uid)) { md.close(); UI.toast('Żegnaj, ' + Mon.name(m) + '!'); UI.refresh(); } else UI.toast('Nie można wypuścić ostatniego Pokémona.', 'bad'); }
      } });
      const md = UI.modal({ title: m.egg ? 'Jajo' : esc(Mon.name(m)), body, wide: true, buttons });
      draw();
    },

    evoChain(m) {
      const p = Dex.mon(m.pid);
      let sid = Dex.baseSpecies(p.s);
      const render = (sid, depth) => {
        const s = Dex.species(sid);
        const pid = Dex.defaultForm(sid);
        let html = `<div class="mon-tile" style="min-width:110px">${UI.monImg(pid)}<b>${esc(s.n)}</b></div>`;
        const rows = (s.evo || []).filter(r => !r.from || r.from === m.pid || Dex.mon(r.from).s === sid);
        if (rows.length && depth < 3) {
          html += `<div class="col" style="gap:6px">${rows.map(r => `<div class="evo-stage"><div class="arrow">→<br>${esc(UI.evoText(r))}</div>${render(Dex.mon(r.to).s, depth + 1).replace(/<b>[^<]*<\/b>/, '<b>' + esc(Dex.mon(r.to).n) + '</b>')}</div>`).join('')}</div>`;
        }
        return `<div class="evo-stage">${html}</div>`;
      };
      const can = PW.Flow.evoCandidates(m, 'level');
      return `${render(sid, 0)}
        ${can.length ? `<div class="center" style="margin-top:12px"><button class="btn primary" id="do-evo">✨ Ewoluuj teraz w ${esc(Dex.mon(can[0].to).n)}</button></div>` : ''}
        <p class="small muted">Ewolucje przez wymianę wykonasz przedmiotem Linking Cord (Dom Towarowy). Formy regionalne ewoluują zgodnie z regionem, w którym się znajdujesz.</p>`;
    },

    async teachTM(m, redraw) {
      const s = Game().s;
      const tms = Object.keys(s.bag.tms).map(Number).filter(mid => Dex.canLearnTM(m.pid, mid) && !m.moves.some(x => x.id === mid));
      if (!tms.length) return UI.toast('Brak TM, których ' + Mon.name(m) + ' może się nauczyć.', 'bad');
      const body = document.createElement('div');
      body.className = 'col';
      body.innerHTML = tms.map(mid => `<div data-m="${mid}" style="cursor:pointer">${UI.moveRow(mid)}</div>`).join('');
      const md = UI.modal({ title: 'Naucz TM: ' + esc(Mon.name(m)), body, wide: true });
      for (const d of body.querySelectorAll('[data-m]')) d.onclick = async () => {
        md.close();
        const r = PW.Flow.teachTM(m, +d.dataset.m);
        if (r.text) UI.toast(r.text, r.ok ? 'good' : 'bad');
        await UI.runTasks(r.tasks);
        if (redraw) redraw();
      };
    },

    async useItemOn(m, redraw) {
      const s = Game().s;
      const ids = Object.keys(s.bag.items).map(Number).filter(id => {
        const p = PW.Items.pocketOf(id);
        if (['medicine', 'berries'].includes(p)) return true;
        if (p === 'evo') return (Mon.evolutions(m, PW.Flow.evoCtx('item', { item: id })).length > 0) || PW.Items.key(id) === 'linking-cord';
        return PW.Items.key(id) === 'linking-cord' || (Mon.evolutions(m, PW.Flow.evoCtx('item', { item: id })).length > 0);
      });
      if (!ids.length) return UI.toast('Brak przedmiotów, które można użyć.', 'bad');
      const body = document.createElement('div');
      body.className = 'col';
      body.innerHTML = ids.map(id => `<div class="item-row" data-id="${id}" style="cursor:pointer">${UI.itemImg(id)}<div class="grow"><div class="n">${esc(PW.Items.name(id))} <span class="muted">×${s.bag.items[id]}</span></div><div class="d">${esc(PW.Items.desc(id))}</div></div></div>`).join('');
      const md = UI.modal({ title: 'Użyj przedmiotu na ' + esc(Mon.name(m)), body, wide: true });
      for (const d of body.querySelectorAll('[data-id]')) d.onclick = async () => {
        const id = +d.dataset.id;
        let moveIndex;
        if (PW.Items.needsMove(id)) {
          moveIndex = await S.team.pickMove(m);
          if (moveIndex === null) return;
        }
        md.close();
        const r = PW.Flow.useItem(m, id, moveIndex);
        if (r.text) UI.toast(r.text, r.ok ? 'good' : 'bad');
        await UI.runTasks(r.tasks);
        if (redraw) redraw();
        UI.refresh();
      };
    },
    pickMove(m) {
      return new Promise(res => {
        let v = null;
        const body = document.createElement('div');
        body.className = 'col';
        body.innerHTML = m.moves.map((x, i) => `<div data-i="${i}" style="cursor:pointer">${UI.moveRow(x.id, false, x)}</div>`).join('');
        const md = UI.modal({ title: 'Wybierz ruch', body, onClose: () => res(v) });
        for (const d of body.querySelectorAll('[data-i]')) d.onclick = () => { v = +d.dataset.i; md.close(); };
      });
    },
    async toggleHeld(m, redraw) {
      const s = Game().s;
      if (m.item) {
        Game().addItem(m.item, 1, true);
        UI.toast('Zabrano ' + PW.Items.name(m.item) + '.');
        m.item = null;
        if (redraw) redraw();
        UI.refresh();
        return;
      }
      const ids = Object.keys(s.bag.items).map(Number).filter(id => PW.Items.canHold(id));
      if (!ids.length) return UI.toast('Nie masz przedmiotów do trzymania.', 'bad');
      const body = document.createElement('div');
      body.className = 'col';
      body.innerHTML = ids.map(id => `<div class="item-row" data-id="${id}" style="cursor:pointer">${UI.itemImg(id)}<div class="grow"><div class="n">${esc(PW.Items.name(id))} <span class="muted">×${s.bag.items[id]}</span></div><div class="d">${esc(PW.Items.desc(id))}</div></div></div>`).join('');
      const md = UI.modal({ title: 'Daj przedmiot: ' + esc(Mon.name(m)), body, wide: true });
      for (const d of body.querySelectorAll('[data-id]')) d.onclick = () => {
        const id = +d.dataset.id;
        Game().takeItem(id, 1);
        m.item = id;
        md.close();
        UI.toast(Mon.name(m) + ' trzyma teraz ' + PW.Items.name(id) + '.', 'good');
        if (redraw) redraw();
        UI.refresh();
      };
    },

    // Move Reminder: 1 Heart Scale per move (Gen II–VII rule).
    async reminder() {
      const hs = Dex.itemByKey('heart-scale');
      const m = await UI.pickMon('Któremu Pokémonowi przypomnieć ruch?', x => x.egg ? 'Jajo' : true);
      if (!m) return;
      const known = new Set(m.moves.map(x => x.id));
      const list = Dex.relearnable(m.pid, m.lvl).filter(mid => !known.has(mid)).concat(Dex.evolutionMoves(m.pid).filter(mid => !known.has(mid)));
      const uniq = [...new Set(list)];
      if (!uniq.length) return UI.alert('Przypominacz Ruchów', 'Nie ma ruchów do przypomnienia.');
      const body = document.createElement('div');
      body.className = 'col';
      body.innerHTML = `<p>Koszt: 1 Heart Scale (masz ${Game().count(hs)}).</p>` + uniq.map(mid => `<div data-m="${mid}" style="cursor:pointer">${UI.moveRow(mid)}</div>`).join('');
      const md = UI.modal({ title: 'Przypominacz Ruchów: ' + esc(Mon.name(m)), body, wide: true });
      for (const d of body.querySelectorAll('[data-m]')) d.onclick = async () => {
        if (!Game().takeItem(hs, 1)) return UI.toast('Potrzebujesz Heart Scale (znajdziesz je na plażach i w głębinach).', 'bad');
        md.close();
        await UI.learnMoveFlow(m, +d.dataset.m);
        UI.refresh();
      };
    },
    async teraChange() {
      const m = await UI.pickMon('Któremu Pokémonowi zmienić Typ Tera?', x => x.egg ? 'Jajo' : true);
      if (!m) return;
      const shards = Object.values(Dex.data.items).filter(it => it.k.endsWith('-tera-shard'));
      const body = document.createElement('div');
      body.className = 'grid gauto';
      body.innerHTML = shards.map(it => { const id = Dex.itemByKey(it.k); return `<button class="bitem" data-id="${id}">${UI.itemImg(id)}<span>${esc(it.n)}</span><span class="q">×${Game().count(id)}</span></button>`; }).join('');
      const md = UI.modal({ title: 'Zmiana Typu Tera (50 odłamków)', body, wide: true });
      for (const b of body.querySelectorAll('[data-id]')) b.onclick = () => {
        const id = +b.dataset.id;
        const it = Dex.item(id);
        if (Game().count(id) < 50) return UI.toast('Potrzebujesz 50 × ' + it.n + '.', 'bad');
        const t = Dex.typeIndex(it.k.replace('-tera-shard', ''));
        if (t < 0) return;
        Game().takeItem(id, 50);
        m.tera = t;
        md.close();
        UI.toast('Typ Tera ' + Mon.name(m) + ' to teraz ' + Dex.typeName(t) + '!', 'good');
      };
    },
  };

  // ====================================================================== PC
  S.pc = {
    box: 0, filter: '',
    render(c) {
      const s = Game().s;
      const box = s.boxes[S.pc.box];
      const total = Game().allMons().length;
      const q = S.pc.filter.toLowerCase();
      const mons = box.mons.filter(m => !q || Mon.name(m).toLowerCase().includes(q) || Dex.mon(m.pid).n.toLowerCase().includes(q));
      c.innerHTML = `<div class="card">
          <div class="row"><div class="section-title" style="margin:0">💻 PC Billa</div><span class="muted small">Pokémonów łącznie: ${total}</span>
            <input type="text" id="pc-q" class="right" placeholder="Szukaj…" value="${esc(S.pc.filter)}" style="width:160px"></div>
          <div class="region-tabs" style="margin-top:10px">${s.boxes.map((b, i) => `<button class="region-tab ${i === S.pc.box ? 'active' : ''}" data-b="${i}">${esc(b.name)} (${b.mons.length})</button>`).join('')}</div>
        </div>
        <div class="card"><div class="row"><h3 style="margin:0">${esc(box.name)}</h3><button class="btn sm" id="rename">Zmień nazwę</button><span class="right small muted">${box.mons.length}/${PW.Game.BOX_SIZE}</span></div>
          <div class="grid gauto-s" style="margin-top:10px">${mons.map(m => `<div class="mon-tile" data-u="${m.uid}">${m.shiny ? '<span class="shiny-star" style="position:absolute;left:6px;top:4px">★</span>' : ''}${UI.monThumb(m)}<b>${esc(Mon.name(m))}</b><span class="num">Lv ${m.lvl}</span></div>`).join('') || '<div class="empty">Puste pudło.</div>'}</div>
        </div>
        <div class="card"><h3>Drużyna</h3><div class="grid gauto-s">${s.party.map(m => `<div class="mon-tile" data-u="${m.uid}">${UI.monThumb(m)}<b>${esc(Mon.name(m))}</b><span class="num">Lv ${m.lvl}</span></div>`).join('')}</div></div>`;
      for (const b of c.querySelectorAll('[data-b]')) b.onclick = () => { S.pc.box = +b.dataset.b; S.pc.render(c); };
      for (const t of c.querySelectorAll('[data-u]')) t.onclick = () => S.team.detail(Game().findMon(t.dataset.u));
      c.querySelector('#rename').onclick = async () => { const n = await UI.prompt('Nazwa pudła', 'Nowa nazwa:', box.name, 16); if (n) { box.name = n; S.pc.render(c); } };
      const qi = c.querySelector('#pc-q');
      qi.oninput = () => { S.pc.filter = qi.value; clearTimeout(S.pc._t); S.pc._t = setTimeout(() => { S.pc.render(c); const n = c.querySelector('#pc-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    },
  };

  // ====================================================================== DAY CARE
  S.daycare = {
    render(c) {
      const s = Game().s;
      const dc = s.daycare;
      const comp = dc.mons.length === 2 ? PW.Breeding.compat(dc.mons[0], dc.mons[1]) : null;
      c.innerHTML = `<div class="card"><div class="section-title">🥚 Hodowla Pokémonów</div>
        <p class="muted">Zostaw tu dwa Pokémony. Zdobywają 1 pkt doświadczenia za każdy krok (opłata przy odbiorze: ₽100 + ₽100 za poziom). Kompatybilna para (wspólna grupa jaj lub Ditto) może złożyć jajo – IV, natura (Everstone), zdolność, Poké Ball i ruchy z jaja są dziedziczone jak w grach.</p>
        <div class="grid g2">${[0, 1].map(i => dc.mons[i] ? `<div data-w="${dc.mons[i].uid}">${UI.monCard(dc.mons[i], '<button class="btn sm">Odbierz</button>')}<div class="tiny muted">Grupy jaj: ${Dex.speciesOf(dc.mons[i].pid).eg.map(g => Dex.data.core.eggGroups[g]).join(', ')}</div></div>` : `<div class="mon-card" data-dep="1" style="justify-content:center;min-height:100px">➕ Zostaw Pokémona</div>`).join('')}</div>
        ${comp !== null ? `<p><b>Opiekun:</b> "${PW.Breeding.compatText(comp)}"</p>` : ''}
        ${comp ? (PW.Shiny.masudaRolls(dc.mons[0], dc.mons[1]) ? `<p class="gold">✨ Metoda Masudy: Pokémony pochodzą z gier w różnych językach, więc jajo ma większą szansę na shiny (${PW.Shiny.oddsText(PW.Shiny.chance(6 + (Game().has('shiny-charm') ? 2 : 0)))}).</p>`
          : '<p class="tiny muted">Metoda Masudy: para z gier w różnych językach (np. Ditto od turysty z zagranicy) daje sześć razy większą szansę na shiny.</p>') : ''}
        ${dc.egg ? `<div class="card" style="border-color:var(--gold)"><b>🥚 Opiekun znalazł jajo!</b> <button class="btn yellow" id="take-egg">Odbierz jajo</button></div>` : ''}
        </div>`;
      for (const d of c.querySelectorAll('[data-dep]')) d.onclick = async () => {
        const m = await UI.pickMon('Którego Pokémona zostawić?', x => x.egg ? 'Jajo' : true);
        if (!m) return;
        const r = PW.Breeding.deposit(m.uid);
        if (r !== true) UI.toast(r === 'last' ? 'Nie możesz zostawić ostatniego Pokémona.' : 'Brak miejsca.', 'bad');
        S.daycare.render(c);
      };
      for (const d of c.querySelectorAll('[data-w]')) d.onclick = () => {
        const r = PW.Breeding.withdraw(d.dataset.w);
        if (r === 'full') UI.toast('Drużyna jest pełna.', 'bad');
        else if (r === 'money') UI.toast('Nie masz dość pieniędzy.', 'bad');
        else if (r) UI.toast('Odebrano Pokémona (opłata ' + U.money(r.cost) + ', +' + r.levels + ' poz.).', 'good');
        S.daycare.render(c); UI.updateTop();
      };
      const te = c.querySelector('#take-egg');
      if (te) te.onclick = () => { const r = PW.Breeding.collectEgg(); if (r === 'full') UI.toast('Drużyna jest pełna.', 'bad'); else UI.toast('Otrzymujesz jajo!', 'good'); S.daycare.render(c); };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
