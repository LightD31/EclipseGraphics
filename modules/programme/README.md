# Module `programme` — Programme

The running order: what's on now, what's next and in how long, what comes after — for an
« À suivre » in a ticker, a strap or a card. From a list of times and titles, today; a time
earlier than the one before it is the next day's (a night that runs past midnight), and
just after midnight a night that began the day before carries on.

## Setting up

In **Modules**, list the items (a time `HH:MM`, a title, an optional detail), how many
upcoming items the lists hold, and the « à suivre » label. By the clock, the item on now is
the last one started. Live, the rundown's card shows now and next, and lets the operator
take over — next, previous, go to an item — and shift every time when the show runs late
(−5, +5, +10 min); « Horaire » gives the clock back.

The `emission` show uses it for the bandeau's headline (`{{programme.titre}}`), the strap
(`{{programme.suivant_heure}} {{programme.suivant}}`) and the bandeau's ticker
(`programme.ticker`).

## Commands

Sent to `programme`:

| Command | |
|---|---|
| `next` · `prev` · `go.3` | Take over: the next item, the previous one, the 3rd. |
| `auto` | Back to the clock. |
| `shift.+5` · `shift.-5` · `shift.0` · `shift.15` | Shift the timings (minutes), or no shift, or exactly 15. |

## Variables

| Variable | Example |
|---|---|
| `{{programme.titre}}` · `sous` · `heure` | on now: `Le grand entretien` · `avec notre invitée` · `20:30` |
| `{{programme.suivant}}` · `suivant_sous` · `suivant_heure` | next (the time includes the shift) |
| `{{programme.suivant_dans}}` · `suivant_rebours` | `12 min` · `00:12:34` |
| `{{programme.apres}}` · `position` | the one after next · `3/6` |
| `{{programme.etat}}` · `mode` · `retard` | `avant`/`en_cours`/`dernier` · `auto`/`manuel` · `+10 min` |
| `{{programme.liste}}` · `ticker` | upcoming items, for a Défilant (`21:00 · Le débat`) and a bandeau's ticker |

In Companion: `programme_titre`, `programme_suivant`, `programme_suivant_dans`…
