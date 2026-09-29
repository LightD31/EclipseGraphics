/* Module "eclipse" in the panel: the eclipse's circumstances at a glance,
   computed by an open output (a browser source, or the panel's preview). */
(function () {
  'use strict';
  GFX.panel('eclipse', {
    render: function (el, api) {
      var h = api.h, cells = {};
      var tiles = h('div', { class: 'tiles' });
      [['phase', 'Phase'], ['obsc', 'Obscuration'], ['c1', 'Premier contact'], ['max', 'Maximum'], ['set', 'Coucher du Soleil'],
       ['c4', 'Fin'], ['sun', 'Soleil']].forEach(function (t) {
        var v = h('div', { class: 'v', text: '—' }), s = h('div', { class: 's' });
        cells[t[0]] = { tile: h('div', { class: 'tile' }, [h('div', { class: 'k', text: t[1] }), v, s]), v: v, s: s };
        tiles.appendChild(cells[t[0]].tile);
      });
      el.appendChild(tiles);
      var demo = h('div', { class: 'row' }, [
        h('button', { class: 'small', text: 'Relancer la démo', onclick: function () { api.cmd('demo.restart'); } }),
        h('span', { class: 'note', text: 'Démo active : toutes les sorties jouent l\'éclipse en accéléré, au même moment.' })]);
      el.appendChild(demo);
      function put(k, v, s, level) {
        var c = cells[k];
        c.v.textContent = v || '—';
        c.s.textContent = s || '';
        c.tile.className = 'tile ' + (level || (v ? 'ok' : ''));
      }
      return {
        refresh: function () {
          var v = api.vars();
          demo.hidden = !api.settings().demo;
          if (!v.status) {
            put('phase', 'en attente', 'ouvrez une sortie (source OBS ou aperçu) : c\'est elle qui calcule', 'warn');
          } else put('phase', v.status, v.next ? v.next + ' ' + (v.eta || '') : '');
          put('obsc', v.pct, v.pct_max ? 'maximum ' + v.pct_max : '');
          put('c1', v.t_c1); put('max', v.t_max); put('set', v.t_sunset); put('c4', v.t_c4);
          put('sun', v.sun, api.settings().site);
        }
      };
    }
  });
})();
