/* Module "score" — a match's score: two teams, their points, a second
   counter (sets, fouls…), the period, possession or service, a note ("Temps
   mort", "VAR"). The server keeps it; the panel's buttons and Companion
   change it; the "Tableau de score" graphic (scoreboard.js) shows it, and
   every value is a variable ({{score.a}}, {{score.ligne}}…) for the others.

   Read by the server (settings, variables, commands through server.js),
   the panel and the outputs (the graphic type). */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.GFXModules = root.GFXModules || {})[m.id] = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* period names: [singular, feminine?] */
  var PERIODS = {
    'mi-temps': ['mi-temps', true], periode: ['période', true], 'quart-temps': ['quart-temps', false],
    'tiers-temps': ['tiers-temps', false], set: ['set', false], manche: ['manche', true], round: ['round', false], jeu: ['jeu', false]
  };
  /* "1re mi-temps", "2e période", "1er set", "Prolongation" */
  function periodLabel(s, n) {
    var p = PERIODS[s.period];
    if (!p || !(n >= 1)) return '';
    var count = Math.max(1, +s.periods || 2);
    if (n > count) return n - count > 1 ? 'Prolongation ' + (n - count) : 'Prolongation';
    return (n === 1 ? (p[1] ? '1re' : '1er') : n + 'e') + ' ' + p[0];
  }
  /* "1" or "1,2,3" → [1, 2, 3] */
  function steps(s) {
    var out = String(s.steps || '1').split(/[,; ]+/).map(function (x) { return parseInt(x, 10); })
      .filter(function (x) { return x > 0 && x < 100; });
    return out.length ? out.slice(0, 4) : [1];
  }

  return {
    id: 'score',
    label: 'Tableau de score',
    icon: '⚑',
    desc: 'Le score d\'un match : deux équipes, leurs points, un second compteur (sets, fautes…), la période, ' +
          'la possession ou le service, une note (« Temps mort »). Avec son graphique « Tableau de score », ' +
          'et des variables ({{score.a}}, {{score.ligne}}…) pour les autres.',
    graphics: { scoreboard: 'scoreboard.js' },
    css: ['scoreboard.css'],
    panel: 'panel.js',
    settings: [
      { title: 'Équipes', fields: [
        { key: 'a.name', type: 'text', label: 'Équipe 1', default: 'Domicile' },
        { key: 'a.short', type: 'text', label: 'Abréviation', default: 'DOM', help: 'trois ou quatre lettres, pour le tableau compact' },
        { key: 'a.color', type: 'color', label: 'Couleur', default: '#E1000F' },
        { key: 'a.logo', type: 'media', accept: 'image', label: 'Logo', default: '' },
        { key: 'b.name', type: 'text', label: 'Équipe 2', default: 'Extérieur' },
        { key: 'b.short', type: 'text', label: 'Abréviation', default: 'EXT' },
        { key: 'b.color', type: 'color', label: 'Couleur', default: '#2A5BD7' },
        { key: 'b.logo', type: 'media', accept: 'image', label: 'Logo', default: '' }
      ] },
      { title: 'Match', fields: [
        { key: 'period', type: 'select', label: 'Périodes', default: 'mi-temps',
          options: [['mi-temps', 'mi-temps'], ['periode', 'périodes'], ['quart-temps', 'quart-temps'], ['tiers-temps', 'tiers-temps'],
                    ['set', 'sets'], ['manche', 'manches'], ['round', 'rounds'], ['jeu', 'jeux'], ['aucune', 'aucune']] },
        { key: 'periods', type: 'number', label: 'Combien', default: 2, min: 1, max: 12, help: 'au-delà : « Prolongation »' },
        { key: 'steps', type: 'text', label: 'Boutons de points', default: '1', placeholder: '1 ou 1,2,3', help: 'les ajouts proposés dans la régie (basket : 1,2,3)' },
        { key: 'second', type: 'text', label: 'Second compteur', default: '', placeholder: 'Sets, Fautes…', help: 'vide : aucun' },
        { key: 'announce', type: 'text', label: 'Annonce à chaque point', default: '', placeholder: 'But !',
          help: 'un message dans le flash du projet quand une équipe marque ; vide : aucune' }
      ] }
    ],
    state: { a: 0, b: 0, a2: 0, b2: 0, period: 1, poss: '', note: '' },
    vars: [
      { name: 'a', label: 'points de l\'équipe 1' }, { name: 'b', label: 'points de l\'équipe 2' },
      { name: 'a_nom', label: 'nom de l\'équipe 1' }, { name: 'b_nom', label: 'nom de l\'équipe 2' },
      { name: 'a_court', label: 'abréviation de l\'équipe 1' }, { name: 'b_court', label: 'abréviation de l\'équipe 2' },
      { name: 'score', label: 'le score (2 – 1)' }, { name: 'ligne', label: 'la ligne entière (Domicile 2 – 1 Extérieur)' },
      { name: 'mene', label: 'qui mène (Domicile mène, Égalité)' },
      { name: 'periode', label: 'la période (2e mi-temps)' }, { name: 'periode_n', label: 'son numéro' },
      { name: 'a2', label: 'second compteur de l\'équipe 1' }, { name: 'b2', label: 'second compteur de l\'équipe 2' },
      { name: 'poss', label: 'possession ou service : a, b ou vide' }, { name: 'note', label: 'la note (Temps mort…)' },
      { name: 'a_couleur', label: 'couleur de l\'équipe 1' }, { name: 'b_couleur', label: 'couleur de l\'équipe 2' },
      { name: 'a_logo', label: 'logo de l\'équipe 1' }, { name: 'b_logo', label: 'logo de l\'équipe 2' }
    ],
    cmdHelp: [
      ['a.+1', 'un point pour l\'équipe 1'], ['a.-1', 'un point de moins'], ['a.set.<n>', 'régler le score de l\'équipe 1', '3'],
      ['b.+1', 'un point pour l\'équipe 2'], ['b.-1', 'un point de moins'], ['b.set.<n>', 'régler le score de l\'équipe 2', '2'],
      ['a2.+1', 'second compteur, équipe 1'], ['b2.+1', 'second compteur, équipe 2'],
      ['period.next', 'période suivante'], ['period.prev', 'période précédente'], ['period.set.<n>', 'aller à la période n', '2'],
      ['poss.a', 'possession / service : équipe 1'], ['poss.b', 'équipe 2'], ['poss.toggle', 'changer'], ['poss.none', 'personne'],
      ['note.<texte>', 'afficher une note', 'Temps mort'], ['note.clear', 'effacer la note'],
      ['reset', 'tout remettre à zéro']
    ],
    helpers: { periodLabel: periodLabel, steps: steps }
  };
});
