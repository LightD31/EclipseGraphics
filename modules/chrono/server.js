/* Module "chrono", server side: the timers live here.

   State (the show's live state, persisted): t[<id>] = { run, acc, at, dur,
   cfg, done } — acc: the time counted before the last start, at: when it
   started (server clock), dur: a countdown's length (the setting's until a
   set.* or a nudge changes it), cfg: the setting it came from, done: zero
   reached (its flash sent).

   Variables, pushed when their text changes (ten checks a second):
   <id> (the time as shown), <id>_etat, <id>_s, <id>_nom.

   Commands (chrono:<id>.<verb>, or all.<verb>): start, pause (stop), toggle,
   reset, restart, set.<duration> (or set + text), +N / -N / add.±N. */
'use strict';
const M = require('./module.js');
const { parseDur, parseDelta, fmt, timers } = M.helpers;

exports.init = function (ctx) {
  const U = ctx.U;
  let loop = null;

  function entry(st, t) {
    if (!st.t || typeof st.t !== 'object') st.t = {};
    let e = st.t[t.id];
    if (!e || typeof e !== 'object') e = st.t[t.id] = { run: false, acc: 0, at: 0, dur: t.dur, cfg: t.dur, done: false };
    /* the setting's duration changed: a countdown still at its start follows it */
    if (e.cfg !== t.dur) { if (!e.run && !e.acc) e.dur = t.dur; e.cfg = t.dur; }
    return e;
  }
  const elapsed = (e, now) => e.acc + (e.run ? now - e.at : 0);
  function shown(t, e, now) {
    const el = elapsed(e, now);
    const state = e.run ? 'en_cours' : el > 0 ? 'pause' : 'pret';
    if (t.mode === 'up') {
      const secs = Math.floor(el / 1000);
      return { text: fmt(secs, t.format), secs, state };
    }
    const rem = e.dur - el;
    if (rem > 0) {
      const secs = Math.ceil(rem / 1000);
      return { text: fmt(secs, t.format), secs, state };
    }
    const over = Math.floor(-rem / 1000);
    if (t.end === 'over' && over > 0) return { text: '+' + fmt(over, t.format), secs: -over, state: e.run ? 'depasse' : 'pause' };
    return { text: t.endText || fmt(0, t.format), secs: 0, state: 'fini' };
  }

  function tick() {
    const s = ctx.settings(), st = ctx.state();
    if (!s || !st) return;
    const now = Date.now(), v = {};
    let changed = false;
    for (const t of timers(s, U)) {
      const e = entry(st, t);
      if (t.mode === 'down' && e.dur - elapsed(e, now) <= 0) {
        /* a countdown that stops at zero stops for real (paused at zero) */
        if (e.run && t.end === 'stop') { e.acc = e.dur; e.run = false; changed = true; }
        if (!e.done && (e.run || e.acc)) {
          e.done = true; changed = true;
          if (t.flash) ctx.flash({ tag: t.label, title: t.flash, type: 'chrono' });
        }
      }
      const d = shown(t, e, now);
      v[t.id] = d.text; v[t.id + '_etat'] = d.state; v[t.id + '_s'] = String(d.secs); v[t.id + '_nom'] = t.label;
    }
    if (changed) ctx.changed();
    ctx.setVars(v);
  }
  function onShow() {
    clearInterval(loop); loop = null;
    if (!ctx.enabled()) return;
    /* forget the timers that were removed from the settings */
    const st = ctx.state(), ids = timers(ctx.settings(), U).map(t => t.id);
    if (st && st.t) for (const id of Object.keys(st.t)) if (!ids.includes(id)) delete st.t[id];
    tick();
    loop = setInterval(tick, 100);
  }

  function run(t, e, verb, arg, text, now) {
    const at0 = t.mode === 'down' && e.dur - elapsed(e, now) <= 0 && t.end === 'stop';
    const start = () => { if (!e.run) { if (at0) { e.acc = 0; e.done = false; } e.run = true; e.at = now; } };
    const pause = () => { if (e.run) { e.acc = elapsed(e, now); e.run = false; } };
    const nudge = (ms) => {
      if (t.mode === 'down') e.dur = Math.max(0, e.dur + ms);
      else { e.acc = Math.max(0, elapsed(e, now) + ms); if (e.run) e.at = now; }
      if (t.mode === 'down' && e.dur - elapsed(e, now) > 0) e.done = false;
    };
    switch (verb) {
      case 'start': case 'go': start(); return true;
      case 'pause': case 'stop': pause(); return true;
      case 'toggle': if (e.run) pause(); else start(); return true;
      case 'reset': e.run = false; e.acc = 0; e.dur = t.dur; e.done = false; return true;
      case 'restart': e.acc = 0; e.dur = t.dur; e.done = false; e.run = true; e.at = now; return true;
      case 'set': {
        const ms = parseDur(arg || text, 'min');
        if (ms == null) return false;
        if (t.mode === 'down') { e.dur = ms; e.acc = 0; } else e.acc = ms;
        if (e.run) e.at = now;
        e.done = false;
        return true;
      }
      case 'add': { const ms = parseDelta(arg || text); if (ms == null) return false; nudge(ms); return true; }
      default: {
        if (!/^[+-]/.test(verb)) return false;
        const ms = parseDelta(verb + (arg ? '.' + arg : ''));
        if (ms == null) return false;
        nudge(ms);
        return true;
      }
    }
  }

  return {
    /* chrono:<id>.<verb>[.<value>] — every name is a timer's */
    command(ns, v, c) {
      const list = timers(c.settings, U);
      const targets = ns === 'all' || ns === 'tous' ? list : list.filter(t => t.id === ns);
      if (!targets.length) throw new Error('minuteur inconnu : ' + ns + (list.length ? ' (' + list.map(t => t.id).join(', ') + ')' : ''));
      const dot = v.indexOf('.'), verb = dot < 0 ? v : v.slice(0, dot), arg = dot < 0 ? '' : v.slice(dot + 1);
      const now = Date.now();
      for (const t of targets) if (run(t, entry(c.state, t), verb, arg, c.text, now) === false) return false;
      return true;
    },
    onCommand: tick,
    onShow,
    status() {
      const s = ctx.settings(), st = ctx.state();
      if (!s || !st) return { timers: [] };
      const now = Date.now();
      return { timers: timers(s, U).map(t => Object.assign({ id: t.id, label: t.label, mode: t.mode }, shown(t, entry(st, t), now))) };
    },
    stop() { clearInterval(loop); }
  };
};
