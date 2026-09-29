/* Module "a350f", server side: the relay the A350F overlay reads its ADS-B
   data through (once a standalone script, now part of the overlay server).

   The public ADS-B APIs (adsb.lol, adsb.fi) answer a server fine but send no
   CORS headers, so a browser source can't read them from its own page: the
   server forwards /adsb/* to them from the same origin. Same routes, same
   pacing, same recording as the standalone relay:

     GET /adsb/hex/<icao24>      aircraft by transponder address
     GET /adsb/reg/<reg>         aircraft by registration
     GET /adsb/callsign/<cs>     aircraft by callsign
     GET /adsb/history/<icao24>  every point recorded for it (?since=<ms>, ?raw=1)
     GET /wx/<ICAO>              the airport's latest METAR (aviationweather.gov), cached 5 min
     GET /flight-log/<file>      a day's recording as written

   Going easy on the APIs: each upstream is asked about each watched aircraft
   every --every seconds (5 by default; 15 while it isn't being seen), taking
   turns, so with both up the aircraft gets a fresh position every 2.5 s
   while each API sees one request every 5 s — however many pages poll. A
   lookup by registration or callsign goes upstream on its own, at most every
   30 s. After an error or a 429 an upstream is left alone for 30 s, doubling
   up to 5 min, or as long as its Retry-After asks.

   Flight recorder: every point, with all its fields, in <log>/<icao24>-<UTC
   date>.jsonl (flight-log/ by default, the folder the standalone relay used,
   so a recording it started carries on here), reloaded on restart; holes
   (outages, the aircraft out of coverage) are filled from adsb.lol's own
   trace of the aircraft.

   It only polls while the active show uses the module (and its relay is this
   one), or for the aircraft given with --watch. */
'use strict';
const fs = require('fs');
const path = require('path');

