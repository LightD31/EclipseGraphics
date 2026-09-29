# Module `chrono` — Minuteurs

Stopwatches and countdowns run live: a speaker's time, a break, a match clock. The server
keeps them, so every output, the panel and Companion read the same time, and a restart
doesn't lose them (a timer that was running has kept running).

## Setting up

In the Régie's **Modules** tab, switch *Minuteurs* on and add timers: a name, an
identifier (the name of its commands and variable; taken from the name if empty), up or
down, a duration for a countdown (`05:00`, `1:30:00`, `90s`, `1h30`; a bare number is in
minutes), the display (`04:59`, `00:04:59`, minutes only, seconds only), and what a
countdown does at zero: stop, or carry on in overtime (`+00:12`), with an optional text
and a flash message.

Then put the timer in any text as `{{chrono.<id>}}`: a bandeau's timer (mode « Texte /
variable »), a fullscreen card's countdown, the corner bug's text, a scoreboard's time of
play, a ticker. Each timer gets its buttons in the rundown: start / stop, reset, −1 min,
−10 s, +10 s, +1 min, and a field to set a new duration.

## Commands

Sent to `chrono` — HTTP `GET /api/cmd/chrono/<id>.<verb>`, or `{"gfx": "chrono:<id>.<verb>"}`
as an OBS custom event:

| Command | |
|---|---|
| `<id>.start` · `<id>.pause` (or `.stop`) · `<id>.toggle` | Start, stop, either. A countdown stopped at zero starts again from the top. |
| `<id>.reset` · `<id>.restart` | Back to the start (stopped) · back to the start and running. |
| `<id>.set.<duration>` · `<id>.set` + text | A countdown's new duration, or a stopwatch's elapsed time. |
| `<id>.+30` · `<id>.-10` · `<id>.add.+1min` | Nudge: a countdown gets more (or less) time left, a stopwatch moves on (or back). Bare numbers are seconds. |
| `all.pause` · `all.reset` · `all.start` | Every timer at once. |

## Variables

| Variable | |
|---|---|
| `{{chrono.<id>}}` | The time as shown (`04:59`, `+00:12` in overtime, the text at zero). |
| `{{chrono.<id>_etat}}` | `pret`, `en_cours`, `pause`, `fini`, `depasse`. |
| `{{chrono.<id>_s}}` | In seconds: left (negative in overtime) or elapsed — for Companion feedback ("red under 30 s"). |
| `{{chrono.<id>_nom}}` | Its name. |
| `{{chrono.event_text}}` · `event_n` | The last flash a countdown sent, and how many so far. |

In Companion: `chrono_<id>`, `chrono_<id>_etat`, `chrono_<id>_s`…
