#!/usr/bin/env node
/* Local relay for a350f-first-flight.html.

   The public ADS-B APIs the overlay reads (adsb.lol, adsb.fi) answer a
   server fine but send no CORS headers, so a browser source cannot read them
   from its own page. This serves the overlay folder over HTTP and forwards
   /adsb/* to those APIs from the same origin, so the page never makes a
   cross-origin request. No dependencies: Node 18+ (for the built-in fetch).

     node a350f-relay.js [--port 8787] [--host 127.0.0.1]

   OBS browser source:  http://127.0.0.1:8787/a350f-first-flight.html

   Routes
     GET /adsb/hex/<icao24>      aircraft by transponder address
     GET /adsb/reg/<reg>         aircraft by registration
     GET /adsb/callsign/<cs>     aircraft by callsign
     GET /<file>                 static files from this folder

   The /adsb answers are the upstream's own readsb JSON ({"ac":[…]}) plus
   "src": the upstream that served it. Upstreams are tried in order; each
   is held to ~1 request/s (their published limit) and backs off for 30 s
   after an error, and one answer is shared by every caller for a second, so
   several browser sources on the same machine cost the API one request. */
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

const VALID = {
  hex: /^[0-9a-f]{6}$/i,
  reg: /^[A-Z0-9-]{2,10}$/i,
  callsign: /^[A-Z0-9]{2,8}$/i,
};
const MIN_INTERVAL = 1100;  /* per upstream: their limit is 1 req/s */
const CACHE_MS = 1000;      /* one answer serves every caller for this long */
const BACKOFF_MS = 30000;   /* after an error or a 429 */
const TIMEOUT_MS = 6000;

const cache = new Map();    /* "kind/value" -> { at, body } */
const inflight = new Map(); /* "kind/value" -> Promise<body> */

async function fetchUpstream(kind, value) {
  const errors = [];
  for (const up of UPSTREAMS) {
    const t = Date.now();
    if (t < up.failUntil) { errors.push(up.name + ': backing off'); continue; }
    if (t - up.last < MIN_INTERVAL) { errors.push(up.name + ': rate limit'); continue; }
    up.last = t;
    try {
      const res = await fetch(up.url[kind](value), {
        headers: { 'User-Agent': 'EclipseGraphics-A350F-relay/1.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
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

async function adsb(kind, value) {
  const key = kind + '/' + value.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;
  if (inflight.has(key)) return inflight.get(key);
  const p = fetchUpstream(kind, value).then(body => {
    cache.set(key, { at: Date.now(), body });
    return body;
  }).catch(err => {
    /* Every upstream busy or down: a slightly old answer beats none — the
       page shows its age from seen_pos anyway. */
    if (hit) return Object.assign({}, hit.body, { stale: true });
    throw err;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, 204, { 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' }, '');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {}, 'method not allowed');
  const url = new URL(req.url, 'http://relay');
  const m = url.pathname.match(/^\/adsb\/(hex|reg|callsign)\/([^/]+)$/);
  if (m) {
    const kind = m[1], value = decodeURIComponent(m[2]);
    if (!VALID[kind].test(value)) return send(res, 400, { 'Content-Type': 'application/json' }, '{"error":"invalid ' + kind + '"}');
    adsb(kind, value).then(
      body => send(res, 200, { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify(body)),
      err => send(res, 502, { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify({ error: err.message }))
    );
    return;
  }
  serveStatic(req, res, url.pathname);
}).listen(PORT, HOST, () => {
  console.log('A350F relay on http://' + HOST + ':' + PORT + '/a350f-first-flight.html');
  console.log('ADS-B upstreams: ' + UPSTREAMS.map(u => u.name).join(' -> '));
});
