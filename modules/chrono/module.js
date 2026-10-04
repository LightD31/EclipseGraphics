/* Module "chrono" — stopwatches and countdowns run live: a speaker's time,
   a break, a match clock. The server keeps them, so every output, the panel
   and Companion read the same time, and a restart doesn't lose them. Each
   timer is a variable, {{chrono.<id>}}, for any text: a bandeau's timer
   (mode "Texte / variable"), a card, the corner bug, the ticker.

   Read by the server (settings, commands through server.js), the panel
   (settings form, live controls) — the outputs only read the variables. */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.GFXModules = root.GFXModules || {})[m.id] = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* "05:00", "1:05:00", "90s", "5min", "5m", "1h", "1h30", "1,5 min"; a bare
     number is in `unit` (minutes for a duration, seconds for a nudge) */
  function parseDur(s, unit) {
    s = String(s == null ? '' : s).trim().toLowerCase().replace(',', '.').replace(/\s+/g, '');
    if (!s) return null;
    var m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
    if (m) return (m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]) * 1000;
    m = /^(\d+)h(\d{1,2})?$/.exec(s);
    if (m) return (+m[1] * 3600 + (+m[2] || 0) * 60) * 1000;
    m = /^(\d+(?:\.\d+)?)(h|min|mn|m|s|sec)?$/.exec(s);
    if (!m) return null;
    var u = m[2] || (unit === 's' ? 's' : 'min');
    return Math.round(parseFloat(m[1]) * (u === 'h' ? 3600 : u === 's' || u === 'sec' ? 1 : 60) * 1000);
  }
  /* "+30", "-10", "+1min", "-1:00" → signed ms (bare numbers in seconds) */
  function parseDelta(s) {
    var m = /^\s*([+-]?)\s*(.+)$/.exec(String(s == null ? '' : s));
    if (!m) return null;
    var ms = parseDur(m[2], 's');
    return ms == null ? null : (m[1] === '-' ? -ms : ms);
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  /* whole seconds → the text on screen */
  function fmt(secs, format) {
    secs = Math.max(0, Math.floor(secs));
    var h = Math.floor(secs / 3600), mi = Math.floor((secs % 3600) / 60), s = secs % 60;
    switch (format) {
      case 'hms': return pad(h) + ':' + pad(mi) + ':' + pad(s);
      case 'ms': return pad(Math.floor(secs / 60)) + ':' + pad(s);
      case 's': return String(secs);
      default: return h ? h + ':' + pad(mi) + ':' + pad(s) : pad(mi) + ':' + pad(s);
    }
  }
  /* The timers of the settings, with usable ids (unique, fit for variable
     and Companion names) */
  function timers(s, U) {
    var out = [], seen = {};
    (s && Array.isArray(s.timers) ? s.timers : []).forEach(function (t, i) {
      t = t || {};
      var base = (U ? U.slug(t.id || t.label || '') : '') || 'm' + (i + 1), id = base, n = 2;
      while (seen[id]) id = base + '_' + n++;
      seen[id] = true;
      var dur = parseDur(t.duration, 'min');
      out.push({
        id: id, label: String(t.label || id), mode: t.mode === 'up' ? 'up' : 'down',
        dur: dur == null ? 300000 : dur, format: t.format || 'auto', end: t.end === 'over' ? 'over' : 'stop',
        endText: String(t.endText || ''), flash: String(t.flash || ''), sound: String(t.sound || '')
      });
    });
    return out;
  }
  function down(t) { return t.mode !== 'up'; }

  return {
    id: 'chrono',
    label: 'Minuteurs',
    icon: '◷',
    desc: 'Chronomètres et comptes à rebours pilotés en direct (temps de parole, pause, match) : tenus par le serveur, ' +
          'ils affichent la même chose partout. À l\'écran avec le graphique « Minuteur », ou dans n\'importe quel texte ' +
          'avec leur variable {{chrono.<identifiant>}} (minuteur du bandeau, carte, logo et horloge, tableau de score).',
    panel: 'panel.js',
    /* its own graphic: a timer on screen, anywhere */
    graphics: { minuteur: 'minuteur.js' },
    css: ['minuteur.css'],
    /* the lists its graphic's form offers (mod:chrono.timers) */
    options: { timers: function (s, U) { return timers(s, U).map(function (t) { return [t.id, t.label]; }); } },
    settings: [
      { title: 'Minuteurs', open: true, fields: [
        { key: 'timers', type: 'list', label: 'Minuteurs', add: 'Ajouter un minuteur', itemLabel: '{{label}}',
          default: [{ label: 'Minuteur', id: 'minuteur', mode: 'down', duration: '05:00', format: 'auto', end: 'stop', endText: '', flash: '', sound: '' }],
          item: [
            { key: 'label', type: 'text', label: 'Nom', default: 'Minuteur' },
            { key: 'id', type: 'text', label: 'Identifiant', default: '', placeholder: 'debat',
              help: 'celui des commandes (chrono:debat.start) et de la variable ({{chrono.debat}}) ; vide : tiré du nom' },
            { key: 'mode', type: 'select', label: 'Sens', default: 'down', options: [['down', 'compte à rebours'], ['up', 'chronomètre']] },
            { key: 'duration', type: 'text', label: 'Durée', default: '05:00', placeholder: '05:00, 90s, 1h30', showIf: down,
              help: 'MM:SS, H:MM:SS ou avec une unité ; un nombre seul compte en minutes' },
            { key: 'format', type: 'select', label: 'Affichage', default: 'auto',
              options: [['auto', '04:59 (heures au besoin)'], ['hms', '00:04:59'], ['ms', '64:59 (minutes)'], ['s', '299 (secondes)']] },
            { key: 'end', type: 'select', label: 'À zéro', default: 'stop', showIf: down,
              options: [['stop', 's\'arrête à zéro'], ['over', 'continue : +00:12 de dépassement']] },
            { key: 'endText', type: 'text', label: 'Texte à zéro', default: '', placeholder: '00:00', showIf: down },
            { key: 'flash', type: 'text', label: 'Flash à zéro', default: '', placeholder: 'Temps écoulé', showIf: down,
              help: 'un message dans le flash du projet quand le compte à rebours arrive à zéro' },
            { key: 'sound', type: 'select', label: 'Son à zéro', default: '', options: 'soundCues', showIf: down,
              help: 'joué une fois, par une sortie (jamais l\'aperçu) ; volume et fichier : onglet Mixer de NodeCG' }
          ] }
      ] }
    ],
    /* t[<id>] = { run, acc, at, dur, cfg, done } — see server.js */
    state: { t: {} },
    vars: function (s, U) {
      var out = [];
      timers(s, U).forEach(function (t) {
        out.push({ name: t.id, label: t.label + ' : le temps affiché' },
                 { name: t.id + '_etat', label: t.label + ' : pret, en_cours, pause, fini' + (down(t) && t.end === 'over' ? ', depasse' : '') },
                 { name: t.id + '_s', label: t.label + ' : en secondes (' + (down(t) ? 'restantes, négatif en dépassement' : 'écoulées') + ')' },
                 { name: t.id + '_nom', label: t.label + ' : son nom' },
                 { name: t.id + '_sens', label: t.label + ' : down (compte à rebours) ou up' });
      });
      return out;
    },
    cmdHelp: function (s) {
      var list = timers(s, typeof GFXShared !== 'undefined' ? GFXShared : null), out = [];
      list.forEach(function (t) {
        out.push([t.id + '.toggle', t.label + ' : démarrer ou arrêter'], [t.id + '.start', 'démarrer'], [t.id + '.pause', 'arrêter'],
                 [t.id + '.reset', 'remettre à ' + (down(t) ? fmt(t.dur / 1000, t.format) : 'zéro')],
                 [t.id + '.restart', 'remettre à zéro et démarrer'],
                 [t.id + '.set.<durée>', down(t) ? 'nouvelle durée (05:00, 90s, 1h30)' : 'régler le temps écoulé', '05:00'],
                 [t.id + '.<±secondes>', down(t) ? 'ajouter ou retirer du temps' : 'avancer ou reculer', '+30']);
      });
      out.push(['all.pause', 'arrêter tous les minuteurs'], ['all.reset', 'tout remettre à zéro']);
      return out;
    },
    helpers: { parseDur: parseDur, parseDelta: parseDelta, fmt: fmt, timers: timers }
  };
});
