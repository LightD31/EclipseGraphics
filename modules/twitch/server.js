/* Module "twitch", server side: the chat connection (Twitch IRC over a
   WebSocket, anonymous "justinfan" login: read-only, public messages),
   the lists the panel shows, and the message on air.

   Panel events (ctx.emit): msg (a new message), remove ({ ids }: moderated
   or dismissed), clear. The panel reads the lists once with status().

   Commands (twitch:<name>.<value>):
     show.<id> | show.last | show.question   that message on air (in the
                                             "chat" graphic), for autoOut s
     hide                                    off air
     drop.<id>                               dismiss a question
     clear                                   empty the lists

   Needs Node 22 (its built-in WebSocket). TWITCH_IRC_URL points it at
   another server (tests). */
'use strict';
const IRC = process.env.TWITCH_IRC_URL || 'wss://irc-ws.chat.twitch.tv:443';

const BADGES = { broadcaster: 'chaîne', moderator: 'modo', vip: 'vip', subscriber: 'abonné', founder: 'abonné' };
function list(s) { return String(s || '').toLowerCase().split(/[,;\s]+/).map(x => x.trim()).filter(Boolean); }
function unescapeTag(v) { return v.replace(/\\(.)/g, (a, c) => ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' }[c] != null ? { s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' }[c] : c)); }
/* "@tags :prefix COMMAND params :trailing" */
function parse(line) {
  const tags = {};
  let rest = line, prefix = '';
  if (rest[0] === '@') {
    const i = rest.indexOf(' ');
    rest.slice(1, i).split(';').forEach(kv => { const j = kv.indexOf('='); tags[j < 0 ? kv : kv.slice(0, j)] = j < 0 ? '' : unescapeTag(kv.slice(j + 1)); });
    rest = rest.slice(i + 1);
  }
  if (rest[0] === ':') { const i = rest.indexOf(' '); prefix = rest.slice(1, i); rest = rest.slice(i + 1); }
  const k = rest.indexOf(' :');
  const parts = (k >= 0 ? rest.slice(0, k) : rest).split(' ').filter(Boolean);
  return { tags, prefix, command: parts[0] || '', params: parts.slice(1), trailing: k >= 0 ? rest.slice(k + 2) : '' };
}

