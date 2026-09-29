/* Régie — the control panel.

   Left, the rundown: every graphic of the show with its on/off button and
   the controls it needs on air (layouts, names, messages). Right, the
   preview (the real output page, scaled) and the editors: the selected
   graphic, the theme, the animations, the variables, the modules, the
   projects, this machine's settings.

   Every edit is saved as you type (PUT /api/show, 250 ms after the last
   keystroke) and reaches every output at once; "Annuler" steps back through
   the last changes. Commands (on/off, layouts…) go through /api/cmd, the
   same path as Companion. */
(function () {
  'use strict';
  var U = window.GFXShared, T = window.GFXTheme, M = window.GFXMotion, GFX = window.GFX, h = Forms.h;
  function $(id) { return document.getElementById(id); }
  var PID = 'panel-' + Math.random().toString(36).slice(2, 10);
  var S = {
    name: '', show: null, rev: 0, live: null, vars: {}, media: [], shows: [], settings: null, status: null,
    modules: [], offset: 0, sel: null, tab: 'edit', connected: false
  };
  try { S.sel = localStorage.getItem('regie.sel'); S.tab = localStorage.getItem('regie.tab') || 'edit'; } catch (e) { /* private mode */ }

  // ===== Server =====
  function api(method, path, body) {
    return fetch(path, {
      method: method, cache: 'no-store',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; e.body = j; throw e; }
        return j;
      });
    });
  }
  var toastTimer = 0;
  function toast(msg, err) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, err ? 4000 : 2000);
  }
  function cmd(target, c, text) {
    return api('POST', 'api/cmd?from=panel', { target: target, cmd: c, text: text })
      .catch(function (e) { toast(e.message, true); });
  }

  // ===== Saving, undo =====
  var saveTimer = 0, saving = false, again = false, stable = null, undo = [], burstAt = 0;
  function changed() {
    var t = Date.now();
    if (stable && t - burstAt > 1200) { undo.push(stable); if (undo.length > 60) undo.shift(); }
    burstAt = t;
    $('bUndo').disabled = !undo.length;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
    clearTimeout(rdTimer);
    rdTimer = setTimeout(renderRundown, 300);
  }
  var rdTimer = 0;
  function save() {
    if (saving) { again = true; return; }
    saving = true;
    api('PUT', 'api/show', { rev: S.rev, config: S.show, by: PID }).then(function (j) {
      S.rev = j.rev;
      stable = JSON.stringify(S.show);
    }, function (e) {
      if (e.status === 409 && e.body && e.body.config) {
        S.show = e.body.config; S.rev = e.body.rev; stable = JSON.stringify(S.show);
        toast('Projet modifié ailleurs : rechargé', true);
        renderAll();
      } else toast('Enregistrement impossible : ' + e.message, true);
    }).then(function () {
      saving = false;
      if (again) { again = false; save(); }
    });
  }
  $('bUndo').addEventListener('click', function () {
    var prev = undo.pop();
    $('bUndo').disabled = !undo.length;
    if (!prev) return;
    S.show = JSON.parse(prev);
    burstAt = 0;
    clearTimeout(saveTimer);
    save();
    renderAll();
    toast('Modification annulée');
  });
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !typing) { e.preventDefault(); $('bUndo').click(); }
  });

  // ===== Event stream =====
  var es = null;
  function connect() {
    es = new EventSource('api/events?role=panel&id=' + PID);
    es.addEventListener('hello', function (e) {
      var d = JSON.parse(e.data);
      S.connected = true;
      S.offset = d.serverTime - Date.now();
      S.name = d.show.name; S.show = d.show.config; S.rev = d.show.rev; stable = JSON.stringify(S.show);
      S.live = d.live; S.vars = d.vars || {}; S.media = d.media || []; S.shows = d.shows || [];
      S.settings = d.settings; S.status = d.status; S.modules = d.modules || [];
      $('offline').hidden = true;
      T.useUploaded(S.media);
      loadModules().then(renderAll);
    });
    es.addEventListener('show', function (e) {
      var d = JSON.parse(e.data);
      if (d.by === PID) return;
      var switched = d.name !== S.name;
      S.name = d.name; S.show = d.config; S.rev = d.rev; stable = JSON.stringify(S.show);
      if (switched) { undo = []; $('bUndo').disabled = true; }
      if (editing() && !switched) { pendingRender = true; renderRundown(); return; }
      renderAll();
    });
    es.addEventListener('live', function (e) {
      S.live = JSON.parse(e.data).live;
      updateRundown();
      if (S.tab === 'vars') refreshVarValues();
      if (S.tab === 'modules') refreshModules();
    });
    es.addEventListener('vars', function (e) {
      var d = JSON.parse(e.data);
      if (d.reset) S.vars = {}; else S.vars[d.m] = Object.assign(S.vars[d.m] || {}, d.v);
      if (S.tab === 'vars') refreshVarValues();
      if (S.tab === 'modules') refreshModules();
    });
    es.addEventListener('shows', function (e) { S.shows = JSON.parse(e.data).shows; renderHeader(); if (S.tab === 'shows') renderTab(); });
    es.addEventListener('media', function (e) { S.media = JSON.parse(e.data).media; T.useUploaded(S.media); if (S.tab === 'settings') renderTab(); });
    es.addEventListener('settings', function (e) { S.settings = JSON.parse(e.data).settings; renderPills(); });
    es.addEventListener('status', function (e) {
      var d = JSON.parse(e.data);
      S.status = Object.assign(S.status || {}, d);
      renderPills();
    });
    es.onerror = function () { S.connected = false; $('offline').hidden = false; renderPills(); };
  }
  /* A change from elsewhere while the operator types here waits for the field
     to be left, so it doesn't pull the text from under the cursor */
  var pendingRender = false;
  function editing() {
    var a = document.activeElement;
    return a && $('tab').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }
  document.addEventListener('focusout', function () {
    setTimeout(function () { if (pendingRender && !editing()) { pendingRender = false; renderAll(); } }, 50);
  });
  setInterval(function () { api('GET', 'api/status').then(function (s) { S.status = s; renderPills(); if (S.tab === 'settings') refreshSettings(); }).catch(function () {}); }, 5000);

  // ===== Module descriptors (the same files the outputs load) =====
  var loaded = {};
  function script(src) {
    if (loaded[src]) return loaded[src];
    return (loaded[src] = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    }));
  }
  function loadModules() {
    return Promise.all(S.modules.map(function (id) {
      return script('modules/' + id + '/module.js').then(function () {
        var D = mod(id);
        return D && D.panel ? script('modules/' + id + '/' + D.panel) : null;
      });
    }));
  }
  function mod(id) { return window.GFXModules && window.GFXModules[id]; }
  function enabledMods() { return Object.keys(S.show.modules || {}).filter(function (id) { return S.show.modules[id] && S.show.modules[id].enabled && mod(id); }); }
  function modSettings(id) {
    var D = mod(id), m = (S.show.modules || {})[id] || {};
    return U.withDefaults(U.clone(m.settings || {}), D ? U.schemaDefaults(D.settings) : {});
  }

  // ===== Helpers =====
  function tz() { return (S.show && S.show.timezone) || 'Europe/Paris'; }
  function now() { return Date.now() + S.offset; }
  function gById(id) { return S.show.graphics.find(function (g) { return g.id === id; }); }
  function liveOf(id) { return (S.live && S.live.graphics && S.live.graphics[id]) || {}; }
  function fieldsOf(g) { var def = GFX.types[g.type]; return U.withDefaults(U.clone(g.fields || {}), def ? def.defaults : {}); }
  function uniqueId(base) {
    base = U.slug(base) || 'g';
    var id = base, n = 2;
    while (gById(id) || id === 'all' || id === 'var' || S.modules.indexOf(id) >= 0) id = base + '_' + n++;
    return id;
  }
  function visualsList(kind) {
    var out = [];
    enabledMods().forEach(function (id) {
      var D = mod(id), list = (kind === 'columns' ? D.columns : D.visuals) || {};
      Object.keys(list).forEach(function (k) { out.push(['module:' + id + '.' + k, D.label + ' · ' + list[k].label]); });
    });
    return out;
  }
  /* The variables a text can use, for the {} picker */
  function varGroups() {
    var g = [{ title: 'Horloge et date', items: [['clock', 'heure', U.hms(now(), tz())], ['clock.hm', 'heure sans secondes', U.hm(now(), tz())],
               ['date', 'date', U.longDate(now(), tz())], ['date.short', 'date courte', U.shortDate(now(), tz())],
               ['day', 'jour', U.weekday(now(), tz())], ['show', 'titre du projet', S.show.title]] }];
    g.push({ title: 'Variables libres', items: (S.show.variables || []).map(function (v) {
      return ['var.' + v.name, v.label, S.live && S.live.vars ? S.live.vars[v.name] : v.value];
    }) });
    enabledMods().forEach(function (id) {
      var D = mod(id), items = [], seen = {};
      (D.vars || []).forEach(function (v) { seen[v.name] = true; items.push([id + '.' + v.name, v.label, show((S.vars[id] || {})[v.name])]); });
      Object.keys(S.vars[id] || {}).forEach(function (k) { if (!seen[k] && k.charAt(0) !== '_') items.push([id + '.' + k, '', show(S.vars[id][k])]); });
      g.push({ title: D.label, items: items });
    });
    return g;
    function show(v) { return v == null ? '' : typeof v === 'object' ? '[liste]' : v; }
  }
  function formEnv(g) {
    return {
      tz: tz, changed: changed,
      themeColor: function (token) { return T.resolve(S.show.theme).colors[token]; },
      vars: varGroups,
      media: function (accept) {
        return S.media.filter(function (m) { return !accept || accept.split(',').indexOf(m.kind) >= 0; });
      },
      upload: upload,
      send: function (f, kind, i) {
        if (!g) return;
        if (kind === 'take') cmd(g.id, 'take.' + (i + 1));
        if (kind === 'send') cmd(g.id, 'preset.' + (i + 1));
      },
      options: function (source) {
        switch (source) {
          case 'panelSources': return [['none', 'Aucun'], ['image', 'Image']].concat(visualsList('visuals'));
          case 'cardSources': return [['none', 'Aucune']].concat(visualsList('visuals'));
          case 'columnSources': return [['', '— choisir —']].concat(visualsList('columns'));
          case 'flashAnchors': return [['free', 'Libre (position ci-dessous)']].concat(S.show.graphics.filter(function (x) { return x.type === 'bandeau'; })
            .map(function (x) { return ['bandeau:' + x.id, 'Collé au bandeau « ' + x.name + ' »']; }));
          case 'motionPresets': return [['', 'Celle du projet']].concat(Object.keys(M.PRESETS).map(function (k) { return [k, M.PRESETS[k].label]; }));
          case 'listVars': {
            var out = [['', '— choisir —']];
            varGroups().slice(1).forEach(function (grp) { grp.items.forEach(function (it) { out.push([it[0], it[0] + (it[1] ? ' — ' + it[1] : '')]); }); });
            return out;
          }
        }
        var m = /^graphics:(\w+)$/.exec(source);
        if (m) return [['', 'Automatique']].concat(S.show.graphics.filter(function (x) { return x.type === m[1]; }).map(function (x) { return [x.id, x.name + ' (' + x.id + ')']; }));
        return [];
      }
    };
  }
  function upload(file) {
    toast('Envoi de ' + file.name + '…');
    return fetch('api/media?name=' + encodeURIComponent(file.name), { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error); toast(j.name + ' importé'); return j.name; })
      .catch(function (e) { toast('Import impossible : ' + e.message, true); return null; });
  }
  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Copié : ' + text); },
      function () { window.prompt('Copier :', text); });
  }
  function select(id) {
    S.sel = id;
    try { localStorage.setItem('regie.sel', id || ''); } catch (e) { /* ignore */ }
    previewForce();
    renderRundown();
    if (S.tab !== 'edit') setTab('edit'); else renderTab();
  }

  // ===== Header =====
  function renderHeader() {
    $('showTitle').textContent = S.show ? S.show.title : '…';
    var p = $('showPick');
    p.innerHTML = '';
    S.shows.forEach(function (s) { p.appendChild(h('option', { value: s.name, text: s.title + ' (' + s.name + ')' })); });
    p.value = S.name;
    document.title = 'Régie · ' + (S.show ? S.show.title : '');
  }
  $('showPick').addEventListener('change', function () {
    var name = $('showPick').value;
    var onAir = S.show.graphics.some(function (g) { return g.type !== 'flash' && liveOf(g.id).air; });
    if (onAir && !confirm('Des graphiques sont à l\'antenne : ils seront remplacés par ceux du projet « ' + name + ' ». Continuer ?')) {
      $('showPick').value = S.name; return;
    }
    api('POST', 'api/shows', { action: 'activate', name: name }).then(function () { toast('Projet ouvert : ' + name); },
      function (e) { toast(e.message, true); $('showPick').value = S.name; });
  });
  $('bAllOff').addEventListener('click', function () { cmd('all', 'all.off'); });
  function renderPills() {
    var set = function (id, cls, text, title) { var e = $(id); e.className = 'pill ' + cls; e.textContent = text; if (title) e.title = title; };
    set('pServer', S.connected ? 'ok' : 'bad', S.connected ? 'Serveur' : 'Serveur hors ligne');
    var o = (S.status && S.status.obs) || {};
    set('pObs', { ok: 'ok', connecting: 'warn', error: 'bad', auth: 'bad' }[o.state] || '', o.state === 'off' || !o.state ? 'OBS : lien coupé' : o.state === 'ok' ? 'OBS' : 'OBS : ' + (o.error || o.state),
        'Lien OBS websocket (Réglages)');
    var c = (S.status && S.status.companion) || {};
    set('pComp', { ok: 'ok', pending: 'warn', error: 'bad' }[c.state] || '', c.state === 'off' || !c.state ? 'Companion : coupé' : c.state === 'error' ? 'Companion : erreur' : 'Companion',
        c.error || 'Variables Companion (Réglages)');
  }
  setInterval(function () { if (S.show) $('clock').textContent = U.hms(now(), tz()); }, 250);

  // ===== Preview =====
  var pv = $('preview'), pvBox = $('previewBox');
  function previewScale() { pv.style.transform = 'scale(' + (pvBox.clientWidth / 1920) + ')'; }
  if (window.ResizeObserver) new ResizeObserver(previewScale).observe(pvBox);
  window.addEventListener('resize', previewScale);
  function previewForce() {
    var want = $('pvMode').value === 'sel' ? (S.sel || '') : '';
    try { pv.contentWindow.postMessage({ gfxPreview: want }, location.origin); } catch (e) { /* not loaded yet */ }
  }
  pv.addEventListener('load', function () { previewScale(); setTimeout(previewForce, 300); });
  pv.src = 'overlay.html?preview=1';
  $('pvMode').addEventListener('change', previewForce);
  var bgPref = 'photo';
  try { bgPref = localStorage.getItem('regie.pvbg') || 'photo'; } catch (e) { /* ignore */ }
  $('pvBg').value = bgPref;
  function pvBg() { pvBox.className = $('pvBg').value === 'photo' ? '' : $('pvBg').value; try { localStorage.setItem('regie.pvbg', $('pvBg').value); } catch (e) { /* ignore */ } }
  $('pvBg').addEventListener('change', pvBg);
  pvBg();
  $('bReplay').addEventListener('click', function () {
    if (!S.sel) return toast('Sélectionnez un graphique', true);
    try { pv.contentWindow.postMessage({ gfxReplay: S.sel }, location.origin); } catch (e) { /* ignore */ }
  });

  // ===== Rundown =====
  var rd = {};
  function renderRundown() {
    var list = $('rdList');
    /* what was being typed in the rundown's fields survives the rebuild */
    var kept = {}, focus = null;
    list.querySelectorAll('input[data-k]').forEach(function (i) { kept[i.dataset.k] = i.value; if (i === document.activeElement) focus = i.dataset.k; });
    clearTimeout(rdTimer);
    list.innerHTML = '';
    rd = {};
    if (!S.show) return;
    if (!S.show.graphics.length) list.appendChild(h('div', { class: 'rd-empty', text: 'Aucun graphique : « + Ajouter » pour commencer.' }));
    S.show.graphics.forEach(function (g) {
      var def = GFX.types[g.type] || { label: g.type, icon: '?' };
      var air = h('button', { class: 'rd-air', onclick: function (e) { e.stopPropagation(); cmd(g.id, 'air.toggle'); } });
      var card = h('div', { class: 'rd-card', onclick: function (e) {
        if (e.target.closest('button, input, select, a')) return;
        select(g.id);
      } }, [h('div', { class: 'rd-top' }, [
        h('span', { class: 'rd-icon', text: def.icon || '▪' }),
        h('div', { class: 'rd-name', text: g.name }),
        h('span', { class: 'rd-type', text: def.label }),
        air
      ])]);
      var state = h('div', { class: 'rd-state' });
      var R = rd[g.id] = { card: card, air: air, state: state, btns: {} };
      quick(g, card, R);
      card.appendChild(state);
      list.appendChild(card);
    });
    list.querySelectorAll('input[data-k]').forEach(function (i) {
      if (kept[i.dataset.k] != null) i.value = kept[i.dataset.k];
      if (focus === i.dataset.k) i.focus();
    });
    updateRundown();
  }
  function btn(R, key, label, fn, title) {
    var b = h('button', { class: 'small', text: label, title: title || '', onclick: function (e) { e.stopPropagation(); fn(); } });
    R.btns[key] = b;
    return b;
  }
  /* The controls each type needs on air */
  function quick(g, card, R) {
    var f = fieldsOf(g), row = h('div', { class: 'rd-row' });
    if (g.type === 'bandeau') {
      row.appendChild(btn(R, 'lower', 'Bandeau', function () { cmd(g.id, 'layout.lower'); }));
      row.appendChild(btn(R, 'full', 'Plein écran', function () { cmd(g.id, 'layout.full'); }));
      var hasRecap = (f.column.sources || []).some(function (c) {
        var m = /^module:(\w+)\.(\w+)$/.exec(c.source || ''), D = m && mod(m[1]);
        return D && D.columns && D.columns[m[2]] && (D.columns[m[2]].layouts || []).indexOf('recap') >= 0;
      });
      if (hasRecap) row.appendChild(btn(R, 'recap', 'Bilan', function () { cmd(g.id, 'layout.recap'); }));
      if (f.card.source && f.card.source !== 'none') {
        row.appendChild(btn(R, 'swap', '⇄ Échanger', function () { cmd(g.id, 'main.toggle'); }, 'Échange le plein écran et la vignette'));
        row.appendChild(btn(R, 'cardt', 'Vignette', function () { cmd(g.id, 'card.toggle'); }));
      }
      viewsOf(g).forEach(function (v) {
        (v.labels || v.values).forEach(function (lab, i) {
          row.appendChild(btn(R, 'view:' + v.name + ':' + v.values[i], lab, function () { cmd(g.id, v.name + '.' + v.values[i]); }));
        });
      });
      card.appendChild(row);
      var hl = h('input', { type: 'text', placeholder: 'Titre manuel (remplace le titre)', 'data-k': g.id + ':hl' });
      var row2 = h('div', { class: 'rd-row' }, [hl,
        h('button', { class: 'small', text: 'Afficher', onclick: function (e) { e.stopPropagation(); if (hl.value.trim()) cmd(g.id, 'headline.set', hl.value.trim()); } }),
        btn(R, 'hlauto', 'Auto', function () { cmd(g.id, 'headline.auto'); }, 'Revenir au titre du graphique')]);
      hl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && hl.value.trim()) cmd(g.id, 'headline.set', hl.value.trim()); });
      card.appendChild(row2);
    } else if (g.type === 'synthe') {
      var sel = h('select', { onclick: function (e) { e.stopPropagation(); } });
      (f.entries || []).forEach(function (en, i) { sel.appendChild(h('option', { value: i + 1, text: (i + 1) + '. ' + (en.name || '…') + (en.role ? ' — ' + en.role : '') })); });
      sel.addEventListener('change', function () { cmd(g.id, 'entry.' + sel.value); });
      R.entrySel = sel;
      row.appendChild(btn(R, 'prev', '◀', function () { cmd(g.id, 'entry.prev'); }, 'Nom précédent'));
      row.appendChild(sel);
      row.appendChild(btn(R, 'next', '▶', function () { cmd(g.id, 'entry.next'); }, 'Nom suivant'));
      row.appendChild(btn(R, 'take', 'Suivant à l\'antenne', function () {
        var n = (f.entries || []).length, i = liveOf(g.id).entry || 0;
        cmd(g.id, 'take.' + ((liveOf(g.id).air ? (i + 1) % Math.max(1, n) : i) + 1));
      }, 'Passe au nom suivant et l\'affiche'));
      card.appendChild(row);
    } else if (g.type === 'flash') {
      var inp = h('input', { type: 'text', placeholder: 'Message à envoyer', 'data-k': g.id + ':msg' });
      var send = function () { if (inp.value.trim()) { cmd(g.id, 'banner.set', inp.value.trim()); inp.value = ''; } };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
      row.appendChild(inp);
      row.appendChild(h('button', { class: 'small red', text: 'Envoyer', onclick: function (e) { e.stopPropagation(); send(); } }));
      card.appendChild(row);
      var row3 = h('div', { class: 'rd-row' });
      (f.presets || []).slice(0, 8).forEach(function (p, i) {
        row3.appendChild(btn(R, 'p' + i, (p.title || '…').slice(0, 28), function () { cmd(g.id, 'preset.' + (i + 1)); }, p.title));
      });
      row3.appendChild(btn(R, 'next', 'Passer', function () { cmd(g.id, 'banner.next'); }));
      row3.appendChild(btn(R, 'clear', 'Vider', function () { cmd(g.id, 'banner.clear'); }));
      card.appendChild(row3);
    }
  }
  function viewsOf(g) {
    if (g.type !== 'bandeau') return [];
    var f = fieldsOf(g), out = [];
    [f.panel.source, f.card.source].forEach(function (src) {
      var m = /^module:(\w+)\./.exec(src || ''), D = m && mod(m[1]);
      if (!D || !D.views) return;
      Object.keys(D.views).forEach(function (n) { if (!out.some(function (v) { return v.name === n; })) out.push(Object.assign({ name: n }, D.views[n])); });
    });
    return out;
  }
  function updateRundown() {
    if (!S.show || !S.live) return;
    S.show.graphics.forEach(function (g) {
      var R = rd[g.id];
      if (!R) return;
      var L = liveOf(g.id), f = fieldsOf(g);
      var on = !!L.air;
      R.card.classList.toggle('on', on && g.type !== 'flash');
      R.card.classList.toggle('sel', S.sel === g.id);
      R.air.classList.toggle('on', on);
      R.air.textContent = g.type === 'flash' ? (on ? 'Actif' : 'Muet') : on ? 'Sortir' : 'Entrer';
      R.air.title = g.type === 'flash' ? 'Active ou coupe l\'affichage des messages' : on ? 'Retirer de l\'antenne' : 'Mettre à l\'antenne';
      var st = '';
      if (g.type === 'bandeau') {
        ['lower', 'full', 'recap'].forEach(function (k) { if (R.btns[k]) R.btns[k].classList.toggle('on', L.layout === k); });
        if (R.btns.swap) R.btns.swap.classList.toggle('on', L.main === 'card');
        if (R.btns.cardt) R.btns.cardt.classList.toggle('on', L.card !== false);
        Object.keys(R.btns).forEach(function (k) {
          var m = /^view:(\w+):(.+)$/.exec(k);
          if (m) R.btns[k].classList.toggle('on', (L.view || {})[m[1]] === m[2]);
        });
        if (R.btns.hlauto) R.btns.hlauto.classList.toggle('on', !L.headline);
        st = { lower: 'bandeau', full: 'plein écran', recap: 'bilan' }[L.layout] || '';
        if (L.headline) st += ' · titre manuel : « ' + L.headline + ' »';
      } else if (g.type === 'synthe') {
        var e = (f.entries || [])[L.entry || 0];
        if (R.entrySel) R.entrySel.value = String((L.entry || 0) + 1);
        st = e ? (L.entry + 1) + '/' + f.entries.length + ' · ' + (e.name || '') : 'aucun nom';
        if (+f.autoOut > 0) st += ' · sortie auto ' + f.autoOut + ' s';
      } else if (g.type === 'flash') {
        var F = (S.live.flash || {})[g.id] || {};
        st = F.current ? '« ' + F.current.title + ' »' : 'aucun message';
        if (F.queue && F.queue.length) st += ' · ' + F.queue.length + ' en attente';
        var a = /^bandeau:(\w+)$/.exec(f.anchor || '');
        if (a) st += ' · collé à ' + a[1];
      } else if (g.type === 'card') st = { titre: 'titre', attente: 'attente', chiffres: 'chiffres clés', message: 'message' }[f.template] || '';
      else if (g.type === 'ticker') st = { crawl: 'défilement continu', rotate: 'un message à la fois', sets: 'séries' }[f.mode] || '';
      R.state.innerHTML = '';
      R.state.appendChild(h('span', { text: g.id + (st ? ' · ' : '') }));
      R.state.appendChild(h('b', { text: st }));
    });
  }
  $('bAdd').addEventListener('click', function () {
    var groups = [{ title: 'Ajouter un graphique', items: Object.keys(GFX.types).map(function (k) { return [k, GFX.types[k].label, GFX.types[k].desc]; }) }];
    Forms.menu($('bAdd'), groups, addGraphic);
    var m = document.querySelector('.fm-menu');
    if (m) m.querySelectorAll('code').forEach(function (c) { c.textContent = GFX.types[c.textContent.replace(/[{}]/g, '')].icon || '▪'; });
  });
  function addGraphic(type) {
    var def = GFX.types[type];
    var g = { id: uniqueId(type), type: type, name: def.label, fields: {}, motion: {} };
    if (type === 'flash') {
      var b = S.show.graphics.find(function (x) { return x.type === 'bandeau'; });
      g.fields.anchor = b ? 'bandeau:' + b.id : 'free';
    }
    S.show.graphics.push(g);
    changed();
    S.sel = g.id;
    renderRundown();
    setTab('edit');
    toast(def.label + ' ajouté');
  }

  // ===== Tabs =====
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { setTab(b.dataset.tab); });
  });
  function setTab(t) {
    S.tab = t;
    try { localStorage.setItem('regie.tab', t); } catch (e) { /* ignore */ }
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
    renderTab();
  }
  function renderAll() {
    if (!S.show) return;
    if (S.sel && !gById(S.sel)) S.sel = S.show.graphics[0] ? S.show.graphics[0].id : null;
    renderHeader(); renderPills(); renderRundown(); setTab(S.tab);
    previewForce();
  }
  function renderTab() {
    var el = $('tab');
    el.innerHTML = '';
    if (!S.show) return;
    ({ edit: renderEdit, theme: renderTheme, motion: renderMotion, vars: renderVars, modules: renderModules,
       shows: renderShows, settings: renderSettings }[S.tab] || renderEdit)(el);
  }

  // ===== Editor: the selected graphic =====
  function renderEdit(el) {
    var g = S.sel && gById(S.sel);
    if (!g) {
      el.appendChild(h('p', { class: 'note', text: 'Choisissez un graphique à gauche, ou ajoutez-en un :' }));
      var grid = h('div', { class: 'grid' });
      Object.keys(GFX.types).forEach(function (k) {
        var d = GFX.types[k];
        grid.appendChild(h('button', { class: 'preset', onclick: function () { addGraphic(k); } }, [h('b', { text: d.icon + ' ' + d.label }), h('small', { text: d.desc })]));
      });
      el.appendChild(grid);
      return;
    }
    var def = GFX.types[g.type];
    if (!def) { el.appendChild(h('p', { class: 'note', text: 'Type inconnu : ' + g.type })); return; }
    var name = h('input', { type: 'text', class: 'name', value: g.name, title: 'Nom affiché dans la régie' });
    name.addEventListener('input', function () { g.name = name.value; changed(); var R = rd[g.id]; if (R) R.card.querySelector('.rd-name').textContent = g.name; });
    var gid = h('input', { type: 'text', class: 'gid', value: g.id, title: 'Identifiant : celui des commandes Companion' });
    gid.addEventListener('change', function () { renameGraphic(g, gid.value, gid); });
    var idx = S.show.graphics.indexOf(g);
    el.appendChild(h('div', { class: 'ed-head' }, [
      h('span', { class: 'ed-type', text: def.icon + ' ' + def.label }), name, gid,
      h('button', { class: 'small', text: '↑', title: 'Passer derrière (plus bas dans la pile)', disabled: idx === 0, onclick: function () { move(g, -1); } }),
      h('button', { class: 'small', text: '↓', title: 'Passer devant', disabled: idx === S.show.graphics.length - 1, onclick: function () { move(g, 1); } }),
      h('button', { class: 'small', text: 'Dupliquer', onclick: function () { duplicate(g); } }),
      h('button', { class: 'small ghost', text: 'Supprimer', onclick: function () { remove(g); } })
    ]));
    el.appendChild(h('p', { class: 'note', text: def.desc + '. Les textes acceptent des variables : bouton { } à droite du champ.' }));
    var target = {
      get: function (path) { return path.charAt(0) === '@' ? U.getPath(g, path.slice(1)) : U.getPath(g.fields, path); },
      set: function (path, v) {
        if (path.charAt(0) === '@') { if (!g.motion) g.motion = {}; U.setPath(g, path.slice(1), v); }
        else U.setPath(g.fields, path, v);
      },
      values: function () { return fieldsOf(g); }
    };
    var box = h('div');
    el.appendChild(box);
    Forms.render(box, def.schema, target, formEnv(g));
    el.appendChild(commandsHelp(g));
  }
  function renameGraphic(g, v, input) {
    var id = U.slug(v);
    if (!id || (id !== g.id && (gById(id) || id === 'all' || id === 'var' || S.modules.indexOf(id) >= 0))) {
      toast('Identifiant invalide ou déjà pris', true); input.value = g.id; return;
    }
    input.value = id;
    if (id === g.id) return;
    var old = g.id;
    g.id = id;
    S.show.graphics.forEach(function (x) { if (x.type === 'flash' && x.fields && x.fields.anchor === 'bandeau:' + old) x.fields.anchor = 'bandeau:' + id; });
    Object.keys(S.show.modules || {}).forEach(function (m) {
      var st = (S.show.modules[m] || {}).settings || {};
      ['graphic', 'flash'].forEach(function (k) { if (st[k] === old) st[k] = id; });
    });
    S.sel = id;
    changed();
    renderRundown();
    toast('Identifiant changé : pensez aux boutons Companion (' + old + ' → ' + id + ')');
  }
  function move(g, d) {
    var l = S.show.graphics, i = l.indexOf(g);
    l.splice(i + d, 0, l.splice(i, 1)[0]);
    changed(); renderRundown(); renderTab();
  }
  function duplicate(g) {
    var c = U.clone(g);
    c.id = uniqueId(g.id);
    c.name = g.name + ' (copie)';
    S.show.graphics.splice(S.show.graphics.indexOf(g) + 1, 0, c);
    S.sel = c.id;
    changed(); renderRundown(); renderTab();
  }
  function remove(g) {
    if (!confirm('Supprimer « ' + g.name + ' » ?')) return;
    S.show.graphics.splice(S.show.graphics.indexOf(g), 1);
    S.sel = null;
    changed(); renderRundown(); renderTab();
    toast('Supprimé (Annuler pour revenir en arrière)');
  }
  /* What Companion sends for this graphic */
  function commandsHelp(g) {
    var def = GFX.types[g.type];
    var list = [['air.on', 'mettre à l\'antenne'], ['air.off', 'retirer'], ['air.toggle', 'basculer']];
    if (g.type === 'bandeau') list = list.concat([['air.on.full', 'entrer directement en plein écran'], ['layout.lower', 'bandeau'], ['layout.full', 'plein écran'],
      ['layout.recap', 'bilan'], ['layout.toggle', 'bandeau ⇄ plein écran'], ['main.toggle', 'échanger plein écran et vignette'], ['card.toggle', 'vignette'],
      ['headline.<texte>', 'titre manuel'], ['headline.auto', 'titre du graphique']]);
    viewsOf(g).forEach(function (v) { list.push([v.name + '.toggle', v.label]); });
    if (g.type === 'synthe') list = list.concat([['take.2', 'afficher le 2e nom'], ['entry.next', 'nom suivant'], ['entry.prev', 'nom précédent']]);
    if (g.type === 'flash') list = list.concat([['banner.<texte>', 'envoyer un message'], ['preset.1', 'envoyer le message prêt n° 1'], ['banner.next', 'passer'], ['banner.clear', 'vider la file']]);
    var base = location.origin + '/api/cmd/' + g.id + '/';
    var tb = h('table', { class: 't' }, [h('tr', {}, [h('th', { text: 'Commande' }), h('th', { text: 'Effet' }), h('th', { text: 'Companion (HTTP GET)' })])]);
    list.forEach(function (c) {
      tb.appendChild(h('tr', {}, [h('td', {}, [h('code', { text: c[0] })]), h('td', { text: c[1] }),
        h('td', {}, [h('button', { class: 'fm-mini', text: 'copier l\'URL', onclick: function () { copy(base + c[0].replace('<texte>', 'Texte')); } })])]));
    });
    return h('details', { class: 'fm-sec' }, [h('summary', { text: 'Commandes (Companion, OBS)' }), h('div', { class: 'fm-sec-body' }, [
      h('p', { class: 'note' }, ['Companion : module « Generic HTTP », requête GET sur ', h('code', { text: base + '<commande>' }),
        ' — ou OBS « Broadcast Custom Event » avec ', h('code', { text: '{"gfx": "' + g.id + ':air.toggle"}' }), '. ' + def.label + ' : ' + g.id]),
      tb])]);
  }

  // ===== Theme =====
  function renderTheme(el) {
    var th = S.show.theme = S.show.theme || {};
    var R = T.resolve(th);
    el.appendChild(h('p', { class: 'note', text: 'Un thème habille tous les graphiques du projet à la fois. Partez d\'un style, puis ajustez couleurs, polices et formes.' }));
    var grid = h('div', { class: 'grid' });
    Object.keys(T.PRESETS).forEach(function (k) {
      var P = T.PRESETS[k], c = P.colors;
      grid.appendChild(h('button', { class: 'preset' + ((th.preset || 'direct') === k ? ' on' : ''), onclick: function () {
        if (th.colors || th.fonts || th.shape) { if (!confirm('Appliquer « ' + P.label + ' » remplace vos couleurs, polices et formes. Continuer ?')) return; }
        S.show.theme = { preset: k };
        changed(); renderTab();
      } }, [h('b', { text: P.label }),
        h('div', { class: 'sw' }, [c.accent, c.base, c.base2, c.surface, c.highlight].map(function (x) { return h('i', { style: 'background:' + x }); })),
        h('div', { class: 'sample', style: "font-family:" + T.stack(P.fonts.head.family) + ";font-weight:" + P.fonts.head.weight + (P.fonts.head.upper === false ? '' : ';text-transform:uppercase') +
          (P.fonts.head.width ? ';font-stretch:' + P.fonts.head.width + '%' : ''), text: 'Titre 12:34' }),
        h('small', { text: P.desc })]));
    });
    el.appendChild(h('h2', { text: 'Style de départ' }));
    el.appendChild(grid);

    // colours
    var cbox = h('div', { class: 'tokens' });
    T.TOKENS.forEach(function (t) {
      var k = t[0], v = R.colors[k];
      var col = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000' });
      var hex = h('input', { type: 'text', class: 'fm-hex', value: v });
      var set = function (x) { th.colors = th.colors || {}; th.colors[k] = x; changed(); };
      col.addEventListener('input', function () { hex.value = col.value; set(col.value); });
      hex.addEventListener('change', function () { var s = hex.value.trim(); if (!/^#/.test(s)) s = '#' + s; if (/^#[0-9a-f]{6}$/i.test(s)) { col.value = s; set(s); } });
      cbox.appendChild(h('div', { class: 'token' }, [col, hex, h('label', {}, [t[1], h('small', { text: t[2] })])]));
    });
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'Couleurs' }), cbox]));

    // fonts
    var fbox = h('div');
    var families = T.FONTS.map(function (f) { return [f.family, f.label]; })
      .concat(S.media.filter(function (m) { return m.kind === 'font'; }).map(function (m) { var fam = T.fontFamilyOf(m.name); return [fam, fam + ' (importée)']; }));
    [['head', 'Titres', 'noms, titres, étiquettes'], ['text', 'Texte', 'bandes d\'info, défilants'], ['num', 'Chiffres', 'minuteurs, horloges, chiffres clés']].forEach(function (r) {
      var role = r[0], F = R.fonts[role];
      var setF = function (k, v) { th.fonts = th.fonts || {}; th.fonts[role] = Object.assign({}, th.fonts[role] || {}); th.fonts[role][k] = v; changed(); draw(); };
      var fam = h('select');
      var list = families.slice();
      if (!list.some(function (x) { return x[0] === F.family; })) list.push([F.family, F.family + ' (installée sur la machine)']);
      list.push(['__other', 'Autre police installée…']);
      list.forEach(function (x) { fam.appendChild(h('option', { value: x[0], text: x[1] })); });
      fam.value = F.family;
      fam.addEventListener('change', function () {
        if (fam.value === '__other') {
          var n = prompt('Nom exact de la police installée sur la machine d\'OBS (par ex. Univers Next Pro) :', '');
          if (n && n.trim()) setF('family', n.trim()); else fam.value = F.family;
        } else setF('family', fam.value);
      });
      var info = T.FONTS.find(function (x) { return x.family === F.family; });
      var weights = info && info.weights.length > 2 ? info.weights : [100, 200, 300, 400, 500, 600, 700, 800, 900].filter(function (w) {
        return !info || (w >= info.weights[0] && w <= info.weights[info.weights.length - 1]);
      });
      var wsel = h('select', { title: 'Graisse' });
      weights.forEach(function (w) { wsel.appendChild(h('option', { value: w, text: 'graisse ' + w })); });
      wsel.value = String(F.weight);
      wsel.addEventListener('change', function () { setF('weight', +wsel.value); });
      var ctl = h('div', { class: 'ctl' }, [fam, wsel]);
      if (role === 'text') {
        var ssel = h('select', { title: 'Graisse du gras' });
        weights.forEach(function (w) { ssel.appendChild(h('option', { value: w, text: 'gras ' + w })); });
        ssel.value = String(F.strong || 800);
        ssel.addEventListener('change', function () { setF('strong', +ssel.value); });
        ctl.appendChild(ssel);
      }
      if (role === 'head') {
        var up = h('input', { type: 'checkbox', checked: F.upper !== false });
        up.addEventListener('change', function () { setF('upper', up.checked); });
        ctl.appendChild(h('label', { class: 'fm-switch', title: 'Capitales' }, [up, h('span')]));
        ctl.appendChild(h('span', { class: 'fm-unit', text: 'capitales' }));
        var tr = h('input', { type: 'range', min: -2, max: 4, step: 0.1, value: F.tracking || 0, title: 'Espacement des lettres' });
        tr.addEventListener('change', function () { setF('tracking', +tr.value); });
        ctl.appendChild(h('span', { class: 'fm-unit', text: 'espacement' }));
        ctl.appendChild(tr);
      }
      if (info && info.width) {
        var wd = h('input', { type: 'range', min: info.width[0], max: 100, step: 1, value: F.width || 100, title: 'Largeur' });
        wd.addEventListener('change', function () { setF('width', +wd.value === 100 ? null : +wd.value); });
        ctl.appendChild(h('span', { class: 'fm-unit', text: 'largeur' }));
        ctl.appendChild(wd);
      }
      var sample = h('div', { class: 'sample', text: role === 'num' ? '01:23:45 · 31 000 ft' : role === 'head' ? 'Premier vol de l\'A350F' : 'Décollage prévu à 10:30 · Toulouse-Blagnac' });
      sample.style.fontFamily = T.stack(F.family);
      sample.style.fontWeight = role === 'num' ? F.weight : F.weight;
      if (role === 'head' && F.upper !== false) sample.style.textTransform = 'uppercase';
      if (role === 'head') sample.style.letterSpacing = (F.tracking || 0) + 'px';
      if (role === 'num') sample.style.fontVariantNumeric = 'tabular-nums';
      if (F.width) sample.style.fontStretch = F.width + '%';
      fbox.appendChild(h('div', { class: 'fontrole' }, [h('label', {}, [h('b', { text: r[1] }), h('br'), h('small', { class: 'note', text: r[2] })]), ctl, sample,
        role === 'num' && info && info.tnum === false ? h('div', { class: 'warnf', text: 'Cette police a des chiffres proportionnels : les minuteurs vont trembler.' }) : null]));
    });
    var fontFile = h('input', { type: 'file', accept: '.woff2,.woff,.ttf,.otf', hidden: true });
    fontFile.addEventListener('change', function () { if (fontFile.files[0]) upload(fontFile.files[0]).then(function () { setTimeout(renderTab, 300); }); });
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'Polices' }),
      h('p', { class: 'note', text: 'Polices fournies (libres, incluses : elles s\'affichent dans OBS sans rien installer), polices importées, ou une police installée sur la machine d\'OBS.' }),
      fbox, h('div', { class: 'bar' }, [h('button', { class: 'small', text: 'Importer une police (.woff2, .ttf, .otf)…', onclick: function () { fontFile.click(); } }), fontFile])]));

    // shapes
    var shapes = [['scale', 'Taille générale', 0.7, 1.4, 0.01, '×'], ['radius', 'Arrondi des coins', 0, 24, 1, 'px'],
                  ['shadow', 'Ombre portée', 0, 1, 0.05, ''], ['gloss', 'Brillance', 0, 1, 0.05, '']];
    var sbox = h('div');
    shapes.forEach(function (s) {
      var val = R.shape[s[0]];
      var out = h('span', { class: 'fm-out', text: fmt(val) + ' ' + s[5] });
      var rng = h('input', { type: 'range', min: s[2], max: s[3], step: s[4], value: val });
      rng.addEventListener('input', function () {
        th.shape = th.shape || {}; th.shape[s[0]] = +rng.value; out.textContent = fmt(+rng.value) + ' ' + s[5]; changed();
      });
      sbox.appendChild(h('div', { class: 'fm-row' }, [h('label', { class: 'fm-label', text: s[1] }), h('div', { class: 'fm-ctl' }, [rng, out])]));
    });
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'Formes' }), sbox]));
    function fmt(v) { return (+v).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
    function draw() { renderTab(); }
  }

  // ===== Motion =====
  function renderMotion(el) {
    var mo = S.show.motion = S.show.motion || {};
    el.appendChild(h('p', { class: 'note', text: 'La façon dont les graphiques entrent et sortent de l\'antenne, pour tout le projet. Chaque graphique peut choisir la sienne (onglet Graphique, section Animation).' }));
    var grid = h('div', { class: 'grid' });
    Object.keys(M.PRESETS).forEach(function (k) {
      var P = M.PRESETS[k];
      grid.appendChild(h('button', { class: 'preset' + ((mo.preset || 'direct') === k ? ' on' : ''), onclick: function () {
        mo.preset = k; changed(); renderTab();
        setTimeout(function () { if (S.sel) try { pv.contentWindow.postMessage({ gfxReplay: S.sel }, location.origin); } catch (e) { /* ignore */ } }, 400);
      } }, [h('b', { text: P.label }), h('small', { text: P.desc })]));
    });
    el.appendChild(grid);
    var box = h('div', { style: 'margin-top:12px' });
    el.appendChild(box);
    var schema = [{ title: 'Réglages', open: true, fields: [
      { key: 'speed', type: 'range', label: 'Vitesse', default: 1, min: 0.5, max: 2, step: 0.05, unit: '×' },
      { key: 'stagger', type: 'range', label: 'Décalage des éléments d\'une liste', default: 1, min: 0, max: 2.5, step: 0.05, unit: '×',
        help: '0 : tous ensemble ; 1 : le rythme du style' },
      { key: 'morph', type: 'range', label: 'Durée des changements de mise en page', default: '', min: 0, max: 1.5, step: 0.05, unit: 's', empty: 'celle du style',
        help: 'bandeau ⇄ plein écran : la transformation d\'un bloc à l\'autre (0 : instantané)' },
      { key: 'change', type: 'select', label: 'Texte qui change à l\'antenne', default: 'fade',
        options: [['fade', 'fondu'], ['slide', 'glisse vers le haut'], ['none', 'aucun effet']] }
    ] }];
    Forms.render(box, schema, {
      get: function (k) { return mo[k]; }, set: function (k, v) { mo[k] = v; }, values: function () { return mo; }
    }, formEnv(null));
    el.appendChild(h('div', { class: 'bar' }, [h('button', { text: '▶ Rejouer l\'entrée du graphique sélectionné', onclick: function () { $('bReplay').click(); } })]));
    // what each preset does
    var P = M.PRESETS[mo.preset || 'direct'];
    if (P.in && Object.keys(P.in).length) {
      var tb = h('table', { class: 't' }, [h('tr', {}, ['Élément', 'Entrée', 'Sortie'].map(function (x) { return h('th', { text: x }); }))]);
      var names = { banner: 'flash', bandA: 'bande d\'accent (titre)', bandB: 'bande de fond (défilant)', surface: 'bande claire', panel: 'panneau / photo',
                    visual: 'logo, repère', title: 'titre', text: 'texte secondaire', items: 'éléments de liste', figure: 'minuteur', clock: 'horloge',
                    line: 'ligne, filet', tag: 'étiquette', badge: 'pastille', sheen: 'reflet', bg: 'fond plein écran', block: 'bloc secondaire' };
      M.ROLES.forEach(function (r) {
        var a = P.in[r], b = P.out[r];
        if (!a) return;
        var d = function (x) { return x ? (M.LABELS[x[0]] || x[0]) + ' · ' + x[2].toFixed(2).replace('.', ',') + ' s' + (x[1] ? ' après ' + x[1].toFixed(2).replace('.', ',') + ' s' : '') : '—'; };
        tb.appendChild(h('tr', {}, [h('td', { text: names[r] || r }), h('td', { text: d(a) }), h('td', { text: d(b) })]));
      });
      el.appendChild(h('details', { class: 'fm-sec' }, [h('summary', { text: 'Détail du style « ' + P.label + ' »' }), h('div', { class: 'fm-sec-body' }, [tb])]));
    }
  }

  // ===== Variables =====
  var varCells = [];
  function renderVars(el) {
    varCells = [];
    el.appendChild(h('p', { class: 'note' }, ['Dans un texte, ', h('code', { text: '{{var.score}}' }), ' affiche une variable libre, ',
      h('code', { text: '{{a350f.alt}}' }), ' une valeur de module. Filtres : ', h('code', { text: '{{nom|upper}}' }), ', ',
      h('code', { text: '{{nom|default:—}}' }), '.']));
    // free variables
    var vars = S.show.variables = S.show.variables || [];
    var tb = h('table', { class: 't' }, [h('tr', {}, ['Nom', 'Libellé', 'Valeur à l\'antenne', '', 'Companion'].map(function (x) { return h('th', { text: x }); }))]);
    vars.forEach(function (v, i) {
      var nm = h('input', { type: 'text', value: v.name });
      nm.addEventListener('change', function () {
        var s = U.slug(nm.value);
        if (!s || vars.some(function (x, j) { return j !== i && x.name === s; })) { toast('Nom invalide ou déjà pris', true); nm.value = v.name; return; }
        v.name = s; nm.value = s; changed();
      });
      var lb = h('input', { type: 'text', value: v.label || '' });
      lb.addEventListener('input', function () { v.label = lb.value; changed(); });
      var cur = S.live && S.live.vars ? S.live.vars[v.name] : v.value;
      var val = h('input', { type: 'text', value: cur == null ? '' : cur });
      val.addEventListener('change', function () { cmd('var', v.name, val.value); });
      val.addEventListener('keydown', function (e) { if (e.key === 'Enter') cmd('var', v.name, val.value); });
      varCells.push({ name: v.name, input: val });
      var num = /^-?\d+([.,]\d+)?$/.test(String(cur).trim());
      tb.appendChild(h('tr', {}, [h('td', {}, [nm]), h('td', {}, [lb]), h('td', {}, [val]), h('td', {}, [
        num ? h('button', { class: 'fm-mini', text: '−1', onclick: function () { cmd('var', v.name + '.-1'); } }) : null,
        num ? h('button', { class: 'fm-mini', text: '+1', onclick: function () { cmd('var', v.name + '.+1'); } }) : null,
        h('button', { class: 'fm-mini', text: 'défaut', title: 'Valeur de départ : ' + v.value, onclick: function () { cmd('var', v.name + '.reset'); } }),
        h('button', { class: 'fm-mini', text: 'en faire la valeur de départ', onclick: function () { v.value = val.value; changed(); toast('Valeur de départ : ' + v.value); } }),
        h('button', { class: 'fm-mini', text: '✕', onclick: function () { vars.splice(i, 1); changed(); renderTab(); } })
      ]), h('td', {}, [h('code', { text: ((S.settings && S.settings.companion.prefix) || 'gfx') + '_var_' + v.name })])]));
    });
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'Variables libres' }),
      h('p', { class: 'note' }, ['Des valeurs à vous (score, invité, sujet…), changées ici ou depuis Companion : ',
        h('code', { text: location.origin + '/api/cmd/var/score.+1' }), ' ou ', h('code', { text: '…/var/score?text=3' }), '.']),
      tb, h('div', { class: 'bar', style: 'margin-top:8px' }, [h('button', { class: 'small', text: '+ Nouvelle variable', onclick: function () {
        var n = 'variable', k = 2;
        while (vars.some(function (x) { return x.name === n; })) n = 'variable_' + k++;
        vars.push({ name: n, label: 'Nouvelle variable', value: '' });
        changed(); renderTab();
      } })])]));
    // module variables
    enabledMods().forEach(function (id) {
      var D = mod(id), rows = h('table', { class: 't' }, [h('tr', {}, ['Variable', 'Description', 'Valeur', 'Companion'].map(function (x) { return h('th', { text: x }); }))]);
      var seen = {};
      var add = function (name, label, screen) {
        var td = h('td', { class: 'val' }), val = (S.vars[id] || {})[name];
        varCells.push({ m: id, name: name, td: td });
        /* lists and numbers are for the graphics; screen-only values (clocks) aren't sent */
        var comp = screen || (val != null && typeof val !== 'string') ? h('span', { class: 'fm-unit', text: '—' }) : h('code', { text: id + '_' + name });
        rows.appendChild(h('tr', {}, [h('td', {}, [h('code', { text: '{{' + id + '.' + name + '}}', title: 'copier', style: 'cursor:pointer', onclick: function () { copy('{{' + id + '.' + name + '}}'); } })]),
          h('td', { text: label || '' }), td, h('td', {}, [comp])]));
      };
      (D.vars || []).forEach(function (v) { seen[v.name] = true; add(v.name, v.label, v.screen); });
      Object.keys(S.vars[id] || {}).forEach(function (k) { if (!seen[k] && k.charAt(0) !== '_') add(k, ''); });
      el.appendChild(h('details', { class: 'fm-sec', open: true }, [h('summary', { text: D.label }), h('div', { class: 'fm-sec-body' }, [
        h('p', { class: 'note', text: 'Valeurs calculées par le module dans une sortie ouverte (source OBS ou aperçu).' }), rows])]));
    });
    refreshVarValues();
  }
  function refreshVarValues() {
    varCells.forEach(function (c) {
      if (c.input) {
        if (document.activeElement === c.input) return;
        var v = S.live && S.live.vars ? S.live.vars[c.name] : '';
        c.input.value = v == null ? '' : v;
      } else {
        var val = (S.vars[c.m] || {})[c.name];
        c.td.textContent = val == null ? '—' : typeof val === 'object' ? JSON.stringify(val).slice(0, 120) : String(val);
      }
    });
  }

  // ===== Modules =====
  var modViews = [];
  function renderModules(el) {
    modViews = [];
    el.appendChild(h('p', { class: 'note', text: 'Un module apporte des données en direct (calcul astronomique, position ADS-B…) et des visuels (ciel, carte) aux graphiques. Activez-le, réglez-le, puis choisissez ses visuels et ses variables dans les graphiques.' }));
    if (!S.modules.length) el.appendChild(h('p', { class: 'note', text: 'Aucun module installé (dossier modules/).' }));
    S.modules.forEach(function (id) {
      var D = mod(id);
      if (!D) return;
      var entry = S.show.modules[id] = S.show.modules[id] || { enabled: false, settings: {} };
      var on = h('input', { type: 'checkbox', checked: !!entry.enabled });
      on.addEventListener('change', function () { entry.enabled = on.checked; changed(); renderTab(); });
      var card = h('div', { class: 'card' }, [h('div', { class: 'bar' }, [h('h3', { text: D.label, style: 'margin:0' }), h('span', { class: 'sp' }),
        h('label', { class: 'fm-switch' }, [on, h('span')]), h('span', { class: 'fm-unit', text: entry.enabled ? 'actif' : 'inactif' })]),
        h('p', { class: 'note', text: D.desc || '' })]);
      el.appendChild(card);
      if (!entry.enabled) return;
      var ext = GFX.panels[id];
      if (ext && ext.render) {
        var live = h('div');
        card.appendChild(live);
        var ctl = ext.render(live, moduleApi(id)) || {};
        modViews.push({ id: id, ctl: ctl });
      }
      var box = h('div');
      card.appendChild(box);
      entry.settings = entry.settings || {};
      Forms.render(box, D.settings || [], {
        get: function (k) { return U.getPath(entry.settings, k); },
        set: function (k, v) { U.setPath(entry.settings, k, v); },
        values: function () { return modSettings(id); }
      }, formEnv(null));
    });
    refreshModules();
  }
  function refreshModules() {
    modViews.forEach(function (v) { if (v.ctl.refresh) try { v.ctl.refresh(); } catch (e) { console.error(e); } });
  }
  function moduleApi(id) {
    return {
      id: id, U: U, h: h, toast: toast, copy: copy,
      cmd: function (c, text) { return cmd(id, c, text); },
      state: function () { return (S.live && S.live.modules && S.live.modules[id]) || {}; },
      vars: function () { return S.vars[id] || {}; },
      settings: function () { return modSettings(id); },
      status: function () { return api('GET', 'api/modules/' + id + '/status'); },
      tz: tz, now: now, log: function () { return (S.status && S.status.log) || []; }
    };
  }

  // ===== Projects =====
  function renderShows(el) {
    var sh = S.show;
    var title = h('input', { type: 'text', value: sh.title });
    title.addEventListener('input', function () { sh.title = title.value; $('showTitle').textContent = sh.title; changed(); });
    var tzs = ['Europe/Paris', 'Europe/London', 'Europe/Brussels', 'Europe/Zurich', 'Europe/Madrid', 'America/Montreal', 'America/New_York',
               'America/Guadeloupe', 'America/Martinique', 'America/Cayenne', 'Indian/Reunion', 'Pacific/Tahiti', 'Pacific/Noumea', 'UTC'];
    var tzSel = h('select');
    if (tzs.indexOf(sh.timezone) < 0) tzs.unshift(sh.timezone);
    tzs.forEach(function (z) { tzSel.appendChild(h('option', { value: z, text: z })); });
    tzSel.value = sh.timezone;
    tzSel.addEventListener('change', function () { sh.timezone = tzSel.value; changed(); });
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'Ce projet' }),
      h('div', { class: 'fm-row' }, [h('label', { class: 'fm-label', text: 'Titre' }), h('div', { class: 'fm-ctl' }, [title])]),
      h('div', { class: 'fm-row' }, [h('label', { class: 'fm-label', text: 'Fuseau horaire' }), h('div', { class: 'fm-ctl' }, [tzSel])]),
      h('p', { class: 'note' }, ['Fichier : ', h('code', { text: 'shows/' + S.name + '.json' }), ' — enregistré à chaque modification (version précédente en .bak).'])]));
    var tb = h('table', { class: 't' }, [h('tr', {}, ['Projet', 'Fichier', 'Modifié', ''].map(function (x) { return h('th', { text: x }); }))]);
    S.shows.forEach(function (s) {
      var acts = h('td');
      if (s.name !== S.name) acts.appendChild(h('button', { class: 'fm-mini red', text: 'Ouvrir', onclick: function () { $('showPick').value = s.name; $('showPick').dispatchEvent(new Event('change')); } }));
      else acts.appendChild(h('b', { text: 'actif ' }));
      acts.appendChild(h('button', { class: 'fm-mini', text: 'Dupliquer', onclick: function () {
        var n = prompt('Nom du nouveau projet (lettres, chiffres, _) :', s.name + '_copie');
        if (n) api('POST', 'api/shows', { action: 'duplicate', from: s.name, name: n, title: s.title + ' (copie)' }).then(function () { toast('Projet créé'); }, function (e) { toast(e.message, true); });
      } }));
      acts.appendChild(h('button', { class: 'fm-mini', text: 'Renommer', onclick: function () {
        var n = prompt('Nouveau nom de fichier :', s.name);
        if (n && n !== s.name) api('POST', 'api/shows', { action: 'rename', from: s.name, name: n }).then(function () { toast('Renommé'); }, function (e) { toast(e.message, true); });
      } }));
      acts.appendChild(h('a', { class: 'fm-mini', href: 'api/shows/' + s.name + '?download', text: ' exporter ' }));
      if (s.name !== S.name) acts.appendChild(h('button', { class: 'fm-mini', text: '✕', title: 'Supprimer', onclick: function () {
        if (confirm('Supprimer le projet « ' + s.title + ' » ? (le fichier est renommé en .deleted)'))
          api('POST', 'api/shows', { action: 'delete', name: s.name }).then(function () { toast('Supprimé'); }, function (e) { toast(e.message, true); });
      } }));
      tb.appendChild(h('tr', {}, [h('td', { text: s.title }), h('td', {}, [h('code', { text: s.name })]),
        h('td', { text: new Date(s.mtime).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) }), acts]));
    });
    var nn = h('input', { type: 'text', placeholder: 'nom_du_fichier' }), nt = h('input', { type: 'text', placeholder: 'Titre du projet' });
    var from = h('select');
    from.appendChild(h('option', { value: '', text: 'vide' }));
    S.shows.forEach(function (s) { from.appendChild(h('option', { value: s.name, text: 'copie de « ' + s.title + ' »' })); });
    var imp = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    imp.addEventListener('change', function () {
      var file = imp.files[0];
      if (!file) return;
      file.text().then(function (txt) {
        var cfg = JSON.parse(txt), n = prompt('Nom du projet importé :', U.slug(file.name.replace(/\.json$/i, '')));
        if (!n) return;
        return api('POST', 'api/shows', { action: 'import', name: n, config: cfg }).then(function () { toast('Projet importé'); });
      }).catch(function (e) { toast('Import impossible : ' + e.message, true); });
    });
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'Projets' }), tb,
      h('div', { class: 'bar', style: 'margin-top:10px' }, [nn, nt, from, h('button', { class: 'small red', text: 'Créer', onclick: function () {
        if (!U.slug(nn.value)) return toast('Donnez un nom de fichier', true);
        api('POST', 'api/shows', { action: from.value ? 'duplicate' : 'create', from: from.value, name: nn.value, title: nt.value || nn.value })
          .then(function () { toast('Projet créé : ouvrez-le dans la liste'); }, function (e) { toast(e.message, true); });
      } }), h('button', { class: 'small', text: 'Importer un fichier…', onclick: function () { imp.click(); } }), imp])]));
  }

  // ===== Settings =====
  var setRefs = {};
  function renderSettings(el) {
    var base = location.origin + '/overlay.html';
    var urls = h('table', { class: 't' }, [h('tr', {}, [h('th', { text: 'Source navigateur' }), h('th', { text: 'URL' }), h('th')])]);
    var addUrl = function (label, url) {
      urls.appendChild(h('tr', {}, [h('td', { text: label }), h('td', {}, [h('code', { text: url })]), h('td', {}, [h('button', { class: 'fm-mini', text: 'copier', onclick: function () { copy(url); } })])]));
    };
    addUrl('Tous les graphiques', base);
    S.show.graphics.forEach(function (g) { addUrl(g.name, base + '?only=' + g.id); });
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'Sorties OBS' }),
      h('p', { class: 'note', text: 'Dans OBS : Source → Navigateur, 1920 × 1080, l\'URL ci-dessous. Une source pour tout, ou une par graphique pour les placer dans des scènes différentes. Les graphiques entrent avec leur animation quand la scène passe à l\'antenne (?noautoanim pour l\'empêcher).' }),
      urls, h('div', { class: 'bar', style: 'margin-top:8px' }, [h('button', { class: 'small', text: 'Recharger toutes les sorties', onclick: function () { cmd('all', 'reload'); } })])]));
    var st = S.settings || { obs: {}, companion: {} };
    var oe = h('input', { type: 'checkbox', checked: !!st.obs.enabled }), oh = h('input', { type: 'text', value: st.obs.host || '127.0.0.1' });
    var op = h('input', { type: 'number', value: st.obs.port || 4455 }), opw = h('input', { type: 'password', value: st.obs.password || '', placeholder: 'mot de passe' });
    setRefs.obs = h('span', { class: 'fm-out' });
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'OBS websocket' }),
      h('p', { class: 'note', text: 'Pour les boutons Companion « OBS → Broadcast Custom Event » : {"gfx": "bandeau:air.toggle"}, ou les anciens {"eclipse": "…"} et {"a350f": "…"}. Le serveur écoute OBS une seule fois pour toutes les sorties.' }),
      h('div', { class: 'row' }, [h('label', { class: 'fm-switch' }, [oe, h('span')]), h('span', { text: 'activer' }), oh, op, opw,
        h('button', { class: 'small red', text: 'Enregistrer', onclick: function () {
          api('PUT', 'api/settings', { obs: { enabled: oe.checked, host: oh.value, port: +op.value, password: opw.value } }).then(function () { toast('Lien OBS enregistré'); }, function (e) { toast(e.message, true); });
        } }), setRefs.obs])]));
    var ce = h('input', { type: 'checkbox', checked: !!st.companion.enabled }), ch = h('input', { type: 'text', value: st.companion.host || '127.0.0.1:8000' });
    var cp = h('input', { type: 'text', value: st.companion.prefix || 'gfx', style: 'width:90px' });
    setRefs.comp = h('span', { class: 'fm-out' });
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'Companion' }),
      h('p', { class: 'note', text: 'Le serveur pousse l\'état dans des variables personnalisées de Companion (à créer dans Companion) : <préfixe>_<graphique>_air, les variables libres, et celles des modules (eclipse_*, a350f_*… comme avant).' }),
      h('div', { class: 'row' }, [h('label', { class: 'fm-switch' }, [ce, h('span')]), h('span', { text: 'activer' }), ch, h('span', { class: 'fm-unit', text: 'préfixe' }), cp,
        h('button', { class: 'small red', text: 'Enregistrer et tout renvoyer', onclick: function () {
          api('PUT', 'api/settings', { companion: { enabled: ce.checked, host: ch.value, prefix: cp.value } }).then(function () { toast('Companion enregistré'); }, function (e) { toast(e.message, true); });
        } }), setRefs.comp])]));
    // media
    var mt = h('table', { class: 't' }, [h('tr', {}, ['', 'Fichier', 'Type', 'Taille', ''].map(function (x) { return h('th', { text: x }); }))]);
    S.media.forEach(function (m) {
      mt.appendChild(h('tr', {}, [h('td', {}, [m.kind === 'image' ? h('img', { src: m.url, style: 'height:28px;max-width:80px;object-fit:contain', alt: '' }) : null]),
        h('td', {}, [h('code', { text: m.name })]), h('td', { text: { image: 'image', font: 'police', video: 'vidéo' }[m.kind] }),
        h('td', { text: (m.size / 1024).toFixed(0) + ' Kio' }),
        h('td', {}, [h('button', { class: 'fm-mini', text: '✕', onclick: function () {
          if (confirm('Supprimer ' + m.name + ' ?')) api('DELETE', 'api/media/' + encodeURIComponent(m.name)).then(function () { toast('Supprimé'); }, function (e) { toast(e.message, true); });
        } })])]));
    });
    var mf = h('input', { type: 'file', multiple: true, hidden: true });
    mf.addEventListener('change', function () { [].forEach.call(mf.files, function (f) { upload(f); }); });
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'Médias' }), h('p', { class: 'note', text: 'Images (logos, fonds), vidéos (fonds en boucle, webm conseillé) et polices, dans le dossier media/.' }),
      mt, h('div', { class: 'bar', style: 'margin-top:8px' }, [h('button', { class: 'small', text: 'Importer des fichiers…', onclick: function () { mf.click(); } }), mf])]));
    setRefs.server = h('div');
    setRefs.log = h('pre', { class: 'log' });
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'Serveur' }), setRefs.server, setRefs.log]));
    refreshSettings();
  }
  function refreshSettings() {
    var s = S.status;
    if (!s || !setRefs.server) return;
    if (setRefs.obs) setRefs.obs.textContent = 'état : ' + (s.obs.state || '—') + (s.obs.error ? ' (' + s.obs.error + ')' : '');
    if (setRefs.comp) setRefs.comp.textContent = 'état : ' + (s.companion.state || '—') + ' · ' + (s.companion.sent || 0) + ' envois' + (s.companion.error ? ' (' + s.companion.error + ')' : '');
    var outs = s.clients.filter(function (c) { return c.role === 'output'; });
    setRefs.server.innerHTML = '';
    setRefs.server.appendChild(h('p', { class: 'note', text: 'Version ' + s.version + ' · démarré ' + new Date(s.boot).toLocaleString('fr-FR') + ' · ' +
      outs.length + ' sortie' + (outs.length > 1 ? 's' : '') + ' connectée' + (outs.length > 1 ? 's' : '') + ' · ' +
      (s.clients.length - outs.length) + ' régie' + (s.clients.length - outs.length > 1 ? 's' : '') +
      (Object.keys(s.leaders || {}).length ? ' · modules calculés par : ' + Object.keys(s.leaders).map(function (m) { return m + ' → ' + s.leaders[m]; }).join(', ') : '') }));
    setRefs.log.innerHTML = '';
    s.log.slice().reverse().forEach(function (l, i) {
      if (i) setRefs.log.appendChild(document.createTextNode('\n'));
      setRefs.log.appendChild(h('span', { class: l.level === 'warn' ? 'w' : '', text: new Date(l.at).toLocaleTimeString('fr-FR') + '  ' + l.text }));
    });
  }

  $('outLink').href = 'overlay.html';
  connect();
})();
