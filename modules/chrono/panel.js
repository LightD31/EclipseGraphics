/* Module "chrono" in the panel: each timer's time and its buttons, in the
   rundown and in the Modules tab. */
(function () {
  'use strict';
  var LABELS = { pret: 'prêt', en_cours: 'en cours', pause: 'arrêté', fini: 'terminé', depasse: 'en dépassement' };
  function controls(el, api) {
    var h = api.h, H = window.GFXModules.chrono.helpers, rows = [];
    var box = h('div', { class: 'modctl' });
    el.appendChild(box);
    var list = H.timers(api.settings(), api.U);
    if (!list.length) {
      box.appendChild(h('div', { class: 'sub', text: 'Aucun minuteur : ajoutez-en dans l\'onglet Modules.' }));
      return {};
    }
    list.forEach(function (t, i) {
      var time = h('span', { class: 'big', text: '--:--' }), state = h('span', { class: 'sub' });
      var tog = h('button', { class: 'small red', text: '▶ Démarrer', onclick: function () { api.cmd(t.id + '.toggle'); } });
      var inp = h('input', { type: 'text', class: 'short', 'data-k': 'chrono:' + t.id,
                             placeholder: t.mode === 'up' ? '00:00' : H.fmt(t.dur / 1000, t.format), title: 'Nouvelle durée : 05:00, 90s, 1h30' });
      var set = function () { var v = inp.value.trim(); if (!v) return; api.cmd(t.id + '.set', v); inp.value = ''; };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') set(); });
      var nudge = function (label, d) { return h('button', { class: 'small', text: label, onclick: function () { api.cmd(t.id + '.' + d); } }); };
      if (i) box.appendChild(h('div', { class: 'sep' }));
      box.appendChild(h('div', { class: 'line' }, [h('div', { class: 'grow' }, [h('b', { text: t.label }), h('br'), state,
        h('span', { class: 'sub', text: ' · {{chrono.' + t.id + '}}' })]), time]));
      box.appendChild(h('div', { class: 'line' }, [tog,
        h('button', { class: 'small', text: '↺', title: 'Remettre à ' + (t.mode === 'up' ? 'zéro' : H.fmt(t.dur / 1000, t.format)), onclick: function () { api.cmd(t.id + '.reset'); } }),
        nudge('−1 min', '-60'), nudge('−10 s', '-10'), nudge('+10 s', '+10'), nudge('+1 min', '+60'),
        inp, h('button', { class: 'small', text: 'Régler', onclick: set })]));
      rows.push({ t: t, time: time, state: state, tog: tog });
    });
    function refresh() {
      var v = api.vars();
      rows.forEach(function (r) {
        var st = v[r.t.id + '_etat'] || 'pret', running = st === 'en_cours' || st === 'depasse';
        r.time.textContent = v[r.t.id] || '--:--';
        r.time.className = 'big' + (running ? ' run' : st === 'fini' ? ' end' : '') + (st === 'depasse' ? ' end' : '');
        r.state.textContent = LABELS[st] || st;
        r.tog.textContent = running ? '⏸ Arrêter' : '▶ Démarrer';
        r.tog.className = 'small' + (running ? '' : ' red');
      });
    }
    refresh();
    return { refresh: refresh };
  }
  GFX.panel('chrono', { rundown: controls, render: controls });
})();
