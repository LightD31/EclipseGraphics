# Module `score` — Tableau de score

A match's score: two teams, their points, a second counter (sets, fouls…), the period,
possession or service, and a note on screen (« Temps mort », « VAR »). The server keeps it;
the rundown's buttons and Companion change it; the module's own graphic shows it. The
`sport` show uses it with two timers of the [`chrono`](../chrono/README.md) module.

## Setting up

In **Modules**, name the teams (full name, three- or four-letter abbreviation, colour,
logo), choose the periods (mi-temps, périodes, quart-temps, sets, manches, rounds…, and how
many — beyond them it says « Prolongation »), the point buttons the rundown offers (`1`, or
`1,2,3` for basketball), a second counter's name, and optionally an announcement for each
point (« But ! » → a flash: « But ! Aigles de Garonne », with the new score).

Add the **Tableau de score** graphic (the « + Ajouter » menu, *Module « Tableau de score »*):

- **compact** — the corner bug: abbreviations, the two scores, period and time of play;
- **large** — a band with logos and full names, the time under the score.

Its time of play is any text: `{{chrono.match}}` by default (a stopwatch of the Minuteurs
module named `match`). A point scored on air rolls the number in and lights the cell up.

## Commands

Sent to `score`:

| Command | |
|---|---|
| `a.+1` · `a.-1` · `a.+3` · `a.set.2` (or `a.2`) · `a.reset` | Team 1's points (`b.*` for team 2). Only a `+N` is announced; a set is a correction. |
| `a2.+1` · `b2.+1`… | The second counter. |
| `period.next` · `period.prev` · `period.set.2` · `period.reset` | The period. |
| `poss.a` · `poss.b` · `poss.toggle` · `poss.none` | Possession or service (a dot by the team). |
| `note.<text>` · `note.set` + text · `note.clear` | A note under the scoreboard. |
| `reset` | Everything back to 0. |
| `air.on` · `air.off` · `air.toggle` | The module's scoreboard (the first one in the show). |

## Variables

| Variable | Example |
|---|---|
| `{{score.a}}` · `{{score.b}}` | `2` · `1` |
| `{{score.a_nom}}` · `{{score.a_court}}` (and `b_…`) | `Aigles de Garonne` · `AIG` |
| `{{score.score}}` · `{{score.ligne}}` | `2 – 1` · `Aigles de Garonne 2 – 1 Loups du Tarn` |
| `{{score.mene}}` | `Aigles de Garonne mène`, `Égalité` |
| `{{score.periode}}` · `{{score.periode_n}}` | `2e mi-temps` · `2` |
| `{{score.a2}}` · `{{score.b2}}` · `{{score.poss}}` · `{{score.note}}` | second counter, `a`/`b`/empty, the note |

In Companion: `score_a`, `score_ligne`, `score_periode`… — and `score_event_text` for the
last announcement.
