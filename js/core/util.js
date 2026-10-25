/* Shared helpers: random numbers, formatting, time of day. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};

  // Seedable PRNG (mulberry32) so tests can be deterministic; defaults to Math.random.
  let seeded = null;
  function rand() {
    if (seeded === null) return Math.random();
    seeded |= 0; seeded = (seeded + 0x6D2B79F5) | 0;
    let t = Math.imul(seeded ^ (seeded >>> 15), 1 | seeded);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const U = PW.U = {
    seed(s) { seeded = s === undefined ? null : (s | 0); },
    rand,
    int(a, b) { return a + Math.floor(rand() * (b - a + 1)); },
    chance(p) { return rand() < p; },
    pick(arr) { return arr[Math.floor(rand() * arr.length)]; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    },
    weighted(list, w) {
      let total = 0;
      for (const x of list) total += Math.max(0, w(x));
      if (total <= 0) return list.length ? list[0] : null;
      let r = rand() * total;
      for (const x of list) { r -= Math.max(0, w(x)); if (r < 0) return x; }
      return list[list.length - 1];
    },
    // Polish noun form for a count: forms = [1, 2–4 (not 12–14), other], e.g. ['odznakę', 'odznaki', 'odznak'].
    plural(n, forms) { const t = n % 10, h = n % 100; return n === 1 ? forms[0] : t >= 2 && t <= 4 && (h < 12 || h > 14) ? forms[1] : forms[2]; },
    clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
    uid() { return Date.now().toString(36) + Math.floor(rand() * 1e9).toString(36); },
    money(n) { return '₽' + Math.floor(n).toLocaleString('pl-PL'); },
    esc(s) {
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    // Real-clock time of day (HGSS/DPPt split): morning 4-10, day 10-20, night 20-4.
    timeOfDay(d) {
      const h = (d || new Date()).getHours();
      if (h >= 4 && h < 10) return 'morning';
      if (h >= 10 && h < 20) return 'day';
      return 'night';
    },
    isDusk(d) { const h = (d || new Date()).getHours(); return h >= 17 && h < 18; },
    // Unova seasons change every month: Jan/May/Sep spring, Feb/Jun/Oct summer, Mar/Jul/Nov autumn, Apr/Aug/Dec winter.
    season(d) { return ['spring', 'summer', 'autumn', 'winter'][((d || new Date()).getMonth()) % 4]; },
    weekday(d) { return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][(d || new Date()).getDay()]; },
    // Deterministic per-day hash (used e.g. for daily weather).
    dayHash(str) {
      const d = new Date();
      let h = 2166136261 ^ (d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate());
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return (h >>> 0);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
