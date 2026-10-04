/* Module "flux", server side: fetches each source on its own schedule and
   turns it into variables.

     <source>          the first element (or the first named value)
     <source>_liste    the elements, rendered with the item template (a list:
                       a ticker's "Messages d'une variable")
     <source>_n        how many
     <source>_<name>   each named value
     <source>_maj      when it was last read, <source>_etat ok | erreur

   Formats: RSS 2.0 and Atom (items: title, description, date, time, link,
   author, category), JSON (a path to the list, paths to values: data.items.0.name),
   CSV (comma or semicolon; first row = column names; values by column name
   (first data row), row.column (row numbers as in the sheet: 2 = the first
   data row) or cell (B2)), text (one element per non-empty line).

   Where: an http(s) address (15 s, 2 MB, redirects followed), or a file of
   the media library: /media/<name> (a CSV kept up to date by hand…). Text
   in UTF-8, or whatever the header or the XML prolog says, else Windows-1252
   (Excel's CSV). */
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('./module.js');
const MAX_BYTES = 2 * 1024 * 1024;

// ===== Text helpers =====
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  agrave: 'à', acirc: 'â', auml: 'ä', ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Ccedil: 'Ç', oelig: 'œ', OElig: 'Œ', aelig: 'æ', laquo: '«', raquo: '»',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', ndash: '–', mdash: '—', euro: '€', deg: '°', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™' };
function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(n); } catch (err) { return all; }
    }
    return NAMED[e] != null ? NAMED[e] : all;
  });
}
function plain(s) {
  s = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ');
  return decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
  const m = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i').exec(block);
  return m ? plain(m[1]) : '';
}

// ===== Parsers =====
function parseXML(xml, fmtDate) {
  const out = [], re = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[2];
    const when = tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published') || tag(b, 'dc:date');
    const link = tag(b, 'link') || ((/<link\b[^>]*href="([^"]*)"/i.exec(b) || [])[1] || '');
    const d = fmtDate(when);
    out.push({ title: tag(b, 'title'), description: (tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 400),
               link: decode(link), author: tag(b, 'author') || tag(b, 'dc:creator'), category: tag(b, 'category'), date: d.date, time: d.time });
  }
  return out;
}
function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
/* a path in JSON-like data: "data.items.0.name", "data.items[0].name" */
function dig(obj, path) {
  const keys = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(k => k !== '');
  let v = obj;
  for (const k of keys) {
    if (v == null) return undefined;
    if (typeof v === 'object' && k in v) v = v[k];
    else return undefined;
  }
  return v;
}
function colIndex(letters) { let n = 0; for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
/* CSV values: "Score" (first data row), "3.Score" (sheet row 3), "B2" (cell) */
function csvValue(rows, path) {
  const head = rows[0] || [];
  let m = /^([A-Za-z]{1,2})(\d+)$/.exec(path);
  if (m && !head.includes(path)) return (rows[+m[2] - 1] || [])[colIndex(m[1])];
  m = /^(\d+)\.(.+)$/.exec(path);
  const r = m ? +m[1] - 1 : 1, name = m ? m[2] : path;
  let c = head.indexOf(name);
  if (c < 0 && /^\d+$/.test(name)) c = +name - 1;
  return c < 0 ? undefined : (rows[r] || [])[c];
}
/* {{name}} with any name (a CSV column "Nom du joueur", a JSON path) and the
   filters of the rest of the engine: |upper |lower |cap |default:x */
function render(tpl, get) {
  return String(tpl).replace(/\{\{\s*([^{}|]+?)\s*(?:\|\s*(\w+)(?::([^}]*))?)?\s*\}\}/g, (all, name, filter, arg) => {
    let v = get(name);
    v = v == null || typeof v === 'object' ? '' : String(v);
    switch (filter) {
      case 'upper': return v.toUpperCase();
      case 'lower': return v.toLowerCase();
      case 'cap': return v.charAt(0).toUpperCase() + v.slice(1);
      case 'default': return v === '' ? (arg || '') : v;
      default: return v;
    }
  }).replace(/\s+/g, ' ').trim();
}
function firstText(o) {
  if (o == null) return '';
  if (typeof o !== 'object') return String(o);
  for (const k of ['title', 'name', 'nom', 'titre', 'text', 'texte', 'label']) if (typeof o[k] === 'string' || typeof o[k] === 'number') return String(o[k]);
  for (const k in o) if (typeof o[k] === 'string' || typeof o[k] === 'number') return String(o[k]);
  return '';
}

