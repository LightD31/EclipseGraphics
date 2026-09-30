/* Ticker — a band of news along the bottom (or the top) of the screen, on
   its own. Three ways to run it:
     crawl    the messages scroll by continuously, separated by a mark
     rotate   one message at a time, each for a few seconds
     sets     series of label/value segments, like the bandeau's ticker
   Messages take variables, so a module (or a free variable changed from
   Companion) can feed it live. */
(function () {
  'use strict';
  var U = window.GFXShared, el = GFX.el, txt = GFX.text;
  function isMode(m) { return function (f) { return f.mode === m; }; }

  var schema = [
    { title: 'Contenu', fields: [
      { key: 'mode', type: 'select', label: 'Défilement', default: 'crawl',
        options: [['crawl', 'Défilement continu'], ['rotate', 'Un message à la fois'], ['sets', 'Séries de segments']] },
      { key: 'items', type: 'list', label: 'Messages', add: 'Ajouter un message', itemLabel: '{{text}}',
        default: [{ text: 'Premier message du défilant' }, { text: 'Second message, avec une {{clock.hm}} par exemple' }],
        showIf: function (f) { return f.mode !== 'sets'; }, item: [{ key: 'text', type: 'text', label: 'Texte', default: '', vars: true }] },
      { key: 'itemsVar', type: 'select', label: 'Messages d\'une variable (liste)', default: '', options: 'listVars',
        showIf: function (f) { return f.mode !== 'sets'; }, help: 'ajoutés après les messages ci-dessus' },
      { key: 'sets', type: 'list', label: 'Séries', itemLabel: 'Série {{n}}', add: 'Ajouter une série', showIf: isMode('sets'),
        default: [{ segments: [{ label: 'Rubrique', value: 'Valeur', sub: '' }] }],
        item: [{ key: 'segments', type: 'list', label: 'Segments', max: 6, add: 'Ajouter un segment', itemLabel: '{{label}}',
                 default: [{ label: 'Rubrique', value: 'Valeur', sub: '' }],
                 item: [{ key: 'label', type: 'text', label: 'Intitulé', default: '', vars: true },
                        { key: 'value', type: 'text', label: 'Valeur', default: '', vars: true },
                        { key: 'sub', type: 'text', label: 'Précision', default: '', vars: true }] }] },
      { key: 'speed', type: 'range', label: 'Vitesse', default: 120, min: 30, max: 400, step: 5, unit: 'px/s', showIf: isMode('crawl') },
      { key: 'separator', type: 'text', label: 'Séparateur', default: '•', showIf: isMode('crawl') },
      { key: 'every', type: 'number', label: 'Durée par message', default: 7, min: 2, max: 120, unit: 's',
        showIf: function (f) { return f.mode !== 'crawl'; } },
      { key: 'tag', type: 'text', label: 'Étiquette', default: 'Info', vars: true, help: 'vide : pas d\'étiquette' },
      { key: 'clock', type: 'toggle', label: 'Horloge', default: true },
      { key: 'clockText', type: 'text', label: 'Texte de l\'horloge', default: '{{clock.hm}}', vars: true,
        showIf: function (f) { return f.clock; } }
    ] },
    { title: 'Position', fields: [
      { key: 'edge', type: 'select', label: 'Bord', default: 'bottom', options: [['bottom', 'en bas'], ['top', 'en haut']] },
      { key: 'mx', type: 'number', label: 'Marge latérale', default: 0, min: 0, max: 600, unit: 'px' },
      { key: 'my', type: 'number', label: 'Marge', default: 0, min: 0, max: 600, unit: 'px' },
      { key: 'size', type: 'range', label: 'Taille', default: 1, min: 0.6, max: 1.8, step: 0.02, unit: '×' },
      GFX.fields.colorOverride('colors.band', 'Fond', 'base'),
      GFX.fields.colorOverride('colors.tag', 'Fond de l\'étiquette', 'accent')
    ] },
    GFX.fields.motion()
  ];

  GFX.type('ticker', {
    label: 'Défilant', icon: '⇆',
    move: { box: '.tk-bar', kind: 'edge' },
    desc: 'Bande de messages qui défilent, un à un, ou en séries de segments',
    schema: schema,
    create: function (ctx, f) {
      var root = ctx.root;
      var bar = el('div', 'tk-bar', root);
      var tag = el('div', 'tk-tag head', bar);
      var band = el('div', 'tk-band', bar);
      var view = el('div', 'tk-view', band);
      var track = el('div', 'tk-track', view);
      var clock = el('div', 'tk-clock num', band);
      var x = 0, seqW = 0, last = 0, raf = 0, key = '', idx = -1, swapT = 0, items = [];

      function messages() {
        var list = (f.items || []).map(function (it) { return ctx.render(it.text); });
        var v = f.itemsVar ? ctx.get(f.itemsVar) : null;
        if (Array.isArray(v)) list = list.concat(v.map(function (s) { return ctx.render(String(s)); }));
        return list.filter(function (s) { return s.trim(); });
      }
      function sets() {
        return (f.sets || []).map(function (s) {
          return (s.segments || []).map(function (g) { return [ctx.render(g.label), ctx.render(g.value), ctx.render(g.sub)]; });
        }).filter(function (s) { return s.length; });
      }
      /* crawl: the sequence twice over, wrapped when the first copy has gone by */
      function buildCrawl(list) {
        var k = list.join('\u0001') + '|' + f.separator;
        if (k === key) return;
        key = k;
        track.innerHTML = '';
        items = [];
        for (var copy = 0; copy < 2; copy++) {
          list.forEach(function (s) {
            var it = el('span', 'tk-item', track, s);
            if (!copy) items.push(it);
            if (f.separator) el('span', 'tk-sep', track, f.separator);
          });
        }
        seqW = track.scrollWidth / 2;
        if (seqW) x = x % seqW;
      }
      function frame(ts) {
        raf = requestAnimationFrame(frame);
        var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
        last = ts;
        if (f.mode !== 'crawl' || !seqW || !ctx.onAir()) return;
        x = (x + dt * (+f.speed || 120)) % seqW;
        track.style.transform = 'translate3d(' + (-x).toFixed(1) + 'px,0,0)';
      }
      raf = requestAnimationFrame(frame);
      var OUT = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(0,-60%,0)' }];
      var IN = [{ opacity: 0, transform: 'translate3d(0,60%,0)' }, { opacity: 1, transform: 'none' }];
      function showOne(content, id, build) {
        if (id === key) { if (!swapT) build(content, true); return; }
        var first = !key;
        key = id;
        if (first || !ctx.onAir() || !track.animate) { build(content); return; }
        clearTimeout(swapT);
        var a = track.animate(OUT, { duration: 220, easing: 'ease-in', fill: 'forwards' });
        swapT = setTimeout(function () {
          build(content); a.cancel();
          track.animate(IN, { duration: 320, easing: 'cubic-bezier(0.22,1,0.36,1)', fill: 'backwards' });
          swapT = 0;
        }, 230);
      }
      function buildText(s, refresh) {
        if (refresh && items[0]) { txt(items[0], s); return; }
        track.innerHTML = ''; items = [el('span', 'tk-item', track, s)];
      }
      function buildSet(set, refresh) {
        if (refresh && track.children.length === set.length) {
          set.forEach(function (g, k) { var s = track.children[k]; txt(s.children[0], g[0]); txt(s.children[1], g[1]); txt(s.children[2], g[2]); });
          return;
        }
        track.innerHTML = '';
        items = set.map(function (g) {
          var s = el('span', 'tk-seg', track);
          el('span', 'lbl', s, g[0]); el('span', 'val', s, g[1]); el('span', 'sub', s, g[2]);
          return s;
        });
      }

      function update(nf) {
        f = nf || f;
        root.dataset.mode = f.mode;
        root.dataset.edge = f.edge === 'top' ? 'top' : 'bottom';
        root.style.setProperty('--gs', String(+f.size || 1));
        root.style.setProperty('--mx', (+f.mx || 0) + 'px');
        root.style.setProperty('--my', (+f.my || 0) + 'px');
        root.style.setProperty('--tk-band', GFX.color((f.colors || {}).band, 'base'));
        root.style.setProperty('--tk-tag', GFX.color((f.colors || {}).tag, 'accent'));
        clock.hidden = !f.clock;
        key = ''; idx = -1; x = 0;
        track.style.transform = '';
        tick(ctx.now());
      }
      function tick(now) {
        txt(tag, ctx.render(f.tag));
        tag.hidden = !tag.__t;
        if (f.clock) txt(clock, ctx.render(f.clockText));
        var every = Math.max(2, +f.every || 7) * 1000;
        if (f.mode === 'crawl') { buildCrawl(messages()); seqW = track.scrollWidth / 2; }
        else if (f.mode === 'rotate') {
          var list = messages(), i = list.length ? Math.floor(now / every) % list.length : 0;
          showOne(list[i] || '', 'r' + i + ':' + (list[i] || ''), buildText);
        } else {
          var ss = sets(), j = ss.length ? Math.floor(now / every) % ss.length : 0, set = ss[j] || [];
          showOne(set, 's' + j + ':' + set.map(function (g) { return g[0]; }).join('|'), buildSet);
        }
      }
      update(f);
      return {
        update: update, tick: tick,
        onIn: function () { key = ''; tick(ctx.now()); if (f.mode === 'crawl') { seqW = track.scrollWidth / 2; } },
        parts: function () {
          var p = [{ el: band, role: 'bandB' }];
          if (!tag.hidden) p.push({ el: tag, role: 'bandA' });
          if (f.mode !== 'crawl') items.forEach(function (it, i) { p.push({ el: it, role: 'items', i: i }); });
          else p.push({ el: view, role: 'text' });
          if (!clock.hidden) p.push({ el: clock, role: 'clock' });
          return p;
        },
        destroy: function () { cancelAnimationFrame(raf); clearTimeout(swapT); }
      };
    }
  });
})();
