/* The output page (overlay.html, the OBS browser source, 1920×1080).

   It renders whatever the server's live state says: which graphics are on
   air, in which layout, with which texts. Nothing is decided here that
   another source could disagree with — every browser source of the show
   shows the same thing, and a refreshed source comes back as it was.

   URL
     ?only=id,id    only these graphics (one OBS source per graphic, to put
                    them in different scenes); ?except=id,id: all but these
     ?noautoanim    ignore the OBS source's own visibility (see below)
     ?force=id      show this graphic even off air (the panel's preview)

   OBS visibility: by default the graphics park the moment OBS hides the
   source and replay their entrance when it shows it again, so cutting to a
   scene brings them in with their animation — as the eclipse and A350F
   overlays did. ?noautoanim leaves them to the commands alone.

   Modules (modules/<id>/) run here: they compute their variables (the
   A350F's altitude, the eclipse's obscuration…) and draw their visuals
   (map, sky) in the bandeau's slots. One output page per module reports its
   variables to the server (the leader), for Companion and the panel. */
(function () {
  'use strict';
  var U = window.GFXShared, M = window.GFXMotion, T = window.GFXTheme, GFX = window.GFX;
  var Q = new URLSearchParams(location.search);
  var list = function (k) { return (Q.get(k) || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); };
  var ONLY = list('only'), EXCEPT = list('except');
  var FORCE = Q.get('force') || '';
  var AUTO = !Q.has('noautoanim');
  var PREVIEW = Q.has('preview');
  var CID = (PREVIEW ? 'pv-' : 'out-') + Math.random().toString(36).slice(2, 10);
  var stage = document.getElementById('stage');

  var S = {
    name: '', show: null, rev: -1, live: null, vars: {}, local: {}, media: [], offset: 0,
    G: {},            /* graphic id → { id, type, conf, fields, root, inst, onAir, anim, … } */
    mods: {},         /* module id → { id, D, api, inst } */
    leader: [], ready: !window.obsstudio || !AUTO, visible: true,
    modTypes: {}      /* graphic type a module brings → its module id */
  };
  /* The server's clock: timers started from the panel (a module's
     stopwatch…) read the same on every machine */
  function now() { return Date.now() + S.offset; }
  function tz() { return (S.show && S.show.timezone) || 'Europe/Paris'; }

  // ===== Variables =====
  /* {{clock}} {{clock.hm}} {{date}} {{day}} {{show}} · {{var.<name>}} (the
     free variables) · {{<module>.<name>}} (this page's module if it runs
     here, else what the leader reported) */
  function getRaw(name) {
    if (!name) return undefined;
    switch (name) {
      case 'clock': return U.hms(now(), tz());
      case 'clock.hm': return U.hm(now(), tz());
      case 'date': return U.longDate(now(), tz());
      case 'date.short': return U.shortDate(now(), tz());
      case 'day': return U.weekday(now(), tz());
      case 'show': return S.show ? S.show.title : '';
    }
    var dot = name.indexOf('.');
    if (dot < 0) return undefined;
    var m = name.slice(0, dot), k = name.slice(dot + 1);
    if (m === 'var') return S.live && S.live.vars ? S.live.vars[k] : undefined;
    if (S.local[m] && k in S.local[m]) return S.local[m][k];
    return S.vars[m] ? S.vars[m][k] : undefined;
  }
  function render(str) { return U.render(str, getRaw); }

  // ===== Server =====
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function command(target, cmd, text) {
    return post('api/cmd?from=output', { target: target || '', cmd: cmd, text: text }).catch(function () {});
  }
  window.gfx = command;
  /* The old overlays' entry points (OBS "Interact", a console) still work */
  window.eclipseCommand = function (cmd) { return command('eclipse', cmd); };
  window.a350fCommand = function (cmd, data) { return command('a350f', cmd, data && data.text); };

  var es;
  function connect() {
    es = new EventSource('api/events?role=output&id=' + CID + (ONLY.length ? '&only=' + encodeURIComponent(ONLY.join(',')) : ''));
    es.addEventListener('hello', function (e) {
      var d = JSON.parse(e.data);
      S.offset = d.serverTime - Date.now();
      S.modTypes = d.modTypes || {};
      S.media = d.media || [];
      S.vars = d.vars || {};
      S.live = d.live;
      applyShow(d.show, true);
    });
    es.addEventListener('show', function (e) { applyShow(JSON.parse(e.data)); });
    es.addEventListener('live', function (e) { S.live = JSON.parse(e.data).live; applyLive(); });
    es.addEventListener('vars', function (e) {
      var d = JSON.parse(e.data);
      if (d.reset) { S.vars = {}; return; }
      S.vars[d.m] = Object.assign(S.vars[d.m] || {}, d.v);
    });
    es.addEventListener('leader', function (e) { S.leader = JSON.parse(e.data).modules || []; flushVars(true); });
    es.addEventListener('media', function (e) { S.media = JSON.parse(e.data).media || []; T.useUploaded(S.media); });
    es.addEventListener('module', function (e) {
      var d = JSON.parse(e.data), mod = S.mods[d.m];
      if (mod && mod.inst && mod.inst.onCommand) try { mod.inst.onCommand(d.cmd, d.text); } catch (err) { console.error(err); }
    });
    es.addEventListener('reload', function () { location.reload(); });
  }

  // ===== Show → graphics =====
  function shown(g) {
    if (ONLY.length && ONLY.indexOf(g.id) < 0) return false;
    return EXCEPT.indexOf(g.id) < 0;
  }
  function applyShow(sh, first) {
    if (!first && sh.rev === S.rev && !sh.switched) return;
    var switched = sh.name !== S.name && S.name !== '';
    S.name = sh.name; S.show = sh.config; S.rev = sh.rev;
    T.apply(S.show.theme, document.documentElement);
    T.useUploaded(S.media);
    if (switched) for (var id in S.G) destroyGraphic(S.G[id]);
    ensureModules().then(function () { syncGraphics(); });
    syncGraphics();
  }
  function motionCfg(G) { return M.config(S.show && S.show.motion, G.conf.motion); }

  function syncGraphics() {
    if (!S.show) return;
    var seen = {};
    S.show.graphics.forEach(function (g, i) {
      if (!shown(g) || !GFX.types[g.type]) return;
      /* a module's own graphic only while the module runs (its data with it) */
      if (S.modTypes[g.type] && !S.mods[S.modTypes[g.type]]) return;
      seen[g.id] = true;
      var G = S.G[g.id], key = JSON.stringify(g);
      if (G && G.type !== g.type) { destroyGraphic(G); G = null; }
      if (!G) G = createGraphic(g);
      else if (G.key !== key || G.modsKey !== modsKey()) {
        G.conf = g;
        G.fields = U.withDefaults(U.clone(g.fields), GFX.types[g.type].defaults);
        try { G.inst.update(G.fields); } catch (e) { console.error(g.id, e); }
      }
      G.key = key; G.modsKey = modsKey();
      G.root.style.zIndex = String(10 + i);
    });
    for (var id in S.G) if (!seen[id]) destroyGraphic(S.G[id]);
    anchorFlashes();
    applyLive();
  }
  function modsKey() { return Object.keys(S.mods).sort().join(','); }

  function createGraphic(g) {
    var def = GFX.types[g.type];
    var root = GFX.el('div', 'gfx gfx-' + g.type, stage);
    root.dataset.gid = g.id;
    root.dataset.air = 'off';
    root.style.visibility = 'hidden';
    var G = { id: g.id, type: g.type, conf: g, fields: U.withDefaults(U.clone(g.fields), def.defaults), root: root,
              onAir: false, anim: null, lastLive: {} };
    var ctx = {
      id: g.id, root: root, stage: stage, tz: tz, now: now, render: render, get: getRaw,
      conf: function () { return G.conf; },
      fields: function () { return G.fields; },
      live: function () { return (S.live && S.live.graphics[g.id]) || {}; },
      flash: function () { return (S.live && S.live.flash && S.live.flash[g.id]) || {}; },
      onAir: function () { return G.onAir; },
      motion: function () { return motionCfg(G); },
      vt: function (name) { return 'vt-' + g.id + '-' + name; },
      cmd: function (cmd, text) { return command(g.id, cmd, text); },
      visual: function (src, el, host) { return mountVisual(src, el, host, G); },
      column: function (src, el, host) { return mountVisual(src, el, host, G, true); },
      /* A layout change while on air: the View Transitions API tweens each
         named block from its old box to its new one (Chromium 111+ / recent
         OBS); without it, the entrance replays in the new layout. */
      morph: function (change) {
        var cfg = motionCfg(G);
        if (!G.onAir || !S.visible || !(cfg.morph > 0)) { change(); return; }
        if (document.startViewTransition) {
          document.documentElement.style.setProperty('--vt-dur', cfg.morph.toFixed(3) + 's');
          document.startViewTransition(change);
        } else {
          change();
          if (G.anim) G.anim.cancel();
          G.anim = M.play(G.inst.parts(), 'in', cfg);
        }
      },
      /* Content changing while on air (a new name in the synthé…): out, swap, in */
      swap: function (apply) {
        if (!G.onAir) { apply(); return; }
        var cfg = motionCfg(G);
        if (G.anim) G.anim.cancel();
        var h = G.anim = M.play(G.inst.parts(), 'out', cfg);
        h.finished.then(function () {
          if (G.anim !== h) return;
          apply();
          h.cancel();
          G.anim = M.play(G.inst.parts(), 'in', cfg);
        });
      }
    };
    G.ctx = ctx;
    try { G.inst = def.create(ctx, G.fields); } catch (e) {
      console.error('graphic ' + g.id, e);
      G.inst = { parts: function () { return []; }, update: function () {} };
    }
    S.G[g.id] = G;
    return G;
  }
  function destroyGraphic(G) {
    if (G.anim) G.anim.cancel();
    try { if (G.inst.destroy) G.inst.destroy(); } catch (e) { /* going anyway */ }
    G.root.remove();
    delete S.G[G.id];
  }
  /* A flash glued to a bandeau lives inside it (above its strap, or under
     the caption in fullscreen), so it follows every layout and morph */
  function anchorFlashes() {
    for (var id in S.G) {
      var G = S.G[id];
      if (G.type !== 'flash') continue;
      var a = /^bandeau:(\w+)$/.exec(G.fields.anchor || ''), host = a && S.G[a[1]];
      var slot = host && host.inst.slot && host.inst.slot('flash');
      var parent = slot || stage;
      if (G.root.parentNode !== parent) parent.appendChild(G.root);
      G.anchor = slot ? host : null;
      G.root.classList.toggle('anchored', !!slot);
    }
  }

  // ===== Live state → on air =====
  function wanted(G, L) {
    if (!S.ready || !S.visible) return false;
    if (G.type === 'flash') {
      var F = (S.live.flash || {})[G.id] || {};
      if (!L.air || !F.current || now() >= F.current.until) return false;
      if (G.anchor && !G.anchor.onAir) return false;
      return true;
    }
    return !!L.air || FORCE === G.id;
  }
  function applyLive() {
    if (!S.live || !S.show) return;
    for (var id in S.G) {
      var G = S.G[id], L = S.live.graphics[id] || {};
      if (G.inst.setLive) try { G.inst.setLive(L, G.lastLive); } catch (e) { console.error(id, e); }
      G.lastLive = U.clone(L);
    }
    /* flashes after their anchors, which may just have come on */
    var ids = Object.keys(S.G).sort(function (a, b) { return (S.G[a].type === 'flash') - (S.G[b].type === 'flash'); });
    ids.forEach(function (id) {
      var G = S.G[id], L = S.live.graphics[id] || {};
      var want = wanted(G, L);
      if (G.type === 'flash') {
        var cur = ((S.live.flash || {})[id] || {}).current;
        if (want && G.onAir && G.itemId !== cur.id) { swapFlash(G, cur); return; }
        if (want && !G.onAir) { G.itemId = cur.id; G.inst.item(cur); }
      }
      if (want && !G.onAir) playIn(G);
      else if (!want && G.onAir) playOut(G);
    });
  }
  function swapFlash(G, item) {
    G.itemId = item.id;
    var cfg = motionCfg(G);
    if (G.anim) G.anim.cancel();
    var h = G.anim = M.play(G.inst.parts(), 'out', cfg);
    h.finished.then(function () {
      if (G.anim !== h) return;
      G.inst.item(item);
      h.cancel();
      G.anim = M.play(G.inst.parts(), 'in', cfg);
    });
  }
  function playIn(G) {
    G.onAir = true;
    var prev = G.anim;
    if (prev && prev.dir === 'out' && prev.running()) {
      /* taken back on while leaving: turn round from where it is */
      G.root.dataset.air = 'on';
      prev.reverse().finished.then(function () { if (G.anim === prev) prev.cancel(); });
      return;
    }
    if (prev) prev.cancel();
    G.root.dataset.air = 'on';
    if (G.inst.onIn) try { G.inst.onIn(); } catch (e) { console.error(e); }
    var h = G.anim = M.play(G.inst.parts(), 'in', motionCfg(G));
    G.root.style.visibility = '';
    h.finished.then(function () { if (G.anim === h && h.dir === 'in') h.cancel(); });
  }
  function park(G) {
    G.root.style.visibility = 'hidden';
    G.root.dataset.air = 'off';
    if (G.anim) { G.anim.cancel(); G.anim = null; }
    if (G.inst.onOut) try { G.inst.onOut(); } catch (e) { console.error(e); }
  }
  function playOut(G) {
    G.onAir = false;
    var prev = G.anim;
    G.root.dataset.air = 'out';
    if (prev && prev.dir === 'in' && prev.running()) {
      prev.reverse().finished.then(function () { if (G.anim === prev && !G.onAir) park(G); });
      return;
    }
    if (prev) prev.cancel();
    var h = G.anim = M.play(G.inst.parts(), 'out', motionCfg(G));
    h.finished.then(function () { if (G.anim === h && !G.onAir) park(G); });
  }

  // ===== OBS source visibility =====
  if (window.obsstudio && AUTO) {
    window.addEventListener('obsSourceVisibleChanged', function (e) {
      S.ready = true;
      S.visible = !!(e.detail && e.detail.visible);
      if (!S.visible) for (var id in S.G) { S.G[id].onAir = false; park(S.G[id]); }
      applyLive();
    });
    /* loaded while already visible (no event comes): come in shortly after */
    window.addEventListener('load', function () {
      setTimeout(function () { if (!S.ready) { S.ready = true; applyLive(); } }, 400);
    });
  }

  // ===== Ticks: texts and timers, 10 per second (rolling figures) =====
  setInterval(function () {
    var t = now();
    for (var id in S.G) {
      var G = S.G[id];
      if (G.inst.tick && (G.onAir || G.root.dataset.air !== 'off' || FORCE === id)) {
        try { G.inst.tick(t); } catch (e) { console.error(id, e); }
      }
    }
    // a flash whose time is up leaves even if the server's word is late
    for (var fid in S.G) if (S.G[fid].type === 'flash' && S.G[fid].onAir && S.live) {
      var F = (S.live.flash || {})[fid] || {};
      if (!F.current || t >= F.current.until) applyLive();
    }
  }, 100);

  // ===== Modules =====
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve; s.onerror = function () { reject(new Error('chargement impossible : ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadCSS(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }
  function modUrl(id, f) { return /^(\/|https?:)/.test(f) ? f.replace(/^\//, '') : 'modules/' + id + '/' + f; }
  function wantedModules() {
    if (!S.show) return [];
    var ids = Object.keys(S.show.modules || {}).filter(function (id) {
      var m = S.show.modules[id];
      return m && m.enabled && S.show.modules.hasOwnProperty(id);
    });
    if (!ONLY.length && !EXCEPT.length) return ids;
    /* a page showing some graphics only runs the modules they use */
    var mine = S.show.graphics.filter(shown), used = JSON.stringify(mine);
    return ids.filter(function (id) {
      return used.indexOf('module:' + id + '.') >= 0 || used.indexOf('{{' + id + '.') >= 0 ||
        mine.some(function (g) { return S.modTypes[g.type] === id; });
    });
  }
  var loading = null;
  function ensureModules() {
    if (loading) return loading.then(ensureModules);
    var want = wantedModules();
    var todo = want.filter(function (id) { return !S.mods[id]; });
    for (var id in S.mods) if (want.indexOf(id) < 0) stopModule(id);
    for (var k in S.mods) if (S.mods[k].inst && S.mods[k].inst.onSettings) {
      try { S.mods[k].inst.onSettings(settingsOf(k)); } catch (e) { console.error(k, e); }
    }
    if (!todo.length) { register(); return Promise.resolve(); }
    loading = todo.reduce(function (p, id) {
      return p.then(function () { return startModule(id); }).catch(function (e) { console.error('module ' + id, e); });
    }, Promise.resolve()).then(function () { loading = null; register(); syncGraphics(); });
    return loading;
  }
  function register() {
    post('api/client', { id: CID, modules: Object.keys(S.mods) }).then(function (j) {
      if (j && j.leader) { S.leader = j.leader; flushVars(true); }
    }).catch(function () { setTimeout(register, 2000); });
  }
  function settingsOf(id) {
    var D = window.GFXModules && window.GFXModules[id];
    var m = (S.show.modules || {})[id] || {};
    return U.withDefaults(U.clone(m.settings || {}), D ? U.schemaDefaults(D.settings) : {});
  }
  /* module.js, its stylesheets, the graphic types it brings (graphics:
     { type: file }), then its client scripts — a module that only feeds
     variables from the server may have none */
  function startModule(id) {
    return loadScript('modules/' + id + '/module.js').then(function () {
      var D = window.GFXModules[id];
      (D.css || []).forEach(function (c) { loadCSS(modUrl(id, c)); });
      var files = Object.keys(D.graphics || {}).map(function (t) { return D.graphics[t]; }).concat(D.client || []);
      return files.reduce(function (p, f) { return p.then(function () { return loadScript(modUrl(id, f)); }); }, Promise.resolve())
        .then(function () {
          var factory = GFX.clients[id];
          if (!factory && (D.client || []).length) throw new Error('module ' + id + ' : pas de client');
          S.local[id] = {};
          var mod = S.mods[id] = { id: id, D: D };
          mod.api = moduleApi(id, D);
          mod.inst = (factory && factory(mod.api)) || {};
        });
    });
  }
  function stopModule(id) {
    var mod = S.mods[id];
    try { if (mod.inst.destroy) mod.inst.destroy(); } catch (e) { /* stopping anyway */ }
    delete S.mods[id];
    delete S.local[id];
  }
  var pendingVars = {};
  function flushVars(all) {
    S.leader.forEach(function (m) {
      var v = all ? S.local[m] : pendingVars[m];
      if (!v || !Object.keys(v).length) return;
      pendingVars[m] = {};
      post('api/vars', { id: CID, m: m, v: v }).then(function (j) {
        if (j && j.leader === false) S.leader = S.leader.filter(function (x) { return x !== m; });
      }).catch(function () {});
    });
  }
  setInterval(function () { flushVars(false); }, 250);
  /* What a module's client can do (see modules/eclipse/client.js) */
  function moduleApi(id, D) {
    return {
      id: id, U: U, D: D,
      settings: function () { return settingsOf(id); },
      state: function () { return (S.live && S.live.modules && S.live.modules[id]) || {}; },
      tz: tz, now: now, get: getRaw, render: render,
      set: function (name, value) {
        var cur = S.local[id][name];
        if (cur === value || (typeof value === 'object' && JSON.stringify(cur) === JSON.stringify(value))) return;
        S.local[id][name] = value;
        (pendingVars[id] = pendingVars[id] || {})[name] = value;
      },
      setAll: function (o) { for (var k in o) this.set(k, o[k]); },
      leader: function () { return S.leader.indexOf(id) >= 0; },
      /* A banner for the module's flash (only the leader's count) */
      flash: function (item, front) {
        if (S.leader.indexOf(id) < 0) return Promise.resolve(false);
        return post('api/flash', { id: CID, m: id, item: item, front: !!front }).catch(function () {});
      },
      cmd: function (cmd, text) { return command(id, cmd, text); },
      /* the graphics in this page that show one of this module's visuals */
      graphics: function () {
        var out = [];
        for (var gid in S.G) if (JSON.stringify(S.G[gid].conf.fields).indexOf('module:' + id + '.') >= 0) out.push(S.G[gid]);
        return out;
      },
      live: function (gid) { return (S.live && S.live.graphics[gid]) || {}; },
      preview: PREVIEW
    };
  }
  /* A module's visual (map, sky…) or column (flight data, recap) in a slot of
     a graphic. src: "module:<id>.<name>". → the visual's controller, or null
     while the module isn't loaded (the graphic asks again once it is). */
  function mountVisual(src, el, host, G, column) {
    var m = /^module:(\w+)\.(\w+)$/.exec(src || '');
    if (!m || !S.mods[m[1]]) return null;
    var inst = S.mods[m[1]].inst, fn = column ? inst.column : inst.visual;
    if (!fn) return null;
    host = Object.assign({
      gid: G.id, root: G.root, onAir: function () { return G.onAir; },
      live: function () { return (S.live && S.live.graphics[G.id]) || {}; },
      vt: function (n) { return 'vt-' + G.id + '-' + m[2] + '-' + n; }
    }, host || {});
    try { return fn.call(inst, m[2], el, host) || null; } catch (e) { console.error(src, e); return null; }
  }

  // ===== Preview (the panel's iframe) and keys =====
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.gfxPreview != null) { FORCE = String(e.data.gfxPreview || ''); applyLive(); }
    var R = e.data.gfxReplay && S.G[e.data.gfxReplay];
    if (R && R.onAir) {
      /* the panel's "replay": the entrance again, from the start */
      if (R.anim) R.anim.cancel();
      var h = R.anim = M.play(R.inst.parts(), 'in', motionCfg(R));
      h.finished.then(function () { if (R.anim === h) h.cancel(); });
    }
  });
  if (!PREVIEW) {
    /* OBS "Interact" or a preview window: R the corner card, S swap the
       views, F follow / frame (the A350F map), on the first bandeau */
    window.addEventListener('keydown', function (e) {
      var k = (e.key || '').toLowerCase(), b = null;
      for (var id in S.G) if (S.G[id].type === 'bandeau') { b = id; break; }
      if (!b) return;
      if (k === 'r') command(b, 'card.toggle');
      if (k === 's') command(b, 'main.toggle');
      if (k === 'f') command(b, 'map.toggle');
    });
  }
  window.GFXOutput = { S: S, command: command, render: render };
  connect();
})();
