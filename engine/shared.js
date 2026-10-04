/* Shared helpers for the overlay engine: loaded by the server (require), the
   output page and the control panel (<script>, as window.GFXShared).

   - time zones: a wall-clock time in the show's zone → epoch ms, and back
   - formatting: clocks, countdowns, the coarse "1 h 03" of chat messages
   - templates: "{{a350f.alt}} · {{clock}}" → text, with a few filters
   - schemas: the field lists graphic types and modules declare, and the
     defaults they imply (the panel draws its forms from the same lists) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GFXShared = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ===== Time zones =====
  var fmtCache = {};
  function partsFmt(tz) {
    return fmtCache['p|' + tz] || (fmtCache['p|' + tz] = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }));
  }
  /* The wall clock in tz at an instant → { year, month, day, hour, minute, second } */
  function partsIn(ms, tz) {
    var p = {};
    partsFmt(tz).formatToParts(new Date(ms)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = +x.value; });
    return p;
  }
  function offsetAt(ms, tz) {
    var p = partsIn(ms, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  }
  /* A wall-clock time in tz → epoch ms (the second guess settles the hour a
     DST change moves) */
  function zoned(y, mo, d, h, mi, s, tz) {
    var guess = Date.UTC(y, mo - 1, d, h, mi, s || 0);
    var t = guess - offsetAt(guess, tz);
    var t2 = guess - offsetAt(t, tz);
    return t2 === t ? t : t2;
  }
  /* "YYYY-MM-DD" of an instant in tz */
  function dayOf(ms, tz) {
    var p = partsIn(ms, tz);
    return p.year + '-' + pad(p.month) + '-' + pad(p.day);
  }
  /* When: "2026-09-29T10:30", "2026-09-29 10:30:15" (wall clock in tz), a
     full ISO date with Z or an offset, or "10:30" on day (default: today in
     tz) → epoch ms, or null when it can't be read. */
  function parseWhen(str, tz, day) {
    if (str == null || str === '') return null;
    if (typeof str === 'number') return str;
    str = String(str).trim();
    if (/(Z|[+-]\d\d:?\d\d)$/.test(str) && /\d{4}-\d\d-\d\dT/.test(str)) {
      var iso = Date.parse(str);
      return isNaN(iso) ? null : iso;
    }
    var m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d{1,2}):(\d\d)(?::(\d\d))?$/.exec(str);
    if (m) return valid(+m[4], +m[5], +(m[6] || 0)) ? zoned(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0), tz) : null;
    m = /^(\d{1,2})[:h](\d\d)(?::(\d\d))?$/.exec(str);
    if (m && valid(+m[1], +m[2], +(m[3] || 0))) {
      var d = /^(\d{4})-(\d\d)-(\d\d)$/.exec(day || dayOf(Date.now(), tz));
      if (!d) return null;
      return zoned(+d[1], +d[2], +d[3], +m[1], +m[2], +(m[3] || 0), tz);
    }
    return null;
  }
  function valid(h, mi, s) { return h <= 23 && mi <= 59 && s <= 59; }

  // ===== Formatting =====
  function pad(n) { return String(n).padStart(2, '0'); }
  function intl(tz, opts, key) {
    var k = key + '|' + tz;
    return fmtCache[k] || (fmtCache[k] = new Intl.DateTimeFormat('fr-FR', Object.assign({ timeZone: tz }, opts)));
  }
  function hms(ms, tz) { return intl(tz, { hour: '2-digit', minute: '2-digit', second: '2-digit' }, 'hms').format(new Date(ms)); }
  function hm(ms, tz) { return intl(tz, { hour: '2-digit', minute: '2-digit' }, 'hm').format(new Date(ms)); }
  function longDate(ms, tz) { return intl(tz, { day: 'numeric', month: 'long', year: 'numeric' }, 'ld').format(new Date(ms)); }
  function dayMonth(ms, tz) { return intl(tz, { day: 'numeric', month: 'long' }, 'dm').format(new Date(ms)); }
  function weekday(ms, tz) { return intl(tz, { weekday: 'long' }, 'wd').format(new Date(ms)); }
  function shortDate(ms, tz) { return intl(tz, { day: '2-digit', month: '2-digit', year: 'numeric' }, 'sd').format(new Date(ms)); }

  /* A duration for a timer on screen. auto: "01:23:45", or "2d 05h 42m" from
     a day up (the eclipse and A350F overlays' format); hms: hours past 24
     rather than days; ms: minutes and seconds only; coarse: "1 h 03". */
  function clock(ms, style) {
    if (!(ms > 0)) ms = 0;
    var s = Math.floor(ms / 1000);
    if (style === 'coarse') return coarse(ms);
    if (style === 'ms') return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
    if (style !== 'hms' && s >= 86400) {
      return Math.floor(s / 86400) + 'd ' + pad(Math.floor((s % 86400) / 3600)) + 'h ' + pad(Math.floor((s % 3600) / 60)) + 'm';
    }
    return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  }
  /* Coarse duration for chat text and captions: "2 j 05 h", "1 h 03",
     "24 min", "moins d'une minute" — changes at most once a minute. */
  function coarse(ms) {
    if (!(ms > 0)) ms = 0;
    var m = Math.floor(ms / 60000);
    if (m >= 1440) return Math.floor(m / 1440) + ' j ' + pad(Math.floor((m % 1440) / 60)) + ' h';
    if (m >= 60) return Math.floor(m / 60) + ' h ' + pad(m % 60);
    if (m >= 1) return m + ' min';
    return 'moins d\'une minute';
  }

  // ===== Templates =====
  /* {{name}} · {{name|upper}} · {{name|default:—}} — name is a variable
     ("a350f.alt", "eclipse.pct", "var.score", "clock"…). Unknown names are
     empty. The result is plain text: callers set it with textContent. */
  var TPL = /\{\{\s*([\w.-]+)\s*(?:\|\s*(\w+)(?::([^}]*))?)?\s*\}\}/g;
  function render(str, get) {
    if (str == null) return '';
    str = String(str);
    if (str.indexOf('{{') < 0) return str;
    return str.replace(TPL, function (all, name, filter, arg) {
      var v = get(name);
      v = v == null ? '' : typeof v === 'object' ? '' : String(v);
      switch (filter) {
        case 'upper': return v.toUpperCase();
        case 'lower': return v.toLowerCase();
        case 'cap': return v.charAt(0).toUpperCase() + v.slice(1);
        case 'default': return v === '' ? (arg || '') : v;
        default: return v;
      }
    });
  }
  /* Every variable a value refers to (strings, deep in objects and lists) */
  function refs(value, out) {
    out = out || [];
    if (typeof value === 'string') {
      var m; TPL.lastIndex = 0;
      while ((m = TPL.exec(value))) out.push(m[1]);
    } else if (value && typeof value === 'object') {
      for (var k in value) refs(value[k], out);
    }
    return out;
  }

  // ===== Objects =====
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  /* obj with every key it lacks taken from defaults (deep, lists as a whole) */
  function withDefaults(obj, defaults) {
    if (!isObj(defaults)) return obj === undefined ? clone(defaults) : obj;
    var out = isObj(obj) ? obj : {};
    for (var k in defaults) {
      if (out[k] === undefined) out[k] = clone(defaults[k]);
      else if (isObj(defaults[k]) && isObj(out[k])) withDefaults(out[k], defaults[k]);
    }
    return out;
  }
  /* Paths are dot-separated keys; in a list, "#<id>" is the element with that
     id ("graphics.#bandeau.fields.title"), a number an element by index */
  function step(obj, k) {
    if (obj == null) return undefined;
    if (k.charAt(0) === '#' && Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) if (obj[i] && obj[i].id === k.slice(1)) return obj[i];
      return undefined;
    }
    return obj[k];
  }
  function getPath(obj, path) {
    var parts = Array.isArray(path) ? path : String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (obj == null) return undefined;
      obj = step(obj, parts[i]);
    }
    return obj;
  }
  function setPath(obj, path, value) {
    var parts = Array.isArray(path) ? path : String(path).split('.');
    for (var i = 0; i < parts.length - 1; i++) {
      if (!isObj(obj[parts[i]]) && !Array.isArray(obj[parts[i]])) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
  }
  // ===== Edits as operations =====
  /* Two editors (two Régies, a module's panel) change a show at once: each
     sends what it changed — { path, value } or { path, delete: true } — and
     the extension applies it to the show as it is, so nobody's edit undoes
     another's. Lists of elements with ids are followed element by element
     (a graphic moved or added replaces the whole list). */
  function keyed(list) {
    if (!Array.isArray(list) || !list.length) return false;
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (!isObj(x) || typeof x.id !== 'string' || !x.id || seen[x.id]) return false;
      seen[x.id] = true;
    }
    return true;
  }
  /* what changed from a to b → [op] */
  function diff(a, b, path, out) {
    out = out || []; path = path || '';
    var at = function (k) { return path ? path + '.' + k : String(k); };
    if (a === b) return out;
    if (isObj(a) && isObj(b)) {
      Object.keys(a).forEach(function (k) { if (b[k] === undefined && a[k] !== undefined) out.push({ path: at(k), delete: true }); });
      Object.keys(b).forEach(function (k) {
        if (b[k] === undefined) return;
        if (a[k] === undefined) out.push({ path: at(k), value: clone(b[k]) });
        else diff(a[k], b[k], at(k), out);
      });
      return out;
    }
    if (keyed(a) && keyed(b) && a.length === b.length && a.every(function (x, i) { return x.id === b[i].id; })) {
      a.forEach(function (x, i) { diff(x, b[i], at('#' + x.id), out); });
      return out;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: path, value: clone(b) });
    return out;
  }
  /* A path's keys never reach an object's inner workings (__proto__…): the
     ops come from elsewhere, in messages */
  function safeKey(k) { return !!k && k !== '__proto__' && k !== 'constructor' && k !== 'prototype'; }
  function safePath(path) { return typeof path === 'string' && path.split('.').every(safeKey); }
  /* op applied to obj (in place) → false when its place is gone (an element
     deleted elsewhere in the meantime: the edit has nothing left to change),
     or its path is not one */
  function applyOp(obj, op) {
    if (!op || !safePath(op.path)) return false;
    var parts = op.path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i], next = step(cur, k);
      if (next == null || typeof next !== 'object') {
        if (op.delete || k.charAt(0) === '#' || Array.isArray(cur)) return false;
        next = cur[k] = {};
      }
      cur = next;
    }
    var last = parts[parts.length - 1];
    if (last.charAt(0) === '#' && Array.isArray(cur)) {
      var id = last.slice(1), idx = -1;
      for (var j = 0; j < cur.length; j++) if (cur[j] && cur[j].id === id) { idx = j; break; }
      if (op.delete) { if (idx >= 0) cur.splice(idx, 1); return idx >= 0; }
      if (idx >= 0) cur[idx] = clone(op.value); else cur.push(clone(op.value));
      return true;
    }
    if (op.delete) {
      if (Array.isArray(cur)) { if (/^\d+$/.test(last) && +last < cur.length) cur.splice(+last, 1); }
      else delete cur[last];
      return true;
    }
    cur[last] = clone(op.value);
    return true;
  }
  /* the op that takes op back, from the state it was applied to */
  function inverseOp(base, op) {
    var v = getPath(base, op.path);
    return v === undefined ? { path: op.path, delete: true } : { path: op.path, value: clone(v) };
  }

  /* A schema is a list of sections { title, fields: [field…] }; a field has
     a key (a dot path into the object) and a default. Lists carry their own
     item schema (a flat list of fields). → the object of defaults */
  function schemaDefaults(schema) {
    var out = {};
    (schema || []).forEach(function (sec) {
      (sec.fields || []).forEach(function (f) {
        if (f.key && f.default !== undefined) setPath(out, f.key, clone(f.default));
      });
    });
    return out;
  }
  function itemDefaults(fields) { return schemaDefaults([{ fields: fields }]); }
  /* ids for graphics and variables: lowercase, digits, underscores (they end
     up in Companion variable names, which don't take dashes) */
  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  }
  function fr(n, digits) { return Number(n).toFixed(digits || 0).replace('.', ','); }

  return {
    partsIn: partsIn, zoned: zoned, dayOf: dayOf, parseWhen: parseWhen,
    pad: pad, hms: hms, hm: hm, longDate: longDate, dayMonth: dayMonth, weekday: weekday, shortDate: shortDate,
    clock: clock, coarse: coarse, render: render, refs: refs,
    clone: clone, isObj: isObj, withDefaults: withDefaults, getPath: getPath, setPath: setPath,
    diff: diff, applyOp: applyOp, inverseOp: inverseOp, safePath: safePath,
    schemaDefaults: schemaDefaults, itemDefaults: itemDefaults, slug: slug, fr: fr
  };
});
