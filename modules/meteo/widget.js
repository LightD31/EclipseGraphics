/* "Météo" — the graphic the meteo module brings: a corner chip with the
   icon, the temperature, the place and the sky, and if you like the next
   days under it. The data is the module's (the server asks Open-Meteo),
   the icons come from client.js. */
(function () {
  'use strict';
  var el = GFX.el, txt = GFX.text;
  function on(k) { return function (f) { return !!window.GFXShared.getPath(f, k); }; }

  var schema = [
    { title: 'Contenu', fields: [
      { key: 'label', type: 'text', label: 'Lieu affiché', default: '{{meteo.lieu}}', vars: true, help: 'vide : pas de lieu' },
      { key: 'show.sky', type: 'toggle', label: 'Le temps en clair', default: true },
      { key: 'show.minmax', type: 'toggle', label: 'Minimale et maximale du jour', default: false },
      { key: 'days', type: 'select', label: 'Jours suivants', default: '0', options: [['0', 'aucun'], ['1', 'demain'], ['2', 'deux jours'], ['3', 'trois jours']] }
    ] },
    { title: 'Position', fields: GFX.fields.anchor('tr').map(function (fd) {
      if (fd.key === 'pos.x') fd.default = 56;
      if (fd.key === 'pos.y') fd.default = 190;
      return fd;
    }).concat([
      { key: 'size', type: 'range', label: 'Taille', default: 1, min: 0.5, max: 2, step: 0.02, unit: '×' },
      GFX.fields.colorOverride('colors.chip', 'Fond', 'base')
    ]) },
    GFX.fields.motion()
  ];

  GFX.type('meteo', {
    label: 'Météo', icon: '☀',
    move: { box: '.mw-pos' },
    desc: 'Le temps qu\'il fait (module Météo) : icône, température, lieu, et les jours suivants',
    schema: schema,
    create: function (ctx, f) {
      var root = ctx.root;
      var pos = el('div', 'mw-pos', root);
      var chip = el('div', 'mw-chip', pos);
      var ico = el('div', 'mw-icon', chip), temp = el('div', 'mw-temp num', chip);
      var txtBox = el('div', 'mw-txt', chip), place = el('div', 'mw-place head', txtBox), sky = el('div', 'mw-sky', txtBox);
      var days = el('div', 'mw-days', pos);
      var dayEls = [0, 1, 2].map(function () {
        var d = el('div', 'mw-day', days);
        return { root: d, name: el('span', 'mw-dn head', d), ico: el('div', 'mw-di', d), mm: el('span', 'mw-dmm num', d) };
      });
      var last = '';
      function data() { var d = ctx.get('meteo._data'); return d && typeof d === 'object' ? d : null; }
      function update(nf) {
        f = nf || f;
        root.style.setProperty('--gs', String(+f.size || 1));
        root.style.setProperty('--mw-chip', GFX.color((f.colors || {}).chip, 'base'));
        GFX.place(pos, f.pos);
        last = '';
        tick();
      }
      function tick() {
        var d = data(), M = window.GFXMeteo;
        var label = ctx.render(f.label || '');
        var key = JSON.stringify([d && d.updated, label, f.show, f.days]);
        if (key === last) return;
        last = key;
        var n = (d && d.now) || {};
        if (M) M.iconInto(ico, d ? n.icon : 'cloud');
        txt(temp, d && M ? M.deg(n.temp) : '—');
        txt(place, label); place.hidden = !label;
        var today = d && (d.days || [])[0];
        var line = f.show.sky ? (n.text || '') : '';
        if (f.show.minmax && today && M) line += (line ? ' · ' : '') + M.deg(today.min) + ' / ' + M.deg(today.max);
        txt(sky, line); sky.hidden = !line;
        txtBox.hidden = place.hidden && sky.hidden;
        var nd = +f.days || 0;
        dayEls.forEach(function (e, i) {
          var x = d && (d.days || [])[i + 1];
          e.root.hidden = !x || i >= nd;
          if (e.root.hidden) return;
          txt(e.name, x.name.slice(0, 3));
          if (M) M.iconInto(e.ico, x.icon);
          txt(e.mm, M ? M.deg(x.min) + ' / ' + M.deg(x.max) : '');
        });
        days.hidden = !nd || !d;
      }
      update(f);
      return {
        update: update, tick: tick,
        setLive: function (L, prev) { if (L.air && !(prev && prev.air)) tick(); },
        parts: function () {
          var p = [{ el: chip, role: 'surface' }, { el: ico, role: 'visual' }];
          dayEls.forEach(function (e, i) { if (!e.root.hidden && !days.hidden) p.push({ el: e.root, role: 'items', i: i }); });
          return p;
        }
      };
    }
  });
})();
