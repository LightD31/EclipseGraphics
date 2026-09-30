/* Module "flux" — outside data as variables: an RSS or Atom feed (news
   headlines for a ticker), a JSON API (a price, a counter, a result), a CSV
   file (a Google Sheets sheet published as CSV: a team's line-up, a
   programme), or plain text. The server fetches each source every few
   minutes (browsers can't read most of them: no CORS) and turns it into
   variables: {{flux.<source>}}, {{flux.<source>_liste}}, named fields…

   Read by the server (settings, server.js) and the panel (settings, the
   sources' health). */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.GFXModules = root.GFXModules || {})[m.id] = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function sources(s, U) {
    var out = [], seen = {};
    (s && Array.isArray(s.sources) ? s.sources : []).forEach(function (x, i) {
      x = x || {};
      var base = (U ? U.slug(x.id || '') : '') || 'source' + (i + 1), id = base, n = 2;
      while (seen[id]) id = base + '_' + n++;
      seen[id] = true;
      out.push({
        id: id, kind: ['rss', 'json', 'csv', 'text'].indexOf(x.kind) >= 0 ? x.kind : 'rss', url: String(x.url || '').trim(),
        every: Math.max(15, +x.every || 300), max: Math.max(1, Math.min(100, +x.max || 10)),
        item: String(x.item || ''), list: String(x.list || '').trim(),
        fields: (Array.isArray(x.fields) ? x.fields : []).map(function (f) {
          return { name: U ? U.slug(f && f.name || '') : String(f && f.name || ''), path: String(f && f.path || '').trim() };
        }).filter(function (f) { return f.name && f.path; })
      });
    });
    return out;
  }
  function kind(k) { return function (x) { return (x.kind || 'rss') === k; }; }
  function notText(x) { return (x.kind || 'rss') !== 'text'; }

  return {
    id: 'flux',
    label: 'Flux de données',
    icon: '≋',
    desc: 'Des données du dehors en variables : un flux RSS ou Atom (les titres d\'un site pour un défilant), une API JSON ' +
          '(un prix, un compteur, un résultat), un fichier CSV (une feuille Google Sheets publiée en CSV), ou du texte. ' +
          'Le serveur va les chercher régulièrement.',
    panel: 'panel.js',
    settings: [
      { title: 'Sources', open: true, fields: [
        { key: 'sources', type: 'list', label: 'Sources', add: 'Ajouter une source', itemLabel: '{{id}}',
          default: [],
          item: [
            { key: 'id', type: 'text', label: 'Identifiant', default: 'actus', help: 'le nom des variables : {{flux.actus}}, {{flux.actus_liste}}…' },
            { key: 'kind', type: 'select', label: 'Format', default: 'rss',
              options: [['rss', 'RSS ou Atom'], ['json', 'JSON'], ['csv', 'CSV (Google Sheets publié en CSV…)'], ['text', 'Texte (une ligne par élément)']] },
            { key: 'url', type: 'text', label: 'Adresse', default: '', placeholder: 'https://… ou /media/fichier.csv',
              help: 'une adresse web, ou un fichier de la médiathèque (onglet Réglages) : /media/nom.csv' },
            { key: 'every', type: 'number', label: 'Toutes les', default: 300, min: 15, max: 86400, unit: 's' },
            { key: 'max', type: 'number', label: 'Éléments gardés', default: 10, min: 1, max: 100 },
            { key: 'list', type: 'text', label: 'Chemin de la liste', default: '', placeholder: 'articles, data.items…', showIf: kind('json'),
              help: 'où est la liste dans la réponse ; vide : la réponse elle-même si c\'est une liste' },
            { key: 'item', type: 'text', label: 'Modèle d\'un élément', default: '', showIf: notText,
              placeholder: '{{title}}', help: 'RSS : {{title}}, {{description}}, {{date}}, {{author}} ; JSON et CSV : les champs ou colonnes, {{nom}} ; vide : le titre, ou le premier champ' },
            { key: 'fields', type: 'list', label: 'Valeurs nommées', add: 'Ajouter une valeur', itemLabel: '{{name}}', default: [], showIf: notText,
              item: [
                { key: 'name', type: 'text', label: 'Nom', default: 'valeur', help: 'variable {{flux.<source>_<nom>}}' },
                { key: 'path', type: 'text', label: 'Chemin', default: '', placeholder: 'data.price · 2.Score · Score',
                  help: 'JSON : chemin dans la réponse ; CSV : colonne (de la première ligne) ou ligne.colonne ; RSS : 0.title' }
              ] }
          ] }
      ] }
    ],
    vars: function (s, U) {
      var out = [];
      sources(s, U).forEach(function (x) {
        out.push({ name: x.id, label: 'le premier élément' }, { name: x.id + '_liste', label: 'tous les éléments (liste, pour un défilant)' },
                 { name: x.id + '_n', label: 'combien' }, { name: x.id + '_maj', label: 'heure de la dernière lecture' },
                 { name: x.id + '_etat', label: 'ok ou erreur' });
        x.fields.forEach(function (f) { out.push({ name: x.id + '_' + f.name, label: f.path }); });
      });
      return out;
    },
    cmdHelp: [['refresh', 'relire toutes les sources tout de suite'], ['refresh.<source>', 'relire une source', 'actus']],
    helpers: { sources: sources }
  };
});
