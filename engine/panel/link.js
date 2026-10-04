/* The link between the bundle's pages and its extension, through NodeCG —
   shared by the Régie, « À l'antenne », the modules' panels and the
   dialogs:

     msg(name, data)        a message to the extension → its answer (refused:
                            an error whose body is the answer)
     connect(names)         the extension's Replicants, all read → R
     Editor({ by, … })      the show as this page edits it, sent as what
                            changed (show:patch), others' edits rebased in
     ask({ text, input })   NodeCG's dialog « Confirmer » (window.confirm or
                            prompt outside the dashboard)
     settingsDialog(id)     NodeCG's dialog « Réglages du module »
     upload(file) · removeMedia(m)   the media library (NodeCG's assets)
     loadModules(ids, { panels })    the modules' files for this page
     formEnv(ctx) · moduleApi(id, ctx)   what the forms and the modules'
                            panel parts are given

   window.GFXLink. Needs GFXShared, GFX, Forms and NodeCG's window.nodecg. */
(function () {
  'use strict';
  var U = window.GFXShared, T = window.GFXTheme, M = window.GFXMotion, GFX = window.GFX;
  var ncg = window.nodecg;

  // ===== Messages, addresses =====
  function msg(name, data) {
    return ncg.sendMessage(name, data).then(function (j) {
      j = j || {};
      if (j.ok === false) { var e = new Error(j.error || 'refusé'); e.body = j; throw e; }
      return j;
    });
  }
  /* an address of the bundle, whole (for Companion, OBS): the pages' base
     is the bundle's folder, /bundles/<bundle>/ */
  function abs(path) { return new URL(path, document.baseURI).href; }
  /* with NodeCG's login on, an address given to Companion needs the user's key */
  function loginNote() {
    var c = ncg.config || {};
    return c.login && c.login.enabled ? ' Connexion NodeCG active : ajoutez ?key=<votre clé> aux adresses.' : '';
  }

  // ===== Replicants =====
  /* the extension's Replicants (read only here: every change goes through a
     message) → { R, ready: a promise, once they all have their value } */
  function connect(names) {
    var R = {};
    names.forEach(function (n) { R[n] = ncg.Replicant(n); });
    if (R.soundCues) cuesRep = R.soundCues;
    return { R: R, ready: NodeCG.waitForReplicants.apply(NodeCG, names.map(function (n) { return R[n]; })) };
  }
  /* a page says hello: the extension counts the Régies, and gives its clock */
  function hello(id, role, onClock) {
    function send() {
      var t0 = Date.now();
      msg('client', { id: id, role: role, socket: ncg.socket ? ncg.socket.id : '', ua: navigator.userAgent.slice(0, 120) })
        .then(function (j) { if (onClock) onClock(j.now - (t0 + Date.now()) / 2); }).catch(function () { /* the next one */ });
    }
    send();
    if (ncg.socket && ncg.socket.on) ncg.socket.on('connect', send);
    setInterval(send, 10000);
  }

  // ===== Toasts =====
  var toastTimer = 0;
  function toast(text, err) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text;
    t.className = 'show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, err ? 4000 : 2000);
  }
  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Copié : ' + text); },
      function () { window.prompt('Copier :', text); });
  }

  // ===== NodeCG's dialogs =====
  /* A dialog of the bundle, open, its page ready → its window (null outside
     the dashboard: a panel on its own, the Régie as an OBS dock) */
  function openDialog(name, ready) {
    var d = ncg.getDialog && ncg.getDialog(name);
    if (!d) return Promise.resolve(null);
    d.open();
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function wait() {
        var f = d.querySelector('iframe'), w = f && f.contentWindow;
        if (w && w[ready]) return resolve({ dialog: d, win: w });
        if (Date.now() - t0 > 8000) return resolve(null);
        setTimeout(wait, 50);
      })();
    });
  }
  /* A question → true / false (a confirmation), or the text typed / null
     (opts.input: the field's first value). opts: { text, ok (what OK does),
     input, placeholder } */
  function ask(opts) {
    opts = typeof opts === 'string' ? { text: opts } : opts;
    return openDialog('demande', 'GFXDemande').then(function (x) {
      if (!x) {
        if (opts.input != null) return window.prompt(opts.text, opts.input);
        return window.confirm(opts.text);
      }
      return x.win.GFXDemande.ask(opts);
    });
  }
  /* A module's settings, in their dialog */
  function settingsDialog(id) {
    return openDialog('reglages', 'GFXReglages').then(function (x) {
      if (x) x.win.GFXReglages.edit(id);
      return !!x;
    });
  }

  // ===== The show, as this page edits it =====
  /* The forms change E.show in place and call E.changed(); 250 ms later the
     changes go to the extension as operations (show:patch, see U.diff),
     applied to the show as it is there. The extension answers with the show
     as it now is: edits made in the meantime stay on top of it. Another
     page's changes come in the same way (E.remote, the show Replicant's
     listener), and o.onRemote(ops) tells the page — or onRemote('load'): a
     show opened. « Annuler » takes back this page's own edits, a burst of
     typing at a time. o: { by, toast, onRemote(r), onUndoState(can) } */
  function Editor(o) {
    var E = { show: null, name: '', rev: -1 };
    var base = null;        /* the show as the extension last said, JSON */
    var sending = null;     /* the version on its way, JSON */
    var timer = 0, again = false, noRecord = false;
    var bursts = [], lastChange = 0;
    function undoState() { if (o.onUndoState) o.onUndoState(bursts.some(function (b) { return b.list.length; })); }
    /* a show opened (or another): what this page had is dropped */
    E.load = function (d) {
      clearTimeout(timer);
      E.name = d.name; E.rev = d.rev; base = JSON.stringify(d.config); sending = null;
      E.show = U.clone(d.config);
      bursts = []; undoState();
    };
    E.dirty = function () { return !!E.show && (sending != null || base !== JSON.stringify(E.show)); };
    E.changed = function () {
      var t = Date.now();
      if (!bursts.length || t - lastChange > 1200) { bursts.push({ list: [], paths: {} }); if (bursts.length > 60) bursts.shift(); }
      lastChange = t;
      clearTimeout(timer);
      timer = setTimeout(E.save, 250);
    };
    /* the ops' way back, in the burst they belong to (the first per path:
       the value from before the burst) */
    function record(b, ops) {
      var bu = bursts[bursts.length - 1];
      if (!bu) return;
      ops.forEach(function (op) {
        if (bu.paths[op.path]) return;
        bu.paths[op.path] = true;
        bu.list.push(U.inverseOp(b, op));
      });
      undoState();
    }
    E.save = function () {
      clearTimeout(timer);
      if (!E.show) return;
      if (sending != null) { again = true; return; }
      var b = JSON.parse(base), ops = U.diff(b, E.show);
      if (!ops.length) return;
      if (!noRecord) record(b, ops);
      noRecord = false;
      sending = JSON.stringify(E.show);
      msg('show:patch', { ops: ops, by: o.by }).then(function (j) {
        var mine = JSON.parse(sending);
        sending = null;
        /* the answer can bring another page's edit before its Replicant does */
        if (j.config) tell(rebase(j.config, j.rev, mine));
      }, function (e) {
        sending = null;
        if (o.toast) o.toast('Enregistrement impossible : ' + e.message, true);
      }).then(function () { if (again) { again = false; E.save(); } });
    };
    /* the show as the extension has it (after this page's edits `mine` were
       sent): its changes applied in place — the forms keep their objects —
       and this page's newer edits on top. → the ops that came from elsewhere
       and change something here (this page's own edits coming back don't) */
    function rebase(config, rev, mine) {
      if (rev < E.rev) return [];
      var pending = U.diff(mine, E.show), remote = U.diff(mine, config);
      var news = remote.filter(function (op) {
        var v = U.getPath(E.show, op.path);
        return op.delete ? v !== undefined : JSON.stringify(v) !== JSON.stringify(op.value);
      });
      remote.forEach(function (op) { U.applyOp(E.show, op); });
      pending.forEach(function (op) { U.applyOp(E.show, op); });
      E.rev = rev; base = JSON.stringify(config);
      return news;
    }
    function tell(r) { if (r && r.length && o.onRemote) o.onRemote(r); }
    /* the show Replicant changed: another show (onRemote('load')), the ops
       from elsewhere, or nothing new here */
    E.remote = function (d) {
      if (!d || !d.config) return;
      if (E.show == null || d.name !== E.name) { E.load(d); tell('load'); return; }
      if (d.rev > E.rev) tell(rebase(d.config, d.rev, JSON.parse(base)));
    };
    E.undo = function () {
      var b = JSON.parse(base);
      record(b, U.diff(b, E.show));
      var bu = null;
      while (bursts.length && !(bu = bursts.pop()).list.length) bu = null;
      if (!bu) { undoState(); return false; }
      bu.list.slice().reverse().forEach(function (op) { U.applyOp(E.show, op); });
      noRecord = true;
      E.save();
      undoState();
      return true;
    };
    return E;
  }

  // ===== Media library =====
  var MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|woff2?|ttf|otf|webm|mp4|csv|json|xml|rss|txt)$/i;
  /* a file's kind → its category of NodeCG's assets (package.json) */
  var CATEGORY = { image: 'images', video: 'videos', font: 'polices', data: 'donnees' };
  function kindOf(name) {
    var ext = (/\.[^.]+$/.exec(name) || [''])[0].toLowerCase();
    return /woff2?|ttf|otf/.test(ext) ? 'font' : /webm|mp4/.test(ext) ? 'video' : /csv|json|xml|rss|txt/.test(ext) ? 'data' : 'image';
  }
  function assetsUrl(category, name) {
    return '/assets/' + encodeURIComponent(ncg.bundleName) + '/' + category + (name ? '/' + encodeURIComponent(name) : '');
  }
  /* into NodeCG's assets (its Assets page shows them too), under a name that
     is safe in an address and doesn't replace another file. media: the
     library as it is → the name */
  function upload(file, media) {
    var name = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^[.-]+/, '').slice(-80);
    if (!MEDIA_EXT.test(name)) { toast('Import impossible : type de fichier non pris en charge', true); return Promise.resolve(null); }
    var taken = {};
    (media || []).forEach(function (m) { taken[m.name] = true; });
    var stem = name.replace(/\.[^.]+$/, ''), ext = name.slice(stem.length);
    for (var i = 2; taken[name]; i++) name = stem + '-' + i + ext;
    var fd = new FormData();
    fd.append('file', new File([file], name, { type: file.type }));
    toast('Envoi de ' + name + '…');
    return fetch(assetsUrl(CATEGORY[kindOf(name)]), { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); toast(name + ' importé'); return name; })
      .catch(function (e) { toast('Import impossible : ' + e.message, true); return null; });
  }
  function removeMedia(m) {
    return fetch(assetsUrl(m.category || CATEGORY[m.kind], m.name), { method: 'DELETE', credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); });
  }

  // ===== Modules =====
  var loaded = {};
  function script(src) {
    if (loaded[src]) return loaded[src];
    return (loaded[src] = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    }));
  }
  function mod(id) { return window.GFXModules && window.GFXModules[id]; }
  /* each module's descriptor, the graphic types it brings (they can be
     added and edited before the module is switched on) and its panel part
     (opts.panels: false for none, or the ids of the modules whose) */
  function loadModules(ids, opts) {
    var panels = opts && opts.panels != null ? opts.panels : true;
    return Promise.all(ids.map(function (id) {
      return script('modules/' + id + '/module.js').then(function () {
        var D = mod(id);
        if (!D) return null;
        var files = Object.keys(D.graphics || {}).map(function (t) { return D.graphics[t]; });
        if (D.panel && (panels === true || (Array.isArray(panels) && panels.indexOf(id) >= 0))) files.push(D.panel);
        return files.reduce(function (p, f) { return p.then(function () { return script('modules/' + id + '/' + f); }); }, Promise.resolve());
      });
    }));
  }
  function modSettings(show, id) {
    var D = mod(id), m = ((show && show.modules) || {})[id] || {};
    return U.withDefaults(U.clone(m.settings || {}), D ? U.schemaDefaults(D.settings) : {});
  }
  /* a module's variables: a list, or a function of its settings for the
     ones named after what the operator created (a timer, a feed…) */
  function modVars(show, id) {
    var D = mod(id);
    if (!D || !D.vars) return [];
    if (typeof D.vars !== 'function') return D.vars;
    try { return D.vars(modSettings(show, id), U) || []; } catch (e) { return []; }
  }
  function enabledMods(show) {
    var ms = (show && show.modules) || {};
    return Object.keys(ms).filter(function (id) { return ms[id] && ms[id].enabled && mod(id); });
  }

  // ===== Forms =====
  /* The labels of the sound cues (package.json, nodecg.soundCues) */
  var CUES = { entree: 'entrée (souffle)', flash: 'flash (carillon)', point: 'point marqué (arpège)', alerte: 'alerte (trois bips)' };
  var cuesRep = null;
  function cues() {
    if (!cuesRep) { cuesRep = ncg.Replicant('soundCues'); }
    return (cuesRep.value || []).map(function (c) { return c.name; });
  }
  /* The variables a text can use, for the {} picker. ctx: { show(), live(),
     vars() (the modules'), now(), tz() } */
  function varGroups(ctx) {
    var sh = ctx.show(), now = ctx.now(), tz = ctx.tz(), live = ctx.live() || {}, vs = ctx.vars() || {};
    var g = [{ title: 'Horloge et date', items: [['clock', 'heure', U.hms(now, tz)], ['clock.hm', 'heure sans secondes', U.hm(now, tz)],
               ['date', 'date', U.longDate(now, tz)], ['date.short', 'date courte', U.shortDate(now, tz)],
               ['day', 'jour', U.weekday(now, tz)], ['show', 'titre du projet', sh.title]] }];
    g.push({ title: 'Variables libres', items: (sh.variables || []).map(function (v) {
      return ['var.' + v.name, v.label, live.vars ? live.vars[v.name] : v.value];
    }) });
    enabledMods(sh).forEach(function (id) {
      var D = mod(id), items = [], seen = {};
      modVars(sh, id).forEach(function (v) { seen[v.name] = true; items.push([id + '.' + v.name, v.label, show((vs[id] || {})[v.name])]); });
      Object.keys(vs[id] || {}).forEach(function (k) { if (!seen[k] && k.charAt(0) !== '_') items.push([id + '.' + k, '', show(vs[id][k])]); });
      g.push({ title: D.label, items: items });
    });
    return g;
    function show(v) { return v == null ? '' : typeof v === 'object' ? '[liste]' : v; }
  }
  function visualsList(sh, kind) {
    var out = [];
    enabledMods(sh).forEach(function (id) {
      var D = mod(id), list = (kind === 'columns' ? D.columns : D.visuals) || {};
      Object.keys(list).forEach(function (k) { out.push(['module:' + id + '.' + k, D.label + ' · ' + list[k].label]); });
    });
    return out;
  }
  /* What Forms.render needs. ctx: { show(), live(), vars(), media(),
     now(), tz(), changed(), upload(file), cmd(target, cmd, text) } and,
     for a graphic's form, graphic: its id */
  function formEnv(ctx) {
    var gid = ctx.graphic || null;
    return {
      tz: ctx.tz, changed: ctx.changed,
      themeColor: function (token) { return T.resolve(ctx.show().theme).colors[token]; },
      vars: function () { return varGroups(ctx); },
      media: function (accept) {
        return (ctx.media() || []).filter(function (m) { return !accept || accept.split(',').indexOf(m.kind) >= 0; });
      },
      upload: ctx.upload,
      send: function (f, kind, i) {
        if (!gid) return;
        if (kind === 'take') ctx.cmd(gid, 'take.' + (i + 1));
        if (kind === 'send') ctx.cmd(gid, 'preset.' + (i + 1));
      },
      options: function (source) {
        var sh = ctx.show();
        switch (source) {
          case 'panelSources': return [['none', 'Aucun'], ['image', 'Image']].concat(visualsList(sh, 'visuals'));
          case 'cardSources': return [['none', 'Aucune']].concat(visualsList(sh, 'visuals'));
          case 'columnSources': return [['', '— choisir —']].concat(visualsList(sh, 'columns'));
          case 'flashAnchors': return [['free', 'Libre (position ci-dessous)']].concat(sh.graphics.filter(function (x) { return x.type === 'bandeau'; })
            .map(function (x) { return ['bandeau:' + x.id, 'Collé au bandeau « ' + x.name + ' »']; }));
          case 'motionPresets': return [['', 'Celle du projet']].concat(Object.keys(M.PRESETS).map(function (k) { return [k, M.PRESETS[k].label]; }));
          case 'soundCues': return [['', 'aucun']].concat(cues().map(function (c) { return [c, CUES[c] || c]; }));
          case 'listVars': {
            var out = [['', '— choisir —']];
            varGroups(ctx).slice(1).forEach(function (grp) { grp.items.forEach(function (it) { out.push([it[0], it[0] + (it[1] ? ' — ' + it[1] : '')]); }); });
            return out;
          }
        }
        var m = /^graphics:(\w+)$/.exec(source);
        if (m) return [['', 'Automatique']].concat(sh.graphics.filter(function (x) { return x.type === m[1]; }).map(function (x) { return [x.id, x.name + ' (' + x.id + ')']; }));
        /* a list a module draws from its settings: mod:<id>.<name> → its options[name](settings, U) */
        var mo = /^mod:(\w+)\.(\w+)$/.exec(source), D = mo && mod(mo[1]), fn = D && D.options && D.options[mo[2]];
        if (fn) { try { return [['', '— choisir —']].concat(fn(modSettings(sh, mo[1]), U) || []); } catch (e) { return []; } }
        return [];
      }
    };
  }

  // ===== The modules' panel parts =====
  /* What a module's panel.js gets (render(el, api), rundown(el, api)). ctx:
     { show(), live(), vars(), status(), now(), tz(), changed(), onSetting() } */
  function moduleApi(id, ctx) {
    return {
      id: id, U: U, h: Forms.h, toast: toast, copy: copy, ask: ask,
      cmd: function (c, text) { return msg('cmd', { target: id, cmd: c, text: text, from: 'panel' }).catch(function (e) { toast(e.message, true); }); },
      state: function () { var L = ctx.live(); return (L && L.modules && L.modules[id]) || {}; },
      vars: function () { return (ctx.vars() || {})[id] || {}; },
      settings: function () { return modSettings(ctx.show(), id); },
      /* change the module's settings (saved like any edit): setting(key, value)
         or setting({ key: value, … }) */
      setting: function (key, value) {
        var sh = ctx.show();
        var entry = sh.modules[id] = sh.modules[id] || { enabled: true, settings: {} };
        entry.settings = entry.settings || {};
        var o = typeof key === 'object' ? key : {};
        if (typeof key !== 'object') o[key] = value;
        Object.keys(o).forEach(function (k) { U.setPath(entry.settings, k, o[k]); });
        ctx.changed();
        if (ctx.onSetting) ctx.onSetting();
      },
      status: function () { return msg('mod:status', { m: id }).then(function (j) { return j.status || {}; }); },
      tz: ctx.tz, now: ctx.now,
      log: function () { var s = ctx.status(); return (s && s.log) || []; }
    };
  }
  /* What Companion sends to a module: cmdHelp = [[command, effect, example
     for its <…> part]] (or a function of the settings) → a folded table */
  function moduleCommandsHelp(id, list) {
    var h = Forms.h, base = abs('api/cmd/' + id + '/');
    var tb = h('table', { class: 't' }, [h('tr', {}, [h('th', { text: 'Commande' }), h('th', { text: 'Effet' }), h('th', { text: 'Companion (HTTP GET)' })])]);
    list.forEach(function (c) {
      var url = base + c[0].replace(/<[^>]*>/g, c[2] || 'Texte');
      tb.appendChild(h('tr', {}, [h('td', {}, [h('code', { text: c[0] })]), h('td', { text: c[1] }),
        h('td', {}, [h('button', { class: 'fm-mini', text: 'copier l\'URL', title: url, onclick: function () { copy(url); } })])]));
    });
    return h('details', { class: 'fm-sec' }, [h('summary', { text: 'Commandes (Companion, OBS)' }), h('div', { class: 'fm-sec-body' }, [
      h('p', { class: 'note' }, ['Companion : module « Generic HTTP », requête GET sur ', h('code', { text: base + '<commande>' }),
        ' — ou OBS « Broadcast Custom Event » avec ', h('code', { text: '{"gfx": "' + id + ':<commande>"}' }), '.' + loginNote()]), tb])]);
  }
  /* a module's views and controls come and go with the drawing: destroy()
     stops their timers */
  function dropViews(list) { list.forEach(function (v) { if (v.ctl && v.ctl.destroy) try { v.ctl.destroy(); } catch (e) { /* going anyway */ } }); }

  window.GFXLink = {
    msg: msg, abs: abs, loginNote: loginNote, connect: connect, hello: hello, toast: toast, copy: copy,
    ask: ask, settingsDialog: settingsDialog, Editor: Editor,
    MEDIA_EXT: MEDIA_EXT, kindOf: kindOf, upload: upload, removeMedia: removeMedia,
    loadModules: loadModules, mod: mod, modSettings: modSettings, modVars: modVars, enabledMods: enabledMods,
    varGroups: varGroups, formEnv: formEnv, moduleApi: moduleApi, moduleCommandsHelp: moduleCommandsHelp, dropViews: dropViews,
    CUES: CUES
  };
})();
