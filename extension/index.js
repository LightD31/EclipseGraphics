/* The bundle's NodeCG extension: the server behind the output graphic
   (graphics/overlay.html, the OBS browser source) and the Régie
   (dashboard/regie.html, the dashboard's "Régie" workspace; the rundown
   alone is the "À l'antenne" panel).

   What lives where
     shows/<name>.json   a show: its theme, motion, graphics and their fields,
                         modules and their settings, free variables. Edited
                         from the Régie, saved on every change (previous
                         version kept as .bak).
     data/               this machine's runtime state (git-ignored): the
                         settings (OBS link, Companion, active show) and each
                         show's live state (what is on air, layouts, module
                         controls), so a restart picks up where it left off.
     NodeCG's assets     the media library, a category per kind (Images,
                         Vidéos, Polices, Données), uploaded from the Régie
                         or NodeCG's Assets page; media/ holds the examples
                         the demo shows use.
     sounds/             the sound cues' default files (NodeCG's Mixer sets
                         each cue's file and volume).
     modules/<id>/       data modules: module.js describes the module
                         (settings, views, commands) for this extension, the
                         Régie and the output alike; client.js runs in the
                         output page; server.js, when present, adds routes
                         and background work here.
   (shows/ and data/ can live elsewhere: showsDir, dataDir in the bundle's
   configuration, cfg/EclipseGraphics.json — see configschema.json)

   One path for every command: the Régie, Companion (HTTP, or OBS "Broadcast
   Custom Event"), other bundles, the output pages' keyboard all end up in
   runCommand(), which changes the live state and publishes it. The output
   pages only render what the live state says, so every browser source agrees.

   What the pages read: Replicants of this bundle, written here only
     catalog   { version, modules, modTypes }   the installed modules
     show      { name, config, rev, by }        the active show
     live      what is on air (see "Live state")
     vars      { <module>: { <name>: value } }  what the modules report
     shows · media · settings (the OBS password hidden) · status

   What they send: messages to this bundle, answered { ok, error, … }
     cmd {target, cmd, text}              a command, as Companion's
     show:patch {ops, by}                 an edit, as what changed (the ops
                                          of GFXShared.diff): pages edit at once
     show:save {rev, config, by}          a whole show, at its revision
     shows {action: create|duplicate|rename|delete|activate|import, …}
     settings:save {obs, companion}
     client {id, role, modules, only, socket}   a page says hello (again every 10 s)
     vars {id, m, v} · flash {id, m, item, front}   an output's module reports
     mod:status {m}                       a module's server part, for its panel
   and from here to them: leader {id, modules} · module {m, cmd, text} ·
   mod {m, event, data} (a module's panel part) · sound {to, m, cue} (the
   page that plays a module's sound) · reload

   The Replicants have JSON schemas (schemas/). The dashboard: the Régie
   (fullbleed), « À l'antenne » and one panel per module (scripts/panels.js
   makes them), NodeCG's dialogs « Confirmer » and « Réglages du module ».

   HTTP, under /bundles/EclipseGraphics/ (NodeCG's login applies when it is
   on: Companion adds ?key=<the user's key>)
     GET  api/cmd/<target>/<cmd>[?text=]  a command, for Companion's Generic HTTP
     POST api/cmd                         {target, cmd, text}
     GET  api/state · api/status · api/shows/<name>[?download]
     GET  media/<file>                    the media library
     and the modules' own (meteo/geocode, adsb/…)

   Another bundle can drive the graphics too: the message "cmd" to this
   bundle (nodecg.sendMessageToBundle('cmd', 'EclipseGraphics', {…})), or
   this extension's API (nodecg.extensions.EclipseGraphics.command(…)). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const U = require('../engine/shared.js');

const ROOT = path.join(__dirname, '..');
const VERSION = require('../package.json').version;

/* NodeCG's own folder (cfg/, db/, assets/): NODECG_ROOT, else the nearest
   folder with a package.json — NodeCG's installation, or this bundle when
   NodeCG runs from it (npm start) */
function runtimeRoot() {
  if (process.env.NODECG_ROOT) return process.env.NODECG_ROOT;
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    if (path.dirname(dir) === dir) return process.cwd();
  }
}

