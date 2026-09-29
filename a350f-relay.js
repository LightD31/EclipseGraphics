#!/usr/bin/env node
/* Local relay for a350f-first-flight.html.

   The public ADS-B APIs the overlay reads (adsb.lol, adsb.fi) answer a
   server fine but send no CORS headers, so a browser source cannot read them
   from its own page. This serves the overlay folder over HTTP and forwards
   /adsb/* to those APIs from the same origin, so the page never makes a
   cross-origin request. No dependencies: Node 18+ (for the built-in fetch).

     node a350f-relay.js [--port 8787] [--host 127.0.0.1]
                         [--watch 39a53b[,hex…]|none] [--log flight-log]

   OBS browser source:  http://127.0.0.1:8787/a350f-first-flight.html

   Routes
     GET /adsb/hex/<icao24>      aircraft by transponder address
     GET /adsb/reg/<reg>         aircraft by registration
     GET /adsb/callsign/<cs>     aircraft by callsign
     GET /adsb/history/<icao24>  every point recorded for it (?since=<ms>, ?raw=1)
     GET /<file>                 static files from this folder

   The /adsb answers are the upstream's own readsb JSON ({"ac":[…]}) plus
   "src": the upstream that served it, "_age": how long ago (ms) the relay
   fetched it, and "_rec": a version of the recording that changes whenever
   holes in its past get filled (so the page knows to fetch it again). Upstreams are tried in order; each is held to ~1
   request/s (their published limit) and backs off for 30 s after an error,
   and one answer is shared by every caller, so several browser sources on
   the same machine cost the API one request.

   Flight recorder
     Every point the APIs return is kept, with all its fields, in memory and
     in <log>/<icao24>-<UTC date>.jsonl (one JSON object per line, "_t" =
     when the position was measured, epoch ms), and reloaded on restart. The
     relay polls each watched aircraft itself (F-WXLD by default, plus any
     the page asks for), so the recording goes on with every browser source
     closed. After an outage — the upstreams unreachable, the relay itself
     stopped, or the aircraft out of receiver coverage — it fills the hole
     from adsb.lol's own trace of the aircraft (the one its map draws),
     keeping its own finer points wherever it has them. The page fetches
     /adsb/history on load and after any reconnection, so the whole flight
     can be redrawn from here at any time. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
const PORT = parseInt(arg('port', process.env.PORT || '8787'), 10);
const HOST = arg('host', '127.0.0.1');
const ROOT = __dirname;
const LOG_DIR = path.resolve(ROOT, arg('log', 'flight-log'));

const UPSTREAMS = [
  {
    name: 'adsb.lol',
    url: {
      hex: v => 'https://api.adsb.lol/v2/hex/' + v,
      reg: v => 'https://api.adsb.lol/v2/reg/' + v,
      callsign: v => 'https://api.adsb.lol/v2/callsign/' + v,
    },
  },
  {
    name: 'adsb.fi',
    url: {
      hex: v => 'https://opendata.adsb.fi/api/v2/hex/' + v,
      reg: v => 'https://opendata.adsb.fi/api/v2/registration/' + v,
      callsign: v => 'https://opendata.adsb.fi/api/v2/callsign/' + v,
    },
  },
].map(u => Object.assign(u, { last: 0, failUntil: 0 }));
/* adsb.lol's tar1090 traces: the whole day, and the last ~25 minutes */
const TRACE_URL = (hex, kind) =>
  'https://globe.adsb.lol/data/traces/' + hex.slice(-2) + '/trace_' + kind + '_' + hex + '.json';

const VALID = {
  hex: /^[0-9a-f]{6}$/i,
  reg: /^[A-Z0-9-]{2,10}$/i,
  callsign: /^[A-Z0-9]{2,8}$/i,
};
const HEADERS = { 'User-Agent': 'EclipseGraphics-A350F-relay/1.1', 'Accept': 'application/json' };
const MIN_INTERVAL = 1100;  /* per upstream: their limit is 1 req/s */
const CACHE_MS = 1000;      /* one answer serves every caller for this long… */
const WATCHED_CACHE_MS = 2500; /* …or this long when the watcher refreshes it anyway */
const BACKOFF_MS = 30000;   /* after an error or a 429 */
const TIMEOUT_MS = 6000;
const WATCH_MS = 2000;      /* watcher poll, aircraft seen in the last 10 min */
const IDLE_WATCH_MS = 10000; /* watcher poll otherwise */
const GAP_MS = 60000;       /* a hole this long in the recording triggers a backfill */
const TRACE_NEAR_MS = 8000; /* trace points closer than this to a recorded one are redundant */

