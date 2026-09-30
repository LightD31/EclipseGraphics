/* Bug — what sits in a corner for the whole show: a logo, the "en direct"
   badge, a short text, a countdown and the clock, side by side as chips. */
(function () {
  'use strict';
  var el = GFX.el, txt = GFX.text;
  function on(key) { return function (f) { return !!window.GFXShared.getPath(f, key); }; }

  var schema = [
    { title: 'Éléments', fields: [
      { key: 'logo', type: 'media', label: 'Logo', accept: 'image', default: '' },
      { key: 'logoHeight', type: 'number', label: 'Hauteur du logo', default: 72, min: 16, max: 400, unit: 'px' },
      { key: 'live.enabled', type: 'toggle', label: 'Pastille « en direct »', default: true },
      { key: 'live.text', type: 'text', label: 'Texte de la pastille', default: 'En direct', vars: true, showIf: on('live.enabled') },
      { key: 'text.enabled', type: 'toggle', label: 'Texte', default: false },
      { key: 'text.value', type: 'text', label: 'Texte', default: '{{show}}', vars: true, showIf: on('text.enabled') },
      { key: 'clock.enabled', type: 'toggle', label: 'Horloge', default: true },
      { key: 'clock.style', type: 'select', label: 'Format', default: 'hm', options: [['hm', '10:30'], ['hms', '10:30:15']], showIf: on('clock.enabled') },
      { key: 'clock.label', type: 'text', label: 'Libellé de l\'horloge', default: '', vars: true, placeholder: 'PARIS', showIf: on('clock.enabled') }
    ].concat(GFX.fields.timer('count', { mode: 'none', label: 'Début dans' })) },
    { title: 'Position', fields: GFX.fields.anchor('tr').map(function (fd) {
      if (fd.key === 'pos.x') fd.default = 56;
      if (fd.key === 'pos.y') fd.default = 44;
      return fd;
    }).concat([
      { key: 'size', type: 'range', label: 'Taille', default: 1, min: 0.5, max: 2, step: 0.02, unit: '×' },
      GFX.fields.colorOverride('colors.chip', 'Fond des pastilles', 'base'),
      GFX.fields.colorOverride('colors.live', 'Fond de « en direct »', 'accent')
    ]) },
    GFX.fields.motion()
  ];

  GFX.type('bug', {
    label: 'Logo et horloge', icon: '◷',
    move: { box: '.bg-pos' },
    desc: 'Coin d\'écran : logo, pastille « en direct », texte, compte à rebours, horloge',
    schema: schema,
    create: function (ctx, f) {
      var root = ctx.root;
      var pos = el('div', 'bg-pos', root);
      var row = el('div', 'bg-row', pos);
      var logo = el('img', 'bg-logo', row);
      logo.alt = '';
      var live = el('div', 'bg-chip bg-live', row), liveT = el('span', 'gfx-live', live);
      var text = el('div', 'bg-chip bg-text head', row);
      var count = el('div', 'bg-chip bg-count', row), cl = el('span', 'bg-clabel', count), cv = el('span', 'bg-cvalue num', count);
      var clock = el('div', 'bg-chip bg-clock', row), kl = el('span', 'bg-clabel', clock), kv = el('span', 'bg-cvalue num', clock);
      var chips = [live, text, count, clock];
      function update(nf) {
        f = nf || f;
        root.style.setProperty('--gs', String(+f.size || 1));
        root.style.setProperty('--bg-chip', GFX.color((f.colors || {}).chip, 'base'));
        root.style.setProperty('--bg-live', GFX.color((f.colors || {}).live, 'accent'));
        root.style.setProperty('--bg-logo-h', (+f.logoHeight || 72) + 'px');
        GFX.place(pos, f.pos);
        var src = GFX.media(f.logo);
        logo.hidden = !src;
        if (src && logo.getAttribute('src') !== src) logo.src = src;
        live.hidden = !f.live.enabled;
        text.hidden = !f.text.enabled;
        count.hidden = f.count.mode === 'none';
        clock.hidden = !f.clock.enabled;
        tick(ctx.now());
      }
      function tick(now) {
        if (f.live.enabled) txt(liveT, ctx.render(f.live.text));
        if (f.text.enabled) txt(text, ctx.render(f.text.value));
        if (f.count.mode !== 'none') {
          var t = GFX.timer(f.count, ctx, now);
          txt(cl, t.label); cl.hidden = !t.label;
          txt(cv, t.value);
        }
        if (f.clock.enabled) {
          txt(kl, ctx.render(f.clock.label)); kl.hidden = !kl.__t;
          txt(kv, f.clock.style === 'hms' ? window.GFXShared.hms(now, ctx.tz()) : window.GFXShared.hm(now, ctx.tz()));
        }
      }
      update(f);
      return {
        update: update, tick: tick,
        parts: function () {
          var p = [];
          if (!logo.hidden) p.push({ el: logo, role: 'visual' });
          chips.filter(function (c) { return !c.hidden; }).forEach(function (c, i) { p.push({ el: c, role: 'items', i: i }); });
          return p;
        }
      };
    }
  });
})();