module.exports = function (nodecg) {
  const BUNDLE = nodecg.bundleName;
  const CFG = nodecg.bundleConfig || {};
  const SHOWS_DIR = path.resolve(ROOT, CFG.showsDir || 'shows');
  const DATA_DIR = path.resolve(ROOT, CFG.dataDir || 'data');
  /* the media library: NodeCG's assets of the bundle, one category per kind
     of file (package.json, nodecg.assetCategories), then the examples that
     come with the bundle */
  const MEDIA_KINDS = { images: 'image', videos: 'video', polices: 'font', donnees: 'data' };
  const ASSETS_ROOT = path.join(runtimeRoot(), 'assets', BUNDLE);
  const EXAMPLES_DIR = path.join(ROOT, 'media');
  const ALLOW_HOSTS = (Array.isArray(CFG.allowHosts) ? CFG.allowHosts : []).map(s => String(s).trim().toLowerCase()).filter(Boolean);
  for (const d of [SHOWS_DIR, DATA_DIR, path.join(DATA_DIR, 'live')]) fs.mkdirSync(d, { recursive: true });

  // ===== What the pages read =====
  /* Written here only (the pages clone what they read); rebuilt at start */
  const R = {};
  for (const name of ['catalog', 'show', 'live', 'vars', 'shows', 'media', 'settings', 'status']) {
    R[name] = nodecg.Replicant(name, { persistent: false, defaultValue: null });
  }
  R.vars.value = {};
  let statusTimer = null;   /* the status is published at most twice a second: statusChanged() */

  // ===== Log: the last lines, for the Régie =====
  const logRing = [];
  function log(level, ...a) {
    const text = a.join(' ');
    logRing.push({ at: Date.now(), level, text });
    if (logRing.length > 200) logRing.shift();
    if (level === 'warn') nodecg.log.warn(text); else nodecg.log.info(text);
    statusChanged();
  }
  /* A timer's work: an error is logged, never thrown at NodeCG (which would
     stop, and the graphics with it) */
  function guard(what, fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (e) { log('warn', what + ': ' + (e.stack || e.message)); }
    };
  }

  // ===== Settings: this machine's, not the show's =====
  const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
  const settings = {
    active: 'demo',
    obs: { enabled: false, host: '127.0.0.1', port: 4455, password: '' },
    companion: { enabled: false, host: '127.0.0.1:8000', prefix: 'gfx' },
  };
  try {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (U.isObj(saved)) {
      if (typeof saved.active === 'string') settings.active = U.slug(saved.active) || settings.active;
      for (const k of ['obs', 'companion']) if (U.isObj(saved[k])) Object.assign(settings[k], saved[k]);
    }
  } catch (e) { /* first run */ }
  /* as the Régie and the settings' schema expect them, whatever the file said */
  settings.obs.enabled = settings.obs.enabled === true;
  settings.obs.host = String(settings.obs.host || '127.0.0.1');
  settings.obs.port = Math.round(+settings.obs.port) > 0 && Math.round(+settings.obs.port) < 65536 ? Math.round(+settings.obs.port) : 4455;
  settings.obs.password = String(settings.obs.password || '');
  settings.companion.enabled = settings.companion.enabled === true;
  settings.companion.host = String(settings.companion.host || '127.0.0.1:8000');
  settings.companion.prefix = U.slug(settings.companion.prefix) || 'gfx';
  if (CFG.show) settings.active = U.slug(CFG.show) || settings.active;
  function saveSettings() { writeJSON(SETTINGS_FILE, settings); }
  function publicSettings() {
    const s = U.clone(settings);
    s.obs.password = settings.obs.password ? '••••••••' : '';
    return s;
  }

  function writeJSON(file, obj, backup) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
    if (backup && fs.existsSync(file)) { try { fs.copyFileSync(file, file + '.bak'); } catch (e) { /* no backup, then */ } }
    fs.renameSync(tmp, file);
  }

  // ===== Modules =====
  /* modules/<id>/module.js: the descriptor (UMD, shared with the browser);
     modules/<id>/server.js: optional, init(ctx) → { routes, status, onShow,
     commands, command, onCommand, stop } (see "Modules' server parts") */
  const MODULES = {};
  const moduleServers = {};
  const MODTYPES = {};      /* graphic type a module brings → its module id */
  for (const dir of fs.existsSync(path.join(ROOT, 'modules')) ? fs.readdirSync(path.join(ROOT, 'modules')).sort() : []) {
    const file = path.join(ROOT, 'modules', dir, 'module.js');
    if (!fs.existsSync(file)) continue;
    try {
      const m = require(file);
      if (!m || m.id !== dir) throw new Error('its id must be the folder name');
      MODULES[m.id] = m;
      for (const t of Object.keys(m.graphics || {})) MODTYPES[t] = m.id;
    } catch (e) { log('warn', 'module ' + dir + ': ' + e.message); }
  }

  // ===== Shows =====
  function showFile(name) { return path.join(SHOWS_DIR, name + '.json'); }
  function listShows() {
    return fs.readdirSync(SHOWS_DIR).filter(f => /^[a-z0-9_]+\.json$/.test(f)).map(f => {
      const name = f.slice(0, -5);
      let title = name;
      try { title = JSON.parse(fs.readFileSync(showFile(name), 'utf8')).title || name; } catch (e) { /* unreadable: its name */ }
      return { name, title, mtime: fs.statSync(showFile(name)).mtimeMs, active: name === active.name };
    }).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  }
  function validTz(tz) { try { new Intl.DateTimeFormat('fr-FR', { timeZone: tz }); return true; } catch (e) { return false; } }
  /* Whatever comes in (a file edited by hand, an import, the Régie) → a show
     the rest can rely on; graphic ids unique and usable in variable names */
  function normalizeShow(c) {
    c = U.isObj(c) ? c : {};
    const out = {
      version: 1,
      title: typeof c.title === 'string' && c.title.trim() ? c.title.trim().slice(0, 120) : 'Sans titre',
      timezone: typeof c.timezone === 'string' && validTz(c.timezone) ? c.timezone : 'Europe/Paris',
      theme: U.isObj(c.theme) ? c.theme : {},
      motion: U.isObj(c.motion) ? c.motion : {},
      modules: {},
      variables: [],
      graphics: [],
    };
    /* each module's entry: switched on or not, its settings */
    for (const [id, m] of Object.entries(U.isObj(c.modules) ? c.modules : {})) {
      if (!U.isObj(m) || !/^[\w-]+$/.test(id)) continue;
      out.modules[id] = Object.assign({}, m, { enabled: m.enabled === true, settings: U.isObj(m.settings) ? m.settings : {} });
    }
    const vseen = new Set();
    for (const v of Array.isArray(c.variables) ? c.variables : []) {
      const name = U.slug(v && v.name);
      if (!name || vseen.has(name)) continue;
      vseen.add(name);
      out.variables.push({ name, label: String(v.label || name).slice(0, 80), value: v.value == null ? '' : String(v.value).slice(0, 500) });
    }
    const seen = new Set();
    for (const g of Array.isArray(c.graphics) ? c.graphics : []) {
      if (!U.isObj(g) || typeof g.type !== 'string') continue;
      let id = U.slug(g.id || g.type) || 'g', n = 2;
      while (seen.has(id) || id === 'all' || id === 'var' || MODULES[id]) id = (U.slug(g.id || g.type) || 'g') + '_' + n++;
      seen.add(id);
      out.graphics.push(Object.assign({}, g, {
        id, type: g.type, name: String(g.name || id).slice(0, 80),
        fields: U.isObj(g.fields) ? g.fields : {}, motion: U.isObj(g.motion) ? g.motion : {},
      }));
    }
    return out;
  }
  function readShow(name) { return normalizeShow(JSON.parse(fs.readFileSync(showFile(name), 'utf8'))); }
  const BLANK = { title: 'Nouveau projet', graphics: [] };

  const active = { name: '', config: null, rev: 0 };
  /* Open a show: its live state, its modules; published to the pages */
  function activate(name) {
    let cfg;
    try { cfg = readShow(name); } catch (e) {
      const first = listShows()[0];
      if (!first || first.name === name) { cfg = normalizeShow(BLANK); writeJSON(showFile(name), cfg); }
      else { log('warn', 'show ' + name + ': ' + e.message + ' — opening ' + first.name); return activate(first.name); }
    }
    active.name = name; active.config = cfg; active.rev++;
    settings.active = name; saveSettings();
    for (const k of Object.keys(vars)) delete vars[k];
    R.vars.value = {};
    liveOf(name);
    moduleHooks();
    modulesOnShow(cfg);
    publishShow(null);
    liveChanged();
    log('log', 'show: ' + name + ' (' + cfg.title + ')');
  }
  /* the modules' server parts, told a show opened or changed */
  function modulesOnShow(cfg) {
    for (const id in moduleServers) {
      if (moduleServers[id].onShow) try { moduleServers[id].onShow(cfg); } catch (e) { log('warn', id + ': ' + (e.stack || e.message)); }
    }
  }
  function publishShow(by) { R.show.value = { name: active.name, config: U.clone(active.config), rev: active.rev, by: by || null }; }
  function publishShows() { R.shows.value = listShows(); }
  function enabledModules(cfg) {
    cfg = cfg || active.config;
    return Object.keys(cfg.modules).filter(id => MODULES[id] && cfg.modules[id] && cfg.modules[id].enabled);
  }
  function moduleSettings(id) {
    const m = active.config.modules[id] || {};
    return U.withDefaults(U.clone(m.settings || {}), U.schemaDefaults(MODULES[id].settings));
  }
  /* A module may keep part of its state in step with its settings: the demos
     start their shared clock here when switched on, so every output plays the
     same moment of the demo. → true when the state changed */
  function moduleHooks() {
    const live = liveOf(active.name);
    let changed = false;
    for (const id of enabledModules()) {
      const M = MODULES[id];
      if (M.onSettings) {
        try { if (M.onSettings(moduleSettings(id), live.modules[id], U) === true) changed = true; } catch (e) { log('warn', id + ': ' + e.message); }
      }
    }
    return changed;
  }

  // ===== Live state (per show, persisted) =====
  /* live = {
       graphics: { <id>: { air, layout, main, card, view, headline, entry, offAt } },
       flash:    { <id>: { current, queue, n, lastEnd, keys } },
       modules:  { <id>: the module's control state },
       vars:     { <name>: the free variables' current values } } */
  const lives = {};
  function liveOf(name) {
    if (!lives[name]) {
      let saved = null;
      try { saved = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'live', name + '.json'), 'utf8')); } catch (e) { /* none yet */ }
      lives[name] = saved;
    }
    lives[name] = initLive(name === active.name ? active.config : readShow(name), lives[name]);
    return lives[name];
  }
  function initLive(show, live) {
    live = U.isObj(live) ? live : {};
    for (const k of ['graphics', 'flash', 'modules', 'vars']) if (!U.isObj(live[k])) live[k] = {};
    const ids = new Set();
    for (const g of show.graphics) {
      ids.add(g.id);
      const L = live.graphics[g.id] = U.isObj(live.graphics[g.id]) ? live.graphics[g.id] : {};
      if (typeof L.air !== 'boolean') L.air = g.type === 'flash';
      if (g.type === 'bandeau') {
        if (!['lower', 'full', 'recap'].includes(L.layout)) L.layout = 'lower';
        if (!['panel', 'card'].includes(L.main)) L.main = 'panel';
        if (typeof L.card !== 'boolean') L.card = true;
        if (!U.isObj(L.view)) L.view = {};
        for (const v of viewsOf(g)) if (!v.values.includes(L.view[v.name])) L.view[v.name] = v.default;
        if (typeof L.headline !== 'string') L.headline = null;
      }
      if (g.type === 'synthe') {
        const n = Array.isArray(g.fields.entries) ? g.fields.entries.length : 0;
        if (!(L.entry >= 0 && L.entry < n)) L.entry = 0;
      }
      if (g.type === 'flash') {
        const F = live.flash[g.id] = U.isObj(live.flash[g.id]) ? live.flash[g.id] : {};
        if (!Array.isArray(F.queue)) F.queue = [];
        if (!Array.isArray(F.keys)) F.keys = [];
        if (typeof F.n !== 'number') F.n = 0;
        if (F.current === undefined) F.current = null;
      }
    }
    for (const id of Object.keys(live.graphics)) if (!ids.has(id)) delete live.graphics[id];
    for (const id of Object.keys(live.flash)) if (!ids.has(id)) delete live.flash[id];
    for (const id of enabledModules(show)) live.modules[id] = U.withDefaults(live.modules[id], U.clone(MODULES[id].state || {}));
    for (const v of show.variables) if (live.vars[v.name] === undefined) live.vars[v.name] = v.value;
    for (const k of Object.keys(live.vars)) {
      if (!show.variables.some(v => v.name === k)) delete live.vars[k];
      else if (typeof live.vars[k] !== 'string') live.vars[k] = live.vars[k] == null ? '' : String(live.vars[k]);
    }
    return live;
  }
  /* The views a bandeau's modules add to it (the A350F map's track | follow…) */
  function viewsOf(g) {
    const out = [];
    for (const src of [U.getPath(g.fields, 'panel.source'), U.getPath(g.fields, 'card.source')]) {
      const m = /^module:(\w+)\./.exec(src || '');
      const M = m && MODULES[m[1]];
      if (!M || !M.views) continue;
      for (const name in M.views) if (!out.some(v => v.name === name)) out.push(Object.assign({ name }, M.views[name]));
    }
    return out;
  }
  let liveSaveTimer = null;
  function saveLive(name) {
    clearTimeout(liveSaveTimer);
    if (lives[name]) writeJSON(path.join(DATA_DIR, 'live', name + '.json'), lives[name]);
  }
  function liveChanged(opts) {
    const live = liveOf(active.name);
    R.live.value = U.clone(live);
    if (!(opts && opts.quiet)) companionAll();
    clearTimeout(liveSaveTimer);
    const name = active.name;
    liveSaveTimer = setTimeout(guard('live', () => saveLive(name)), 400);
  }

  // ===== Pages: who is there =====
  /* Each page says hello (message "client") when it opens, when its socket
     comes back and every 10 s: its socket's end removes it at once, and a
     page that stopped saying hello goes after 30 s. */
  const clients = new Map(); /* id → { id, role, modules, only, at, ua, socket } */
  const io = typeof nodecg.getSocketIOServer === 'function' ? nodecg.getSocketIOServer() : null;
  function socketOf(id) {
    try { return id && io && io.sockets && typeof io.sockets.get === 'function' ? io.sockets.get(id) : null; } catch (e) { return null; }
  }
  function dropClient(id) {
    if (!clients.delete(id)) return;
    assignLeaders();
    statusChanged();
  }
  setInterval(guard('clients', () => {
    const t = Date.now();
    for (const c of [...clients.values()]) if (t - c.at > 30000) dropClient(c.id);
  }), 5000);
  function hello(d) {
    const id = String(d.id || '').slice(0, 40);
    if (!id) return fail('identifiant manquant');
    const old = clients.get(id);
    const c = {
      id, role: d.role === 'panel' ? 'panel' : 'output', preview: !!d.preview,
      modules: (Array.isArray(d.modules) ? d.modules : []).filter(x => MODULES[x]),
      only: String(d.only || '').slice(0, 200), at: Date.now(), ua: String(d.ua || '').slice(0, 120), socket: String(d.socket || '').slice(0, 40),
    };
    clients.set(id, c);
    if (c.socket && (!old || old.socket !== c.socket)) {
      const s = socketOf(c.socket);
      if (s) s.once('disconnect', guard('clients', () => { const cur = clients.get(id); if (cur && cur.socket === c.socket) dropClient(id); }));
    }
    if (!old || old.modules.join() !== c.modules.join()) assignLeaders();
    if (!old) statusChanged();
    return ok({ now: Date.now(), leader: ledBy(id) });
  }

  /* Module variables come from the output pages, which run the modules: one
     page per module (its leader) reports them, so two sources with timers a
     tick apart don't make the values flicker. */
  const vars = {};          /* module → { name: value } */
  const leaders = {};       /* module → client id */
  function ledBy(id) { return Object.keys(leaders).filter(m => leaders[m] === id); }
  /* A real output leads rather than the Régie's preview (which closes with
     the dashboard, and plays no sound): a preview leads only while no output
     runs the module, and hands over as soon as one does */
  function assignLeaders() {
    const want = active.config ? enabledModules() : [];
    const before = Object.assign({}, leaders);
    for (const m of Object.keys(leaders)) if (!want.includes(m)) delete leaders[m];
    for (const m of want) {
      const can = [...clients.values()].filter(c => c.role === 'output' && c.modules.includes(m));
      const cur = can.find(c => c.id === leaders[m]);
      const best = can.find(c => !c.preview) || can[0];
      if (cur && (!cur.preview || cur === best)) continue;
      if (best) leaders[m] = best.id; else delete leaders[m];
    }
    const told = new Set();
    for (const m of new Set(Object.keys(before).concat(Object.keys(leaders)))) {
      if (before[m] === leaders[m]) continue;
      if (before[m] && clients.has(before[m])) told.add(before[m]);
      if (leaders[m]) told.add(leaders[m]);
    }
    for (const id of told) nodecg.sendMessage('leader', { id, modules: ledBy(id) });
    if (told.size) statusChanged();
  }

  /* The page that plays a module's sound: its leader, else an output showing
     everything, else any output — never the Régie's preview */
  function soundPage(m) {
    const outs = [...clients.values()].filter(c => c.role === 'output' && !c.preview);
    const lead = outs.find(c => c.id === leaders[m]) || outs.find(c => !c.only) || outs[0];
    return lead ? lead.id : null;
  }

  // ===== Commands =====
  function ok(extra) { return Object.assign({ ok: true }, extra); }
  function fail(error, extra) { return Object.assign({ ok: false, error }, extra); }
  function graphicById(id) { return active.config.graphics.find(g => g.id === id); }
  function firstOfType(type) { const g = active.config.graphics.find(x => x.type === type); return g && g.id; }
  /* A module's own graphic: the one its settings name, else the first bandeau
     showing one of its visuals */
  function moduleGraphic(mid) {
    const s = moduleSettings(mid);
    if (s.graphic && graphicById(s.graphic)) return s.graphic;
    const own = active.config.graphics.find(x => MODTYPES[x.type] === mid);
    if (own) return own.id;
    const g = active.config.graphics.find(x => x.type === 'bandeau' &&
      [U.getPath(x.fields, 'panel.source'), U.getPath(x.fields, 'card.source')].some(src => String(src || '').startsWith('module:' + mid + '.')));
    return g ? g.id : firstOfType('bandeau');
  }
  function moduleFlash(mid) {
    const s = moduleSettings(mid);
    return s.flash && graphicById(s.flash) ? s.flash : firstOfType('flash');
  }
  function moduleNow(mid) {
    const M = MODULES[mid];
    return M && M.now ? M.now(moduleSettings(mid), liveOf(active.name).modules[mid] || {}, U, active.config.timezone) : Date.now();
  }

  /* target: a graphic id, a module id, "var" (free variables) or "all";
     cmd: <property>.<value> (see the README); text: for text that contains dots.
     A refused command says why in the log, where the operator looks. */
  function runCommand(target, cmd, text, source) {
    let r;
    try { r = execCommand(target, cmd, text, source); } catch (e) { r = fail(e.message); }
    if (!r.ok) log('warn', '  ✗ ' + r.error);
    return r;
  }
  function execCommand(target, cmd, text, source) {
    target = String(target || '').trim();
    cmd = String(cmd || '').trim();
    if (!target && /^[\w-]+:/.test(cmd)) { const i = cmd.indexOf(':'); target = cmd.slice(0, i); cmd = cmd.slice(i + 1); }
    if (!cmd) return fail('commande vide');
    if (text != null) text = String(text).slice(0, 500);
    log('log', 'cmd ' + (target || 'all') + ':' + cmd + (text != null ? ' "' + text + '"' : '') + (source ? ' (' + source + ')' : ''));
    const live = liveOf(active.name);
    if (!target || target === 'all') {
      if (cmd === 'all.off' || cmd === 'air.off') {
        for (const g of active.config.graphics) {
          if (g.type === 'flash') { const F = live.flash[g.id]; F.queue = []; if (F.current) F.current.until = Date.now(); }
          else { live.graphics[g.id].air = false; live.graphics[g.id].offAt = 0; }
        }
        liveChanged();
        return ok();
      }
      if (cmd === 'reload') { nodecg.sendMessage('reload', {}); return ok(); }
      return fail('commande inconnue : ' + cmd);
    }
    if (target === 'var') return varCommand(cmd, text);
    if (MODULES[target]) {
      if (!enabledModules().includes(target)) return fail('module ' + target + ' inactif dans ce projet');
      const r = moduleCommand(target, cmd, text);
      if (r) return r;
      target = /^(banner|preset)\./.test(cmd) ? moduleFlash(target) : moduleGraphic(target);
      if (!target) return fail('aucun graphique pour ce module');
    }
    const g = graphicById(target);
    if (!g) return fail('cible inconnue : ' + target);
    const r = graphicCommand(g, cmd, text);
    if (r.ok) liveChanged();
    return r;
  }
  function setAir(g, on) {
    const L = liveOf(active.name).graphics[g.id];
    L.air = on;
    if (g.type === 'synthe') {
      const secs = +g.fields.autoOut || 0;
      L.offAt = on && secs > 0 ? Date.now() + secs * 1000 : 0;
    }
  }
  function graphicCommand(g, cmd, text) {
    const live = liveOf(active.name), L = live.graphics[g.id];
    const dot = cmd.indexOf('.');
    const ns = dot < 0 ? cmd : cmd.slice(0, dot), v = dot < 0 ? '' : cmd.slice(dot + 1);
    const bool = (cur) => v === 'on' ? true : v === 'off' ? false : v === 'toggle' ? !cur : null;
    if (ns === 'air') {
      if (v === 'on' || v === 'off' || v === 'toggle') { setAir(g, bool(L.air)); return ok(); }
      const m = /^on\.(.+)$/.exec(v);
      if (m && g.type === 'bandeau' && ['lower', 'full', 'recap'].includes(m[1])) { L.layout = m[1]; setAir(g, true); return ok(); }
      if (m && g.type === 'synthe') return entryCommand(g, L, m[1], true);
      return fail('valeur inconnue : ' + cmd);
    }
    if (g.type === 'bandeau') {
      if (ns === 'layout') {
        if (v === 'toggle') L.layout = L.layout === 'lower' ? 'full' : 'lower';
        else if (['lower', 'full', 'recap'].includes(v)) L.layout = v;
        else return fail('mise en page inconnue : ' + v);
        return ok();
      }
      if (ns === 'main') {
        const names = { panel: 'panel', card: 'card' };
        const a = /^module:\w+\.(\w+)/.exec(U.getPath(g.fields, 'panel.source') || ''), b = /^module:\w+\.(\w+)/.exec(U.getPath(g.fields, 'card.source') || '');
        if (a) names[a[1]] = 'panel';
        if (b) names[b[1]] = 'card';
        if (v === 'toggle') L.main = L.main === 'panel' ? 'card' : 'panel';
        else if (names[v]) L.main = names[v];
        else return fail('vue inconnue : ' + v);
        return ok();
      }
      if (ns === 'card') { const b = bool(L.card); if (b == null) return fail('valeur inconnue : ' + v); L.card = b; return ok(); }
      if (ns === 'headline') {
        if (v === 'auto') L.headline = null;
        else L.headline = String(v === 'set' ? text || '' : v).trim().slice(0, 120) || null;
        return ok();
      }
      const view = viewsOf(g).find(x => x.name === ns);
      if (view) {
        if (v === 'toggle') L.view[ns] = view.values[(view.values.indexOf(L.view[ns]) + 1) % view.values.length];
        else if (view.values.includes(v)) L.view[ns] = v;
        else return fail('valeur inconnue : ' + cmd);
        return ok();
      }
    }
    if (g.type === 'synthe' && (ns === 'entry' || ns === 'take')) return entryCommand(g, L, v, ns === 'take');
    if (g.type === 'flash') {
      const F = live.flash[g.id];
      if (ns === 'banner') {
        if (v === 'clear') { F.queue = []; if (F.current) F.current.until = Date.now(); return ok(); }
        if (v === 'next') { if (F.current) F.current.until = Date.now(); return ok(); }
        const t = String(v === 'set' ? text || '' : v).trim().slice(0, 160);
        if (!t) return fail('texte vide');
        const tag = String(U.getPath(g.fields, 'defaultTag') || 'Info');
        enqueueFlash(g, { title: t, tag, sub: '', type: 'custom' }, true);
        return ok();
      }
      if (ns === 'preset') {
        const list = Array.isArray(g.fields.presets) ? g.fields.presets : [];
        const p = list[parseInt(v, 10) - 1];
        if (!p) return fail('message ' + v + ' introuvable');
        enqueueFlash(g, { tag: p.tag, title: p.title, sub: p.sub, dur: p.dur, type: 'preset' }, true);
        return ok();
      }
    }
    return fail('commande inconnue pour ' + g.id + ' : ' + cmd);
  }
  function entryCommand(g, L, v, take) {
    const n = Array.isArray(g.fields.entries) ? g.fields.entries.length : 0;
    if (!n) return fail('aucune entrée');
    let i = L.entry;
    if (v === 'next') i = (i + 1) % n;
    else if (v === 'prev') i = (i - 1 + n) % n;
    else if (/^\d+$/.test(v) && +v >= 1 && +v <= n) i = +v - 1;
    else return fail('entrée inconnue : ' + v);
    L.entry = i;
    if (take) setAir(g, true);
    else if (L.air) setAir(g, true); /* a new name on air runs its own time */
    return ok();
  }
  /* A module's command: <name>.<value> handled by commands[name] (its
     server part's first, then module.js's; undefined or true = done, false =
     refused), else by a catch-all command(name, value, ctx) for names that
     aren't known in advance (a timer's id…: null = not the module's, and the
     command goes on to the module's graphic) */
  function moduleCommand(mid, cmd, text) {
    const M = MODULES[mid], srv = moduleServers[mid] || {};
    const dot = cmd.indexOf('.');
    const ns = dot < 0 ? cmd : cmd.slice(0, dot), v = dot < 0 ? '' : cmd.slice(dot + 1);
    const fn = (srv.commands && srv.commands[ns]) || (M.commands && M.commands[ns]);
    const any = srv.command || M.command;
    if (!fn && !any) return null;
    const live = liveOf(active.name), st = live.modules[mid];
    const set = moduleSettings(mid), tz = active.config.timezone;
    const ctx = {
      state: st, settings: set, vars: vars[mid] || {}, text, tz, U,
      now: () => moduleNow(mid),
      when: (s) => U.parseWhen(s, tz, set.date || U.dayOf(moduleNow(mid), tz)),
    };
    let r;
    try { r = fn ? fn(v, ctx) : any(ns, v, ctx); } catch (e) { return fail(e.message); }
    if (!fn && r == null) return null;
    if (r === false) return fail('valeur refusée : ' + cmd);
    if (srv.onCommand) try { srv.onCommand(ns, v); } catch (e) { log('warn', mid + ': ' + e.message); }
    liveChanged();
    nodecg.sendMessage('module', { m: mid, cmd, text });
    return ok();
  }
  function varCommand(cmd, text) {
    const live = liveOf(active.name);
    const dot = cmd.indexOf('.');
    const name = U.slug(dot < 0 ? cmd : cmd.slice(0, dot)), v = dot < 0 ? null : cmd.slice(dot + 1);
    const def = active.config.variables.find(x => x.name === name);
    if (!def) return fail('variable inconnue : ' + name);
    const cur = live.vars[name];
    if (v === null || v === 'set') live.vars[name] = String(text == null ? '' : text).slice(0, 500);
    else if (v === 'reset') live.vars[name] = def.value;
    else if (/^[+-]\d+(\.\d+)?$/.test(v) && isFinite(parseFloat(String(cur).replace(',', '.')) || 0)) {
      const n = (parseFloat(String(cur).replace(',', '.')) || 0) + parseFloat(v);
      live.vars[name] = String(Math.round(n * 1000) / 1000).replace('.', ',');
    } else live.vars[name] = v;
    liveChanged();
    return ok({ value: live.vars[name] });
  }

  // ===== Flash queue =====
  const FLASH_GAP = 700;
  function enqueueFlash(g, item, front) {
    const F = liveOf(active.name).flash[g.id];
    if (item.key) {
      if (F.keys.includes(item.key)) return false;
      F.keys.push(item.key);
      if (F.keys.length > 300) F.keys.splice(0, F.keys.length - 300);
    }
    const it = {
      id: crypto.randomBytes(4).toString('hex'), tag: String(item.tag || '').slice(0, 40),
      title: String(item.title || '').slice(0, 160), sub: String(item.sub || '').slice(0, 160),
      dur: Math.max(2, Math.min(60, +item.dur || +g.fields.duration || 8)),
      type: item.type || 'custom', module: item.module || null, expires: +item.expires || 0,
    };
    if (front) F.queue.unshift(it); else F.queue.push(it);
    return true;
  }
  /* The flash queues and the synthés' automatic exit, 5 times a second */
  let tickBusy = false;
  setInterval(guard('tick', () => {
    if (tickBusy || !active.config) return;
    tickBusy = true;
    try {
      const live = liveOf(active.name), t = Date.now();
      let changed = false;
      for (const g of active.config.graphics) {
        const L = live.graphics[g.id];
        if (g.type === 'synthe' && L.offAt && t >= L.offAt) { L.air = false; L.offAt = 0; changed = true; }
        if (g.type !== 'flash') continue;
        const F = live.flash[g.id];
        if (F.current && t >= F.current.until) { F.current = null; F.lastEnd = t; changed = true; }
        if (!F.current && F.queue.length) {
          const before = F.queue.length;
          F.queue = F.queue.filter(i => !(i.expires && i.expires < t));
          if (F.queue.length !== before) changed = true;
          if (F.queue.length && t >= (F.lastEnd || 0) + FLASH_GAP) {
            const it = F.queue.shift();
            it.start = t; it.until = t + it.dur * 1000;
            F.current = it; F.n++; changed = true;
            if (it.module) setVars(it.module, { event: it.type, event_text: it.title + (it.sub ? ' (' + it.sub + ')' : ''), event_n: String(F.n) });
          }
        }
      }
      if (changed) liveChanged();
    } finally { tickBusy = false; }
  }), 200);

  // ===== Module variables =====
  /* Text values go to Companion — not the lists and ratios meant for the
     graphics, nor what a module marks as screen-only (its ticking clock) */
  function forCompanion(m, k, v) {
    if (k.charAt(0) === '_' || typeof v !== 'string') return false;
    const d = moduleVars(m).find(x => x.name === k);
    return !(d && d.screen);
  }
  /* A module's declared variables: a list, or a function of its settings */
  function moduleVars(m) {
    const M = MODULES[m];
    if (!M || !M.vars) return [];
    if (typeof M.vars !== 'function') return M.vars;
    try { return (active.config && enabledModules().includes(m) ? M.vars(moduleSettings(m), U) : []) || []; } catch (e) { return []; }
  }
  function setVars(m, v) {
    const cur = vars[m] || (vars[m] = {});
    const changed = {};
    for (const k in v) {
      if (JSON.stringify(cur[k]) === JSON.stringify(v[k])) continue;
      cur[k] = v[k]; changed[k] = v[k];
    }
    if (!Object.keys(changed).length) return;
    /* the pages get the changed values only (the Replicant sends what moved) */
    const rv = R.vars.value;
    if (!rv[m]) rv[m] = U.clone(changed);
    else for (const k in changed) rv[m][k] = U.clone(changed[k]);
    /* only the text values go to Companion: lists and raw numbers (a
       progress ratio changing every tick) are for the graphics */
    for (const k in changed) {
      if (!forCompanion(m, k, changed[k])) continue;
      compSet(m + '_' + k, changed[k]);
    }
  }

  // ===== Companion: custom variables over its HTTP API =====
  /* Everything the live state says, as Companion custom variables (create them
     in Companion once; a button then shows or tests them):
       <prefix>_<graphic>_air           on | off (all graphics)
       <prefix>_<graphic>_layout/_main/_card   bandeaux
       <prefix>_<graphic>_entry/_name   synthés: the current entry (1-based), its name
       <prefix>_<graphic>_text/_n       flashes: the banner on screen, how many so far
       <prefix>_var_<name>              the free variables
       <module>_air/_layout/_main/_card/_<view>   a module's own graphic, under the
                                       module's name (eclipse_air, a350f_map… as before)
       <module>_<name>                  what the module reports (a350f_alt, eclipse_pct…) */
  const comp = { last: {}, queue: new Map(), busy: false, state: 'off', error: '', sent: 0 };
  function compSet(name, value, force) {
    if (!settings.companion.enabled) return;
    value = value == null ? '' : String(value);
    if (!force && comp.last[name] === value) return;
    comp.last[name] = value;
    comp.queue.set(name, value);
    compFlush();
  }
  async function compFlush() {
    if (comp.busy) return;
    comp.busy = true;
    try {
      while (comp.queue.size && settings.companion.enabled) {
        const batch = [...comp.queue.entries()].slice(0, 8);
        for (const [k] of batch) comp.queue.delete(k);
        const before = comp.state;
        await Promise.all(batch.map(([name, value]) =>
          fetch('http://' + settings.companion.host + '/api/custom-variable/' + encodeURIComponent(name) + '/value?value=' +
                encodeURIComponent(value), { method: 'POST', signal: AbortSignal.timeout(3000) })
            .then(r => { if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status); comp.sent++; comp.state = 'ok'; comp.error = ''; })
            .catch(e => { if (comp.state !== 'error') log('warn', 'companion: ' + e.message); comp.state = 'error'; comp.error = e.message; })));
        if (comp.state !== before) statusChanged();
      }
    } finally { comp.busy = false; }
  }
  function companionAll(force) {
    if (!settings.companion.enabled || !active.config) return;
    const p = settings.companion.prefix || 'gfx', live = liveOf(active.name);
    for (const g of active.config.graphics) {
      const L = live.graphics[g.id], k = p + '_' + g.id + '_';
      compSet(k + 'air', L.air ? 'on' : 'off', force);
      if (g.type === 'bandeau') {
        compSet(k + 'layout', L.layout, force);
        compSet(k + 'main', L.main, force);
        compSet(k + 'card', L.card ? 'on' : 'off', force);
        for (const vn in L.view) compSet(k + vn, L.view[vn], force);
      }
      if (g.type === 'synthe') {
        const e = (g.fields.entries || [])[L.entry];
        compSet(k + 'entry', String(L.entry + 1), force);
        compSet(k + 'name', e ? e.name || '' : '', force);
      }
      if (g.type === 'flash') {
        const F = live.flash[g.id];
        compSet(k + 'text', F.current ? F.current.title : '', force);
        compSet(k + 'n', String(F.n), force);
      }
    }
    for (const name in live.vars) compSet(p + '_var_' + name, live.vars[name], force);
    for (const mid of enabledModules()) {
      const gid = moduleGraphic(mid), g = gid && graphicById(gid);
      if (g && g.type === 'bandeau') {
        const L = live.graphics[g.id];
        const vis = (src) => (/^module:\w+\.(\w+)/.exec(U.getPath(g.fields, src) || '') || [])[1];
        compSet(mid + '_air', L.air ? 'on' : 'off', force);
        compSet(mid + '_layout', L.layout, force);
        compSet(mid + '_main', (L.main === 'card' ? vis('card.source') : vis('panel.source')) || L.main, force);
        compSet(mid + '_card', L.card ? 'on' : 'off', force);
        for (const vn in L.view) compSet(mid + '_' + vn, L.view[vn], force);
      }
      const M = MODULES[mid];
      if (M.stateVars) {
        const sv = M.stateVars(live.modules[mid] || {}, moduleSettings(mid));
        for (const n in sv) compSet(mid + '_' + n, sv[n], force);
      }
      if (force) for (const n in vars[mid] || {}) {
        const val = vars[mid][n];
        if (forCompanion(mid, n, val)) compSet(mid + '_' + n, val, true);
      }
    }
  }
  /* Once a minute, everything again: a Companion restarted mid-show catches up */
  setInterval(guard('companion', () => companionAll(true)), 60000);

  // ===== OBS websocket (v5): Companion's "Broadcast Custom Event" =====
  /* The extension listens once for every page: {"gfx": "<target>:<cmd>"} or
     {"gfx": "<cmd>", "target": "<id>", "text": "…"}; the event keys the old
     overlays used ({"eclipse": …}, {"a350f": …}) reach their module. */
  const obs = { ws: null, state: 'off', error: '', timer: null, gen: 0 };
  function b64sha(s) { return crypto.createHash('sha256').update(s).digest('base64'); }
  function obsStatus(state, error) {
    obs.state = state; obs.error = error || '';
    statusChanged();
  }
  function obsConnect() {
    clearTimeout(obs.timer);
    const gen = ++obs.gen;
    if (obs.ws) { try { obs.ws.close(); } catch (e) { /* gone */ } obs.ws = null; }
    if (!settings.obs.enabled) return obsStatus('off');
    if (typeof WebSocket === 'undefined') return obsStatus('error', 'Node 22 ou plus requis pour le lien OBS');
    let ws;
    try { ws = new WebSocket('ws://' + settings.obs.host + ':' + settings.obs.port); } catch (e) { return obsStatus('error', e.message); }
    obs.ws = ws;
    obsStatus('connecting');
    ws.onmessage = guard('obs', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.op === 0) {
        const ident = { op: 1, d: { rpcVersion: 1, eventSubscriptions: 1 } };
        const a = msg.d.authentication;
        if (a) ident.d.authentication = b64sha(b64sha(settings.obs.password + a.salt) + a.challenge);
        ws.send(JSON.stringify(ident));
      } else if (msg.op === 2) {
        obsStatus('ok');
        log('log', 'OBS: connected');
      } else if (msg.op === 5 && msg.d && msg.d.eventType === 'CustomEvent') {
        const d = msg.d.eventData || {};
        if (typeof d.gfx === 'string') runCommand(d.target || '', d.gfx, d.text, 'obs');
        for (const mid in MODULES) {
          for (const key of MODULES[mid].legacyKeys || []) {
            if (typeof d[key] === 'string' && enabledModules().includes(mid)) runCommand(mid, d[key], d.text, 'obs');
          }
        }
      }
    });
    ws.onclose = (ev) => {
      if (gen !== obs.gen) return;
      obs.ws = null;
      obsStatus(ev.code === 4009 ? 'auth' : 'error', ev.code === 4009 ? 'mot de passe refusé' : 'déconnecté');
      obs.timer = setTimeout(guard('obs', obsConnect), 5000);
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  // ===== Media library =====
  /* images, videos, fonts, and data files a module can read (the flux
     module's CSV, JSON, RSS or text sources) */
  const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|woff2?|ttf|otf|webm|mp4|csv|json|xml|rss|txt)$/i;
  function kindOf(name) {
    const ext = path.extname(name).toLowerCase();
    return /woff2?|ttf|otf/.test(ext) ? 'font' : /webm|mp4/.test(ext) ? 'video' : /csv|json|xml|rss|txt/.test(ext) ? 'data' : 'image';
  }
  /* where a file of the library can be: its category's folder (by its
     kind), any other category's (dropped there by hand), the examples */
  function mediaDirs() {
    return Object.keys(MEDIA_KINDS).map(c => [path.join(ASSETS_ROOT, c), c]).concat([[EXAMPLES_DIR, null]]);
  }
  /* a file of the library by name: an uploaded one, else an example */
  function mediaFile(name) {
    name = path.basename(String(name || ''));
    if (!MEDIA_EXT.test(name) || name.startsWith('.')) return null;
    for (const [dir] of mediaDirs()) {
      const file = path.join(dir, name);
      try { if (fs.statSync(file).isFile()) return file; } catch (e) { /* not there */ }
    }
    return null;
  }
  function mediaList() {
    const out = [], seen = new Set();
    for (const [dir, category] of mediaDirs()) {
      let names = [];
      try { names = fs.readdirSync(dir); } catch (e) { continue; }
      for (const f of names) {
        if (!MEDIA_EXT.test(f) || f.startsWith('.') || seen.has(f)) continue;
        let st;
        try { st = fs.statSync(path.join(dir, f)); } catch (e) { continue; }
        if (!st.isFile()) continue;
        seen.add(f);
        out.push({ name: f, url: 'media/' + encodeURIComponent(f), size: st.size, mtime: st.mtimeMs, kind: kindOf(f),
                   category, builtin: !category });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  function publishMedia() { R.media.value = mediaList(); }
  /* NodeCG keeps a list of each category's files up to date (uploads,
     deletions, files dropped in the folder): ours follows */
  let mediaTimer = null;
  for (const c of Object.keys(MEDIA_KINDS)) {
    nodecg.Replicant('assets:' + c).on('change', () => { clearTimeout(mediaTimer); mediaTimer = setTimeout(guard('media', publishMedia), 150); });
  }

  // ===== Status, for the Régie =====
  const BOOT = Date.now();
  function statusInfo() {
    return {
      version: VERSION, boot: BOOT, now: Date.now(), bundle: BUNDLE, nodecg: nodecg.config ? { host: nodecg.config.host, port: nodecg.config.port } : null,
      obs: { state: obs.state, error: obs.error }, companion: { state: settings.companion.enabled ? comp.state : 'off', error: comp.error, sent: comp.sent },
      clients: [...clients.values()].map(c => ({ id: c.id, role: c.role, preview: c.preview, modules: c.modules, only: c.only, at: c.at, ua: c.ua })),
      leaders: Object.assign({}, leaders), log: logRing.slice(-80),
    };
  }
  function statusChanged() {
    if (statusTimer) return;
    statusTimer = setTimeout(guard('status', () => { statusTimer = null; R.status.value = statusInfo(); }), 500);
  }
  function stateFor(role) {
    const s = { show: { name: active.name, config: active.config, rev: active.rev }, live: liveOf(active.name), vars, media: mediaList(),
                serverTime: Date.now(), modules: Object.keys(MODULES), modTypes: MODTYPES };
    if (role === 'panel') Object.assign(s, { shows: listShows(), settings: publicSettings(), status: statusInfo() });
    return s;
  }

  // ===== Messages from the pages =====
  /* handler(data) → { ok, … } (or a promise of it): the answer the page's
     nodecg.sendMessage() resolves with */
  function listen(name, handler) {
    nodecg.listenFor(name, (data, ack) => {
      Promise.resolve().then(() => handler(U.isObj(data) ? data : {}))
        .catch(e => { log('warn', name + ': ' + (e.stack || e.message)); return fail(e.message); })
        .then(r => {
          /* a message sent without waiting for the answer (another bundle's
             extension, a page's fire-and-forget) has nobody to answer */
          if (typeof ack === 'function' && !ack.handled) try { ack(null, r || ok()); } catch (e) { /* no answer expected */ }
        });
    });
  }
  listen('cmd', (d) => runCommand(d.target, d.cmd, d.text, String(d.from || 'nodecg').slice(0, 20)));
  listen('client', hello);
  /* The active show replaced by a new version: saved (the previous one kept
     as .bak), published, its live state and modules brought in step */
  function commitShow(raw, by) {
    const cfg = normalizeShow(raw);
    const modsBefore = enabledModules().join(',');
    writeJSON(showFile(active.name), cfg, true);
    active.config = cfg; active.rev++;
    lives[active.name] = initLive(cfg, lives[active.name]);
    moduleHooks();
    publishShow(typeof by === 'string' ? by.slice(0, 40) : null);
    liveChanged({ quiet: true });
    companionAll();
    if (enabledModules().join(',') !== modsBefore) assignLeaders();
    modulesOnShow(cfg);
    return cfg;
  }
  /* The whole show (an import, a program): refused when it was made from an
     older version than the active one */
  listen('show:save', (d) => {
    if (d.rev != null && d.rev !== active.rev) return fail('projet modifié ailleurs', { conflict: true, rev: active.rev, config: active.config });
    commitShow(d.config, d.by);
    return ok({ rev: active.rev });
  });
  /* What an editor changed (see U.diff): applied to the show as it is now,
     so two Régies, or a module's panel and the Régie, never undo each
     other's edits. → the show as it now is, for the editor to rebase on */
  listen('show:patch', (d) => {
    const ops = Array.isArray(d.ops) ? d.ops : [];
    if (ops.length > 2000) return fail('trop de modifications à la fois');
    if (!active.config) return fail('aucun projet ouvert');
    /* a path of keys (never __proto__ and the like), a value or a deletion */
    if (!ops.every(op => U.isObj(op) && U.safePath(op.path) && (op.delete === true || op.value !== undefined))) return fail('modification invalide');
    const cfg = U.clone(active.config);
    let applied = 0;
    for (const op of ops) if (U.applyOp(cfg, op)) applied++;
    if (applied) commitShow(cfg, d.by);
    return ok({ rev: active.rev, config: active.config, applied });
  });
  listen('shows', (b) => {
    const name = U.slug(b.name);
    const exists = (n) => fs.existsSync(showFile(n));
    switch (b.action) {
      case 'create': case 'duplicate': case 'import': {
        if (!name) return fail('nom invalide');
        if (exists(name)) return fail('ce nom existe déjà');
        let cfg;
        if (b.action === 'import') cfg = normalizeShow(b.config);
        else if (b.from && exists(U.slug(b.from))) cfg = readShow(U.slug(b.from));
        else cfg = normalizeShow(BLANK);
        if (b.title) cfg.title = String(b.title).slice(0, 120);
        writeJSON(showFile(name), cfg);
        break;
      }
      case 'rename': {
        const from = U.slug(b.from);
        if (!name || !exists(from) || exists(name)) return fail('renommage impossible');
        fs.renameSync(showFile(from), showFile(name));
        const lf = path.join(DATA_DIR, 'live', from + '.json');
        if (fs.existsSync(lf)) fs.renameSync(lf, path.join(DATA_DIR, 'live', name + '.json'));
        lives[name] = lives[from]; delete lives[from];
        if (active.name === from) { active.name = name; settings.active = name; saveSettings(); publishShow(null); }
        break;
      }
      case 'delete': {
        if (name === active.name) return fail('impossible de supprimer le projet actif');
        if (!exists(name)) return fail('projet introuvable');
        fs.renameSync(showFile(name), showFile(name) + '.deleted');
        delete lives[name];
        break;
      }
      case 'activate': {
        if (!exists(name)) return fail('projet introuvable');
        activate(name);
        assignLeaders();
        break;
      }
      default: return fail('action inconnue');
    }
    publishShows();
    return ok({ shows: listShows() });
  });
  listen('settings:save', (b) => {
    if (U.isObj(b.obs)) {
      const o = b.obs;
      if (typeof o.enabled === 'boolean') settings.obs.enabled = o.enabled;
      if (typeof o.host === 'string' && o.host.trim()) settings.obs.host = o.host.trim().slice(0, 100);
      if (Math.round(+o.port) > 0 && Math.round(+o.port) < 65536) settings.obs.port = Math.round(+o.port);
      if (typeof o.password === 'string' && o.password !== '••••••••') settings.obs.password = o.password;
    }
    if (U.isObj(b.companion)) {
      const c = b.companion;
      if (typeof c.enabled === 'boolean') settings.companion.enabled = c.enabled;
      if (typeof c.host === 'string' && c.host.trim()) settings.companion.host = c.host.trim().slice(0, 100) + (c.host.includes(':') ? '' : ':8000');
      if (typeof c.prefix === 'string' && U.slug(c.prefix)) settings.companion.prefix = U.slug(c.prefix);
    }
    saveSettings();
    if (U.isObj(b.obs)) obsConnect();
    if (U.isObj(b.companion)) { comp.last = {}; comp.state = settings.companion.enabled ? 'pending' : 'off'; companionAll(true); }
    R.settings.value = publicSettings();
    statusChanged();
    return ok({ settings: publicSettings() });
  });
  listen('vars', (b) => {
    if (!MODULES[b.m] || leaders[b.m] !== b.id) return fail('pas le relais de ce module', { leader: false });
    if (U.isObj(b.v)) setVars(b.m, b.v);
    return ok();
  });
  listen('flash', (b) => {
    if (b.m && leaders[b.m] !== b.id) return fail('pas le relais de ce module', { leader: false });
    const target = b.target || (b.m ? moduleFlash(b.m) : firstOfType('flash'));
    const g = target && graphicById(target);
    if (!g || g.type !== 'flash') return fail('aucun flash');
    const added = enqueueFlash(g, Object.assign({}, b.item, { module: b.m || null }), !!b.front);
    if (added) liveChanged({ quiet: true });
    return ok({ added });
  });
  listen('mod:status', (b) => {
    const srv = moduleServers[b.m];
    return ok({ status: srv && srv.status ? srv.status() : {} });
  });

  // ===== HTTP =====
  const TYPES = {
    '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.webm': 'video/webm', '.mp4': 'video/mp4',
    '.csv': 'text/csv; charset=utf-8', '.xml': 'application/xml', '.rss': 'application/rss+xml',
  };
  const JSON_TYPE = { 'Content-Type': 'application/json; charset=utf-8' };
  function send(res, status, headers, body) {
    res.writeHead(status, Object.assign({ 'Cache-Control': 'no-store' }, headers));
    res.end(body);
  }
  function sendJSON(res, status, obj) { send(res, status, JSON_TYPE, JSON.stringify(obj)); }
  function readBody(req, max) {
    return new Promise((resolve, reject) => {
      let size = 0; const parts = [];
      req.on('data', c => { size += c.length; if (size > max) { reject(new Error('trop volumineux')); req.destroy(); } else parts.push(c); });
      req.on('end', () => resolve(Buffer.concat(parts)));
      req.on('error', reject);
    });
  }
  /* NodeCG has already read a JSON body (req.body); anything else is still to read */
  async function readJSON(req, max) {
    if (req._body && U.isObj(req.body)) return req.body;
    const raw = (await readBody(req, max || 4 * 1024 * 1024)).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  }
  function serveFile(req, res, file, extra) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, {}, 'not found');
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' }, extra || {});
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (range && (range[1] || range[2])) {
        let a = range[1] ? +range[1] : st.size - +range[2], b = range[1] && range[2] ? +range[2] : st.size - 1;
        if (a >= st.size || a > b) return send(res, 416, { 'Content-Range': 'bytes */' + st.size }, '');
        b = Math.min(b, st.size - 1);
        res.writeHead(206, Object.assign(headers, { 'Content-Range': 'bytes ' + a + '-' + b + '/' + st.size, 'Content-Length': b - a + 1 }));
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(file, { start: a, end: b }).pipe(res);
      }
      res.writeHead(200, Object.assign(headers, { 'Content-Length': st.size }));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }
  /* Requests that change something come from NodeCG's own pages or from a
     program (Companion, curl), never from another site open in a browser:
     Sec-Fetch-Site says where a browser request comes from, and a request by
     name to a host that isn't this machine is a DNS-rebinding attempt. */
  function refused(req) {
    const site = req.headers['sec-fetch-site'];
    if (site === 'cross-site' || site === 'same-site') return 'requête d\'un autre site refusée';
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
      try { if (new URL(origin).host !== req.headers.host) return 'origine refusée'; } catch (e) { return 'origine refusée'; }
    }
    return null;
  }
  function hostAllowed(req) {
    const h = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    return !h || h === 'localhost' || /^[\d.]+$/.test(h) || h.includes(':') || h.endsWith('.local') || ALLOW_HOSTS.includes(h);
  }
  /* → true once answered, false for a path that isn't this bundle's */
  async function route(req, res, url) {
    const p = url.pathname, method = req.method;
    if (p.startsWith('/api/') && !hostAllowed(req)) { send(res, 403, {}, 'host not allowed (allowHosts)'); return true; }
    let m;
    if ((m = /^\/api\/cmd(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(p)) && (method === 'POST' || method === 'GET')) {
      const why = refused(req);
      if (why) { sendJSON(res, 403, { ok: false, error: why }); return true; }
      let target, cmd, text;
      if (method === 'POST') { const b = await readJSON(req, 65536); target = b.target; cmd = b.cmd; text = b.text; }
      else {
        const a = m[1] ? decodeURIComponent(m[1]) : '', b = m[2] ? decodeURIComponent(m[2]) : '';
        if (b) { target = a; cmd = b; } else cmd = a;
        text = url.searchParams.has('text') ? url.searchParams.get('text') : undefined;
      }
      const r = runCommand(target, cmd, text, method === 'GET' ? 'http' : String(url.searchParams.get('from') || 'api'));
      sendJSON(res, r.ok ? 200 : 400, r);
      return true;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      for (const [mm, re, handler] of moduleRoutes) {
        const mt = mm === method && re.exec(p);
        if (mt) { await handler(req, res, url, mt); return true; }
      }
      return false;
    }
    if (p === '/api/state') { sendJSON(res, 200, stateFor('panel')); return true; }
    if (p === '/api/status') { sendJSON(res, 200, statusInfo()); return true; }
    if ((m = /^\/api\/shows\/([a-z0-9_]+)$/.exec(p))) {
      if (!fs.existsSync(showFile(m[1]))) { sendJSON(res, 404, { ok: false, error: 'projet introuvable' }); return true; }
      const headers = Object.assign({}, JSON_TYPE);
      if (url.searchParams.has('download')) headers['Content-Disposition'] = 'attachment; filename="' + m[1] + '.json"';
      send(res, 200, headers, JSON.stringify(readShow(m[1]), null, 2));
      return true;
    }
    if ((m = /^\/media\/([^/]+)$/.exec(p))) {
      let name;
      try { name = decodeURIComponent(m[1]); } catch (e) { send(res, 400, {}, 'bad path'); return true; }
      const file = mediaFile(name);
      if (!file) { send(res, 404, {}, 'not found'); return true; }
      /* an uploaded SVG is an image, never a page that runs scripts */
      serveFile(req, res, file, { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:" });
      return true;
    }
    for (const [mm, re, handler] of moduleRoutes) {
      const mt = (mm === method || (mm === 'GET' && method === 'HEAD')) && re.exec(p);
      if (mt) { await handler(req, res, url, mt); return true; }
    }
    return false;
  }
  const router = nodecg.Router();
  const authCheck = nodecg.util && typeof nodecg.util.authCheck === 'function' ? nodecg.util.authCheck : (req, res, next) => next();
  router.use(authCheck);
  router.use((req, res, next) => {
    const url = new URL(req.url, 'http://local');
    route(req, res, url).then(done => { if (!done) next(); }, e => {
      log('warn', 'http ' + url.pathname + ': ' + e.message);
      if (!res.headersSent) sendJSON(res, e instanceof SyntaxError ? 400 : 500, { ok: false, error: e.message });
    });
  });

  // ===== Modules' server parts =====
  /* modules/<id>/server.js: exports.init(ctx) → { routes: [[method, regex,
     handler(req, res, url, match)]] (paths under /bundles/EclipseGraphics/),
     status() (for the Régie), onShow(config) (a show opened or edited),
     commands / command (as in module.js, with the server's own data at
     hand), onCommand(name, value) (after any of the module's commands),
     stop() }. ctx: */
  function moduleContext(id) {
    const on = () => !!active.config && enabledModules().includes(id);
    const opts = U.isObj(CFG.modules) && U.isObj(CFG.modules[id]) ? CFG.modules[id] : {};
    /* its lines in NodeCG's console under its own name, and in the Régie's log */
    const logger = new nodecg.Logger(BUNDLE + ':' + id);
    const modLog = (level, ...a) => {
      const text = a.join(' ');
      logRing.push({ at: Date.now(), level, text });
      if (logRing.length > 200) logRing.shift();
      if (level === 'warn') logger.warn(text); else logger.info(text);
      statusChanged();
    };
    return {
      id, log: modLog, root: ROOT, dataDir: DATA_DIR, U, nodecg,
      /* an option from the bundle's configuration: modules.<id>.<name> */
      arg: (name, def) => (opts[name] == null ? def : Array.isArray(opts[name]) ? opts[name].join(',') : String(opts[name])),
      /* a file of the media library, by name (an upload, else an example): its path, or null */
      mediaFile,
      activeShow: () => active.config,
      enabled: on,
      /* the module's settings in the active show (defaults filled), null when it's off */
      settings: () => (on() ? moduleSettings(id) : null),
      /* its live state (kept per show, shared with the pages); changed() after editing it */
      state: () => (on() ? liveOf(active.name).modules[id] : null),
      changed: (quiet) => { if (on()) liveChanged({ quiet: !!quiet }); },
      /* variables for the graphics ({{<id>.<name>}}), the Régie and Companion (<id>_<name>) */
      setVars: (v) => { if (on()) setVars(id, v); },
      vars: () => vars[id] || {},
      /* a banner in the module's flash (settings.flash, else the first one) */
      flash: (item, front) => {
        const g = on() && graphicById(moduleFlash(id) || '');
        if (!g || g.type !== 'flash') return false;
        const added = enqueueFlash(g, Object.assign({}, item, { module: id }), !!front);
        if (added) liveChanged({ quiet: true });
        return added;
      },
      command: (target, cmd, text) => runCommand(target, cmd, text, id),
      /* a timer's work, its errors logged instead of stopping NodeCG:
         setInterval(ctx.guard(tick), 1000) */
      guard: (fn) => guard(id, fn),
      /* an event for the Régie (the module's panel.js gets it: onEvent(name, data)) */
      emit: (event, data) => nodecg.sendMessage('mod', { m: id, event, data }),
      /* a sound cue of the bundle (NodeCG's Mixer), played once: sound('alerte') */
      sound: (cue) => {
        const to = on() && cue && soundPage(id);
        if (to) nodecg.sendMessage('sound', { to, m: id, cue: String(cue) });
      },
      now: () => moduleNow(id),
      tz: () => (active.config ? active.config.timezone : 'Europe/Paris'),
    };
  }
  const moduleRoutes = [];
  for (const id in MODULES) {
    const file = path.join(ROOT, 'modules', id, 'server.js');
    if (!fs.existsSync(file)) continue;
    try {
      const part = require(file).init(moduleContext(id));
      moduleServers[id] = part || {};
      for (const r of (part && part.routes) || []) moduleRoutes.push(r);
    } catch (e) { log('warn', 'module ' + id + ' (server): ' + e.message); }
  }

  // ===== Start =====
  R.catalog.value = { version: VERSION, bundle: BUNDLE, modules: Object.keys(MODULES), modTypes: MODTYPES };
  R.settings.value = publicSettings();
  activate(settings.active);
  publishShows();
  publishMedia();
  obsConnect();
  nodecg.mount('/bundles/' + BUNDLE, router);
  log('log', 'Régie        : le tableau de bord NodeCG, espace « Régie »');
  log('log', 'Sortie OBS   : /bundles/' + BUNDLE + '/graphics/overlay.html  (source navigateur 1920×1080)');
  log('log', 'Médias       : ' + ASSETS_ROOT + ' (' + Object.keys(MEDIA_KINDS).join(', ') + ')');

  function shutdown() {
    for (const id in moduleServers) if (moduleServers[id].stop) try { moduleServers[id].stop(); } catch (e) { /* exiting */ }
    try { saveLive(active.name); } catch (e) { /* exiting */ }
    if (obs.ws) try { obs.ws.close(); } catch (e) { /* exiting */ }
  }
  nodecg.on('serverStopping', shutdown);

  /* For other bundles' extensions: nodecg.extensions.EclipseGraphics */
  return {
    command: (target, cmd, text) => runCommand(target, cmd, text, 'bundle'),
    state: () => stateFor('panel'),
  };
};
