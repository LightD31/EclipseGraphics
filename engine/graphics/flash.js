/* Flash — short messages that queue up and show one after the other, a few
   seconds each: the A350F's milestone banners, or the operator's own
   (banner.<text>, a ready message with preset.3, the panel's field).

   Glued to a bandeau (the default when there is one), it rides above the
   strap in the lower third and under the caption in the fullscreen, and
   only shows while that bandeau is on air; free, it sits where it's put.
   The queue lives on the server, so every source shows the same banner. */
(function () {
  'use strict';
  var el = GFX.el, txt = GFX.text;

  var schema = [
    { title: 'Messages', fields: [
      { key: 'anchor', type: 'select', label: 'Position', default: 'free', options: 'flashAnchors',
        help: 'collé à un bandeau : au-dessus de sa bande d\'info, visible quand il est à l\'antenne' },
      { key: 'duration', type: 'number', label: 'Durée d\'un message', default: 8, min: 2, max: 60, unit: 's' },
      { key: 'defaultTag', type: 'text', label: 'Étiquette par défaut', default: 'Info' },
      { key: 'presets', type: 'list', label: 'Messages prêts', add: 'Ajouter un message', itemLabel: '{{title}}', send: true,
        default: [{ tag: 'Info', title: 'Message prêt à envoyer', sub: '', dur: '' }],
        item: [
          { key: 'tag', type: 'text', label: 'Étiquette', default: 'Info' },
          { key: 'title', type: 'text', label: 'Message', default: '' },
          { key: 'sub', type: 'text', label: 'Précision', default: '' },
          { key: 'dur', type: 'number', label: 'Durée (s)', default: '', min: 2, max: 60, placeholder: 'par défaut' }
        ] }
    ] },
    { title: 'Style', fields: [
      { key: 'body', type: 'select', label: 'Corps du message', default: 'auto',
        options: [['auto', 'sombre, clair sur un plein écran'], ['dark', 'sombre'], ['light', 'clair']] },
      { key: 'size', type: 'range', label: 'Taille', default: 1, min: 0.6, max: 1.8, step: 0.02, unit: '×' }
    ].concat(GFX.fields.anchor('tl').map(function (fd) {
      fd.showIf = function (f) { return f.anchor === 'free'; };
      if (fd.key === 'pos.x') fd.default = 90;
      if (fd.key === 'pos.y') fd.default = 90;
      return fd;
    })).concat([GFX.fields.colorOverride('colors.tag', 'Fond de l\'étiquette', 'accent')]) },
    GFX.fields.motion()
  ];

  GFX.type('flash', {
    label: 'Flash', icon: '⚡',
    desc: 'Messages courts en file d\'attente (événements, annonces), quelques secondes chacun',
    schema: schema,
    commands: [['banner.next', 'Passer'], ['banner.clear', 'Vider']],
    create: function (ctx, f) {
      var root = ctx.root;
      var pos = el('div', 'fl-pos', root);
      var box = el('div', 'fl-box', pos);
      var tag = el('span', 'fl-tag head', box);
      var body = el('span', 'fl-body', box);
      var title = el('span', 'fl-title head', body), sub = el('span', 'fl-sub', body);
      function update(nf) {
        f = nf || f;
        root.style.setProperty('--gs', String(+f.size || 1));
        root.dataset.body = f.body || 'auto';
        GFX.place(pos, f.pos);
        root.style.setProperty('--fl-tag', GFX.color((f.colors || {}).tag, 'accent'));
      }
      update(f);
      return {
        update: update,
        item: function (it) {
          it = it || {};
          txt(tag, it.tag || f.defaultTag || 'Info');
          txt(title, it.title || '');
          txt(sub, it.sub || '');
          tag.hidden = !tag.__t;
          sub.hidden = !sub.__t;
        },
        parts: function () {
          return [{ el: box, role: 'banner' }];
        }
      };
    }
  });
})();
