// Sprites and cries. The plain build loads them straight from PokeAPI and Pokémon Showdown.
// The bundled build (tools/build_bundle.py) defines PW_ASSETS: sprite sheets and packed MP3 cries
// shipped next to the page, for hosts that only allow same-origin files.
(function (g) {
  const PW = g.PW = g.PW || {};
  const M = g.PW_ASSETS || null;

  const Assets = PW.Assets = {
    bundled: !!M,
    sheets: {},
    cache: {},
    cries: {},
    chunks: {},

    // Loads every sprite sheet (with a progress line in #app), then starts the game.
    boot(start) {
      if (!M) return start();
      const urls = [];
      for (const gr of Object.values(M.groups)) {
        gr.idx = {};
        gr.keys.forEach((k, i) => { gr.idx[k] = i; });
        urls.push(...gr.sheets);
      }
      const app = document.getElementById('app');
      let done = 0;
      const tick = () => {
        if (app) app.innerHTML = `<div class="empty" style="padding-top:30vh">Ładowanie grafik… ${Math.round(done / urls.length * 100)}%</div>`;
      };
      tick();
      Promise.all(urls.map(u => new Promise(res => {
        const img = new Image();
        img.onload = img.onerror = () => { done++; tick(); res(); };
        img.src = u;
        Assets.sheets[u] = img;
      }))).then(start);
      document.addEventListener('pointerdown', Assets.unlockAudio, true);
    },

    has(group, key) {
      const gr = M && M.groups[group];
      return !!(gr && gr.idx && gr.idx[key] !== undefined);
    },

    // Data URL of one sprite cut from its sheet ('' when the sheet has no such sprite).
    get(group, key) {
      const ck = group + ':' + key;
      if (ck in Assets.cache) return Assets.cache[ck];
      if (!Assets.has(group, key)) return '';
      const gr = M.groups[group];
      const n = gr.idx[key];
      const img = Assets.sheets[gr.sheets[Math.floor(n / gr.per)]];
      if (!img || !img.naturalWidth) return '';
      const cell = n % gr.per;
      const t = gr.tile;
      const [cx, cy, side] = gr.crop ? gr.crop[n] : [0, 0, t];
      if (!Assets.canvas) Assets.canvas = document.createElement('canvas');
      const c = Assets.canvas;
      c.width = c.height = side;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, side, side);
      ctx.drawImage(img, (cell % gr.cols) * t + cx, Math.floor(cell / gr.cols) * t + cy, side, side, 0, 0, side, side);
      return (Assets.cache[ck] = c.toDataURL());
    },

    // Browsers start audio only after a user gesture, so the context is created on the first tap.
    unlockAudio() {
      try {
        if (!Assets.ctx) Assets.ctx = new (g.AudioContext || g.webkitAudioContext)();
        if (Assets.ctx.state === 'suspended') Assets.ctx.resume();
      } catch (e) { /* no audio */ }
    },

    async playCry(id, volume) {
      const e = M && M.cries.idx[id];
      if (!e || !Assets.ctx) return;
      try {
        if (!Assets.cries[id]) {
          const [chunk, off, len] = e;
          const url = M.cries.chunks[chunk];
          if (!Assets.chunks[url]) Assets.chunks[url] = fetch(url).then(r => r.arrayBuffer());
          const buf = await Assets.chunks[url];
          Assets.cries[id] = await new Promise((res, rej) => Assets.ctx.decodeAudioData(buf.slice(off, off + len), res, rej));
        }
        const src = Assets.ctx.createBufferSource();
        const gain = Assets.ctx.createGain();
        gain.gain.value = volume;
        src.buffer = Assets.cries[id];
        src.connect(gain).connect(Assets.ctx.destination);
        src.start();
      } catch (err) { /* missing or undecodable cry */ }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
