# Module `eclipse` — Éclipse solaire

A solar eclipse seen from one place, computed live with the
[Astronomy Engine](https://github.com/cosinekitty/astronomy) (`astronomy.browser.min.js`,
in this folder): the broadcast overlay of the 12 August 2026 eclipse, on the overlay
engine. Switch it on in the Régie's **Modules** tab; the `eclipse` show comes with it.

## What it gives

- **Circumstances** for the place in the settings: first contact, maximum, last contact,
  the obscuration now and at its maximum, the Sun's altitude and bearing, sunset (an
  eclipse that ends after sunset is followed below the horizon).
- **A headline and a countdown** for the bandeau (to the next milestone), a status for the
  strap, the contact times for the ticker, the progress line and its marks.
- **Two visuals** for the bandeau:
  - `sky` — in the lower third's square, the Sun with the Moon's bite; on the fullscreen
    canvas, the sky map (trajectories, horizon, contact markers, the two discs oversized
    on their paths, framed clear of the blocks); in the corner card, the same map scaled;
  - `real` — the two discs at their true apparent size, the camera zooming to keep both in
    frame.
- **A demo** that plays the eclipse accelerated from 3 minutes before first contact — the
  same moment on every output.

## Settings

| Setting | |
|---|---|
| Nom du lieu, latitude, longitude, altitude | The place. Paris by default: shows are versioned, so keep coordinates you can publish. |
| Éclipse cherchée à partir du | The first eclipse visible from the place after this date. |
| Bandeau de l'éclipse | The bandeau the `{"eclipse": …}` commands drive (default: the one showing the sky). |
| Démo, vitesse | The accelerated demo. |

## Commands

The bandeau's own commands (`air.*`, `layout.*`, `main.*`, `card.*`), sent to `eclipse`,
drive the module's bandeau — so Companion buttons made for the original overlay
(`{"eclipse": "air.on.full"}`, and the older `{"eclipseLowerThird": …}`) still work.
`main.sky` / `main.real` pick the visual on the canvas. The module's own command:
`demo.restart`.

## Companion variables

| Variable | Values | |
|---|---|---|
| `eclipse_air` · `_layout` · `_main` · `_card` | `on`/`off`, `lower`/`full`, `sky`/`real`, `on`/`off` | The module's bandeau. |
| `eclipse_phase` | `attente` · `en_cours` · `max_passe` · `sous_horizon` · `terminee` | Waiting for first contact, in progress, past maximum, Sun set but eclipse still on, over. |
| `eclipse_countdown` | `00:13:41`, `2d 05h 42m` | Countdown to the next milestone. |
| `eclipse_obscuration` | `0.0`–`100.0` | The obscuration now, raw. |
| `eclipse_status` | `Éclipse en cours` | The phase in words. |
| `eclipse_next` · `eclipse_eta` | `maximum dans` · `24 min` | The next milestone, and a coarse countdown to it (changes once a minute). |
| `eclipse_pct` · `eclipse_pct_max` | `42,7 %` · `96,4 %` | Obscuration now, and at the maximum. |
| `eclipse_sun` | `12,3° au-dessus de l'horizon (OSO)` | The Sun's altitude and bearing. |
| `eclipse_t_c1` · `_t_max` · `_t_sunset` · `_t_c4` | `19:28` | Times of first contact, maximum, sunset, last contact. |
| `eclipse_site` | `Thonac (Dordogne)` | The place's name. |

In the graphics, the same values are `{{eclipse.<name>}}` (plus `obsc`, `sunpos`,
`timer_label` for the screen). [`twitch-messages.md`](twitch-messages.md) has ready-to-paste
chat messages built from them, for a Companion trigger that posts the eclipse's state to
Twitch every few minutes.

## Updating the library

Take `astronomy.browser.min.js` from upstream's
[`source/js/`](https://github.com/cosinekitty/astronomy/tree/master/source/js) — **not**
`astronomy.min.js`, the Node/CommonJS build, which fails in a page with
`exports is not defined`.
