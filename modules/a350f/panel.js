/* Module "a350f" in the panel: what the old status page showed — the data's
   health, the flight's state and events — and every operator control
   (schedule, actual take-off, headline, wording, units) a click away. */
(function () {
  'use strict';
  GFX.panel('a350f', {
    render: function (el, api) {
      var h = api.h, U = api.U;
      function ago(ms) {
        if (ms == null) return '—';
        var s = Math.round(ms / 1000);
        return s < 60 ? 'il y a ' + s + ' s' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : 'il y a ' + (s / 3600).toFixed(1).replace('.', ',') + ' h';
      }
      var tiles = h('div', { class: 'tiles' }), T = {};
      [['relay', 'Relais'], ['adsb', 'Signal ADS-B'], ['up0', 'adsb.lol'], ['up1', 'adsb.fi'], ['rec', 'Enregistrement'], ['alert', 'Transpondeur']].forEach(function (t) {
        var v = h('div', { class: 'v', text: '…' }), s = h('div', { class: 's' });
        T[t[0]] = { tile: h('div', { class: 'tile' }, [h('div', { class: 'k', text: t[1] }), v, s]), v: v, s: s };
        tiles.appendChild(T[t[0]].tile);
      });
      function tile(k, level, v, s) { var x = T[k]; x.tile.className = 'tile ' + (level || ''); x.v.textContent = v; x.s.textContent = s || ''; }
      var state = h('div', { class: 'note' });
      var events = h('ul', { class: 'events' });
      var send = function (c, text) { return api.cmd(c, text); };
      function input(ph, cls) { return h('input', { type: 'text', class: cls || 'time', placeholder: ph }); }
      function go(inp, prefix) { return function () { var v = inp.value.trim(); if (!v) return api.toast('champ vide', true); send(prefix + v); inp.value = ''; }; }
      var iT0 = input('10:30'), iLand = input('14:05'), iTo = input('10:34'), iHl = input('Titre à la place du titre automatique', 'text');
      el.appendChild(tiles);
      el.appendChild(state);
      el.appendChild(h('div', { class: 'card', style: 'background:#0b1233' }, [
        h('div', { class: 'row' }, [h('span', { class: 'lbl', text: 'Décollage prévu' }), iT0, h('button', { class: 'small', text: 'Régler', onclick: go(iT0, 't0.') }),
          h('button', { class: 'small', text: '+5 min', onclick: function () { send('t0.+5'); } }),
          h('button', { class: 'small', text: '+15 min', onclick: function () { send('t0.+15'); } }),
          h('button', { class: 'small ghost', text: 'Horaire initial', onclick: function () { send('t0.reset'); } })]),
        h('div', { class: 'row' }, [h('span', { class: 'lbl', text: 'Atterrissage prévu' }), iLand, h('button', { class: 'small', text: 'Régler', onclick: go(iLand, 'land.') }),
          h('button', { class: 'small', text: '+5 min', onclick: function () { send('land.+5'); } }),
          h('button', { class: 'small', text: '+15 min', onclick: function () { send('land.+15'); } }),
          h('button', { class: 'small ghost', text: 'Horaire initial', onclick: function () { send('land.reset'); } })]),
        h('div', { class: 'row' }, [h('span', { class: 'lbl', text: 'Décollage réel' }),
          h('button', { class: 'small red', text: 'Maintenant', onclick: function () { send('takeoff.now'); } }), iTo,
          h('button', { class: 'small', text: 'Régler', onclick: go(iTo, 'takeoff.') }),
          h('button', { class: 'small ghost', text: 'Auto (ADS-B)', onclick: function () { send('takeoff.auto'); } })]),
        h('div', { class: 'row' }, [h('span', { class: 'lbl', text: 'Titre' }), iHl,
          h('button', { class: 'small', text: 'Afficher', onclick: function () { var v = iHl.value.trim(); if (v) send('headline.set', v); } }),
          h('button', { class: 'small ghost', text: 'Titre auto', onclick: function () { send('headline.auto'); } })]),
        h('div', { class: 'row' }, [h('span', { class: 'lbl', text: 'Ton et unités' }),
          h('button', { class: 'small', text: 'Ton auto', onclick: function () { send('mode.auto'); } }),
          h('button', { class: 'small', text: 'Ton neutre', onclick: function () { send('mode.neutral'); } }),
          h('button', { class: 'small', text: 'ft · kt', onclick: function () { send('units.aviation'); } }),
          h('button', { class: 'small', text: 'm · km/h', onclick: function () { send('units.metric'); } })]),
        h('div', { class: 'row' }, [h('span', { class: 'lbl', text: 'Données' }),
          h('button', { class: 'small ghost', text: 'Oublier la trace des sorties', title: 'Les sorties effacent leur copie locale et reprennent celle du relais',
            onclick: function () { api.ask('Les sorties oublient leur trace locale et reprennent l\'enregistrement du relais. Continuer ?').then(function (yes) { if (yes) send('reset'); }); } }),
          api.settings().demo ? h('button', { class: 'small', text: 'Relancer la démo', onclick: function () { send('demo.restart'); } }) : null])
      ]));
      el.appendChild(h('h2', { text: 'Événements du vol', style: 'margin:10px 0 6px' }));
      el.appendChild(events);

      function refresh() {
        var v = api.vars(), s = api.state(), set = api.settings();
        var ev = Array.isArray(v.events) ? v.events : [];
        events.innerHTML = '';
        if (!ev.length) events.appendChild(h('li', { class: 'empty', text: 'Aucun événement pour l\'instant.' }));
        ev.slice().reverse().forEach(function (e) { events.appendChild(h('li', {}, [h('b', { text: e.t }), document.createTextNode(e.text)])); });
        state.innerHTML = '';
        state.appendChild(document.createTextNode((v.title ? '« ' + v.title + ' » · ' : '') + (v.timer_label ? v.timer_label + ' ' + (v.timer || '') + ' · ' : '') +
          'phase ' + (v.phase || '—') + ' · ' + (v.alt || '—') + ' · ' + (v.speed || '—') + (v.where ? ' · ' + v.where : '') +
          ' · prévu ' + (v.t_sched || set.t0) + '–' + (v.t_land || set.land) + (v.t_takeoff ? ' · décollage ' + v.t_takeoff : '') +
          (v.t_landing ? ' · atterrissage ' + v.t_landing : '') + ' · ton ' + (s.mode === 'neutral' ? 'neutre' : 'auto') +
          (s.headline ? ' · titre manuel' : '') + ' · ' + ((s.units || set.units) === 'metric' ? 'm · km/h' : 'ft · kt')));
        if (v.alert) tile('alert', 'bad', 'alerte ' + v.alert, 'ton neutre forcé');
        else tile('alert', 'ok', 'normal', v.callsign ? 'indicatif ' + v.callsign : '');
      }
      function status() {
        if (!document.body.contains(el)) { clearInterval(timer); return; }
        var set = api.settings();
        if (set.relay) {
          tile('relay', '', 'externe', set.relay); tile('up0', '', '—', 'voir ce relais'); tile('up1', '', '—', ''); tile('rec', '', '—', '');
          adsbTile(null);
          return;
        }
        api.status().then(function (s) {
          if (!s || !s.upstreams) return;
          tile('relay', 'ok', 'intégré', 'démarré ' + ago(s.now - s.boot));
          s.upstreams.forEach(function (u, i) {
            var level = u.backoff ? 'warn' : u.lastOk && s.now - u.lastOk < 60000 ? 'ok' : u.errors ? 'bad' : '';
            tile('up' + i, level, u.backoff ? 'en pause ' + Math.ceil(u.backoff / 1000) + ' s' : u.lastOk ? 'ok ' + ago(s.now - u.lastOk) : 'pas utilisé',
                 u.requests + ' requêtes · ' + u.errors + ' erreurs' + (u.lastErr ? ' · ' + u.lastErr.msg : ''));
          });
          var pts = s.watched.reduce(function (n, x) { return n + x.points; }, 0);
          tile('rec', pts ? 'ok' : '', pts + ' points', (s.filled ? s.filled + ' comblés par la trace · ' : '') + 'flight-log/');
          adsbTile(s);
        }, function () { tile('relay', 'bad', 'injoignable', ''); });
      }
      function adsbTile(s) {
        var v = api.vars(), set = api.settings();
        if (set.demo) return tile('adsb', 'warn', 'démo', 'vol de synthèse');
        var w = s && s.watched.filter(function (x) { return x.hex === String(set.hex).toLowerCase(); })[0];
        var every = w && w.every ? ' · interrogé toutes les ' + String(Math.round(w.every / 100) / 10).replace('.', ',') + ' s' : '';
        if (v.signal === 'live') tile('adsb', 'ok', 'en direct', (v.source || '') + every);
        else if (w && w.newest) {
          var age = s.now - w.newest;
          tile('adsb', age < 60000 ? 'warn' : 'bad', 'dernier point ' + ago(age), w.hex.toUpperCase() + every);
        } else tile('adsb', 'warn', v.signal === 'stale' ? 'signal interrompu' : 'pas encore vu', String(set.hex).toUpperCase() + ' · l\'avion n\'émet pas' + every);
      }
      var timer = setInterval(status, 2000);
      status();
      return { refresh: refresh };
    }
  });
})();
