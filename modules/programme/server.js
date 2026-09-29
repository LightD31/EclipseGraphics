/* Module "programme", server side: where the show stands, every second.

   The items start at their times today, shifted by the delay; a time
   earlier than the one before it is the next day's, and just after
   midnight a night that started the day before carries on. On now: the
   last item started (auto), or the one the operator went to (manual);
   next: the one after it. */
'use strict';

exports.init = function (ctx) {
  const U = ctx.U;
  let loop = null;

  function items(s) {
    return (Array.isArray(s.items) ? s.items : []).filter(it => it && (String(it.title || '').trim() || String(it.time || '').trim()));
  }
  function timeline(s, shift, day) {
    const tz = ctx.tz();
    let prev = null, roll = 0;
    return items(s).map((it, i) => {
      let t = U.parseWhen(String(it.time || '').trim(), tz, day);
      if (t != null) {
        t += roll * 86400000;
        if (prev != null && t < prev) { roll++; t += 86400000; }
        prev = t;
        t += shift * 60000;
      }
      return { i, title: String(it.title || ''), sub: String(it.sub || ''), at: t };
    });
  }
  function where(s, st, now) {
    const tz = ctx.tz(), shift = Math.round(+st.shift || 0);
    let list = timeline(s, shift, U.dayOf(now, tz));
    /* after midnight, a night that began yesterday is still on */
    const first = list.find(x => x.at != null);
    if (first && now < first.at) {
      const y = timeline(s, shift, U.dayOf(now - 86400000, tz)), last = [...y].reverse().find(x => x.at != null);
      if (last && now < last.at + 6 * 3600000) list = y;
    }
    const n = list.length;
    let cur = null;
    if (st.manual != null && n) cur = Math.max(0, Math.min(n - 1, +st.manual || 0));
    else for (const x of list) if (x.at != null && x.at <= now) cur = x.i;
    return { list, n, cur, shift };
  }

  function tick() {
    const s = ctx.settings(), st = ctx.state();
    if (!s || !st) return;
    const now = Date.now(), tz = ctx.tz(), w = where(s, st, now);
    const cur = w.cur == null ? null : w.list[w.cur];
    const nextIdx = w.cur == null ? 0 : w.cur + 1, next = w.list[nextIdx] || null, after = w.list[nextIdx + 1] || null;
    const hm = (x) => (x && x.at != null ? U.hm(x.at, tz) : '');
    const up = w.list.slice(nextIdx, nextIdx + Math.max(1, +s.upcoming || 3));
    const left = next && next.at != null ? next.at - now : null;
    ctx.setVars({
      titre: cur ? cur.title : '', sous: cur ? cur.sub : '', heure: hm(cur),
      suivant: next ? next.title : '', suivant_sous: next ? next.sub : '', suivant_heure: hm(next),
      suivant_dans: left == null ? '' : left > 0 ? U.coarse(left) : 'maintenant',
      suivant_rebours: left == null ? '' : U.clock(Math.max(0, Math.ceil(left / 1000) * 1000), 'hms'),
      apres: after ? after.title : '',
      position: w.n ? (w.cur == null ? 0 : w.cur + 1) + '/' + w.n : '',
      etat: !w.n ? '' : w.cur == null ? 'avant' : next ? 'en_cours' : 'dernier',
      mode: st.manual != null ? 'manuel' : 'auto',
      retard: w.shift ? (w.shift > 0 ? '+' : '−') + Math.abs(w.shift) + ' min' : '',
      liste: up.map(x => (hm(x) ? hm(x) + ' · ' : '') + x.title + (x.sub ? ' — ' + x.sub : '')),
      ticker: up.length ? [up.map((x, k) => [(k === 0 ? (s.nextLabel || 'À suivre') + ' · ' : '') + hm(x), x.title, x.sub])] : []
    });
  }
  function onShow() {
    clearInterval(loop); loop = null;
    if (!ctx.enabled()) return;
    tick();
    loop = setInterval(tick, 1000);
  }
  function step(c, d) {
    const w = where(c.settings, c.state, Date.now());
    if (!w.n) return false;
    c.state.manual = Math.max(0, Math.min(w.n - 1, (w.cur == null ? -1 : w.cur) + d));
  }

  return {
    commands: {
      next: (v, c) => step(c, 1),
      prev: (v, c) => step(c, -1),
      go(v, c) {
        const k = parseInt(v, 10), n = items(c.settings).length;
        if (!(k >= 1 && k <= n)) return false;
        c.state.manual = k - 1;
      },
      auto(v, c) { c.state.manual = null; },
      shift(v, c) {
        const st = c.state, cur = Math.round(+st.shift || 0);
        if (v === '0' || v === 'reset') st.shift = 0;
        else if (/^[+-]\d{1,3}$/.test(v)) st.shift = cur + parseInt(v, 10);
        else if (/^\d{1,3}$/.test(v)) st.shift = +v;
        else return false;
      }
    },
    onCommand: tick,
    onShow,
    stop() { clearInterval(loop); }
  };
};
