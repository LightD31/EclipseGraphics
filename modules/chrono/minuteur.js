/* "Minuteur" — the graphic the chrono module brings: one of its timers on
   screen, wherever it's dragged — a speaker's time in a corner, a big
   countdown in the middle. In a countdown's last seconds it takes the
   warning colour, at zero and in overtime the alert colour (blinking, if
   you like). The time is the module's variable: every source shows the
   same second. */
(function () {
  'use strict';
  var el = GFX.el, txt = GFX.text;

  var schema = [
    { title: 'Minuteur', fields: [
      { key: 'timer', type: 'select', label: 'Minuteur', default: '', options: 'mod:chrono.timers',
        help: 'un des minuteurs du module Minuteurs (réglés dans l\'onglet Modules)' },
      { key: 'label', type: 'text', label: 'Libellé', default: '', vars: true, placeholder: 'le nom du minuteur',
        help: 'vide : le nom du minuteur ; « - » : pas de libellé' },
      { key: 'style', type: 'select', label: 'Forme', default: 'pastille',
        options: [['pastille', 'Pastille : le libellé et le temps sur une ligne'], ['grand', 'Grand : le temps en gros, le libellé au-dessus']] },
      { key: 'warn', type: 'number', label: 'Alerte dans les dernières', default: 30, min: 0, max: 3600, unit: 's',
        help: 'un compte à rebours passe à la couleur d\'alerte ; 0 : jamais' },
      { key: 'blink', type: 'toggle', label: 'Clignote à zéro et en dépassement', default: true }
    ] },
    { title: 'Position', fields: GFX.fields.anchor('tr').map(function (fd) {
      if (fd.key === 'pos.x') fd.default = 56;
      if (fd.key === 'pos.y') fd.default = 190;
      return fd;
    }).concat([
      { key: 'size', type: 'range', label: 'Taille', default: 1, min: 0.5, max: 3, step: 0.02, unit: '×' },
      GFX.fields.colorOverride('colors.box', 'Fond', 'base'),
      { key: 'colors.warn', type: 'color', label: 'Fond dans les dernières secondes', default: '#E8960C' },
      GFX.fields.colorOverride('colors.alert', 'Fond à zéro et en dépassement', 'live')
    ]) },
    GFX.fields.motion()
  ];

  GFX.type('minuteur', {
    label: 'Minuteur', icon: '◷',
    desc: 'Un minuteur du module Minuteurs à l\'écran : temps de parole, compte à rebours, chronomètre',
    move: { box: '.mn-pos' },
    schema: schema,
    create: function (ctx, f) {
      var root = ctx.root;
      var pos = el('div', 'mn-pos', root);
      var box = el('div', 'mn-box', pos);
      var label = el('div', 'mn-label', box), time = el('div', 'mn-time num', box);
      function get(k) { var v = ctx.get('chrono.' + (f.timer || '') + k); return v == null ? '' : String(v); }
      function update(nf) {
        f = nf || f;
        root.dataset.style = f.style === 'grand' ? 'grand' : 'pastille';
        root.dataset.blink = f.blink ? 'on' : '';
        root.style.setProperty('--gs', String(+f.size || 1));
        var c = f.colors || {};
        root.style.setProperty('--mn-box', GFX.color(c.box, 'base'));
        root.style.setProperty('--mn-warn', GFX.color(c.warn || '#E8960C'));
        root.style.setProperty('--mn-alert', GFX.color(c.alert, 'live'));
        GFX.place(pos, f.pos);
        tick();
      }
      function tick() {
        var lbl = f.label === '-' ? '' : f.label ? ctx.render(f.label) : f.timer ? get('_nom') : 'Minuteur';
        txt(label, lbl); label.hidden = !lbl;
        txt(time, f.timer ? get('') || '--:--' : '--:--');
        var st = f.timer ? get('_etat') : '', s = parseInt(get('_s'), 10), down = get('_sens') === 'down';
        root.dataset.state = st;
        root.dataset.warn = down && +f.warn > 0 && (st === 'en_cours' || st === 'pause') && s > 0 && s <= +f.warn ? 'on' : '';
        root.dataset.alert = st === 'fini' || st === 'depasse' ? 'on' : '';
      }
      update(f);
      return {
        update: update, tick: tick,
        setLive: function (L, prev) { if (L.air && !(prev && prev.air)) tick(); },
        parts: function () {
          var p = [{ el: box, role: 'bandA' }, { el: time, role: 'figure' }];
          if (!label.hidden) p.push({ el: label, role: 'tag' });
          return p;
        }
      };
    }
  });
})();
