/* Battle screen: renders the engine's event stream with animations and collects the player's choices. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};
  const U = PW.U, Dex = PW.Dex, Mon = PW.Mon;
  const esc = U.esc;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const BattleUI = PW.BattleUI = {
    b: null, el: null, spec: null, gim: {}, resolveTurn: null, skip: false,

    speed() { const s = PW.Game.s.settings; return [1.6, 1.15, 0.8, 0.5][s.textSpeed !== undefined ? s.textSpeed : 1] || 1; },

    // Runs a full battle; resolves with the follow-up scene (or null).
    async run(spec, prelude) {
      const b = PW.Flow.createBattle(spec);
      BattleUI.b = b; BattleUI.spec = spec; BattleUI.gim = {};
      PW.UI.busy = true;
      BattleUI.build(spec);
      if (prelude) await BattleUI.say(prelude, true);
      let evs = b.start();
      if (spec.foe.raid) evs = evs.concat(PW.Flow.setupRaid(b));
      await BattleUI.process(evs);
      while (!b.over) {
        if (b.needSwitch) {
          const idx = await BattleUI.choosePartyForced();
          await BattleUI.process(b.choosePlayerSwitch(idx));
          continue;
        }
        const action = await BattleUI.chooseAction();
        if (!action) continue;
        BattleUI.gim = {};
        await BattleUI.process(b.turnPlayer(action));
      }
      await sleep(400 * BattleUI.speed());
      const out = PW.Flow.endBattle(b, spec);
      BattleUI.close();
      PW.UI.busy = false;
      if (out.text.length) await PW.UI.alert(b.result === 'lose' ? 'Porażka...' : 'Po walce', `<div class="scene-text">${out.text.map(esc).join('<br>')}</div>`);
      await PW.UI.runTasks(out.tasks);
      PW.UI.updateTop();
      let next = null;
      if (spec.onEnd) { try { next = spec.onEnd(b.result, b); } catch (e) { console.error(e); } }
      return next;
    },

    build(spec) {
      const s = PW.Game.s;
      const loc = PW.World.here();
      const kind = loc ? loc.k : 'route';
      const gym = ['gym', 'league', 'champion', 'gym-trainer'].includes(spec.tag);
      const night = U.timeOfDay() === 'night' && !['cave', 'building', 'tower'].includes(kind);
      const wrap = document.createElement('div');
      wrap.className = 'battle-wrap';
      wrap.innerHTML = `
        <div class="battle">
          <div class="arena kind-${kind} ${gym ? 'gym' : ''} ${night ? 'night' : ''}">
            <div class="sky"></div>
            <div class="terrain-glow" id="b-terrain"></div>
            <div class="wfx" id="b-wfx"></div>
            <div class="field-tags" id="b-field"></div>
            <div class="trainer-sprite" id="b-trainer"></div>
            <div class="plat foe"></div><div class="plat me"></div>
            <div class="bmon foe gone" id="b-foe"></div>
            <div class="bmon me gone" id="b-me"></div>
            <img class="ball-anim px" id="b-ball" alt="">
            <div class="binfo foe hidden" id="i-foe"></div>
            <div class="binfo me hidden" id="i-me"></div>
            <button class="btn sm skip-btn ghost" id="b-skip" title="Przyspiesz animacje">⏩</button>
          </div>
          <div class="bpanel">
            <div class="bmsg" id="b-msg"></div>
            <div class="bmenu hidden" id="b-menu"></div>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      BattleUI.el = wrap;
      BattleUI.state = { foe: null, me: null };
      wrap.querySelector('#b-skip').onclick = () => { BattleUI.skip = !BattleUI.skip; wrap.querySelector('#b-skip').classList.toggle('primary', BattleUI.skip); };
      if (spec.kind === 'trainer' && spec.foe.sprite) {
        const t = wrap.querySelector('#b-trainer');
        t.innerHTML = PW.UI.trainerImg(spec.foe.sprite, '');
        t.classList.add('show');
      }
      void s;
    },
    close() { if (BattleUI.el) BattleUI.el.remove(); BattleUI.el = null; },
    $(id) { return BattleUI.el.querySelector(id); },

    // ------------------------------------------------------------------ messages
    async say(text, wait) {
      const box = BattleUI.$('#b-msg');
      box.classList.remove('wait');
      const sp = BattleUI.skip ? 0.25 : BattleUI.speed();
      box.textContent = '';
      // Typewriter
      const chars = [...text];
      const step = Math.max(1, Math.floor(chars.length / (24 / Math.max(0.3, sp))));
      for (let i = 0; i < chars.length; i += step) {
        box.textContent = chars.slice(0, i + step).join('');
        await sleep(14 * sp);
      }
      box.textContent = text;
      if (wait) {
        box.classList.add('wait');
        await new Promise(r => { let done = false; const fin = () => { if (done) return; done = true; box.onclick = null; r(); }; box.onclick = fin; setTimeout(fin, 2600 * sp + 400); });
        box.classList.remove('wait');
      } else {
        await sleep((520 + Math.min(900, text.length * 14)) * sp);
      }
    },

    // ------------------------------------------------------------------ rendering
    info(side) {
      const b = BattleUI.b;
      const bt = b.sides[side].active;
      const el = BattleUI.$(side === 0 ? '#i-me' : '#i-foe');
      if (!bt) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      const m = bt.mon;
      const st = BattleUI.state[side === 0 ? 'me' : 'foe'] || {};
      const hp = st.hp !== undefined ? st.hp : m.hp;
      const max = st.max || bt.maxHp;
      const p = Dex.mon(m.pid);
      const caught = side === 1 && b.kind === 'wild' && PW.Game.s.dex.caught[p.s];
      const tags = [];
      if (bt.v.tera !== undefined) tags.push(`<span class="type sm t-${Dex.typeKey(bt.v.tera)}">TERA ${esc(Dex.typeName(bt.v.tera))}</span>`);
      if (bt.v.dyna) tags.push('<span class="pill" style="background:#ff2a6d;color:#fff">DYNAMAX</span>');
      const boosts = bt.stages.map((v, i) => v && i ? `<span class="pill" style="background:${v > 0 ? '#2b7' : '#c44'};color:#fff">${['', 'Atk', 'Def', 'SpA', 'SpD', 'Spe', 'Cel', 'Unik'][i]} ${v > 0 ? '+' : ''}${v}</span>` : '').join('');
      const balls = b.kind === 'trainer' ? `<div class="balls">${b.sides[side].team.map(x => `<span class="${x.hp <= 0 ? 'out' : ''}"></span>`).join('')}</div>` : '';
      el.innerHTML = `
        <div class="bn">${caught ? '<span title="Złapany">◓</span>' : ''}${m.shiny ? '<span class="shiny-star">★</span>' : ''}${esc(Mon.name(m))} ${PW.UI.gender(m.gender)} <span class="bl">Lv${m.lvl}</span></div>
        <div class="hpline"><span class="lbl">HP</span>${PW.UI.hpBar(hp, max)}</div>
        ${side === 0 ? `<div class="row" style="justify-content:space-between"><span>${PW.UI.status(m.st)}</span><span class="hpnum">${Math.max(0, hp)}/${max}</span></div><div class="exp"><div style="width:${Mon.expProgress(m) * 100}%"></div></div>` : `<div class="row">${PW.UI.status(m.st)}</div>`}
        <div class="tags">${tags.join('')}${boosts}</div>${balls}`;
    },
    sprite(side, pid, shiny, enter) {
      const el = BattleUI.$(side === 0 ? '#b-me' : '#b-foe');
      el.className = 'bmon ' + (side === 0 ? 'me' : 'foe');
      el.innerHTML = PW.UI.monImg(pid, { shiny, back: side === 0, anim: true });
      if (enter) { el.classList.add('enter'); setTimeout(() => el.classList.remove('enter'), 500); }
      const bt = BattleUI.b.sides[side].active;
      if (bt && bt.v.dyna) el.classList.add('dyna');
      if (bt && bt.v.tera !== undefined) el.classList.add('tera');
    },
    flash(side, cls, ms) {
      const el = BattleUI.$(side === 0 ? '#b-me' : '#b-foe');
      el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), ms || 500);
    },
    field() {
      const b = BattleUI.b;
      const w = b.field.weather;
      const wfx = BattleUI.$('#b-wfx');
      wfx.className = 'wfx ' + (w || '');
      BattleUI.$('#b-terrain').className = 'terrain-glow ' + (b.field.terrain || '');
      const tags = [];
      if (w) tags.push(PW.BD.WEATHER_PL[w] || w);
      if (b.field.terrain) tags.push(PW.BD.TERRAIN_PL[b.field.terrain]);
      if (b.field.trickRoom) tags.push('Trick Room');
      for (const s of b.sides) {
        const c = s.conds, who = s.isPlayer ? 'Ty' : 'Wróg';
        if (c.reflect) tags.push(who + ': Reflect'); if (c.lightScreen) tags.push(who + ': Light Screen'); if (c.auroraVeil) tags.push(who + ': Aurora Veil');
        if (c.tailwind) tags.push(who + ': Tailwind'); if (c.rocks) tags.push(who + ': Kamienie'); if (c.spikes) tags.push(who + ': Kolce ×' + c.spikes);
        if (c.tspikes) tags.push(who + ': Trujące kolce'); if (c.web) tags.push(who + ': Sieć');
      }
      BattleUI.$('#b-field').innerHTML = tags.map(t => `<span class="chip">${esc(t)}</span>`).join('');
    },

    async process(events) {
      for (const e of events || []) {
        const sp = BattleUI.skip ? 0.25 : BattleUI.speed();
        switch (e.t) {
          case 'msg': await BattleUI.say(e.text); break;
          case 'switch': {
            const key = e.side === 0 ? 'me' : 'foe';
            BattleUI.state[key] = { hp: e.hp, max: e.max };
            if (e.side === 1) BattleUI.$('#b-trainer').classList.remove('show');
            BattleUI.sprite(e.side, e.pid, e.shiny, true);
            BattleUI.info(e.side);
            if (PW.Game.s.settings.cries) BattleUI.cry(e.pid);
            if (e.side === 1) PW.Game.markSeen(e.pid);
            await sleep(350 * sp);
            break;
          }
          case 'hp': {
            const key = e.side === 0 ? 'me' : 'foe';
            BattleUI.state[key] = { hp: e.hp, max: e.max };
            BattleUI.info(e.side);
            await sleep(450 * sp);
            break;
          }
          case 'anim':
            if (e.kind === 'attack') { BattleUI.flash(e.side, 'attack', 380); await sleep(250 * sp); }
            else if (e.kind === 'hit') { BattleUI.flash(e.side, 'hit', 480); await sleep(260 * sp); }
            else if (e.kind === 'stat-up') { BattleUI.flash(e.side, 'statup', 620); BattleUI.info(e.side); }
            else if (e.kind === 'stat-down') { BattleUI.flash(e.side, 'statdown', 620); BattleUI.info(e.side); }
            break;
          case 'faint': {
            const el = BattleUI.$(e.side === 0 ? '#b-me' : '#b-foe');
            el.classList.add('faint');
            await sleep(600 * sp);
            BattleUI.$(e.side === 0 ? '#i-me' : '#i-foe').classList.add('hidden');
            break;
          }
          case 'status': BattleUI.info(e.side); break;
          case 'weather': case 'terrain': BattleUI.field(); break;
          case 'exp': case 'level': BattleUI.info(0); await sleep(200 * sp); break;
          case 'mega': BattleUI.sprite(e.side, e.pid, BattleUI.b.sides[e.side].active.mon.shiny); BattleUI.flash(e.side, 'mega', 1200); BattleUI.info(e.side); await sleep(900 * sp); break;
          case 'dyna': BattleUI.$(e.side === 0 ? '#b-me' : '#b-foe').classList.toggle('dyna', e.on); BattleUI.info(e.side); await sleep(500 * sp); break;
          case 'tera': BattleUI.$(e.side === 0 ? '#b-me' : '#b-foe').classList.add('tera'); BattleUI.info(e.side); await sleep(600 * sp); break;
          case 'z': BattleUI.flash(e.side, 'statup', 800); await sleep(500 * sp); break;
          case 'sub': BattleUI.$(e.side === 0 ? '#b-me' : '#b-foe').classList.toggle('sub', e.on); break;
          case 'transform': BattleUI.sprite(e.side, e.pid, false); break;
          case 'ball': await BattleUI.ballAnim(e); break;
          case 'end': break;
        }
        BattleUI.field();
      }
      BattleUI.info(0); BattleUI.info(1);
    },
    async ballAnim(e) {
      const ball = BattleUI.$('#b-ball');
      const foe = BattleUI.$('#b-foe');
      const sp = BattleUI.skip ? 0.25 : BattleUI.speed();
      ball.src = Dex.itemSpriteKey(e.item);
      ball.className = 'ball-anim px show';
      await sleep(600);
      foe.classList.add('gone');
      for (let i = 0; i < e.shakes; i++) {
        ball.className = 'ball-anim px show shake';
        void ball.offsetWidth;
        await sleep(650 * Math.max(0.6, sp));
        ball.className = 'ball-anim px show';
        await sleep(200);
      }
      if (e.ok) { ball.className = 'ball-anim px show caught'; await sleep(800); }
      else { ball.className = 'ball-anim px'; foe.classList.remove('gone'); BattleUI.flash(1, 'enter', 500); await sleep(300); }
    },
    cry(pid) {
      if (PW.Assets.bundled) { const p = Dex.mon(pid); PW.Assets.playCry(p && pid > 10000 ? pid : (p ? p.s : pid), 0.35); return; }
      try { const a = new Audio(Dex.cry(pid)); a.volume = 0.35; a.play().catch(() => {}); } catch (e) { /* ignore */ }
    },

    // ------------------------------------------------------------------ menus
    menu(html) {
      const m = BattleUI.$('#b-menu');
      m.className = 'bmenu';
      m.innerHTML = html;
      m.classList.remove('hidden');
      return m;
    },
    chooseAction() {
      return new Promise(res => {
        const b = BattleUI.b;
        const me = b.sides[0].active;
        BattleUI.$('#b-msg').textContent = 'Co zrobi ' + Mon.name(me.mon) + '?';
        BattleUI.$('#b-msg').classList.remove('wait');
        const locked = b.lockedAction(me);
        if (locked) { res({ type: 'move', index: 0 }); return; }
        const m = BattleUI.menu(`
          <button class="btn fight" data-a="fight">⚔️ Walcz</button>
          <button class="btn bag" data-a="bag">🎒 Plecak</button>
          <button class="btn party" data-a="party">🔄 Pokémon</button>
          <button class="btn run" data-a="run">🏃 Uciekaj</button>`);
        m.querySelector('[data-a=fight]').onclick = () => BattleUI.fightMenu(res);
        m.querySelector('[data-a=bag]').onclick = () => BattleUI.bagMenu(res);
        m.querySelector('[data-a=party]').onclick = () => BattleUI.partyMenu(res, false);
        m.querySelector('[data-a=run]').onclick = () => { BattleUI.hideMenu(); res({ type: 'run' }); };
        if (b.kind !== 'wild') m.querySelector('[data-a=run]').disabled = false;
      });
    },
    hideMenu() { const m = BattleUI.$('#b-menu'); m.classList.add('hidden'); m.innerHTML = ''; },
    effLabel(eff) {
      if (eff === 0) return '<span class="eff">BRAK EFEKTU</span>';
      if (eff >= 2) return '<span class="eff">SUPER</span>';
      if (eff < 1) return '<span class="eff">SŁABY</span>';
      return '';
    },
    fightMenu(res) {
      const b = BattleUI.b;
      const me = b.sides[0].active, foe = b.sides[1].active;
      const known = PW.Game.s.dex.seen[Dex.mon(foe.mon.pid).s];
      const usable = me.mon.moves.filter(x => x.pp > 0);
      if (!usable.length) { BattleUI.hideMenu(); res({ type: 'move', struggle: true, index: 0 }); return; }
      const canMega = b.canMega(me), canTera = b.canTera(me), canDyna = b.canDynamax(me);
      const anyZ = me.mon.moves.some(x => b.canZ(me, Dex.move(x.id)));
      const gimHtml = [
        canMega ? `<span class="gim mega ${BattleUI.gim.mega ? 'on' : ''}" data-g="mega">Mega Ewolucja</span>` : '',
        anyZ ? `<span class="gim z ${BattleUI.gim.z ? 'on' : ''}" data-g="z">Z-Move</span>` : '',
        canDyna ? `<span class="gim dyna ${BattleUI.gim.dyna ? 'on' : ''}" data-g="dyna">Dynamax</span>` : '',
        canTera ? `<span class="gim tera ${BattleUI.gim.tera ? 'on' : ''}" data-g="tera">Terastalizacja (${esc(Dex.typeName(me.mon.tera))})</span>` : '',
      ].join('');
      const moves = me.mon.moves.map((x, i) => {
        const mv = Dex.move(x.id);
        const t = b.moveType(me, mv);
        let name = mv.n, power = mv.p;
        if (BattleUI.gim.z && b.canZ(me, mv)) { name = mv.c === 0 ? 'Z-' + mv.n : PW.BD.Z_MOVES[Dex.typeKey(mv.t)]; power = mv.c === 0 ? 0 : PW.BD.zPower(mv.p); }
        else if (BattleUI.gim.dyna || me.v.dyna) { const mx = b.maxMove(me, mv); name = mx.name; power = mx.power; }
        const eff = mv.c !== 0 && known ? b.typeEffect(me, foe, mv, t) : 1;
        const dis = x.pp <= 0 || (me.v.disabled && me.v.disabled.move === x.id) || (me.v.taunt && mv.c === 0) || (me.v.choiceLock !== undefined && me.v.choiceLock !== x.id);
        return `<button class="move-btn t-${Dex.typeKey(t)}" data-i="${i}" ${dis ? 'disabled' : ''} title="${esc(mv.d || '')}">
          <span class="mn">${esc(name)}</span>
          <span class="mi"><span>${Dex.TYPE_PL[Dex.typeKey(t)]}</span><span>${Dex.CLASS_PL[mv.c]}${power ? ' · ' + power : ''}</span>${known ? BattleUI.effLabel(eff) : ''}<span class="pp">${x.pp}/${Mon.maxPP(x)}</span></span>
        </button>`;
      }).join('');
      const m = BattleUI.$('#b-menu');
      m.className = 'moves';
      m.innerHTML = `${moves}<button class="btn" data-back style="grid-column:1/-1">← Wróć</button>`;
      if (gimHtml) { const g = document.createElement('div'); g.className = 'gimmicks'; g.style.gridColumn = '1/-1'; g.innerHTML = gimHtml; m.prepend(g); }
      for (const g of m.querySelectorAll('[data-g]')) g.onclick = () => {
        const k = g.dataset.g;
        const on = !BattleUI.gim[k];
        BattleUI.gim = {};
        if (on) BattleUI.gim[k] = true;
        BattleUI.fightMenu(res);
      };
      for (const btn of m.querySelectorAll('[data-i]')) btn.onclick = () => {
        BattleUI.hideMenu();
        const a = { type: 'move', index: +btn.dataset.i };
        if (BattleUI.gim.mega) a.mega = true;
        if (BattleUI.gim.tera) a.tera = true;
        if (BattleUI.gim.dyna) a.dyna = true;
        if (BattleUI.gim.z) a.z = true;
        res(a);
      };
      m.querySelector('[data-back]').onclick = () => BattleUI.chooseAction().then(res);
    },
    bagMenu(res, tab) {
      const b = BattleUI.b;
      const items = PW.Game.s.bag.items;
      tab = tab || (b.kind === 'wild' ? 'balls' : 'medicine');
      const ids = Object.keys(items).map(Number).filter(id => items[id] > 0 && PW.Items.usableInBattle(id));
      const balls = ids.filter(id => PW.Items.isBall(id));
      const meds = ids.filter(id => !PW.Items.isBall(id) && !PW.Items.X_ITEMS[PW.Items.key(id)] && !['dire-hit', 'guard-spec', 'poke-doll', 'fluffy-tail', 'poke-toy'].includes(PW.Items.key(id)));
      const battle = ids.filter(id => PW.Items.X_ITEMS[PW.Items.key(id)] || ['dire-hit', 'guard-spec', 'poke-doll', 'fluffy-tail', 'poke-toy'].includes(PW.Items.key(id)));
      const list = tab === 'balls' ? balls : tab === 'medicine' ? meds : battle;
      const m = BattleUI.$('#b-menu');
      m.className = 'bsub';
      const foe = b.sides[1].active;
      m.innerHTML = `<div class="tabs">
          <button class="tab ${tab === 'balls' ? 'active' : ''}" data-t="balls">Poké Balle (${balls.length})</button>
          <button class="tab ${tab === 'medicine' ? 'active' : ''}" data-t="medicine">Leki (${meds.length})</button>
          <button class="tab ${tab === 'battle' ? 'active' : ''}" data-t="battle">Walka (${battle.length})</button>
          <button class="tab" data-back>← Wróć</button></div>
        <div class="list">${list.map(id => {
          let hint = '';
          if (tab === 'balls' && b.kind === 'wild' && foe) { const ch = PW.Catch.estimate(foe, b.sides[0].active, Dex.item(id), b); hint = ` <span class="tiny muted">~${Math.round(ch * 100)}%</span>`; }
          return `<button class="bitem" data-id="${id}" title="${esc(PW.Items.desc(id))}">${PW.UI.itemImg(id)}<span>${esc(PW.Items.name(id))}${hint}</span><span class="q">×${items[id]}</span></button>`;
        }).join('') || '<div class="muted small">Brak przedmiotów.</div>'}</div>`;
      for (const t of m.querySelectorAll('[data-t]')) t.onclick = () => BattleUI.bagMenu(res, t.dataset.t);
      m.querySelector('[data-back]').onclick = () => BattleUI.chooseAction().then(res);
      for (const btn of m.querySelectorAll('[data-id]')) btn.onclick = async () => {
        const id = +btn.dataset.id;
        const k = PW.Items.key(id);
        if (PW.Items.isBall(id)) {
          if (b.kind !== 'wild') { PW.UI.toast('Nie można łapać Pokémonów innych trenerów!', 'bad'); return; }
          BattleUI.hideMenu(); res({ type: 'ball', item: id }); return;
        }
        if (['poke-doll', 'fluffy-tail', 'poke-toy'].includes(k)) {
          if (b.kind !== 'wild') { PW.UI.toast('Działa tylko w walce z dzikim Pokémonem.', 'bad'); return; }
          PW.Game.takeItem(id, 1); BattleUI.hideMenu(); b.finish('run'); await BattleUI.say('Udało się uciec dzięki ' + Dex.item(id).n + '!'); res(null); return;
        }
        if (PW.Items.X_ITEMS[k] || ['dire-hit', 'guard-spec'].includes(k)) { BattleUI.hideMenu(); res({ type: 'item', item: id }); return; }
        const revive = ['revive', 'max-revive', 'revival-herb'].includes(k);
        const target = await PW.UI.pickMon('Na którym Pokémonie użyć ' + esc(Dex.item(id).n) + '?', mm => mm.egg ? 'Jajo' : revive ? (mm.hp <= 0 ? true : 'Przytomny') : (mm.hp > 0 ? true : 'Omdlały'));
        if (!target) return;
        const idx = b.sides[0].team.indexOf(target);
        BattleUI.hideMenu();
        res({ type: 'item', item: id, target: idx });
      };
    },
    partyMenu(res, forced) {
      const b = BattleUI.b;
      const side = b.sides[0];
      return PW.UI.pickMon(forced ? 'Wybierz następnego Pokémona' : 'Zmień Pokémona', m => {
        if (m.egg) return 'Jajo nie może walczyć';
        if (m.hp <= 0) return 'Omdlały';
        if (side.active && side.active.mon === m && !side.active.fainted && b.pendingSwitchReason !== 'pivot') return 'Już walczy';
        if (side.active && side.active.mon === m && b.pendingSwitchReason === 'pivot') return 'Już walczy';
        return true;
      }).then(m => {
        if (!m) { if (forced) return BattleUI.partyMenu(res, true); BattleUI.chooseAction().then(res); return; }
        BattleUI.hideMenu();
        const idx = side.team.indexOf(m);
        if (forced) res(idx); else res({ type: 'switch', index: idx });
      });
    },
    choosePartyForced() { return new Promise(res => BattleUI.partyMenu(res, true)); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
