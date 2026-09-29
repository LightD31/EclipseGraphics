#!/usr/bin/env node
/* Overlay manager — the server behind the output page (overlay.html, the
   OBS browser source) and the control panel (panel.html, "Régie").

     node server.js [--port 8787] [--host 127.0.0.1] [--show NAME]
                    [--shows shows] [--data data] [--media media]
                    [--allow-host NAME[,NAME…]]
     (plus the modules' own options, e.g. the A350F relay's --every, --watch, --log)

   No dependencies: Node 18+ (22+ for the OBS websocket link, which uses the
   built-in WebSocket client).

   What lives where
     shows/<name>.json   a show: its theme, motion, graphics and their fields,
                         modules and their settings, free variables. Edited
                         from the panel, saved on every change (previous
                         version kept as .bak).
     data/               this machine's runtime state (git-ignored): the
                         settings (OBS link, Companion, active show) and each
                         show's live state (what is on air, layouts, module
                         controls), so a restart picks up where it left off.
     media/              images, videos and fonts uploaded from the panel.
     modules/<id>/       data modules (eclipse, a350f…): module.js describes
                         the module (settings, views, commands) for the server,
                         the panel and the output alike; client.js runs in the
                         output page; server.js, when present, adds routes and
                         background work here.

   One path for every command: the panel, Companion (HTTP, or OBS "Broadcast
   Custom Event"), the output pages' keyboard all end up in runCommand(), which
   changes the live state and broadcasts it (Server-Sent Events). The output
   pages only render what the live state says, so every browser source agrees.

   HTTP API (JSON)
     GET  /api/events                      the event stream (SSE)
     GET  /api/state                       everything, once
     PUT  /api/show                        replace the active show {rev, config}
     POST /api/cmd                         {target, cmd, text}
     GET  /api/cmd/<target>/<cmd>[?text=]  the same, for Companion's Generic HTTP
     POST /api/shows                       {action: create|duplicate|rename|delete|activate|import, …}
     GET  /api/shows[/<name>]              list / one show (?download for a file)
     GET|POST|DELETE /api/media[/<name>]   uploads (POST ?name=, raw body)
     GET|PUT /api/settings                 OBS link, Companion
     GET  /api/status                      health, clients, log
     POST /api/client · /api/vars · /api/flash   the output pages' side channel */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const U = require('./engine/shared.js');

const VERSION = '1.0.0';
const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
}
const ROOT = __dirname;
const PORT = parseInt(arg('port', process.env.PORT || '8787'), 10);
const HOST = arg('host', '127.0.0.1');
const SHOWS_DIR = path.resolve(ROOT, arg('shows', 'shows'));
const DATA_DIR = path.resolve(ROOT, arg('data', 'data'));
const MEDIA_DIR = path.resolve(ROOT, arg('media', 'media'));
const ALLOW_HOSTS = arg('allow-host', '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
for (const d of [SHOWS_DIR, DATA_DIR, path.join(DATA_DIR, 'live'), MEDIA_DIR]) fs.mkdirSync(d, { recursive: true });

// ===== Log: the last lines, for the panel =====
const logRing = [];
function log(level, ...a) {
  const text = a.join(' ');
  logRing.push({ at: Date.now(), level, text });
  if (logRing.length > 200) logRing.shift();
  (level === 'warn' ? console.warn : console.log)(new Date().toISOString().slice(11, 19), text);
}

// ===== Settings: this machine's, not the show's =====
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const settings = {
  active: 'demo',
  obs: { enabled: false, host: '127.0.0.1', port: 4455, password: '' },
  companion: { enabled: false, host: '127.0.0.1:8000', prefix: 'gfx' },
};
try { U.withDefaults(Object.assign(settings, JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))), settings); } catch (e) { /* first run */ }
if (arg('show')) settings.active = U.slug(arg('show')) || settings.active;
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
   modules/<id>/server.js: optional, init(ctx) → { routes, status, onShow } */