const cache = new Map();    /* "kind/value" -> { at, body } */
const BOOT = Date.now();    /* with filled: lets a page tell that the past changed */
let filled = 0;             /* points put into holes (trace backfills) since start */
const inflight = new Map(); /* "kind/value" -> Promise<{ at, body }> */

async function fetchUpstream(kind, value) {
  const errors = [];
  for (const up of UPSTREAMS) {
    const t = Date.now();
    if (t < up.failUntil) { errors.push(up.name + ': backing off'); continue; }
    if (t - up.last < MIN_INTERVAL) { errors.push(up.name + ': rate limit'); continue; }
    up.last = t;
    try {
      const res = await fetch(up.url[kind](value), { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      json.src = up.name;
      return json;
    } catch (e) {
      up.failUntil = Date.now() + BACKOFF_MS;
      errors.push(up.name + ': ' + e.message);
      console.warn(new Date().toISOString(), up.name, kind, value, e.message);
    }
  }
  throw new Error(errors.join('; '));
}

/* → { at, body, gaps, stale? }. Every fresh answer goes through the
   recorder; gaps is what it found (see record). */
async function adsb(kind, value, maxAge) {
  const key = kind + '/' + value.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < maxAge) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = fetchUpstream(kind, value).then(body => {
    const entry = { at: Date.now(), body, gaps: record(body) };
    cache.set(key, entry);
    return entry;
  }).catch(err => {
    /* Every upstream busy or down: a slightly old answer beats none — its
       _age says how old, and the page accounts for it. */
    if (hit) return Object.assign({}, hit, { stale: true });
    throw err;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ===== Flight recorder =====
const flights = new Map(); /* icao24 -> { pts: [...] sorted by _t, seenAt } */
const streams = new Map(); /* log file -> WriteStream */
function flight(hex) {
  if (!flights.has(hex)) flights.set(hex, { pts: [], seenAt: 0 });
  return flights.get(hex);
}
function firstAtOrAfter(pts, t) {
  let lo = 0, hi = pts.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid]._t < t) lo = mid + 1; else hi = mid; }
  return lo;
}
function logPoint(p) {
  const file = path.join(LOG_DIR, p.hex + '-' + new Date(p._t).toISOString().slice(0, 10) + '.jsonl');
  let s = streams.get(file);
  if (!s) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    s = fs.createWriteStream(file, { flags: 'a' });
    s.on('error', e => console.warn('log', file, e.message));
    streams.set(file, s);
  }
  s.write(JSON.stringify(p) + '\n');
}
/* Insert p in time order. 'live' drops only a repeat of a report already
   held (same position within a second: the same answer fetched twice);
   'trace' only fills holes, leaving whatever the relay recorded itself.
   → false if dropped, otherwise the time since the previous point (ms). */
function addPoint(p, mode, persist) {
  const f = flight(p.hex), pts = f.pts;
  const i = firstAtOrAfter(pts, p._t);
  const near = mode === 'trace' ? TRACE_NEAR_MS : 1000;
  for (const q of [pts[i - 1], pts[i]]) {
    if (q && Math.abs(q._t - p._t) < near && (mode === 'trace' || (q.lat === p.lat && q.lon === p.lon))) return false;
  }
  pts.splice(i, 0, p);
  if (persist !== false) logPoint(p);
  return i ? p._t - pts[i - 1]._t : Infinity;
}
function upstreamNow(body) {
  const n = +body.now;
  return n > 1e12 ? n : n * 1000;
}
/* Every aircraft in an upstream answer → recorder. Returns, per aircraft,
   the gap before its newest point, so the watcher can spot a hole. */
