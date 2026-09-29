/* Module "score", server side: the commands that change the score, and the
   variables drawn from it (again after every command, and when the show or
   its settings change).

   Commands (score:<name>.<value>):
     a|b|a2|b2  +N, -N, set.N (or N), reset
     period     next, prev, set.N (or N), reset
     poss       a, b, none, toggle
     note       <text>, set (+ text), clear
     reset      the whole match back to 0 */
'use strict';
const M = require('./module.js');

exports.init = function (ctx) {
  function counter(st, key, v, s) {
    const cur = Math.max(0, parseInt(st[key], 10) || 0);
    let next;
    if (v === 'reset') next = 0;
    else if (/^[+-]\d{1,3}$/.test(v)) next = cur + parseInt(v, 10);
    else {
      const m = /^(?:set\.)?(\d{1,4})$/.exec(v);
      if (!m) return false;
      next = +m[1];
    }
    st[key] = Math.max(0, next);
    /* a team scores (+N, not a correction): the announcement, if the show wants one */
    if ((key === 'a' || key === 'b') && v.charAt(0) === '+' && st[key] > cur && s.announce) {
      const team = s[key] || {};
      ctx.flash({ tag: team.short || team.name || '', title: s.announce + ' ' + (team.name || ''), sub: line(st, s), type: 'score' });
    }
    return true;
  }
  function line(st, s) { return (s.a.name || '') + ' ' + st.a + ' – ' + st.b + ' ' + (s.b.name || ''); }

  function refresh() {
    const s = ctx.settings(), st = ctx.state();
    if (!s || !st) return;
    const a = s.a || {}, b = s.b || {}, pa = +st.a || 0, pb = +st.b || 0;
    ctx.setVars({
      a: String(pa), b: String(pb), a2: String(+st.a2 || 0), b2: String(+st.b2 || 0),
      a_nom: a.name || '', b_nom: b.name || '', a_court: a.short || '', b_court: b.short || '',
      a_couleur: a.color || '', b_couleur: b.color || '', a_logo: a.logo || '', b_logo: b.logo || '',
      score: pa + ' – ' + pb, ligne: line({ a: pa, b: pb }, s),
      mene: pa === pb ? 'Égalité' : (pa > pb ? a.name : b.name) + ' mène',
      periode: s.period === 'aucune' ? '' : M.helpers.periodLabel(s, +st.period || 1), periode_n: String(+st.period || 1),
      poss: st.poss || '', note: st.note || ''
    });
  }

  const commands = {
    a: (v, c) => counter(c.state, 'a', v, c.settings),
    b: (v, c) => counter(c.state, 'b', v, c.settings),
    a2: (v, c) => counter(c.state, 'a2', v, c.settings),
    b2: (v, c) => counter(c.state, 'b2', v, c.settings),
    period(v, c) {
      const st = c.state, cur = Math.max(1, parseInt(st.period, 10) || 1);
      if (v === 'next') st.period = cur + 1;
      else if (v === 'prev') st.period = Math.max(1, cur - 1);
      else if (v === 'reset') st.period = 1;
      else {
        const m = /^(?:set\.)?(\d{1,2})$/.exec(v);
        if (!m || +m[1] < 1) return false;
        st.period = +m[1];
      }
    },
    poss(v, c) {
      if (v === 'toggle') c.state.poss = c.state.poss === 'a' ? 'b' : 'a';
      else if (v === 'a' || v === 'b') c.state.poss = v;
      else if (v === 'none' || v === '') c.state.poss = '';
      else return false;
    },
    note(v, c) {
      if (v === 'clear' || v === 'none') c.state.note = '';
      else c.state.note = String(v === 'set' ? c.text || '' : v).trim().slice(0, 60);
    },
    reset(v, c) { Object.assign(c.state, { a: 0, b: 0, a2: 0, b2: 0, period: 1, poss: '', note: '' }); }
  };

  return {
    commands,
    onCommand: refresh,
    onShow: refresh
  };
};
