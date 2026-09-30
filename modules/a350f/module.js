/* Module "a350f" — the first flight of the Airbus A350F tracked live over
   ADS-B: the first-flight overlay of September 2026 (and its relay), on the
   overlay engine.

   Read by the server (settings, commands, the old Companion event key), the
   panel and the output (client.js). The operator's controls — reschedule,
   mark the take-off, own headline, neutral wording, units — live on the
   server now (the module's state), so every browser source follows them at
   once. server.js is the relay (ADS-B, recording, weather), unchanged. */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.GFXModules = root.GFXModules || {})[m.id] = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function T0(s, U, tz) { return U.parseWhen((s.date || '2026-09-29') + 'T' + (s.t0 || '10:30'), tz); }
  function sched(st, s, U, tz) { return st.t0 || T0(s, U, tz); }
  function takeoff(st, s, vars, U, tz) {
    return st.takeoff || (s.takeoff ? U.parseWhen(s.takeoff, tz, s.date) : null) || (vars && +vars._takeoff) || null;
  }
  function land(st, s, vars, U, tz) {
    if (st.land) return st.land;
    var dur = (+s.dur || 0) * 60000;
    if (dur) return (takeoff(st, s, vars, U, tz) || sched(st, s, U, tz)) + dur;
    return U.parseWhen(s.date + 'T' + (s.land || '14:05'), tz);
  }
  return {
    id: 'a350f',
    label: 'Premier vol A350F',
    desc: 'Le vol suivi en direct par ADS-B (adsb.lol, adsb.fi, par le relais intégré au serveur) : phases, jalons, ' +
          'altitude, vitesse, position en mots, météo de Toulouse ; visuels « carte en direct » et « profil de vol », ' +
          'colonnes « données de vol » et « bilan ».',
    legacyKeys: ['a350f'],
    client: ['places.js', 'client.js'],
    css: ['client.css'],
    panel: 'panel.js',
    visuals: {
      map: { label: 'Carte en direct' },
      profile: { label: 'Profil de vol (altitude, vitesse)' }
    },
    columns: {
      telemetry: { label: 'Données de vol', layouts: ['full'] },
      recap: { label: 'Bilan du vol', layouts: ['recap'] }
    },
    views: {
      map: { label: 'Cadrage de la carte', values: ['track', 'follow'], labels: ['Tout le trajet', 'Suivre l\'avion'], default: 'track' }
    },
    settings: [
      { title: 'Avion', fields: [
        { key: 'reg', type: 'text', label: 'Immatriculation', default: 'F-WXLD' },
        { key: 'hex', type: 'text', label: 'Adresse mode S', default: '39a53b', help: 'suivie aussi par immatriculation, au cas où elle changerait' },
        { key: 'callsign', type: 'text', label: 'Indicatif', default: '', placeholder: 'facultatif' },
        { key: 'msn', type: 'text', label: 'Numéro de série (MSN)', default: '700' }
      ] },
      { title: 'Horaires', fields: [
        { key: 'date', type: 'text', label: 'Jour du vol', default: '2026-09-29', placeholder: 'AAAA-MM-JJ' },
        { key: 't0', type: 'text', label: 'Décollage prévu', default: '10:30', placeholder: 'HH:MM' },
        { key: 'land', type: 'text', label: 'Atterrissage prévu', default: '14:05', placeholder: 'HH:MM' },
        { key: 'dur', type: 'number', label: 'ou durée prévue', default: '', min: 10, max: 1440, unit: 'min', placeholder: '—',
          help: 'remplace l\'heure d\'atterrissage : durée après le décollage' },
        { key: 'takeoff', type: 'text', label: 'Décollage réel (si manqué)', default: '', placeholder: 'HH:MM[:SS]',
          help: 'quand ni la page ni le relais n\'ont vu l\'avion quitter le sol' }
      ] },
      { title: 'Données', fields: [
        { key: 'relay', type: 'text', label: 'Relais ADS-B', default: '', placeholder: 'intégré à ce serveur',
          help: 'vide : le relais de ce serveur ; ou l\'adresse du bundle sur une autre machine qui suit le même avion (par ex. http://192.168.1.20:9090/bundles/EclipseGraphics)' },
        { key: 'poll', type: 'number', label: 'Interroger le relais toutes les', default: 2, min: 1, max: 30, unit: 's' }
      ] },
      { title: 'Carte', fields: [
        { key: 'tiles', type: 'text', label: 'Fond de carte', default: '', placeholder: 'OpenStreetMap',
          help: 'modèle {z}/{x}/{y} ({s} → a–d, {r} → @2x), ou none' },
        { key: 'tilestyle', type: 'select', label: 'Teinte du fond', default: 'auto',
          options: [['auto', 'automatique'], ['invert', 'inversé (carte claire)'], ['tint', 'teinté (carte sombre)'], ['raw', 'tel quel']] },
        { key: 'attrib', type: 'text', label: 'Crédit du fond', default: '', placeholder: '© les contributeurs d\'OpenStreetMap' }
      ] },
      { title: 'Affichage', fields: [
        { key: 'units', type: 'select', label: 'Unités par défaut', default: 'aviation', options: [['aviation', 'ft · kt'], ['metric', 'm · km/h']] },
        { key: 'recap', type: 'select', label: 'Bilan', default: 'manual',
          options: [['manual', 'à la demande'], ['auto', 'automatique, 3 min après l\'atterrissage (plein écran à l\'antenne)']] }
      ] },
      { title: 'Liens', fields: [
        { key: 'graphic', type: 'select', label: 'Bandeau du vol', default: '', options: 'graphics:bandeau',
          help: 'celui que pilotent les commandes {"a350f": …} ; automatique : le bandeau qui montre la carte' },
        { key: 'flash', type: 'select', label: 'Flash des événements', default: '', options: 'graphics:flash' }
      ] },
      { title: 'Démo', fields: [
        { key: 'demo', type: 'toggle', label: 'Démo : un premier vol de synthèse', default: false,
          help: 'roulage, décollage de la 32L, boucle au-dessus de l\'Atlantique et le long des Pyrénées, retour' },
        { key: 'speed', type: 'number', label: 'Vitesse de la démo', default: 30, min: 1, max: 600, unit: '×' },
        { key: 'from', type: 'number', label: 'Départ de la démo', default: -8, min: -120, max: 600, unit: 'min / décollage prévu' },
        { key: 'squawk', type: 'text', label: 'Transpondeur simulé', default: '', placeholder: '7700', help: 'pour répéter le ton neutre' }
      ] }
    ],
    /* the operator's controls (the old overlay's localStorage "ctl") */
    state: { t0: null, takeoff: null, land: null, headline: '', mode: 'auto', units: null, demoAnchor: 0, resetAt: 0 },
    onSettings: function (s, st) {
      if (s.demo && !st.demoAnchor) { st.demoAnchor = Date.now(); return true; }
      if (!s.demo && st.demoAnchor) { st.demoAnchor = 0; return true; }
      return false;
    },
    /* The flight's clock: the demo's when it runs, shared by every output */
    now: function (s, st, U, tz) {
      if (!s.demo) return Date.now();
      return T0(s, U, tz) + (+s.from || 0) * 60000 + (Date.now() - (st.demoAnchor || Date.now())) * (+s.speed || 30);
    },
    helpers: { T0: T0, sched: sched, takeoff: takeoff, land: land },
    /* t0.HH:MM | t0.+N | t0.-N | t0.reset          scheduled take-off
       land.HH:MM | land.+N | land.-N | land.reset  planned landing
       takeoff.now | takeoff.HH:MM[:SS] | takeoff.auto   actual take-off
       headline.<text> | headline.set (+ text) | headline.auto
       mode.neutral | mode.auto | mode.toggle        factual wording only
       units.metric | units.aviation | units.toggle
       reset: forget the outputs' stored track (the relay's recording stays)
       demo.restart
     (banner.* goes to the flash, air/layout/main/card/map.* to the bandeau) */
    commands: {
      t0: function (v, c) {
        var U = c.U, st = c.state;
        if (v === 'reset') st.t0 = null;
        else if (/^[+-]\d+$/.test(v)) st.t0 = sched(st, c.settings, U, c.tz) + parseInt(v, 10) * 60000;
        else { var t = c.when(v); if (t == null) return false; st.t0 = t; }
      },
      land: function (v, c) {
        var U = c.U, st = c.state;
        if (v === 'reset') st.land = null;
        else if (/^[+-]\d+$/.test(v)) st.land = land(st, c.settings, c.vars, U, c.tz) + parseInt(v, 10) * 60000;
        else { var t = c.when(v); if (t == null) return false; st.land = t; }
      },
      takeoff: function (v, c) {
        if (v === 'auto') c.state.takeoff = null;
        else if (v === 'now') c.state.takeoff = c.now();
        else { var t = c.when(v); if (t == null) return false; c.state.takeoff = t; }
      },
      headline: function (v, c) {
        if (v === 'auto') c.state.headline = '';
        else c.state.headline = String(v === 'set' ? c.text || '' : v).trim().slice(0, 90);
      },
      mode: function (v, c) {
        if (v === 'toggle') v = c.state.mode === 'neutral' ? 'auto' : 'neutral';
        if (v !== 'neutral' && v !== 'auto') return false;
        c.state.mode = v;
      },
      units: function (v, c) {
        if (v === 'toggle') v = (c.state.units || c.settings.units) === 'metric' ? 'aviation' : 'metric';
        if (v !== 'metric' && v !== 'aviation') return false;
        c.state.units = v;
      },
      reset: function (v, c) { c.state.resetAt = Date.now(); },
      demo: function (v, c) { if (v !== 'restart') return false; c.state.demoAnchor = Date.now(); c.state.resetAt = Date.now(); }
    },
    /* what the server tells Companion from the state alone */
    stateVars: function (st, s) {
      return { mode: st.mode || 'auto', units: st.units || s.units || 'aviation', headline: st.headline ? 'custom' : 'auto' };
    },
    vars: [
      { name: 'title', label: 'titre automatique (ou celui de l\'opérateur)' },
      { name: 'timer_label', label: 'libellé du minuteur' }, { name: 'timer', label: 'minuteur (01:23:45)' },
      { name: 'time', label: 'minuteur arrondi (1 h 23)' }, { name: 'label', label: 'libellé en clair' },
      { name: 'status', label: 'titre en clair' }, { name: 'phase', label: 'phase du vol' },
      { name: 's_alt', label: 'bande : altitude' }, { name: 's_spd', label: 'bande : vitesse' },
      { name: 's_info', label: 'bande : variomètre, cap, position' }, { name: 's_id', label: 'bande plein écran : MSN, aéroport' },
      { name: 'badge', label: 'pastille (En direct, Signal interrompu…)' }, { name: 'badge_idle', label: 'non vide quand le signal manque' },
      { name: 'reg', label: 'immatriculation' }, { name: 'where', label: 'position en mots' },
      { name: 'alt', label: 'altitude' }, { name: 'alt_m', label: 'altitude en mètres' }, { name: 'speed', label: 'vitesse sol' },
      { name: 'speed_kmh', label: 'vitesse en km/h' }, { name: 'vs', label: 'vitesse verticale' }, { name: 'hdg', label: 'cap' },
      { name: 'dist', label: 'distance de Toulouse' }, { name: 'alert', label: 'alerte transpondeur' },
      { name: 'signal', label: 'live, stale ou none' }, { name: 'source', label: 'API qui a répondu' },
      { name: 'event', label: 'dernier événement annoncé' }, { name: 'event_text', label: 'son texte' }, { name: 'event_n', label: 'combien jusqu\'ici' },
      { name: 't_sched', label: 'décollage prévu' }, { name: 't_land', label: 'atterrissage prévu' },
      { name: 't_takeoff', label: 'décollage réel' }, { name: 't_landing', label: 'atterrissage réel' },
      { name: 'alt_max', label: 'altitude max' }, { name: 'speed_max', label: 'vitesse max' }, { name: 'distance', label: 'distance parcourue' },
      { name: 'callsign', label: 'indicatif' }, { name: 'clock', label: 'heure (celle de la démo en démo)', screen: true },
      { name: 'ticker', label: 'séries du défilant (liste)' }, { name: 'progress', label: 'avancement du vol (0 à 1)' },
      { name: 'marks', label: 'repères horaires de la ligne' }
    ]
  };
});
