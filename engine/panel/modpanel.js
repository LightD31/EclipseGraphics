/* A module's panel in NodeCG's dashboard (dashboard/module-<id>.html, made
   by scripts/panels.js): whether the module runs in the active show (a
   switch that saves it in the show), its live controls and state (its
   panel.js: rundown() and render()), its variables with their values. Its
   settings open in NodeCG's « Réglages du module » dialog — or here, under
   the rest, when the panel is on its own (?standalone). */
(function () {
  'use strict';
  var U = window.GFXShared, GFX = window.GFX, h = Forms.h, L = window.GFXLink;
  var ID = document.body.dataset.module;
  var PID = 'mod-' + ID + '-' + Math.random().toString(36).slice(2, 8);
  var S = { live: null, vars: {}, media: [], status: null };
  var E = L.Editor({ by: PID, toast: L.toast, onRemote: fromElsewhere });
  var root = document.getElementById('mp');
  var views = [], varCells = [], inline = false, pending = false, drawn = false;

  function tz() { return (E.show && E.show.timezone) || 'Europe/Paris'; }
  var ctx = {
    show: function () { return E.show; }, live: function () { return S.live; }, vars: function () { return S.vars; },
    media: function () { return S.media; }, status: function () { return S.status; },
    now: function () { return Date.now(); }, tz: tz,
    changed: function () { E.changed(); },
    cmd: function (t, c, text) { return L.msg('cmd', { target: t, cmd: c, text: text, from: 'panel' }).catch(function (e) { L.toast(e.message, true); }); },
    upload: function (f) { return L.upload(f, S.media); },
    onSetting: function () { render(); }
  };
  /* the module's entry in the show (made when needed) */
  function entry() {
    var ms = E.show.modules = E.show.modules || {};
    var e = ms[ID] = ms[ID] || { enabled: false, settings: {} };
    if (!U.isObj(e.settings)) e.settings = {};
    return e;
  }
  function on() { var e = (E.show.modules || {})[ID]; return !!(e && e.enabled); }
  function show(v) { return v == null ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v); }

  function render() {
    L.dropViews(views); views = []; varCells = [];
    root.innerHTML = '';
    var D = L.mod(ID);
    if (!D) { root.appendChild(h('p', { class: 'note', text: 'Module introuvable : ' + ID })); return; }
    var sw = h('input', { type: 'checkbox', checked: on() });
    sw.addEventListener('change', function () {
      entry().enabled = sw.checked;
      E.changed(); E.save();
      L.toast(D.label + (sw.checked ? ' activé' : ' désactivé') + ' dans « ' + E.show.title + ' »');
      render();
    });
    root.appendChild(h('div', { class: 'mp-head' }, [
      h('label', { class: 'fm-switch', title: 'Activer le module dans le projet actif' }, [sw, h('span')]),
      h('span', { class: 'mp-state' + (on() ? ' on' : ''), text: (on() ? 'actif' : 'inactif') + ' · ' + E.show.title }),
      h('span', { class: 'sp' }),
      h('button', { class: 'small', text: '⚙ Réglages', title: 'Les réglages du module dans ce projet', onclick: settings })
    ]));
    if (on()) {
      var ext = GFX.panels[ID], api = L.moduleApi(ID, ctx);
      var parts = !ext ? [] : ext.rundown && ext.render && ext.rundown !== ext.render ? [ext.rundown, ext.render] : [ext.rundown || ext.render];
      parts.forEach(function (fn) {
        if (!fn) return;
        var box = h('div', { class: 'mp-part' });
        root.appendChild(box);
        try { views.push({ ctl: fn(box, api) || {} }); } catch (e) { console.error(ID, e); }
      });
      root.appendChild(varsSection());
    } else root.appendChild(h('p', { class: 'note', text: D.desc || '' }));
    if (inline) root.appendChild(inlineSettings(D));
  }
  /* its variables, the tag to use in a text, their values */
  function varsSection() {
    var list = L.modVars(E.show, ID), rows = h('table', { class: 't' });
    list.forEach(function (v) {
      var td = h('td', { class: 'val' }), tag = '{{' + ID + '.' + v.name + '}}';
      varCells.push({ name: v.name, td: td });
      rows.appendChild(h('tr', {}, [h('td', {}, [h('code', { text: tag, title: 'copier', style: 'cursor:pointer', onclick: function () { L.copy(tag); } })]),
        h('td', { text: v.label || '' }), td]));
    });
    refreshVars();
    return h('details', { class: 'fm-sec mp-vars' }, [h('summary', { text: 'Variables (' + list.length + ')' }), h('div', { class: 'fm-sec-body' }, [rows])]);
  }
  function refreshVars() {
    var v = S.vars[ID] || {};
    varCells.forEach(function (c) { c.td.textContent = show(v[c.name]); });
  }
  function refresh() {
    views.forEach(function (v) { if (v.ctl.refresh) try { v.ctl.refresh(); } catch (e) { console.error(ID, e); } });
    refreshVars();
  }
  /* its settings: NodeCG's dialog, or here outside the dashboard */
  function settings() {
    L.settingsDialog(ID).then(function (shown) {
      if (shown) return;
      inline = !inline;
      render();
    });
  }
  function inlineSettings(D) {
    var box = h('div', { class: 'mp-settings' });
    Forms.render(box, D.settings || [], {
      get: function (k) { return U.getPath(entry().settings, k); },
      set: function (k, v) { U.setPath(entry().settings, k, v); },
      values: function () { return L.modSettings(E.show, ID); }
    }, L.formEnv(ctx));
    var help = typeof D.cmdHelp === 'function' ? D.cmdHelp(L.modSettings(E.show, ID)) : D.cmdHelp;
    if (help && help.length) box.appendChild(L.moduleCommandsHelp(ID, help));
    return box;
  }
  /* typing here: another page's change waits for the field to be left */
  function editing() {
    var a = document.activeElement;
    return a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }
  document.addEventListener('focusout', function () {
    setTimeout(function () { if (pending && !editing()) { pending = false; render(); } }, 50);
  });
  /* another page's edit: redrawn for this module's entry, the show's title,
     another show */
  function fromElsewhere(r) {
    if (!drawn) return;
    var mine = r === 'load' || r.some(function (op) {
      return op.path === 'modules' || op.path === 'title' || op.path === 'modules.' + ID || op.path.indexOf('modules.' + ID + '.') === 0;
    });
    if (!mine) return;
    if (editing() && r !== 'load') { pending = true; return; }
    render();
  }

  var c = L.connect(['catalog', 'show', 'live', 'vars', 'media', 'status', 'soundCues']), R = c.R;
  c.ready.then(function () {
    E.load(R.show.value);
    S.live = U.clone(R.live.value); S.vars = U.clone(R.vars.value) || {};
    S.media = U.clone(R.media.value) || []; S.status = U.clone(R.status.value);
    /* every module's descriptor (the forms list their visuals), this one's panel part */
    return L.loadModules((R.catalog.value || {}).modules || [ID], { panels: [ID] });
  }).then(function () {
    render();
    drawn = true;
    R.show.on('change', E.remote);
    R.live.on('change', function (v) { if (v) { S.live = U.clone(v); refresh(); } });
    R.vars.on('change', function (v) { S.vars = U.clone(v) || {}; refresh(); });
    R.media.on('change', function (v) { S.media = U.clone(v) || []; });
    R.status.on('change', function (v) { S.status = U.clone(v); });
  });
  window.nodecg.listenFor('mod', function (d) {
    if (!d || d.m !== ID) return;
    views.forEach(function (v) { if (v.ctl.onEvent) try { v.ctl.onEvent(d.event, d.data); } catch (e) { console.error(ID, e); } });
  });
})();
