# Module `twitch` — Chat Twitch

A channel's chat, read live — anonymously: no account, no key, public messages only. The
rundown lists the messages as they come, and the questions (messages starting with a
prefix such as `!question`) in a queue of their own; the operator puts the one they pick
on air in the module's **Message du chat** graphic. Nothing goes on air by itself, and a
message the channel's moderators delete — or whose author they time out or ban — leaves
the screen at once.

## Setting up

In **Modules**, give the channel's name, and optionally: the questions' prefix, words that
keep a message out of the rundown, accounts to ignore (the usual bots are listed), how
many messages to keep, and how long a message stays on air (0: until taken off).

Add the **Message du chat** graphic (« + Ajouter » → *Module « Chat Twitch »*): a bubble
(the author above the message, in their Twitch colour, with their status — chaîne, modo,
vip, abonné) or a strap (the author on the accent band). It holds up to a few lines.

In the rundown: « À l'antenne » on any message or question, « Question suivante »,
« Dernier message », « Retirer ».

## Commands

Sent to `twitch`:

| Command | |
|---|---|
| `show.last` · `show.question` · `show.<id>` | The last message, the next question, a given message — on air. |
| `hide` | Off air. |
| `drop.<id>` | Dismiss a question. |
| `clear` | Empty the rundown's lists. |

## Variables

| Variable | |
|---|---|
| `{{twitch.vedette}}` · `vedette_pseudo` · `vedette_texte` · `vedette_badge` | The message on air (or last put on air). |
| `{{twitch.dernier}}` · `dernier_pseudo` · `dernier_texte` | The last message received. |
| `{{twitch.questions}}` · `n` | Questions waiting · messages received since startup. |
| `{{twitch.etat}}` | `connecte`, `connexion`, `deconnecte`, `erreur`. |

In Companion: `twitch_dernier`, `twitch_questions`… (a trigger on `twitch_questions` can
light a button when a question comes in).

Requires Node 22 (the server's built-in WebSocket client). `TWITCH_IRC_URL` points the
module at another IRC-over-WebSocket server (for tests).
