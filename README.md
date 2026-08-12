# EclipseGraphics

Browser-source graphics for a live broadcast of the 12 August 2026 total solar eclipse
in **Thonac, Dordogne** (`Europe/Paris`). Both widgets take `lat`/`lon`/`alt` query
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

## License

Both widgets load the [Astronomy Engine](https://github.com/cosinekitty/astronomy)
JavaScript library, MIT-licensed, © 2019–2023 Don Cross, from `astronomy.browser.min.js`. See the
license header inside that file.
