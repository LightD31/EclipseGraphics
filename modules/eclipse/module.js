/* Module "eclipse" — a solar eclipse seen from one place, computed live
   with the Astronomy Engine (astronomy.browser.min.js, in this folder): the
   eclipse broadcast overlay of August 2026, on the overlay engine.

   Read by the server (settings, commands, the old Companion event keys),
   the panel (settings form, variable list) and the output (client.js). */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.GFXModules = root.GFXModules || {})[m.id] = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {
    id: 'eclipse',
    label: 'Éclipse solaire',
    desc: 'Circonstances locales d\'une éclipse de Soleil, calculées en direct : phase, obscuration, contacts, ' +
          'position du Soleil ; visuels « ciel » (trajectoires du Soleil et de la Lune) et « taille réelle ».',
    /* {"eclipse": "air.on"} (and the older {"eclipseLowerThird": …}) from
       Companion's OBS custom events still land here */
    legacyKeys: ['eclipse', 'eclipseLowerThird'],
    client: ['astronomy.browser.min.js', 'client.js'],
    css: ['client.css'],
    panel: 'panel.js',
    visuals: {
      sky: { label: 'Ciel : le Soleil et la Lune sur leurs trajectoires' },
      real: { label: 'Taille réelle : les deux disques à l\'échelle' }
    },
    settings: [
      { title: 'Lieu', fields: [
        { key: 'site', type: 'text', label: 'Nom du lieu', default: 'Thonac (Dordogne)', help: 'affiché dans la bande d\'info ({{eclipse.site}})' },
        { key: 'lat', type: 'number', label: 'Latitude', default: 48.8566, step: 0.0001, min: -90, max: 90, unit: '°',
          help: 'par défaut Paris, un lieu public : le fichier du projet est versionné, gardez-y des coordonnées publiables' },
        { key: 'lon', type: 'number', label: 'Longitude', default: 2.3522, step: 0.0001, min: -180, max: 180, unit: '°' },
        { key: 'alt', type: 'number', label: 'Altitude', default: 35, min: -400, max: 9000, unit: 'm' },
        { key: 'search', type: 'text', label: 'Éclipse cherchée à partir du', default: '2026-08-01', placeholder: 'AAAA-MM-JJ',
          help: 'la première éclipse visible du lieu après cette date' }
      ] },
      { title: 'Liens', fields: [
        { key: 'graphic', type: 'select', label: 'Bandeau de l\'éclipse', default: '', options: 'graphics:bandeau',
          help: 'celui que pilotent les commandes {"eclipse": …} ; automatique : le bandeau qui montre le ciel' }
      ] },
      { title: 'Démo', fields: [
        { key: 'demo', type: 'toggle', label: 'Démo : l\'éclipse en accéléré', default: false,
          help: 'part de 3 minutes avant le premier contact ; toutes les sorties jouent le même moment' },
        { key: 'speed', type: 'number', label: 'Vitesse de la démo', default: 120, min: 1, max: 3600, unit: '×' }
      ] }
    ],
    state: { demoAnchor: 0 },
    /* The demo clock is shared: set when the demo is switched on */
    onSettings: function (s, st) {
      if (s.demo && !st.demoAnchor) { st.demoAnchor = Date.now(); return true; }
      if (!s.demo && st.demoAnchor) { st.demoAnchor = 0; return true; }
      return false;
    },
    commands: {
      /* demo.restart: the demo from its start again */
      demo: function (v, ctx) {
        if (v !== 'restart') return false;
        ctx.state.demoAnchor = Date.now();
      }
    },
    vars: [
      { name: 'status', label: 'phase en clair (« Éclipse en cours »)' },
      { name: 'timer_label', label: 'libellé du compte à rebours' },
      { name: 'countdown', label: 'compte à rebours (00:13:41)' },
      { name: 'obsc', label: 'obscuration pour l\'écran (42,7%)' },
      { name: 'pct', label: 'obscuration (42,7 %)' },
      { name: 'obscuration', label: 'obscuration brute (42.7)' },
      { name: 'sunpos', label: 'position du Soleil pour l\'écran' },
      { name: 'sun', label: 'position du Soleil en clair' },
      { name: 'site', label: 'nom du lieu' },
      { name: 'phase', label: 'phase (attente, en_cours, max_passe, sous_horizon, terminee)' },
      { name: 'next', label: 'prochaine étape (« maximum dans »)' },
      { name: 'eta', label: 'dans combien de temps (« 24 min »)' },
      { name: 'pct_max', label: 'obscuration maximale' },
      { name: 't_c1', label: 'premier contact (HH:MM)' }, { name: 't_max', label: 'maximum (HH:MM)' },
      { name: 't_sunset', label: 'coucher du Soleil (HH:MM)' }, { name: 't_c4', label: 'dernier contact (HH:MM)' },
      { name: 'clock', label: 'heure (celle de la démo en démo)', screen: true },
      { name: 'ticker', label: 'segments du défilant (liste)' },
      { name: 'progress', label: 'avancement de l\'éclipse (0 à 1)' },
      { name: 'marks', label: 'repères de la ligne : maximum, coucher' }
    ]
  };
});
