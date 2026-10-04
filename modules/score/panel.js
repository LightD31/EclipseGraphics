/* Module "score" in the panel: the score and every control, in the rundown
   and in the Modules tab. */
(function () {
  'use strict';
  function controls(el, api) {
    var h = api.h, D = window.GFXModules.score, s = api.settings();
    var box = h('div', { class: 'modctl' });
    el.appendChild(box);
    var steps = D.helpers.steps(s), refs = {};
    function b(label, c, title) { return h('button', { class: 'small', text: label, title: title || '', onclick: function () { api.cmd(c); } }); }
    function team(k) {
      var t = s[k] || {}, num = h('span', { class: 'big', text: '0' });
      refs[k] = num;
      var row = h('div', { class: 'line' }, [
        h('span', { class: 'grow' }, [h('i', { style: 'display:inline-block;width:10px;height:22px;vertical-align:middle;margin-right:8px;background:' + (t.color || '#888') }),
          h('b', { text: t.name || k.toUpperCase() })]),
        num, b('−1', k + '.-1', 'Retirer un point')].concat(steps.map(function (n) { return h('button', { class: 'small red', text: '+' + n, onclick: function () { api.cmd(k + '.+' + n); } }); })));
      box.appendChild(row);
      if (s.second) {
        var sec = h('span', { text: '0', style: 'min-width:24px;text-align:center;font-weight:700' });
        refs[k + '2'] = sec;
        box.appendChild(h('div', { class: 'line' }, [h('span', { class: 'grow sub', text: s.second + ' · ' + (t.short || t.name || k) }), b('−', k + '2.-1'), sec, b('+', k + '2.+1')]));
      }
    }
    team('a'); team('b');
    var per = h('b', { text: '' }), possA = b(s.a && s.a.short || 'Équipe 1', 'poss.a', 'Possession / service'),
        possN = b('—', 'poss.none', 'Personne'), possB = b(s.b && s.b.short || 'Équipe 2', 'poss.b', 'Possession / service');
    box.appendChild(h('div', { class: 'sep' }));
    if (s.period !== 'aucune') box.appendChild(h('div', { class: 'line' }, [h('span', { class: 'sub', text: 'Période' }), b('◀', 'period.prev'), per, b('▶', 'period.next')]));
    box.appendChild(h('div', { class: 'line' }, [h('span', { class: 'sub', text: 'Possession' }), possA, possN, possB]));
    var note = h('input', { type: 'text', placeholder: 'Note : Temps mort, VAR…', 'data-k': 'score:note' });
    var noteNow = h('span', { class: 'sub' });
    var send = function () { var v = note.value.trim(); if (v) { api.cmd('note.set', v); note.value = ''; } };
    note.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    box.appendChild(h('div', { class: 'line' }, [note, h('button', { class: 'small', text: 'Afficher', onclick: send }), b('Effacer', 'note.clear')]));
    box.appendChild(h('div', { class: 'line' }, [noteNow, h('span', { class: 'grow' }),
      h('button', { class: 'small ghost', text: '↺ Tout remettre à zéro', onclick: function () {
        api.ask('Remettre le score, les compteurs et la période à zéro ?').then(function (yes) { if (yes) api.cmd('reset'); });
      } })]));
    function refresh() {
      var v = api.vars();
      ['a', 'b', 'a2', 'b2'].forEach(function (k) { if (refs[k]) refs[k].textContent = v[k] != null ? v[k] : '0'; });
      per.textContent = v.periode || '—';
      possA.classList.toggle('on', v.poss === 'a');
      possB.classList.toggle('on', v.poss === 'b');
      possN.classList.toggle('on', !v.poss);
      noteNow.textContent = v.note ? 'Note à l\'écran : « ' + v.note + ' »' : '';
    }
    refresh();
    return { refresh: refresh };
  }
  GFX.panel('score', { rundown: controls, render: controls });
})();
