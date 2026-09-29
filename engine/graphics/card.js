/* Carte — a full-screen card, in the bandeau's fullscreen vocabulary (the
   accent block with its big type, the light strap, the navy):
     titre     a kicker, the title on the accent band, a subtitle
     attente   "starting soon": title, a big countdown, what shows after it
     chiffres  key figures in a grid (the A350F recap's cells)
     message   one line, big, on the accent band
   Over a colour, the theme's gradient, an image or a looping video — or
   nothing, to sit on the live picture. */
(function () {
  'use strict';
  var U = window.GFXShared, el = GFX.el, txt = GFX.text;
  function tpl(list) { return function (f) { return list.indexOf(f.template) >= 0; }; }
  function bgIs(list) { return function (f) { return list.indexOf(f.bg.type) >= 0; }; }

  var schema = [
    { title: 'Contenu', fields: [
      { key: 'template', type: 'select', label: 'Modèle', default: 'titre',
        options: [['titre', 'Titre'], ['attente', 'Attente, compte à rebours'], ['chiffres', 'Chiffres clés'], ['message', 'Message']] },
      { key: 'kicker', type: 'text', label: 'Surtitre', default: 'En direct', vars: true, showIf: tpl(['titre', 'attente', 'chiffres']) },
      { key: 'title', type: 'text', label: 'Titre', default: 'Titre de l\'émission', vars: true },
      { key: 'subtitle', type: 'text', label: 'Sous-titre', default: 'Sous-titre ou lieu', vars: true, showIf: tpl(['titre', 'attente', 'chiffres']) },
      { key: 'figures', type: 'list', label: 'Chiffres', max: 8, add: 'Ajouter un chiffre', itemLabel: '{{value}} {{label}}',
        showIf: tpl(['chiffres']),
        default: [{ value: '4 h 05', label: 'Durée', sub: 'premier vol' }, { value: '31 000 ft', label: 'Altitude max', sub: '9 450 m' },
                  { value: '1 250 km', label: 'Distance', sub: 'parcourus' }],
        item: [{ key: 'value', type: 'text', label: 'Valeur', default: '', vars: true },
               { key: 'label', type: 'text', label: 'Intitulé', default: '', vars: true },
               { key: 'sub', type: 'text', label: 'Précision', default: '', vars: true }] }
    ].concat(GFX.fields.timer('count', { mode: 'countdown', label: 'Début du direct dans', after: 'C\'est parti !' }).map(function (fd) {
      var base = fd.showIf;
      fd.showIf = function (f) { return f.template === 'attente' && (!base || base(f)); };
      return fd;
    })) },
    { title: 'Fond', fields: [
      { key: 'bg.type', type: 'select', label: 'Fond', default: 'gradient',
        options: [['none', 'transparent (sur l\'image)'], ['color', 'couleur'], ['gradient', 'dégradé du thème'], ['image', 'image'], ['video', 'vidéo en boucle']] },
      { key: 'bg.color', type: 'color', label: 'Couleur', default: '', theme: 'base', showIf: bgIs(['color']) },
      { key: 'bg.image', type: 'media', label: 'Image', accept: 'image', default: '', showIf: bgIs(['image']) },
      { key: 'bg.video', type: 'media', label: 'Vidéo (webm conseillé)', accept: 'video', default: '', showIf: bgIs(['video']) },
      { key: 'bg.dim', type: 'range', label: 'Assombrir', default: 0.35, min: 0, max: 0.9, step: 0.05, showIf: bgIs(['image', 'video', 'none']) }
    ] },
    { title: 'Mise en page', fields: [
      { key: 'align', type: 'select', label: 'Alignement', default: 'left', options: [['left', 'à gauche'], ['center', 'centré']] },
      { key: 'logo', type: 'media', label: 'Logo', accept: 'image', default: '' },
      { key: 'logoCorner', type: 'select', label: 'Coin du logo', default: 'tr', options: [['tl', 'en haut à gauche'], ['tr', 'en haut à droite'], ['bl', 'en bas à gauche'], ['br', 'en bas à droite']] },
      { key: 'size', type: 'range', label: 'Taille', default: 1, min: 0.6, max: 1.5, step: 0.02, unit: '×' },
      GFX.fields.colorOverride('colors.band', 'Fond du titre', 'accent')
    ] },
    GFX.fields.motion()
  ];

  GFX.type('card', {
    label: 'Plein écran', icon: '▣',
    desc: 'Carte plein écran : titre, attente avec compte à rebours, chiffres clés, message',
    schema: schema,
    create: function (ctx, f) {
      var root = ctx.root;
      var bg = el('div', 'cd-bg', root);
      var media = el('div', 'cd-media', bg);
      var dim = el('div', 'cd-dim', bg);
      var inner = el('div', 'cd-inner', root);
      var kicker = el('div', 'cd-kicker head', inner);
      var titleBox = el('div', 'cd-titlebox', inner), title = el('div', 'cd-title head', titleBox);
      var sub = el('div', 'cd-sub', inner), subT = el('span', '', sub);
      var count = el('div', 'cd-count', inner), clabel = el('div', 'cd-clabel', count), cvalue = el('div', 'cd-cvalue num', count);
      var grid = el('div', 'cd-grid', inner);
      var line = el('i', 'cd-line', root);
      var logo = el('img', 'cd-logo', root);
      logo.alt = '';
      var figs = [], mediaKey = '';
      /* the title fills the width the card allows, on one line */
      var fitter = GFX.fitter(title, inner, { padEl: titleBox, min: 40, ratio: 10,
                                              max: function () { return (f.template === 'message' ? 150 : 132) * (+f.size || 1); } });

      function setMedia() {
        var t = f.bg.type, k = t + '|' + (t === 'image' ? f.bg.image : t === 'video' ? f.bg.video : '');
        if (k === mediaKey) return;
        mediaKey = k;
        media.innerHTML = '';
        if (t === 'image' && f.bg.image) { var i = el('img', '', media); i.alt = ''; i.src = GFX.media(f.bg.image); }
        if (t === 'video' && f.bg.video) {
          var v = el('video', '', media);
          v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
          v.src = GFX.media(f.bg.video);
          v.play().catch(function () { /* OBS plays muted video without a gesture */ });
        }
      }
      function setFigs(n) {
        while (figs.length < n) {
          var c = el('div', 'cd-fig', grid);
          figs.push({ root: c, v: el('div', 'cd-fv num', c), k: el('div', 'cd-fk', c), s: el('div', 'cd-fs', c) });
        }
        while (figs.length > n) figs.pop().root.remove();
      }
      function update(nf) {
        f = nf || f;
        root.dataset.template = f.template;
        root.dataset.align = f.align === 'center' ? 'center' : 'left';
        root.dataset.bg = f.bg.type;
        root.style.setProperty('--gs', String(+f.size || 1));
        root.style.setProperty('--cd-bg', GFX.color(f.bg.color, 'base'));
        root.style.setProperty('--cd-dim', String(+f.bg.dim || 0));
        root.style.setProperty('--cd-band', GFX.color((f.colors || {}).band, 'accent'));
        setMedia();
        var src = GFX.media(f.logo);
        logo.hidden = !src;
        logo.dataset.corner = f.logoCorner || 'tr';
        if (src && logo.getAttribute('src') !== src) logo.src = src;
        var t = f.template;
        /* attente: the countdown sits in the accent block, under the title */
        if (t === 'attente') titleBox.appendChild(count); else inner.insertBefore(count, grid);
        kicker.hidden = t === 'message';
        sub.hidden = t === 'message';
        count.hidden = t !== 'attente';
        grid.hidden = t !== 'chiffres';
        setFigs(t === 'chiffres' ? (f.figures || []).length : 0);
        tick(ctx.now());
        fitter.fit();
      }
      function tick(now) {
        txt(kicker, ctx.render(f.kicker));
        if (f.template !== 'message') kicker.hidden = !kicker.__t;
        var tt = ctx.render(f.title);
        if (title.__t !== tt) { txt(title, tt); fitter.fit(); }
        txt(subT, ctx.render(f.subtitle));
        if (f.template !== 'message') sub.hidden = !subT.__t;
        if (f.template === 'attente') {
          var c = GFX.timer(f.count, ctx, now);
          txt(clabel, c.label); clabel.hidden = !c.label;
          txt(cvalue, c.value);
        }
        if (f.template === 'chiffres') (f.figures || []).forEach(function (g, i) {
          if (!figs[i]) return;
          txt(figs[i].v, ctx.render(g.value)); txt(figs[i].k, ctx.render(g.label)); txt(figs[i].s, ctx.render(g.sub));
        });
      }
      update(f);
      return {
        update: update, tick: tick,
        onIn: function () {
          var v = media.querySelector('video');
          if (v) { try { v.currentTime = 0; v.play(); } catch (e) { /* keeps looping as it was */ } }
          fitter.fit();
        },
        parts: function () {
          var p = [];
          if (f.bg.type !== 'none' || +f.bg.dim > 0) p.push({ el: bg, role: 'bg' });
          if (!kicker.hidden) p.push({ el: kicker, role: 'tag' });
          p.push({ el: titleBox, role: 'bandA' }, { el: title, role: 'title' });
          if (!sub.hidden) p.push({ el: sub, role: 'surface' }, { el: subT, role: 'text' });
          if (!count.hidden) p.push({ el: count, role: 'figure' });
          if (!grid.hidden) figs.forEach(function (g, i) { p.push({ el: g.root, role: 'items', i: i }); });
          p.push({ el: line, role: 'line' });
          if (!logo.hidden) p.push({ el: logo, role: 'visual' });
          return p;
        },
        destroy: function () { fitter.destroy(); }
      };
    }
  });
})();
