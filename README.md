# EclipseGraphics

Live graphics for OBS, driven from a control panel instead of code. A small Node server
holds the show — its graphics and their texts, the theme, the animations, the data
modules — and every OBS browser source draws what it says. The operator edits and runs
everything from the **Régie** (`panel.html`, in French), from **Bitfocus Companion**
(HTTP, or OBS "Broadcast Custom Event"), or both at once.

What it draws, every part of it configurable in the panel:

- **Bandeau** — the lower third of the eclipse and A350F broadcasts, rebuilt as one
  composite graphic: headline band with its timer, info strap with a live badge, ticker
  with a clock, progress line, a side panel for an image or a module's visual. On air it
  morphs into two more layouts: **fullscreen** (the visual takes the canvas, a second one
  sits in a corner card, data columns on the right) and **recap**.
- **Synthé** — name and role straps: a list of guests, taken one by one, leaving by
  themselves after a few seconds if you like.
- **Flash** — short banners in a queue, glued to a bandeau (above its strap) or free.
- **Défilant** — a standalone ticker: a continuous crawl, one message at a time, or
  series of segments.
- **Logo et horloge** — a corner bug: logo, clock, live badge, countdown.
- **Plein écran** — fullscreen cards: title, "starting soon" with a countdown, key
  figures, a message; over a colour, the theme's gradient, an image or a looping video.

