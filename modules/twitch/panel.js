/* Module "twitch" in the panel: the chat as it comes (newest first), the
   questions in their queue, and what's on air — in the rundown and in the
   Modules tab. A click puts a message on air; nothing goes by itself. */
(function () {
  'use strict';
  var CSS = '.tw-list{max-height:260px;overflow:auto;margin-top:5px;border-top:1px solid var(--line)}' +
    '.tw-msg{display:flex;align-items:flex-start;gap:7px;padding:5px 2px;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px}' +
    '.tw-msg .tw-user{font-weight:700;white-space:nowrap}.tw-msg .tw-text{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}' +
    '.tw-msg .tw-badge{font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:1px 5px;background:rgba(255,255,255,.12);border-radius:3px;white-space:nowrap}' +
    '.tw-msg button{flex:0 0 auto}.tw-empty{color:var(--dim);font-size:12px;padding:6px 2px}';
  function style() {
    if (document.getElementById('tw-css')) return;
    var s = document.createElement('style'); s.id = 'tw-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  var STATES = { connecte: 'connecté', connexion: 'connexion…', deconnecte: 'déconnecté', erreur: 'erreur' };

  function controls(el, api) {
    style();
    var h = api.h, s = api.settings();
    var box = h('div', { class: 'modctl' });
    el.appendChild(box);
    if (!String(s.channel || '').trim()) {
      box.appendChild(h('div', { class: 'sub', text: 'Indiquez la chaîne Twitch dans les réglages du module.' }));
      return {};
    }
    var state = h('span', { class: 'sub', text: '…' }), air = h('span', { class: 'sub grow' });
    box.appendChild(h('div', { class: 'line' }, [h('b', { text: '#' + String(s.channel).replace(/^#/, '').toLowerCase() }), state]));
    box.appendChild(h('div', { class: 'line' }, [air,
      h('button', { class: 'small', text: 'Dernier message', onclick: function () { api.cmd('show.last'); } }),
      h('button', { class: 'small ghost', text: 'Retirer', onclick: function () { api.cmd('hide'); } })]));
    var qList = null, qHead = null;
    if (String(s.prefix || '').trim()) {
      qHead = h('div', { class: 'sub', style: 'margin-top:8px' });
      qList = h('div', { class: 'tw-list', style: 'max-height:170px' });
      box.appendChild(h('div', { class: 'line' }, [qHead, h('span', { class: 'grow' }),
        h('button', { class: 'small red', text: 'Question suivante', onclick: function () { api.cmd('show.question'); } })]));
      box.appendChild(qList);
    }
    box.appendChild(h('div', { class: 'sub', style: 'margin-top:8px', text: 'Messages' }));
    var mList = h('div', { class: 'tw-list' });
    box.appendChild(mList);

    function row(m, question) {
      return h('div', { class: 'tw-msg', 'data-id': m.id }, [
        h('span', { class: 'tw-user', text: m.user, style: m.color ? 'color:' + m.color : '' }),
        m.badge ? h('span', { class: 'tw-badge', text: m.badge }) : null,
        h('span', { class: 'tw-text', text: m.text }),
        h('button', { class: 'fm-mini red', text: 'À l\'antenne', onclick: function () { api.cmd('show.' + m.id); } }),
        question ? h('button', { class: 'fm-mini', text: '✕', title: 'Écarter la question', onclick: function () { api.cmd('drop.' + m.id); } }) : null
      ]);
    }
    function empty(list, text) {
      if (!list.querySelector('.tw-msg')) { if (!list.querySelector('.tw-empty')) list.appendChild(h('div', { class: 'tw-empty', text: text })); }
      else { var e = list.querySelector('.tw-empty'); if (e) e.remove(); }
    }
    function counts() {
      if (qHead) qHead.textContent = 'Questions : ' + qList.querySelectorAll('.tw-msg').length;
      empty(mList, 'Pas encore de message.');
      if (qList) empty(qList, 'Aucune question en attente (« ' + s.prefix + ' … » dans le chat).');
    }
    function add(m) {
      mList.insertBefore(row(m), mList.firstChild);
      var all = mList.querySelectorAll('.tw-msg');
      for (var i = 60; i < all.length; i++) all[i].remove();
      if (m.question && qList) qList.appendChild(row(m, true));
      counts();
    }
    function drop(ids, onlyQuestions) {
      [onlyQuestions ? null : mList, qList].forEach(function (list) {
        if (!list) return;
        ids.forEach(function (id) { var r = list.querySelector('[data-id="' + CSS_escape(id) + '"]'); if (r) r.remove(); });
      });
      counts();
    }
    function CSS_escape(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }
    function setState(st) { state.textContent = (STATES[st.state] || st.state || '') + (st.error ? ' : ' + st.error : ''); }
    api.status().then(function (st) {
      setState(st);
      (st.msgs || []).forEach(function (m) { mList.insertBefore(row(m), mList.firstChild); });
      if (qList) (st.questions || []).forEach(function (m) { qList.appendChild(row(m, true)); });
      counts();
    }).catch(function () {});
    function refresh() {
      var v = api.vars();
      air.textContent = v.vedette ? 'À l\'antenne (ou prêt) : « ' + v.vedette + ' »' : 'Aucun message choisi.';
    }
    refresh();
    counts();
    return {
      refresh: refresh,
      onEvent: function (ev, d) {
        if (ev === 'msg') add(d);
        else if (ev === 'remove') drop(d.ids || [], !!d.questions);
        else if (ev === 'clear') { mList.innerHTML = ''; if (qList) qList.innerHTML = ''; counts(); }
        else if (ev === 'state') setState(d);
      }
    };
  }
  GFX.panel('twitch', { rundown: controls, render: controls });
})();
