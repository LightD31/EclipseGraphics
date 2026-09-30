/* "À suivre" — the graphic the programme module brings: what comes next (or
   what's on now), wherever it's dragged: the time, the title, its detail,
   in how long, and if you like the items after it. When the running order
   moves on while it's on air, the new item swaps in. */
(function () {
  'use strict';
  var el = GFX.el, txt = GFX.text;
  function next(f) { return f.what !== 'now'; }

  var schema = [
    { title: 'Contenu', fields: [
      { key: 'what', type: 'select', label: 'Montre', default: 'next', options: [['next', 'ce qui suit'], ['now', 'ce qui passe']] },
      { key: 'label', type: 'text', label: 'Libellé', default: '', vars: true, placeholder: 'À suivre / En ce moment' },
      { key: 'show.time', type: 'toggle', label: 'L\'heure', default: true },
      { key: 'show.sub', type: 'toggle', label: 'La précision', default: true },
      { key: 'show.eta', type: 'toggle', label: 'Dans combien de temps', default: true, showIf: next },
      { key: 'more', type: 'select', label: 'Et ensuite', default: '0',
        options: [['0', 'rien'], ['1', 'le sujet d\'après'], ['2', 'les deux suivants'], ['3', 'les trois suivants']] }
    ] },
    { title: 'Position', fields: GFX.fields.anchor('tl').map(function (fd) {
      if (fd.key === 'pos.x') fd.default = 96;
      if (fd.key === 'pos.y') fd.default = 96;
      return fd;
    }).concat([
      { key: 'size', type: 'range', label: 'Taille', default: 1, min: 0.5, max: 2, step: 0.02, unit: '×' },
      { key: 'width', type: 'number', label: 'Largeur maximale', default: 640, min: 240, max: 1800, unit: 'px' },
      GFX.fields.colorOverride('colors.box', 'Fond', 'base'),
      GFX.fields.colorOverride('colors.label', 'Fond du libellé', 'accent')
    ]) },
    GFX.fields.motion()
  ];

  GFX.type('suivant', {
    label: 'À suivre', icon: '☰',
    desc: 'Ce qui suit (ou ce qui passe) dans le programme du module Programme : heure, titre, dans combien de temps',
    move: { box: '.nx-pos' },
    schema: schema,
    create: function (ctx, f) {
      var root = ctx.root;
      var pos = el('div', 'nx-pos', root);
      var head = el('div', 'nx-head', pos);
      var label = el('span', 'nx-label head', head), time = el('span', 'nx-time num', head), eta = el('span', 'nx-eta', head);
      var box = el('div', 'nx-box', pos);
      var title = el('div', 'nx-title head', box), sub = el('div', 'nx-sub', box);
      var more = el('div', 'nx-more', pos);
      var shown = null;
      function get(k) { var v = ctx.get('programme.' + k); return v == null ? '' : v; }
      function what() {
        if (!next(f)) return { title: get('titre'), sub: get('sous'), time: get('heure') };
        return { title: get('suivant'), sub: get('suivant_sous'), time: get('suivant_heure') };
      }
      function fill() {
        var w = what(), suite = get('_suite');
        suite = Array.isArray(suite) ? suite : [];
        txt(label, ctx.render(f.label || '') || (next(f) ? 'À suivre' : 'En ce moment'));
        txt(time, f.show.time ? String(w.time || '') : ''); time.hidden = !time.__t;
        txt(title, String(w.title || ''));
        txt(sub, f.show.sub ? String(w.sub || '') : ''); sub.hidden = !sub.__t;
        root.dataset.empty = w.title ? '' : 'on';
        var rest = suite.slice(next(f) ? 1 : 0, (next(f) ? 1 : 0) + (+f.more || 0));
        more.innerHTML = '';
        rest.forEach(function (x) {
          var line = el('div', 'nx-line', more);
          el('span', 'nx-ltime num', line, x.time || '');
          el('span', 'nx-ltitle', line, x.title || '');
        });
        more.hidden = !rest.length;
        shown = JSON.stringify([w, rest]);
      }
      function update(nf) {
        f = nf || f;
        root.style.setProperty('--gs', String(+f.size || 1));
        root.style.setProperty('--nx-w', (+f.width || 640) + 'px');
        root.style.setProperty('--nx-box', GFX.color((f.colors || {}).box, 'base'));
        root.style.setProperty('--nx-label', GFX.color((f.colors || {}).label, 'accent'));
        GFX.place(pos, f.pos);
        fill();
        tick();
      }
      function tick() {
        var e = next(f) && f.show.eta ? String(get('suivant_dans') || '') : '';
        txt(eta, e ? (e === 'maintenant' ? 'maintenant' : 'dans ' + e) : ''); eta.hidden = !eta.__t;
        var w = what(), suite = get('_suite');
        suite = Array.isArray(suite) ? suite : [];
        var key = JSON.stringify([w, suite.slice(next(f) ? 1 : 0, (next(f) ? 1 : 0) + (+f.more || 0))]);
        /* the running order moved on: the new item swaps in (once) */
        if (key !== shown) { shown = key; ctx.swap(fill); }
      }
      update(f);
      return {
        update: update, tick: tick,
        setLive: function (L, prev) { if (L.air && !(prev && prev.air)) fill(); },
        parts: function () {
          var p = [{ el: head, role: 'bandA' }, { el: box, role: 'surface' }, { el: title, role: 'title' }];
          if (!sub.hidden) p.push({ el: sub, role: 'text' });
          if (!more.hidden) [].forEach.call(more.children, function (c, i) { p.push({ el: c, role: 'items', i: i }); });
          return p;
        }
      };
    }
  });
})();
