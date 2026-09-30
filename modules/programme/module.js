/* Module "programme" — the running order: what's on now, what's next and in
   how long, what comes after. From a list of times and titles, today (a time
   earlier than the one before it is tomorrow's: a night that runs past
   midnight). Live, the operator can take over (go to an item, next,
   previous) and shift everything when the show runs late. Variables:
   {{programme.titre}}, {{programme.suivant}}, {{programme.suivant_dans}}…

   Read by the server (settings, server.js) and the panel (settings, live
   controls). */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.GFXModules = root.GFXModules || {})[m.id] = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {
    id: 'programme',
    label: 'Programme',
    icon: '☰',
    desc: 'Le conducteur : ce qui passe, ce qui suit et dans combien de temps — à l\'écran avec le graphique « À suivre », ' +
          'ou dans le défilant et le bandeau. En direct : aller à un sujet, suivant, précédent, et tout décaler quand on prend du retard.',
    panel: 'panel.js',
    /* its own graphic: what's next (or on now), anywhere on screen */
    graphics: { suivant: 'suivant.js' },
    css: ['suivant.css'],
    settings: [
      { title: 'Programme', open: true, fields: [
        { key: 'items', type: 'list', label: 'Sujets', add: 'Ajouter un sujet', itemLabel: '{{time}} {{title}}',
          default: [{ time: '20:00', title: 'Ouverture', sub: '' }, { time: '20:15', title: 'Premier sujet', sub: '' }, { time: '21:00', title: 'Le débat', sub: '' }],
          item: [
            { key: 'time', type: 'text', label: 'Heure', default: '', placeholder: 'HH:MM' },
            { key: 'title', type: 'text', label: 'Titre', default: '' },
            { key: 'sub', type: 'text', label: 'Précision', default: '', placeholder: 'avec…, en direct de…' }
          ] },
        { key: 'upcoming', type: 'number', label: 'Sujets à venir dans les listes', default: 3, min: 1, max: 12 },
        { key: 'nextLabel', type: 'text', label: 'Libellé « à suivre »', default: 'À suivre' }
      ] }
    ],
    /* manual: the item on now when the operator took over (null: by the clock); shift: minutes of delay */
    state: { manual: null, shift: 0 },
    vars: [
      { name: 'titre', label: 'ce qui passe' }, { name: 'sous', label: 'sa précision' }, { name: 'heure', label: 'son heure' },
      { name: 'suivant', label: 'ce qui suit' }, { name: 'suivant_sous', label: 'sa précision' }, { name: 'suivant_heure', label: 'son heure (décalage compris)' },
      { name: 'suivant_dans', label: 'dans combien de temps (12 min)' }, { name: 'suivant_rebours', label: 'compte à rebours (00:12:34)' },
      { name: 'apres', label: 'le sujet d\'après' }, { name: 'position', label: 'où on en est (3/8)' },
      { name: 'etat', label: 'avant, en_cours, dernier (le dernier sujet a commencé)' }, { name: 'mode', label: 'auto ou manuel' }, { name: 'retard', label: 'le décalage (+10 min)' },
      { name: 'liste', label: 'les sujets à venir, « 21:00 · Le débat » (liste, pour un défilant)' },
      { name: 'ticker', label: 'les sujets à venir en segments (liste, pour le défilant du bandeau)' }
    ],
    cmdHelp: [
      ['next', 'sujet suivant (prise en main)'], ['prev', 'sujet précédent'], ['go.<n>', 'aller au sujet n', '3'],
      ['auto', 'revenir à l\'horaire'], ['shift.+5', 'décaler la suite de 5 minutes'], ['shift.-5', 'avancer de 5 minutes'], ['shift.0', 'plus de décalage']
    ]
  };
});
