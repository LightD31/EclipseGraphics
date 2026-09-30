/* Module "meteo", output side: the drawings. The data comes from the
   server (its variables, _data for the figures); here: the icons, and the
   bandeau's visual "now" —
     panel   the lower third's square: the icon, the temperature
     card    the fullscreen's corner card: now, and the next three days
     canvas  the whole screen: the place, now in big, details, three days
   window.GFXMeteo.icon(kind) is shared with the "Météo" graphic. */
(function () {
  'use strict';
  var el = GFX.el, txt = GFX.text;

  // ===== Icons (64×64), drawn: no image to load, crisp at any size =====
  function rays(cx, cy, r1, r2, n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      var a = i * Math.PI * 2 / n, c = Math.cos(a), d = Math.sin(a);
      s += '<line x1="' + (cx + c * r1).toFixed(1) + '" y1="' + (cy + d * r1).toFixed(1) + '" x2="' + (cx + c * r2).toFixed(1) + '" y2="' + (cy + d * r2).toFixed(1) + '"/>';
    }
    return s;
  }
  var SUN = '<g class="mi-sun"><circle cx="32" cy="32" r="11"/><g class="mi-rays">' + rays(32, 32, 16.5, 23, 8) + '</g></g>';
  var MOON = '<path class="mi-moon" d="M37 11a21 21 0 1 0 16 33A17 17 0 0 1 37 11z"/>';
  var CLOUD = '<path class="mi-cloud" d="M18 50h29a10 10 0 0 0 1-20A15 15 0 0 0 20 26a12 12 0 0 0-2 24z"/>';
  function at(x, y, s, g) { return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' + g + '</g>'; }
  var PARTS = {
    sun: SUN,
    moon: MOON,
    cloud: CLOUD,
    partly: at(-4, -5, 0.78, SUN) + at(8, 8, 0.82, CLOUD),
    partlyNight: at(-2, -6, 0.72, MOON) + at(8, 8, 0.82, CLOUD),
    fog: '<g class="mi-fog"><line x1="12" y1="24" x2="46" y2="24"/><line x1="18" y1="33" x2="54" y2="33"/><line x1="10" y1="42" x2="44" y2="42"/><line x1="20" y1="51" x2="52" y2="51"/></g>',
    drizzle: at(0, -7, 1, CLOUD) + '<g class="mi-dot"><circle cx="24" cy="52" r="2.4"/><circle cx="33" cy="56" r="2.4"/><circle cx="42" cy="52" r="2.4"/></g>',
    rain: at(0, -8, 1, CLOUD) + '<g class="mi-drop"><line x1="24" y1="48" x2="21" y2="57"/><line x1="33" y1="48" x2="30" y2="57"/><line x1="42" y1="48" x2="39" y2="57"/></g>',
    showers: at(-3, -7, 0.62, SUN) + at(6, -2, 0.86, CLOUD) + '<g class="mi-drop"><line x1="29" y1="50" x2="26" y2="58"/><line x1="39" y1="50" x2="36" y2="58"/></g>',
    snow: at(0, -8, 1, CLOUD) + '<g class="mi-snow"><circle cx="23" cy="51" r="2.8"/><circle cx="33" cy="56" r="2.8"/><circle cx="43" cy="51" r="2.8"/><circle cx="28" cy="60" r="2"/><circle cx="38" cy="61" r="2"/></g>',
    storm: at(0, -8, 1, CLOUD.replace('mi-cloud', 'mi-cloud dark')) + '<path class="mi-bolt" d="M33 40l-9 13h7l-4 10 12-15h-7l5-8z"/>'
  };
  function icon(kind) {
    return '<svg class="mi" viewBox="0 0 64 64" aria-hidden="true">' + (PARTS[kind] || PARTS.cloud) + '</svg>';
  }
  function iconInto(box, kind) {
    if (box.__icon === kind) return;
    box.__icon = kind;
    box.innerHTML = icon(kind || 'cloud');
  }
  function deg(x) { return x == null || isNaN(x) ? '—' : Math.round(x) + '°'; }
  window.GFXMeteo = { icon: icon, iconInto: iconInto, deg: deg };

  GFX.client('meteo', function (api) {
    function data() { var d = api.get('meteo._data'); return d && typeof d === 'object' ? d : null; }

    /* The bandeau's visual: one drawing, three placements */
    function nowVisual(root, host) {
      var box = el('div', 'mt-vis', root);
      var head = el('div', 'mt-head', box), place = el('span', 'mt-place head', head), upd = el('span', 'mt-upd', head);
      var main = el('div', 'mt-main', box);
      var ico = el('div', 'mt-icon', main);
      var fig = el('div', 'mt-fig', main), temp = el('div', 'mt-temp num', fig), sky = el('div', 'mt-sky', fig);
      var det = el('div', 'mt-det', box);
      var cells = ['feels', 'wind', 'gust', 'hum'].map(function (k) {
        var c = el('div', 'mt-cell', det);
        return { k: k, lbl: el('span', 'mt-k', c, { feels: 'Ressenti', wind: 'Vent', gust: 'Rafales', hum: 'Humidité' }[k]), val: el('span', 'mt-v num', c) };
      });
      var days = el('div', 'mt-days', box);
      var dayEls = [1, 2, 3].map(function () {
        var d = el('div', 'mt-day', days);
        return { root: d, name: el('span', 'mt-dn', d), ico: el('div', 'mt-di', d), mm: el('span', 'mt-dmm num', d), pp: el('span', 'mt-dpp', d) };
      });
      var credit = el('div', 'mt-credit', box, 'Météo : Open-Meteo.com');
      var empty = el('div', 'mt-empty', box, 'Météo en attente');
      var last = -1;
      function draw() {
        var d = data();
        empty.hidden = !!d;
        main.hidden = det.hidden = days.hidden = head.hidden = !d;
        if (!d || d.updated === last) return;
        last = d.updated;
        var n = d.now || {};
        txt(place, d.place || '');
        txt(upd, 'mis à jour à ' + api.U.hm(d.updated, api.tz()));
        iconInto(ico, n.icon);
        txt(temp, deg(n.temp));
        txt(sky, n.text || '');
        cells.forEach(function (c) {
          var v = c.k === 'feels' ? deg(n.feels) : c.k === 'hum' ? (n.hum == null ? '—' : Math.round(n.hum) + ' %')
            : c.k === 'wind' ? (n.wind == null ? '—' : Math.round(n.wind) + ' ' + d.wu + (n.dir ? ' ' + n.dir : ''))
            : (n.gust == null ? '—' : Math.round(n.gust) + ' ' + d.wu);
          txt(c.val, v);
        });
        dayEls.forEach(function (e, i) {
          var x = (d.days || [])[i + 1];
          e.root.hidden = !x;
          if (!x) return;
          txt(e.name, x.name);
          iconInto(e.ico, x.icon);
          txt(e.mm, deg(x.min) + ' / ' + deg(x.max));
          txt(e.pp, x.pp ? 'pluie ' + Math.round(x.pp) + ' %' : '');
        });
      }
      draw();
      var timer = setInterval(draw, 1000);
      return {
        place: function (p) { box.dataset.place = p; },
        parts: function () { return [{ el: ico, role: 'visual' }]; },
        destroy: function () { clearInterval(timer); box.remove(); }
      };
    }

    return {
      visual: function (name, el2, host) { return name === 'now' ? nowVisual(el2, host) : null; }
    };
  });
})();
