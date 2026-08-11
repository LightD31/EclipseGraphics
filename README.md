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
| `?fs` | Start directly in the fullscreen layout (use on a dedicated browser source). |
| `?noreal` | Start with the true-scale inset "real size" card hidden (still toggleable). |
| `?obspw=PASSWORD` | obs-websocket authentication password. |
| `?obsport=PORT` | obs-websocket port (default `4455`). |
| `?companion=HOST[:PORT]` | Enables pushing live state to a Bitfocus Companion instance's custom-variable HTTP API (port defaults to `8000`, Companion's web/API port). |
| `?noautoanim` | Disable the automatic slide-in/out that normally follows the OBS source's own visibility toggle (see below). |

## Control: driving the widget from OBS / Companion

By default, the bar automatically slides in whenever OBS marks its Browser Source as
visible (e.g. the scene containing it goes live) and parks off-screen the moment the
source is hidden — no Companion action needed. Add `?noautoanim` to turn this off: the
source's own visibility no longer drives the animation, and the bar only reacts to
explicit `show`/`hide` commands (below), so you can, for example, leave the source
always-visible in OBS and use Companion buttons as the sole on/off switch.

The broadcast widget opens a WebSocket to `ws://127.0.0.1:<obsport>` (obs-websocket v5
protocol) and authenticates with `obspw` when OBS requires it (SHA-256 challenge/salt
handshake). It then listens for a `CustomEvent` whose `eventData` is
`{"eclipseLowerThird": "<command>"}`. In Companion, send this via the **OBS Studio →
Broadcast Custom Event** action.

### Actions / commands (`eclipseLowerThird` value)

| Command | Effect |
|---|---|
| `show` | Slide the bar on air (in whichever layout — lower-third or fullscreen — is already set). No-op if the bar is already on air. |
| `showFullscreen` | Land on air in the fullscreen layout, whatever the current state. Off air, it reveals straight into fullscreen — skipping the lower-third frame and the lower-third↔fullscreen morph entirely, unlike stacking `show` then `fullscreen`. Already on air in the lower third, it morphs across like `fullscreen`. No-op if already on air in fullscreen. |
| `showLower` | Land on air in the lower-third layout, mirroring `showFullscreen`: reveals straight into the lower third when off air, and collapses an already-visible fullscreen back down like `lower`. No-op if already on air in the lower third. |
| `hide` | Slide the bar off air. |
| `fullscreen` | Morph from the lower-third into the fullscreen sky scene. |
| `lower` | Morph back from fullscreen to the lower-third. |
| `toggleView` | Toggle between lower-third and fullscreen. |
| `showReal` | Show the true-scale inset card (fullscreen layout only). |
| `hideReal` | Hide the true-scale inset card. |
| `toggleReal` | Toggle the true-scale inset card. |

Transitions use the View Transitions API where available (Chromium 111+ / modern OBS
CEF), falling back to a scripted reveal on older browsers.

### Manual / preview control (outside Companion)

- **R** — toggle the true-scale inset card (also usable via OBS "Interact").
- **Click** — toggle show/hide (preview only, when `window.obsstudio` isn't present).
- **Double-click** — toggle the fullscreen morph (preview only).

## Companion feedback: custom variables

With `?companion=HOST[:PORT]` set, the widget `POST`s state changes to:

```
http://HOST:PORT/api/custom-variable/eclipse_<name>/value?value=<value>
```

Create these custom variables in Companion beforehand; the widget then keeps them live
for button feedbacks and key text (e.g. `$(custom:eclipse_countdown)`):

| Variable | Values | Description |
|---|---|---|
| `eclipse_view` | `fullscreen` \| `lower` | Current layout. |
| `eclipse_real` | `on` \| `off` | Whether the true-scale inset card is shown. |
| `eclipse_visible` | `on` \| `off` | Whether the bar is currently on air. |
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