exports.init = function (ctx) {
  const U = ctx.U;
  const S = {};  /* id → { key, timer, busy, ok, error, next, items, fields } */

  function fmtDate(s) {
    const t = s ? Date.parse(s) : NaN;
    if (isNaN(t)) return { date: '', time: '' };
    const tz = ctx.tz(), time = U.hm(t, tz);
    return { time, date: U.dayOf(t, tz) === U.dayOf(Date.now(), tz) ? time : U.shortDate(t, tz).slice(0, 5) + ' ' + time };
  }
  function decodeBuf(buf, cs) {
    if (cs) { try { return new TextDecoder(cs).decode(buf); } catch (e) { /* unknown label: guess */ } }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }
  function prolog(buf) { return (/<\?xml[^>]*encoding=["']([\w-]+)/i.exec(buf.subarray(0, 300).toString('latin1')) || [])[1]; }
  async function fetchText(url) {
    const local = /^\/?media\/([^/?#]+)$/.exec(url);
    if (local) {
      const name = path.basename(decodeURIComponent(local[1])), file = ctx.mediaFile(name);
      if (!file) throw new Error('fichier introuvable dans les médias : ' + name);
      if (fs.statSync(file).size > MAX_BYTES) throw new Error('fichier trop gros (plus de 2 Mo)');
      const buf = fs.readFileSync(file);
      return decodeBuf(buf, prolog(buf));
    }
    if (!/^https?:\/\//i.test(url)) throw new Error('adresse http(s) ou /media/fichier attendue');
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow',
                                 headers: { 'User-Agent': 'EclipseGraphics-overlay/1.0 (+https://github.com/LightD31/EclipseGraphics)', Accept: '*/*' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (+r.headers.get('content-length') > MAX_BYTES) throw new Error('réponse trop grosse (plus de 2 Mo)');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('réponse trop grosse (plus de 2 Mo)');
    /* the charset: the header's, else the XML prolog's (many French feeds are still ISO-8859-1) */
    return decodeBuf(buf, (/charset=["']?([\w-]+)/i.exec(r.headers.get('content-type') || '') || [])[1] || prolog(buf));
  }

  /* one source's text → { items, fields } */
  function digest(src, text) {
    let items = [], get;
    if (src.kind === 'rss') {
      const list = parseXML(text, fmtDate);
      if (!list.length && !/<(rss|feed|rdf)\b/i.test(text)) throw new Error('ce n\'est pas un flux RSS ou Atom');
      items = list.slice(0, src.max).map(it => (src.item ? render(src.item, k => it[k]) : it.title));
      get = (p) => dig(list, p);
    } else if (src.kind === 'json') {
      let j;
      try { j = JSON.parse(text); } catch (e) { throw new Error('JSON illisible : ' + e.message); }
      const list = src.list ? dig(j, src.list) : j;
      if (Array.isArray(list)) items = list.slice(0, src.max).map(it => (src.item ? render(src.item, k => (it && typeof it === 'object' && k in it ? it[k] : dig(it, k))) : firstText(it)));
      else if (src.list) throw new Error('pas de liste en « ' + src.list + ' »');
      get = (p) => dig(j, p);
    } else if (src.kind === 'csv') {
      const rows = parseCSV(text), head = rows[0] || [];
      items = rows.slice(1, 1 + src.max).map(r => {
        const o = {};
        head.forEach((h, i) => { o[h] = r[i]; });
        return src.item ? render(src.item, k => (k in o ? o[k] : csvValue([head, r], k))) : String(r[0] || '');
      });
      get = (p) => csvValue(rows, p);
    } else {
      items = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, src.max);
      get = () => undefined;
    }
    items = items.map(s => String(s).slice(0, 300)).filter(Boolean);
    const fields = {};
    for (const f of src.fields) {
      const v = get(f.path);
      fields[f.name] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : String(v).slice(0, 300);
    }
    return { items, fields };
  }
  function publish(src, st) {
    const v = {};
    v[src.id] = st.items.length ? st.items[0] : (Object.values(st.fields)[0] || '');
    v[src.id + '_liste'] = st.items.slice();
    v[src.id + '_n'] = String(st.items.length);
    for (const k in st.fields) v[src.id + '_' + k] = st.fields[k];
    v[src.id + '_maj'] = st.ok ? U.hm(st.ok, ctx.tz()) : '';
    v[src.id + '_etat'] = st.error ? 'erreur' : st.ok ? 'ok' : '';
    ctx.setVars(v);
  }
  async function read(src) {
    const st = S[src.id];
    if (!st || st.busy) return;
    st.busy = true;
    clearTimeout(st.timer);
    try {
      const out = digest(src, await fetchText(src.url));
      Object.assign(st, out, { ok: Date.now(), error: '', fails: 0 });
    } catch (e) {
      st.error = e.name === 'TimeoutError' ? 'délai dépassé' : e.message;
      st.fails = (st.fails || 0) + 1;
      if (st.fails === 1 || st.fails % 10 === 0) ctx.log('warn', 'flux ' + src.id + ' : ' + st.error);
    } finally {
      st.busy = false;
      if (S[src.id] === st) {
        publish(src, st);
        const wait = st.error ? Math.min(src.every, 60 * Math.min(st.fails, 5)) : src.every;
        st.next = Date.now() + wait * 1000;
        st.timer = setTimeout(() => read(src), wait * 1000);
      }
    }
  }
  function onShow() {
    const s = ctx.settings(), list = s ? M.helpers.sources(s, U) : [];
    const want = {};
    for (const src of list) {
      want[src.id] = true;
      const key = JSON.stringify(src), st = S[src.id];
      if (st && st.key === key) {
        /* variables cleared (another show was opened): give back what we have */
        if (!(src.id + '_etat' in ctx.vars()) && (st.ok || st.error)) publish(src, st);
        continue;
      }
      if (st) clearTimeout(st.timer);
      if (!src.url) { S[src.id] = { key, items: [], fields: {}, error: 'pas d\'adresse', ok: 0 }; publish(src, S[src.id]); continue; }
      S[src.id] = { key, items: [], fields: {}, ok: 0, error: '', fails: 0 };
      read(src);
    }
    for (const id of Object.keys(S)) {
      if (want[id]) continue;
      clearTimeout(S[id].timer);
      delete S[id];
      const v = {}; v[id] = ''; v[id + '_liste'] = []; v[id + '_n'] = '0'; v[id + '_etat'] = '';
      ctx.setVars(v);
    }
  }

  return {
    commands: {
      /* refresh: every source now; refresh.<source>: that one */
      refresh(v, c) {
        const list = M.helpers.sources(c.settings, U).filter(src => !v || src.id === v);
        if (v && !list.length) return false;
        list.forEach(src => { if (S[src.id] && src.url) setTimeout(() => read(src), 0); });
      }
    },
    onShow,
    status() {
      const s = ctx.settings();
      return {
        sources: (s ? M.helpers.sources(s, U) : []).map(src => {
          const st = S[src.id] || {};
          return { id: src.id, kind: src.kind, url: src.url, ok: st.ok || 0, error: st.error || '', next: st.next || 0,
                   n: (st.items || []).length, items: (st.items || []).slice(0, 3), fields: st.fields || {} };
        })
      };
    },
    stop() { for (const id in S) clearTimeout(S[id].timer); }
  };
};
exports._test = { parseXML, parseCSV, csvValue, dig, render, decode, plain };
