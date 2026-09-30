/* Module "meteo" — the weather where you are, from Open-Meteo
   (https://open-meteo.com, free, no key; data CC BY 4.0): the server asks
   every few minutes and turns the answer into variables ({{meteo.temp}},
   {{meteo.ciel}}…), ticker lists, a visual for the bandeau and a corner
   graphic ("Météo", widget.js).

   Read by the server (settings, server.js), the panel (settings, place
   search) and the outputs (client.js: the drawings; widget.js: the graphic). */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.GFXModules = root.GFXModules || {})[m.id] = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* WMO weather codes → [French, icon, French at night] */
  var CODES = {
    0: ['Ciel dégagé', 'sun', 'Nuit claire'], 1: ['Plutôt ensoleillé', 'sun', 'Nuit peu nuageuse'],
    2: ['Partiellement nuageux', 'partly'], 3: ['Couvert', 'cloud'],
    45: ['Brouillard', 'fog'], 48: ['Brouillard givrant', 'fog'],
    51: ['Bruine légère', 'drizzle'], 53: ['Bruine', 'drizzle'], 55: ['Bruine forte', 'drizzle'],
    56: ['Bruine verglaçante', 'drizzle'], 57: ['Bruine verglaçante', 'drizzle'],
    61: ['Pluie faible', 'rain'], 63: ['Pluie', 'rain'], 65: ['Forte pluie', 'rain'],
    66: ['Pluie verglaçante', 'rain'], 67: ['Pluie verglaçante', 'rain'],
    71: ['Neige faible', 'snow'], 73: ['Neige', 'snow'], 75: ['Forte neige', 'snow'], 77: ['Grains de neige', 'snow'],
    80: ['Averses', 'showers'], 81: ['Averses', 'showers'], 82: ['Fortes averses', 'showers'],
    85: ['Averses de neige', 'snow'], 86: ['Fortes averses de neige', 'snow'],
    95: ['Orage', 'storm'], 96: ['Orage avec grêle', 'storm'], 99: ['Orage avec grêle', 'storm']
  };
  function sky(code, day) {
    var c = CODES[code] || ['—', 'cloud'];
    var icon = c[1];
    if (!day && icon === 'sun') icon = 'moon';
    if (!day && icon === 'partly') icon = 'partlyNight';
    return { text: !day && c[2] ? c[2] : c[0], icon: icon };
  }

  return {
    id: 'meteo',
    label: 'Météo',
    icon: '☀',
    desc: 'Le temps qu\'il fait et les jours suivants, d\'Open-Meteo (gratuit, sans clé) : variables ({{meteo.temp}}, ' +
          '{{meteo.ciel}}…) pour tous les textes, listes pour les défilants, un visuel pour le bandeau et un graphique « Météo » en coin.',
    client: ['client.js'],
    css: ['meteo.css'],
    graphics: { meteo: 'widget.js' },
    panel: 'panel.js',
    visuals: { now: { label: 'Météo : le temps qu\'il fait, et les jours suivants en grand' } },
    settings: [
      { title: 'Lieu', fields: [
        { key: 'place', type: 'text', label: 'Nom affiché', default: 'Toulouse' },
        { key: 'lat', type: 'number', label: 'Latitude', default: 43.6043, step: 0.0001, min: -90, max: 90, unit: '°' },
        { key: 'lon', type: 'number', label: 'Longitude', default: 1.4437, step: 0.0001, min: -180, max: 180, unit: '°',
          help: 'cherchez une ville ci-dessus pour les remplir' }
      ] },
      { title: 'Unités', fields: [
        { key: 'temp', type: 'select', label: 'Température', default: 'celsius', options: [['celsius', '°C'], ['fahrenheit', '°F']] },
        { key: 'wind', type: 'select', label: 'Vent', default: 'kmh', options: [['kmh', 'km/h'], ['ms', 'm/s'], ['kn', 'nœuds'], ['mph', 'mph']] }
      ] },
      { title: 'Données', fields: [
        { key: 'every', type: 'number', label: 'Mise à jour toutes les', default: 15, min: 5, max: 180, unit: 'min' },
        { key: 'api', type: 'text', label: 'Adresse du service', default: '', placeholder: 'https://api.open-meteo.com',
          help: 'vide : le service gratuit ; ou une offre payante (customer-api.open-meteo.com), ou votre propre serveur Open-Meteo' },
        { key: 'apikey', type: 'text', label: 'Clé d\'API', default: '', placeholder: 'offre payante seulement',
          help: 'enregistrée dans le fichier du projet (versionné) : préférez la variable d\'environnement OPEN_METEO_APIKEY' }
      ] }
    ],
    vars: [
      { name: 'lieu', label: 'le lieu' }, { name: 'temp', label: 'température (18 °C)' }, { name: 'temp_n', label: 'température, le nombre (18)' },
      { name: 'ressenti', label: 'température ressentie' }, { name: 'ciel', label: 'le temps en clair (Partiellement nuageux)' },
      { name: 'resume', label: '18 °C, partiellement nuageux' }, { name: 'icone', label: 'l\'icône : sun, moon, partly, cloud, fog, drizzle, rain, showers, snow, storm' },
      { name: 'vent', label: 'vent moyen (12 km/h)' }, { name: 'vent_dir', label: 'sa direction (O)' }, { name: 'vent_txt', label: 'vent d\'ouest, 12 km/h' },
      { name: 'rafales', label: 'rafales' }, { name: 'humidite', label: 'humidité' }, { name: 'pluie', label: 'risque de pluie aujourd\'hui (40 %)' },
      { name: 'min', label: 'minimale du jour' }, { name: 'max', label: 'maximale du jour' },
      { name: 'lever', label: 'lever du soleil' }, { name: 'coucher', label: 'coucher du soleil' },
      { name: 'demain', label: 'demain en clair (averses, 11 à 17 °C)' }, { name: 'j1', label: 'demain : jour, temps, températures' },
      { name: 'j2', label: 'après-demain' }, { name: 'j3', label: 'dans trois jours' },
      { name: 'maj', label: 'heure de la dernière mise à jour' }, { name: 'etat', label: 'ok ou erreur' },
      { name: 'messages', label: 'phrases pour le défilant (liste)' }, { name: 'ticker', label: 'segments pour le défilant du bandeau (liste)' }
    ],
    cmdHelp: [['refresh', 'mettre à jour tout de suite']],
    helpers: { CODES: CODES, sky: sky }
  };
});