function record(body) {
  const now = upstreamNow(body), gaps = {};
  if (!now) return gaps;
  for (const a of body.ac || body.aircraft || []) {
    if (typeof a.lat !== 'number' || typeof a.lon !== 'number' || !VALID.hex.test(a.hex || '')) continue;
    const seen = typeof a.seen_pos === 'number' ? a.seen_pos : (a.seen || 0);
    const p = Object.assign({}, a, { hex: a.hex.toLowerCase(), _t: Math.round(now - seen * 1000), _src: body.src });
    const gap = addPoint(p, 'live');
    if (gap !== false) { flight(p.hex).seenAt = Date.now(); gaps[p.hex] = gap; }
  }
  return gaps;
}
/* A tar1090 trace (adsb.lol's map data) → points, merged into the holes */
function importTrace(hex, tr, since) {
  let n = 0;
  for (const q of tr.trace || []) {
    const t = Math.round((tr.timestamp + q[0]) * 1000);
    if (t < since || typeof q[1] !== 'number' || typeof q[2] !== 'number') continue;
    const flags = q[6] || 0;
    // [dt, lat, lon, alt, gs, track, flags, vrate, extra{}, source, alt_geom, geom_rate, ias, roll]
    const p = Object.assign({}, q[8] || {}, { hex: hex, lat: q[1], lon: q[2], _t: t, _src: 'adsb.lol trace' });
    if (tr.r) p.r = tr.r;
    if (q[4] != null) p.gs = q[4];
    if (q[5] != null) p.track = q[5];
    if (q[3] === 'ground' || !(flags & 8)) p.alt_baro = q[3];
    else p.alt_geom = q[3];
    if (q[7] != null) p[flags & 4 ? 'geom_rate' : 'baro_rate'] = q[7];
    if (q[10] != null) p.alt_geom = q[10];
    if (q[12] != null) p.ias = q[12];
    if (addPoint(p, 'trace') !== false) n++;
  }
  filled += n;
  return n;
}
async function backfill(hex, why) {
  const w = watched.get(hex);
  w.lastBackfill = Date.now();
  w.pending = false;
  // the recording is per day: take today's part of the trace (UTC)
  const since = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  let added = 0;
  for (const kind of ['full', 'recent']) {
    try {
      const res = await fetch(TRACE_URL(hex, kind), { headers: HEADERS, signal: AbortSignal.timeout(15000) });
      if (res.status === 404) continue; // nothing recorded for it lately
      if (!res.ok) throw new Error('HTTP ' + res.status);
      added += importTrace(hex, await res.json(), since);
    } catch (e) {
      console.warn(new Date().toISOString(), 'trace', kind, hex, e.message);
    }
  }
  if (added) console.log(new Date().toISOString(), 'backfill', hex, '(' + why + '): +' + added + ' points from the adsb.lol trace');
}
function loadLogs() {
  let files = [];
  try { files = fs.readdirSync(LOG_DIR).filter(f => /^[0-9a-f]{6}-\d{4}-\d\d-\d\d\.jsonl$/.test(f)); } catch (e) { return; }
  for (const file of files) {
    for (const line of fs.readFileSync(path.join(LOG_DIR, file), 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const p = JSON.parse(line);
        if (VALID.hex.test(p.hex || '') && typeof p._t === 'number') flight(p.hex).pts.push(p);
      } catch (e) { /* a line cut short by a crash */ }
    }
  }
  for (const [hex, f] of flights) {
    f.pts.sort((a, b) => a._t - b._t);
    console.log('recorded so far: ' + hex + ' ' + f.pts.length + ' points');
  }
}

// ===== Watcher: keeps recording with no browser source open =====
const watched = new Map(); /* icao24 -> { next, failSince, lastBackfill, pending, followUpAt } */
function watch(hex) {
  hex = hex.toLowerCase();
  if (watched.has(hex)) return;
  watched.set(hex, { next: 0, failSince: 0, lastBackfill: 0, pending: true, followUpAt: 0 });
  console.log('watching ' + hex);
}
function requestBackfill(hex, why) {
  const w = watched.get(hex);
  if (!w) return;
  // at most one per minute; the trace itself is only rewritten every few
  // minutes upstream, so look again 3 minutes later for its latest part
  if (Date.now() - w.lastBackfill < 60000) { w.pending = true; return; }
  w.followUpAt = Date.now() + 180000;
  backfill(hex, why);
}
setInterval(() => {
  const t = Date.now();
  for (const [hex, w] of watched) {
    if (w.pending && t - w.lastBackfill >= 60000) backfill(hex, w.lastBackfill ? 'retry' : 'start');
    if (w.followUpAt && t >= w.followUpAt) { w.followUpAt = 0; requestBackfill(hex, 'follow-up'); }
    if (t < w.next) continue;
    w.next = t + (t - flight(hex).seenAt < 600000 ? WATCH_MS : IDLE_WATCH_MS);
    adsb('hex', hex, 1500).then(e => {
      if (e.stale) throw new Error('stale');
      if (w.failSince && Date.now() - w.failSince > 20000) requestBackfill(hex, 'reconnected');
      w.failSince = 0;
      // a hole before the newest point (whoever fetched it): fill it once
      const gap = e.gaps[hex];
      if (gap > GAP_MS && gap !== Infinity && !e.gapSeen) { e.gapSeen = true; requestBackfill(hex, 'gap'); }
    }).catch(() => { if (!w.failSince) w.failSince = Date.now(); });
  }
}, 500);
/* A line a minute on what is being recorded */
setInterval(() => {
  for (const hex of watched.keys()) {
    const f = flight(hex), last = f.pts[f.pts.length - 1];
    console.log(new Date().toISOString(), hex, f.pts.length + ' points' +
      (last ? ', newest ' + Math.round((Date.now() - last._t) / 1000) + ' s ago' : ', not seen yet'));
  }
}, 60000);

