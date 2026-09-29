/* Module "a350f", output side: the A350F first-flight overlay's live flight
   (a350f-first-flight.html), as variables, two visuals and two columns for
   the bandeau.

   The flight: every ADS-B report (through the relay: this server, or the
   one set in the settings) goes into a list of samples — kept in local
   storage and topped up from the relay's recording — from which take-off,
   landing, records, milestones and the phase are derived, and replayed
   whenever a hole is filled. Nothing here changes on a clock of its own: a
   refreshed source, or a second one, finds the same flight.

   Variables: the headline and timer for the band, the strap's figures, the
   ticker's sets (the aircraft and Toulouse weather before take-off, the
   records in flight, the first-flight comparison after landing), the
   progress line, and the a350f_* Companion strings as before.
   Visuals: map (the lower third's square following the aircraft; on the
   canvas the whole track, or following it — view map.track | map.follow;
   in the corner card), profile (altitude and ground speed over time).
   Columns: telemetry (the fullscreen's flight data), recap (the after-flight
   summary, layout recap).

   The leader page (one per module, chosen by the server) announces the
   milestones on the flash, turns the wording neutral on an emergency squawk
   and moves an on-air fullscreen to the recap when set to — once, not once
   per browser source. */
(function () {
  'use strict';
  var seq = 0;
  GFX.client('a350f', function (api) {
    var U = api.U, D = api.D;
    function $q(root, c) { return root.querySelector('.' + c); }

    // ===== Configuration (the module's settings) =====
    var S, TZ, REG, HEX, CALLSIGN, MSN, DAY, T0, LAND, DUR, POLL_MS, TAKEOFF_OVERRIDE, DEMO, DEMO_SPEED, idKey, timesKey;
    var HOME = { lat: 43.629101, lon: 1.36382, elev: 499 };  // LFBO reference point
    var RUNWAYS = [  // threshold to threshold, then the two ends' names
      [43.64410, 1.34593, 43.61900, 1.37210, '14R', '32L'],
      [43.63740, 1.35762, 43.61560, 1.38022, '14L', '32R']
    ];
    /* what can't change under a running flight state: a change reloads the page */
    function identity(s) {
      return [s.reg, s.hex, s.callsign, s.msn, s.date, s.demo, s.speed, s.from, s.relay, s.tiles, s.tilestyle, s.attrib, s.squawk].join('|');
    }
    function configure() {
      S = api.settings(); TZ = api.tz();
      REG = String(S.reg || 'F-WXLD').toUpperCase();
      HEX = String(S.hex || '39a53b').toLowerCase();
      CALLSIGN = String(S.callsign || '').toUpperCase();
      MSN = String(S.msn || '700');
      DAY = /^\d{4}-\d\d-\d\d$/.test(S.date) ? S.date : '2026-09-29';
      T0 = U.parseWhen(DAY + 'T' + (S.t0 || '10:30'), TZ);
      LAND = U.parseWhen(DAY + 'T' + (S.land || '14:05'), TZ);
      DUR = (+S.dur || 0) * 60000;
      POLL_MS = Math.max(1000, (+S.poll || 2) * 1000);
      TAKEOFF_OVERRIDE = S.takeoff ? U.parseWhen(S.takeoff, TZ, DAY) : null;
      DEMO = !!S.demo;
      DEMO_SPEED = +S.speed || 30;
      idKey = identity(S);
      timesKey = [S.t0, S.land, S.dur, S.takeoff, S.units].join('|');
    }
    configure();
    function now() { return D.now(S, api.state(), U, TZ); }
    function ctl() { return api.state(); }
    function schedTime() { return ctl().t0 || T0; }
    // the operator's word first, then the settings, then what the data showed
    function takeoffTime() { return ctl().takeoff || TAKEOFF_OVERRIDE || st.takeoff; }
    function landTime() { return ctl().land || (DUR ? (takeoffTime() || schedTime()) + DUR : LAND); }
    function metric() { return (ctl().units || S.units) === 'metric'; }

    // ===== Formatting =====
    var nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
    function fmtT(ms) { return U.hms(ms, TZ); }
    function fmtTS(ms) { return U.hm(ms, TZ); }
    var pad = U.pad;
    var fmtClock = function (ms) { return U.clock(ms); }, fmtCoarse = U.coarse;
    function ft(v) { return nf.format(Math.round(v / 25) * 25); }
    function m(v) { return nf.format(Math.round(v * 0.3048 / 10) * 10); }
    function kmh(kt) { return nf.format(Math.round(kt * 1.852)); }
    /* Units: aviation (ft, kt, ft/min) or metric (m, km/h, m/s) first, the
       other as the secondary figure. un(kind, value[, fine]) → { n, u, s }
       fine: altitude to 10 ft, not the 25 ft of a report (rolling readouts) */
    function un(kind, v, fine) {
      var met = metric(), ms = (v * 0.00508).toFixed(1).replace('.', ',').replace(/^(\d)/, '+$1').replace('+0,0', '0');
      var fv = fine ? nf.format(Math.round(v / 10) * 10) : ft(v);
      if (kind === 'alt') return met ? { n: m(v), u: 'm', s: fv + ' ft' } : { n: fv, u: 'ft', s: m(v) + ' m' };
      if (kind === 'spd') return met ? { n: kmh(v), u: 'km/h', s: nf.format(Math.round(v)) + ' kt' }
                                     : { n: nf.format(Math.round(v)), u: 'kt', s: kmh(v) + ' km/h' };
      return met ? { n: ms.replace('-', '−'), u: 'm/s', s: vsTxt(v) + ' ft/min' } : { n: vsTxt(v), u: 'ft/min', s: ms.replace('-', '−') + ' m/s' };
    }
    function uTxt(kind, v, fine) { var x = un(kind, v, fine); return x.n + ' ' + x.u; }
    function vsTxt(v) { var r = Math.round(v / 50) * 50; return (r > 0 ? '+' : r < 0 ? '−' : '') + nf.format(Math.abs(r)); }
    function hdg(v) { return String(Math.round(v) % 360).padStart(3, '0') + '°'; }
    var DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    var DIRS_LONG = ['nord', 'nord-nord-est', 'nord-est', 'est-nord-est', 'est', 'est-sud-est', 'sud-est', 'sud-sud-est',
                     'sud', 'sud-sud-ouest', 'sud-ouest', 'ouest-sud-ouest', 'ouest', 'ouest-nord-ouest', 'nord-ouest', 'nord-nord-ouest'];
    function compass(az, long) { return (long ? DIRS_LONG : DIRS)[Math.round(((az % 360) + 360) % 360 / 22.5) % 16]; }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // ===== Geometry =====
    var RAD = Math.PI / 180;
    function distKm(aLat, aLon, bLat, bLon) {
      var dLat = (bLat - aLat) * RAD, dLon = (bLon - aLon) * RAD;
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    function bearing(aLat, aLon, bLat, bLon) {
      var y = Math.sin((bLon - aLon) * RAD) * Math.cos(bLat * RAD);
      var x = Math.cos(aLat * RAD) * Math.sin(bLat * RAD) - Math.sin(aLat * RAD) * Math.cos(bLat * RAD) * Math.cos((bLon - aLon) * RAD);
      return (Math.atan2(y, x) / RAD + 360) % 360;
    }
    // Web Mercator, normalised to the unit square (x east, y south)
    function merc(lat, lon) {
      var s = Math.max(-0.9999, Math.min(0.9999, Math.sin(lat * RAD)));
      return { x: (lon + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
    }

    // ===== Flight state =====
    var STORE = 'a350f:' + (DEMO ? 'demo' : REG + ':' + DAY);
    var st = { samples: [], takeoff: null, landing: null, airSeen: false, altMax: 0, gsMax: 0, dist: 0, hex: HEX, events: [] };
    var resetSeen = ctl().resetAt || 0;
    try {
      if (DEMO) localStorage.removeItem(STORE);
      var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved && saved.samples && !(saved.savedAt < resetSeen)) st = saved;
      st.events = st.events || [];
      if (st.hex && !S.hex) HEX = st.hex;
    } catch (e) { /* storage unavailable: start fresh */ }
    var saveAt = 0;
    function save(force) {
      if (DEMO) return;
      var t = Date.now();
      if (!force && t - saveAt < 10000) return;
      saveAt = t;
      st.savedAt = t;
      try { localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) { /* full or blocked */ }
    }
    window.addEventListener('pagehide', function () { save(true); });
    var live = null, lastPhase = '', sourceName = '', sourceErr = false;
    var trackDirty = true, profVersion = 0;

    /* A report (readsb / ADSBx v2 fields) → a compact sample:
       t (ms), lat, lon, a: altitude in ft (null on the ground or unknown),
       s: ground speed (kt), g: 1 on the ground, v: vertical rate (ft/min). */
    function toSample(a, t) {
      if (typeof a.lat !== 'number' || typeof a.lon !== 'number') return null;
      var gnd = a.alt_baro === 'ground';
      var alt = gnd ? null : typeof a.alt_baro === 'number' ? a.alt_baro : typeof a.alt_geom === 'number' ? a.alt_geom : null;
      var gs = typeof a.gs === 'number' ? a.gs : 0;
      // some transponders never say "ground": slow, at field elevation, on the airfield counts too
      if (!gnd && alt != null && alt < HOME.elev + 250 && gs < 50 && distKm(a.lat, a.lon, HOME.lat, HOME.lon) < 6) gnd = true;
      var vs = typeof a.baro_rate === 'number' ? a.baro_rate : typeof a.geom_rate === 'number' ? a.geom_rate : 0;
      var trk = typeof a.track === 'number' ? a.track : typeof a.true_heading === 'number' ? a.true_heading : null;
      var p = { t: Math.round(t), lat: +a.lat.toFixed(5), lon: +a.lon.toFixed(5),
                a: gnd || alt == null ? null : Math.round(alt), s: Math.round(gs), g: gnd ? 1 : 0, v: Math.round(vs) };
      if (trk != null) p.k = Math.round(trk);
      if (typeof a.mach === 'number' && !gnd) p.m = +a.mach.toFixed(3);
      return p;
    }
    /* in time order; a repeat of a report already held is dropped →
       'append' | 'insert' (a hole being filled) | false */
    function addSample(p) {
      var Sm = st.samples, lo = 0, hi = Sm.length;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (Sm[mid].t < p.t) lo = mid + 1; else hi = mid; }
      for (var k = lo - 1; k <= lo; k++) {
        var q = Sm[k];
        if (q && Math.abs(q.t - p.t) < 1000 && q.lat === p.lat && q.lon === p.lon) return false;
      }
      Sm.splice(lo, 0, p);
      trackDirty = true;
      return lo === Sm.length - 1 ? 'append' : 'insert';
    }
    function runwayKm(lat, lon, r) {
      if (!r) return Math.min.apply(null, RUNWAYS.map(function (q) { return runwayKm(lat, lon, q); }));
      var kx = 111.32 * Math.cos(lat * RAD), ky = 110.57;
      var ax = (r[1] - lon) * kx, ay = (r[0] - lat) * ky, bx = (r[3] - lon) * kx, by = (r[2] - lat) * ky;
      var dx = bx - ax, dy = by - ay, u = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)));
      return Math.hypot(ax + u * dx, ay + u * dy);
    }
    function runwayName(p) {
      if (!p || p.k == null) return null;
      var best = null, bd = 1.2;
      RUNWAYS.forEach(function (r) { var d = runwayKm(p.lat, p.lon, r); if (d < bd) { bd = d; best = r; } });
      if (!best) return null;
      var qfu = bearing(best[0], best[1], best[2], best[3]);
      return Math.abs(((p.k - qfu + 540) % 360) - 180) < 60 ? best[4] : best[5];
    }
    /* Milestones, derived from the samples like everything else: a replay
       after a hole is filled finds the same ones, with the same ids */
    function addEvent(type, t, v, at) {
      var id = type + '@' + t;
      for (var i = st.events.length - 1; i >= 0; i--) if (st.events[i].id === id) return;
      st.events.push({ id: id, type: type, t: t, at: at || t, v: v || null });
    }
    function detectEvents(prev, p) {
      if (p.g) {
        if (st.landing && !st.landSeen && p.s < 40) {
          addEvent('atterrissage', st.landing, { rwy: runwayName(st.landingAt) }, p.t);
          st.landSeen = true;
        }
        return;
      }
      if (!st.oceanSeen && window.A350F_WHERE && A350F_WHERE.sea(p.lat, p.lon)) {
        st.oceanSeen = true;
        var w = A350F_WHERE(p.lat, p.lon);
        addEvent('ocean', p.t, { sea: A350F_WHERE.sea(p.lat, p.lon), text: w ? w.text : '' });
      }
      if (p.a == null) return;
      if (!st.fl100 && prev && prev.a != null && prev.a < 10000 && p.a >= 10000 && p.v > 0) { st.fl100 = true; addEvent('fl100', p.t, { vs: p.v }); }
      if (Math.abs(p.v) < 300 && st.lvl && Math.abs(p.a - st.lvl.a) < 300) {
        if (!st.lvl.done && p.t - st.lvl.t >= 60000 && p.a >= 10000 && Math.abs(p.a - (st.lastLvl || 0)) >= 4000) {
          st.lvl.done = true;
          st.lastLvl = st.lvl.a;
          addEvent('palier', st.lvl.t, { alt: Math.round(st.lvl.a / 100) * 100 }, p.t);
        }
      } else st.lvl = Math.abs(p.v) < 300 ? { t: p.t, a: p.a } : null;
      if (p.m != null) {
        st.machMax = Math.max(st.machMax || 0, p.m);
        [0.8, 0.85].forEach(function (th) { if (p.m >= th && (st.machTh || 0) < th) { st.machTh = th; addEvent('mach', p.t, { m: th, gs: p.s }); } });
      }
      if (!st.descSeen && st.altMax >= 20000) {
        if (p.v < -800) {
          st.desc = st.desc || { t: p.t };
          if (p.t - st.desc.t >= 60000 && p.a < st.altMax - 1500) { st.descSeen = true; addEvent('descente', st.desc.t, { max: st.altMax }, p.t); }
        } else st.desc = null;
      }
    }
    /* Take-off, landing and the records, from a sample and the one before */
    function step(prev, p) {
      var gnd = p.g === 1, agl = p.a == null ? null : p.a - HOME.elev;
      if (!gnd && !st.takeoff && !st.airSeen) {
        var agl0 = agl == null ? 0 : agl;
        if (prev && prev.g && p.t - prev.t < 60000) st.takeoff = Math.round((prev.t + p.t) / 2);
        else if (agl0 < 3000 && p.v > 300) st.takeoff = Math.round(p.t - agl0 / p.v * 60000);
        else if (agl0 < 400) st.takeoff = p.t;
        if (st.takeoff) addEvent('decollage', st.takeoff, { rwy: runwayName(prev && prev.g ? prev : p) }, p.t);
      }
      if (!gnd) st.airSeen = true;
      // back in the air after a touchdown: within two minutes, a touch-and-go
      if (st.landing && !gnd) {
        st.reair = (st.reair || 0) + 1;
        if (st.reair >= 2) {
          if (p.t - st.landing < 120000) addEvent('touchgo', st.landing, { rwy: runwayName(st.landingAt) }, p.t);
          st.landing = null;
          st.landSeen = false;
        }
      } else st.reair = 0;
      if (gnd && st.airSeen && !st.landing) { st.landing = p.t; st.landingAt = p; }
      // low over a runway, then climbing away: a low pass (< 300 ft) or a go-around
      if (gnd) { st.appr = null; st.armed = false; }
      else if (agl != null) {
        if (agl > 1500) st.armed = true;
        if (st.armed && agl < 1000 && runwayKm(p.lat, p.lon) < 5) {
          if (!st.appr || agl < st.appr.min) st.appr = { min: agl, t: p.t };
        } else if (st.appr && agl > Math.max(700, st.appr.min + 500) && p.v > 800) {
          addEvent(st.appr.min < 300 ? 'passage' : 'remise', st.appr.t, { agl: Math.round(st.appr.min) }, p.t);
          st.appr = null;
        }
      }
      if (!gnd) {
        st.altMax = Math.max(st.altMax, p.a || 0);
        st.landSeen = false;
        st.gsMax = Math.max(st.gsMax, p.s);
        if (prev && !prev.g) st.dist += distKm(prev.lat, prev.lon, p.lat, p.lon);
      }
      detectEvents(prev, p);
    }
    function recompute() {
      st.takeoff = null; st.landing = null; st.airSeen = false;
      st.altMax = 0; st.gsMax = 0; st.dist = 0;
      st.events = []; st.appr = null; st.reair = 0; st.armed = false;
      st.fl100 = false; st.lvl = null; st.lastLvl = 0; st.machTh = 0; st.machMax = 0;
      st.desc = null; st.descSeen = false; st.landSeen = false; st.landingAt = null; st.oceanSeen = false;
      for (var i = 0; i < st.samples.length; i++) step(st.samples[i - 1], st.samples[i]);
      profVersion++;
    }
    /* Emergency squawks (7500, 7600, 7700) or an emergency status: nothing
       alarming goes on air by itself — that's an editorial call — but the
       wording turns neutral and Companion gets a350f_alert */
    var alertCode = '';
    function checkAlert(a) {
      var code = /^7[567]00$/.test(a.squawk || '') ? a.squawk : a.emergency && a.emergency !== 'none' ? String(a.emergency) : '';
      if (code && code !== alertCode && ctl().mode !== 'neutral' && api.leader()) api.cmd('mode.neutral');
      alertCode = code;
    }
    /* one report → state; t: when the position was measured (the data's own
       clock); age: how long ago that was; batch: part of a history merge */
    function ingest(a, t, age, batch) {
      var p = toSample(a, t);
      if (!p) return false;
      var how = addSample(p);
      if (how === 'append') step(st.samples[st.samples.length - 2], p);
      else if (how === 'insert' && !batch) recompute();
      if (!live || p.t >= live.t) {
        var prev = live;
        live = {
          t: p.t, tl: now() - age, lat: a.lat, lon: a.lon, alt: p.a, gnd: p.g === 1,
          gs: typeof a.gs === 'number' ? a.gs : 0,
          trk: typeof a.track === 'number' ? a.track : typeof a.true_heading === 'number' ? a.true_heading
             : typeof a.mag_heading === 'number' ? a.mag_heading : (prev ? prev.trk : 0),
          vs: p.v, mach: typeof a.mach === 'number' ? a.mach : null, ias: typeof a.ias === 'number' ? a.ias : null,
          oat: typeof a.oat === 'number' ? a.oat : null, squawk: a.squawk || '',
          flight: (a.flight || '').trim(), hex: (a.hex || HEX).toLowerCase(),
          near: distKm(a.lat, a.lon, HOME.lat, HOME.lon) < 6, seenAt: Date.now() - age
        };
        st.hex = live.hex;
        if (!prev || prev.t !== p.t) newReport();
        checkAlert(a);
      }
      if (how) {
        var before = st.samples[st.samples.length - 2];
        save(!batch && how === 'append' && before && before.g !== p.g);
        profVersion++;
      }
      return how;
    }

    // ===== Sources =====
    /* The relay first (this server, or the one in the settings), then the
       public APIs directly — which only a browser that lets the page read
       them allows (not a normal browser source: no CORS headers upstream) */
    var SOURCES = [];
    if (S.relay) SOURCES.push({ name: 'relais', base: String(S.relay).replace(/\/+$/, '') + '/adsb' });
    else SOURCES.push({ name: 'relais', base: 'adsb' });
    SOURCES.push({ name: 'adsb.lol', direct: 'lol' }, { name: 'adsb.fi', direct: 'fi' });
    var DIRECT_MS = 5000, srcIdx = 0, polledDirect = false, srcSeen = {};
    function credit(name) {
      var t = Date.now(), rank = function (n) { return SOURCES.map(function (s) { return s.name; }).indexOf(n); };
      srcSeen[name] = t;
      return Object.keys(srcSeen).filter(function (n) { return t - srcSeen[n] < 120000; })
        .sort(function (a, b) { return rank(a) - rank(b); }).join(' + ');
    }
    function srcUrl(s, kind, val) {
      val = encodeURIComponent(val);
      if (s.base) return s.base + '/' + kind + '/' + val;
      if (s.direct === 'lol') return 'https://api.adsb.lol/v2/' + kind + '/' + val;
      return 'https://opendata.adsb.fi/api/v2/' + (kind === 'reg' ? 'registration' : kind) + '/' + val;
    }
    function getJSON(url) {
      var ac = window.AbortController ? new AbortController() : null;
      var timer = ac && setTimeout(function () { ac.abort(); }, 7000);
      return fetch(url, { cache: 'no-store', signal: ac && ac.signal }).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) { var err = new Error('HTTP ' + r.status); err.status = r.status; throw err; }
        return r.json();
      }, function (e) { clearTimeout(timer); throw e; });
    }
    function query(kind, val) {
      var direct = SOURCES.filter(function (s) { return s.direct; });
      var order = SOURCES.filter(function (s) { return s.base; }).concat(direct.slice(srcIdx), direct.slice(0, srcIdx));
      var i = 0;
      function attempt() {
        if (i >= order.length) return Promise.reject(new Error('no source'));
        var s = order[i];
        if (s.direct) polledDirect = true;
        return getJSON(srcUrl(s, kind, val)).then(function (j) {
          if (s.direct) srcIdx = direct.indexOf(s);
          sourceName = credit(j.src || s.name);
          return j;
        }, function (e) {
          // the relay says its upstreams are failing: asking them from here too would only add to their load
          if (s.base && e.status === 502) throw e;
          i++; return attempt();
        });
      }
      return attempt();
    }
    function relayBase() { return SOURCES[0].base; }

    // ===== The relay's recording: everything this page missed =====
    var DAY_START = U.parseWhen(DAY + 'T00:00', TZ), DAY_END = DAY_START + 86400000;
    var hist = { since: DAY_START, key: '', rec: '', busy: false, again: false };
    function syncHistory() {
      var base = relayBase();
      if (DEMO || !base || hist.busy) return;
      hist.busy = true;
      var full = !hist.key;
      getJSON(base + '/history/' + HEX + '?since=' + hist.since).then(function (j) {
        var key = j.hex + ':' + j.boot + ':' + j.filled;
        if (!full && key !== hist.key) { hist.since = DAY_START; hist.key = ''; hist.again = true; return; }
        hist.key = key;
        hist.rec = j.boot + ':' + j.filled;
        hist.since = Math.max(DAY_START, j.now - 120000);
        var inserted = false, added = 0;
        (j.points || []).forEach(function (a) {
          if (!(a._t >= DAY_START && a._t < DAY_END)) return;
          var how = ingest(a, a._t, Math.max(0, j.now - a._t), true);
          if (how) added++;
          if (how === 'insert') inserted = true;
        });
        if (inserted) recompute();
        if (added) save(true);
      }).catch(function () { /* no relay: this page's own points only */ }).then(function () {
        hist.busy = false;
        if (hist.again) { hist.again = false; syncHistory(); }
      });
    }
    var pollN = 0, pollT = 0;
    function poll() {
      pollN++;
      polledDirect = false;
      // by address; every fifth poll without a fresh fix, by registration (and callsign)
      var kind = 'hex', val = HEX, fresh = live && Date.now() - live.seenAt < 60000;
      if (!fresh && pollN % 5 === 0) {
        if (CALLSIGN && pollN % 10 === 0) { kind = 'callsign'; val = CALLSIGN; } else { kind = 'reg'; val = REG; }
      }
      query(kind, val).then(function (j) {
        if (sourceErr || (j._rec && hist.key && j._rec !== hist.rec)) syncHistory();
        sourceErr = false;
        var list = j.ac || j.aircraft || [], a = null;
        for (var i = 0; i < list.length && !a; i++) {
          var c = list[i];
          if ((c.hex || '').toLowerCase() === HEX || (c.r || '').toUpperCase() === REG ||
              (CALLSIGN && (c.flight || '').trim().toUpperCase() === CALLSIGN)) a = c;
        }
        if (!a) return;
        if (a.hex && a.hex.toLowerCase() !== HEX && /^[0-9a-f]{6}$/i.test(a.hex)) { HEX = a.hex.toLowerCase(); syncHistory(); }
        var seen = typeof a.seen_pos === 'number' ? a.seen_pos : (a.seen || 0);
        var upNow = +j.now > 1e12 ? +j.now : +j.now * 1000;
        ingest(a, (upNow || Date.now()) - seen * 1000, (j._age || 0) + seen * 1000);
      }, function () { sourceErr = true; })
        .then(function () { pollT = setTimeout(poll, polledDirect ? Math.max(POLL_MS, DIRECT_MS) : POLL_MS); });
    }

    // ===== Demo: a synthetic first flight, through the same pipeline =====
    /* Holds on the ground, lines up on 32L, brakes off at the scheduled
       take-off, climbs out over the Gers to the Atlantic, runs down the
       coast, flies test legs along the Pyrenees, a low pass, and lands on
       32L. Waypoints: lat, lon, altitude (ft), ground speed (kt), on ground;
       hold: minutes stationary. */
    function demoSource() {
      var W = [
        [43.61680, 1.37480, 0, 0, 1], { hold: 3.5 },
        [43.61790, 1.37390, 0, 12, 1],
        [43.61900, 1.37210, 0, 6, 1], { hold: 0.8 },
        [43.61900, 1.37210, 0, 0, 1],
        [43.63170, 1.35890, 0, 155, 1],
        [43.63380, 1.35670, 540, 165, 0],
        [43.67300, 1.31600, 3500, 200, 0],
        [43.74000, 1.18000, 7000, 250, 0],
        [43.90000, 0.72000, 13000, 300, 0],
        [44.10000, 0.12000, 20000, 380, 0],
        [44.35000, -0.50000, 26000, 440, 0],
        [44.62000, -1.05000, 31000, 470, 0],
        [44.90000, -1.40000, 31000, 470, 0],
        [44.75000, -1.72000, 31000, 470, 0],
        [44.30000, -1.80000, 31000, 470, 0],
        [43.60000, -1.75000, 29000, 460, 0],
        [43.30000, -1.30000, 25000, 430, 0],
        [43.15000, -0.50000, 20000, 380, 0],
        [43.05000, 0.20000, 15000, 330, 0],
        [43.02000, 0.90000, 15000, 320, 0],
        [43.28000, 1.05000, 15000, 320, 0],
        [43.22000, 0.30000, 15000, 320, 0],
        [43.02000, 0.60000, 15000, 320, 0],
        [43.20000, 1.25000, 11000, 290, 0],
        [43.35000, 1.62000, 7500, 260, 0],
        [43.47000, 1.58000, 4500, 210, 0],
        [43.54730, 1.44680, 2200, 160, 0],
        // low pass down 32L at ~100 ft, climb out, right-hand circuit, land
        [43.61900, 1.37210, 620, 150, 0],
        [43.63740, 1.35300, 600, 155, 0],
        [43.65500, 1.33500, 1500, 180, 0],
        [43.68500, 1.30300, 3000, 210, 0],
        [43.70000, 1.36000, 3000, 210, 0],
        [43.66000, 1.45000, 3000, 210, 0],
        [43.56000, 1.52000, 2800, 200, 0],
        [43.52000, 1.47500, 2500, 180, 0],
        [43.54730, 1.44680, 2200, 160, 0],
        [43.61900, 1.37210, 550, 140, 0],
        [43.62250, 1.36850, 499, 135, 1],
        [43.63300, 1.35750, 0, 30, 1],
        [43.63500, 1.35330, 0, 8, 1],
        [43.63500, 1.35330, 0, 0, 1], { hold: 600 }
      ];
      var segs = [], t = 0, prev = null, rollStart = 0, liftoff = 0;
      W.forEach(function (w) {
        if (!Array.isArray(w)) { segs.push({ t0: t, t1: t + w.hold * 60000, a: prev, b: prev }); t += w.hold * 60000; return; }
        if (prev) {
          var d = distKm(prev[0], prev[1], w[0], w[1]) * 1000, v = ((prev[3] + w[3]) / 2) * 0.514444 || 3, dt = d / v * 1000;
          if (prev[3] === 0 && w[3] > 100 && !rollStart) rollStart = t;
          if (prev[4] && !w[4] && !liftoff) liftoff = t + dt;
          segs.push({ t0: t, t1: t + dt, a: prev, b: w });
          t += dt;
        }
        prev = w;
      });
      var shift = T0 - rollStart; // brakes release on the scheduled take-off
      if (now() > liftoff + shift) { st.takeoff = liftoff + shift; st.airSeen = true; }
      return function (tNow) {
        var rel = tNow - shift, sg = segs[segs.length - 1];
        for (var i = 0; i < segs.length; i++) if (rel < segs[i].t1) { sg = segs[i]; break; }
        var a = sg.a, b = sg.b, Tt = sg.t1 - sg.t0, tau = Math.max(0, Math.min(Tt, rel - sg.t0));
        var v0 = a[3], v1 = b[3];
        var f = (v0 + v1) > 0 ? (v0 * tau + (v1 - v0) * tau * tau / (2 * Tt)) / ((v0 + v1) / 2 * Tt) : 0;
        if (a === b) f = 0;
        var lat = a[0] + (b[0] - a[0]) * f, lon = a[1] + (b[1] - a[1]) * f, alt = a[2] + (b[2] - a[2]) * f;
        var gs = v0 + (v1 - v0) * (Tt ? tau / Tt : 0), gnd = b[4] && a[4];
        var trk = a === b || (a[0] === b[0] && a[1] === b[1]) ? 323 : bearing(a[0], a[1], b[0], b[1]);
        var vs = Tt && !gnd ? (b[2] - a[2]) / (Tt / 60000) : 0;
        var Tk = Math.max(216.65, 288.15 - 0.0019812 * alt), sigma = Math.pow(Tk / 288.15, 4.256);
        return {
          hex: HEX, r: REG, t: 'A35K', flight: 'AIB01   ', squawk: S.squawk || '7000',
          alt_baro: gnd ? 'ground' : Math.round(alt / 25) * 25, gs: gs, track: trk,
          baro_rate: Math.round(vs / 64) * 64, lat: lat, lon: lon, seen_pos: 0,
          mach: gnd ? undefined : gs / (661.47 * Math.sqrt(Tk / 288.15)),
          ias: gnd ? undefined : Math.round(gs * Math.sqrt(sigma)), oat: Math.round(Tk - 273.15)
        };
      };
    }
    // internals for automated tests (synthetic reports, state)
    window.a350fDebug = { ingest: ingest, state: function () { return st; } };
    var demoT = 0, histT = 0;
    if (DEMO) {
      var sim = demoSource();
      sourceName = 'démo';
      demoT = setInterval(function () { var t = now(); ingest(sim(t), t, 0); }, 200);
    } else {
      poll();
      syncHistory();
      histT = setInterval(syncHistory, 60000);
    }

    // ===== Phase and headline =====
    function distHome(p) { return distKm(p.lat, p.lon, HOME.lat, HOME.lon); }
    function phaseOf(t) {
      if (!live) return 'attente';
      if (live.gnd) {
        if (st.landing) return 'atterri';
        return live.gs > 40 ? 'course' : live.gs > 3 ? 'roulage' : 'attente';
      }
      var to = takeoffTime(), since = to ? t - to : Infinity;
      if (since < 150000) return 'decollage';
      // a low pass, go-around or touch-and-go keeps the headline for 3 minutes
      var ev = st.events[st.events.length - 1];
      if (ev && /^(passage|remise|touchgo)$/.test(ev.type) && t - ev.at < 180000) return ev.type;
      var agl = (live.alt || HOME.elev) - HOME.elev, d = distHome(live), vs = live.vs;
      if (since > 600000 && vs < 300 && agl < 2500 && d < 15) return 'finale';
      if (since > 600000 && vs < 300 && agl < 7000 && d < 40) return 'approche';
      var up = lastPhase === 'montee' ? 200 : 500, down = lastPhase === 'descente' ? -200 : -500;
      if (vs > up) return 'montee';
      if (vs < down) return 'descente';
      return 'palier';
    }
    var HEADLINES = {
      attente: 'Premier vol de l\'Airbus A350F', attente2: 'En attente du décollage',
      roulage: 'L\'A350F roule vers la piste', course: 'Course au décollage',
      decollage: 'Décollage ! L\'A350F s\'envole', montee: 'Premier vol · en montée',
      palier: 'Premier vol · essais en cours', descente: 'Premier vol · en descente',
      approche: 'Retour vers Toulouse', finale: 'En finale à Toulouse',
      passage: 'Passage à basse altitude', remise: 'Remise des gaz à Toulouse',
      touchgo: 'Toucher et remise des gaz', atterri: 'Premier vol réussi !', atterri2: 'L\'A350F s\'est posé'
    };
    /* Companion's sentence case where it differs from the screen's */
    var SPOKEN = { montee: 'Premier vol, en montée', palier: 'Premier vol, essais en cours', descente: 'Premier vol, en descente',
                   passage: 'Passage à basse altitude au-dessus de la piste' };
    // mode.neutral: the same facts, none of the celebration
    var NEUTRAL = { decollage: 'L\'A350F a décollé', atterri: HEADLINES.atterri2 };

    // ===== Milestones on the flash =====
    /* each announced once, while it is news (under 90 s old); the server
       keeps the keys, so a reload or a new leader doesn't repeat one */
    var announced = {};
    var ANN_WINDOW = 90000 * (DEMO ? Math.min(DEMO_SPEED, 20) : 1);
    function eventCard(ev) {
      var v = ev.v || {}, rwy = v.rwy ? 'piste ' + v.rwy : 'Toulouse-Blagnac', c;
      switch (ev.type) {
        case 'decollage': c = ['Décollage', 'L\'A350F a décollé à ' + fmtTS(ev.t), rwy]; break;
        case 'fl100': c = ['Montée', 'L\'A350F franchit ' + uTxt('alt', 10000), un('alt', 10000).s]; break;
        case 'palier': c = ['Palier', 'En palier à ' + uTxt('alt', v.alt), un('alt', v.alt).s + ' · FL' + pad(Math.round(v.alt / 100)).padStart(3, '0')]; break;
        case 'mach': c = ['Vitesse', 'Mach ' + v.m.toFixed(2).replace('.', ',') + ' atteint', 'vitesse sol ' + uTxt('spd', v.gs) + ' · ' + un('spd', v.gs).s]; break;
        case 'descente': c = ['Descente', 'Début de la descente', 'altitude max ' + uTxt('alt', v.max) + ' · ' + un('alt', v.max).s]; break;
        case 'passage': c = ['Toulouse', 'Passage à basse altitude', 'à ' + uTxt('alt', v.agl) + ' au-dessus de la piste']; break;
        case 'remise': c = ['Toulouse', 'Remise des gaz', 'au plus bas à ' + uTxt('alt', v.agl) + ' du sol']; break;
        case 'touchgo': c = ['Toulouse', 'Toucher et remise des gaz', rwy]; break;
        case 'ocean':
          c = v.sea === 'mediterranee' ? ['Méditerranée', 'L\'A350F survole la Méditerranée', v.text]
                                       : ['Atlantique', 'L\'A350F survole l\'océan Atlantique', v.text]; break;
        case 'atterrissage':
          var to = takeoffTime();
          c = ['Atterrissage', 'Atterrissage à ' + fmtTS(ev.t), (to ? fmtCoarse(ev.t - to) + ' de vol · ' : '') + rwy]; break;
        default: c = ['Info', v.text || '', ''];
      }
      return { tag: c[0], title: c[1], sub: c[2] };
    }
    function announce(t) {
      if (!api.leader()) return;
      st.events.forEach(function (ev) {
        if (announced[ev.id] || ev.at > t || t - ev.at >= ANN_WINDOW) return;
        announced[ev.id] = true;
        var c = eventCard(ev), left = (ANN_WINDOW - (t - ev.at)) / (DEMO ? DEMO_SPEED : 1);
        api.flash({ key: 'a350f:' + REG + ':' + ev.id, tag: c.tag, title: c.title, sub: c.sub, type: ev.type, expires: Date.now() + left });
      });
    }

    // ===== Toulouse weather (METAR through the relay), for the wait =====
    var wx = null;
    function pollWx() {
      var base = relayBase();
      if (!base) return;
      getJSON(base.replace(/adsb$/, 'wx') + '/LFBO').then(function (j) { if (j && j.metar) wx = j.metar; }).catch(function () {});
    }
    pollWx();
    var wxT = setInterval(pollWx, 300000);
    var CLOUDS = { FEW: 'quelques nuages', SCT: 'nuages épars', BKN: 'nuageux', OVC: 'couvert' };
    function wxSegs() {
      if (!wx || Date.now() / 1000 - wx.obsTime > 7200) return null;
      var raw = ' ' + (wx.rawOb || '') + ' ';
      var wind = wx.wspd === 0 ? 'calme' : (wx.wdir === 'VRB' ? 'variable' : pad(wx.wdir).padStart(3, '0') + '°') + ' · ' + uTxt('spd', wx.wspd);
      var gust = wx.wgst ? 'rafales ' + uTxt('spd', wx.wgst) : un('spd', wx.wspd || 0).s;
      var sky, vis = '';
      var vm = / (\d{4}) /.exec(raw.replace(/ \d{5}(G\d\d)?KT /, ' '));
      if (vm) vis = +vm[1] >= 9999 ? 'visibilité 10 km et plus' : 'visibilité ' + nf.format(+vm[1]) + ' m';
      if (/ CAVOK /.test(raw)) { sky = 'dégagé'; vis = 'CAVOK'; }
      else if (!wx.clouds || !wx.clouds.length || /^(CLR|SKC|NSC|NCD)$/.test(wx.clouds[0].cover)) sky = 'dégagé';
      else {
        var c = wx.clouds[0];
        sky = (CLOUDS[c.cover] || c.cover) + (c.base != null ? ' à ' + (metric() ? m(c.base) + ' m' : nf.format(c.base) + ' ft') : '');
      }
      if (/CB/.test(raw)) sky += ' · cumulonimbus';
      return [['Météo Toulouse', 'à ' + fmtTS(wx.obsTime * 1000), 'METAR LFBO'], ['Vent', wind, gust],
              ['Température', Math.round(wx.temp) + ' °C', 'QNH ' + Math.round(wx.altim) + ' hPa'], ['Ciel', sky, vis]];
    }

    // Position in words (a350f-places.js), refreshed every 5 s at most
    var where = { at: 0, text: '' };
    function whereNow() {
      if (!live || !window.A350F_WHERE) return '';
      if (Date.now() - where.at > 5000) {
        var w = window.A350F_WHERE(live.lat, live.lon);
        where = { at: Date.now(), text: w ? w.text : '' };
      }
      return where.text;
    }

    // ===== Figures: strap, tag, flight data =====
    var maps = [], profiles = [], teles = [], recaps = [];
    var texts = { tag: 'F-WXLD', where: '' };
    /* from the animated figures F (see tickFigures), not the raw last report */
    function drawFigures(F) {
      var sAlt, sSpd = '', sInfo, d = F ? distKm(F.lat, F.lon, HOME.lat, HOME.lon) : 0;
      if (!live) { sAlt = 'A350F'; sInfo = 'Toulouse-Blagnac · premier vol'; }
      else if (live.gnd) {
        sAlt = 'Au sol';
        sSpd = F.gs >= 3 ? uTxt('spd', F.gs) : '';
        sInfo = (d < 6 ? 'Toulouse-Blagnac' : nf.format(d) + ' km de Toulouse') + (F.gs >= 3 ? ' · cap ' + hdg(F.trk) : '');
      } else {
        sAlt = uTxt('alt', F.alt, true);
        sSpd = uTxt('spd', F.gs);
        sInfo = (F.vs > 300 ? '▲ ' : F.vs < -300 ? '▼ ' : '') + uTxt('vs', F.vs) + ' · cap ' + hdg(F.trk) + ' · ' + (whereNow() || nf.format(d) + ' km de Toulouse');
      }
      api.set('s_alt', sAlt); api.set('s_spd', sSpd); api.set('s_info', sInfo);
      texts.tag = !live ? REG : live.gnd ? 'AU SOL' : metric() ? uTxt('alt', F.alt) : 'FL' + pad(Math.round(F.alt / 100)).padStart(3, '0');
      var wtext = live && !live.gnd ? whereNow() : '';
      texts.where = wtext ? wtext.charAt(0).toUpperCase() + wtext.slice(1) : '';
      api.set('where', live ? whereNow() : '');
      maps.forEach(function (v) { v.texts(); });
      if (!teles.length) return;
      var cells = [];
      if (!live) {
        for (var i = 1; i <= 6; i++) cells.push(['–', '', '–']);
        cells.k6 = 'Indicatif';
      } else {
        if (live.gnd) cells.push(['AU SOL', '', d < 6 ? 'Toulouse-Blagnac' : 'altitude terrain']);
        else { var ua = un('alt', F.alt, true); cells.push([ua.n, ua.u, ua.s + ' · FL' + String(Math.round(F.alt / 100)).padStart(3, '0')]); }
        var us = un('spd', F.gs);
        cells.push([us.n, us.u, us.s]);
        var uv = un('vs', live.gnd ? 0 : F.vs);
        cells.push(live.gnd ? ['0', uv.u, 'au sol'] : [uv.n, uv.u, (F.vs > 300 ? 'en montée' : F.vs < -300 ? 'en descente' : 'en palier') + ' · ' + uv.s]);
        cells.push([hdg(F.trk), '', compass(F.trk, true)]);
        cells.push([d < 10 ? d.toFixed(1).replace('.', ',') : nf.format(d), 'km', 'de Toulouse-Blagnac']);
        if (live.mach != null && !live.gnd) {
          cells.k6 = 'Mach';
          cells.push([live.mach.toFixed(2).replace('.', ','), '', (live.ias != null ? 'IAS ' + uTxt('spd', live.ias) : '') +
                      (live.oat != null ? ' · ' + Math.round(live.oat) + ' °C ext.' : '')]);
        } else {
          cells.k6 = 'Indicatif';
          cells.push([live.flight || REG, '', live.squawk ? 'transpondeur ' + live.squawk : 'mode S ' + HEX.toUpperCase()]);
        }
      }
      teles.forEach(function (c) { c.draw(cells); });
    }

    /* Rolling figures: between two reports the altitude carries on at the
       reported climb rate (up to 10 s) and every figure eases towards its
       latest value — the readouts roll like an instrument. ~15 times a second. */
    var FIG = null, figDrawAt = 0;
    function tickFigures(ts, dt, pl) {
      if (!live) { if (ts - figDrawAt > 250) { figDrawAt = ts; drawFigures(null); } return; }
      var fresh = DEMO || Date.now() - live.seenAt < 30000;
      var ahead = fresh ? Math.max(0, Math.min(10000, now() - live.tl)) / 1000 : 0;
      var altT = live.gnd || live.alt == null ? null : live.alt + live.vs / 60 * ahead;
      var lat = live.lat, lon = live.lon;
      if (pl) { lon = pl.x * 360 - 180; lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * pl.y))) / RAD; }
      if (!FIG || FIG.gnd !== live.gnd || FIG.hex !== live.hex) {
        FIG = { alt: altT, gs: live.gs, vs: live.vs, trk: live.trk, gnd: live.gnd, hex: live.hex };
      } else {
        var k = 1 - Math.exp(-dt / 0.5);
        FIG.alt = altT == null ? null : FIG.alt == null ? altT : FIG.alt + (altT - FIG.alt) * k;
        FIG.gs += (live.gs - FIG.gs) * k;
        FIG.vs += (live.vs - FIG.vs) * k;
        FIG.trk = (FIG.trk + ((((live.trk - FIG.trk) % 360) + 540) % 360 - 180) * k + 360) % 360;
      }
      FIG.lat = lat; FIG.lon = lon;
      if (ts - figDrawAt < 66) return;
      figDrawAt = ts;
      drawFigures(FIG);
    }

    // ===== Recap (layout recap) =====
    var FIRST_FLIGHTS = [['A350-900', '14/06/2013', 245], ['A350-1000', '24/11/2016', 258]]; // minutes
    function evOf(type) {
      for (var i = st.events.length - 1; i >= 0; i--) if (st.events[i].type === type) return st.events[i];
      return null;
    }
    function recapHTML(t) {
      var to = takeoffTime(), dec = evOf('decollage'), att = evOf('atterrissage');
      var end = st.landing || (live && !live.gnd ? t : null);
      var mins = to && end ? Math.round((end - to) / 60000) : null;
      function cell(k, v, sub) {
        return '<div class="rcell"><div class="rk">' + esc(k) + '</div><div class="rval">' + esc(v) + '</div><div class="rs">' + esc(sub || '') + '</div></div>';
      }
      var h = '<h3>Bilan du premier vol · ' + esc(U.longDate(to || schedTime(), TZ)) + '</h3><div class="rgrid">' +
        cell('Décollage', to ? fmtTS(to) : '–', dec && dec.v && dec.v.rwy ? 'piste ' + dec.v.rwy : 'Toulouse-Blagnac') +
        cell('Atterrissage', st.landing ? fmtTS(st.landing) : live && !live.gnd ? 'en vol' : '–', att && att.v && att.v.rwy ? 'piste ' + att.v.rwy : '') +
        cell('Durée', mins != null ? fmtCoarse(mins * 60000) : '–', st.landing ? '' : mins != null ? 'vol en cours' : '') +
        cell('Distance', st.dist ? nf.format(st.dist) + ' km' : '–', 'parcourus') +
        cell('Altitude max', st.altMax ? uTxt('alt', st.altMax) : '–', st.altMax ? un('alt', st.altMax).s : '') +
        cell('Vitesse max', st.gsMax ? uTxt('spd', st.gsMax) : '–',
             (st.gsMax ? un('spd', st.gsMax).s : '') + (st.machMax ? ' · Mach ' + st.machMax.toFixed(2).replace('.', ',') : '')) +
        '</div><div class="rcmp"><div class="rk">Premiers vols de la famille A350</div>';
      var rows = FIRST_FLIGHTS.map(function (r) { return [r[0] + ' · ' + r[1].slice(-4), r[2], false]; });
      rows.push(['A350F · ' + (to ? new Date(to).getFullYear() : '2026'), mins, true]);
      var scale = Math.max.apply(null, rows.map(function (r) { return r[1] || 0; })) * 1.05 || 1;
      rows.forEach(function (r) {
        h += '<div class="rbar' + (r[2] ? ' now' : '') + '"><span>' + esc(r[0]) + '</span><i style="width:' +
             ((r[1] || 0) / scale * 100).toFixed(1) + '%"></i><b>' + (r[1] != null ? esc(fmtCoarse(r[1] * 60000)) : '–') + '</b></div>';
      });
      return h + '</div>';
    }

    // ===== Text, 4 times a second: variables for the bandeau and Companion =====
    var recapAutoDone = false, stateKey = '';
    function planned() { return Math.max(600000, landTime() - (takeoffTime() || schedTime())); }
    function updateText() {
      var t = now(), T0now = schedTime();
      var sk = JSON.stringify(ctl());
      if (sk !== stateKey) { stateKey = sk; profVersion++; }
      announce(t);
      if (recaps.length) { var rh = recapHTML(t); recaps.forEach(function (r) { r.draw(rh); }); }
      // recap auto: 3 minutes after the landing, an on-air fullscreen moves on to the recap
      if (S.recap === 'auto' && !recapAutoDone && st.landing && live && live.gnd && t - st.landing > 180000 && api.leader()) {
        var g = api.graphics().filter(function (x) { return x.type === 'bandeau'; })[0];
        var L = g && api.live(g.id);
        if (L && L.air && L.layout === 'full') { recapAutoDone = true; api.cmd('layout.recap'); }
      }
      var ph = phaseOf(t);
      lastPhase = ph;
      var to = takeoffTime();
      var fresh = live && (DEMO || Date.now() - live.seenAt < 30000);
      var hk = ph;
      if (ph === 'attente' && t >= T0now) hk = 'attente2';
      if (ph === 'atterri' && !live.near && distHome(live) > 10) hk = 'atterri2';
      var hl = (ctl().mode === 'neutral' && NEUTRAL[hk]) || HEADLINES[hk];
      var title = ctl().headline || hl;
      // Timer: countdown to the scheduled take-off, then flight time
      var label, value, hLabel;
      if (ph === 'atterri') { label = 'Durée du vol'; value = to ? fmtClock(st.landing - to) : '--:--:--'; hLabel = 'durée du vol'; }
      else if (live && !live.gnd) { label = 'En vol depuis'; value = to ? fmtClock(t - to) : '--:--:--'; hLabel = 'en vol depuis'; }
      else if (t < T0now) { label = 'Décollage prévu dans'; value = fmtClock(T0now - t); hLabel = 'décollage prévu dans'; }
      else { label = 'Décollage prévu à ' + fmtTS(T0now); value = 'IMMINENT'; hLabel = 'décollage prévu à ' + fmtTS(T0now); }
      var badge, idle;
      if (DEMO) { badge = 'Démo'; idle = ''; }
      else if (fresh) { badge = 'En direct'; idle = ''; }
      else if (live) { badge = 'Signal ADS-B interrompu'; idle = 'oui'; }
      else { badge = 'ADS-B · en attente'; idle = 'oui'; }
      var d = live ? distHome(live) : 0;
      // Ticker: sets of four rotating every 12 s — the aircraft and the
      // weather before take-off, the records in flight, the first-flight
      // comparison after landing
      var sets;
      if (!st.airSeen) {
        sets = [[['Décollage prévu', fmtTS(T0now), 'retour prévu ' + fmtTS(landTime())], ['Avion', REG, 'MSN ' + MSN],
                 ['Moteurs', '2 × Trent XWB-97', 'Rolls-Royce'], ['Charge utile', '111 t', 'max.']],
                [['Longueur', '70,8 m', ''], ['Envergure', '64,75 m', ''], ['Masse max. au décollage', '319 t', ''], ['Autonomie', '8 700 km', '4 700 NM']],
                [['Porte cargo', '4,3 × 3,15 m', 'la plus large du marché'], ['Carburant', 'jusqu\'à −40 %', 'vs. la concurrence'],
                 ['Campagne d\'essais', '≈ 400 h de vol', '2 avions'], ['Livraisons', 'fin 2027', '']]];
        var ws = wxSegs();
        if (ws) sets.push(ws);
      } else if (ph === 'atterri') {
        var flown = to ? fmtCoarse(st.landing - to) : '–';
        sets = [[['Décollage', to ? fmtTS(to) : '–', ''], ['Atterrissage', fmtTS(st.landing), to ? flown + ' de vol' : ''],
                 ['Altitude max', uTxt('alt', st.altMax), un('alt', st.altMax).s], ['Distance', nf.format(st.dist) + ' km', 'parcourus']],
                [['1er vol A350-900', '4 h 05', '2013'], ['1er vol A350-1000', '4 h 18', '2016'],
                 ['1er vol A350F', flown, 'aujourd\'hui'], ['Vitesse max', uTxt('spd', st.gsMax), '']]];
      } else {
        var left = landTime() - t;
        sets = [[['Décollage', to ? fmtT(to) : '–', ''], ['Altitude max', uTxt('alt', st.altMax), un('alt', st.altMax).s],
                 ['Vitesse max', uTxt('spd', st.gsMax), un('spd', st.gsMax).s], ['Distance', nf.format(st.dist) + ' km', 'parcourus']],
                [['Atterrissage prévu', fmtTS(landTime()), left > 60000 ? 'dans ' + fmtCoarse(left) : 'à Toulouse'],
                 ['Durée prévue', fmtCoarse(planned()), 'de vol'], ['Mach max', st.machMax ? st.machMax.toFixed(2).replace('.', ',') : '–', ''],
                 ['Moteurs', '2 × Trent XWB-97', 'Rolls-Royce']]];
      }
      // Progress: flight time against the planned duration, an hour mark each hour
      var dur = Math.round(planned() / 60000) * 60000, marks = [];
      for (var hh = 1; hh * 3600000 < dur; hh++) marks.push(hh * 3600000 / dur);
      var p = to ? ((st.landing || t) - to) / planned() : 0;
      api.setAll({
        title: title, status: ctl().headline || SPOKEN[hk] || hl, timer_label: label, timer: value, label: hLabel,
        badge: badge, badge_idle: idle, clock: fmtT(t) + (DEMO ? '  [DÉMO ×' + DEMO_SPEED + ']' : ''),
        s_id: 'MSN ' + MSN + ' · Toulouse-Blagnac', reg: REG,
        ticker: sets, progress: Math.min(1, Math.max(0, p)), marks: marks,
        _takeoff: to || 0,
        phase: ph, signal: DEMO || fresh ? 'live' : live ? 'stale' : 'none',
        source: sourceErr && !fresh ? 'erreur' : sourceName,
        time: label === 'En vol depuis' || label === 'Durée du vol'
          ? (to ? fmtCoarse((st.landing && ph === 'atterri' ? st.landing : t) - to) : '') : t < T0now ? fmtCoarse(T0now - t) : '',
        alert: alertCode, t_sched: fmtTS(T0now), t_land: fmtTS(landTime()),
        alt: !live ? '' : live.gnd ? 'au sol' : ft(live.alt) + ' ft', alt_m: !live || live.gnd ? '' : m(live.alt) + ' m',
        speed: live ? Math.round(live.gs) + ' kt' : '', speed_kmh: live ? kmh(live.gs) + ' km/h' : '',
        vs: live && !live.gnd ? vsTxt(live.vs) + ' ft/min' : '', hdg: live ? hdg(live.trk) + ' ' + compass(live.trk) : '',
        dist: live ? nf.format(d) + ' km' : '', callsign: live ? live.flight : '',
        t_takeoff: to ? fmtTS(to) : '', t_landing: st.landing ? fmtTS(st.landing) : '',
        alt_max: st.altMax ? ft(st.altMax) + ' ft' : '', speed_max: st.gsMax ? Math.round(st.gsMax) + ' kt' : '',
        distance: st.dist ? nf.format(st.dist) + ' km' : '',
        /* for the panel: the flight's last milestones */
        events: st.events.slice(-8).map(function (e) { var k = eventCard(e); return { t: fmtTS(e.t), text: k.title + (k.sub ? ' — ' + k.sub : '') }; })
      });
      texts.mapsub = live ? nf.format(d) + ' km de TLS' : 'TOULOUSE';
      texts.profsub = st.altMax ? 'ALT. MAX ' + uTxt('alt', st.altMax) : 'EN ATTENTE';
      texts.source = sourceName || 'adsb.lol';
      maps.forEach(function (v) { v.texts(); });
      profiles.forEach(function (v) { v.texts(); });
      // a reset from the panel: forget the stored track, take the relay's again
      var ra = ctl().resetAt || 0;
      if (ra > resetSeen) {
        resetSeen = ra;
        try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
        if (!DEMO) {
          st = { samples: [], takeoff: null, landing: null, airSeen: false, altMax: 0, gsMax: 0, dist: 0, hex: HEX, events: [] };
          live = null; FIG = null; trackDirty = true; profVersion++;
          hist = { since: DAY_START, key: '', rec: '', busy: false, again: false };
          syncHistory();
        }
      }
    }
    var textT = setInterval(updateText, 250);

    // ===== Map =====
    /* A minimal slippy map: Web Mercator tiles in two layers (the current
       zoom level over the one below, so a level change never shows a hole),
       the track in SVG, and a camera that glides every frame. Default
       basemap: OpenStreetMap's own tiles, inverted into the navy. */
    var TILE = 256, ZREF = 12;
    var TILE_URL = S.tiles || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    var TILES_ON = TILE_URL !== 'none';
    var TILE_ATTRIB = S.attrib || '© les contributeurs d\'OpenStreetMap';
    var tileStyle = S.tilestyle && S.tilestyle !== 'auto' ? S.tilestyle : (S.tiles ? 'tint' : 'invert');
    var ORIGIN = merc(HOME.lat, HOME.lon), ZS = TILE * Math.pow(2, ZREF);
    function local(lat, lon) { var q = merc(lat, lon); return [(q.x - ORIGIN.x) * ZS, (q.y - ORIGIN.y) * ZS]; }
    function tileUrl(z, x, y) {
      return TILE_URL.replace('{s}', 'abcd'.charAt((x + y) % 4)).replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{r}', '@2x');
    }
    /* Track polyline (shared by every map), rebuilt when a sample is added;
       bounding box alongside for the camera (normalised Mercator units) */
    var track = { pts: '', bbox: null, version: 0 };
    function rebuildTrack() {
      trackDirty = false;
      var pts = [], last = null, lastB = null, h0 = merc(HOME.lat, HOME.lon);
      var bbox = { x0: h0.x, x1: h0.x, y0: h0.y, y1: h0.y };
      st.samples.forEach(function (s, i) {
        var q = merc(s.lat, s.lon);
        if (!s.g || (i && !st.samples[i - 1].g)) { // airborne track + the roll-out
          bbox.x0 = Math.min(bbox.x0, q.x); bbox.x1 = Math.max(bbox.x1, q.x);
          bbox.y0 = Math.min(bbox.y0, q.y); bbox.y1 = Math.max(bbox.y1, q.y);
        }
        var p = [(q.x - ORIGIN.x) * ZS, (q.y - ORIGIN.y) * ZS];
        // drop points that add nothing on a straight leg (keeps long flights light)
        if (last && lastB != null) {
          var b = Math.atan2(p[1] - last[1], p[0] - last[0]), dd = Math.hypot(p[0] - last[0], p[1] - last[1]);
          var db = Math.abs(((b - lastB + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
          if (db < 0.02 && dd < 400 && i < st.samples.length - 1) return;
        }
        if (last) lastB = Math.atan2(p[1] - last[1], p[0] - last[0]);
        pts.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
        last = p;
      });
      track = { pts: pts.join(' '), bbox: bbox, version: track.version + 1 };
    }
    /* Where the aircraft is drawn: its last report carried forward along its
       track at its ground speed (up to 20 s), so it glides between reports;
       a report that disagrees melts the difference away over ~0.7 s */
    var shown = null, corr = { x: 0, y: 0, at: 0 };
    function predicted(t) {
      if (!live) return null;
      var dt = Math.max(0, Math.min(20000, t - live.tl)) / 1000;
      if (live.gs < 3 || (!DEMO && Date.now() - live.seenAt > 30000)) dt = 0;
      var dist = live.gs * 0.514444 * dt;
      var lat = live.lat + dist * Math.cos(live.trk * RAD) / 111320;
      var lon = live.lon + dist * Math.sin(live.trk * RAD) / (111320 * Math.cos(live.lat * RAD));
      return merc(lat, lon);
    }
    function newReport() {
      if (!shown) return;
      var p = predicted(now());
      if (!p) return;
      corr = { x: shown.x - p.x, y: shown.y - p.y, at: performance.now() };
    }
    function planeNow() {
      var p = predicted(now());
      if (!p) return null;
      var k = Math.exp(-(performance.now() - corr.at) / 700);
      return { x: p.x + corr.x * k, y: p.y + corr.y * k };
    }

    function mapVisual(el, host) {
      var root = GFX.el('div', 'a3-map', el);
      root.innerHTML =
        '<div class="a3-tiles ' + tileStyle + '"></div><div class="a3-tint ' + tileStyle + '"></div>' +
        '<svg class="a3-svg" aria-hidden="true"><g class="a3-trk"><g class="a3-rwys" stroke="rgba(255,255,255,0.85)" stroke-width="3" stroke-linecap="round"></g>' +
        '<polyline class="a3-case" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
        '<polyline class="a3-line" fill="none" style="stroke:var(--c-accent)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></g>' +
        '<line class="a3-head" style="stroke:var(--c-accent)" stroke-width="5" stroke-linecap="round"/>' +
        '<g class="a3-home"><circle r="7" fill="#fff" style="stroke:var(--c-accent)" stroke-width="3"/>' +
        '<text class="a3-homelbl" x="16" y="-12" font-size="17" font-weight="900" fill="#fff" style="stroke:var(--c-base)" stroke-width="4" stroke-linejoin="round" paint-order="stroke">TOULOUSE-BLAGNAC</text></g></svg>' +
        '<div class="a3-plane nodata"><div class="a3-pos"><div class="a3-pop"><div class="a3-ring"></div>' +
        '<svg class="a3-icon" viewBox="0 0 100 100" aria-hidden="true"><g fill="#fff" style="stroke:var(--c-base)" stroke-width="2.4" stroke-linejoin="round">' +
        '<path d="M46.5 41 L4 63 L4 68.5 L46.5 56 Z"/><path d="M53.5 41 L96 63 L96 68.5 L53.5 56 Z"/>' +
        '<rect x="25.5" y="44" width="7.5" height="13" rx="3.5"/><rect x="67" y="44" width="7.5" height="13" rx="3.5"/>' +
        '<path d="M47 80 L30 90.5 L30 94 L47.5 89.5 Z"/><path d="M53 80 L70 90.5 L70 94 L52.5 89.5 Z"/>' +
        '<path d="M50 2.5 C53.8 2.5 54.4 9 54.4 16 L54.4 82 C54.4 88 52.6 95 50 97.5 C47.4 95 45.6 88 45.6 82 L45.6 16 C45.6 9 46.2 2.5 50 2.5 Z"/></g></svg>' +
        '<div class="a3-tag"><span class="r">A350F</span><span class="a3-tagalt">AU SOL</span></div></div></div></div>' +
        '<div class="a3-cap" aria-hidden="true"><b><span class="nrc">TRAJECTOIRE EN DIRECT</span><span class="rc">LE PREMIER VOL DE L\'A350F</span> · <span class="a3-capday">–</span></b>' +
        '<div class="leg"><i></i>TRACE ADS-B<i class="lp"></i><span class="a3-capreg"></span></div><div class="a3-where"></div></div>' +
        '<div class="bd-cardhead"><b>Trajectoire</b><span class="a3-mapsub">–</span></div>' +
        '<div class="a3-attrib"></div>';
      var tilesEl = $q(root, 'a3-tiles'), planeBox = $q(root, 'a3-plane'), planePos = $q(root, 'a3-pos'), planePop = $q(root, 'a3-pop');
      var planeIcon = $q(root, 'a3-icon'), trkG = $q(root, 'a3-trk'), trkLine = $q(root, 'a3-line'), trkCase = $q(root, 'a3-case');
      var trkHead = $q(root, 'a3-head'), homeG = $q(root, 'a3-home'), cap = $q(root, 'a3-cap');
      var place = el.dataset.place || 'panel', layers = {}, cam = null, fastUntil = 0, mapW = 0, mapH = 0, trackV = -1;
      $q(root, 'a3-rwys').innerHTML = RUNWAYS.map(function (r) {
        var a = local(r[0], r[1]), b = local(r[2], r[3]);
        return '<line x1="' + a[0].toFixed(2) + '" y1="' + a[1].toFixed(2) + '" x2="' + b[0].toFixed(2) + '" y2="' + b[1].toFixed(2) + '" vector-effect="non-scaling-stroke"/>';
      }).join('');
      GFX.text($q(root, 'a3-capday'), U.longDate(T0, TZ).toUpperCase());
      GFX.text($q(root, 'a3-capreg'), REG);

      function drawLayer(zl, c, w, h, show) {
        var L = layers[zl];
        if (!L) {
          if (!show) return;
          L = layers[zl] = { el: document.createElement('div'), key: '', imgs: {} };
          L.el.className = 'a3-tl';
          L.el.style.zIndex = zl;
          tilesEl.appendChild(L.el);
        }
        L.el.style.display = show ? '' : 'none';
        if (!show) return;
        var n = 1 << zl, s = Math.pow(2, c.z - zl);
        var cx = c.x * n * TILE, cy = c.y * n * TILE;
        var tx0 = Math.floor((cx - w / 2 / s) / TILE), tx1 = Math.floor((cx + w / 2 / s) / TILE);
        var ty0 = Math.max(0, Math.floor((cy - h / 2 / s) / TILE)), ty1 = Math.min(n - 1, Math.floor((cy + h / 2 / s) / TILE));
        var key = tx0 + ':' + tx1 + ':' + ty0 + ':' + ty1;
        if (key !== L.key) {
          L.key = key;
          var keep = {};
          for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
            var k = tx + '/' + ty, img = L.imgs[k];
            if (!img) {
              img = new Image();
              img.className = 'a3-tile'; img.alt = ''; img.decoding = 'async';
              img.onload = function () { this.classList.add('ok'); };
              img.src = tileUrl(zl, ((tx % n) + n) % n, ty);
              L.el.appendChild(img);
            }
            keep[k] = img;
          }
          for (var old in L.imgs) if (!keep[old]) L.imgs[old].remove();
          L.imgs = keep; L.ox = tx0; L.oy = ty0;
          for (var kk in keep) {
            var xy = kk.split('/');
            keep[kk].style.left = ((+xy[0] - tx0) * TILE) + 'px';
            keep[kk].style.top = ((+xy[1] - ty0) * TILE) + 'px';
          }
        }
        L.el.style.transform = 'translate(' + (w / 2 - (cx - L.ox * TILE) * s).toFixed(2) + 'px,' +
                               (h / 2 - (cy - L.oy * TILE) * s).toFixed(2) + 'px) scale(' + s.toFixed(5) + ')';
      }
      function drawTiles(c, w, h) {
        if (!TILES_ON) return;
        // the nearest level, drawn at 0.71–1.41×; the level below stays loaded underneath
        var zi = Math.max(1, Math.min(18, Math.round(c.z)));
        for (var z in layers) { z = +z; if (Math.abs(z - zi) > 3) { layers[z].el.remove(); delete layers[z]; } }
        for (var zz in layers) if (+zz !== zi && +zz !== zi - 1) drawLayer(+zz, c, w, h, false);
        drawLayer(zi - 1, c, w, h, true);
        drawLayer(zi, c, w, h, true);
      }
      /* Free area for the subject, in map pixels: what the bandeau's blocks
       leave (read from the live layout, cached for 0.4 s) */
      var rectsAt = 0, rectsCache = null;
      function freeRects(w, h) {
        var t = performance.now();
        if (rectsCache && t - rectsAt < 400) return rectsCache;
        rectsAt = t;
        // margins: the marker and its ring reach ~50 px out, its tag ~200 px right
        var pad = 70, padR = 220, mr = root.getBoundingClientRect();
        if (place === 'panel') return (rectsCache = [{ l: 0, t: 0, r: w, b: h }]);
        if (place === 'card') return (rectsCache = [{ l: 24, t: 50, r: w - 24, b: h - 24 }]);
        var ob = host.obstacles ? host.obstacles() : {}, cr = cap.getBoundingClientRect();
        var top = cr.bottom - mr.top + pad, right = (ob.col ? ob.col.left - mr.left : w) - padR;
        var bottom = (ob.bottom ? ob.bottom.top - mr.top : h) - pad, card = ob.card;
        if (!card) return (rectsCache = [{ l: pad, t: top, r: right, b: bottom }]);
        rectsCache = [
          { l: card.right - mr.left + pad, t: top, r: right, b: bottom }, // tall column right of the card
          { l: pad, t: top, r: right, b: card.top - mr.top - pad }        // wide band above the card
        ];
        return rectsCache;
      }
      /* The lower third rides with the aircraft; the fullscreen map frames
         the whole track (or follows it, map.follow); the card frames the track */
      function camTarget(w, h, pl) {
        var L = host.layout ? host.layout() : { view: {} }, recap = L.layout === 'recap';
        var follow = place === 'panel' || (place === 'canvas' && (L.view || {}).map === 'follow' && !recap);
        var rects = freeRects(w, h), best = null, home = merc(HOME.lat, HOME.lon), fs = place !== 'panel';
        rects.forEach(function (r) {
          var rw = Math.max(40, r.r - r.l), rh = Math.max(40, r.b - r.t), z, c, score;
          if (follow || !pl) {
            c = pl || home;
            z = !pl ? (fs ? 12.6 : 13.2) : live.gnd ? (fs ? 14 : 13.6) : (fs ? 9.6 : 9.2);
            score = rw * rh;
          } else {
            var bb = track.bbox || { x0: home.x, x1: home.x, y0: home.y, y1: home.y };
            var x0 = Math.min(bb.x0, pl.x), x1 = Math.max(bb.x1, pl.x), y0 = Math.min(bb.y0, pl.y), y1 = Math.max(bb.y1, pl.y);
            var bw = Math.max(1e-9, x1 - x0) * TILE, bh = Math.max(1e-9, y1 - y0) * TILE;
            z = Math.log2(Math.min(rw / bw, rh / bh));
            c = z < 4 ? pl : { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
            z = Math.max(4, Math.min(live.gnd && !st.takeoff ? 14 : 12.5, z));
            score = z;
          }
          if (!best || score > best.score) {
            var ws = TILE * Math.pow(2, z);
            best = { score: score, z: z, x: c.x - ((r.l + r.r) / 2 - w / 2) / ws, y: c.y - ((r.t + r.b) / 2 - h / 2) / ws };
          }
        });
        return best;
      }
      function reframe() { rectsCache = null; fastUntil = performance.now() + 900; }
      var ro = window.ResizeObserver ? new ResizeObserver(function () { mapW = root.clientWidth; mapH = root.clientHeight; reframe(); }) : null;
      if (ro) ro.observe(root);
      function frame(ts, dt, pl) {
        if (place === 'hidden') return;
        if (!mapW) { mapW = root.clientWidth; mapH = root.clientHeight; }
        var w = mapW, h = mapH;
        if (!w || !h) return;
        if (trackV !== track.version) { trackV = track.version; trkLine.setAttribute('points', track.pts); trkCase.setAttribute('points', track.pts); }
        var tgt = camTarget(w, h, pl);
        if (!cam) cam = { x: tgt.x, y: tgt.y, z: tgt.z };
        else {
          // zooming out is quicker than zooming in: a growing track never pushes the aircraft out
          var fast = ts < fastUntil;
          var k = 1 - Math.exp(-dt / (fast ? 0.12 : 0.5));
          var kz = 1 - Math.exp(-dt / (fast ? 0.15 : tgt.z < cam.z ? 0.3 : 0.9));
          cam.x += (tgt.x - cam.x) * k; cam.y += (tgt.y - cam.y) * k; cam.z += (tgt.z - cam.z) * kz;
        }
        drawTiles(cam, w, h);
        var ws = TILE * Math.pow(2, cam.z);
        var sx = function (x) { return w / 2 + (x - cam.x) * ws; }, sy = function (y) { return h / 2 + (y - cam.y) * ws; };
        var sc = Math.pow(2, cam.z - ZREF);
        trkG.setAttribute('transform', 'translate(' + sx(ORIGIN.x).toFixed(2) + ' ' + sy(ORIGIN.y).toFixed(2) + ') scale(' + sc.toFixed(6) + ')');
        var hm = merc(HOME.lat, HOME.lon), hx = sx(hm.x), hy = sy(hm.y);
        homeG.setAttribute('transform', 'translate(' + hx.toFixed(1) + ' ' + hy.toFixed(1) + ')');
        planeBox.classList.toggle('nodata', !pl);
        // up close the runways take over from the airport marker, which also
        // steps aside whenever the aircraft (and its tag) is on top of it
        var px = pl ? sx(pl.x) : -1e4, py = pl ? sy(pl.y) : -1e4;
        homeG.style.opacity = cam.z > 12.2 || (px > hx - 90 && px < hx + 260 && Math.abs(py - hy) < 70) ? 0 : 1;
        if (pl) {
          planePos.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px)';
          planeIcon.style.transform = 'rotate(' + (live.trk || 0).toFixed(1) + 'deg)';
          var ls = st.samples[st.samples.length - 1];
          if (ls && (!live.gnd || st.takeoff)) {
            var q = merc(ls.lat, ls.lon);
            trkHead.setAttribute('x1', sx(q.x).toFixed(1)); trkHead.setAttribute('y1', sy(q.y).toFixed(1));
            trkHead.setAttribute('x2', px.toFixed(1)); trkHead.setAttribute('y2', py.toFixed(1));
            trkHead.style.display = '';
          } else trkHead.style.display = 'none';
        } else trkHead.style.display = 'none';
      }
      var v = {
        frame: frame,
        texts: function () {
          GFX.text($q(root, 'a3-tagalt'), texts.tag);
          GFX.text($q(root, 'a3-where'), texts.where);
          GFX.text($q(root, 'a3-mapsub'), texts.mapsub || '');
          // the lower third's square only has room for the short credit
          GFX.text($q(root, 'a3-attrib'), (TILES_ON ? (place === 'panel' && !S.attrib ? '© OpenStreetMap' : TILE_ATTRIB) + ' · ' : '') +
                   'ADS-B ' + (texts.source || 'adsb.lol'));
        },
        place: function (p) { place = p; root.dataset.place = p; reframe(); mapW = root.clientWidth; mapH = root.clientHeight; v.texts(); },
        layout: function (L) { reframe(); root.dataset.recap = L.layout === 'recap' ? 'on' : 'off'; },
        parts: function () { return [{ el: planePop, role: 'visual' }]; },
        destroy: function () { if (ro) ro.disconnect(); maps.splice(maps.indexOf(v), 1); root.remove(); }
      };
      maps.push(v);
      v.place(place);
      return v;
    }

    // ===== Flight profile: altitude (area) and ground speed (dashed) =====
    function profileVisual(el, host) {
      var root = GFX.el('div', 'a3-prof', el);
      var head = GFX.el('div', 'a3-profhead', root);
      GFX.el('b', '', head, 'PROFIL DE VOL');
      var sub = GFX.el('span', '', head, '–');
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'a3-profsvg');
      root.appendChild(svg);
      var place = el.dataset.place || 'card', drawn = -1, drawnAt = 0, dirty = true, uid = 'p' + (++seq);
      function draw() {
        dirty = false;
        var w = svg.clientWidth, h = svg.clientHeight;
        if (!w || !h || place === 'hidden') return;
        var onCanvas = place === 'canvas', big = onCanvas, fsz = big ? 17 : 12, box;
        if (onCanvas) {
          // the same free area the map camera uses, minus room for the axes
          var sr = svg.getBoundingClientRect(), ob = host.obstacles ? host.obstacles() : {};
          box = { l: 90 + 86, t: 40, r: (ob.col ? ob.col.left : sr.right) - sr.left - (metric() ? 110 : 70),
                  b: (ob.card ? ob.card.top : ob.bottom ? ob.bottom.top : sr.bottom) - sr.top - 64 };
        } else box = { l: 50, t: 10, r: w - 40, b: h - 24 };
        if (box.r - box.l < 60 || box.b - box.t < 40) { svg.innerHTML = ''; return; }
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        var t = now(), to = takeoffTime(), T0now = schedTime();
        // from 5 min before take-off (or the first airborne point, when joined mid-flight)
        var from = to;
        if (!from && st.airSeen) st.samples.some(function (s) { return !s.g && (from = s.t); });
        var Sm = from ? st.samples.filter(function (s) { return s.t >= from - 5 * 60000; }) : [];
        var ta = from ? from - 5 * 60000 : Math.min(t, T0now) - 10 * 60000;
        var tb = Math.max(t, landTime());
        if (st.landing) tb = Math.max(st.landing + 10 * 60000, Math.min(tb, st.landing + 20 * 60000));
        Sm = Sm.filter(function (s) { return s.t <= tb; });
        var aMax = Math.max(10000, Math.ceil((st.altMax + 3000) / 10000) * 10000), sMax = Math.max(300, Math.ceil((st.gsMax + 40) / 100) * 100);
        function X(tt) { return box.l + (tt - ta) / (tb - ta) * (box.r - box.l); }
        function Y(a) { return box.b - a / aMax * (box.b - box.t); }
        function YS(s) { return box.b - s / sMax * (box.b - box.t); }
        var o = [];
        o.push('<defs><linearGradient id="pfill' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
               '<stop offset="0" style="stop-color:var(--c-accent)" stop-opacity="0.75"/><stop offset="1" style="stop-color:var(--c-accent)" stop-opacity="0.08"/></linearGradient></defs>');
        var met = metric();
        var aK = met ? 0.3048 : 1, stp = met ? (aMax * aK <= 6000 ? 1000 : 2000) : (aMax <= 20000 ? 5000 : 10000);
        for (var av = stp; av / aK <= aMax; av += stp) {
          var a = av / aK;
          o.push('<line x1="' + box.l + '" x2="' + box.r + '" y1="' + Y(a).toFixed(1) + '" y2="' + Y(a).toFixed(1) + '" stroke="rgba(255,255,255,0.16)" stroke-dasharray="3 7"/>');
          o.push('<text x="' + (box.l - 8) + '" y="' + (Y(a) + fsz * 0.35).toFixed(1) + '" text-anchor="end" font-size="' + fsz + '" fill="rgba(255,255,255,0.6)">' +
                 nf.format(av) + (big ? (met ? ' m' : ' ft') : '') + '</text>');
        }
        var sK = met ? 1.852 : 1, sStep = met ? (sMax * sK <= 700 ? 200 : 300) : (sMax <= 400 ? 100 : 200);
        for (var sv = sStep; sv / sK <= sMax; sv += sStep) {
          o.push('<text x="' + (box.r + 8) + '" y="' + (YS(sv / sK) + fsz * 0.35).toFixed(1) + '" font-size="' + fsz + '" fill="rgba(160,190,255,0.75)">' +
                 sv + (big ? (met ? ' km/h' : ' kt') : '') + '</text>');
        }
        o.push('<line x1="' + box.l + '" x2="' + box.r + '" y1="' + box.b + '" y2="' + box.b + '" stroke="#fff" stroke-width="2"/>');
        var tickMs = [1800000, 3600000, 7200000, 10800000, 21600000].filter(function (s) { return (tb - ta) / s <= 6; })[0] || 43200000;
        for (var tt = Math.ceil(ta / tickMs) * tickMs; tt <= tb; tt += tickMs) {
          o.push('<line x1="' + X(tt).toFixed(1) + '" x2="' + X(tt).toFixed(1) + '" y1="' + box.b + '" y2="' + (box.b + 6) + '" stroke="rgba(255,255,255,0.6)"/>');
          o.push('<text x="' + X(tt).toFixed(1) + '" y="' + (box.b + fsz + 8) + '" text-anchor="middle" font-size="' + fsz + '" fill="rgba(255,255,255,0.6)">' + fmtTS(tt) + '</text>');
        }
        if (!Sm.length) {
          o.push('<text x="' + ((box.l + box.r) / 2) + '" y="' + ((box.t + box.b) / 2) + '" text-anchor="middle" font-size="' + (fsz + 4) +
                 '" font-weight="900" fill="rgba(255,255,255,0.8)">EN ATTENTE DU DÉCOLLAGE</text>');
        } else {
          var line = [], spd = [], lastX = -1e9;
          Sm.forEach(function (s, i) {
            var px = X(s.t);
            if (px - lastX < 1 && i < Sm.length - 1) return;
            lastX = px;
            var alt = s.g ? 0 : Math.max(0, (s.a == null ? HOME.elev : s.a) - HOME.elev);
            line.push(px.toFixed(1) + ',' + Y(alt).toFixed(1));
            spd.push(px.toFixed(1) + ',' + YS(s.s).toFixed(1));
          });
          var x0 = X(Sm[0].t).toFixed(1), x1 = X(Sm[Sm.length - 1].t).toFixed(1);
          o.push('<polygon points="' + x0 + ',' + box.b + ' ' + line.join(' ') + ' ' + x1 + ',' + box.b + '" fill="url(#pfill' + uid + ')"/>');
          o.push('<polyline points="' + spd.join(' ') + '" fill="none" stroke="rgba(160,190,255,0.85)" stroke-width="' + (big ? 2.5 : 1.6) +
                 '" stroke-dasharray="' + (big ? '10 8' : '6 5') + '"/>');
          o.push('<polyline points="' + line.join(' ') + '" fill="none" stroke="#fff" stroke-width="' + (big ? 3.5 : 2.2) + '" stroke-linejoin="round"/>');
          var ls = Sm[Sm.length - 1], lalt = ls.g ? 0 : Math.max(0, (ls.a || HOME.elev) - HOME.elev);
          o.push('<circle cx="' + x1 + '" cy="' + Y(lalt).toFixed(1) + '" r="' + (big ? 8 : 5) + '" style="fill:var(--c-accent)" stroke="#fff" stroke-width="' + (big ? 3 : 2) + '"/>');
          var TAGS = { fl100: 'FL100', palier: 'PALIER', mach: 'MACH', descente: 'DESCENTE', passage: 'PASSAGE BAS',
                       remise: 'REMISE DES GAZ', touchgo: 'TOUCH & GO', ocean: 'ATLANTIQUE' };
          var placed = [];
          st.events.forEach(function (ev) {
            if (!TAGS[ev.type] || ev.t < ta || ev.t > tb) return;
            var i = 0;
            while (i < Sm.length - 1 && Sm[i + 1].t <= ev.t) i++;
            var sm = Sm[i], ea = sm.g ? 0 : Math.max(0, (sm.a == null ? HOME.elev : sm.a) - HOME.elev);
            var ex = X(ev.t), ey = Y(ea), dsz = big ? 7 : 4;
            o.push('<path d="M' + ex.toFixed(1) + ' ' + (ey - dsz).toFixed(1) + 'l' + dsz + ' ' + dsz + 'l-' + dsz + ' ' + dsz + 'l-' + dsz + '-' + dsz +
                   'z" fill="#fff" style="stroke:var(--c-base)" stroke-width="1.5"/>');
            if (!big) return;
            var label = TAGS[ev.type] + (ev.type === 'mach' ? ' ' + ev.v.m.toFixed(2).replace('.', ',') : '');
            var half = label.length * (fsz - 3) * 0.3, ly = ey - dsz - 8;
            for (var k = 0; k < placed.length; k++) {
              var q = placed[k];
              if (Math.abs(q.y - ly) < fsz && ex - half < q.x + q.half + 6 && ex + half > q.x - q.half - 6) { ly = q.y - fsz - 2; k = -1; }
            }
            placed.push({ x: ex, y: ly, half: half });
            o.push('<text x="' + ex.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle" font-size="' + (fsz - 3) +
                   '" font-weight="900" fill="#fff" style="stroke:var(--c-base)" stroke-width="4" paint-order="stroke">' + label + '</text>');
          });
          [[to, 'DÉCOLLAGE'], [st.landing, 'ATTERRISSAGE']].forEach(function (mk) {
            if (!mk[0] || mk[0] < ta) return;
            var mx = X(mk[0]).toFixed(1);
            o.push('<line x1="' + mx + '" x2="' + mx + '" y1="' + box.t + '" y2="' + box.b + '" stroke="rgba(255,255,255,0.5)" stroke-dasharray="2 5"/>');
            var rightHalf = +mx > (box.l + box.r) / 2;
            if (big) o.push('<text x="' + (+mx + (rightHalf ? -8 : 8)) + '" y="' + (box.t + fsz) + '" font-size="' + fsz + '" text-anchor="' +
                            (rightHalf ? 'end' : 'start') + '" font-weight="900" fill="#fff">' + mk[1] + ' ' + fmtTS(mk[0]) + '</text>');
          });
        }
        if (big) {
          var lx = box.r - 330, ly2 = box.b + fsz + 40;
          o.push('<rect x="' + lx + '" y="' + (ly2 - 11) + '" width="36" height="10" style="fill:var(--c-accent)" stroke="#fff" stroke-width="2"/>');
          o.push('<text x="' + (lx + 46) + '" y="' + ly2 + '" font-size="16" font-weight="700" fill="#fff">ALTITUDE</text>');
          o.push('<line x1="' + (lx + 170) + '" x2="' + (lx + 206) + '" y1="' + (ly2 - 6) + '" y2="' + (ly2 - 6) + '" stroke="rgba(160,190,255,0.9)" stroke-width="3" stroke-dasharray="9 6"/>');
          o.push('<text x="' + (lx + 216) + '" y="' + ly2 + '" font-size="16" font-weight="700" fill="#fff">VITESSE SOL</text>');
        }
        svg.innerHTML = o.join('');
      }
      var ro = window.ResizeObserver ? new ResizeObserver(function () { dirty = true; }) : null;
      if (ro) ro.observe(svg);
      // redraw on a new sample, a layout change, or every 10 s for the clock
      var timer = setInterval(function () {
        if (dirty || drawn !== profVersion || Date.now() - drawnAt > 10000) { drawn = profVersion; drawnAt = Date.now(); draw(); }
      }, 500);
      var v = {
        texts: function () { GFX.text(sub, texts.profsub || ''); },
        place: function (p) { place = p; dirty = true; setTimeout(function () { dirty = true; }, 700); },
        layout: function () { dirty = true; setTimeout(function () { dirty = true; }, 700); },
        parts: function () { return []; },
        destroy: function () { clearInterval(timer); if (ro) ro.disconnect(); profiles.splice(profiles.indexOf(v), 1); root.remove(); }
      };
      profiles.push(v);
      return v;
    }

    // ===== Columns: flight data, recap =====
    function teleColumn(el) {
      var root = GFX.el('div', 'a3-tele', el), cells = [];
      [['Altitude', ''], ['Vitesse sol', ''], ['Vitesse verticale', ''], ['Cap', ''], ['Distance', 'de Toulouse-Blagnac'], ['Mach', '']].forEach(function (c) {
        var tm = GFX.el('div', 'tm', root);
        cells.push({ k: GFX.el('div', 'k', tm, c[0]), v: GFX.el('div', 'v', tm, '–'), s: GFX.el('div', 's', tm, c[1] || '–'), key: '' });
      });
      var v = {
        draw: function (list) {
          list.forEach(function (c, i) {
            var cell = cells[i], key = c[0] + '|' + c[1];
            if (cell.key !== key) { cell.key = key; cell.v.innerHTML = esc(c[0]) + (c[1] ? '<small>' + esc(c[1]) + '</small>' : ''); }
            GFX.text(cell.s, c[2]);
          });
          if (list.k6) GFX.text(cells[5].k, list.k6);
        },
        parts: function () { return []; },
        destroy: function () { teles.splice(teles.indexOf(v), 1); root.remove(); }
      };
      teles.push(v);
      return v;
    }
    function recapColumn(el) {
      var root = GFX.el('div', 'a3-recap', el), html = '';
      var v = {
        draw: function (h) { if (h !== html) { html = h; root.innerHTML = h; } },
        parts: function () { return []; },
        destroy: function () { recaps.splice(recaps.indexOf(v), 1); root.remove(); }
      };
      recaps.push(v);
      return v;
    }

    // ===== Frames: figures and maps =====
    var lastFrame = 0, raf = 0;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.25, (ts - (lastFrame || ts)) / 1000);
      lastFrame = ts;
      var pl = planeNow();
      tickFigures(ts, dt, pl);
      if (trackDirty) rebuildTrack();
      shown = pl;
      maps.forEach(function (v) { try { v.frame(ts, dt, pl); } catch (e) { console.error(e); } });
    }
    raf = requestAnimationFrame(frame);
    updateText();

    /* Settings that the running state can't absorb (another aircraft, day,
       demo, relay, basemap) reload the page, 2 s after the last change so
       typing in the panel doesn't reload it at each key */
    var reloadT = 0;
    return {
      visual: function (name, el, host) {
        if (name === 'map') return mapVisual(el, host);
        if (name === 'profile') return profileVisual(el, host);
        return null;
      },
      column: function (name, el) {
        if (name === 'telemetry') return teleColumn(el);
        if (name === 'recap') return recapColumn(el);
        return null;
      },
      onSettings: function () {
        var s = api.settings();
        if (identity(s) !== idKey) { clearTimeout(reloadT); reloadT = setTimeout(function () { location.reload(); }, 2000); return; }
        if (api.tz() !== TZ || [s.t0, s.land, s.dur, s.takeoff, s.units].join('|') !== timesKey) { configure(); profVersion++; }
        S = s;
        POLL_MS = Math.max(1000, (+s.poll || 2) * 1000);
      },
      destroy: function () {
        cancelAnimationFrame(raf); clearInterval(textT); clearInterval(wxT); clearInterval(demoT); clearInterval(histT); clearTimeout(pollT);
      }
    };
  });
})();
