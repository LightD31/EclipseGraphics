/* Forms drawn from a schema — the same field lists the graphic types and the
   modules declare (see engine/gfx.js). One renderer for every editor in the
   panel: a graphic's fields, a module's settings.

   Forms.render(container, schema, target, env)
     target: { get(path) → value, set(path, value) } over the object edited
             (a key starting with "@" addresses the graphic itself, e.g.
             "@motion.speed", the others its fields)
     env:    { options(source, field) → [[value, label]…], vars() → groups for
               the variable picker, media(accept) → [{name, url, kind}],
               upload(file) → Promise<name>, send(field, item, index) (list
               buttons such as "take" or "send"), changed() }

   Field types: text, textarea, number, range, toggle, select, color,
   datetime, media, list (item: a flat field list; nested lists allowed).
   showIf(values) hides a field; values are the object with its defaults. */
(function () {
  'use strict';
  var U = window.GFXShared;

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'style') e.setAttribute('style', v);
      else if (k in e && typeof v !== 'string') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  function render(container, schema, target, env) {
    container.innerHTML = '';
    var rows = [];
    schema.forEach(function (sec, si) {
      var body = h('div', { class: 'fm-sec-body' });
      var det = h('details', { class: 'fm-sec', open: si < 2 || sec.open }, [h('summary', { text: sec.title }), body]);
      container.appendChild(det);
      (sec.fields || []).forEach(function (f) { rows.push(field(body, f, target, env, refresh)); });
    });
    function refresh() {
      var vals = target.values();
      rows.forEach(function (r) { if (r && r.f.showIf) r.row.hidden = !safeIf(r.f.showIf, vals); });
    }
    refresh();
    return { refresh: refresh };
  }
  function safeIf(fn, vals) { try { return !!fn(vals); } catch (e) { return true; } }

  function field(parent, f, target, env, refresh) {
    var row = h('div', { class: 'fm-row fm-' + f.type, 'data-key': f.key });
    var label = h('label', { class: 'fm-label', text: f.label || f.key });
    var ctl = h('div', { class: 'fm-ctl' });
    row.appendChild(label); row.appendChild(ctl);
    if (f.help) row.appendChild(h('div', { class: 'fm-help', text: f.help }));
    parent.appendChild(row);
    var get = function () { var v = target.get(f.key); return v === undefined ? U.clone(f.default) : v; };
    var set = function (v) { target.set(f.key, v); refresh(); env.changed(); };
    var make = TYPES[f.type] || TYPES.text;
    make(ctl, f, get, set, env, target, refresh);
    return { f: f, row: row };
  }

  /* A text input with a {} button that inserts a variable at the caret */
  function varPicker(input, env, onPick) {
    var btn = h('button', { class: 'fm-varbtn', type: 'button', title: 'Insérer une variable', text: '{ }' });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      Forms.menu(btn, env.vars(), function (name) {
        var s = input.selectionStart == null ? input.value.length : input.selectionStart;
        var t = input.selectionEnd == null ? s : input.selectionEnd;
        input.value = input.value.slice(0, s) + '{{' + name + '}}' + input.value.slice(t);
        onPick(input.value);
        input.focus();
      });
    });
    return btn;
  }

  var TYPES = {
    text: function (ctl, f, get, set, env) {
      var inp = h('input', { type: 'text', value: get() == null ? '' : String(get()), placeholder: f.placeholder || '' });
      inp.addEventListener('input', function () { set(inp.value); });
      ctl.appendChild(inp);
      if (f.vars) ctl.appendChild(varPicker(inp, env, set));
    },
    textarea: function (ctl, f, get, set, env) {
      var ta = h('textarea', { rows: f.rows || 3, placeholder: f.placeholder || '' });
      ta.value = get() || '';
      ta.addEventListener('input', function () { set(ta.value); });
      ctl.appendChild(ta);
      if (f.vars) ctl.appendChild(varPicker(ta, env, set));
    },
    number: function (ctl, f, get, set) {
      var v = get();
      var inp = h('input', { type: 'number', value: v == null ? '' : v, min: f.min, max: f.max, step: f.step || 1, placeholder: f.placeholder || '' });
      inp.addEventListener('input', function () {
        if (inp.value === '') { set(f.default === '' ? '' : f.default); return; }
        var n = parseFloat(inp.value);
        if (!isNaN(n)) set(n);
      });
      ctl.appendChild(inp);
      if (f.unit) ctl.appendChild(h('span', { class: 'fm-unit', text: f.unit }));
    },
    range: function (ctl, f, get, set) {
      var v = get(), empty = v === '' || v == null;
      var inp = h('input', { type: 'range', min: f.min, max: f.max, step: f.step || 0.01, value: empty ? (f.min + f.max) / 2 : v });
      var out = h('span', { class: 'fm-out' });
      function show() {
        var cur = get();
        out.textContent = cur === '' || cur == null ? (f.empty || 'auto') : (+cur).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + (f.unit ? ' ' + f.unit : '');
        inp.classList.toggle('empty', cur === '' || cur == null);
      }
      inp.addEventListener('input', function () { set(parseFloat(inp.value)); show(); });
      ctl.appendChild(inp); ctl.appendChild(out);
      if (f.empty || f.default === '') {
        ctl.appendChild(h('button', { type: 'button', class: 'fm-mini', text: '×', title: 'Revenir à : ' + (f.empty || 'auto'),
          onclick: function () { set(''); show(); } }));
      }
      show();
    },
    toggle: function (ctl, f, get, set) {
      var inp = h('input', { type: 'checkbox', checked: !!get() });
      inp.addEventListener('change', function () { set(inp.checked); });
      ctl.appendChild(h('label', { class: 'fm-switch' }, [inp, h('span')]));
    },
    select: function (ctl, f, get, set, env) {
      var sel = h('select');
      var opts = typeof f.options === 'string' ? env.options(f.options, f) : f.options || [];
      var v = get(), found = false;
      opts.forEach(function (o) {
        var val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o;
        if (val === v) found = true;
        sel.appendChild(h('option', { value: val, text: lab }));
      });
      if (!found && v != null && v !== '') sel.appendChild(h('option', { value: v, text: v + ' (introuvable)' }));
      sel.value = v == null ? '' : v;
      sel.addEventListener('change', function () { set(sel.value); });
      ctl.appendChild(sel);
    },
    color: function (ctl, f, get, set, env) {
      var v = get() || '';
      var col = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v) ? v : env.themeColor(f.theme) || '#000000' });
      var txt = h('input', { type: 'text', class: 'fm-hex', value: v, placeholder: f.theme ? 'thème : ' + f.theme : '#rrggbb' });
      col.addEventListener('input', function () { txt.value = col.value; set(col.value); });
      txt.addEventListener('change', function () {
        var s = txt.value.trim();
        if (/^#?[0-9a-f]{6}$/i.test(s)) { s = s.charAt(0) === '#' ? s : '#' + s; col.value = s; }
        set(s);
      });
      ctl.appendChild(col); ctl.appendChild(txt);
      if (f.theme) {
        ctl.appendChild(h('button', { type: 'button', class: 'fm-mini', text: 'thème', title: 'Couleur du thème',
          onclick: function () { txt.value = ''; col.value = env.themeColor(f.theme) || '#000000'; set(''); } }));
      }
    },
    datetime: function (ctl, f, get, set, env) {
      var inp = h('input', { type: 'text', value: get() || '', placeholder: f.placeholder || 'AAAA-MM-JJ HH:MM, ou HH:MM' });
      var out = h('span', { class: 'fm-out' });
      function show() {
        var s = inp.value.trim();
        if (!s) { out.textContent = ''; return; }
        if (s.indexOf('{{') >= 0) { out.textContent = 'variable'; return; }
        var t = U.parseWhen(s, env.tz());
        out.textContent = t == null ? 'format non reconnu' : '→ ' + U.weekday(t, env.tz()) + ' ' + U.dayMonth(t, env.tz()) + ', ' + U.hm(t, env.tz());
        out.classList.toggle('bad', t == null);
      }
      inp.addEventListener('input', function () { set(inp.value.trim().replace(' ', 'T')); show(); });
      var pick = h('input', { type: 'datetime-local', class: 'fm-pick', tabindex: -1 });
      pick.addEventListener('change', function () { if (pick.value) { inp.value = pick.value; set(pick.value); show(); } });
      var btn = h('button', { type: 'button', class: 'fm-mini', text: '📅', title: 'Choisir une date',
        onclick: function () { try { pick.showPicker(); } catch (e) { pick.focus(); } } });
      ctl.appendChild(inp); ctl.appendChild(btn); ctl.appendChild(pick); ctl.appendChild(out);
      if (f.vars !== false) ctl.appendChild(varPicker(inp, env, function (v) { set(v); show(); }));
      show();
    },
    media: function (ctl, f, get, set, env) {
      var sel = h('select');
      var thumb = h('span', { class: 'fm-thumb' });
      function fill() {
        var v = get() || '';
        sel.innerHTML = '';
        sel.appendChild(h('option', { value: '', text: '— aucun —' }));
        var found = !v;
        env.media(f.accept).forEach(function (m) {
          if (m.name === v) found = true;
          sel.appendChild(h('option', { value: m.name, text: m.name }));
        });
        if (!found) sel.appendChild(h('option', { value: v, text: v + ' (introuvable)' }));
        sel.value = v;
        thumb.innerHTML = '';
        if (v && f.accept !== 'video' && f.accept !== 'font') thumb.appendChild(h('img', { src: 'media/' + encodeURIComponent(v), alt: '' }));
      }
      sel.addEventListener('change', function () { set(sel.value); fill(); });
      var file = h('input', { type: 'file', accept: f.accept === 'image' ? 'image/*' : f.accept === 'video' ? 'video/webm,video/mp4' : '', hidden: true });
      file.addEventListener('change', function () {
        if (!file.files[0]) return;
        env.upload(file.files[0]).then(function (name) { if (name) { set(name); fill(); } });
      });
      ctl.appendChild(thumb); ctl.appendChild(sel);
      ctl.appendChild(h('button', { type: 'button', class: 'fm-mini', text: 'Importer…', onclick: function () { file.click(); } }));
      ctl.appendChild(file);
      fill();
    },
    list: function (ctl, f, get, set, env, target, refresh) {
      var wrap = h('div', { class: 'fm-list' });
      ctl.appendChild(wrap);
      var open = {};
      function items() { var v = get(); return Array.isArray(v) ? v : []; }
      function save(list) { set(list); draw(); }
      function label(it, i) {
        var s = f.itemLabel ? U.render(f.itemLabel.replace('{{n}}', String(i + 1)), function (k) { return it[k]; }) : '';
        s = s.replace(/\{\{[^}]*\}\}/g, '…').trim();
        return s || ((f.label || 'Élément') + ' ' + (i + 1));
      }
      function draw() {
        wrap.innerHTML = '';
        var list = items();
        list.forEach(function (it, i) {
          var body = h('div', { class: 'fm-item-body', hidden: !open[i] });
          var head = h('div', { class: 'fm-item-head' }, [
            h('button', { type: 'button', class: 'fm-item-toggle', text: (open[i] ? '▾ ' : '▸ ') + label(it, i),
              onclick: function () { open[i] = !open[i]; draw(); } }),
            f.take ? h('button', { type: 'button', class: 'fm-mini red', text: 'À l\'antenne', title: 'Afficher ce nom',
              onclick: function () { env.send(f, 'take', i); } }) : null,
            f.send ? h('button', { type: 'button', class: 'fm-mini red', text: 'Envoyer', onclick: function () { env.send(f, 'send', i); } }) : null,
            h('button', { type: 'button', class: 'fm-mini', text: '↑', title: 'Monter', disabled: i === 0,
              onclick: function () { var l = items().slice(); l.splice(i - 1, 0, l.splice(i, 1)[0]); swapOpen(i, i - 1); save(l); } }),
            h('button', { type: 'button', class: 'fm-mini', text: '↓', title: 'Descendre', disabled: i === list.length - 1,
              onclick: function () { var l = items().slice(); l.splice(i + 1, 0, l.splice(i, 1)[0]); swapOpen(i, i + 1); save(l); } }),
            h('button', { type: 'button', class: 'fm-mini', text: '⧉', title: 'Dupliquer',
              disabled: f.max && list.length >= f.max,
              onclick: function () { var l = items().slice(); l.splice(i + 1, 0, U.clone(it)); save(l); } }),
            h('button', { type: 'button', class: 'fm-mini', text: '✕', title: 'Supprimer', disabled: f.min && list.length <= f.min,
              onclick: function () { var l = items().slice(); l.splice(i, 1); delete open[i]; save(l); } })
          ]);
          wrap.appendChild(h('div', { class: 'fm-item' }, [head, body]));
          if (open[i]) {
            var sub = {
              get: function (k) { return U.getPath(items()[i] || {}, k); },
              set: function (k, v) { var l = items().slice(); l[i] = Object.assign({}, l[i]); U.setPath(l[i], k, v); set(l);
                                     var t = head.querySelector('.fm-item-toggle'); if (t) t.textContent = '▾ ' + label(l[i], i); },
              values: function () { return U.withDefaults(U.clone(items()[i] || {}), U.itemDefaults(f.item)); }
            };
            var rows = [];
            var subRefresh = function () {
              var vals = sub.values();
              rows.forEach(function (r) { if (r.f.showIf) r.row.hidden = !safeIf(r.f.showIf, vals); });
            };
            (f.item || []).forEach(function (fd) { rows.push(field(body, fd, sub, env, subRefresh)); });
            subRefresh();
          }
        });
        if (!list.length) wrap.appendChild(h('div', { class: 'fm-empty', text: 'Aucun élément.' }));
        wrap.appendChild(h('button', { type: 'button', class: 'fm-add', text: '+ ' + (f.add || 'Ajouter'), disabled: f.max && list.length >= f.max,
          onclick: function () { var l = items().slice(); open[l.length] = true; l.push(U.itemDefaults(f.item)); save(l); } }));
      }
      function swapOpen(a, b) { var t = open[a]; open[a] = open[b]; open[b] = t; }
      draw();
    }
  };

  /* A small menu under a button: groups of [value, label, detail] */
  var openMenu = null;
  function menu(anchor, groups, pick) {
    if (openMenu) { openMenu.remove(); openMenu = null; }
    var m = h('div', { class: 'fm-menu' });
    groups.forEach(function (g) {
      if (!g.items.length) return;
      m.appendChild(h('div', { class: 'fm-menu-group', text: g.title }));
      g.items.forEach(function (it) {
        m.appendChild(h('button', { type: 'button', class: 'fm-menu-item', onclick: function () { close(); pick(it[0]); } },
          [h('code', { text: '{{' + it[0] + '}}' }), h('span', { text: it[1] || '' }), it[2] != null && it[2] !== '' ? h('em', { text: String(it[2]).slice(0, 40) }) : null]));
      });
    });
    if (!m.children.length) m.appendChild(h('div', { class: 'fm-menu-group', text: 'Aucune variable.' }));
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    m.style.top = Math.min(window.innerHeight - m.offsetHeight - 8, r.bottom + 4) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
    openMenu = m;
    function close() { if (openMenu === m) { m.remove(); openMenu = null; } document.removeEventListener('mousedown', outside, true); }
    function outside(e) { if (!m.contains(e.target) && e.target !== anchor) close(); }
    setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
  }

  /* A value changed from outside the form (a drag in the preview): shown in
     its field without redrawing the form (its open sections stay open) */
  function show(container, key, value) {
    var row = container && container.querySelector('.fm-row[data-key="' + key + '"]');
    var ctl = row && row.querySelector('select, input:not([type=range]):not([type=checkbox])');
    if (ctl) ctl.value = value == null ? '' : String(value);
  }

  window.Forms = { render: render, show: show, h: h, menu: menu, TYPES: TYPES };
})();
