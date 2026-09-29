/* Module "meteo" in the panel: whether the data comes in, what it says,
   and a place search that fills the settings. */
(function () {
  'use strict';
  GFX.panel('meteo', {
    render: function (el, api) {
      var h = api.h, T = {};
      var tiles = h('div', { class: 'tiles' });
      [['state', 'Données'], ['now', 'Maintenant'], ['next', 'Demain']].forEach(function (t) {
        var v = h('div', { class: 'v', text: '…' }), s = h('div', { class: 's' });
        T[t[0]] = { tile: h('div', { class: 'tile' }, [h('div', { class: 'k', text: t[1] }), v, s]), v: v, s: s };
        tiles.appendChild(T[t[0]].tile);
      });
      function tile(k, level, v, s) { var x = T[k]; x.tile.className = 'tile ' + (level || ''); x.v.textContent = v || '—'; x.s.textContent = s || ''; }
      el.appendChild(tiles);
      // place search
      var q = h('input', { type: 'text', placeholder: 'Chercher une ville…' });
      var out = h('div', { class: 'row', style: 'flex-wrap:wrap' });
      function search() {
        var v = q.value.trim();
        if (v.length < 2) return;
        out.textContent = 'Recherche…';
        fetch('meteo/geocode?q=' + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (j) {
          out.innerHTML = '';
          if (j.error) { out.textContent = 'Recherche impossible : ' + j.error; return; }
          if (!j.results.length) { out.textContent = 'Aucun lieu trouvé.'; return; }
          j.results.forEach(function (x) {
            out.appendChild(h('button', { class: 'small', text: x.name + (x.admin ? ' (' + x.admin + ')' : '') + (x.country && x.country !== 'France' ? ', ' + x.country : ''),
              title: x.lat + ', ' + x.lon, onclick: function () { api.setting({ place: x.name, lat: x.lat, lon: x.lon }); api.toast('Lieu : ' + x.name); } }));
          });
        }).catch(function (e) { out.textContent = 'Recherche impossible : ' + e.message; });
      }
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });
      el.appendChild(h('div', { class: 'row' }, [q, h('button', { class: 'small', text: 'Chercher', onclick: search }),
        h('button', { class: 'small ghost', text: 'Mettre à jour', onclick: function () { api.cmd('refresh'); api.toast('Mise à jour demandée'); } })]));
      el.appendChild(out);
      el.appendChild(h('p', { class: 'note', text: 'Données météo : Open-Meteo.com (licence CC BY 4.0), à créditer à l\'écran : le visuel plein écran le fait.' }));
      function refresh() {
        var v = api.vars();
        api.status().then(function (st) {
          if (st.error) tile('state', 'bad', 'erreur', st.error);
          else if (st.ok) tile('state', 'ok', 'à jour', 'reçu à ' + api.U.hm(st.ok, api.tz()) + (st.next ? ' · suivant à ' + api.U.hm(st.next, api.tz()) : ''));
          else tile('state', 'warn', 'en attente', st.service || '');
        }).catch(function () {});
        tile('now', v.temp ? '' : 'warn', v.temp ? v.temp + ' · ' + (v.ciel || '') : '', v.vent_txt || '');
        tile('next', '', v.demain || '', v.j2 || '');
      }
      refresh();
      var timer = setInterval(refresh, 10000);
      return { refresh: function () { /* on every live change: the tiles poll on their own */ }, destroy: function () { clearInterval(timer); } };
    }
  });
})();
