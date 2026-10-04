/* The registry graphic types and modules plug into, and the helpers they
   share. Loaded by the output page and by the panel (which only reads the
   schemas, to draw its forms).

     GFX.type(name, { label, icon, desc, schema, move, create(ctx) → instance })
       schema: [{ title, fields: [{ key, type, label, default, … }] }] — the
       panel's form and the defaults both come from it (see panel/forms.js for
       the field types). An instance: { parts(), update(fields), setLive(live,
       prev), tick(now), onIn(), onOut(), slot(name), destroy() }.
       move: what the panel's preview lets the operator drag — { box: the
       selector of the element that moves, kind: 'pos' (default: the fields
       pos.anchor, pos.x, pos.y, as GFX.place reads them) | 'edge' (a band:
       edge top/bottom and my) | 'dock' (the bandeau: layout.my, and
       layout.mx when it fits its content), when(fields, live) → movable now?,
       why: the reason when it isn't }
     GFX.client(moduleId, factory(api) → module instance)  (modules/<id>/client.js)
     GFX.panel(moduleId, { render(el, api) })                (modules/<id>/panel.js) */
(function () {
  'use strict';
  var U = window.GFXShared;
  var GFX = window.GFX = window.GFX || {};
  GFX.types = GFX.types || {};
  GFX.clients = GFX.clients || {};
  GFX.panels = GFX.panels || {};

  GFX.type = function (name, def) {
    def.name = name;
    def.defaults = U.schemaDefaults(def.schema);
    GFX.types[name] = def;
  };
  GFX.client = function (id, factory) { GFX.clients[id] = factory; };
  GFX.panel = function (id, ext) { GFX.panels[id] = ext; };

  // ===== DOM =====
  GFX.el = function (tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  /* Set text only when it changed (no relayout, no restarted CSS animation) */
  GFX.text = function (el, s) {
    s = s == null ? '' : String(s);
    if (el && el.__t !== s) { el.__t = s; el.textContent = s; }
    return el;
  };
  GFX.media = function (name) {
    if (!name) return '';
    return /^(https?:|data:|\/|media\/)/.test(name) ? name : 'media/' + encodeURIComponent(name);
  };
  /* A colour field: '' → the theme's token, '#rrggbb' as is, 'token:x' → var(--c-x) */
  GFX.color = function (v, token) {
    v = String(v || '').trim();
    if (!v) return token ? 'var(--c-' + token + ')' : '';
    if (v.indexOf('token:') === 0) return 'var(--c-' + v.slice(6) + ')';
    return v;
  };

  // ===== Timers (bandeau, bug, card) =====
  /* t = { mode, label, value, target, since, after, afterLabel, style };
     → { label, value } already rendered, the modes:
       text       label and value as typed (variables allowed: a module's
                  countdown, for instance)
       countdown  to target; past it, after / afterLabel
       countup    since since
       clock      the time of day (style hm: without seconds) */
  GFX.timer = function (t, ctx, now) {
    t = t || {};
    var tz = ctx.tz(), label = ctx.render(t.label || ''), value = '';
    switch (t.mode) {
      case 'countdown': {
        var at = U.parseWhen(ctx.render(t.target || ''), tz);
        if (at == null) value = '--:--:--';
        else if (now < at) value = U.clock(at - now, t.style);
        else { value = ctx.render(t.after || '') || U.clock(0, t.style); if (t.afterLabel) label = ctx.render(t.afterLabel); }
        break;
      }
      case 'countup': {
        var since = U.parseWhen(ctx.render(t.since || ''), tz);
        value = since == null || now < since ? '--:--:--' : U.clock(now - since, t.style);
        break;
      }
      case 'clock': value = t.style === 'hm' ? U.hm(now, tz) : U.hms(now, tz); break;
      case 'text': value = ctx.render(t.value || ''); break;
      default: value = '';
    }
    return { label: label, value: value };
  };

  // ===== One-line text fitted to its box =====
  /* The headline stays on one line in every state and every frame of a
     morph: its size is computed from a hidden probe (the width at 100 px),
     capped by the box's height, which animates — no sudden jump. */
  var probe = null;
  GFX.fitter = function (textEl, boxEl, opts) {
    opts = opts || {};
    var min = opts.min || 18, max = opts.max || 76, ratio = opts.ratio || 0.5, heightEl = opts.heightEl || boxEl;
    function fit() {
      var avail = boxEl.clientWidth - 4;
      if (opts.padEl) {
        var ps = getComputedStyle(opts.padEl);
        avail -= (parseFloat(ps.paddingLeft) || 0) + (parseFloat(ps.paddingRight) || 0);
      }
      if (avail <= 0) return;
      if (!probe) {
        probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:nowrap;visibility:hidden;pointer-events:none;';
        document.body.appendChild(probe);
      }
      var cs = getComputedStyle(textEl);
      probe.style.fontFamily = cs.fontFamily;
      probe.style.fontWeight = cs.fontWeight;
      probe.style.fontStretch = cs.fontStretch;
      probe.style.letterSpacing = cs.letterSpacing;
      probe.style.textTransform = cs.textTransform;
      probe.style.fontSize = '100px';
      probe.textContent = textEl.textContent;
      var w100 = probe.offsetWidth || 1;
      var cap = Math.min(typeof max === 'function' ? max() : max, heightEl.clientHeight * ratio || 999);
      var size = Math.min(cap, (avail / w100) * 100);
      textEl.style.fontSize = Math.max(min, size).toFixed(1) + 'px';
    }
    var until = 0, ticking = false;
    function pump() {
      fit();
      if (performance.now() < until) requestAnimationFrame(pump); else ticking = false;
    }
    var ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(boxEl);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    return {
      fit: fit,
      /* every frame for a while: during a morph the box changes size */
      refitFor: function (ms) {
        until = performance.now() + (ms || 1000);
        if (!ticking) { ticking = true; requestAnimationFrame(pump); }
      },
      destroy: function () { if (ro) ro.disconnect(); }
    };
  };

  // ===== Schema fragments shared by several types =====
  GFX.fields = {
    colorOverride: function (key, label, token) {
      return { key: key, type: 'color', label: label, default: '', theme: token, help: 'vide : couleur du thème' };
    },
    timer: function (prefix, def) {
      def = def || {};
      var show = function (modes) { return function (f) { return modes.indexOf(U.getPath(f, prefix + '.mode')) >= 0; }; };
      return [
        { key: prefix + '.mode', type: 'select', label: 'Minuteur', default: def.mode || 'none',
          options: [['none', 'Aucun'], ['countdown', 'Compte à rebours'], ['countup', 'Chronomètre (depuis)'], ['clock', 'Heure'], ['text', 'Texte / variable']] },
        { key: prefix + '.label', type: 'text', label: 'Libellé', default: def.label || '', vars: true, showIf: show(['countdown', 'countup', 'clock', 'text']) },
        { key: prefix + '.target', type: 'datetime', label: 'Jusqu\'à', default: def.target || '', showIf: show(['countdown']),
          help: 'date et heure locales du projet, ou HH:MM (aujourd\'hui)' },
        { key: prefix + '.after', type: 'text', label: 'Une fois atteint', default: def.after || '', vars: true, showIf: show(['countdown']),
          placeholder: '00:00:00' },
        { key: prefix + '.afterLabel', type: 'text', label: 'Libellé une fois atteint', default: '', vars: true, showIf: show(['countdown']) },
        { key: prefix + '.since', type: 'datetime', label: 'Depuis', default: def.since || '', showIf: show(['countup']) },
        { key: prefix + '.value', type: 'text', label: 'Valeur', default: def.value || '', vars: true, showIf: show(['text']) },
        { key: prefix + '.style', type: 'select', label: 'Format', default: def.style || 'auto', showIf: show(['countdown', 'countup', 'clock']),
          options: [['auto', '01:23:45 (jours au-delà de 24 h)'], ['hms', '01:23:45 (heures au-delà de 24)'], ['ms', '23:45 (minutes)'],
                    ['coarse', '1 h 23 (arrondi)'], ['hm', '10:30 (heure sans secondes)']] }
      ];
    },
    motion: function () {
      return {
        title: 'Animation', fields: [
          { key: '@motion.preset', type: 'select', label: 'Style d\'animation', default: '', options: 'motionPresets',
            help: 'vide : celui du projet (onglet Animations)' },
          { key: '@motion.speed', type: 'range', label: 'Vitesse', default: '', min: 0.5, max: 2, step: 0.05, unit: '×', empty: 'projet' },
          { key: '@motion.change', type: 'select', label: 'Changement de texte à l\'antenne', default: '',
            options: [['', 'comme le projet'], ['fade', 'fondu'], ['slide', 'glisse'], ['none', 'aucun']] },
          { key: '@motion.sound', type: 'select', label: 'Son à l\'entrée', default: '', options: 'soundCues',
            help: 'un son du bundle, joué par les sorties qui montrent ce graphique (volume et fichier : onglet Mixer de NodeCG)' }
        ]
      };
    },
    anchor: function (def) {
      return [
        { key: 'pos.anchor', type: 'select', label: 'Ancrage', default: def || 'bl',
          options: [['tl', 'en haut à gauche'], ['tc', 'en haut au centre'], ['tr', 'en haut à droite'],
                    ['ml', 'au milieu à gauche'], ['mr', 'au milieu à droite'],
                    ['bl', 'en bas à gauche'], ['bc', 'en bas au centre'], ['br', 'en bas à droite']] },
        { key: 'pos.x', type: 'number', label: 'Marge horizontale', default: 96, min: 0, max: 960, unit: 'px' },
        { key: 'pos.y', type: 'number', label: 'Marge verticale', default: 96, min: 0, max: 540, unit: 'px' }
      ];
    }
  };
  /* Place a box on the 1920×1080 stage by an anchor and margins */
  GFX.place = function (el, pos) {
    pos = pos || {};
    var a = pos.anchor || 'bl', x = (+pos.x || 0) + 'px', y = (+pos.y || 0) + 'px';
    var s = el.style;
    s.left = s.right = s.top = s.bottom = 'auto';
    s.transform = '';
    if (a.charAt(0) === 't') s.top = y; else if (a.charAt(0) === 'b') s.bottom = y; else { s.top = '50%'; s.transform = 'translateY(-50%)'; }
    if (a.charAt(1) === 'l') s.left = x; else if (a.charAt(1) === 'r') s.right = x;
    else { s.left = '50%'; s.transform = (s.transform ? s.transform + ' ' : '') + 'translateX(-50%)'; }
    el.dataset.anchor = a;
  };
})();