const HIST_FIELDS = ['_t', 'lat', 'lon', 'alt_baro', 'alt_geom', 'gs', 'track', 'true_heading', 'baro_rate',
                     'geom_rate', 'flight', 'squawk', 'mach', 'ias', 'oat', '_src'];
function history(hex, since, raw) {
  const pts = flight(hex).pts;
  return pts.slice(firstAtOrAfter(pts, since)).map(p => {
    if (raw) return p;
    const o = {};
    for (const k of HIST_FIELDS) if (p[k] !== undefined && p[k] !== null) o[k] = p[k];
    return o;
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function send(res, status, headers, body) {
  res.writeHead(status, Object.assign({
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  }, headers));
  res.end(body);
}
const JSON_TYPE = { 'Content-Type': 'application/json; charset=utf-8' };

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/a350f-first-flight.html';
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { return send(res, 400, {}, 'bad path'); }
  const file = path.normalize(path.join(ROOT, rel));
  /* Stay inside the folder, and keep dotfiles (.git…) private */
  if (!file.startsWith(ROOT + path.sep) || /(^|[\\/])\./.test(path.relative(ROOT, file))) {
    return send(res, 404, {}, 'not found');
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, {}, 'not found');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

loadLogs();
for (const hex of arg('watch', '39a53b').split(',')) if (VALID.hex.test(hex)) watch(hex);
/* Ctrl+C / kill: let the log files flush their last lines before exiting */
function shutdown() {
  let open = streams.size;
  if (!open) process.exit(0);
  for (const s of streams.values()) s.end(() => { if (--open === 0) process.exit(0); });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, 204, { 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' }, '');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {}, 'method not allowed');
  const url = new URL(req.url, 'http://relay');
  const h = url.pathname.match(/^\/adsb\/history\/([^/]+)$/);
  if (h) {
    const hex = decodeURIComponent(h[1]).toLowerCase();
    if (!VALID.hex.test(hex)) return send(res, 400, JSON_TYPE, '{"error":"invalid hex"}');
    watch(hex);
    const points = history(hex, +url.searchParams.get('since') || 0, url.searchParams.has('raw'));
    return send(res, 200, JSON_TYPE, JSON.stringify({ hex, now: Date.now(), boot: BOOT, filled, count: points.length, points }));
  }
  const m = url.pathname.match(/^\/adsb\/(hex|reg|callsign)\/([^/]+)$/);
  if (m) {
    const kind = m[1], value = decodeURIComponent(m[2]);
    if (!VALID[kind].test(value)) return send(res, 400, JSON_TYPE, '{"error":"invalid ' + kind + '"}');
    // an aircraft the page asks about is recorded from then on
    if (kind === 'hex') watch(value);
    adsb(kind, value, watched.has(value.toLowerCase()) ? WATCHED_CACHE_MS : CACHE_MS).then(e => {
      const list = e.body.ac || e.body.aircraft || [];
      if (kind !== 'hex' && list.length <= 3) list.forEach(a => { if (VALID.hex.test(a.hex || '')) watch(a.hex); });
      // _rec changes whenever the recording's past does: the page re-syncs
      send(res, 200, JSON_TYPE, JSON.stringify(Object.assign({}, e.body, { _age: Date.now() - e.at, _rec: BOOT + ':' + filled })));
    }, err => send(res, 502, JSON_TYPE, JSON.stringify({ error: err.message })));
    return;
  }
  serveStatic(req, res, url.pathname);
}).listen(PORT, HOST, () => {
  console.log('A350F relay on http://' + HOST + ':' + PORT + '/a350f-first-flight.html');
  console.log('ADS-B upstreams: ' + UPSTREAMS.map(u => u.name).join(' -> ') + ' · recording to ' + LOG_DIR);
});