Modules bring live content and controls to those graphics — [timers](modules/chrono/README.md),
a [scoreboard](modules/score/README.md), the [weather](modules/meteo/README.md),
[outside data](modules/flux/README.md) (RSS, JSON, CSV), the [running order](modules/programme/README.md),
a [Twitch chat](modules/twitch/README.md) — and two broadcasts they grew from: the
[12 August 2026 solar eclipse](modules/eclipse/README.md) and the
[A350F first flight](modules/a350f/README.md) tracked over ADS-B (see [Modules](#modules)).

## Quick start

```
node server.js
```

Node 18 or later, no `npm install` (Node 22 or later for the server's own link to OBS,
which uses Node's built-in WebSocket client). Then:

| | |
|---|---|
| Régie (control panel) | <http://127.0.0.1:8787/> (opens `panel.html`) |
| OBS browser source | `http://127.0.0.1:8787/overlay.html`, 1920 × 1080 |

Five shows ("projets") come with it, and the panel's header switches between them:
`demo` (every graphic type on fictional content, opened on first start), `emission` (a
live programme: running order, speaking-time timer, weather, a news feed, the Twitch chat),
`sport` (a scoreboard, the time of play, announcements), `eclipse` and `a350f`.

In OBS, one Browser Source with the output URL is enough: its background is transparent,
and every graphic of the show lives on it. All browser sources show the same thing,
because the state lives on the server — a source refreshed, or opened mid-show, comes
back exactly as it was. To put graphics in different scenes, give each its own source:
`overlay.html?only=synthe`, `overlay.html?except=synthe,logo`.

To drive the graphics from Companion through OBS custom events, and to get Companion
variables back, fill in the panel's **Réglages** tab: OBS's websocket (Tools → WebSocket
Server Settings: port and password) and Companion's address (its web interface, port
8000 by default).

| Server option | |
|---|---|
| `--port N` / `--host ADDR` | Where to listen (default `127.0.0.1:8787`). |
| `--show NAME` | Show to open (default: the last one opened). |
| `--shows DIR` / `--data DIR` / `--media DIR` | Where shows, runtime state and uploads live (default `shows/`, `data/`, `media/`). |
| `--allow-host NAME[,NAME…]` | Host names the server answers to besides IP addresses, `localhost` and `*.local`. |
| `--every N` / `--watch HEX[,HEX…]` / `--log DIR` | The A350F module's built-in relay: seconds between two requests to each ADS-B API (default `5`), aircraft to record from startup whatever the show (by default, only the one the active show follows, while its module is on), where the recordings go (default `flight-log/`). |

> **On a network:** `--host 0.0.0.0` lets the other machines of the network open the
> panel and the outputs — and edit the show, and put anything on air: there is no login.
> Keep the default `127.0.0.1` unless the network is yours.

## The Régie

- **Rundown** (left) — every graphic of the show with its on-air button, and the
  controls it needs live: layouts, swap, corner card, the modules' views and a manual
  headline for a bandeau; the list of names for a synthé; a message field, the ready
  messages, skip and clear for a flash. Under them, the modules' own live controls: the
  timers' buttons, the score, now and next with the running order's takeover, the chat's
  messages and questions. **Tout retirer** takes everything off air.
- **Preview** — the real output page, scaled, over a choice of backgrounds; it shows the
  selected graphic even off air, and replays its entrance on demand.
- **Graphique** — the selected graphic's form: every text (with a `{ }` button to insert
  a variable), images and videos, position, size, colours (empty: the theme's), motion
  overrides; its place in the stack, duplicate, delete, and the Companion commands it
  answers to, with their URLs to copy.
- **Thème** — presets, the nine colour tokens, the three font roles (headings, text,
  figures: family, weight, width, tracking, capitals), scale, corners, shadow, gloss; a
  font file of your own can be imported.
- **Animations** — presets, speed, stagger, the layout morph's duration, how a text
  changing on air goes (fade, slide, none), and, part by part, the effect, delay,
  duration and easing of the entrance and of the exit.
- **Variables** — the show's free variables (a score, a subject…) with their live values
  and ± buttons, and every module's variables, with the tag to use in a text and the
  name they have in Companion.
- **Modules** — switch a module on for the show, its settings, its state and live
  controls (a feed's health, the weather's last update, the A350F's data…), and the
  Companion commands it answers to.
- **Projets** — title and time zone; create, duplicate, rename, import, export, delete.
- **Réglages** — the output URLs, the OBS link, Companion, the media library, the log.

Every change is saved as it is made (`shows/<name>.json`, the previous version kept as
`.json.bak`); **↶ Annuler** (Ctrl+Z) steps back. Two panels open at once stay in sync.

## Shows, variables and bindings

A show is a JSON file in `shows/`: its title and time zone, its theme and motion, its
graphics and their fields, its modules and their settings, its free variables. The panel
writes it; it can be edited by hand too (the server normalises it on load). `shows/` is
part of the repository, so a show can be shared by committing it — keep anything you
would not publish (a private address's coordinates, say) out of it, or keep your shows
elsewhere with `--shows`.

What is on air, in which layout, the variables' current values and the modules' live
controls are the show's **live state**, kept by the server in `data/live/<show>.json`
(git-ignored, with the OBS and Companion settings in `data/settings.json`): a restart
picks up where it left off.

Every text field takes bindings:

| Tag | Value |
|---|---|
| `{{clock}}` · `{{clock.hm}}` | The time, `10:30:15` · `10:30` (the show's time zone). |
| `{{date}}` · `{{date.short}}` · `{{day}}` | `29 septembre 2026` · `29/09/2026` · `mardi`. |
| `{{show}}` | The show's title. |
| `{{var.<name>}}` | A free variable of the show. |
| `{{<module>.<name>}}` | A module's variable: `{{a350f.alt}}`, `{{eclipse.pct}}`… (the panel lists them). |

Filters: `{{day|cap}}` (capitalised), `|upper`, `|lower`, `|default:text` (when empty).

## Theme, fonts and motion

The theme is a set of CSS custom properties every graphic draws with, so a change
restyles everything at once, live. Nine colour tokens (accent, text on the accent, base,
secondary base, text on the base, light surface, text on it, highlight on the surface,
live badge), three font roles, a scale, a corner radius, a shadow and a gloss. Presets:
**Direct** (the default: the house identity — red headline band, navy, white strap — in
a real condensed font, the navy taken a touch deeper), **Classique** (that identity
exactly as the original overlays had it), **Nuit**, **Sport**, **Info**, **Épuré**,
**Néon**, **Ambre**. Any graphic can override its colours.

Fonts are bundled, so OBS renders them offline whatever is installed on the machine:
Barlow Condensed, Archivo and Saira (variable width), Oswald, Bebas Neue, Inter,
JetBrains Mono — all under the SIL Open Font License, latin and latin-ext subsets. Font
files uploaded in the panel join the list.

Motion is choreographed by role: each graphic names its parts (the accent band, the info
band, the light strap, the side panel, the title, the texts, the list items, the
figures, the clock, the progress line, the badge, a light sweep, a background…) and a
preset says, for each role, which effect runs, when and for how long, in and out. The
same preset therefore animates a bandeau, a name strap and a card alike, and switching
presets restyles every entrance at once. Presets: **Direct** (the default: the original
choreography, tightened), **Classique** (its exact timings), **Fluide**, **Impact**,
**Rideau**, **Coupe** (no animation). On top of the preset, the show can change any
part's effect (wipes, masks, slides, pops, zooms, blurs, a light sweep…), delay, duration
and easing, in and out, and set the speed, the stagger and the morph's duration; a
graphic can take its own preset and speed. Effects run on the Web Animations API, so an exit that
interrupts an entrance reverses from where it is; layout changes morph with the View
Transitions API where OBS's browser has it (Chromium 111+), and replay the entrance
otherwise.

Like the original overlays, graphics park when OBS hides their source and replay their
entrance when it shows it again, so cutting to a scene brings them in with their
animation; `overlay.html?noautoanim` leaves them to the commands alone.

## Commands

Every control — the panel, Companion, OBS — is a command: a **target** (a graphic's id,
a module's id, `var` for the free variables, or `all`) and a `<property>.<value>`.

- **Companion, Generic HTTP module** — a GET request:
  `http://127.0.0.1:8787/api/cmd/bandeau/air.toggle`; text with dots in it goes in
  `?text=` (`/api/cmd/flash/banner.set?text=Bienvenue.`).
- **Companion, OBS module ("Broadcast Custom Event")** — `{"gfx": "bandeau:air.toggle"}`,
  or `{"gfx": "banner.set", "target": "flash", "text": "…"}`. The server reads them from
  its own OBS link (Réglages), once for every output. The original overlays' event keys
  still work: `{"eclipse": "…"}` (and the older `{"eclipseLowerThird": …}`) reach the
  eclipse module, `{"a350f": "…"}` the A350F module, so existing Companion buttons keep
  working unchanged.
- **Output page** — in OBS's "Interact" window: **R** corner card, **S** swap the views,
  **F** the map's framing (on the first bandeau); `gfx('<target>', '<cmd>', 'text')`,
  and the original `eclipseCommand('…')` / `a350fCommand('…')`, from a console.
- **HTTP** — `POST /api/cmd` with `{"target": "…", "cmd": "…", "text": "…"}`.

| Target | Command | Effect |
|---|---|---|
| any graphic | `air.on` · `air.off` · `air.toggle` | On air, off air. A flash off air lets its banners pass unseen. |
| bandeau | `air.on.full` · `air.on.lower` · `air.on.recap` | On air straight into that layout. |
| | `layout.lower` · `layout.full` · `layout.recap` · `layout.toggle` | Lower third, fullscreen, recap (morphs on air; toggle is lower ⇄ full). |
| | `main.toggle` · `main.panel` · `main.card` · `main.<visual>` | Which visual gets the fullscreen canvas and which the corner card (`main.sky`, `main.real`, `main.map`, `main.profile` by name). |
| | `card.on` · `card.off` · `card.toggle` | The corner card (fullscreen). |
| | `headline.<text>` · `headline.set` + text · `headline.auto` | A manual headline, or back to the one in the form. |
| | `<view>.<value>` · `<view>.toggle` | A module's view, e.g. `map.track` · `map.follow` for the A350F map. |
| synthé | `take.N` · `take.next` · `take.prev` · `air.on.N` | The Nth name (1-based), next, previous — on air. |
| | `entry.N` · `entry.next` · `entry.prev` | Pick the name without going on air (switches at once if on air). |
| flash | `banner.<text>` · `banner.set` + text | A message, first in the queue. |
| | `preset.N` | The Nth ready message. |
| | `banner.next` · `banner.clear` | Skip the current banner · empty the queue. |
| `var` | `<name>` + text · `<name>.set` + text · `<name>.<value>` | Set a free variable. |
| | `<name>.+N` · `<name>.-N` · `<name>.reset` | Add, subtract (a score) · back to its starting value. |
| `all` | `all.off` (or `air.off`) · `reload` | Everything off air · reload every output. |
| a module | its own commands (each module's README); the others go to its graphic — its own type, else its bandeau — and `banner.*` / `preset.*` to its flash | `chrono:debat.start`, `score:a.+1`, `a350f:t0.+5`… |

Refused commands (unknown target, value out of range) answer HTTP 400 with the reason,
and the reason is in the log.

## Companion variables

With Companion set up in Réglages, the server keeps its custom variables up to date
(`POST /api/custom-variable/<name>/value`), and sends them all again every minute so a
Companion restarted mid-show catches up. Create the ones you use in Companion; a button
then shows or tests them, e.g. `$(custom:gfx_bandeau_air)`.

| Variable | Values |
|---|---|
| `gfx_<graphic>_air` | `on` · `off`, for every graphic. |
| `gfx_<bandeau>_layout` · `_main` · `_card` · `_<view>` | `lower` · `full` · `recap`; `panel` · `card`; `on` · `off`; the view's value (`track`…). |
| `gfx_<synthé>_entry` · `_name` | The current name's number (1-based), the name. |
| `gfx_<flash>_text` · `_n` | The banner on screen (empty between them), how many so far (for a "variable changed" trigger). |
| `gfx_var_<name>` | The free variables. |
| `<module>_air` · `_layout` · `_main` · `_card` · `_<view>` | The module's bandeau under the module's name, with the original overlays' values: `eclipse_main` is `sky` or `real`, `a350f_map` is `track` or `follow`. |
| `<module>_<name>` | What the module computes: `chrono_debat`, `score_ligne`, `meteo_temp`, `eclipse_countdown`, `a350f_alt`… (each module's README lists them). The eclipse and A350F keep the original overlays' names, so existing Companion pages keep working. |

`gfx` is a prefix set in Réglages. Only text values are sent: the lists and ratios meant
for the graphics, and the ticking clocks, are not.

## Modules

A module brings live data, controls and sometimes graphics of its own. Switch one on in
the Régie's **Modules** tab (adding one of its graphics from « + Ajouter » switches it on
too), set it up there, and use its variables in any text — the `{ }` button lists them.
Each module's README has its full reference: settings, commands, variables.

| Module | | Brings |
|---|---|---|
| [`chrono`](modules/chrono/README.md) — Minuteurs | Stopwatches and countdowns run from the rundown or Companion: start, pause, set, nudge, overtime, a flash at zero. Kept by the server, the same time everywhere. | `{{chrono.<id>}}` for any timer field |
| [`score`](modules/score/README.md) — Tableau de score | Two teams, points, a second counter, period, possession, a note; announcements for each point. | the **Tableau de score** graphic (compact or large) |
| [`meteo`](modules/meteo/README.md) — Météo | The weather and the next days from Open-Meteo (free, no key). | the **Météo** corner graphic, a bandeau visual, ticker lists |
| [`flux`](modules/flux/README.md) — Flux de données | RSS/Atom, JSON, CSV (Google Sheets) or text, from the web or the media library, read on a schedule. | variables and ticker lists |
| [`programme`](modules/programme/README.md) — Programme | The running order: now, next, in how long; takeover and a delay shift live. | variables and ticker lists |
| [`twitch`](modules/twitch/README.md) — Chat Twitch | A channel's chat read anonymously, a question queue; the operator picks what goes on air, and moderated messages leave the screen at once. | the **Message du chat** graphic |
| [`eclipse`](modules/eclipse/README.md) — Éclipse solaire | A solar eclipse's local circumstances, computed live. | sky and true-scale visuals for the bandeau |
| [`a350f`](modules/a350f/README.md) — Premier vol A350F | A flight tracked over ADS-B (relay and recorder in the server): phases, milestones, position in words. | live map, flight profile, flight data and recap for the bandeau |

### Writing a module

A module is a folder, `modules/<id>/` (the folder's name is its id):

- **`module.js`** — the descriptor, loaded by the server, the panel and the outputs alike:
  `id`, `label`, `icon`, `desc`; `settings` (a form schema, the same field types as the
  graphics'); `state` (the live state's defaults, kept per show by the server) with
  `onSettings(settings, state)`; `commands` (`{ name: (value, ctx) → false to refuse }`,
  `ctx` giving `state`, `settings`, `vars`, `text`, `now()`, `when('HH:MM')`), and
  `command(name, value, ctx)` for names nobody knows in advance (a timer's id: `null` means
  "not mine"); `vars` (what it reports, `{ name, label, screen }` — or a function of the
  settings — `screen` for values Companion shouldn't get); `cmdHelp` (its commands, for the
  panel); `visuals` and `columns` (what a bandeau can show), `views` (named states such as
  the map's framing), `stateVars` (Companion variables drawn from the state), `now()` (a
  shared clock, for demos), `legacyKeys` (OBS event keys routed to it); and the files it
  brings: `graphics` (`{ type: file }`, graphic types — `GFX.type(…)`, like
  `engine/graphics/*` —, loaded by the panel and the outputs), `client`, `css`, `panel`.
- **`server.js`** (optional) — `exports.init(ctx)` → `{ routes, status(), onShow(config),
  commands, command, onCommand(name, value), stop() }`. `ctx` gives the module's
  `settings()` and live `state()` (`changed()` after editing it), `setVars({…})` (variables
  for every output, the panel and Companion), `flash(item)` (a banner in the show's flash),
  `command(target, cmd, text)`, `emit(event, data)` (to its panel part), `activeShow()`,
  `enabled()`, `now()`, `tz()`, `log()`, `arg()` (command-line options), `dataDir`,
  `mediaDir`. Most modules live here: the timers, the score, the weather, the feeds, the
  running order, the chat, the A350F's relay.
- **`client.js`** (optional) — runs in every output page, for what must be drawn or
  computed there: `GFX.client('<id>', api => instance)`. `api` gives `settings()`,
  `state()`, `now()` (the server's clock), `tz()`, `set(name, value)` (report a variable),
  `get(tag)` / `render(text)`, `leader()`, `flash(item)`, `cmd()`; the instance draws
  `visual(name, el, host)` and `column(name, el, host)` (returning a controller the
  bandeau keeps: `place()`, `parts()`, `destroy()`), and gets `onSettings()` and
  `destroy()`. One page per module — the leader, elected by the server — reports the
  variables, so two sources a tick apart never make them flicker; another takes over if it
  closes.
- **`panel.js`** (optional) — `GFX.panel('<id>', { render(el, api), rundown(el, api) })`:
  its view in the Modules tab, and live controls in a rundown card; each returns
  `{ refresh(), onEvent(event, data), destroy() }` as it needs. `api` gives `cmd()`,
  `vars()`, `state()`, `settings()`, `setting(key, value)`, `status()` (its server part's),
  `h()` (to build elements), `toast()`.

`modules/programme/` (server only) and `modules/score/` (server, a graphic type, rundown
controls) are small examples to start from.

## HTTP API

JSON everywhere. Requests that change something are refused (403) when a browser says
they come from another site, or with another site's `Origin`; the server only answers
to IP addresses, `localhost`, `*.local` and `--allow-host` names, which defeats DNS
rebinding. `data/` and dotfiles are never served; uploaded SVG files are served with a
restrictive Content Security Policy.

| Route | |
|---|---|
| `GET /api/cmd/<target>/<cmd>[?text=]` · `POST /api/cmd` | Run a command (above). |
| `GET /api/events` | The live stream (Server-Sent Events) the panel and outputs follow. |
| `GET /api/state` · `GET /api/status` | Everything at once · health, clients, leaders, log. |
| `PUT /api/show` | Replace the active show: `{rev, config}` (409 with the current version if `rev` is stale). |
| `GET /api/shows[/<name>][?download]` · `POST /api/shows` | List, fetch · `{action: create \| duplicate \| import \| rename \| delete \| activate, name, from, title, config}`. |
| `GET` · `POST ?name=` · `DELETE /api/media[/<name>]` | The media library (raw body upload: images, videos, fonts, data files for the feeds). |
| `GET` · `PUT /api/settings` | OBS link and Companion (the OBS password never comes back). |
| `GET /api/modules/<id>/status` | A module's state for the panel (a feed's health, the chat's messages, the A350F relay's upstreams…). |
| `GET /meteo/geocode?q=` | The weather module's place search. |
| `/adsb/…` · `/wx/<ICAO>` · `/flight-log/<file>` | The A350F module's relay (see its README). |

## Migrating from the single-file overlays

The first versions of the eclipse and A350F graphics were single HTML pages
(`eclipse-widget-broadcast.html`, `a350f-first-flight.html`) with a relay
(`a350f-relay.js`) and a status page; they are now the `eclipse` and `a350f` modules, and
the pages are gone (the git history has them). For an OBS set up with them:

| Before | Now |
|---|---|
| `node a350f-relay.js` | `node server.js`: the same port, the same `/adsb/`, `/wx/` and `/flight-log/` routes and options, the same recordings. |
| `eclipse-widget-broadcast.html?…` · `a350f-first-flight.html?…` | `overlay.html`, with the `eclipse` or `a350f` show open. |
| `?lat=` `?lon=` `?t0=` `?reg=` `?tiles=` `?units=` `?demo`… | The module's settings (Régie › Modules). |
| `?layout=` `?main=` `?card=` `?map=` | The live state: set it with the commands; it is kept, and shared by every source. |
| `?obspw=` `?obsport=` · `?companion=` | Réglages › OBS · Companion (once, for every output). |
| `a350f-status.html` | Régie › Modules › Premier vol A350F, and the rundown. |
| `{"eclipse": …}` · `{"a350f": …}` buttons, `eclipse_*` · `a350f_*` variables | Unchanged. |

## Files

| Path | |
|---|---|
| `server.js` | The server: shows, live state, commands, OBS link, Companion, modules, API, static files. |
| `overlay.html` · `panel.html` | The output (OBS browser source) and the Régie. |
| `engine/` | `shared.js` (time, bindings, helpers shared with the server), `theme.js`, `motion.js`, `gfx.js` (the graphic registry), `output.js`, `graphics/` (one file per type), `panel/`, `fonts/`. |
| `modules/<id>/` | The modules, each with its README. |
| `shows/` | The shows: `demo`, `emission`, `sport`, `eclipse`, `a350f`. |
| `media/` | Uploaded images, videos, fonts and data files (`logo-exemple.svg`, `exemple-breves.csv` for the demos). |
| `data/` | This machine's settings and live state (git-ignored). |
| `flight-log/` | The A350F module's recordings (git-ignored). |

## License

The fonts in `engine/fonts/` are under the SIL Open Font License 1.1 (the licences are in
`engine/fonts/licenses/`), taken from [Fontsource](https://fontsource.org): Barlow
Condensed © 2017 The Barlow Project Authors, Archivo © 2020 The Archivo Project Authors,
Saira © 2020 The Saira Project Authors, Oswald © 2016 The Oswald Project Authors, Bebas
Neue © 2010 Dharma Type, Inter © 2020 The Inter Project Authors, JetBrains Mono © 2020
The JetBrains Mono Project Authors.

The eclipse module loads the [Astronomy Engine](https://github.com/cosinekitty/astronomy)
JavaScript library, MIT-licensed, © 2019–2023 Don Cross
(`modules/eclipse/astronomy.browser.min.js`; see the license header inside that file).

Third-party data, credited on screen: weather from [Open-Meteo](https://open-meteo.com)
(CC BY 4.0); ADS-B data from [adsb.lol](https://adsb.lol) (ODbL) and
[adsb.fi](https://adsb.fi) (personal, non-commercial use, with attribution); map tiles ©
OpenStreetMap contributors (ODbL). `modules/a350f/places.js` is derived from
[GeoNames](https://www.geonames.org) (CC BY 4.0); Toulouse's weather in the A350F module is
the public METAR of the US National Weather Service's
[aviationweather.gov](https://aviationweather.gov) API.
