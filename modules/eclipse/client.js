/* Module "eclipse", output side: the eclipse overlay's computation and
   drawing (eclipse-widget-broadcast.html), as variables and two visuals for
   the bandeau.

   Variables: the headline and timer for the band, the obscuration and the
   Sun's position for the strap, the contact times for the ticker, the
   progress line, and the Companion strings the old overlay pushed
   (eclipse_status, eclipse_pct…, same names).
   Visuals:
     sky   in the lower third's square, the Sun with the Moon's bite; on the
           canvas, the sky map — trajectories, horizon, contact markers, the
           two discs oversized on their paths, framed by a camera clear of
           the blocks; in the corner card, the same map scaled down
     real  the two bodies at their real apparent size, the camera zooming to
           keep both in frame (corner card, or the canvas once swapped) */
(function () {
  'use strict';
  var seq = 0;
  GFX.client('eclipse', function (api) {
    var U = api.U, A = window.Astronomy;
    if (!A) throw new Error('astronomy.browser.min.js introuvable');
    var KM_PER_AU = 1.4959787069098932e8, SUN_KM = 695700, MOON_KM = 1737.4;
    var loadAt = Date.now();
    var set, TZ, observer, DEMO, DEMO_SPEED, key = '';
    var tC1, tPeak, tC4, tSunset, peakObsc, tz0, tz1;
    var views = [];

    // --- Local circumstances, once per settings ---
    function configure() {
      set = api.settings(); TZ = api.tz();
      key = JSON.stringify(set) + TZ;
      observer = new A.Observer(+set.lat || 0, +set.lon || 0, +set.alt || 0);
      DEMO = !!set.demo; DEMO_SPEED = +set.speed || 120;
      try {
        var from = /^\d{4}-\d\d-\d\d$/.test(set.search) ? set.search : '2026-08-01';
        var ecl = A.SearchLocalSolarEclipse(A.MakeTime(new Date(from + 'T00:00:00Z')), observer);
        tC1 = ecl.partial_begin.time.date.getTime();
        tPeak = ecl.peak.time.date.getTime();
        tC4 = ecl.partial_end.time.date.getTime();
        peakObsc = ecl.obscuration;
        var d = U.dayOf(tPeak, TZ).split('-');
        tSunset = A.SearchRiseSet(A.Body.Sun, observer, -1, A.MakeTime(new Date(U.zoned(+d[0], +d[1], +d[2], 12, 0, 0, TZ))), 1).date.getTime();
      } catch (e) {
        // Fallback: precomputed values (UTC) for Thonac, 12 August 2026
        tC1 = Date.parse('2026-08-12T17:28:46Z');
        tPeak = Date.parse('2026-08-12T18:23:44Z');
        tC4 = Date.parse('2026-08-12T19:15:33Z');
        tSunset = Date.parse('2026-08-12T19:06:48Z');
        peakObsc = 0.964;
      }
      tz0 = tC1 - 75 * 60000; tz1 = tC4 + 25 * 60000;
      chart.mode = ''; chart.version++;
      statics();
    }
    function now() {
      if (!DEMO) return Date.now();
      var anchor = api.state().demoAnchor || loadAt;
      return (tC1 - 3 * 60000) + (Date.now() - anchor) * DEMO_SPEED;
    }

    // --- Astronomy ---
    function sunMoon(tms) {
      var t = A.MakeTime(new Date(tms));
      var sEq = A.Equator(A.Body.Sun, t, observer, true, true);
      var mEq = A.Equator(A.Body.Moon, t, observer, true, true);
      var sHz = A.Horizon(t, observer, sEq.ra, sEq.dec, 'normal');
      var mHz = A.Horizon(t, observer, mEq.ra, mEq.dec, 'normal');
      var sepRad = A.AngleBetween(sEq.vec, mEq.vec) * Math.PI / 180;
      var rSun = Math.asin(SUN_KM / (sEq.dist * KM_PER_AU));
      var rMoon = Math.asin(MOON_KM / (mEq.dist * KM_PER_AU));
      return { sHz: sHz, mHz: mHz, sep: sepRad, rSun: rSun, rMoon: rMoon };
    }
    function obscuration(g) {
      var d = g.sep, a = g.rSun, b = g.rMoon;
      if (d >= a + b) return 0;
      if (d <= Math.abs(a - b)) return b >= a ? 1 : (b * b) / (a * a);
      var x = (d * d + a * a - b * b) / (2 * d);
      var y = Math.sqrt(Math.max(0, a * a - x * x));
      var area = a * a * Math.acos(Math.min(1, Math.max(-1, x / a)))
               + b * b * Math.acos(Math.min(1, Math.max(-1, (d - x) / b)))
               - d * y;
      return Math.min(1, Math.max(0, area / (Math.PI * a * a)));
    }

    // --- Formatting ---
    function fmtT(ms) { return U.hms(ms, TZ); }
    function fmtTS(ms) { return U.hm(ms, TZ); }
    function fmtPct(frac) { return (frac * 100).toFixed(1).replace('.', ',') + ' %'; }
    function norm360(a) { return ((a % 360) + 360) % 360; }
    function compass(az) {
      var dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
      return dirs[Math.round(az / 22.5) % 16];
    }
    function frac(t) { return (t - tC1) / (tC4 - tC1); }

    /* What doesn't move during the show: the contact times, the ticker, the
       progress line's marks (the server re-sends them to Companion every
       minute, so a Companion restarted mid-show catches up) */
    function statics() {
      var during = tSunset > tC1 && tSunset < tC4;
      api.setAll({
        site: set.site || '',
        pct_max: fmtPct(peakObsc),
        t_c1: fmtTS(tC1), t_max: fmtTS(tPeak), t_sunset: fmtTS(tSunset), t_c4: fmtTS(tC4),
        t_c1s: fmtT(tC1), t_maxs: fmtT(tPeak),
        ticker: [[['Premier contact', fmtT(tC1), ''],
                  ['Maximum', fmtT(tPeak), (peakObsc * 100).toFixed(1).replace('.', ',') + '% obscurci'],
                  ['Coucher', fmtTS(tSunset), during ? 'se couche éclipsé' : ''],
                  ['Fin', fmtTS(tC4), tC4 > tSunset ? 'sous l\'horizon' : '']]],
        marks: [frac(tPeak), frac(tSunset)]
      });
    }

    // ===== The sky samples, shared by every visual =====
    /* Two charts, switched automatically:
        · "wide" — before the eclipse evening: the whole current day's sky,
          with the eclipse segment highlighted; both discs ride their own
          live positions (you can watch the Moon close in on the Sun for days).
        · "zoom" — from 75 min before first contact: the eclipse evening only;
          the Moon disc is placed at its true angular offset from the Sun at
          the shared oversized disc scale, so it exactly matches the bite. */
    var chart = { mode: '', day: '', pts: null, ta: 0, tb: 0, version: 0 };
    function wideWindow(t) {
      try {
        var d = U.dayOf(t, TZ).split('-');
        var midnight = U.zoned(+d[0], +d[1], +d[2], 0, 0, 0, TZ);
        var rise = A.SearchRiseSet(A.Body.Sun, observer, +1, A.MakeTime(new Date(midnight)), 1).date.getTime();
        var sset = A.SearchRiseSet(A.Body.Sun, observer, -1, A.MakeTime(new Date(midnight + 43200000)), 1).date.getTime();
        return [rise - 40 * 60000, sset + 40 * 60000];
      } catch (e) { return [t - 9 * 3600000, t + 9 * 3600000]; }
    }
    function ensureChart(t) {
      var m = (t < tz0 || t > tz1 + 5400000) ? 'wide' : 'zoom';
      var day = m === 'wide' ? U.dayOf(t, TZ) : '';
      if (m === chart.mode && day === chart.day && chart.pts) return;
      var ta, tb;
      if (m === 'zoom') { ta = tz0; tb = tz1; } else { var ww = wideWindow(t); ta = ww[0]; tb = ww[1]; }
      var step = Math.max(240000, Math.round((tb - ta) / 110));
      var pts = [];
      for (var ts = ta; ts < tb; ts += step) pts.push(sunMoon(ts));
      pts.push(sunMoon(tb));
      chart.mode = m; chart.day = day; chart.pts = pts; chart.ta = ta; chart.tb = tb; chart.version++;
    }

    /* The free part of the canvas, in screen pixels: what the bandeau's
       blocks leave (right of the corner card, left of the red column, above
       the ticker, below the caption). whole: the view is itself the corner
       card, where nothing overlays it. */
    var PAD = 26, LEG_BOT = 134, W = 1920, H = 1080;
    function freeBox(mount, host, whole) {
      var mr = mount.getBoundingClientRect(), k = (mr.width || W) / W;
      if (whole) return { l: mr.left + PAD * k, r: mr.right - PAD * k, t: mr.top + PAD * k, b: mr.bottom - PAD * k, k: k, mr: mr };
      var ob = host.obstacles ? host.obstacles() : {};
      return {
        l: (ob.card ? ob.card.right : mr.left) + PAD * k,
        r: (ob.col ? ob.col.left : mr.right) - PAD * k,
        t: mr.top + (LEG_BOT + PAD) * k,
        b: (ob.bottom ? ob.bottom.top : mr.bottom) - PAD * k,
        k: k, mr: mr
      };
    }
    function svgNode(html) {
      var t = document.createElement('div');
      t.innerHTML = html.trim();
      return t.firstChild;
    }

    // ===== Visual: the sky =====
    function skyVisual(el, host) {
      var id = 'e' + (++seq);
      var root = GFX.el('div', 'ecl-sky', el);
      var inner = GFX.el('div', 'ecl-inner', root);
      var svg = svgNode('<svg class="ecl-chart" viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true"></svg>');
      inner.appendChild(svg);
      var wrap = GFX.el('div', 'ecl-skywrap', inner);
      var corona = GFX.el('div', 'ecl-corona', wrap);
      wrap.appendChild(svgNode(
        '<svg viewBox="-75 -75 150 150" width="100%" height="100%"><defs>' +
        '<radialGradient id="sunGrad' + id + '"><stop offset="0%" stop-color="#ffdf6b"/><stop offset="70%" stop-color="#ffb62e"/><stop offset="100%" stop-color="#f59300"/></radialGradient>' +
        '<mask id="bite' + id + '"><rect x="-75" y="-75" width="150" height="150" fill="white"/><circle class="ecl-moon" cx="-999" cy="0" r="40" fill="black"/></mask></defs>' +
        '<circle class="ecl-sun" cx="0" cy="0" r="62" fill="url(#sunGrad' + id + ')" mask="url(#bite' + id + ')"/></svg>'));
      var moonWrap = GFX.el('div', 'ecl-moonwrap', inner);
      moonWrap.appendChild(svgNode(
        '<svg viewBox="-75 -75 150 150" width="100%" height="100%"><defs><radialGradient id="moonGrad' + id + '">' +
        '<stop offset="0%" stop-color="#242e58"/><stop offset="78%" stop-color="#1b2349"/><stop offset="100%" stop-color="#161c3e"/></radialGradient></defs>' +
        '<circle class="ecl-moondisc" cx="0" cy="0" r="63.9" fill="url(#moonGrad' + id + ')" stroke="rgba(255,255,255,0.4)" stroke-width="1.2"/></svg>'));
      var head = GFX.el('div', 'bd-cardhead', root);
      GFX.el('b', '', head, 'Trajectoire');
      var headSub = GFX.el('span', '', head, '–');
      wrap.style.viewTransitionName = host.vt('sun');
      moonWrap.style.viewTransitionName = host.vt('moon');
      var elSun = wrap.querySelector('.ecl-sun'), elMoon = wrap.querySelector('.ecl-moon'), moonDisc = moonWrap.querySelector('.ecl-moondisc');
      var SUN_PX = 62;
      var ZOOM_VW = 16, WIDE_VW = 5, BOX = 150; // disc sizes: must match the CSS
      var EXT_X = 1400, EXT_Y = 900;            // the sky is drawn far past the frame
      var L = 90, R = 90, T = 230, YB = 950;
      var place = el.dataset.place || 'panel', built = -1, mode = '', x = null, y = null, panX = 0, panY = 0, first = true;
      var last = null;

      function setPan(px, py) {
        panX = px; panY = py;
        var gp = svg.querySelector('.ecl-pan'), ga = svg.querySelector('.ecl-alt');
        if (gp) gp.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px)';
        if (ga) ga.style.transform = 'translate(0px,' + py.toFixed(1) + 'px)';
      }
      /* Azimuth → x, altitude → y (the sky, facing the Sun). L/R/T/YB only
         set the scale: where the drawing lands on screen is the camera's job */
      function buildChart(t) {
        var m = chart.mode, pts = chart.pts;
        var azLo = Infinity, azHi = -Infinity, altLo = Infinity, altHi = -Infinity;
        pts.forEach(function (p) {
          azLo = Math.min(azLo, p.sHz.azimuth, p.mHz.azimuth);
          azHi = Math.max(azHi, p.sHz.azimuth, p.mHz.azimuth);
          altLo = Math.min(altLo, p.sHz.altitude, p.mHz.altitude);
          altHi = Math.max(altHi, p.sHz.altitude, p.mHz.altitude);
        });
        azLo -= 1.5; azHi += 1.5;
        altHi += 3; altLo = Math.min(Math.max(altLo - 2, -12), -3);
        x = function (az) { return L + (az - azLo) / (azHi - azLo) * (W - L - R); };
        y = function (al) { return T + (altHi - al) / (altHi - altLo) * (YB - T); };
        var azAt = function (px) { return azLo + (px - L) / (W - L - R) * (azHi - azLo); };
        var yH = y(0), xA = -EXT_X, xB = W + EXT_X;
        // three layers: s pans with the sky, sAlt only vertically, sFix never
        var s = [], sAlt = [], sFix = [];
        for (var a = 10; a <= Math.min(88, altHi + 40); a += 10) {
          s.push('<line x1="' + xA + '" y1="' + y(a).toFixed(1) + '" x2="' + xB + '" y2="' + y(a).toFixed(1) +
                 '" stroke="rgba(255,255,255,0.16)" stroke-width="1" stroke-dasharray="3 7"/>');
          sAlt.push('<text x="' + (L - 12) + '" y="' + (y(a) + 5).toFixed(1) +
                 '" text-anchor="end" font-size="16" fill="rgba(255,255,255,0.55)">' + a + '°</text>');
        }
        function polyPts(list, body) {
          return list.map(function (p) { return x(p[body].azimuth).toFixed(1) + ',' + y(p[body].altitude).toFixed(1); }).join(' ');
        }
        s.push('<polyline points="' + polyPts(pts, 'sHz') + '" fill="none" stroke="#ffd257" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>');
        s.push('<polyline points="' + polyPts(pts, 'mHz') + '" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="3.5" stroke-dasharray="12 10" stroke-linecap="round"/>');
        // the eclipse zone belongs to the eclipse day only
        var eclToday = U.dayOf(t, TZ) === U.dayOf(tPeak, TZ);
        if (m === 'wide' && eclToday) {
          var zone = [];
          for (var tsz = tC1; tsz < tC4; tsz += 300000) zone.push(sunMoon(tsz));
          zone.push(sunMoon(tC4));
          s.push('<polyline points="' + polyPts(zone, 'sHz') + '" fill="none" style="stroke:var(--c-accent)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>');
        }
        s.push('<rect x="' + xA + '" y="' + yH.toFixed(1) + '" width="' + (xB - xA) + '" height="' + (H + 2 * EXT_Y) + '" fill="rgba(0,0,0,0.35)"/>');
        s.push('<line x1="' + xA + '" y1="' + yH.toFixed(1) + '" x2="' + xB + '" y2="' + yH.toFixed(1) + '" stroke="#fff" stroke-width="3"/>');
        var markers = [
          { t: tC1, lbl: 'DÉBUT', above: true, lift: 0 },
          { t: tPeak, lbl: 'MAXIMUM', above: true, lift: 0 },
          { t: tSunset, lbl: 'COUCHER', above: true, lift: 16 },
          { t: tC4, lbl: 'FIN', above: false, lift: 0 }
        ];
        markers.forEach(function (mk) { var gk = sunMoon(mk.t); mk.x = x(gk.sHz.azimuth); mk.y = y(gk.sHz.altitude); });
        var azStep = (azHi - azLo) > 80 ? 15 : 5;
        var azA = Math.max(azAt(xA), -90), azB = Math.min(azAt(xB), 450);
        for (var az = Math.ceil(azA / azStep) * azStep; az <= azB; az += azStep) {
          s.push('<line x1="' + x(az).toFixed(1) + '" y1="' + yH.toFixed(1) + '" x2="' + x(az).toFixed(1) + '" y2="' + (yH + 10).toFixed(1) +
                 '" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/>');
          s.push('<text x="' + x(az).toFixed(1) + '" y="' + (yH + 32).toFixed(1) + '" text-anchor="middle" font-size="15" fill="rgba(255,255,255,0.55)">' +
                 norm360(az) + '°</text>');
        }
        for (var c = Math.ceil(azA / 22.5); c * 22.5 <= azB; c++) {
          var cx = x(c * 22.5);
          if (m === 'zoom' && markers.some(function (mk) { return !mk.above && Math.abs(mk.x - cx) < 110; })) continue;
          s.push('<text x="' + cx.toFixed(1) + '" y="' + (yH + 68).toFixed(1) + '" text-anchor="middle" font-size="24" font-weight="900" fill="rgba(255,255,255,0.85)">' +
                 compass(norm360(c * 22.5)) + '</text>');
        }
        // caption + legend, top-left: a halo keeps it readable over the sky
        var capDay = U.dayMonth(m === 'zoom' ? tPeak : t, TZ).toUpperCase();
        GFX.text(headSub, capDay);
        var halo = ' style="stroke:var(--c-base)" stroke-width="4" stroke-linejoin="round" paint-order="stroke"';
        sFix.push('<text x="' + L + '" y="84" font-size="18" font-weight="900" letter-spacing="1" fill="rgba(255,255,255,0.9)"' + halo +
                  '>TRAJECTOIRE DANS LE CIEL · ' + capDay + '</text>');
        sFix.push('<line x1="' + L + '" y1="' + (LEG_BOT - 16) + '" x2="' + (L + 40) + '" y2="' + (LEG_BOT - 16) + '" stroke="#ffd257" stroke-width="6" stroke-linecap="round"/>');
        sFix.push('<text x="' + (L + 52) + '" y="' + (LEG_BOT - 10) + '" font-size="16" font-weight="700" fill="#fff"' + halo + '>SOLEIL</text>');
        sFix.push('<line x1="' + (L + 148) + '" y1="' + (LEG_BOT - 16) + '" x2="' + (L + 188) + '" y2="' + (LEG_BOT - 16) +
                  '" stroke="rgba(255,255,255,0.8)" stroke-width="3.5" stroke-dasharray="9 8"/>');
        sFix.push('<text x="' + (L + 200) + '" y="' + (LEG_BOT - 10) + '" font-size="16" font-weight="700" fill="#fff"' + halo + '>LUNE</text>');
        if (m === 'zoom') {
          markers.forEach(function (mk) {
            s.push('<circle cx="' + mk.x.toFixed(1) + '" cy="' + mk.y.toFixed(1) + '" r="8" fill="#fff" stroke="rgba(0,0,0,0.35)" stroke-width="2"/>');
            var nameY = mk.above ? mk.y - 44 - mk.lift : mk.y + 30;
            var timeY = mk.above ? mk.y - 22 - mk.lift : mk.y + 52;
            s.push('<text x="' + mk.x.toFixed(1) + '" y="' + nameY.toFixed(1) + '" text-anchor="middle" font-size="20" font-weight="900" fill="#fff">' + mk.lbl + '</text>');
            s.push('<text x="' + mk.x.toFixed(1) + '" y="' + timeY.toFixed(1) + '" text-anchor="middle" font-size="18" fill="rgba(255,255,255,0.8)">' + fmtTS(mk.t) + '</text>');
          });
        } else if (eclToday) {
          markers.forEach(function (mk) {
            s.push('<circle cx="' + mk.x.toFixed(1) + '" cy="' + mk.y.toFixed(1) + '" r="5" fill="#fff" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>');
          });
          var gz = sunMoon((tC1 + tC4) / 2), zx = x(gz.sHz.azimuth), zy = y(gz.sHz.altitude);
          s.push('<text x="' + zx.toFixed(1) + '" y="' + (zy - 56).toFixed(1) + '" text-anchor="middle" font-size="20" font-weight="900" fill="#fff">ÉCLIPSE</text>');
          s.push('<text x="' + zx.toFixed(1) + '" y="' + (zy - 34).toFixed(1) + '" text-anchor="middle" font-size="17" fill="rgba(255,255,255,0.8)">' +
                 fmtTS(tC1) + ' – ' + fmtTS(tC4) + '</text>');
        }
        return '<g class="ecl-pan">' + s.join('') + '</g><g class="ecl-alt">' + sAlt.join('') + '</g><g class="ecl-fix">' + sFix.join('') + '</g>';
      }
      function rebuild(t) {
        var html;
        try { html = buildChart(t); } catch (e) { console.error(e); return; }
        mode = chart.mode; built = chart.version;
        root.classList.toggle('wide', mode === 'wide');
        // the fresh layers start where the camera already is
        if (first) { svg.innerHTML = html; setPan(panX, panY); first = false; return; }
        // dip-to-rebuild: a quick fade while the discs glide to the new scale
        svg.style.transition = 'opacity 0.3s ease';
        svg.style.opacity = 0;
        setTimeout(function () { svg.innerHTML = html; setPan(panX, panY); svg.style.opacity = 1; }, 320);
      }
      function cardScale() {
        if (place !== 'card') { inner.style.transform = ''; return; }
        var w = el.clientWidth || root.clientWidth;
        inner.style.transform = 'scale(' + (w / (window.innerWidth || W)).toFixed(4) + ')';
      }
      function update(t, g, ob) {
        last = [t, g, ob];
        // the bite: the Moon's offset from the Sun as seen in the sky, a black
        // circle in a mask — only the bite ever shows, never a dark blob
        var degPerRad = 180 / Math.PI, pxPerDeg = SUN_PX / (g.rSun * degPerRad);
        var dAz = g.mHz.azimuth - g.sHz.azimuth;
        if (dAz > 180) dAz -= 360; if (dAz < -180) dAz += 360;
        var dx = dAz * Math.cos(g.sHz.altitude * Math.PI / 180) * pxPerDeg;
        var dy = -(g.mHz.altitude - g.sHz.altitude) * pxPerDeg;
        elMoon.setAttribute('cx', dx.toFixed(2));
        elMoon.setAttribute('cy', dy.toFixed(2));
        elMoon.setAttribute('r', ((g.rMoon / g.rSun) * SUN_PX).toFixed(2));
        corona.style.opacity = ob > 0.85 ? ((ob - 0.85) / 0.15).toFixed(2) : 0;
        var alt = g.sHz.altitude;
        elSun.style.opacity = alt < 0 ? Math.max(0, 1 + alt / 1.2).toFixed(2) : 1;
        if (place !== 'canvas' && place !== 'card') return;
        if (built !== chart.version) rebuild(t);
        if (!x) return;
        var m = chart.mode;
        var sx = x(g.sHz.azimuth), sy = y(g.sHz.altitude), mx = sx, my = sy;
        moonDisc.setAttribute('r', ((g.rMoon / g.rSun) * SUN_PX).toFixed(2));
        var aspect = (window.innerWidth || W) / (window.innerHeight || H);
        if (m === 'zoom') {
          // true angular offset at the shared oversized disc scale — the same
          // math as the bite mask, so the disc always sits over the bite
          mx = sx + dx / BOX * ZOOM_VW * W / 100;
          my = sy + dy / BOX * ZOOM_VW * aspect * H / 100;
        } else {
          // own live position; the discs are oversized, so while the bodies
          // are far apart keep them from overlapping: "just touching" along
          // the true bearing
          var ddx = x(g.mHz.azimuth) - sx, ddy = y(g.mHz.altitude) - sy;
          var d = Math.sqrt(ddx * ddx + ddy * ddy);
          var minD = WIDE_VW / 100 * W * (SUN_PX / BOX) * (1 + g.rMoon / g.rSun) + 4;
          if (d > 0 && d < minD) { ddx *= minD / d; ddy *= minD / d; }
          mx = sx + ddx; my = sy + ddy;
        }
        // Camera: pan the sky so the pair sits in the middle of the free area.
        // Vertically only as far as the sky allows — the horizon, its ticks and
        // compass points stay above the ticker, and the camera never dives
        // below the horizon nor lifts the pair into the caption.
        var fb = freeBox(place === 'card' ? root : el, host, place === 'card');
        var toU = function (px, o) { return (px - o) / fb.k; };
        var c = place === 'card'
          ? { l: PAD, r: W - PAD, t: PAD, b: H - PAD }
          : { l: toU(fb.l, fb.mr.left), r: toU(fb.r, fb.mr.left), t: toU(fb.t, fb.mr.top), b: toU(fb.b, fb.mr.top) };
        c.x = (c.l + c.r) / 2; c.y = (c.t + c.b) / 2; c.hor = c.b - 60;
        var yH = y(0), rDisc = (m === 'zoom' ? ZOOM_VW : WIDE_VW) / 2 / 100 * W;
        var py = Math.min(c.y - (sy + my) / 2, c.hor - yH);
        py = Math.max(py, c.y - yH, c.t + rDisc - Math.min(sy, my));
        setPan(c.x - (sx + mx) / 2, py);
        wrap.style.setProperty('--sunX', ((sx + panX) / W * 100).toFixed(2) + '%');
        wrap.style.setProperty('--sunY', ((sy + panY) / H * 100).toFixed(2) + '%');
        moonWrap.style.setProperty('--moonX', ((mx + panX) / W * 100).toFixed(2) + '%');
        moonWrap.style.setProperty('--moonY', ((my + panY) / H * 100).toFixed(2) + '%');
        var malt = g.mHz.altitude;
        moonWrap.style.opacity = malt < 0 ? Math.max(0, 1 + malt / 1.2).toFixed(2) : 1;
      }
      var v = {
        update: update,
        place: function (p) {
          place = p;
          cardScale();
          if (last) update(last[0], last[1], last[2]);
        },
        layout: function () { if (last) setTimeout(function () { update(last[0], last[1], last[2]); }, 50); },
        parts: function () {
          var p = [{ el: wrap, role: 'visual' }];
          if (place === 'canvas' || place === 'card') p.push({ el: moonWrap, role: 'visual' });
          return p;
        },
        destroy: function () { views.splice(views.indexOf(v), 1); root.remove(); }
      };
      if (window.ResizeObserver) new ResizeObserver(cardScale).observe(el);
      views.push(v);
      if (current) update(current.t, current.g, current.ob);
      return v;
    }

    // ===== Visual: true scale =====
    function realVisual(el, host) {
      var id = 'r' + (++seq);
      var root = GFX.el('div', 'ecl-real', el);
      var head = GFX.el('div', 'ecl-rvhead', root);
      GFX.el('b', '', head, 'TAILLE RÉELLE');
      var fovEl = GFX.el('span', '', head, '–');
      var svg = svgNode(
        '<svg class="ecl-rvsvg" viewBox="0 0 500 500" preserveAspectRatio="xMidYMid meet"><defs>' +
        '<radialGradient id="rvSun' + id + '"><stop offset="0%" stop-color="#ffdf6b"/><stop offset="70%" stop-color="#ffb62e"/><stop offset="100%" stop-color="#f59300"/></radialGradient>' +
        '<radialGradient id="rvGlow' + id + '"><stop offset="0%" stop-color="rgba(255,255,255,0.5)"/><stop offset="55%" stop-color="rgba(200,215,255,0.18)"/><stop offset="100%" stop-color="rgba(200,215,255,0)"/></radialGradient>' +
        '<radialGradient id="rvMoon' + id + '"><stop offset="0%" stop-color="#242e58"/><stop offset="78%" stop-color="#1b2349"/><stop offset="100%" stop-color="#161c3e"/></radialGradient></defs>' +
        '<polyline class="rv-sunpath" fill="none" stroke="rgba(255,210,87,0.6)" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<polyline class="rv-moonpath" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="8 7"/>' +
        '<circle class="rv-glow" cx="250" cy="250" r="0" fill="url(#rvGlow' + id + ')" opacity="0"/>' +
        '<circle class="rv-sun" cx="250" cy="250" r="0" fill="url(#rvSun' + id + ')"/>' +
        '<circle class="rv-moon" cx="250" cy="250" r="0" fill="url(#rvMoon' + id + ')" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>' +
        '<rect class="rv-ground" x="0" y="600" width="500" height="500" fill="#0a0f26" opacity="0.92"/>' +
        '<rect class="rv-hor" x="0" y="600" width="500" height="2.5" fill="#fff"/></svg>');
      root.appendChild(svg);
      var q = function (c) { return svg.querySelector('.' + c); };
      var rvSun = q('rv-sun'), rvMoon = q('rv-moon'), rvGlow = q('rv-glow'), rvGround = q('rv-ground'), rvHor = q('rv-hor');
      var rvSunPath = q('rv-sunpath'), rvMoonPath = q('rv-moonpath');
      var place = el.dataset.place || 'card', sliced = null, last = null, raf = 0;
      /* The trajectories go through the same camera as the discs, which
         moves; the discs glide on a CSS transition over one tick, but a
         polyline can't be transitioned — so the camera is sampled each tick
         and the tracks redrawn every frame from a camera interpolated across
         it, on the same clock as the discs' transition. */
      var from = null, to = null, at = 0, settled = false, stepMs = DEMO ? 200 : 1000;
      var nowMs = function () { return performance.now(); };
      function mix(a, b, u) {
        var d = b.azC - a.azC;
        if (d > 180) d -= 360; if (d < -180) d += 360;
        return { azC: a.azC + d * u, altC: a.altC + (b.altC - a.altC) * u, cosA: a.cosA + (b.cosA - a.cosA) * u,
                 s: a.s + (b.s - a.s) * u, cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u };
      }
      function point(c, hz) {
        var da = hz.azimuth - c.azC;
        if (da > 180) da -= 360; if (da < -180) da += 360;
        return (c.cx + da * c.cosA * c.s).toFixed(1) + ',' + (c.cy - (hz.altitude - c.altC) * c.s).toFixed(1) + ' ';
      }
      function paint() {
        raf = requestAnimationFrame(paint);
        var pts = chart.pts;
        if (!pts || !to || settled || place === 'hidden' || !host.onAir()) return;
        var u = from === to ? 1 : Math.min(1, (nowMs() - at) / stepMs);
        settled = u >= 1;
        var c = settled ? to : mix(from, to, u);
        var sp = '', mp = '';
        for (var i = 0; i < pts.length; i++) { sp += point(c, pts[i].sHz); mp += point(c, pts[i].mHz); }
        rvSunPath.setAttribute('points', sp);
        rvMoonPath.setAttribute('points', mp);
      }
      raf = requestAnimationFrame(paint);
      /* Real apparent sizes, the camera centred between the two bodies and
         zoomed to keep both in frame. In the card: a square that fits
         (meet); on the canvas: it slices, filling the width, and the pair
         moves into the free column the sky camera uses, so a swap doesn't
         jump it across the screen. */
      function update(t, g, ob) {
        last = [t, g, ob];
        if (place === 'hidden') return;
        var onCanvas = place === 'canvas';
        if (onCanvas !== sliced) { sliced = onCanvas; svg.setAttribute('preserveAspectRatio', onCanvas ? 'xMidYMid slice' : 'xMidYMid meet'); }
        var degPerRad = 180 / Math.PI;
        var rS = g.rSun * degPerRad, rM = g.rMoon * degPerRad, sep = g.sep * degPerRad;
        var dAzC = g.mHz.azimuth - g.sHz.azimuth;
        if (dAzC > 180) dAzC -= 360; if (dAzC < -180) dAzC += 360;
        var azC = g.sHz.azimuth + dAzC / 2, altC = (g.sHz.altitude + g.mHz.altitude) / 2;
        var cosA = Math.cos(altC * Math.PI / 180);
        var cx = 250, cy = 250, s = 500 / Math.max(1.7, (sep + 2 * rS) * 1.35), half = 250, rct = null, k = 1;
        if (onCanvas) {
          rct = svg.getBoundingClientRect();
          k = Math.max(rct.width, rct.height) / 500 || 1; /* px per unit */
          var fb = freeBox(el, host, false);
          var rBig = Math.max(rS, rM);
          var extX = Math.abs(dAzC * cosA) + 2 * rBig, extY = Math.abs(g.mHz.altitude - g.sHz.altitude) + 2 * rBig;
          var boxW = (fb.r - fb.l) / k, boxH = (fb.b - fb.t) / k;
          s = Math.min(boxW / Math.max(extX * 1.18, 0.9), boxH / Math.max(extY * 1.18, 0.9));
          cx = 250 + ((fb.l + fb.r) / 2 - (rct.left + rct.width / 2)) / k;
          cy = 250 + ((fb.t + fb.b) / 2 - (rct.top + rct.height / 2)) / k;
          half = rct.width / 2 / k;
        }
        var fov = half * 2 / s;
        function px(az, alt) {
          var da = az - azC;
          if (da > 180) da -= 360; if (da < -180) da += 360;
          return { x: cx + da * cosA * s, y: cy - (alt - altC) * s };
        }
        var ps = px(g.sHz.azimuth, g.sHz.altitude), pm = px(g.mHz.azimuth, g.mHz.altitude);
        from = to || null;
        to = { azC: azC, altC: altC, cosA: cosA, s: s, cx: cx, cy: cy };
        if (!from) from = to;
        at = nowMs(); settled = false;
        rvSun.setAttribute('cx', ps.x.toFixed(1)); rvSun.setAttribute('cy', ps.y.toFixed(1)); rvSun.setAttribute('r', (rS * s).toFixed(1));
        rvMoon.setAttribute('cx', pm.x.toFixed(1)); rvMoon.setAttribute('cy', pm.y.toFixed(1)); rvMoon.setAttribute('r', (rM * s).toFixed(1));
        rvGlow.setAttribute('cx', ps.x.toFixed(1)); rvGlow.setAttribute('cy', ps.y.toFixed(1)); rvGlow.setAttribute('r', (rS * s * 2.4).toFixed(1));
        rvGlow.setAttribute('opacity', ob > 0.85 ? ((ob - 0.85) / 0.15).toFixed(2) : 0);
        // the real horizon: the ground slides up and hides the discs at sunset
        var yHor = cy + altC * s;
        var yBot = cy + (onCanvas ? rct.height / 2 / k : 250);
        if (yHor > yBot + 20) yHor = yBot + 120;
        rvGround.setAttribute('y', yHor.toFixed(1));
        rvHor.setAttribute('y', (yHor - 1.25).toFixed(1));
        GFX.text(fovEl, 'CHAMP ' + fov.toFixed(1).replace('.', ',') + '°');
      }
      var v = {
        update: update,
        place: function (p) { place = p; from = null; to = null; if (last) update(last[0], last[1], last[2]); },
        layout: function () { if (last) setTimeout(function () { from = null; update(last[0], last[1], last[2]); }, 50); },
        step: function (ms) { stepMs = ms; },
        parts: function () { return []; },
        destroy: function () { cancelAnimationFrame(raf); views.splice(views.indexOf(v), 1); root.remove(); }
      };
      views.push(v);
      if (current) update(current.t, current.g, current.ob);
      return v;
    }

    // ===== The clock: once a second (5 times in the demo) =====
    var current = null;
    function updateSlow() {
      var t = now(), g = sunMoon(t), ob = obscuration(g);
      current = { t: t, g: g, ob: ob };
      api.set('obscuration', (ob * 100).toFixed(1));
      api.set('pct', fmtPct(ob));
      api.set('obsc', (ob * 100).toFixed(1).replace('.', ',') + '%');
      var alt = g.sHz.altitude, az = g.sHz.azimuth;
      api.set('sunpos', alt > -1.2 ? 'SOLEIL  ALT ' + alt.toFixed(1).replace('.', ',') + '° · AZ ' + az.toFixed(0) + '° ' + compass(az)
                                    : 'SOLEIL SOUS L\'HORIZON');
      api.set('sun', alt > -1.2 ? alt.toFixed(1).replace('.', ',') + '° au-dessus de l\'horizon (' + compass(az) + ')' : 'sous l\'horizon');
      ensureChart(t);
      views.forEach(function (v) { try { v.update(t, g, ob); } catch (e) { console.error(e); } });
    }
    function updateFast() {
      var t = now();
      api.set('clock', fmtT(t) + (DEMO ? '  [DEMO ×' + DEMO_SPEED + ']' : ''));
      var sunsetFirst = tSunset > tPeak && tSunset < tC4;
      var headline, label, target, phase, status, next;
      if (t < tC1) {
        headline = status = 'L\'éclipse commence bientôt'; phase = 'attente';
        label = 'Premier contact dans'; target = tC1; next = 'premier contact dans';
      } else if (t < tPeak) {
        headline = status = 'Éclipse en cours'; phase = 'en_cours';
        label = 'Maximum (' + (peakObsc * 100).toFixed(1).replace('.', ',') + '%) dans'; target = tPeak; next = 'maximum dans';
      } else if (t < (sunsetFirst ? tSunset : tC4)) {
        headline = status = 'Maximum passé'; phase = 'max_passe';
        if (sunsetFirst) { label = 'Coucher du Soleil dans'; next = 'coucher du Soleil dans'; target = tSunset; }
        else { label = 'Fin de l\'éclipse dans'; next = 'fin de l\'éclipse dans'; target = tC4; }
      } else if (t < tC4) {
        headline = 'Soleil couché · éclipse encore en cours'; status = 'Soleil couché, éclipse encore en cours'; phase = 'sous_horizon';
        label = 'Fin de l\'éclipse (sous l\'horizon) dans'; target = tC4; next = 'fin de l\'éclipse (sous l\'horizon) dans';
      } else {
        headline = status = 'L\'éclipse est terminée'; phase = 'terminee';
        label = 'Merci d\'avoir suivi'; target = null; next = '';
      }
      api.setAll({
        headline: headline, status: status, timer_label: label, phase: phase, next: next,
        countdown: target ? U.clock(target - t) : '--:--:--',
        eta: target ? U.coarse(target - t) : '',
        progress: Math.min(1, Math.max(0, frac(t)))
      });
    }

    configure();
    var slowT = 0, fastT = setInterval(updateFast, 200);
    function restartSlow() {
      clearInterval(slowT);
      var ms = DEMO ? 200 : 1000;
      /* the true-scale view glides over exactly one tick */
      document.documentElement.style.setProperty('--rvstep', (ms / 1000) + 's');
      views.forEach(function (v) { if (v.step) v.step(ms); });
      slowT = setInterval(updateSlow, ms);
    }
    restartSlow();
    updateSlow(); updateFast();

    return {
      visual: function (name, el, host) {
        if (name === 'sky') return skyVisual(el, host);
        if (name === 'real') return realVisual(el, host);
        return null;
      },
      onSettings: function () {
        var s = api.settings();
        if (JSON.stringify(s) + api.tz() === key) return;
        configure(); restartSlow(); updateSlow(); updateFast();
      },
      destroy: function () { clearInterval(slowT); clearInterval(fastT); }
    };
  });
})();
