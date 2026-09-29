/* "Tableau de score" — the graphic the score module brings. Two forms:
     compact  the corner bug: abbreviations, the two scores, period and
              time of play (a timer of the Minuteurs module, or any text)
     large    a band: logos, full names, the score big, period and time
   A point scored on air rolls the number in and lights the team up. The
   values are the module's variables ({{score.a}}…), so every source shows
   the same score. */
(function () {
  'use strict';
  var el = GFX.el, txt = GFX.text, M = window.GFXMotion;
  function on(k) { return function (f) { return !!window.GFXShared.getPath(f, k); }; }

  var schema = [
    { title: 'Tableau', fields: [
      { key: 'style', type: 'select', label: 'Forme', default: 'compact',
        options: [['compact', 'Compact : abréviations, dans un coin'], ['large', 'Large : noms complets et logos']] },
      { key: 'show.period', type: 'toggle', label: 'Période', default: true },
      { key: 'show.clock', type: 'toggle', label: 'Temps de jeu', default: true },
      { key: 'clock', type: 'text', label: 'Temps de jeu', default: '{{chrono.match}}', vars: true, showIf: on('show.clock'),
        help: 'un minuteur du module Minuteurs ({{chrono.match}}…), ou tout autre texte ; masqué s\'il est vide' },
      { key: 'show.second', type: 'toggle', label: 'Second compteur (sets…)', default: false },
      { key: 'show.poss', type: 'toggle', label: 'Possession / service', default: true },
      { key: 'show.logos', type: 'toggle', label: 'Logos', default: true },
      { key: 'show.note', type: 'toggle', label: 'Note (Temps mort…)', default: true }
    ] },
    { title: 'Position', fields: GFX.fields.anchor('tl').map(function (fd) {
      if (fd.key === 'pos.x') fd.default = 56;
      if (fd.key === 'pos.y') fd.default = 48;
      return fd;
    }).concat([
      { key: 'size', type: 'range', label: 'Taille', default: 1, min: 0.5, max: 2, step: 0.02, unit: '×' },
      GFX.fields.colorOverride('colors.team', 'Fond des équipes', 'base'),
      GFX.fields.colorOverride('colors.score', 'Fond du score', 'surface'),
      GFX.fields.colorOverride('colors.scoreText', 'Chiffres du score', 'onSurface')
    ]) },
    GFX.fields.motion()
  ];

  GFX.type('scoreboard', {
    label: 'Tableau de score', icon: '⚑',
    desc: 'Le score du module « Tableau de score » : compact dans un coin, ou large avec les noms et les logos',
    schema: schema,
    create: function (ctx, f) {
      var root = ctx.root;
      var pos = el('div', 'sb-pos', root);
      var box = el('div', 'sb-box', pos);
      function team(side) {
        var t = el('div', 'sb-team ' + side, box);
        var T = { root: t, bar: el('i', 'sb-bar', t), logo: el('img', 'sb-logo', t), name: el('span', 'sb-name head', t),
                  sec: el('span', 'sb-sec num', t), poss: el('i', 'sb-poss', t), last: null };
        T.logo.alt = '';
        return T;
      }
      var A = team('a');
      var sc = el('div', 'sb-scores', box);
      A.num = el('span', 'sb-num num', el('span', 'sb-cell a', sc));
      el('span', 'sb-dash', sc, '–');
      var B0 = el('span', 'sb-cell b', sc);
      var B = team('b');
      B.num = el('span', 'sb-num num', B0);
      A.cell = A.num.parentNode; B.cell = B0;
      A.hit = el('i', 'sb-hit', A.cell); B.hit = el('i', 'sb-hit', B.cell);
      var info = el('div', 'sb-info', box);
      var period = el('span', 'sb-period', info), clock = el('span', 'sb-clock num', info);
      var note = el('div', 'sb-note head', pos);
      var noteOn = false;

      function get(k) { var v = ctx.get('score.' + k); return v == null ? '' : String(v); }
      function update(nf) {
        f = nf || f;
        root.dataset.style = f.style === 'large' ? 'large' : 'compact';
        root.style.setProperty('--gs', String(+f.size || 1));
        var c = f.colors || {};
        root.style.setProperty('--sb-team', GFX.color(c.team, 'base'));
        root.style.setProperty('--sb-score', GFX.color(c.score, 'surface'));
        root.style.setProperty('--sb-scoreText', GFX.color(c.scoreText, 'onSurface'));
        GFX.place(pos, f.pos);
        tick();
      }
      /* a point on air: the new number rolls in, the cell flashes */
      function bump(T) {
        if (!ctx.onAir() || !T.num.animate) return;
        T.num.animate([{ transform: 'translate3d(0,55%,0)', opacity: 0 }, { transform: 'none', opacity: 1 }],
                      { duration: 420, easing: M.EASE.out });
        T.hit.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
      }
      function side(T, k) {
        var large = f.style === 'large';
        txt(T.name, large ? get(k + '_nom') : get(k + '_court') || get(k + '_nom'));
        T.bar.style.background = get(k + '_couleur') || 'var(--c-accent)';
        var logo = f.show.logos ? GFX.media(get(k + '_logo')) : '';
        T.logo.hidden = !logo;
        if (logo && T.logo.getAttribute('src') !== logo) T.logo.src = logo;
        T.sec.hidden = !f.show.second;
        txt(T.sec, get(k + '2'));
        T.poss.hidden = !f.show.poss || get('poss') !== k;
        var n = get(k);
        if (T.last !== null && n !== T.last && +n > +T.last) { txt(T.num, n); bump(T); } else txt(T.num, n);
        T.last = n;
      }
      function tick() {
        side(A, 'a'); side(B, 'b');
        var p = f.show.period ? get('periode') : '', k = f.show.clock ? ctx.render(f.clock || '') : '';
        if (period.__p !== p) {
          /* "1re mi-temps": the ordinal's letters stay small, even in capitals */
          period.__p = p; period.textContent = '';
          var m = /^(\d+)(re|er|e)(\s.*)?$/.exec(p);
          if (m) { period.appendChild(document.createTextNode(m[1])); el('sup', '', period, m[2]); period.appendChild(document.createTextNode(m[3] || '')); }
          else period.textContent = p;
        }
        period.hidden = !p;
        txt(clock, k); clock.hidden = !k;
        info.hidden = !p && !k;
        var n = f.show.note ? get('note') : '';
        if (n) txt(note, n);
        if (!!n !== noteOn) {
          noteOn = !!n;
          if (noteOn) { note.hidden = false; if (ctx.onAir() && note.animate) note.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], { duration: 320, easing: M.EASE.out }); }
          else if (ctx.onAir() && note.animate) note.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).finished.then(function () { if (!noteOn) note.hidden = true; });
          else note.hidden = true;
        }
      }
      note.hidden = true;
      update(f);
      return {
        update: update, tick: tick,
        /* coming on air: in with the score as it is now */
        setLive: function (L, prev) { if (L.air && !(prev && prev.air)) tick(); },
        parts: function () {
          var p = [{ el: box, role: 'bandA' }, { el: A.root, role: 'items', i: 0 }, { el: sc, role: 'figure' }, { el: B.root, role: 'items', i: 1 }];
          if (!info.hidden) p.push({ el: info, role: 'clock' });
          if (!note.hidden) p.push({ el: note, role: 'tag' });
          return p;
        }
      };
    }
  });
})();
