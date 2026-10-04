/* Module "programme" in the panel: now, next and when, and the controls to
   take over or shift the timings — in the rundown and the Modules tab. */
(function () {
  'use strict';
  function controls(el, api) {
    var h = api.h, s = api.settings();
    var box = h('div', { class: 'modctl' });
    el.appendChild(box);
    var list = (s.items || []).filter(function (it) { return it && (it.title || it.time); });
    if (!list.length) { box.appendChild(h('div', { class: 'sub', text: 'Programme vide : ajoutez des sujets dans les réglages du module.' })); return {}; }
    var now = h('b', { text: '—' }), nowAt = h('span', { class: 'sub' }), pos = h('span', { class: 'sub' });
    var next = h('span', { text: '—' }), when = h('span', { class: 'sub' });
    var mode = h('span', { class: 'sub' }), shift = h('b', { text: '0 min', style: 'min-width:64px;text-align:center' });
    function b(label, c, cls) { return h('button', { class: 'small' + (cls ? ' ' + cls : ''), text: label, onclick: function () { api.cmd(c); } }); }
    var go = h('select', {}, [h('option', { value: '', text: 'Aller à…' })].concat(list.map(function (it, i) {
      return h('option', { value: String(i + 1), text: (i + 1) + '. ' + (it.time ? it.time + ' ' : '') + (it.title || '') });
    })));
    go.addEventListener('change', function () { if (go.value) api.cmd('go.' + go.value); go.value = ''; });
    box.appendChild(h('div', { class: 'line' }, [h('span', { class: 'sub', text: 'Maintenant' }), h('span', { class: 'grow' }, [now, ' ', nowAt]), pos]));
    box.appendChild(h('div', { class: 'line' }, [h('span', { class: 'sub', text: (s.nextLabel || 'À suivre') }), h('span', { class: 'grow' }, [next, ' ', when])]));
    box.appendChild(h('div', { class: 'line' }, [b('◀ Précédent', 'prev'), b('Suivant ▶', 'next', 'red'), b('Horaire', 'auto'), mode]));
    box.appendChild(h('div', { class: 'line' }, [h('span', { class: 'sub', text: 'Décalage' }), b('−5', 'shift.-5'), shift, b('+5', 'shift.+5'), b('+10', 'shift.+10'), b('0', 'shift.0'), go]));
    function refresh() {
      var v = api.vars();
      now.textContent = v.titre || (v.etat === 'avant' ? 'pas encore commencé' : '—');
      nowAt.textContent = v.heure ? '(' + v.heure + ')' : '';
      pos.textContent = v.position || '';
      next.textContent = v.suivant || '—';
      when.textContent = v.suivant_heure ? v.suivant_heure + (v.suivant_dans ? ' · ' + (v.suivant_dans === 'maintenant' ? 'maintenant' : 'dans ' + v.suivant_dans) : '') : '';
      mode.textContent = v.mode === 'manuel' ? 'prise en main (« Horaire » pour revenir à l\'heure)' : 'à l\'heure';
      shift.textContent = v.retard || '0 min';
    }
    refresh();
    return { refresh: refresh };
  }
  GFX.panel('programme', { rundown: controls, render: controls });
})();
