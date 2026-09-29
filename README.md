# EclipseGraphics

Browser-source graphics for live broadcasts, in one shared on-air look (red headline
band, navy ticker, white strap):

- the 12 August 2026 total solar eclipse in **Thonac, Dordogne** — see below;
- the **first flight of the Airbus A350F** from Toulouse-Blagnac on 29 September 2026,
  tracked live over ADS-B — see [`a350f-first-flight.html`](#a350f-first-flighthtml--premier-vol-de-lairbus-a350f).

The eclipse widgets cover the eclipse over **Thonac, Dordogne** (`Europe/Paris`). Both widgets take `lat`/`lon`/`alt` query
parameters for the observer location, defaulting to Paris (a public, non-identifying
location) when omitted — pass the actual broadcast site's coordinates via the URL. Local
circumstances (contact times, obscuration %, sun position) are computed with the
[cosinekitty/astronomy](https://github.com/cosinekitty/astronomy) library (MIT), loaded
from `astronomy.browser.min.js`, with hardcoded fallback timings if the live computation throws.

## Files

| File | Purpose |
|---|---|
| `eclipse-widget.html` | Compact status bar widget. Supports a demo/preview mode, no OBS or Companion integration. |
| `eclipse-widget-broadcast.html` | Full broadcast overlay (lower-third + fullscreen scene) with live obs-websocket control and Bitfocus Companion feedback. |
| `astronomy.browser.min.js` | Shared Astronomy Engine library (MIT), loaded by both widgets via `<script src>`. |
| `twitch-messages.md` | Ready-to-paste Twitch chat messages (French), built from the Companion custom variables below. |
| `a350f-first-flight.html` | A350F first-flight overlay (lower third + fullscreen live map), same look and same OBS/Companion control scheme as the eclipse overlay. |
| `a350f-relay.js` | Tiny local server the A350F overlay reads its live ADS-B data through, which also records the whole flight (Node 18+, no dependencies). |
| `a350f-status.html` | The operator's page for the A350F overlay (never on air): data health, what is on screen, and every command a click away. Served by the relay. |
| `a350f-places.js` | Towns and coastlines of south-west France / northern Spain, for the A350F overlay's position in words. |

Both widgets are meant to be added as an OBS **Browser Source** (transparent background).
Since `astronomy.browser.min.js` is now a separate file, keep it alongside the widget HTML
file(s) — e.g. deploy the whole folder, or if hosting via URL, serve all three files from the
same directory.

> **Updating the library:** take `astronomy.browser.min.js` from
> [`source/js/`](https://github.com/cosinekitty/astronomy/tree/master/source/js) upstream —
> **not** `astronomy.min.js`, which is the Node/CommonJS build. The CommonJS build assigns to
> a bare `exports` object, so loading it through a `<script>` tag fails immediately with
> `Uncaught ReferenceError: exports is not defined`, and the widgets then die on
> `Astronomy is not defined`. Keeping the upstream filename makes it obvious which build this
> is.

## `eclipse-widget.html` — query parameters

| Param | Description |
|---|---|
| `?lat=N` | Observer latitude in degrees (default `48.8566`, Paris). |
| `?lon=N` | Observer longitude in degrees (default `2.3522`, Paris). |
| `?alt=N` | Observer elevation in meters (default `35`). |
| `?demo` | Enable demo mode: fast-forwards through the eclipse timeline instead of using real time. |
| `?speed=N` | Demo playback speed multiplier (default `120`). Only relevant with `?demo`. |

## `eclipse-widget-broadcast.html` — query parameters

| Param | Description |
|---|---|
| `?lat=N` | Observer latitude in degrees (default `48.8566`, Paris). |
| `?lon=N` | Observer longitude in degrees (default `2.3522`, Paris). |
| `?alt=N` | Observer elevation in meters (default `35`). |
| `?layout=full\|lower` | Layout to start in — `full` for a dedicated fullscreen browser source. |
| `?main=sky\|real` | Which view starts on the canvas (fullscreen): the sky map, or the true-scale view. |
| `?card=on\|off` | Whether the corner card starts shown. |
| `?obspw=PASSWORD` | obs-websocket authentication password. |
| `?obsport=PORT` | obs-websocket port (default `4455`). |
| `?companion=HOST[:PORT]` | Enables pushing live state to a Bitfocus Companion instance's custom-variable HTTP API (port defaults to `8000`, Companion's web/API port). |
| `?noautoanim` | Disable the automatic slide-in/out that normally follows the OBS source's own visibility toggle (see below). |

> `?fs`, `?swap` and `?noreal` are the older shorthands for `?layout=full`, `?main=real`
> and `?card=off`. They still work, so existing browser-source URLs don't need editing.

## Control: driving the widget from OBS / Companion

By default, the bar automatically slides in whenever OBS marks its Browser Source as
visible (e.g. the scene containing it goes live) and parks off-screen the moment the
source is hidden — no Companion action needed. Add `?noautoanim` to turn this off: the
source's own visibility no longer drives the animation, and the bar only reacts to
explicit `air.on`/`air.off` commands (below), so you can, for example, leave the source
always-visible in OBS and use Companion buttons as the sole on/off switch.

The broadcast widget opens a WebSocket to `ws://127.0.0.1:<obsport>` (obs-websocket v5
protocol) and authenticates with `obspw` when OBS requires it (SHA-256 challenge/salt
handshake). It then listens for a `CustomEvent` whose `eventData` is
`{"eclipse": "<command>"}`. In Companion, send this via the **OBS Studio → Broadcast
Custom Event** action.

### Actions / commands (`eclipse` value)

Every command is `<property>.<value>` — one namespace per thing the widget can be, with
a `.toggle` on each. The values are the ones the matching feedback variable reports, so
a button sends and tests the same word.

| Command | Effect |
|---|---|
| `air.on` | Slide the bar on air, in whichever layout is already set. No-op if it is already on air. |
| `air.off` | Slide the bar off air. |
| `air.toggle` | On air ↔ off air. |
| `air.on.full` | Land on air in the fullscreen layout, whatever the current state. Off air it reveals straight into fullscreen — the lower third is never on screen and there is no morph to sit through, unlike stacking `layout.full` after `air.on`. Already on air in the lower third, it morphs across. |
| `air.on.lower` | The same for the lower third: reveals straight into it when off air, collapses an on-air fullscreen back down otherwise. |
| `layout.full` | Fullscreen scene. On air it morphs; off air it just arms the layout for the next reveal. |
| `layout.lower` | Lower third, same rules. |
| `layout.toggle` | Lower third ↔ fullscreen. |
| `main.sky` | Put the sky map on the canvas, the true-scale view in the corner card (the default). |
| `main.real` | Put the true-scale view on the canvas, the sky map in the corner card. |
| `main.toggle` | Swap the two. |
| `card.on` / `card.off` / `card.toggle` | Show / hide / toggle the corner card (fullscreen only). |

> **Renamed in this version.** The old vocabulary (`show`, `showFullscreen`, `showLower`,
> `hide`, `fullscreen`, `lower`, `toggleView`, `showReal`, `hideReal`, `toggleReal`) is
> gone, along with the `eclipseLowerThird` event key — a name from before the widget grew
> a fullscreen scene. That key is still read, so an existing Companion button only needs
> its command string updated: `show` → `air.on`, `hide` → `air.off`,
> `showFullscreen` → `air.on.full`, `showLower` → `air.on.lower`, `fullscreen` →
> `layout.full`, `lower` → `layout.lower`, `toggleView` → `layout.toggle`,
> `showReal`/`hideReal`/`toggleReal` → `card.on`/`card.off`/`card.toggle`.

The fullscreen scene draws the same eclipse two ways, and `main.*` decides which one
gets the canvas and which one gets the corner card at bottom-left:

- the **sky map** — trajectories, horizon, contact markers, with the Sun/Moon discs
  oversized so they read on air;
- the **true-scale view** — the two bodies at their real apparent size, so the gap
  between them (and the bite out of the Sun) is the one you would actually see.

Both keep their own live camera in either place, so the Sun/Moon pair sits in the same
part of the frame before and after a swap, and `card.*` acts on the corner card —
whichever of the two is currently in it.

Transitions use the View Transitions API where available (Chromium 111+ / modern OBS
CEF), falling back to a scripted reveal on older browsers.

### Manual / preview control (outside Companion)

- **R** — `card.toggle` (also usable via OBS "Interact").
- **S** — `main.toggle`.
- **Click** — `air.toggle` (preview only, when `window.obsstudio` isn't present).
- **Double-click** — `layout.toggle` (preview only).
- `window.eclipseCommand('<command>')` — run any command from OBS "Interact" or a
  browser console; it is the same entry point Companion drives.

## Companion feedback: custom variables

With `?companion=HOST[:PORT]` set, the widget `POST`s state changes to:

```
http://HOST:PORT/api/custom-variable/eclipse_<name>/value?value=<value>
```

Create these custom variables in Companion beforehand; the widget then keeps them live
for button feedbacks and key text (e.g. `$(custom:eclipse_countdown)`). The first four
are named after the command namespaces and report the values those commands take, so a
button's feedback tests the same word the button sends — `eclipse_layout` is `full`
exactly when `layout.full` is the current state. They replace `eclipse_visible`,
`eclipse_view` and `eclipse_real`, which are gone:

| Variable | Values | Description |
|---|---|---|
| `eclipse_air` | `on` \| `off` | Whether the bar is currently on air. |
| `eclipse_layout` | `full` \| `lower` | Current layout. |
| `eclipse_main` | `sky` \| `real` | Which view owns the canvas: the sky map, or the true-scale one. |
| `eclipse_card` | `on` \| `off` | Whether the corner card is shown. |
| `eclipse_phase` | `attente` \| `en_cours` \| `max_passe` \| `sous_horizon` \| `terminee` | Eclipse phase: waiting for first contact, in progress, past maximum, sun set but eclipse ongoing, or finished. |
| `eclipse_countdown` | e.g. `00:13:41` or `2d 05h 42m` | Countdown to the next milestone shown in the widget. |
| `eclipse_obscuration` | `0.0`–`100.0` | Percentage of the sun's disc currently obscured. |

Alongside those, the widget pushes a set of ready-to-read French strings, meant to be
dropped straight into Companion text — a Twitch status message, button labels, a
stinger caption — without any reformatting:

| Variable | Example | Description |
|---|---|---|
| `eclipse_status` | `Éclipse en cours` | Current phase, in sentence case. |
| `eclipse_next` | `maximum dans` | Label of the next milestone; empty once the eclipse is over. |
| `eclipse_eta` | `24 min`, `1 h 03`, `2 j 05 h` | Coarse countdown to that milestone (empty once over). Unlike `eclipse_countdown` it only changes once a minute, so text built from it doesn't churn every second. |
| `eclipse_pct` | `42,7 %` | Current obscuration, French-formatted with its sign. |
| `eclipse_sun` | `12,3° au-dessus de l'horizon (OSO)` | Sun altitude and compass bearing, or `sous l'horizon`. |
| `eclipse_pct_max` | `96,4 %` | Maximum obscuration for the site. |
| `eclipse_t_c1` / `eclipse_t_max` / `eclipse_t_sunset` / `eclipse_t_c4` | `19:28` | Local times of first contact, maximum, sunset and last contact. |

Variables are only pushed when their value changes — except the static ones
(`eclipse_pct_max`, `eclipse_t_*`), re-sent every minute so a Companion restarted
mid-show picks them back up instead of staying stuck with empty values.

### Periodic Twitch status message

[`twitch-messages.md`](twitch-messages.md) has ready-to-paste chat messages built from
those variables — one per `eclipse_phase` value, plus an all-phases version and short
variants — for a Companion trigger that posts the eclipse's live state to chat every
few minutes.

## `a350f-first-flight.html` — Premier vol de l'Airbus A350F

Live overlay for the maiden flight of the A350F (**F-WXLD**, MSN 700, 2 × Trent XWB-97),
scheduled for **29 September 2026, ~10:30 local** from Toulouse-Blagnac. It reuses the
eclipse overlay's design and choreography one for one:

- **lower third** — a live map square that follows the aircraft, a white strap with
  altitude, ground speed, vertical speed, heading and distance from Toulouse, the red
  headline band with a timer (countdown to the scheduled take-off, then flight time, then
  total flight time once it lands), and a ticker with the aircraft's facts before take-off
  and the flight's milestones after it (take-off time, max altitude, max speed, distance
  flown, landing time);
- **fullscreen** — the whole canvas becomes the map with the track drawn in red, a
  flight-data panel (altitude, ground speed, vertical speed, heading, distance, Mach/IAS)
  under the red block, and a corner card with the **flight profile** (altitude and ground
  speed over time). `main.profile` swaps the two, putting the profile on the canvas.
- **recap** (`layout.recap`) — after landing: the whole route, and a "bilan du premier
  vol" panel (times and runways, duration, distance, max altitude / speed / Mach) with
  bars comparing it with the A350-900 (4 h 05, 2013) and A350-1000 (4 h 18, 2016) first
  flights. `?recap=auto` moves an on-air fullscreen to it 3 minutes after landing.

The headline follows the flight by itself — *premier vol de l'Airbus A350F* → *l'A350F
roule vers la piste* → *course au décollage* → *décollage !* → *en montée* / *essais en
cours* / *en descente* → *retour vers Toulouse* → *en finale* → *premier vol réussi !*
A low pass, a go-around or a touch-and-go (common on first flights) gets its own
headline for three minutes.

On top of that, taking some liberties with the eclipse overlay:

- **Event banners** — each milestone is announced for 8 s (above the strap in the lower
  third, under the map caption in the fullscreen) and marked on the flight profile:
  take-off (with its runway), 10 000 ft, each level-off, Mach 0,80 / 0,85, first time over
  the Atlantic, top of descent, low pass / go-around / touch-and-go, landing.
- **Where it is, in words** — "à 12 km au nord de Mont-de-Marsan (Landes)", "au large
  d'Arcachon", "au-dessus des Pyrénées, près d'Andorre-la-Vieille"… in the strap and under
  the map caption; offline, from `a350f-places.js`.
- **Waiting-time content** — before take-off the ticker rotates the A350F's facts
  (dimensions, masses, cargo door, test campaign) and the **live Toulouse weather**
  (METAR: wind, gusts, temperature, cloud, visibility); after landing, the first-flight
  comparison.
- **Rolling figures** — the altitude carries on at the reported climb rate between
  reports and every readout eases to its new value, like an instrument.
- **Metric mode** — `units.metric` (or `?units=metric`) puts metres and km/h first.
- **Live controls** — reschedule, mark take-off, custom headline, custom banner, neutral
  wording, without touching the source URL (see commands), from Companion or the
  **status page**.
- **Safety** — squawk 7500 / 7600 / 7700 or an emergency status switches to neutral
  wording (no "premier vol réussi" until `mode.auto`) and raises `a350f_alert`; nothing
  alarming goes on air by itself.

### Live data: ADS-B via adsb.lol / adsb.fi

Position, altitude and speeds come from the aircraft's own ADS-B transponder, through
the free community aggregators [adsb.lol](https://adsb.lol) (ODbL) and
[adsb.fi](https://adsb.fi) — both publish a free, key-less API in the standard readsb
format (adsb.fi allows 1 request/s; adsb.lol's limit varies with its load). F-WXLD
transmits as Mode S address **`39A53B`** (per the tar1090 aircraft database); the
overlay also looks it up by registration every few polls, and follows whatever address
that returns, in case the transponder is ever re-coded.
Paid APIs (FlightAware, Flightradar24) would work too but need keys; OpenSky's API only
allows browser calls from its own site.

**Run the relay.** Neither API sends CORS headers, so a browser source can't read them
directly. `a350f-relay.js` serves this folder and forwards the API calls from the same
origin. It alternates between the two, so the aircraft gets a fresh position every
2.5 s while each API is asked only once every 5 s — whatever the number of browser
sources or how often they poll. When one errors or rate-limits, the relay leaves it
alone (30 s, doubling up to 5 min while it keeps refusing, or as long as its
`Retry-After` asks) and carries on with the other, at its own 5 s pace. It also
**records the flight** (below), so start it early — before the engines start, ideally —
and leave it running:

```
node a350f-relay.js                 # → http://127.0.0.1:8787/a350f-first-flight.html
node a350f-relay.js --port 9000 --host 0.0.0.0   # reachable from another machine
```

| Relay option | Description |
|---|---|
| `--port N` / `--host ADDR` | Where to listen (default `127.0.0.1:8787`). |
| `--every N` | Seconds between two requests to the same API about the aircraft (default `5`, minimum `2`; 15, or 3×N, while it isn't being seen). With both APIs up, a new position every N/2 s. |
| `--watch HEX[,HEX…]` | Aircraft to record from startup (default `39a53b`, F-WXLD; `none` for none). Any aircraft the page asks about is added. |
| `--log DIR` | Where the recording goes (default `flight-log/` next to the relay, git-ignored). |

Then add the browser source (1920×1080) as
`http://127.0.0.1:8787/a350f-first-flight.html?obspw=…&companion=…`. A page opened as
a local file can still use a running relay with `?relay=http://127.0.0.1:8787`.

### Flight recording: the whole flight, whatever gets disconnected

Every point the API returns is kept, with all its fields, so the flight can be rebuilt
end to end after any interruption:

- **The relay records by itself.** It polls the watched aircraft every 2.5 s, each API
  in turn every 5 s (`--every`; every 7.5 s while it hasn't been seen for 10 minutes),
  whether or not a browser source is open, and appends every new position to
  `flight-log/<hex>-<UTC date>.jsonl` — one JSON object per line, the API's full
  aircraft object plus `_t` (when the position was measured, epoch ms) and `_src`
  (which API gave it). The log is reloaded when the relay restarts.
- **Holes are filled from adsb.lol's own track.** If the relay loses the APIs (network
  down), is stopped for a while, or the aircraft goes out of receiver coverage, it
  fetches adsb.lol's recorded trace of the aircraft (the one its map draws, a point every
  ~10–20 s) once back, and merges it into the gap — keeping its own finer points wherever
  it has them. It does the same at startup, so starting the relay late still recovers the
  day's flight so far.
- **The page catches up from the relay.** On load, after a reconnection and every
  minute, the page fetches the relay's recording (`/adsb/history/<hex>`) and merges it
  into its own, then replays the flight to re-derive take-off, landing, max altitude,
  max speed and distance flown. A browser source refreshed mid-flight, or opened for the
  first time after take-off, therefore shows the whole track and profile at once. The
  page also keeps every point in its own local storage (per registration and day), so a
  refresh doesn't lose anything even without the relay.

Tested by killing the relay for 75 s mid-flight: once it was back, the page's track had no
hole longer than 21 s across the outage. Take-off time is detected when the aircraft
leaves the ground; if neither the page nor the relay saw that (both started after
take-off, and the trace starts later), set it with `?takeoff=HH:MM`.

| Relay route | Returns |
|---|---|
| `GET /adsb/history/<hex>` | The recording, oldest first: `{hex, now, boot, filled, count, points}`. `?since=<epoch ms>` for points measured from then on; `?raw` for the full API objects instead of the fields the page uses. |
| `GET /flight-log/<file>.jsonl` | A day's log file as written (the folder is served like the rest). |
| `GET /wx/<ICAO>` | The airport's latest METAR from [aviationweather.gov](https://aviationweather.gov/data/api/) (free, no key), cached 5 min. |
| `GET /status` | Relay health, upstreams, recording, the overlays' reported state, last log lines (for the status page). |
| `POST /state` · `POST /command` | Overlays report their state every 2 s and pick up queued commands in the answer; the status page queues commands when it isn't connected to OBS. |

> **On a network:** with `--host 0.0.0.0`, anyone who can reach the relay can also queue
> commands for the on-air overlay (`POST /command`). Keep the default `127.0.0.1` unless
> the network is yours.

### Status page (`a350f-status.html`)

Open `http://127.0.0.1:8787/a350f-status.html` in any browser on the broadcast machine —
it is the operator's page, never a browser source:

- **health tiles** — relay, ADS-B signal age, adsb.lol / adsb.fi (backoff, errors),
  recording, overlays connected, OBS connection;
- **what is on air** — each overlay's headline, timer, layout, units, tone, phase,
  figures and position, and any transponder alert;
- **the flight's events** and the relay's log;
- **every command** as a button, plus fields for a new take-off time (+5 / +15 min), the
  actual take-off ("maintenant"), a custom headline and a custom banner.

Commands go through OBS's websocket when the page is connected to it (port and password
typed once, remembered by that browser) — instant, like Companion — and through the
relay otherwise (each overlay picks them up within 2 s).

### Query parameters

| Param | Description |
|---|---|
| `?t0=HH:MM` | Scheduled take-off, local time (default `10:30`). |
| `?date=YYYY-MM-DD` | Flight day (default `2026-09-29`) — for a postponed flight. |
| `?land=HH:MM` | Planned landing, local time (default `14:05`): the progress line, the profile's time axis and the ticker. |
| `?dur=N` | Instead of `?land`: a planned flight time in minutes after take-off. |
| `?takeoff=HH:MM[:SS]` | Actual take-off time, when the page missed it. |
| `?reg=` / `?hex=` / `?callsign=` | Aircraft to track (default `F-WXLD` / `39a53b`; callsign optional). |
| `?msn=N` | MSN shown on screen (default `700`). |
| `?poll=N` | Seconds between the page's polls of the relay (default `2`, minimum `1`). The relay answers with what it last fetched, so this doesn't change how often the API is asked (that's the relay's `--every`). Without a relay, the page never asks the APIs more often than every 5 s. |
| `?relay=URL` | Relay to use when the page isn't served by it. |
| `?reset` | Forget the page's stored track and times for this aircraft and day (the relay's recording, if any, is fetched again). |
| `?demo` | Play a synthetic first flight instead of live data (taxi, take-off from 32L, a loop over the Atlantic and along the Pyrenees, landing back). |
| `?speed=N` / `?from=N` | Demo speed multiplier (default `30`) / start point in minutes relative to the scheduled take-off (default `-8`; e.g. `from=60` to preview mid-flight). |
| `?tiles=URL` | Basemap tile template (`{z}/{x}/{y}`, `{s}` → a–d, `{r}` → `@2x`), or `none`. Default: OpenStreetMap. |
| `?tilestyle=invert\|tint\|raw` | How the tiles are recoloured to the navy: `invert` for light maps (default for OSM), `tint` for dark maps (default for `?tiles=`), `raw` for as-is. |
| `?attrib=TEXT` | Map credit for a custom `?tiles=` provider. |
| `?layout=full\|lower\|recap` · `?main=map\|profile` · `?card=on\|off` · `?map=track\|follow` | Starting state (see commands). |
| `?units=metric` | Metres, km/h and m/s first (ft, kt, ft/min underneath). Default: aviation units. |
| `?recap=auto` | Three minutes after landing, an on-air fullscreen moves to the recap by itself. |
| `?squawk=7700` | Demo only: inject an emergency squawk, to rehearse the neutral mode. |
| `?debug` | Expose `window.a350fDebug` (`ingest`, `state`) for automated tests. |
| `?obspw=` · `?obsport=` · `?companion=HOST[:PORT]` · `?noautoanim` | As for the eclipse overlay. |

The default basemap is OpenStreetMap's own tile server, inverted into the broadcast
navy. That is fine for one broadcast under the
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/) (credit shown
on screen); for heavier or commercial use, point `?tiles=` at a keyed provider (MapTiler,
Stadia, CARTO…). CARTO's formerly free basemaps now return "API key required" tiles.

### Commands (`a350f` custom event)

Same vocabulary and mechanics as the eclipse overlay, under its own event key, so both
overlays can live in the same OBS and Companion: **OBS Studio → Broadcast Custom Event**
with `{"a350f": "<command>"}`, or `window.a350fCommand('<command>')`.

| Command | Effect |
|---|---|
| `air.on` / `air.off` / `air.toggle` | Slide on / off air. |
| `air.on.full` / `air.on.lower` / `air.on.recap` | Land on air in the named layout in one step. |
| `layout.full` / `layout.lower` / `layout.recap` / `layout.toggle` | Fullscreen map, lower third, or the after-flight recap (morphs when on air; toggle is lower ↔ full). |
| `main.map` / `main.profile` / `main.toggle` | Which view owns the fullscreen canvas: the map, or the flight profile. |
| `card.on` / `card.off` / `card.toggle` | Corner card (whichever view is in it). |
| `map.track` / `map.follow` / `map.toggle` | Fullscreen map framing: the whole track (default), or riding with the aircraft. |
| `t0.HH:MM` · `t0.+N` / `t0.-N` · `t0.reset` | Reschedule the take-off (countdown, ticker and profile follow), shift it by N minutes, or go back to `?t0`. |
| `land.HH:MM` · `land.+N` / `land.-N` · `land.reset` | Move the planned landing (progress line, profile, ticker), shift it by N minutes, or go back to `?land`. |
| `takeoff.now` · `takeoff.HH:MM[:SS]` · `takeoff.auto` | Set the actual take-off time (when the page missed it), or back to what ADS-B showed. |
| `headline.<text>` · `headline.set` + `"text"` · `headline.auto` | Replace the automatic headline with your own, or give it back. |
| `banner.<text>` · `banner.set` + `"text"` · `banner.clear` | Show your own 8-second banner / clear the banner queue. |
| `mode.neutral` / `mode.auto` / `mode.toggle` | Factual wording only (no "décollage !", no "premier vol réussi !"), or back to normal. |
| `units.metric` / `units.aviation` / `units.toggle` | Which units come first. |

The last five are kept per aircraft and day, so they survive a refresh, and are shared by
every browser source of the overlay. `"text"` is a second field of the custom event —
`{"a350f": "headline.set", "text": "Les pilotes saluent Toulouse"}` — for text that
contains dots.

Preview keys: **R** card, **S** swap, **F** track/follow; click and double-click as for
the eclipse overlay.

### Companion variables (`a350f_*`)

| Variable | Example | Description |
|---|---|---|
| `a350f_air` / `_layout` / `_main` / `_card` / `_map` | `on`, `full`, `map`, `on`, `track` | View state, one per command namespace (`_layout` can be `recap`). |
| `a350f_mode` / `_units` / `_headline` | `auto` \| `neutral` / `aviation` \| `metric` / `auto` \| `custom` | The operator overrides' state. |
| `a350f_alert` | `7700`, `general`… or empty | Emergency squawk or status reported by the transponder. |
| `a350f_event` / `_event_text` / `_event_n` | `palier` / `En palier à 31 000 ft (9 450 m · FL310)` / `4` | The banner just shown; `_event_n` counts them, for a "variable changed" trigger (stinger, chat message). |
| `a350f_where` | `à 12 km au nord de Mont-de-Marsan (Landes)` | Where the aircraft is, in words. |
| `a350f_phase` | `attente` \| `roulage` \| `course` \| `decollage` \| `montee` \| `palier` \| `descente` \| `approche` \| `finale` \| `passage` \| `remise` \| `touchgo` \| `atterri` | Flight phase. |
| `a350f_signal` | `live` \| `stale` \| `none` | Whether ADS-B is current (stale after 30 s without a position). |
| `a350f_source` | `adsb.lol + adsb.fi`, `adsb.lol`, `adsb.fi`, `erreur` | Where the data came from (every source that answered in the last 2 minutes) — `erreur` when no source answers (relay not running?). |
| `a350f_timer` / `a350f_time` | `01:23:45` / `1 h 23` | The on-screen timer, and a coarse version that changes once a minute. |
| `a350f_status` / `a350f_label` | `Premier vol, en montée` / `en vol depuis` | Headline and timer label in sentence case. |
| `a350f_alt` / `_alt_m` | `24 500 ft` / `7 470 m` | Current altitude (`au sol` on the ground). |
| `a350f_speed` / `_speed_kmh` / `_vs` / `_hdg` / `_dist` | `460 kt` / `852 km/h` / `+1 800 ft/min` / `245° OSO` / `85 km` | Live figures (distance from Toulouse-Blagnac). |
| `a350f_t_sched` / `_t_land` / `_t_takeoff` / `_t_landing` | `10:30` | Scheduled take-off and landing, actual times. |
| `a350f_alt_max` / `_speed_max` / `_distance` | `31 000 ft` / `470 kt` / `1 250 km` | Flight records so far. |
| `a350f_reg` / `a350f_callsign` | `F-WXLD` / `AIB01` | Registration, and the callsign the transponder reports. |

For a periodic Twitch message, in the same spirit as [`twitch-messages.md`](twitch-messages.md):

```
✈️ Premier vol de l'Airbus A350F en direct de Toulouse · $(custom:a350f_status) · $(custom:a350f_alt), $(custom:a350f_speed) ($(custom:a350f_speed_kmh)) · $(custom:a350f_where) · $(custom:a350f_label) $(custom:a350f_time)
```

And one per milestone, on a Companion trigger watching `$(custom:a350f_event_n)`:

```
📍 $(custom:a350f_event_text) · premier vol de l'A350F en direct
```

## License

Both eclipse widgets load the [Astronomy Engine](https://github.com/cosinekitty/astronomy)
JavaScript library, MIT-licensed, © 2019–2023 Don Cross, from `astronomy.browser.min.js`. See the
license header inside that file.

The A350F overlay displays third-party data, credited on screen: ADS-B data from
[adsb.lol](https://adsb.lol) (ODbL) and [adsb.fi](https://adsb.fi) (personal,
non-commercial use, with attribution), and map tiles © OpenStreetMap contributors (ODbL).
`a350f-places.js` is derived from [GeoNames](https://www.geonames.org) (CC BY 4.0); the
Toulouse weather is the public METAR served by the US National Weather Service's
[aviationweather.gov](https://aviationweather.gov) API.
