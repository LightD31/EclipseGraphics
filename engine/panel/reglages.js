/* NodeCG's dialog « Réglages du module » (dashboard/dialog-reglages.html):
   GFXReglages.edit(id) shows a module's settings in the active show —
   switched on or off, its form (saved as it is typed, as what changed), the
   commands Companion sends it. */
(function () {
  'use strict';
  var U = window.GFXShared, h = Forms.h, L = window.GFXLink;
  var PID = 'reglages-' + Math.random().toString(36).slice(2, 8);
  var S = { id: null, live: null, vars: {}, media: [], status: null };
  var E = L.Editor({ by: PID, toast: L.toast, onRemote: fromElsewhere });
  var root = document.getElementById('rg'), pending = false;

  function tz() { return (E.show && E.show.timezone) || 'Europe/Paris'; }
  var ctx = {
    show: function () { return E.show; }, live: function () { return S.live; }, vars: function () { return S.vars; },
    media: function () { return S.media; }, status: function () { return S.status; },
    now: function () { return Date.now(); }, tz: tz,
    changed: function () { E.changed(); },
    cmd: function (t, c, text) { return L.msg('cmd', { target: t, cmd: c, text: text, from: 'panel' }).catch(function (e) { L.toast(e.message, true); }); },
    upload: function (f) { return L.upload(f, S.media); }
  };
  function entry() {
    var ms = E.show.modules = E.show.modules || {};
    var e = ms[S.id] = ms[S.id] || { enabled: false, settings: {} };
    if (!U.isObj(e.settings)) e.settings = {};
    return e;
  }
  function render() {
    root.innerHTML = '';
    var id = S.id, D = id && L.mod(id);
    if (!D) { root.appendChild(h('p', { class: 'note', text: id ? 'Module introuvable : ' + id : '' })); return; }
    var on = h('input', { type: 'checkbox', checked: !!entry().enabled });
    on.addEventListener('change', function () { entry().enabled = on.checked; E.changed(); render(); });
    root.appendChild(h('div', { class: 'bar' }, [h('h3', { text: (D.icon ? D.icon + ' ' : '') + D.label, style: 'margin:0' }), h('span', { class: 'sp' }),
      h('label', { class: 'fm-switch' }, [on, h('span')]), h('span', { class: 'fm-unit', text: entry().enabled ? 'actif' : 'inactif' })]));
    root.appendChild(h('p', { class: 'note', text: (D.desc || '') + ' Projet : « ' + E.show.title + ' ».' }));
    var box = h('div');
    root.appendChild(box);
    Forms.render(box, D.settings || [], {
      get: function (k) { return U.getPath(entry().settings, k); },
      set: function (k, v) { U.setPath(entry().settings, k, v); },
      values: function () { return L.modSettings(E.show, id); }
    }, L.formEnv(ctx));
    var help = typeof D.cmdHelp === 'function' ? D.cmdHelp(L.modSettings(E.show, id)) : D.cmdHelp;
    if (help && help.length) root.appendChild(L.moduleCommandsHelp(id, help));
  }
  function editing() {
    var a = document.activeElement;
    return a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }
  document.addEventListener('focusout', function () {
    setTimeout(function () { if (pending && !editing()) { pending = false; render(); } }, 50);
  });
  /* closed: what was typed goes at once */
  document.addEventListener('dialog-dismissed', function () { E.save(); });
  document.addEventListener('dialog-confirmed', function () { E.save(); });
  /* another page's edit (the module's panel, the Régie): redrawn once the
     field being typed in is left */
  function fromElsewhere(r) {
    var id = S.id;
    if (!id) return;
    var mine = r === 'load' || r.some(function (op) {
      return op.path === 'modules' || op.path === 'title' || op.path === 'modules.' + id || op.path.indexOf('modules.' + id + '.') === 0;
    });
    if (!mine) return;
    if (editing() && r !== 'load') { pending = true; return; }
    render();
  }

  var c = L.connect(['catalog', 'show', 'live', 'vars', 'media', 'status', 'soundCues']), R = c.R;
  var ready = c.ready.then(function () {
    E.load(R.show.value);
    S.live = U.clone(R.live.value); S.vars = U.clone(R.vars.value) || {};
    S.media = U.clone(R.media.value) || []; S.status = U.clone(R.status.value);
    R.show.on('change', E.remote);
    R.live.on('change', function (v) { if (v) S.live = U.clone(v); });
    R.vars.on('change', function (v) { S.vars = U.clone(v) || {}; });
    R.media.on('change', function (v) { S.media = U.clone(v) || []; });
    return L.loadModules((R.catalog.value || {}).modules || [], { panels: false });
  });
  window.GFXReglages = {
    edit: function (id) { S.id = id; ready.then(render); }
  };
})();
