/* Synthé — the name strap: who is speaking, and as what.

   A list of names prepared ahead; the operator fires one (entry.3, or take.3
   to fire and bring on air in one go, entry.next to walk the list), and it
   leaves by itself after a few seconds if autoOut says so. A new name while
   on air swaps out and in. Four styles in the house identity:
     empile   name on the accent band, function on the light strap below
     barre    one dark block with an accent bar down its side
     carte    a light card, photo or logo on its left
     epure    text only, an accent underline */
(function () {
  'use strict';
  var U = window.GFXShared, el = GFX.el, txt = GFX.text;

  var schema = [
    { title: 'Noms', fields: [
      { key: 'entries', type: 'list', label: 'Noms', add: 'Ajouter un nom', itemLabel: '{{name}}', take: true,
        default: [{ name: 'Prénom Nom', role: 'Fonction', extra: '', image: '' }],
        item: [
          { key: 'name', type: 'text', label: 'Nom', default: 'Prénom Nom', vars: true },
          { key: 'role', type: 'text', label: 'Fonction', default: 'Fonction', vars: true },
          { key: 'extra', type: 'text', label: 'Étiquette', default: '', vars: true, placeholder: 'INVITÉ' },
          { key: 'image', type: 'media', label: 'Photo ou logo', accept: 'image', default: '' }
        ] },
      { key: 'autoOut', type: 'number', label: 'Sortie automatique après', default: 8, min: 0, max: 600, unit: 's',
        help: '0 : reste à l\'antenne jusqu\'à la commande de sortie' }
    ] },
    { title: 'Style', fields: [
      { key: 'style', type: 'select', label: 'Style', default: 'empile',
        options: [['empile', 'Empilé : nom sur l\'accent, fonction sur la bande claire'], ['barre', 'Barre : bloc sombre, filet d\'accent'],
                  ['carte', 'Carte : bloc clair, photo à gauche'], ['epure', 'Épuré : texte seul, soulignement']] },
      { key: 'tag', type: 'text', label: 'Étiquette commune', default: '', vars: true, placeholder: 'EN DIRECT',
        help: 'au-dessus du nom ; l\'étiquette d\'un nom passe avant' },
      { key: 'upper', type: 'toggle', label: 'Nom en capitales', default: true },
      { key: 'size', type: 'range', label: 'Taille', default: 1, min: 0.6, max: 1.8, step: 0.02, unit: '×' }
    ].concat(GFX.fields.anchor('bl').map(function (fd) {
      if (fd.key === 'pos.x') fd.default = 96;
      if (fd.key === 'pos.y') fd.default = 120;
      return fd;
    })).concat([
      GFX.fields.colorOverride('colors.name', 'Fond du nom', 'accent'),
      GFX.fields.colorOverride('colors.nameText', 'Texte du nom', 'onAccent'),
      GFX.fields.colorOverride('colors.role', 'Fond de la fonction', 'surface'),
      GFX.fields.colorOverride('colors.roleText', 'Texte de la fonction', 'onSurface')
    ]) },
    GFX.fields.motion()
  ];

  GFX.type('synthe', {
    label: 'Synthé', icon: '▤',
    move: { box: '.sy-pos' },
    desc: 'Nom et fonction d\'un intervenant, liste préparée, sortie automatique',
    schema: schema,
    commands: [['air.toggle', 'Antenne'], ['entry.prev', '◀ Précédent'], ['entry.next', 'Suivant ▶']],
    create: function (ctx, f) {
      var root = ctx.root;
      var pos = el('div', 'sy-pos', root);
      var box = el('div', 'sy-box', pos);
      var photo = el('div', 'sy-photo', box), img = el('img', '', photo);
      img.alt = '';
      var texts = el('div', 'sy-texts', box);
      var tag = el('div', 'sy-tag head', texts);
      var name = el('div', 'sy-name', texts), nameT = el('span', 'sy-nametext head', name);
      var role = el('div', 'sy-role', texts), roleT = el('span', 'sy-roletext', role);
      var line = el('i', 'sy-line', box);
      var shown = -1;

      function entry() {
        var list = f.entries || [];
        var i = Math.min(Math.max(0, ctx.live().entry || 0), Math.max(0, list.length - 1));
        return { i: i, e: list[i] || { name: '', role: '' } };
      }
      function fill() {
        var x = entry(), e = x.e;
        shown = x.i;
        txt(nameT, ctx.render(e.name));
        txt(roleT, ctx.render(e.role));
        txt(tag, ctx.render(e.extra) || ctx.render(f.tag));
        tag.hidden = !tag.__t;
        role.hidden = !roleT.__t;
        var src = GFX.media(e.image);
        photo.hidden = !src || f.style === 'epure';
        if (src && img.getAttribute('src') !== src) img.src = src;
      }
      function update(nf) {
        f = nf || f;
        root.dataset.style = f.style;
        root.dataset.upper = f.upper ? 'on' : 'off';
        /* épuré: the accent line underlines the name; elsewhere it trims the box */
        if (f.style === 'epure') texts.insertBefore(line, role); else box.appendChild(line);
        root.style.setProperty('--gs', String(+f.size || 1));
        GFX.place(pos, f.pos);
        var c = f.colors || {};
        [['--sy-name', c.name, 'accent'], ['--sy-name-fg', c.nameText, 'onAccent'], ['--sy-role', c.role, 'surface'],
         ['--sy-role-fg', c.roleText, 'onSurface']].forEach(function (v) { root.style.setProperty(v[0], GFX.color(v[1], v[2])); });
        fill();
      }
      update(f);
      return {
        update: update,
        setLive: function (L) {
          if (L.entry === shown) return;
          ctx.swap(fill);
        },
        tick: function () {
          var e = entry().e;
          if (entry().i !== shown) return;
          txt(nameT, ctx.render(e.name));
          txt(roleT, ctx.render(e.role));
        },
        onIn: fill,
        parts: function () {
          var p = [];
          var st = f.style;
          if (!photo.hidden) p.push({ el: photo, role: st === 'carte' ? 'panel' : 'visual' });
          if (!tag.hidden) p.push({ el: tag, role: 'tag' });
          if (st === 'empile') {
            p.push({ el: name, role: 'bandA' }, { el: nameT, role: 'title' });
            if (!role.hidden) p.push({ el: role, role: 'surface' }, { el: roleT, role: 'text' });
          } else if (st === 'barre' || st === 'carte') {
            p.push({ el: box, role: st === 'barre' ? 'bandB' : 'surface' }, { el: line, role: 'line' }, { el: nameT, role: 'title' });
            if (!role.hidden) p.push({ el: roleT, role: 'text' });
          } else {
            p.push({ el: nameT, role: 'title' }, { el: line, role: 'line' });
            if (!role.hidden) p.push({ el: roleT, role: 'text' });
          }
          return p;
        }
      };
    }
  });
})();
