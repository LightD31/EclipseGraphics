/* "Message du chat" — the graphic the twitch module brings: the chat message
   the operator put on air, with its author. Two forms: a bubble, or a strap
   like the synthé's. A new message while on air swaps in with the motion of
   the show. */
(function () {
  'use strict';
  var el = GFX.el, txt = GFX.text;

  var schema = [
    { title: 'Message', fields: [
      { key: 'style', type: 'select', label: 'Forme', default: 'bulle',
        options: [['bulle', 'Bulle : le pseudo au-dessus du message'], ['bande', 'Bande : le pseudo sur l\'accent, le message dessous']] },
      { key: 'kicker', type: 'text', label: 'Au-dessus du pseudo', default: 'Dans le chat', vars: true, help: 'vide : rien' },
      { key: 'userColor', type: 'toggle', label: 'Pseudo à sa couleur Twitch', default: true },
      { key: 'badge', type: 'toggle', label: 'Statut (modo, abonné…)', default: true },
      { key: 'maxWidth', type: 'number', label: 'Largeur maximale', default: 900, min: 300, max: 1800, unit: 'px' },
      { key: 'lines', type: 'number', label: 'Lignes au plus', default: 3, min: 1, max: 8 }
    ] },
    { title: 'Position', fields: GFX.fields.anchor('bl').map(function (fd) {
      if (fd.key === 'pos.x') fd.default = 96;
      if (fd.key === 'pos.y') fd.default = 150;
      return fd;
    }).concat([
      { key: 'size', type: 'range', label: 'Taille', default: 1, min: 0.5, max: 2, step: 0.02, unit: '×' },
      GFX.fields.colorOverride('colors.box', 'Fond du message', 'surface'),
      GFX.fields.colorOverride('colors.text', 'Texte du message', 'onSurface')
    ]) },
    GFX.fields.motion()
  ];

  GFX.type('chat', {
    label: 'Message du chat', icon: '✉',
    desc: 'Le message du chat Twitch choisi dans la régie (module Chat Twitch)',
    schema: schema,
    create: function (ctx, f) {
      var root = ctx.root;
      var pos = el('div', 'ch-pos', root);
      var head = el('div', 'ch-head', pos);
      var kick = el('span', 'ch-kicker', head), user = el('span', 'ch-user head', head), badge = el('span', 'ch-badge', head);
      var box = el('div', 'ch-box', pos), text = el('div', 'ch-text', box);
      var shownId = null;
      function get(k) { var v = ctx.get('twitch.' + k); return v == null ? '' : String(v); }
      function fill() {
        txt(user, get('vedette_pseudo'));
        user.style.color = f.userColor && get('vedette_couleur') && f.style !== 'bande' ? get('vedette_couleur') : '';
        txt(badge, f.badge ? get('vedette_badge') : ''); badge.hidden = !badge.__t;
        txt(text, get('vedette_texte'));
      }
      function update(nf) {
        f = nf || f;
        root.dataset.style = f.style === 'bande' ? 'bande' : 'bulle';
        root.style.setProperty('--gs', String(+f.size || 1));
        root.style.setProperty('--ch-max', (+f.maxWidth || 900) + 'px');
        root.style.setProperty('--ch-lines', String(+f.lines || 3));
        root.style.setProperty('--ch-box', GFX.color((f.colors || {}).box, 'surface'));
        root.style.setProperty('--ch-text', GFX.color((f.colors || {}).text, 'onSurface'));
        GFX.place(pos, f.pos);
        txt(kick, ctx.render(f.kicker || '')); kick.hidden = !kick.__t;
        shownId = get('_vedette_id');
        fill();
      }
      function tick() {
        txt(kick, ctx.render(f.kicker || '')); kick.hidden = !kick.__t;
        /* another message: swap once (taken now, so the next ticks don't restart it) */
        var id = get('_vedette_id');
        if (id !== shownId) { shownId = id; ctx.swap(fill); }
      }
      update(f);
      return {
        update: update, tick: tick,
        /* coming on air: in with the message just chosen, not the last one */
        setLive: function (L, prev) { if (L.air && !(prev && prev.air)) { shownId = get('_vedette_id'); fill(); } },
        parts: function () {
          return [{ el: head, role: 'bandA' }, { el: user, role: 'title' }, { el: box, role: 'surface' }, { el: text, role: 'text' }];
        }
      };
    }
  });
})();
