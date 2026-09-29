/* Bandeau — the lower third of the eclipse and A350F overlays, as a
   configurable graphic:

     ┌─────┐ ┌ strap ─────────────────────────┐
     │panel│ ├ band: [tag] HEADLINE ····· timer ┤
     │     │ ├ ticker: seg · seg · seg ·· clock ┤
     └─────┘ └ progress line ───────────────────┘

   Every block is optional and every text takes variables ({{a350f.alt}},
   {{var.score}}, {{clock}}…). Three layouts, morphing into one another on
   air: lower (the bar above), full (the panel's visual takes the canvas, the
   strap goes top-right, the band becomes a right-hand column with the big
   timer, the ticker stays at the bottom, a second visual sits in a corner
   card) and recap (full, with a module's summary in the column). Visuals
   come from modules (the eclipse's sky, the A350F's live map…) or an image. */
(function () {
  'use strict';
  var U = window.GFXShared, M = window.GFXMotion, el = GFX.el, txt = GFX.text;

  var schema = [
    { title: 'Titre', fields: [
      { key: 'band.headline', type: 'text', label: 'Titre', default: 'Titre du direct', vars: true,
        help: 'sur une ligne, taille ajustée automatiquement' },
      { key: 'band.tag', type: 'text', label: 'Étiquette avant le titre', default: '', vars: true, placeholder: 'EN DIRECT' }
    ].concat(GFX.fields.timer('band.timer', { mode: 'none' })) },
    { title: 'Bande d\'info', fields: [
      { key: 'strap.enabled', type: 'toggle', label: 'Afficher la bande d\'info', default: true },
      { key: 'strap.main', type: 'text', label: 'Texte en gras', default: 'Texte en gras', vars: true, showIf: on('strap.enabled') },
      { key: 'strap.second', type: 'text', label: 'Second texte en gras', default: '', vars: true, showIf: on('strap.enabled') },
      { key: 'strap.accent', type: 'text', label: 'Texte en couleur', default: 'Lieu', vars: true, showIf: on('strap.enabled') },
      { key: 'strap.info', type: 'text', label: 'Texte courant', default: '', vars: true, showIf: on('strap.enabled') },
      { key: 'strap.badge', type: 'toggle', label: 'Pastille « en direct »', default: false, showIf: on('strap.enabled') },
      { key: 'strap.badgeText', type: 'text', label: 'Texte de la pastille', default: 'En direct', vars: true, showIf: on('strap.badge') },
      { key: 'strap.badgeIdle', type: 'text', label: 'Pastille grisée si…', default: '', vars: true, showIf: on('strap.badge'),
        help: 'grisée quand ce champ n\'est pas vide (par ex. une variable « signal perdu »)' },
      { key: 'strapFull.enabled', type: 'toggle', label: 'Autre contenu en plein écran', default: false, showIf: on('strap.enabled') },
      { key: 'strapFull.main', type: 'text', label: 'Plein écran · gras', default: '', vars: true, showIf: on('strapFull.enabled') },
      { key: 'strapFull.second', type: 'text', label: 'Plein écran · second gras', default: '', vars: true, showIf: on('strapFull.enabled') },
      { key: 'strapFull.accent', type: 'text', label: 'Plein écran · couleur', default: '', vars: true, showIf: on('strapFull.enabled') },
      { key: 'strapFull.info', type: 'text', label: 'Plein écran · courant', default: '', vars: true, showIf: on('strapFull.enabled') }
    ] },
    { title: 'Défilant', fields: [
      { key: 'ticker.enabled', type: 'toggle', label: 'Afficher le défilant', default: true },
      { key: 'ticker.source', type: 'select', label: 'Contenu', default: 'static', showIf: on('ticker.enabled'),
        options: [['static', 'Séries ci-dessous'], ['var', 'Variable d\'un module']] },
      { key: 'ticker.var', type: 'select', label: 'Variable', default: '', options: 'listVars',
        showIf: function (f) { return f.ticker.enabled && f.ticker.source === 'var'; } },
      { key: 'ticker.sets', type: 'list', label: 'Séries', itemLabel: 'Série {{n}}', add: 'Ajouter une série',
        showIf: function (f) { return f.ticker.enabled && f.ticker.source !== 'var'; },
        default: [{ segments: [{ label: 'Rubrique', value: 'Valeur', sub: 'précision' }, { label: 'Autre', value: '12:00', sub: '' }] }],
        item: [
          { key: 'segments', type: 'list', label: 'Segments', max: 6, add: 'Ajouter un segment', itemLabel: '{{label}}',
            default: [{ label: 'Rubrique', value: 'Valeur', sub: '' }],
            item: [
              { key: 'label', type: 'text', label: 'Intitulé', default: 'Rubrique', vars: true },
              { key: 'value', type: 'text', label: 'Valeur', default: '', vars: true },
              { key: 'sub', type: 'text', label: 'Précision', default: '', vars: true }
            ] }
        ] },
      { key: 'ticker.rotate', type: 'number', label: 'Changer de série toutes les', default: 12, min: 0, max: 600, unit: 's',
        help: '0 : première série seulement', showIf: on('ticker.enabled') },
      { key: 'ticker.clock', type: 'toggle', label: 'Horloge à droite', default: true, showIf: on('ticker.enabled') },
      { key: 'ticker.clockText', type: 'text', label: 'Texte de l\'horloge', default: '{{clock}}', vars: true,
        showIf: function (f) { return f.ticker.enabled && f.ticker.clock; } }
    ] },
    { title: 'Ligne de progression', fields: [
      { key: 'timeline.enabled', type: 'toggle', label: 'Afficher la ligne', default: true },
      { key: 'timeline.mode', type: 'select', label: 'Progression', default: 'range', showIf: on('timeline.enabled'),
        options: [['range', 'Entre deux heures'], ['var', 'Variables d\'un module']] },
      { key: 'timeline.from', type: 'datetime', label: 'Début', default: '', showIf: mode('range') },
      { key: 'timeline.to', type: 'datetime', label: 'Fin', default: '', showIf: mode('range') },
      { key: 'timeline.marks', type: 'list', label: 'Repères', add: 'Ajouter un repère', itemLabel: '{{at}}', default: [],
        showIf: mode('range'), item: [{ key: 'at', type: 'datetime', label: 'Heure', default: '' }] },
      { key: 'timeline.progressVar', type: 'select', label: 'Avancement (0 à 1)', default: '', options: 'listVars', showIf: mode('var') },
      { key: 'timeline.marksVar', type: 'select', label: 'Repères (liste de 0 à 1)', default: '', options: 'listVars', showIf: mode('var') }
    ] },
    { title: 'Panneau et plein écran', fields: [
      { key: 'panel.source', type: 'select', label: 'Panneau de gauche', default: 'none', options: 'panelSources',
        help: 'en plein écran, c\'est lui qui prend tout l\'écran' },
      { key: 'panel.image', type: 'media', label: 'Image', accept: 'image', default: '', showIf: function (f) { return f.panel.source === 'image'; } },
      { key: 'panel.fit', type: 'select', label: 'Cadrage de l\'image', default: 'contain',
        options: [['contain', 'entière'], ['cover', 'remplit le panneau']], showIf: function (f) { return f.panel.source === 'image'; } },
      GFX.fields.colorOverride('panel.bg', 'Fond du panneau', 'base'),
      { key: 'card.source', type: 'select', label: 'Vignette (plein écran)', default: 'none', options: 'cardSources',
        help: 'la commande main.toggle échange vignette et plein écran' },
      { key: 'card.width', type: 'range', label: 'Largeur de la vignette', default: 24, min: 12, max: 40, step: 0.5, unit: '% de l\'écran' },
      { key: 'column.sources', type: 'list', label: 'Colonne de droite (plein écran)', add: 'Ajouter un bloc', default: [],
        itemLabel: '{{source}}', item: [{ key: 'source', type: 'select', label: 'Bloc', default: '', options: 'columnSources' }] }
    ] },
    { title: 'Mise en page', fields: [
      { key: 'layout.width', type: 'select', label: 'Largeur', default: 'full',
        options: [['full', 'toute la largeur'], ['fit', 'ajustée au contenu']] },
      { key: 'layout.mx', type: 'number', label: 'Marge latérale', default: 0, min: 0, max: 400, unit: 'px' },
      { key: 'layout.my', type: 'number', label: 'Marge du bas', default: 0, min: 0, max: 400, unit: 'px' },
      { key: 'size', type: 'range', label: 'Taille', default: 1, min: 0.6, max: 1.6, step: 0.02, unit: '×' },
      GFX.fields.colorOverride('colors.band', 'Fond du titre', 'accent'),
      GFX.fields.colorOverride('colors.bandText', 'Texte du titre', 'onAccent'),
      GFX.fields.colorOverride('colors.strap', 'Fond de la bande d\'info', 'surface'),
      GFX.fields.colorOverride('colors.strapText', 'Texte de la bande d\'info', 'onSurface'),
      GFX.fields.colorOverride('colors.ticker', 'Fond du défilant', 'base')
    ] },
    GFX.fields.motion()
  ];
  function on(key) { return function (f) { return !!U.getPath(f, key); }; }
  function mode(m) { return function (f) { return f.timeline.enabled && f.timeline.mode === m; }; }

  GFX.type('bandeau', {
    label: 'Bandeau', icon: '▬',
    desc: 'Titre, bande d\'info, défilant et minuteur ; plein écran avec carte ou visuel de module',
    schema: schema,
    commands: [['air.toggle', 'Antenne'], ['layout.lower', 'Bandeau'], ['layout.full', 'Plein écran'], ['layout.recap', 'Bilan'],
               ['main.toggle', 'Échanger'], ['card.toggle', 'Vignette']],
    create: function (ctx, f) {
      var root = ctx.root;
      var bar = el('div', 'bd-bar', root);
      var panelBox = el('div', 'bd-panelbox', bar);
      var panel = el('div', 'bd-panel', panelBox);
      var visA = el('div', 'bd-vis bd-vis-a', panel);
      var visB = el('div', 'bd-vis bd-vis-b', panel);
      var right = el('div', 'bd-right', bar);
      var flashSlot = el('div', 'bd-flashslot', right);
      var strapBox = el('div', 'bd-strapbox', right);
      var strap = el('div', 'bd-strap', strapBox);
      var s1 = el('b', 'bd-s1', strap), s2 = el('b', 'bd-s2', strap);
      var acc = el('span', 'bd-acc', strap), info = el('span', 'bd-info', strap);
      var live = el('span', 'bd-live gfx-live', strap);
      var col = el('div', 'bd-col', right);
      var band = el('div', 'bd-band', col);
      var tag = el('div', 'bd-tag head', band);
      var headline = el('div', 'bd-headline', band);
      var title = el('div', 'bd-title head', headline);
      var timer = el('div', 'bd-timer', band);
      var tlabel = el('div', 'bd-tlabel', timer), tvalue = el('div', 'bd-tvalue num', timer);
      var sheen = el('i', 'bd-sheen', band);
      var extra = el('div', 'bd-extra', col);
      var tickerBox = el('div', 'bd-tickerbox', right);
      var ticker = el('div', 'bd-ticker', tickerBox);
      var segWrap = el('div', 'bd-segs', ticker);
      var clock = el('div', 'bd-clock num', ticker);
      var timeline = el('div', 'bd-timeline', right);
      var fill = el('div', 'bd-fill', timeline);
      [[panel, 'panel'], [visA, 'va'], [visB, 'vb'], [strap, 'strap'], [band, 'band'], [extra, 'extra'],
       [ticker, 'ticker'], [timeline, 'timeline']].forEach(function (p) { p[0].style.viewTransitionName = ctx.vt(p[1]); });

      var fitter = GFX.fitter(title, headline, { min: 20, max: 76, heightEl: band, ratio: 0.5 });
      var cur = { layout: '', main: '', card: null };
      var mounts = { a: null, b: null }, columns = [], segs = [], marks = [];
      var tickerId = '', tickerSwap = 0, titleWanted = null, titleBusy = false;

      /* What a module's visual needs to frame its camera clear of the blocks */
      var host = {
        obstacles: function () {
          var r = function (n) { return n && n.offsetWidth ? n.getBoundingClientRect() : null; };
          var full = cur.layout !== 'lower';
          return {
            col: full ? r(col) : null, strap: full && !strap.hidden ? r(strap) : null,
            bottom: full ? r(tickerBox.hidden ? timeline : tickerBox) : null,
            card: full ? r(visA.dataset.place === 'card' ? visA : visB.dataset.place === 'card' ? visB : null) : null
          };
        },
        layout: function () { return { layout: cur.layout, main: cur.main, card: cur.card, view: (ctx.live().view || {}) }; }
      };

      function srcOf(which) { return which === 'a' ? f.panel.source : f.card.source; }
      function imageVisual(box) {
        var img = el('img', 'bd-img', box);
        img.alt = '';
        return {
          set: function () { img.src = GFX.media(f.panel.image); img.style.objectFit = f.panel.fit || 'contain'; },
          place: function (p) { img.style.objectFit = p === 'canvas' ? 'cover' : (f.panel.fit || 'contain'); },
          destroy: function () { img.remove(); }
        };
      }
      function mountSlot(which) {
        var box = which === 'a' ? visA : visB, src = srcOf(which) || 'none', m = mounts[which];
        if (m && m.src === src && (m.ctrl || src === 'none')) {
          if (m.ctrl && m.ctrl.set) m.ctrl.set();
          return;
        }
        if (m && m.ctrl && m.ctrl.destroy) try { m.ctrl.destroy(); } catch (e) { /* replaced anyway */ }
        box.innerHTML = '';
        box.className = 'bd-vis bd-vis-' + which;
        m = mounts[which] = { src: src, ctrl: null };
        if (src === 'image' && which === 'a') { m.ctrl = imageVisual(box); m.ctrl.set(); }
        else if (/^module:/.test(src)) m.ctrl = ctx.visual(src, box, host);
        box.dataset.src = src;
      }
      function mountColumns() {
        var want = (f.column.sources || []).map(function (c) { return c.source; }).filter(Boolean);
        if (want.join('|') === columns.map(function (c) { return c.src; }).join('|') &&
            columns.every(function (c) { return c.ctrl; })) return;
        columns.forEach(function (c) { if (c.ctrl && c.ctrl.destroy) c.ctrl.destroy(); });
        extra.innerHTML = '';
        columns = want.map(function (src) {
          var box = el('div', 'bd-colblock', extra);
          var mm = /^module:(\w+)\.(\w+)$/.exec(src), D = mm && window.GFXModules && window.GFXModules[mm[1]];
          var def = D && D.columns && D.columns[mm[2]];
          return { src: src, box: box, layouts: (def && def.layouts) || ['full'], ctrl: ctx.column(src, box, host) };
        });
      }
      function places() {
        var full = cur.layout !== 'lower', hasA = srcOf('a') !== 'none', hasB = srcOf('b') !== 'none';
        var main = cur.main === 'card' && hasB ? 'card' : 'panel';
        var pa = !full ? 'panel' : main === 'panel' ? 'canvas' : (cur.card && hasA ? 'card' : 'hidden');
        var pb = !full || !hasB ? 'hidden' : main === 'card' ? 'canvas' : (cur.card ? 'card' : 'hidden');
        if (!hasA && full && main === 'panel') pa = 'canvas';
        visA.dataset.place = pa; visB.dataset.place = pb;
        root.dataset.swap = main === 'card' ? 'on' : 'off';
        [['a', pa], ['b', pb]].forEach(function (x) {
          var m = mounts[x[0]];
          if (m && m.ctrl && m.ctrl.place) try { m.ctrl.place(x[1]); } catch (e) { console.error(e); }
        });
        columns.forEach(function (c) { c.box.hidden = c.layouts.indexOf(cur.layout) < 0; });
        extra.hidden = !columns.some(function (c) { return !c.box.hidden; });
        panelBox.hidden = !hasA && !full;
      }
      function notifyLayout() {
        var L = host.layout();
        ['a', 'b'].forEach(function (w) { var m = mounts[w]; if (m && m.ctrl && m.ctrl.layout) try { m.ctrl.layout(L); } catch (e) { console.error(e); } });
        columns.forEach(function (c) { if (c.ctrl && c.ctrl.layout) try { c.ctrl.layout(L); } catch (e) { console.error(e); } });
      }

      function setSegs(n) {
        while (segs.length < n) {
          var s = el('div', 'bd-seg', segWrap);
          segs.push({ root: s, lbl: el('span', 'lbl', s), val: el('span', 'val', s), sub: el('span', 'sub', s) });
        }
        while (segs.length > n) segs.pop().root.remove();
      }
      function tickerSets() {
        var sets = f.ticker.source === 'var' ? ctx.get(f.ticker.var) : (f.ticker.sets || []).map(function (s) { return s.segments || []; });
        if (!Array.isArray(sets)) return [];
        return sets.filter(Array.isArray).map(function (set) {
          return set.map(function (sg) {
            if (Array.isArray(sg)) return [ctx.render(sg[0]), ctx.render(sg[1]), ctx.render(sg[2])];
            return [ctx.render(sg && sg.label), ctx.render(sg && sg.value), ctx.render(sg && sg.sub)];
          });
        }).filter(function (s) { return s.length; });
      }
      var SEG_OUT = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(-24px,0,0)' }];
      function fillSegs(set) {
        setSegs(set.length);
        set.forEach(function (sg, k) { txt(segs[k].lbl, sg[0]); txt(segs[k].val, sg[1]); txt(segs[k].sub, sg[2]); });
      }
      /* A different set slides the old one out, then cascades the new one in
         (Web Animations over the entrance's own, so neither disturbs the other) */
      function showSet(id, set) {
        if (id === tickerId) { if (!tickerSwap) fillSegs(set); return; }
        var first = !tickerId;
        tickerId = id;
        clearTimeout(tickerSwap); tickerSwap = 0;
        if (first || !ctx.onAir() || !segs.length || !segs[0].root.animate) { fillSegs(set); return; }
        var outs = segs.map(function (s) { return s.root.animate(SEG_OUT, { duration: 250, easing: 'ease-in', fill: 'forwards' }); });
        tickerSwap = setTimeout(function () {
          fillSegs(set);
          outs.forEach(function (a) { a.cancel(); });
          segs.forEach(function (s, k) {
            s.root.animate(SEG_OUT.slice().reverse(), { duration: 350, delay: k * 80, easing: 'ease-out', fill: 'backwards' });
          });
          tickerSwap = 0;
        }, 280);
      }
      function setMarks(list) {
        list = (list || []).filter(function (x) { return x >= 0 && x <= 1; });
        var key = list.map(function (x) { return x.toFixed(4); }).join(',');
        if (key === timeline._marks) return;
        timeline._marks = key;
        marks.forEach(function (m) { m.remove(); });
        marks = list.map(function (x) { var m = el('div', 'bd-mk', timeline); m.style.left = (x * 100) + '%'; return m; });
      }
      function setTitle(s) {
        titleWanted = s;
        if (titleBusy || title.__t === s) return;
        if (title.__t == null || !ctx.onAir()) { txt(title, s); fitter.fit(); return; }
        titleBusy = true;
        M.change(title, function () { txt(title, titleWanted); fitter.fit(); }, ctx.motion()).then(function () {
          titleBusy = false;
          if (title.__t !== titleWanted) setTitle(titleWanted);
        });
      }

      function update(nf) {
        f = nf || f;
        root.style.setProperty('--gs', String(+f.size || 1));
        root.style.setProperty('--mx', (+f.layout.mx || 0) + 'px');
        root.style.setProperty('--my', (+f.layout.my || 0) + 'px');
        root.style.setProperty('--card-w', (+f.card.width || 24) + 'vw');
        root.dataset.width = f.layout.width === 'fit' ? 'fit' : 'full';
        var cs = f.colors || {};
        [['--bd-band', cs.band, 'accent'], ['--bd-band-fg', cs.bandText, 'onAccent'], ['--bd-strap', cs.strap, 'surface'],
         ['--bd-strap-fg', cs.strapText, 'onSurface'], ['--bd-ticker', cs.ticker, 'base'], ['--bd-panel', f.panel.bg, 'base']]
          .forEach(function (c) { root.style.setProperty(c[0], GFX.color(c[1], c[2])); });
        tickerBox.hidden = !f.ticker.enabled;
        clock.hidden = !f.ticker.clock;
        timeline.hidden = !f.timeline.enabled;
        var bottom = (f.ticker.enabled ? 76 : 0) + (f.timeline.enabled ? 18 : 0);
        root.style.setProperty('--bottom-h', bottom + 'px');
        root.style.setProperty('--ticker-bottom', (f.timeline.enabled ? 18 : 0) + 'px');
        mountSlot('a'); mountSlot('b'); mountColumns();
        if (cur.layout) { places(); notifyLayout(); }
        tickerId = '';
        tick(ctx.now());
        fitter.fit();
      }

      function tick(now) {
        var L = ctx.live(), full = cur.layout && cur.layout !== 'lower';
        setTitle(L.headline || ctx.render(f.band.headline));
        txt(tag, ctx.render(f.band.tag));
        tag.hidden = !tag.__t;
        var tm = GFX.timer(f.band.timer, ctx, now);
        timer.hidden = f.band.timer.mode === 'none';
        txt(tlabel, tm.label); tlabel.hidden = !tm.label;
        txt(tvalue, tm.value);
        var sf = full && f.strapFull.enabled ? f.strapFull : f.strap;
        txt(s1, ctx.render(sf.main)); txt(s2, ctx.render(sf.second));
        txt(acc, ctx.render(sf.accent)); txt(info, ctx.render(sf.info));
        live.hidden = !f.strap.badge;
        if (f.strap.badge) {
          txt(live, ctx.render(f.strap.badgeText));
          live.classList.toggle('idle', !!ctx.render(f.strap.badgeIdle).trim());
        }
        strap.hidden = !f.strap.enabled || (!s1.__t && !s2.__t && !acc.__t && !info.__t && live.hidden);
        if (f.ticker.enabled) {
          var sets = tickerSets(), rot = +f.ticker.rotate || 0;
          var i = sets.length && rot > 0 ? Math.floor(now / (rot * 1000)) % sets.length : 0;
          var set = sets[i] || [];
          showSet(i + ':' + set.map(function (s) { return s[0]; }).join('|'), set);
          if (f.ticker.clock) txt(clock, ctx.render(f.ticker.clockText));
        }
        if (f.timeline.enabled) {
          var p = 0, mk = [];
          if (f.timeline.mode === 'var') {
            p = +ctx.get(f.timeline.progressVar) || 0;
            var mv = ctx.get(f.timeline.marksVar);
            mk = Array.isArray(mv) ? mv.map(Number) : [];
          } else {
            var a = U.parseWhen(ctx.render(f.timeline.from), ctx.tz()), b = U.parseWhen(ctx.render(f.timeline.to), ctx.tz());
            if (a != null && b != null && b > a) {
              p = (now - a) / (b - a);
              mk = (f.timeline.marks || []).map(function (m) {
                var t = U.parseWhen(ctx.render(m.at), ctx.tz());
                return t == null ? -1 : (t - a) / (b - a);
              });
            }
          }
          fill.style.width = (Math.min(1, Math.max(0, p)) * 100).toFixed(2) + '%';
          setMarks(mk);
        }
      }

      update(f);
      return {
        update: update,
        tick: tick,
        slot: function (name) { return name === 'flash' ? flashSlot : null; },
        setLive: function (L) {
          var layout = ['lower', 'full', 'recap'].indexOf(L.layout) >= 0 ? L.layout : 'lower';
          var main = L.main === 'card' ? 'card' : 'panel', card = L.card !== false;
          var view = JSON.stringify(L.view || {});
          if (layout === cur.layout && main === cur.main && card === cur.card && view === cur.view) return;
          var morph = cur.layout && (layout !== cur.layout || main !== cur.main || card !== cur.card);
          var apply = function () {
            cur = { layout: layout, main: main, card: card, view: view };
            root.dataset.layout = layout;
            root.dataset.card = card ? 'on' : 'off';
            var v = L.view || {};
            for (var k in v) root.dataset['v' + k.charAt(0).toUpperCase() + k.slice(1)] = v[k];
            places();
            notifyLayout();
            tick(ctx.now());
            fitter.refitFor(1300);
          };
          if (morph) ctx.morph(apply); else apply();
        },
        parts: function () {
          var p = [];
          if (!panelBox.hidden) p.push({ el: panel, role: 'panel' });
          p.push({ el: band, role: 'bandA' }, { el: title, role: 'title' }, { el: sheen, role: 'sheen' });
          if (!tag.hidden) p.push({ el: tag, role: 'tag' });
          if (!timer.hidden) p.push({ el: timer, role: 'figure' });
          if (!strap.hidden) p.push({ el: strap, role: 'surface' });
          if (!tickerBox.hidden) {
            p.push({ el: ticker, role: 'bandB' });
            segs.forEach(function (s, i) { p.push({ el: s.root, role: 'items', i: i }); });
            if (!clock.hidden) p.push({ el: clock, role: 'clock' });
          }
          if (!timeline.hidden) p.push({ el: timeline, role: 'line' });
          if (!extra.hidden) p.push({ el: extra, role: 'block' });
          ['a', 'b'].forEach(function (w) {
            var m = mounts[w];
            if (m && m.ctrl && m.ctrl.parts) p = p.concat(m.ctrl.parts() || []);
          });
          columns.forEach(function (c) { if (c.ctrl && c.ctrl.parts && !c.box.hidden) p = p.concat(c.ctrl.parts() || []); });
          return p;
        },
        onIn: function () { tickerId = ''; tick(ctx.now()); fitter.fit(); },
        destroy: function () {
          fitter.destroy();
          clearTimeout(tickerSwap);
          ['a', 'b'].forEach(function (w) { var m = mounts[w]; if (m && m.ctrl && m.ctrl.destroy) m.ctrl.destroy(); });
          columns.forEach(function (c) { if (c.ctrl && c.ctrl.destroy) c.ctrl.destroy(); });
        }
      };
    }
  });
})();
