/* Module "flux" in the panel: each source's health and a preview of what
   it gives, with a button to read it again now. */
(function () {
  'use strict';
  GFX.panel('flux', {
    render: function (el, api) {
      var h = api.h, box = h('div');
      el.appendChild(box);
      function ago(t) {
        if (!t) return '';
        var s = Math.round((Date.now() - t) / 1000);
        return s < 60 ? 'il y a ' + s + ' s' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : 'à ' + api.U.hm(t, api.tz());
      }
      function draw(st) {
        box.innerHTML = '';
        if (!st.sources || !st.sources.length) {
          box.appendChild(h('p', { class: 'note', text: 'Aucune source : ajoutez-en une ci-dessous (un flux RSS, une API JSON, une feuille publiée en CSV…).' }));
          return;
        }
        var tb = h('table', { class: 't' }, [h('tr', {}, ['Source', 'État', 'Ce qu\'elle donne', ''].map(function (x) { return h('th', { text: x }); }))]);
        st.sources.forEach(function (s) {
          var state = s.error ? h('span', { style: 'color:var(--bad)', text: 'erreur : ' + s.error })
            : s.ok ? h('span', { style: 'color:var(--ok)', text: 'lu ' + ago(s.ok) + ' · ' + s.n + ' élément' + (s.n > 1 ? 's' : '') })
            : h('span', { class: 'fm-unit', text: 'en cours…' });
          var what = h('td', { class: 'val' });
          s.items.forEach(function (it) { what.appendChild(h('div', { text: '• ' + it })); });
          Object.keys(s.fields || {}).forEach(function (k) { what.appendChild(h('div', {}, [h('code', { text: s.id + '_' + k }), ' = ' + s.fields[k]])); });
          tb.appendChild(h('tr', {}, [h('td', {}, [h('b', { text: s.id }), h('br'), h('small', { class: 'fm-unit', text: s.kind.toUpperCase() })]),
            h('td', {}, [state]), what,
            h('td', {}, [h('button', { class: 'fm-mini', text: 'Relire', onclick: function () { api.cmd('refresh.' + s.id); setTimeout(poll, 1500); } })])]));
        });
        box.appendChild(tb);
      }
      function poll() { api.status().then(draw).catch(function () {}); }
      poll();
      var timer = setInterval(poll, 5000);
      return { destroy: function () { clearInterval(timer); } };
    }
  });
})();
