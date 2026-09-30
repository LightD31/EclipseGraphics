/* Module "meteo", server side: asks Open-Meteo for the place's current
   weather and the next days (every `every` minutes, one request whatever
   the number of outputs), and turns the answer into variables. The raw
   figures go to the outputs too, as _data, for the drawings.

   GET /meteo/geocode?q=<town>  the panel's place search (Open-Meteo's
                                geocoding, in French) */
'use strict';
const M = require('./module.js');
const NBSP = '\u00a0';

exports.init = function (ctx) {
  const U = ctx.U;
  const S = { key: '', timer: null, busy: false, ok: 0, error: '', last: null, next: 0, fails: 0 };

  function base(s) { return String(s.api || 'https://api.open-meteo.com').trim().replace(/\/+$/, ''); }
  function url(s) {
    const q = new URLSearchParams({
      latitude: String(+s.lat || 0), longitude: String(+s.lon || 0), timezone: 'auto', forecast_days: '4',
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
      temperature_unit: s.temp === 'fahrenheit' ? 'fahrenheit' : 'celsius',
      wind_speed_unit: ['kmh', 'ms', 'kn', 'mph'].includes(s.wind) ? s.wind : 'kmh'
    });
    /* a paid plan's key: the settings', else the environment's (kept out of the show's file) */
    const key = String(s.apikey || process.env.OPEN_METEO_APIKEY || '').trim();
    if (key) q.set('apikey', key);
    return base(s) + '/v1/forecast?' + q;
  }

  const DIRS = [['N', 'du nord'], ['NE', 'du nord-est'], ['E', 'd\'est'], ['SE', 'du sud-est'], ['S', 'du sud'], ['SO', 'du sud-ouest'], ['O', 'd\'ouest'], ['NO', 'du nord-ouest']];
  const WIND = { kmh: 'km/h', ms: 'm/s', kn: 'nœuds', mph: 'mph' };
  function weekday(date, tz) {
    const [y, m, d] = String(date).split('-').map(Number);
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  }

  /* Open-Meteo's answer → the variables */
  function toVars(j, s) {
    const c = j.current || {}, d = j.daily || {};
    const tu = s.temp === 'fahrenheit' ? '°F' : '°C', wu = WIND[s.wind] || 'km/h';
    const T = (x) => (x == null || isNaN(x) ? '—' : Math.round(x) + NBSP + tu);
    const W = (x) => (x == null || isNaN(x) ? '—' : Math.round(x) + NBSP + wu);
    const hm = (iso) => (/T(\d\d:\d\d)/.exec(String(iso || '')) || [])[1] || '';
    const now = M.helpers.sky(c.weather_code, c.is_day !== 0);
    const dir = c.wind_direction_10m == null ? null : DIRS[Math.round(((+c.wind_direction_10m % 360) + 360) % 360 / 45) % 8];
    const days = (d.time || []).map((date, i) => {
      const k = M.helpers.sky((d.weather_code || [])[i], true);
      return { date, name: weekday(date), code: (d.weather_code || [])[i], text: k.text, icon: k.icon,
               min: (d.temperature_2m_min || [])[i], max: (d.temperature_2m_max || [])[i], pp: (d.precipitation_probability_max || [])[i] };
    });
    const range = (x) => (x ? Math.round(x.min) + ' à ' + T(x.max) : '');
    const dayLine = (x) => (x ? x.name + ' : ' + x.text.toLowerCase() + ', ' + range(x) : '');
    const place = String(s.place || '');
    const today = days[0], tomorrow = days[1];
    const ciel = now.text;
    const vent = W(c.wind_speed_10m);
    const vars = {
      lieu: place, temp: T(c.temperature_2m), temp_n: c.temperature_2m == null ? '' : String(Math.round(c.temperature_2m)),
      ressenti: T(c.apparent_temperature), ciel, icone: now.icon,
      resume: T(c.temperature_2m) + ', ' + ciel.toLowerCase(),
      vent, vent_dir: dir ? dir[0] : '', vent_txt: dir ? 'vent ' + dir[1] + ', ' + vent : vent,
      rafales: W(c.wind_gusts_10m), humidite: c.relative_humidity_2m == null ? '—' : Math.round(c.relative_humidity_2m) + NBSP + '%',
      pluie: today && today.pp != null ? Math.round(today.pp) + NBSP + '%' : '',
      min: today ? T(today.min) : '', max: today ? T(today.max) : '',
      lever: hm((d.sunrise || [])[0]), coucher: hm((d.sunset || [])[0]),
      demain: tomorrow ? tomorrow.text.toLowerCase() + ', ' + range(tomorrow) : '',
      j1: dayLine(days[1]), j2: dayLine(days[2]), j3: dayLine(days[3]),
      maj: U.hm(Date.now(), ctx.tz()), etat: 'ok',
      messages: [
        (place ? place + ' : ' : '') + T(c.temperature_2m) + ', ' + ciel.toLowerCase(),
        (dir ? 'Vent ' + dir[1] + ', ' : 'Vent : ') + vent + (c.wind_gusts_10m > (c.wind_speed_10m || 0) * 1.4 ? ', rafales à ' + W(c.wind_gusts_10m) : ''),
        tomorrow ? 'Demain : ' + tomorrow.text.toLowerCase() + ', ' + range(tomorrow) : ''
      ].filter(Boolean),
      ticker: [[
        ['Météo' + (place ? ' · ' + place : ''), T(c.temperature_2m), ciel],
        ['Vent', vent, dir ? dir[1] : ''],
        tomorrow ? ['Demain', range(tomorrow), tomorrow.text] : ['Humidité', vars_h(c), '']
      ]],
      _data: {
        place, tu, wu, updated: Date.now(),
        now: { temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, day: c.is_day !== 0, icon: now.icon, text: ciel,
               wind: c.wind_speed_10m, dir: dir ? dir[0] : '', gust: c.wind_gusts_10m, hum: c.relative_humidity_2m },
        days: days.map(x => ({ name: x.name, icon: x.icon, text: x.text, min: x.min, max: x.max, pp: x.pp }))
      }
    };
    return vars;
  }
  function vars_h(c) { return c.relative_humidity_2m == null ? '—' : Math.round(c.relative_humidity_2m) + NBSP + '%'; }

  function schedule(ms) { clearTimeout(S.timer); S.next = Date.now() + ms; S.timer = setTimeout(fetchNow, ms); }
  async function fetchNow() {
    const s = ctx.settings();
    if (!s || S.busy) return;
    S.busy = true;
    const every = Math.max(5, +s.every || 15) * 60000;
    try {
      const r = await fetch(url(s), { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
      const text = await r.text();
      let j = null;
      try { j = JSON.parse(text); } catch (e) { /* not json */ }
      if (!r.ok || !j || j.error) {
        const e = new Error((j && j.reason) || 'HTTP ' + r.status);
        e.status = r.status;
        throw e;
      }
      S.ok = Date.now(); S.error = ''; S.fails = 0; S.last = j;
      ctx.setVars(toVars(j, s));
      schedule(every);
    } catch (e) {
      S.fails++;
      S.error = e.status === 429 ? 'quota du service dépassé (' + e.message + ')' : e.message;
      if (S.fails === 1 || S.fails % 10 === 0) ctx.log('warn', 'météo : ' + S.error);
      ctx.setVars({ etat: 'erreur' });
      /* a refused quota: wait an hour; otherwise try again sooner than usual */
      schedule(e.status === 429 ? Math.max(every, 3600000) : Math.min(every, 120000 * Math.min(S.fails, 5)));
    } finally { S.busy = false; }
  }
  function onShow() {
    const s = ctx.settings();
    if (!s) { clearTimeout(S.timer); S.key = ''; return; }
    const key = JSON.stringify([s.place, s.lat, s.lon, s.temp, s.wind, s.every, s.api, s.apikey]);
    if (key === S.key) {
      /* vars were cleared (another show was opened): give back what we have */
      if (S.last && !ctx.vars().temp) ctx.setVars(toVars(S.last, s));
      return;
    }
    const placeOnly = S.key && S.last && JSON.parse(S.key).slice(1).join() === JSON.parse(key).slice(1).join();
    S.key = key;
    if (placeOnly) { ctx.setVars(toVars(S.last, s)); return; }
    S.last = null; S.fails = 0;
    fetchNow();
  }

  async function geocode(req, res, u) {
    const q = String(u.searchParams.get('q') || '').trim().slice(0, 80);
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (q.length < 2) return send(200, { results: [] });
    try {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({ name: q, count: '8', language: 'fr', format: 'json' }),
                            { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      send(200, { results: (j.results || []).map(x => ({ name: x.name, admin: [x.admin2, x.admin1].filter(Boolean).join(', '), country: x.country || '',
                                                         lat: +(+x.latitude).toFixed(4), lon: +(+x.longitude).toFixed(4) })) });
    } catch (e) { send(502, { error: e.message }); }
  }

  return {
    routes: [['GET', /^\/meteo\/geocode$/, geocode]],
    commands: { refresh() { clearTimeout(S.timer); setTimeout(fetchNow, 0); } },
    onShow,
    status() {
      const s = ctx.settings();
      return { ok: S.ok, error: S.error, next: S.next, place: s ? s.place : '', service: s ? base(s) : '' };
    },
    stop() { clearTimeout(S.timer); }
  };
};