exports.init = function (ctx) {
  const log = ctx.log, arg = ctx.arg;
  const LOG_DIR = path.resolve(ctx.root, arg('log', 'flight-log'));
  const UPSTREAMS = [
    {
      name: 'adsb.lol', gap: 2000, /* its limit is dynamic ("based on load"): keep well clear */
      url: { hex: v => 'https://api.adsb.lol/v2/hex/' + v, reg: v => 'https://api.adsb.lol/v2/reg/' + v, callsign: v => 'https://api.adsb.lol/v2/callsign/' + v },
    },
    {
      name: 'adsb.fi', gap: 1100, /* published limit: 1 request/s */
      url: { hex: v => 'https://opendata.adsb.fi/api/v2/hex/' + v, reg: v => 'https://opendata.adsb.fi/api/v2/registration/' + v,
             callsign: v => 'https://opendata.adsb.fi/api/v2/callsign/' + v },
    },
  ].map(u => Object.assign(u, { last: 0, failUntil: 0, penalty: 0, requests: 0, errors: 0, lastOk: 0, lastErr: null }));
  /* adsb.lol's tar1090 traces: the whole day, and the last ~25 minutes */
  const TRACE_URL = (hex, kind) => 'https://globe.adsb.lol/data/traces/' + hex.slice(-2) + '/trace_' + kind + '_' + hex + '.json';
  const VALID = { hex: /^[0-9a-f]{6}$/i, reg: /^[A-Z0-9-]{2,10}$/i, callsign: /^[A-Z0-9]{2,8}$/i };
  const HEADERS = { 'User-Agent': 'EclipseGraphics-overlay-server/1.0 (a350f)', 'Accept': 'application/json' };
  const EVERY_MS = Math.max(2, parseFloat(arg('every', '5')) || 5) * 1000;
  const IDLE_MS = Math.max(15000, 3 * EVERY_MS);
  const LOOKUP_CACHE_MS = 30000, BACKOFF_MS = 30000, BACKOFF_MAX_MS = 300000, TIMEOUT_MS = 6000;
  const GAP_MS = 60000, TRACE_NEAR_MS = 8000;
  const cache = new Map(), wxCache = new Map(), inflight = new Map();
  const BOOT = Date.now();
  let filled = 0;

  /* The least recently asked upstream first: they take turns */
  async function fetchUpstream(kind, value) {
    const errors = [];
    for (const up of UPSTREAMS.slice().sort((a, b) => a.last - b.last)) {
      const t = Date.now();
      if (t < up.failUntil) { errors.push(up.name + ': backing off'); continue; }
      if (t - up.last < up.gap) { errors.push(up.name + ': rate limit'); continue; }
      up.last = t;
      up.requests++;
      try {
        const res = await fetch(up.url[kind](value), { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) { const err = new Error('HTTP ' + res.status); err.retryAfter = retryAfterMs(res.headers.get('retry-after')); throw err; }
        const json = await res.json();
        json.src = up.name;
        up.lastOk = Date.now();
        up.penalty = 0;
        return json;
      } catch (e) {
        up.penalty = Math.min(BACKOFF_MAX_MS, up.penalty ? up.penalty * 2 : BACKOFF_MS);
        up.failUntil = Date.now() + Math.max(up.penalty, Math.min(e.retryAfter || 0, 3600000));
        up.errors++;
        up.lastErr = { at: Date.now(), msg: e.message };
        errors.push(up.name + ': ' + e.message);
        log('warn', 'a350f: ' + up.name + ' ' + kind + ' ' + value + ' ' + e.message);
      }
    }
    throw new Error(errors.join('; '));
  }
  function retryAfterMs(h) {
    if (!h) return 0;
    const s = Number(h);
    if (Number.isFinite(s)) return Math.max(0, s * 1000);
    const d = Date.parse(h);
    return Number.isFinite(d) ? Math.max(0, d - Date.now()) : 0;
  }
  /* → { at, body, gaps, stale? }: every fresh answer goes through the recorder */
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
      /* every upstream busy or down: a slightly old answer beats none */
      if (hit) return Object.assign({}, hit, { stale: true });
      throw err;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  // ===== Weather: the airport's METAR, for the waiting-time ticker =====
  async function metar(icao) {
    const hit = wxCache.get(icao);
    if (hit && Date.now() - hit.at < 300000) return hit.body;
    try {
      const res = await fetch('https://aviationweather.gov/api/data/metar?ids=' + icao + '&format=json', { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list = await res.json();
      const body = { icao, metar: Array.isArray(list) && list[0] || null, fetched: Date.now() };
      wxCache.set(icao, { at: Date.now(), body });
      return body;
    } catch (e) {
      log('warn', 'a350f: metar ' + icao + ' ' + e.message);
      if (hit) return hit.body;
      throw e;
    }
  }

  // ===== Flight recorder =====
  const flights = new Map(), streams = new Map();
  function flight(hex) { if (!flights.has(hex)) flights.set(hex, { pts: [], seenAt: 0 }); return flights.get(hex); }
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
      s.on('error', e => log('warn', 'a350f: log ' + file + ' ' + e.message));
      streams.set(file, s);
    }
    s.write(JSON.stringify(p) + '\n');
  }
  /* In time order. 'live' drops only a repeat of a report already held;
     'trace' only fills holes. → false if dropped, else the time since the
     previous point (ms) */
  function addPoint(p, mode, persist) {
    const f = flight(p.hex), pts = f.pts, i = firstAtOrAfter(pts, p._t);
    const near = mode === 'trace' ? TRACE_NEAR_MS : 1000;
    for (const q of [pts[i - 1], pts[i]]) {
      if (q && Math.abs(q._t - p._t) < near && (mode === 'trace' || (q.lat === p.lat && q.lon === p.lon))) return false;
    }
    pts.splice(i, 0, p);
    if (persist !== false) logPoint(p);
    return i ? p._t - pts[i - 1]._t : Infinity;
  }
  function upstreamNow(body) { const n = +body.now; return n > 1e12 ? n : n * 1000; }
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
  function importTrace(hex, tr, since) {
    let n = 0;
    for (const q of tr.trace || []) {
      const t = Math.round((tr.timestamp + q[0]) * 1000);
      if (t < since || typeof q[1] !== 'number' || typeof q[2] !== 'number') continue;
      const flags = q[6] || 0;
      // [dt, lat, lon, alt, gs, track, flags, vrate, extra{}, source, alt_geom, geom_rate, ias, roll]
      const p = Object.assign({}, q[8] || {}, { hex, lat: q[1], lon: q[2], _t: t, _src: 'adsb.lol trace' });
      if (tr.r) p.r = tr.r;
      if (q[4] != null) p.gs = q[4];
      if (q[5] != null) p.track = q[5];
      if (q[3] === 'ground' || !(flags & 8)) p.alt_baro = q[3]; else p.alt_geom = q[3];
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
    if (!w) return;
    w.lastBackfill = Date.now();
    w.pending = false;
    const since = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    let added = 0;
    for (const kind of ['full', 'recent']) {
      try {
        const res = await fetch(TRACE_URL(hex, kind), { headers: HEADERS, signal: AbortSignal.timeout(15000) });
        if (res.status === 404) continue;
        if (!res.ok) throw new Error('HTTP ' + res.status);
        added += importTrace(hex, await res.json(), since);
      } catch (e) { log('warn', 'a350f: trace ' + kind + ' ' + hex + ' ' + e.message); }
    }
    if (added) log('log', 'a350f: backfill ' + hex + ' (' + why + '): +' + added + ' points from the adsb.lol trace');
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
    for (const [hex, f] of flights) { f.pts.sort((a, b) => a._t - b._t); log('log', 'a350f: recorded so far: ' + hex + ' ' + f.pts.length + ' points'); }
  }

  // ===== Watcher: keeps recording with no browser source open =====
  const watched = new Map(); /* icao24 -> { next, failSince, lastBackfill, pending, followUpAt, why } */
  function watch(hex, why) {
    hex = hex.toLowerCase();
    const w = watched.get(hex);
    if (w) { if (why === 'pinned') w.why = why; return; }
    watched.set(hex, { next: 0, failSince: 0, lastBackfill: 0, pending: true, followUpAt: 0, why: why || 'asked' });
    log('log', 'a350f: watching ' + hex);
  }
  function watchEvery(hex) {
    const t = Date.now(), up = UPSTREAMS.filter(u => t >= u.failUntil).length || 1;
    return (t - flight(hex).seenAt < 600000 ? EVERY_MS : IDLE_MS) / up;
  }
  function requestBackfill(hex, why) {
    const w = watched.get(hex);
    if (!w) return;
    if (Date.now() - w.lastBackfill < 60000) { w.pending = true; return; }
    w.followUpAt = Date.now() + 180000;
    backfill(hex, why);
  }
  const loop = setInterval(() => {
    const t = Date.now();
    for (const [hex, w] of watched) {
      if (w.pending && t - w.lastBackfill >= 60000) backfill(hex, w.lastBackfill ? 'retry' : 'start');
      if (w.followUpAt && t >= w.followUpAt) { w.followUpAt = 0; requestBackfill(hex, 'follow-up'); }
      if (t < w.next) continue;
      w.next = Infinity;
      adsb('hex', hex, watchEvery(hex) / 2).finally(() => { w.next = t + watchEvery(hex); }).then(e => {
        if (e.stale) throw new Error('stale');
        if (w.failSince && Date.now() - w.failSince > 20000) requestBackfill(hex, 'reconnected');
        w.failSince = 0;
        const gap = e.gaps[hex];
        if (gap > GAP_MS && gap !== Infinity && !e.gapSeen) { e.gapSeen = true; requestBackfill(hex, 'gap'); }
      }).catch(() => { if (!w.failSince) w.failSince = Date.now(); });
    }
  }, 500);
  const minute = setInterval(() => {
    for (const hex of watched.keys()) {
      const f = flight(hex), last = f.pts[f.pts.length - 1];
      log('log', 'a350f: ' + hex + ' ' + f.pts.length + ' points' + (last ? ', newest ' + Math.round((Date.now() - last._t) / 1000) + ' s ago' : ', not seen yet'));
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
  /* The relay's answers are readable from anywhere (read-only, as the
     standalone relay's were): a page opened as a file can use them */
  function json(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
  }

  /* Watch what the active show follows, and stop what it no longer does */
  function onShow() {
    const s = ctx.settings();
    const want = s && !s.relay && !s.demo && VALID.hex.test(String(s.hex || '')) ? String(s.hex).toLowerCase() : null;
    for (const [hex, w] of watched) if (w.why !== 'pinned' && hex !== want && (!s || w.why === 'show')) { watched.delete(hex); log('log', 'a350f: stopped watching ' + hex); }
    if (want) watch(want, 'show');
  }

  loadLogs();
  for (const hex of arg('watch', '').split(',')) if (VALID.hex.test(hex)) watch(hex, 'pinned');

  return {
    onShow,
    stop: () => { clearInterval(loop); clearInterval(minute); for (const s of streams.values()) s.end(); },
    status: () => {
      const t = Date.now();
      return {
        now: t, boot: BOOT, filled, logDir: LOG_DIR,
        upstreams: UPSTREAMS.map(u => ({ name: u.name, requests: u.requests, errors: u.errors, lastOk: u.lastOk, lastErr: u.lastErr,
                                         backoff: u.failUntil > t ? u.failUntil - t : 0 })),
        watched: [...watched.entries()].map(([hex, w]) => {
          const f = flight(hex), last = f.pts[f.pts.length - 1];
          return { hex, points: f.pts.length, newest: last ? last._t : null, lastBackfill: w.lastBackfill, failSince: w.failSince,
                   every: watchEvery(hex), why: w.why };
        }),
      };
    },
    routes: [
      ['GET', /^\/adsb\/history\/([^/]+)$/, (req, res, url, m) => {
        const hex = decodeURIComponent(m[1]).toLowerCase();
        if (!VALID.hex.test(hex)) return json(res, 400, { error: 'invalid hex' });
        watch(hex);
        const points = history(hex, +url.searchParams.get('since') || 0, url.searchParams.has('raw'));
        json(res, 200, { hex, now: Date.now(), boot: BOOT, filled, count: points.length, points });
      }],
      ['GET', /^\/adsb\/(hex|reg|callsign)\/([^/]+)$/, (req, res, url, m) => {
        const kind = m[1], value = decodeURIComponent(m[2]);
        if (!VALID[kind].test(value)) return json(res, 400, { error: 'invalid ' + kind });
        if (kind === 'hex') watch(value);
        return adsb(kind, value, kind === 'hex' ? watchEvery(value.toLowerCase()) + 3000 : LOOKUP_CACHE_MS).then(e => {
          const list = e.body.ac || e.body.aircraft || [];
          if (kind !== 'hex' && list.length <= 3) list.forEach(a => { if (VALID.hex.test(a.hex || '')) watch(a.hex); });
          json(res, 200, Object.assign({}, e.body, { _age: Date.now() - e.at, _rec: BOOT + ':' + filled }));
        }, err => json(res, 502, { error: err.message }));
      }],
      ['GET', /^\/wx\/([A-Za-z]{4})$/, (req, res, url, m) => metar(m[1].toUpperCase()).then(
        body => json(res, 200, body), err => json(res, 502, { error: err.message }))],
      ['GET', /^\/flight-log\/([0-9a-f]{6}-\d{4}-\d\d-\d\d\.jsonl)$/, (req, res, url, m) => {
        const file = path.join(LOG_DIR, m[1]);
        fs.stat(file, (err, st) => {
          if (err || !st.isFile()) return json(res, 404, { error: 'not found' });
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
          fs.createReadStream(file).pipe(res);
        });
      }],
    ],
  };
};
