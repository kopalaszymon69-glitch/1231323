/* UI core: layout, navigation, modals, toasts, shared widgets and the scene runner. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const esc = U.esc;

  const NAV = [
    ['location', '📍', 'Lokacja'], ['map', '🗺️', 'Mapa'], ['team', '🎒', 'Drużyna'], ['bag', '👜', 'Plecak'],
    ['pc', '💻', 'PC'], ['dex', '📕', 'Pokédex'], ['quests', '📜', 'Zadania'], ['profile', '🏅', 'Profil'], ['settings', '⚙️', 'Opcje'],
  ];

  const Screens = PW.Screens = {};
  const UI = PW.UI = {
    cur: 'location', params: {},
    el: null,
    busy: false,

    init() {
      UI.el = document.getElementById('app');
      const report = (msg) => { console.error(msg); UI.busy = false; UI.toast('Błąd: ' + String(msg).slice(0, 140), 'bad'); };
      window.addEventListener('error', e => report(e.message));
      window.addEventListener('unhandledrejection', e => report(e.reason && (e.reason.stack || e.reason.message) || e.reason));
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && UI.topModal()) UI.topModal().close(); });
      setInterval(() => { if (PW.Game.s) { PW.Game.tickAP(); UI.updateTop(); } }, 5000);
      setInterval(() => { if (PW.Game.s) PW.Game.s.play += 30; }, 30000);
      if (PW.Game.load()) UI.startGame(); else Screens.title.render();
    },

    startGame() {
      UI.layout();
      PW.Quests.daily();
      UI.go('location');
    },

    layout() {
      UI.el.innerHTML = `
        <header class="topbar">
          <div class="logo" onclick="PW.UI.go('location')">POKÉ<span>WĘDRÓWKA</span></div>
          <div class="tb-stats" id="tb"></div>
        </header>
        <div class="main">
          <nav class="nav" id="nav"></nav>
          <section class="content" id="content"></section>
        </div>
        <nav class="mobile-nav" id="mnav"></nav>
        <div class="toasts" id="toasts"></div>`;
      UI.renderNav();
      UI.updateTop();
    },

    renderNav() {
      const html = NAV.map(([id, ic, label]) => `<button data-go="${id}" class="${UI.cur === id ? 'active' : ''}"><span class="ic">${ic}</span><span>${label}</span>${id === 'quests' && UI.questBadge() ? `<span class="badge-count">${UI.questBadge()}</span>` : ''}</button>`).join('');
      const nav = document.getElementById('nav'), mnav = document.getElementById('mnav');
      if (nav) nav.innerHTML = html;
      if (mnav) mnav.innerHTML = html;
      for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => UI.go(b.dataset.go);
    },
    questBadge() {
      try { return PW.Quests.daily().filter(q => q.done && !q.claimed).length || ''; } catch (e) { return ''; }
    },

    updateTop() {
      const tb = document.getElementById('tb');
      const s = PW.Game.s;
      if (!tb || !s) return;
      PW.Game.tickAP();
      const p = s.player;
      const apMax = PW.Game.apMax();
      const reg = PW.World.hereRegion();
      const loc = PW.World.here();
      const w = loc ? PW.World.weather(s.region, loc) : null;
      const tod = U.timeOfDay();
      const todIcon = { morning: '🌅', day: '☀️', night: '🌙' }[tod];
      const nextAp = s.settings.ap && p.ap < apMax ? Math.ceil((PW.Game.apRegenMs - (Date.now() - p.apTs)) / 1000) : 0;
      tb.innerHTML = `
        <span class="chip hide-m" title="Region i lokacja">${reg ? esc(reg.name) : ''} · ${loc ? esc(loc.n) : ''}</span>
        <span class="chip" title="Pora dnia (czas rzeczywisty) i pogoda">${todIcon}${w ? ' ' + w.icon : ''}</span>
        <span class="chip" title="Pieniądze">💰 <b>${U.money(p.money)}</b></span>
        ${s.settings.ap ? `<span class="chip" title="Punkty Akcji – odnawiają się z czasem${nextAp ? ' (następny za ' + nextAp + ' s)' : ''}">⚡ <b>${p.ap}</b>/${apMax}<span class="apbar hide-m"><div style="width:${Math.min(100, p.ap / apMax * 100)}%"></div></span></span>` : ''}
        <span class="trainer-mini" onclick="PW.UI.go('profile')" title="Poziom trenera ${p.tlvl}">
          ${UI.trainerImg(p.avatar, 'width:34px;height:34px')}
          <span><b>${esc(p.name)}</b><br><span class="tiny muted">Poz. ${p.tlvl}</span><div class="lvlbar"><div style="width:${Math.min(100, p.texp / PW.Game.texpNeeded(p.tlvl) * 100)}%"></div></div></span>
        </span>`;
    },

    go(screen, params) {
      if (UI.busy) return;
      UI.cur = screen;
      UI.params = params || {};
      UI.renderNav();
      UI.render();
      window.scrollTo(0, 0);
    },
    render() {
      const c = document.getElementById('content');
      if (!c) return;
      const sc = Screens[UI.cur] || Screens.location;
      try { sc.render(c, UI.params); } catch (e) { console.error(e); c.innerHTML = `<div class="card"><h2>Błąd</h2><pre class="small">${esc(e.stack || e)}</pre></div>`; }
      UI.updateTop();
      PW.Game.autosave();
    },
    refresh() { UI.renderNav(); UI.render(); },

    // ------------------------------------------------------------------ widgets
    imgFallback(img) {
      const list = (img.dataset.fb || '').split('|').filter(Boolean);
      if (!list.length) { img.onerror = null; img.style.visibility = 'hidden'; return; }
      img.src = list.shift();
      img.dataset.fb = list.join('|');
      if (img.dataset.flipfb === '1') img.classList.add('flip');
    },
    monImg(pid, o) {
      o = o || {};
      const base = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
      const sh = o.shiny ? 'shiny/' : '';
      let src, fb = [];
      if (o.art) { src = base + 'other/official-artwork/' + sh + pid + '.png'; fb = [base + 'other/home/' + sh + pid + '.png', base + sh + pid + '.png']; }
      else if (o.anim && PW.Game.s && PW.Game.s.settings.anim !== false) {
        src = base + 'other/showdown/' + (o.back ? 'back/' : '') + sh + pid + '.gif';
        fb = o.back ? [base + 'back/' + sh + pid + '.png', base + 'other/showdown/' + sh + pid + '.gif', base + sh + pid + '.png'] : [base + sh + pid + '.png', base + 'other/home/' + sh + pid + '.png'];
      } else if (o.back) { src = base + 'back/' + sh + pid + '.png'; fb = [base + sh + pid + '.png']; }
      else { src = base + sh + pid + '.png'; fb = [base + 'other/home/' + sh + pid + '.png', base + 'other/official-artwork/' + pid + '.png']; }
      const cls = (o.cls || '') + (o.art ? '' : ' px');
      return `<img class="${cls}" src="${src}" data-fb="${fb.join('|')}" ${o.back ? 'data-flipfb="1"' : ''} alt="${esc(Dex.mon(pid) ? Dex.mon(pid).n : '')}" loading="lazy" onerror="PW.UI.imgFallback(this)" style="${o.style || ''}">`;
    },
    eggImg(style) { return `<span style="font-size:44px;${style || ''}">🥚</span>`; },
    monThumb(m, style) { return m.egg ? UI.eggImg(style) : UI.monImg(m.pid, { shiny: m.shiny, style }); },
    trainerImg(sprite, style) {
      return `<img class="px" src="${Dex.trainerSprite(sprite)}" data-fb="${Dex.trainerSprite('youngster')}" onerror="PW.UI.imgFallback(this)" style="${style || ''}" alt="">`;
    },
    itemImg(id, style) {
      if (typeof id === 'string' && id.startsWith('tm')) {
        const mv = Dex.move(+id.slice(2));
        return `<img class="px" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/tm-${mv ? Dex.typeKey(mv.t) : 'normal'}.png" data-fb="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/tm-normal.png" onerror="PW.UI.imgFallback(this)" style="${style || ''}" alt="">`;
      }
      const it = Dex.item(id);
      if (!it) return '';
      const k = it.k.replace(/-z$/, '-z--held');
      return `<img class="px" src="${Dex.itemSprite(id)}" data-fb="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${k}.png|https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png" onerror="PW.UI.imgFallback(this)" style="${style || ''}" alt="">`;
    },
    type(t, sm) { const k = typeof t === 'number' ? Dex.typeKey(t) : t; return `<span class="type t-${k}${sm ? ' sm' : ''}">${Dex.TYPE_PL[k] || k}</span>`; },
    types(arr, sm) { return arr.map(t => UI.type(t, sm)).join(' '); },
    status(st) { return st ? `<span class="status st-${st}">${PW.BD.STATUS_PL[st]}</span>` : ''; },
    hpClass(f) { return f > 0.5 ? '' : f > 0.2 ? 'mid' : 'low'; },
    hpBar(hp, max) { const f = max ? hp / max : 0; return `<div class="hp ${UI.hpClass(f)}"><div style="width:${Math.max(0, f * 100)}%"></div></div>`; },
    gender(g) { return g === 'M' ? '<span class="gender-M">♂</span>' : g === 'F' ? '<span class="gender-F">♀</span>' : ''; },
    badge(type, off) {
      const color = getComputedStyle(document.documentElement).getPropertyValue('--t-' + type) || '#888';
      return `<span class="badge-icon${off ? ' off' : ''}" style="background:radial-gradient(circle at 35% 30%, #fff8, transparent 45%), ${color}">${({ rock: '◆', water: '💧', electric: '⚡', grass: '🌿', poison: '☠', psychic: '👁', fire: '🔥', ground: '⛰', flying: '🪶', bug: '🐞', normal: '●', ghost: '👻', fighting: '👊', steel: '⚙', ice: '❄', dragon: '🐉', dark: '🌑', fairy: '✿' })[type] || '★'}</span>`;
    },
    monCard(m, extra) {
      if (m.egg) {
        const sp = Dex.speciesOf(m.pid);
        const left = Math.max(0, m.eggSteps);
        const msg = left > 2000 ? 'Jajo jeszcze długo się nie wykluje.' : left > 800 ? 'Czasem coś się w nim porusza.' : 'Słychać dźwięki ze środka! Zaraz się wykluje!';
        void sp;
        return `<div class="mon-card" data-uid="${m.uid}"><div class="sprite">${UI.eggImg()}</div><div class="info"><div class="name">Jajo</div><div class="small muted">${msg}</div></div>${extra || ''}</div>`;
      }
      const p = Dex.mon(m.pid);
      const max = Mon.maxHp(m);
      return `<div class="mon-card ${m.hp <= 0 ? 'fainted' : ''}" data-uid="${m.uid}">
        <div class="sprite">${UI.monImg(m.pid, { shiny: m.shiny })}</div>
        <div class="info">
          <div class="name">${m.shiny ? '<span class="shiny-star">★</span> ' : ''}${esc(Mon.name(m))} ${UI.gender(m.gender)} ${m.pkrs ? '<span class="pill" title="Pokérus">PKRS</span>' : ''}</div>
          <div class="lvl">Poz. ${m.lvl} ${m.nick ? '· ' + esc(p.n) : ''} ${m.hp <= 0 ? '<span class="status st-fnt">FNT</span>' : UI.status(m.st)}</div>
          <div class="row" style="gap:4px;margin:3px 0">${UI.types(p.t, true)}</div>
          ${UI.hpBar(m.hp, max)}
          <div class="row small" style="justify-content:space-between"><span class="muted">HP ${m.hp}/${max}</span></div>
          <div class="exp"><div style="width:${Mon.expProgress(m) * 100}%"></div></div>
        </div>
        ${m.item ? `<span class="held" title="${esc(PW.Items.name(m.item))}">${UI.itemImg(m.item, 'width:24px;height:24px')}</span>` : ''}
        ${extra || ''}
      </div>`;
    },

    // ------------------------------------------------------------------ toasts & modals
    toast(text, kind) {
      const box = document.getElementById('toasts');
      if (!box) return;
      const d = document.createElement('div');
      d.className = 'toast ' + (kind || '');
      d.textContent = text;
      box.appendChild(d);
      setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 400); }, 3200);
    },
    modals: [],
    topModal() { return UI.modals[UI.modals.length - 1]; },
    // opts: {title, body (html string), wide, buttons:[{label, cls, onClick(close) }], onClose, noClose}
    modal(opts) {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}">
        ${opts.title !== undefined ? `<div class="mh"><h3>${opts.title}</h3>${opts.noClose ? '' : '<button class="close-x" aria-label="Zamknij">×</button>'}</div>` : ''}
        <div class="mb"></div><div class="mf"></div></div>`;
      const mb = ov.querySelector('.mb');
      if (typeof opts.body === 'string') mb.innerHTML = opts.body; else if (opts.body) mb.appendChild(opts.body);
      const m = { el: ov, body: mb, closed: false };
      m.close = (v) => {
        if (m.closed) return;
        m.closed = true;
        ov.remove();
        UI.modals.splice(UI.modals.indexOf(m), 1);
        if (opts.onClose) opts.onClose(v);
      };
      const mf = ov.querySelector('.mf');
      for (const b of (opts.buttons || [])) {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (b.cls || '');
        btn.innerHTML = b.label;
        btn.onclick = () => b.onClick ? b.onClick(m) : m.close();
        mf.appendChild(btn);
      }
      if (!(opts.buttons || []).length) mf.remove();
      const x = ov.querySelector('.close-x');
      if (x) x.onclick = () => m.close();
      if (!opts.noClose) ov.addEventListener('mousedown', e => { if (e.target === ov) m.close(); });
      document.body.appendChild(ov);
      UI.modals.push(m);
      if (opts.onOpen) opts.onOpen(m);
      return m;
    },
    alert(title, html) { return new Promise(res => UI.modal({ title, body: html, buttons: [{ label: 'OK', cls: 'primary', onClick: m => m.close() }], onClose: res })); },
    confirm(title, html, yes, no) {
      return new Promise(res => {
        let val = false;
        UI.modal({ title, body: html, buttons: [{ label: no || 'Anuluj', onClick: m => { val = false; m.close(); } }, { label: yes || 'Tak', cls: 'primary', onClick: m => { val = true; m.close(); } }], onClose: () => res(val) });
      });
    },
    prompt(title, label, def, max) {
      return new Promise(res => {
        let val = null;
        UI.modal({
          title, body: `<div class="col"><label>${label}</label><input type="text" id="prompt-in" maxlength="${max || 12}" value="${esc(def || '')}"></div>`,
          buttons: [{ label: 'Anuluj', onClick: m => m.close() }, { label: 'OK', cls: 'primary', onClick: m => { val = m.el.querySelector('#prompt-in').value.trim(); m.close(); } }],
          onClose: () => res(val), onOpen: m => { const i = m.el.querySelector('#prompt-in'); i.focus(); i.select(); i.onkeydown = e => { if (e.key === 'Enter') { val = i.value.trim(); m.close(); } }; },
        });
      });
    },
    // Lets the player pick a party Pokémon. filter(m) -> true/false or string reason.
    pickMon(title, filter, list) {
      return new Promise(res => {
        let val = null;
        const mons = list || PW.Game.s.party;
        const body = document.createElement('div');
        body.className = 'col';
        body.innerHTML = mons.map(m => {
          const ok = filter ? filter(m) : true;
          return `<div data-uid="${m.uid}" style="${ok === true ? '' : 'opacity:.45'}">${UI.monCard(m, ok === true ? '' : `<span class="small muted">${typeof ok === 'string' ? esc(ok) : ''}</span>`)}</div>`;
        }).join('') || '<div class="empty">Brak Pokémonów.</div>';
        const md = UI.modal({ title, body, onClose: () => res(val) });
        for (const el of body.querySelectorAll('[data-uid]')) {
          el.onclick = () => {
            const m = mons.find(x => x.uid === el.dataset.uid);
            if (filter && filter(m) !== true) return;
            val = m; md.close();
          };
        }
      });
    },

    // ------------------------------------------------------------------ scenes
    sceneImg(img) {
      if (!img) return '';
      if (img.mon) return `<div class="scene-img">${UI.monImg(img.mon, { shiny: img.shiny, art: true, style: 'width:150px;height:150px' })}</div>`;
      if (img.trainer) return `<div class="scene-img">${UI.trainerImg(img.trainer, 'height:130px')}</div>`;
      if (img.item) return `<div class="scene-img">${UI.itemImg(img.item, 'width:72px;height:72px')}</div>`;
      if (img.tm) return `<div class="scene-img">${UI.itemImg('tm' + img.tm, 'width:72px;height:72px')}</div>`;
      if (img.badge) return `<div class="scene-img">${UI.badge(img.badge)}</div>`;
      if (img.icon) return `<div class="scene-img"><span class="emoji">${img.icon}</span></div>`;
      return '';
    },
    // Runs a scene chain: dialogs, choices, battles and their follow-ups.
    async play(sc) {
      let guard = 0;
      while (sc && guard++ < 50) {
        if (sc.ui) { await UI.special(sc.ui); sc = null; break; }
        if (sc.battle) {
          let out = null;
          try { out = await PW.BattleUI.run(sc.battle, sc.prelude); }
          catch (e) { console.error(e); PW.BattleUI.close(); UI.busy = false; UI.toast('Błąd walki: ' + e.message, 'bad'); }
          sc = out;
          continue;
        }
        sc = await UI.sceneDialog(sc);
      }
      PW.Quests.checkAch();
      UI.refresh();
    },
    sceneDialog(sc) {
      return new Promise(res => {
        let next = null;
        const body = `${UI.sceneImg(sc.img)}<div class="scene-text">${sc.text || ''}</div>${sc.choices && sc.choices.length ? '<div class="scene-choices"></div>' : ''}`;
        const md = UI.modal({
          title: esc(sc.title || ''), body,
          buttons: sc.choices && sc.choices.length ? [] : [{ label: 'Dalej', cls: 'primary', onClick: m => m.close() }],
          onClose: async () => {
            if (sc.nickname && PW.Game.s.settings.nicknames) await UI.nicknameFlow(sc.nickname);
            res(next);
          },
        });
        if (sc.gain) md.el.querySelector('.modal').classList.add('gain-glow');
        const box = md.el.querySelector('.scene-choices');
        if (box) {
          sc.choices.forEach(ch => {
            const b = document.createElement('button');
            b.className = 'btn block ' + (ch.cls || '');
            b.innerHTML = esc(ch.label);
            b.onclick = () => { try { next = ch.run ? ch.run() : null; } catch (e) { console.error(e); next = null; } md.close(); };
            box.appendChild(b);
          });
        }
      });
    },
    async nicknameFlow(uid) {
      const m = PW.Game.findMon(uid);
      if (!m) return;
      const name = await UI.prompt('Przezwisko', 'Czy chcesz nadać przezwisko Pokémonowi ' + esc(Dex.mon(m.pid).n) + '? (zostaw puste, by pominąć)', '', 12);
      if (name) m.nick = name;
    },
    async special(kind) {
      if (kind === 'reminder') return Screens.team.reminder();
      if (kind === 'factory') return UI.go('factory');
      if (kind === 'tera') return Screens.team.teraChange();
    },

    // ------------------------------------------------------------------ tasks after battles / items
    async runTasks(tasks) {
      for (const t of tasks || []) {
        const m = PW.Game.findMon(t.uid);
        if (!m) continue;
        if (t.type === 'learn') for (const mid of t.moves) await UI.learnMoveFlow(m, mid);
        if (t.type === 'evolve') await UI.evolveFlow(m, t.row, t.force);
        if (t.type === 'nickname') await UI.nicknameFlow(t.uid);
      }
      UI.refresh();
    },
    learnMoveFlow(m, mid) {
      return new Promise(res => {
        const mv = Dex.move(mid);
        if (m.moves.some(x => x.id === mid)) return res();
        if (m.moves.length < 4) { Mon.learnMove(m, mid); UI.toast(Mon.name(m) + ' uczy się ' + mv.n + '!', 'good'); return res(); }
        const body = `<p>${esc(Mon.name(m))} chce nauczyć się <b>${esc(mv.n)}</b>, ale zna już 4 ruchy. Który zapomnieć?</p>
          ${UI.moveRow(mid, true)}<hr style="border-color:var(--line)"><div class="col" id="lm"></div>`;
        const md = UI.modal({ title: 'Nowy ruch', body, onClose: () => res() });
        const box = md.el.querySelector('#lm');
        m.moves.forEach((x, i) => {
          const d = document.createElement('div');
          d.innerHTML = UI.moveRow(x.id, false, x);
          d.style.cursor = 'pointer';
          d.onclick = () => { const old = Dex.move(x.id).n; Mon.learnMove(m, mid, i); UI.toast('1, 2 i... Puf! ' + Mon.name(m) + ' zapomina ' + old + ' i uczy się ' + mv.n + '!', 'good'); md.close(); };
          box.appendChild(d);
        });
        const no = document.createElement('button');
        no.className = 'btn block';
        no.textContent = 'Nie ucz się ' + mv.n;
        no.onclick = () => md.close();
        box.appendChild(no);
      });
    },
    moveRow(mid, highlight, slot) {
      const mv = Dex.move(mid);
      if (!mv) return '';
      return `<div class="move-row" ${highlight ? 'style="border-color:var(--yellow)"' : ''}>
        ${UI.type(mv.t, true)} <span class="pill">${Dex.CLASS_PL[mv.c]}</span>
        <span class="mn">${esc(mv.n)}</span>
        <span class="meta right">Moc ${mv.p || '—'} · Cel. ${mv.a || '—'}${slot ? ' · PP ' + slot.pp + '/' + Mon.maxPP(slot) : ' · PP ' + mv.pp}</span>
      </div><div class="tiny muted" style="margin:2px 4px 6px">${esc(mv.d || mv.sd || '')}</div>`;
    },
    evolveFlow(m, row, force) {
      return new Promise(res => {
        const before = Mon.name(m), fromPid = m.pid;
        const body = `<div class="center"><p>Co? ${esc(before)} ewoluuje!</p><div class="evolve-anim" id="evo-img">${UI.monImg(m.pid, { shiny: m.shiny, art: true, style: 'width:180px;height:180px' })}</div></div>`;
        let cancelled = false;
        const md = UI.modal({ title: 'Ewolucja', body, noClose: true, buttons: force ? [] : [{ label: 'Przerwij (B)', onClick: mm => { cancelled = true; mm.close(); } }] });
        setTimeout(async () => {
          if (cancelled) { UI.toast('Ewolucja ' + before + ' została przerwana.'); return res(); }
          const ev = PW.Flow.doEvolve(m, row);
          const box = md.el.querySelector('#evo-img');
          if (box) box.innerHTML = UI.monImg(m.pid, { shiny: m.shiny, art: true, style: 'width:180px;height:180px' });
          md.el.querySelector('.mb p').innerHTML = `Gratulacje! ${esc(before)} ewoluował w <b>${esc(Dex.mon(m.pid).n)}</b>!` + (ev.extra ? ` <br>W Poké Ballu pojawia się też ${esc(Dex.mon(ev.extra.pid).n)}!` : '');
          const mf = md.el.querySelector('.mf') || document.createElement('div');
          mf.className = 'mf'; mf.innerHTML = '';
          const ok = document.createElement('button');
          ok.className = 'btn primary'; ok.textContent = 'Super!';
          ok.onclick = async () => { md.close(); for (const mid of ev.learned) UI.toast(Mon.name(m) + ' uczy się ' + Dex.move(mid).n + '!', 'good'); for (const mid of ev.pending) await UI.learnMoveFlow(m, mid); res(); };
          mf.appendChild(ok);
          md.el.querySelector('.modal').appendChild(mf);
          void fromPid;
        }, 2600);
      });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
