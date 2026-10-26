/* Cheat screen: command console, toggles, Pokémon editor and quick item/Pokémon adding. */
(function (G) {
  'use strict';
  const PW = G.PW;
  const UI = PW.UI, U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const S = PW.Screens;
  const esc = U.esc;
  const Game = () => PW.Game;
  const C = () => PW.Cheats;

  const QUICK = ['pomoc', 'ulecz', 'pa', 'kasa 999999', 'pakiet kule', 'pakiet leki', 'pakiet kamienie', 'pakiet bilety', 'tm all', 'pokedex all', 'prezent reset'];
  const TOGGLE_PL = [['catchAll', 'Każdy rzut łapie', 'Poké Ball zawsze łapie dzikiego Pokémona.'],
    ['shiny', 'Same shiny', 'Każdy dziki Pokémon jest błyszczący.'],
    ['ohko', 'Nokaut jednym ciosem', 'Twoje ataki od razu pokonują przeciwnika.'],
    ['noWild', 'Bez dzikich Pokémonów', 'Szukanie w trawie nie wywołuje dzikich walk.'],
    ['noTrainers', 'Bez przypadkowych trenerów', 'Na trasach nie zaczepiają cię trenerzy.']];

  // Datalists of names for the inputs (keys as values, so forms stay unambiguous).
  function datalists() {
    if (S.cheats._dl) return S.cheats._dl;
    const L = C().lists();
    const opt = list => list.map(x => `<option value="${esc(x.k)}">${esc(x.n)}</option>`).join('');
    S.cheats._dl = `<datalist id="dl-mons">${opt(L.mons)}</datalist><datalist id="dl-items">${opt(L.items)}</datalist><datalist id="dl-moves">${opt(L.moves)}</datalist>`;
    return S.cheats._dl;
  }

  S.cheats = {
    log: [],
    hist: [], hi: -1,
    render(c) {
      if (!C().enabled()) { c.innerHTML = '<div class="card empty">Cheaty są wyłączone. Włącz je w Opcjach.</div>'; return; }
      const st = C().state();
      const s = Game().s;
      c.innerHTML = `${datalists()}
        <div class="card"><div class="section-title">🛠️ Konsola</div>
          <div class="console-out" id="cout">${S.cheats.logHtml()}</div>
          <form id="cform" class="row" style="margin-top:8px"><input id="cin" class="grow" autocomplete="off" spellcheck="false" placeholder="np. item rare candy 10 · pokemon mew 50 shiny · iv 1 max (pomoc = lista)"><button class="btn primary">Wykonaj</button></form>
          <div class="row" style="gap:6px;margin-top:8px">${QUICK.map(q => `<button class="btn sm" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        </div>
        <div class="card"><div class="section-title">⚙️ Przełączniki</div>
          ${TOGGLE_PL.map(([k, label, desc]) => `<label class="check"><input type="checkbox" data-t="${k}" ${st[k] ? 'checked' : ''}> <span><b>${label}</b><br><span class="small muted">${desc}</span></span></label>`).join('')}
          <div class="row"><b>Mnożnik doświadczenia</b><select id="c-exp">${[1, 2, 3, 5, 10, 25].map(n => `<option value="${n}" ${st.expMult === n ? 'selected' : ''}>×${n}</option>`).join('')}</select></div>
          <div class="row"><b>Pora dnia</b><select id="c-time">${[['', 'według zegara'], ['morning', 'rano'], ['day', 'dzień'], ['night', 'noc']].map(([v, n]) => `<option value="${v}" ${(st.time || '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        </div>
        <div class="card"><div class="section-title">🧬 Edytor Pokémonów <span class="small muted right">kliknij Pokémona</span></div>
          <div class="grid g2">${s.party.filter(m => !m.egg).map(m => `<div data-ed="${m.uid}">${UI.monCard(m)}</div>`).join('')}</div>
          <h3 style="margin-top:12px">Dodaj Pokémona</h3>
          <form id="addmon" class="row" style="gap:6px">
            <input id="am-sp" list="dl-mons" placeholder="gatunek, np. garchomp" class="grow" autocomplete="off">
            <input id="am-lv" type="number" min="1" max="100" value="50" style="width:80px" title="Poziom">
            <select id="am-nat">${Dex.data.core.natures.map((n, i) => `<option value="${i}">${esc(n.n)}</option>`).join('')}</select>
            <label class="check"><input type="checkbox" id="am-sh"> shiny</label>
            <label class="check"><input type="checkbox" id="am-iv"> IV 31</label>
            <button class="btn primary">Dodaj</button></form>
        </div>
        <div class="card"><div class="section-title">🎒 Dodaj przedmiot</div>
          <form id="additem" class="row" style="gap:6px"><input id="ai-it" list="dl-items" placeholder="przedmiot, np. master-ball" class="grow" autocomplete="off">
            <input id="ai-n" type="number" min="1" max="999" value="1" style="width:90px"><button class="btn primary">Dodaj</button></form>
        </div>`;
      const out = c.querySelector('#cout');
      out.scrollTop = out.scrollHeight;
      const input = c.querySelector('#cin');
      const exec = line => {
        if (!line.trim()) return;
        const r = C().run(line);
        S.cheats.log.push({ cmd: line, ok: r.ok, msg: r.msg });
        S.cheats.hist.unshift(line); S.cheats.hi = -1;
        UI.updateTop(); UI.renderNav();
        S.cheats.render(c);
        const inp = c.querySelector('#cin');
        if (inp) inp.focus();
      };
      c.querySelector('#cform').onsubmit = e => { e.preventDefault(); exec(input.value); };
      input.onkeydown = e => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const h = S.cheats.hist;
          S.cheats.hi = U.clamp(S.cheats.hi + (e.key === 'ArrowUp' ? 1 : -1), -1, h.length - 1);
          input.value = S.cheats.hi >= 0 ? h[S.cheats.hi] : '';
        }
      };
      for (const b of c.querySelectorAll('[data-q]')) b.onclick = () => exec(b.dataset.q);
      for (const i of c.querySelectorAll('[data-t]')) i.onchange = () => { st[i.dataset.t] = i.checked; C().mark(); };
      c.querySelector('#c-exp').onchange = e => { st.expMult = +e.target.value; C().mark(); };
      c.querySelector('#c-time').onchange = e => { st.time = e.target.value || null; C().mark(); UI.updateTop(); };
      for (const d of c.querySelectorAll('[data-ed]')) d.onclick = () => S.cheats.editor(Game().findMon(d.dataset.ed), () => S.cheats.render(c));
      c.querySelector('#addmon').onsubmit = e => {
        e.preventDefault();
        const sp = c.querySelector('#am-sp').value;
        const pid = C().findMon(sp);
        if (!pid) { UI.toast('Nie znam Pokémona: ' + sp, 'bad'); return; }
        const nat = Dex.nature(+c.querySelector('#am-nat').value).n;
        const r = C().run(['pokemon', Dex.mon(pid).k, c.querySelector('#am-lv').value || 50, nat,
          c.querySelector('#am-sh').checked ? 'shiny' : '', c.querySelector('#am-iv').checked ? 'max' : ''].join(' '));
        UI.toast(r.msg, r.ok ? 'good' : 'bad');
        S.cheats.render(c);
      };
      c.querySelector('#additem').onsubmit = e => {
        e.preventDefault();
        const r = C().run('item ' + c.querySelector('#ai-it').value + ' ' + (c.querySelector('#ai-n').value || 1));
        UI.toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) c.querySelector('#ai-it').value = '';
      };
    },

    logHtml() {
      const intro = '<div class="muted">Wpisz <b>pomoc</b>, by zobaczyć wszystkie komendy. Slot = miejsce Pokémona w drużynie (1–6). Strzałki ↑/↓ przywołują poprzednie komendy.</div>';
      return intro + S.cheats.log.slice(-60).map(l => `<div><span class="c-cmd">&gt; ${esc(l.cmd)}</span>\n<span class="${l.ok ? 'c-ok' : 'c-err'}">${esc(l.msg)}</span></div>`).join('');
    },

    // Full editor for one Pokémon: species/form, level, nature, ability, IVs, EVs, moves, item and more.
    editor(m, done) {
      if (!m) return;
      const p = Dex.mon(m.pid);
      const stats = Mon.stats(m);
      const num = (id, v, min, max, w) => `<input id="${id}" type="number" min="${min}" max="${max}" value="${v}" style="width:${w || 70}px">`;
      const body = `${datalists()}<div class="col" style="gap:8px">
        <div class="row" style="gap:6px"><b style="width:110px">Gatunek / forma</b><input id="e-sp" list="dl-mons" value="${esc(p.k)}" class="grow" autocomplete="off"></div>
        <div class="row" style="gap:6px"><b style="width:110px">Przezwisko</b><input id="e-nick" value="${esc(m.nick || '')}" maxlength="12" class="grow"></div>
        <div class="row" style="gap:6px"><b style="width:110px">Poziom</b>${num('e-lv', m.lvl, 1, 100)}
          <b>Przyjaźń</b>${num('e-fr', m.fr, 0, 255)}
          <label class="check"><input type="checkbox" id="e-sh" ${m.shiny ? 'checked' : ''}> shiny ✨</label>
          <select id="e-g">${[['M', '♂'], ['F', '♀'], ['', '—']].map(([v, n]) => `<option value="${v}" ${(m.gender || '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="row" style="gap:6px"><b style="width:110px">Natura</b><select id="e-nat">${Dex.data.core.natures.map((n, i) => `<option value="${i}" ${m.nat === i ? 'selected' : ''}>${esc(n.n)}${n.up ? ' (+' + Dex.STAT_PL[n.up] + ' −' + Dex.STAT_PL[n.down] + ')' : ''}</option>`).join('')}</select>
          <b>Zdolność</b><select id="e-ab">${p.a.map((id, i) => id ? `<option value="${i}" ${m.abil === i ? 'selected' : ''}>${esc(Dex.ability(id).n)}${i === 2 ? ' (ukryta)' : ''}</option>` : '').join('')}</select></div>
        <div class="row" style="gap:6px"><b style="width:110px">Trzyma</b><input id="e-it" list="dl-items" value="${m.item ? esc(Dex.item(m.item).k) : ''}" placeholder="brak" class="grow" autocomplete="off">
          <b>Tera</b><select id="e-tera">${Dex.data.core.types.map((t, i) => `<option value="${i}" ${m.tera === i ? 'selected' : ''}>${esc(Dex.TYPE_PL[t])}</option>`).join('')}</select></div>
        <table class="tbl"><tr><th>Statystyka</th><th>IV (0–31)</th><th>EV (0–252)</th><th>Wartość</th></tr>
          ${[0, 1, 2, 3, 4, 5].map(i => `<tr><td>${Dex.STAT_PL[i]}</td><td>${num('e-iv' + i, m.iv[i], 0, 31, 64)}</td><td>${num('e-ev' + i, m.ev[i], 0, 252, 72)}</td><td class="num"><b>${stats[i]}</b></td></tr>`).join('')}</table>
        <div class="row" style="gap:6px"><button class="btn sm" id="e-ivmax">IV wszystkie 31</button><button class="btn sm" id="e-evclr">EV wyczyść</button>
          <span class="tiny muted">EV powyżej 510 łącznie to już poza zasadami gier, ale cheaty na to pozwalają.</span></div>
        <div class="col" style="gap:4px"><b>Ruchy</b>${[0, 1, 2, 3].map(i => `<input id="e-mv${i}" list="dl-moves" value="${m.moves[i] ? esc(Dex.move(m.moves[i].id).k) : ''}" placeholder="pusty" autocomplete="off">`).join('')}</div>
      </div>`;
      UI.modal({ title: '🧬 ' + esc(Mon.name(m)), body, wide: true,
        onOpen(md) {
          const q = id => md.body.querySelector('#' + id);
          q('e-ivmax').onclick = () => { for (let i = 0; i < 6; i++) q('e-iv' + i).value = 31; };
          q('e-evclr').onclick = () => { for (let i = 0; i < 6; i++) q('e-ev' + i).value = 0; };
        },
        buttons: [{ label: 'Zapisz', cls: 'primary', onClick: md => {
          const q = id => md.body.querySelector('#' + id);
          const pid = C().findMon(q('e-sp').value);
          if (!pid) { UI.toast('Nie znam gatunku: ' + q('e-sp').value, 'bad'); return; }
          const itemQ = q('e-it').value.trim();
          const item = itemQ ? C().findItem(itemQ) : null;
          if (itemQ && !item) { UI.toast('Nie znam przedmiotu: ' + itemQ, 'bad'); return; }
          const moves = [0, 1, 2, 3].map(i => q('e-mv' + i).value.trim()).filter(Boolean).map(v => C().findMove(v));
          if (moves.some(x => !x)) { UI.toast('Któryś ruch ma nieznaną nazwę.', 'bad'); return; }
          if (!moves.length) { UI.toast('Pokémon musi znać przynajmniej jeden ruch.', 'bad'); return; }
          C().edit(m, {
            pid, nick: q('e-nick').value.trim(), lvl: q('e-lv').value, fr: q('e-fr').value, shiny: q('e-sh').checked, gender: q('e-g').value,
            nat: q('e-nat').value, abil: Dex.mon(pid).a[+q('e-ab').value] ? q('e-ab').value : 0, item, tera: q('e-tera').value,
            iv: [0, 1, 2, 3, 4, 5].map(i => q('e-iv' + i).value), ev: [0, 1, 2, 3, 4, 5].map(i => q('e-ev' + i).value), moves,
          });
          md.close();
          UI.toast('Zapisano: ' + Mon.name(m) + ' · ' + Mon.stats(m).join('/'), 'good');
          if (done) done();
        } }, { label: 'Anuluj' }],
      });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