exports.init = function (ctx) {
  const S = { ws: null, gen: 0, state: 'deconnecte', error: '', channel: '', nick: '', retry: 0, timer: null,
              msgs: [], questions: [], n: 0, outTimer: null, key: '' };

  function setState(st, err) {
    S.state = st; S.error = err || '';
    ctx.setVars({ etat: st });
    ctx.emit('state', { state: st, error: S.error, channel: S.channel });
  }
  function send(line) { if (S.ws && S.ws.readyState === 1) S.ws.send(line); }
  function close() {
    S.gen++;
    clearTimeout(S.timer);
    if (S.ws) try { S.ws.close(); } catch (e) { /* gone */ }
    S.ws = null;
  }
  function connect(channel) {
    close();
    S.channel = channel;
    if (!channel) return setState('deconnecte');
    if (typeof WebSocket === 'undefined') return setState('erreur', 'Node 22 ou plus requis pour lire le chat');
    const gen = S.gen;
    let ws;
    try { ws = new WebSocket(IRC); } catch (e) { setState('erreur', e.message); return later(channel); }
    S.ws = ws;
    S.nick = 'justinfan' + (10000 + Math.floor(Math.random() * 89999));
    setState('connexion');
    ws.onopen = () => {
      if (gen !== S.gen) return;
      send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      send('PASS SCHMOOPIIE');
      send('NICK ' + S.nick);
      send('JOIN #' + channel);
    };
    ws.onmessage = (ev) => { if (gen === S.gen) String(ev.data).split('\r\n').forEach(l => { if (l) try { onLine(l); } catch (e) { ctx.log('warn', 'twitch: ' + e.message); } }); };
    ws.onclose = () => { if (gen !== S.gen) return; S.ws = null; if (S.state !== 'erreur') setState('deconnecte'); later(channel); };
    ws.onerror = () => { /* onclose follows */ };
  }
  function later(channel) {
    S.retry = Math.min(60000, Math.max(2000, S.retry * 2));
    clearTimeout(S.timer);
    S.timer = setTimeout(ctx.guard(() => { const s = ctx.settings(); if (s && chan(s) === channel) connect(channel); }), S.retry);
  }
  function chan(s) { return String(s.channel || '').trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9_]/g, ''); }

  function onLine(line) {
    const m = parse(line);
    switch (m.command) {
      case 'PING': send('PONG :' + (m.trailing || 'tmi.twitch.tv')); break;
      case 'JOIN':
        if ((m.prefix.split('!')[0] || '') === S.nick) { S.retry = 0; setState('connecte'); ctx.log('log', 'twitch: #' + S.channel); }
        break;
      case 'PRIVMSG': message(m); break;
      case 'CLEARMSG': remove(x => x.id === m.tags['target-msg-id']); break;
      case 'CLEARCHAT': remove(m.trailing ? (x => x.login === m.trailing.toLowerCase()) : () => true); break;
      case 'RECONNECT': connect(S.channel); break;
      case 'NOTICE':
        if (/suspended|does not exist|banned/i.test(m.trailing)) setState('erreur', m.trailing);
        ctx.log('warn', 'twitch: ' + m.trailing);
        break;
    }
  }
  function message(m) {
    const s = ctx.settings();
    if (!s) return;
    const login = (m.prefix.split('!')[0] || '').toLowerCase();
    let text = m.trailing || '';
    const me = /^\x01ACTION (.*)\x01$/.exec(text);
    if (me) text = me[1];
    if (list(s.bots).includes(login)) return;
    const low = text.toLowerCase();
    if (list(s.hide).some(w => low.includes(w))) return;
    const kinds = String(m.tags.badges || '').split(',').map(b => b.split('/')[0]);
    const badge = ['broadcaster', 'moderator', 'vip', 'subscriber', 'founder'].find(b => kinds.includes(b));
    const msg = { id: m.tags.id || 'm' + Date.now() + '-' + S.n, login, user: m.tags['display-name'] || login, color: /^#[0-9a-f]{6}$/i.test(m.tags.color || '') ? m.tags.color : '',
                  text: text.slice(0, 500), badge: badge ? BADGES[badge] : '', at: +m.tags['tmi-sent-ts'] || Date.now(), question: false };
    const prefix = String(s.prefix || '').trim().toLowerCase();
    if (prefix && low.startsWith(prefix)) {
      msg.question = true;
      msg.text = msg.text.slice(prefix.length).trim();
      if (!msg.text) return;
      S.questions.push(msg);
      if (S.questions.length > 100) S.questions.shift();
    }
    S.n++;
    S.msgs.push(msg);
    const keep = Math.max(10, +s.keep || 80);
    if (S.msgs.length > keep) S.msgs.splice(0, S.msgs.length - keep);
    ctx.emit('msg', msg);
    ctx.setVars({ n: String(S.n), dernier: msg.user + ' : ' + msg.text, dernier_pseudo: msg.user, dernier_texte: msg.text, questions: String(S.questions.length) });
  }
  /* moderation: the messages go, and the one on air leaves the screen */
  function remove(test) {
    const ids = S.msgs.filter(test).map(x => x.id).concat(S.questions.filter(test).map(x => x.id));
    if (!ids.length) return;
    S.msgs = S.msgs.filter(x => !test(x));
    S.questions = S.questions.filter(x => !test(x));
    ctx.emit('remove', { ids });
    ctx.setVars({ questions: String(S.questions.length) });
    const st = ctx.state();
    if (st && st.featured && ids.includes(st.featured.id)) { offAir(); st.featured = null; featuredVars(null); ctx.changed(); }
  }

  function chatGraphic() {
    const show = ctx.activeShow();
    const g = show && show.graphics.find(x => x.type === 'chat');
    return g ? g.id : null;
  }
  function offAir() { clearTimeout(S.outTimer); const g = chatGraphic(); if (g) ctx.command(g, 'air.off'); }
  function featuredVars(f) {
    ctx.setVars({ vedette: f ? f.user + ' : ' + f.text : '', vedette_pseudo: f ? f.user : '', vedette_texte: f ? f.text : '',
                  vedette_couleur: f ? f.color : '', vedette_badge: f ? f.badge : '', _vedette_id: f ? f.id : '' });
  }

  function onShow() {
    const s = ctx.settings();
    if (!s) { close(); S.key = ''; if (S.state !== 'deconnecte') setState('deconnecte'); return; }
    const c = chan(s);
    if (c !== S.key) { S.key = c; S.retry = 0; connect(c); }
    const st = ctx.state();
    featuredVars(st && st.featured);
    ctx.setVars({ etat: S.state, n: String(S.n), questions: String(S.questions.length) });
  }

  return {
    commands: {
      show(v, c) {
        let msg;
        if (v === 'last' || v === '') msg = S.msgs.filter(x => !x.question).pop() || S.msgs[S.msgs.length - 1];
        else if (v === 'question' || v === 'next') msg = S.questions[0];
        else msg = S.msgs.find(x => x.id === v) || S.questions.find(x => x.id === v);
        if (!msg) throw new Error(v === 'question' ? 'aucune question en attente' : 'message introuvable');
        if (msg.question) {
          S.questions = S.questions.filter(x => x.id !== msg.id);
          ctx.emit('remove', { ids: [msg.id], questions: true });
        }
        c.state.featured = { id: msg.id, user: msg.user, login: msg.login, color: msg.color, text: msg.text, badge: msg.badge };
        featuredVars(c.state.featured);
        ctx.setVars({ questions: String(S.questions.length) });
        const g = chatGraphic();
        if (g) {
          setTimeout(ctx.guard(() => ctx.command(g, 'air.on')), 0);
          clearTimeout(S.outTimer);
          const secs = +c.settings.autoOut;
          if (secs > 0) { const id = msg.id; S.outTimer = setTimeout(ctx.guard(() => { const st = ctx.state(); if (st && st.featured && st.featured.id === id) ctx.command(g, 'air.off'); }), secs * 1000); }
        }
      },
      hide() { offAir(); },
      drop(v) {
        const before = S.questions.length;
        S.questions = S.questions.filter(x => x.id !== v);
        if (S.questions.length === before) return false;
        ctx.emit('remove', { ids: [v], questions: true });
        ctx.setVars({ questions: String(S.questions.length) });
      },
      clear() { S.msgs = []; S.questions = []; ctx.emit('clear', {}); ctx.setVars({ questions: '0' }); }
    },
    onShow,
    status() {
      const st = ctx.state();
      return { state: S.state, error: S.error, channel: S.channel, n: S.n, msgs: S.msgs.slice(-60), questions: S.questions.slice(0, 50),
               featured: st && st.featured, graphic: chatGraphic() };
    },
    stop() { close(); clearTimeout(S.outTimer); }
  };
};
exports._test = { parse };
