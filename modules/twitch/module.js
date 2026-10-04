/* Module "twitch" — a channel's chat, read live (anonymously: no account,
   no key, public messages only). The rundown lists the messages, and the
   questions (messages starting with a prefix such as !question) in a queue
   of their own; the operator puts the one they pick on air in the "Message
   du chat" graphic (chat.js). Nothing goes on air by itself, and a message
   the channel's moderators delete (or whose author they time out) leaves
   the screen at once.

   Read by the server (settings, server.js: the chat connection), the panel
   (settings, the message list) and the outputs (the graphic type). */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.GFXModules = root.GFXModules || {})[m.id] = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {
    id: 'twitch',
    label: 'Chat Twitch',
    icon: '✉',
    desc: 'Le chat d\'une chaîne Twitch, lu en direct sans compte : les messages et les questions (!question…) dans la régie, ' +
          'et celui que vous choisissez à l\'antenne dans le graphique « Message du chat ». Rien ne passe à l\'antenne tout seul.',
    graphics: { chat: 'chat.js' },
    css: ['chat.css'],
    panel: 'panel.js',
    panelWidth: 4,   /* its panel in NodeCG's dashboard (scripts/panels.js) */
    settings: [
      { title: 'Chaîne', fields: [
        { key: 'channel', type: 'text', label: 'Chaîne Twitch', default: '', placeholder: 'nom de la chaîne',
          help: 'lecture seule, sans compte : les messages publics du chat' }
      ] },
      { title: 'Messages', fields: [
        { key: 'prefix', type: 'text', label: 'Préfixe des questions', default: '!question',
          help: 'les messages qui commencent ainsi vont dans la file « Questions » ; vide : pas de file' },
        { key: 'hide', type: 'text', label: 'Mots à écarter', default: '', placeholder: 'mot1, mot2',
          help: 'un message qui en contient un n\'apparaît pas dans la régie' },
        { key: 'bots', type: 'text', label: 'Comptes ignorés', default: 'nightbot, streamelements, streamlabs, moobot, fossabot, wizebot' },
        { key: 'keep', type: 'number', label: 'Messages gardés', default: 80, min: 10, max: 500 },
        { key: 'autoOut', type: 'number', label: 'Un message reste à l\'antenne', default: 15, min: 0, max: 600, unit: 's',
          help: '0 : jusqu\'à ce qu\'on le retire' }
      ] }
    ],
    /* featured: the message on air (or last put on air): { id, user, login, color, text, badges } */
    state: { featured: null },
    vars: [
      { name: 'etat', label: 'connecte, connexion, deconnecte, erreur' }, { name: 'n', label: 'messages reçus depuis le lancement' },
      { name: 'dernier', label: 'le dernier message (pseudo : texte)' }, { name: 'dernier_pseudo', label: 'son auteur' }, { name: 'dernier_texte', label: 'son texte' },
      { name: 'questions', label: 'questions en attente' },
      { name: 'vedette', label: 'le message à l\'antenne (pseudo : texte)' }, { name: 'vedette_pseudo', label: 'son auteur' }, { name: 'vedette_texte', label: 'son texte' },
      { name: 'vedette_couleur', label: 'la couleur de son pseudo' }, { name: 'vedette_badge', label: 'modo, vip, abonné… ou vide' }
    ],
    cmdHelp: [
      ['show.last', 'le dernier message à l\'antenne'], ['show.question', 'la question suivante à l\'antenne'],
      ['hide', 'retirer le message de l\'antenne'], ['clear', 'vider les listes de la régie']
    ]
  };
});