const MODULES = {};
const moduleServers = {};
for (const dir of fs.existsSync(path.join(ROOT, 'modules')) ? fs.readdirSync(path.join(ROOT, 'modules')) : []) {
  const file = path.join(ROOT, 'modules', dir, 'module.js');
  if (!fs.existsSync(file)) continue;
  try {
    const m = require(file);
    if (!m || m.id !== dir) throw new Error('its id must be the folder name');
    MODULES[m.id] = m;
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
/* Whatever comes in (a file edited by hand, an import, the panel) → a show
   the rest can rely on; graphic ids unique and usable in variable names */
function normalizeShow(c) {
  c = U.isObj(c) ? c : {};
  const out = {
    version: 1,
    title: typeof c.title === 'string' && c.title.trim() ? c.title.trim().slice(0, 120) : 'Sans titre',
    timezone: typeof c.timezone === 'string' && validTz(c.timezone) ? c.timezone : 'Europe/Paris',
    theme: U.isObj(c.theme) ? c.theme : {},
    motion: U.isObj(c.motion) ? c.motion : {},
    modules: U.isObj(c.modules) ? c.modules : {},
    variables: [],
    graphics: [],
  };
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
  liveOf(name);
  moduleHooks();
  for (const id in moduleServers) if (moduleServers[id].onShow) moduleServers[id].onShow(cfg);
  log('log', 'show: ' + name + ' (' + cfg.title + ')');
}
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
  for (const k of Object.keys(live.vars)) if (!show.variables.some(v => v.name === k)) delete live.vars[k];
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
function liveChanged(opts) {
  const live = liveOf(active.name);
  broadcast('live', { live });
  if (!(opts && opts.quiet)) companionAll();
  clearTimeout(liveSaveTimer);
  const name = active.name;
  liveSaveTimer = setTimeout(() => writeJSON(path.join(DATA_DIR, 'live', name + '.json'), lives[name]), 400);
}

// ===== Clients: the event stream =====
const clients = new Map(); /* id → { id, role, res, modules, only, at } */
function sse(res, event, data) { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); }
function broadcast(event, data, filter) {
  for (const c of clients.values()) if (!filter || filter(c)) sse(c.res, event, data);
}
setInterval(() => { for (const c of clients.values()) c.res.write(': ping\n\n'); }, 15000);

/* Module variables come from the output pages, which run the modules: one
   page per module (its leader) reports them, so two sources with timers a
   tick apart don't make the values flicker. */
const vars = {};          /* module → { name: value } */
const leaders = {};       /* module → client id */
function assignLeaders() {
  const want = enabledModules();
  for (const m of Object.keys(leaders)) if (!want.includes(m)) delete leaders[m];
  const told = new Set();
  for (const m of want) {
    const cur = clients.get(leaders[m]);
    if (cur && cur.modules.includes(m)) continue;
    const next = [...clients.values()].find(c => c.role === 'output' && c.modules.includes(m));
    if (next) { leaders[m] = next.id; told.add(next.id); } else delete leaders[m];
  }
  for (const id of told) {
    const c = clients.get(id);
    sse(c.res, 'leader', { modules: Object.keys(leaders).filter(m => leaders[m] === id) });
  }
}

// ===== Commands =====
function ok(extra) { return Object.assign({ ok: true }, extra); }
function fail(error) { return { ok: false, error }; }
function graphicById(id) { return active.config.graphics.find(g => g.id === id); }
function firstOfType(type) { const g = active.config.graphics.find(x => x.type === type); return g && g.id; }
/* A module's own graphic: the one its settings name, else the first bandeau
   showing one of its visuals */
function moduleGraphic(mid) {
  const s = moduleSettings(mid);
  if (s.graphic && graphicById(s.graphic)) return s.graphic;
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
  const r = execCommand(target, cmd, text, source);
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
    if (cmd === 'reload') { broadcast('reload', {}, c => c.role === 'output'); return ok(); }
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
function moduleCommand(mid, cmd, text) {
  const M = MODULES[mid];
  const dot = cmd.indexOf('.');
  const ns = dot < 0 ? cmd : cmd.slice(0, dot), v = dot < 0 ? '' : cmd.slice(dot + 1);
  const fn = M.commands && M.commands[ns];
  if (!fn) return null;
  const live = liveOf(active.name), st = live.modules[mid];
  const set = moduleSettings(mid), tz = active.config.timezone;
  const ctx = {
    state: st, settings: set, vars: vars[mid] || {}, text, tz, U,
    now: () => moduleNow(mid),
    when: (s) => U.parseWhen(s, tz, set.date || U.dayOf(moduleNow(mid), tz)),
  };
  let r;
  try { r = fn(v, ctx); } catch (e) { return fail(e.message); }
  if (r === false) return fail('valeur refusée : ' + cmd);
  liveChanged();
  broadcast('module', { m: mid, cmd, text }, c => c.role === 'output');
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
let tickBusy = false;
setInterval(() => {
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
}, 200);

// ===== Module variables =====
/* Text values go to Companion — not the lists and ratios meant for the
   graphics, nor what a module marks as screen-only (its ticking clock) */
function forCompanion(m, k, v) {
  if (k.charAt(0) === '_' || typeof v !== 'string') return false;
  const d = (MODULES[m] && MODULES[m].vars || []).find(x => x.name === k);
  return !(d && d.screen);
}
function setVars(m, v) {
  const cur = vars[m] || (vars[m] = {});
  const changed = {};
  for (const k in v) {
    if (JSON.stringify(cur[k]) === JSON.stringify(v[k])) continue;
    cur[k] = v[k]; changed[k] = v[k];
  }
  if (!Object.keys(changed).length) return;
  broadcast('vars', { m, v: changed });
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
      await Promise.all(batch.map(([name, value]) =>
        fetch('http://' + settings.companion.host + '/api/custom-variable/' + encodeURIComponent(name) + '/value?value=' +
              encodeURIComponent(value), { method: 'POST', signal: AbortSignal.timeout(3000) })
          .then(r => { if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status); comp.sent++; comp.state = 'ok'; comp.error = ''; })
          .catch(e => { if (comp.state !== 'error') log('warn', 'companion: ' + e.message); comp.state = 'error'; comp.error = e.message; })));
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
setInterval(() => companionAll(true), 60000);

// ===== OBS websocket (v5): Companion's "Broadcast Custom Event" =====
/* The server listens once for every page: {"gfx": "<target>:<cmd>"} or
   {"gfx": "<cmd>", "target": "<id>", "text": "…"}; the event keys the old
   overlays used ({"eclipse": …}, {"a350f": …}) reach their module. */
const obs = { ws: null, state: 'off', error: '', timer: null, gen: 0 };
function b64sha(s) { return crypto.createHash('sha256').update(s).digest('base64'); }
function obsStatus(state, error) {
  obs.state = state; obs.error = error || '';
  broadcast('status', { obs: { state: obs.state, error: obs.error } }, c => c.role === 'panel');
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
  ws.onmessage = (ev) => {
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
  };
  ws.onclose = (ev) => {
    if (gen !== obs.gen) return;
    obs.ws = null;
    obsStatus(ev.code === 4009 ? 'auth' : 'error', ev.code === 4009 ? 'mot de passe refusé' : 'déconnecté');
    obs.timer = setTimeout(obsConnect, 5000);
  };
  ws.onerror = () => { /* onclose follows */ };
}

// ===== HTTP =====
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jsonl': 'application/x-ndjson; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.webm': 'video/webm', '.mp4': 'video/mp4',
};
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|woff2?|ttf|otf|webm|mp4)$/i;
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
async function readJSON(req, max) {
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
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { return send(res, 400, {}, 'bad path'); }
  if (rel.startsWith('/media/')) {
    const name = path.basename(rel);
    if (!MEDIA_EXT.test(name) || name.startsWith('.')) return send(res, 404, {}, 'not found');
    /* an uploaded SVG is an image, never a page that runs scripts */
    return serveFile(req, res, path.join(MEDIA_DIR, name), { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:" });
  }
  const file = path.normalize(path.join(ROOT, rel));
  const r = path.relative(ROOT, file);
  /* inside the folder only, and never the dotfiles (.git…) or this machine's
     runtime state (data/: the OBS password is in there) */
  if (!file.startsWith(ROOT + path.sep) || /(^|[\\/])\./.test(r) || /^(data|node_modules)([\\/]|$)/.test(r) ||
      path.resolve(file).startsWith(DATA_DIR + path.sep)) return send(res, 404, {}, 'not found');
  serveFile(req, res, file);
}
/* Requests that change something come from this server's own pages or from
   a program (Companion, curl), never from another site open in a browser:
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
function mediaList() {
  return fs.readdirSync(MEDIA_DIR).filter(f => MEDIA_EXT.test(f) && !f.startsWith('.')).map(f => {
    const st = fs.statSync(path.join(MEDIA_DIR, f));
    const ext = path.extname(f).toLowerCase();
    return { name: f, url: 'media/' + encodeURIComponent(f), size: st.size, mtime: st.mtimeMs,
             kind: /woff2?|ttf|otf/.test(ext) ? 'font' : /webm|mp4/.test(ext) ? 'video' : 'image' };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
function statusInfo() {
  return {
    version: VERSION, boot: BOOT, now: Date.now(), port: PORT, host: HOST,
    obs: { state: obs.state, error: obs.error }, companion: { state: settings.companion.enabled ? comp.state : 'off', error: comp.error, sent: comp.sent },
    clients: [...clients.values()].map(c => ({ id: c.id, role: c.role, modules: c.modules, only: c.only, at: c.at, ua: c.ua })),
    leaders, log: logRing.slice(-80),
  };
}
function stateFor(role) {
  const s = { show: { name: active.name, config: active.config, rev: active.rev }, live: liveOf(active.name), vars, media: mediaList(),
              serverTime: Date.now(), modules: Object.keys(MODULES) };
  if (role === 'panel') Object.assign(s, { shows: listShows(), settings: publicSettings(), status: statusInfo() });
  return s;
}
const BOOT = Date.now();

async function api(req, res, url) {
  const p = url.pathname, method = req.method;
  if (method !== 'GET' && method !== 'HEAD' || p.startsWith('/api/cmd/')) {
    const why = refused(req);
    if (why) return sendJSON(res, 403, { ok: false, error: why });
  }
  if (p === '/api/events' && method === 'GET') {
    const id = String(url.searchParams.get('id') || crypto.randomBytes(4).toString('hex')).slice(0, 40);
    const role = url.searchParams.get('role') === 'panel' ? 'panel' : 'output';
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    const old = clients.get(id);
    const c = { id, role, res, modules: old ? old.modules : [], only: url.searchParams.get('only') || '', at: Date.now(), ua: String(req.headers['user-agent'] || '').slice(0, 120) };
    clients.set(id, c);
    sse(res, 'hello', Object.assign({ id }, stateFor(role)));
    if (role === 'output') {
      const led = Object.keys(leaders).filter(m => leaders[m] === id);
      if (led.length) sse(res, 'leader', { modules: led });
      assignLeaders();
    }
    req.on('close', () => { if (clients.get(id) === c) { clients.delete(id); assignLeaders(); } });
    return;
  }
  if (p === '/api/state' && method === 'GET') return sendJSON(res, 200, stateFor('panel'));
  if (p === '/api/status' && method === 'GET') return sendJSON(res, 200, statusInfo());

  if (p === '/api/show' && method === 'PUT') {
    const body = await readJSON(req);
    if (body.rev != null && body.rev !== active.rev) return sendJSON(res, 409, { ok: false, error: 'projet modifié ailleurs', rev: active.rev, config: active.config });
    const cfg = normalizeShow(body.config);
    const modsBefore = enabledModules().join(',');
    writeJSON(showFile(active.name), cfg, true);
    active.config = cfg; active.rev++;
    lives[active.name] = initLive(cfg, lives[active.name]);
    moduleHooks();
    broadcast('show', { name: active.name, config: cfg, rev: active.rev, by: body.by || null });
    liveChanged({ quiet: true });
    companionAll();
    if (enabledModules().join(',') !== modsBefore) assignLeaders();
    for (const id in moduleServers) if (moduleServers[id].onShow) moduleServers[id].onShow(cfg);
    return sendJSON(res, 200, { ok: true, rev: active.rev, config: cfg });
  }

  let m;
  if ((m = /^\/api\/cmd(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(p)) && (method === 'POST' || method === 'GET')) {
    let target, cmd, text;
    if (method === 'POST') { const b = await readJSON(req, 65536); target = b.target; cmd = b.cmd; text = b.text; }
    else {
      const a = m[1] ? decodeURIComponent(m[1]) : '', b = m[2] ? decodeURIComponent(m[2]) : '';
      if (b) { target = a; cmd = b; } else cmd = a;
      text = url.searchParams.has('text') ? url.searchParams.get('text') : undefined;
    }
    const r = runCommand(target, cmd, text, method === 'GET' ? 'http' : String(url.searchParams.get('from') || 'api'));
    return sendJSON(res, r.ok ? 200 : 400, r);
  }

  if (p === '/api/client' && method === 'POST') {
    const b = await readJSON(req, 65536);
    const c = clients.get(String(b.id || ''));
    if (!c) return sendJSON(res, 404, { ok: false, error: 'client inconnu' });
    c.modules = (Array.isArray(b.modules) ? b.modules : []).filter(x => MODULES[x]);
    assignLeaders();
    return sendJSON(res, 200, { ok: true, leader: Object.keys(leaders).filter(x => leaders[x] === c.id) });
  }
  if (p === '/api/vars' && method === 'POST') {
    const b = await readJSON(req, 1024 * 1024);
    if (!MODULES[b.m] || leaders[b.m] !== b.id) return sendJSON(res, 409, { ok: false, leader: false });
    if (U.isObj(b.v)) setVars(b.m, b.v);
    return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/flash' && method === 'POST') {
    const b = await readJSON(req, 65536);
    if (b.m && leaders[b.m] !== b.id) return sendJSON(res, 409, { ok: false, leader: false });
    const target = b.target || (b.m ? moduleFlash(b.m) : firstOfType('flash'));
    const g = target && graphicById(target);
    if (!g || g.type !== 'flash') return sendJSON(res, 404, { ok: false, error: 'aucun flash' });
    const added = enqueueFlash(g, Object.assign({}, b.item, { module: b.m || null }), !!b.front);
    if (added) liveChanged({ quiet: true });
    return sendJSON(res, 200, { ok: true, added });
  }

  if (p === '/api/shows' && method === 'GET') return sendJSON(res, 200, listShows());
  if ((m = /^\/api\/shows\/([a-z0-9_]+)$/.exec(p)) && method === 'GET') {
    if (!fs.existsSync(showFile(m[1]))) return sendJSON(res, 404, { ok: false, error: 'projet introuvable' });
    const cfg = readShow(m[1]);
    const headers = Object.assign({}, JSON_TYPE);
    if (url.searchParams.has('download')) headers['Content-Disposition'] = 'attachment; filename="' + m[1] + '.json"';
    return send(res, 200, headers, JSON.stringify(cfg, null, 2));
  }
  if (p === '/api/shows' && method === 'POST') {
    const b = await readJSON(req);
    const name = U.slug(b.name);
    const exists = (n) => fs.existsSync(showFile(n));
    switch (b.action) {
      case 'create': case 'duplicate': case 'import': {
        if (!name) return sendJSON(res, 400, { ok: false, error: 'nom invalide' });
        if (exists(name)) return sendJSON(res, 409, { ok: false, error: 'ce nom existe déjà' });
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
        if (!name || !exists(from) || exists(name)) return sendJSON(res, 400, { ok: false, error: 'renommage impossible' });
        fs.renameSync(showFile(from), showFile(name));
        const lf = path.join(DATA_DIR, 'live', from + '.json');
        if (fs.existsSync(lf)) fs.renameSync(lf, path.join(DATA_DIR, 'live', name + '.json'));
        lives[name] = lives[from]; delete lives[from];
        if (active.name === from) { active.name = name; settings.active = name; saveSettings(); }
        break;
      }
      case 'delete': {
        if (name === active.name) return sendJSON(res, 400, { ok: false, error: 'impossible de supprimer le projet actif' });
        if (!exists(name)) return sendJSON(res, 404, { ok: false, error: 'projet introuvable' });
        fs.renameSync(showFile(name), showFile(name) + '.deleted');
        delete lives[name];
        break;
      }
      case 'activate': {
        if (!exists(name)) return sendJSON(res, 404, { ok: false, error: 'projet introuvable' });
        activate(name);
        broadcast('show', { name: active.name, config: active.config, rev: active.rev, switched: true });
        liveChanged();
        assignLeaders();
        broadcast('vars', { reset: true, m: null, v: {} });
        break;
      }
      default: return sendJSON(res, 400, { ok: false, error: 'action inconnue' });
    }
    broadcast('shows', { shows: listShows() }, c => c.role === 'panel');
    return sendJSON(res, 200, { ok: true, shows: listShows() });
  }

  if (p === '/api/media' && method === 'GET') return sendJSON(res, 200, mediaList());
  if (p === '/api/media' && method === 'POST') {
    let name = path.basename(String(url.searchParams.get('name') || '')).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w.-]+/g, '-').replace(/^[.-]+/, '').slice(-80);
    if (!MEDIA_EXT.test(name)) return sendJSON(res, 400, { ok: false, error: 'type de fichier non pris en charge' });
    const stem = name.replace(/\.[^.]+$/, ''), ext = name.slice(stem.length);
    for (let i = 2; fs.existsSync(path.join(MEDIA_DIR, name)); i++) name = stem + '-' + i + ext;
    const buf = await readBody(req, 150 * 1024 * 1024);
    fs.writeFileSync(path.join(MEDIA_DIR, name), buf);
    log('log', 'media: ' + name + ' (' + Math.round(buf.length / 1024) + ' Kio)');
    broadcast('media', { media: mediaList() });
    return sendJSON(res, 200, { ok: true, name, url: 'media/' + encodeURIComponent(name) });
  }
  if ((m = /^\/api\/media\/([^/]+)$/.exec(p)) && method === 'DELETE') {
    const name = path.basename(decodeURIComponent(m[1]));
    if (!MEDIA_EXT.test(name) || !fs.existsSync(path.join(MEDIA_DIR, name))) return sendJSON(res, 404, { ok: false, error: 'introuvable' });
    fs.unlinkSync(path.join(MEDIA_DIR, name));
    broadcast('media', { media: mediaList() });
    return sendJSON(res, 200, { ok: true });
  }

  if (p === '/api/settings' && method === 'GET') return sendJSON(res, 200, publicSettings());
  if (p === '/api/settings' && method === 'PUT') {
    const b = await readJSON(req, 65536);
    if (U.isObj(b.obs)) {
      const o = b.obs;
      if (typeof o.enabled === 'boolean') settings.obs.enabled = o.enabled;
      if (typeof o.host === 'string' && o.host.trim()) settings.obs.host = o.host.trim().slice(0, 100);
      if (+o.port > 0 && +o.port < 65536) settings.obs.port = +o.port;
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
    broadcast('settings', { settings: publicSettings() }, c => c.role === 'panel');
    return sendJSON(res, 200, { ok: true, settings: publicSettings() });
  }
  if ((m = /^\/api\/modules\/(\w+)\/status$/.exec(p)) && method === 'GET') {
    const srv = moduleServers[m[1]];
    return sendJSON(res, 200, srv && srv.status ? srv.status() : {});
  }
  return sendJSON(res, 404, { ok: false, error: 'route inconnue' });
}

// ===== Modules' server parts =====
const moduleRoutes = [];
for (const id in MODULES) {
  const file = path.join(ROOT, 'modules', id, 'server.js');
  if (!fs.existsSync(file)) continue;
  try {
    const part = require(file).init({
      log, arg, root: ROOT, dataDir: DATA_DIR, U,
      activeShow: () => active.config,
      settings: () => (active.config && enabledModules().includes(id) ? moduleSettings(id) : null),
    });
    moduleServers[id] = part || {};
    for (const r of (part && part.routes) || []) moduleRoutes.push(r);
  } catch (e) { log('warn', 'module ' + id + ' (server): ' + e.message); }
}

activate(settings.active);
obsConnect();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (!hostAllowed(req)) return send(res, 403, {}, 'host not allowed (--allow-host)');
  if (req.method === 'OPTIONS') {
    return send(res, 204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type' }, '');
  }
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch(e => {
      log('warn', 'api ' + url.pathname + ': ' + e.message);
      if (!res.headersSent) sendJSON(res, e instanceof SyntaxError ? 400 : 500, { ok: false, error: e.message });
    });
    return;
  }
  for (const [method, re, handler] of moduleRoutes) {
    const mm = re.exec(url.pathname);
    if (mm && (method === req.method || (method === 'GET' && req.method === 'HEAD'))) {
      Promise.resolve(handler(req, res, url, mm)).catch(e => { if (!res.headersSent) sendJSON(res, 500, { error: e.message }); });
      return;
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {}, 'method not allowed');
  if (url.pathname === '/') return send(res, 302, { Location: '/panel.html' }, '');
  serveStatic(req, res, url.pathname);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' déjà utilisé (a350f-relay.js tourne-t-il encore ?) — essayez --port ' + (PORT + 1));
    process.exit(1);
  }
  throw e;
});
server.listen(PORT, HOST, () => {
  log('log', 'Régie        http://' + (HOST === '0.0.0.0' ? '127.0.0.1' : HOST) + ':' + PORT + '/panel.html');
  log('log', 'Sortie OBS   http://' + (HOST === '0.0.0.0' ? '127.0.0.1' : HOST) + ':' + PORT + '/overlay.html  (source navigateur 1920×1080)');
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') log('warn', 'à l\'écoute sur ' + HOST + ' : toute machine du réseau peut piloter l\'habillage');
});
process.on('uncaughtException', (e) => log('warn', 'erreur: ' + (e.stack || e.message)));
function shutdown() {
  for (const id in moduleServers) if (moduleServers[id].stop) try { moduleServers[id].stop(); } catch (e) { /* exiting */ }
  if (lives[active.name]) writeJSON(path.join(DATA_DIR, 'live', active.name + '.json'), lives[active.name]);
  setTimeout(() => process.exit(0), 300).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
