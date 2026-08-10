# EclipseGraphics

Browser-source graphics for a live broadcast of the 12 August 2026 total solar eclipse
in **Thonac, Dordogne** (lat 45.02262, lon 1.11732, elev 180 m, `Europe/Paris`). Local
circumstances (contact times, obscuration %, sun position) are computed with the
[cosinekitty/astronomy](https://github.com/cosinekitty/astronomy) library (MIT), bundled
inline in each file, with hardcoded fallback timings if the live computation throws.

## Files

| File | Purpose |
|---|---|
| `eclipse-widget.html` | Compact status bar widget. Supports a demo/preview mode, no OBS or Companion integration. |
| `eclipse-widget-broadcast.html` | Full broadcast overlay (lower-third + fullscreen scene) with live obs-websocket control and Bitfocus Companion feedback. |

Both are static, self-contained HTML files meant to be added as an OBS **Browser Source**
(transparent background).

## `eclipse-widget.html` — query parameters

| Param | Description |
|---|---|
| `?demo` | Enable demo mode: fast-forwards through the eclipse timeline instead of using real time. |
| `?speed=N` | Demo playback speed multiplier (default `120`). Only relevant with `?demo`. |

## `eclipse-widget-broadcast.html` — query parameters

| Param | Description |
|---|---|
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
| `show` | Slide the bar on air (in whichever layout — lower-third or fullscreen — is already set). |
| `showFullscreen` | Reveal directly into the fullscreen layout: skips the lower-third frame and the lower-third↔fullscreen morph entirely, unlike stacking `show` then `fullscreen`. |
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

Variables are only pushed when their value changes.

## License

Both files bundle the [Astronomy Engine](https://github.com/cosinekitty/astronomy)
JavaScript library, MIT-licensed, © 2019–2023 Don Cross. See the license header inside
each HTML file.
