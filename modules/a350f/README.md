# Module `a350f` — Premier vol A350F

The first flight of the Airbus A350F (**F-WXLD**, MSN 700), tracked live over ADS-B: the
overlay of 29 September 2026, on the overlay engine. The `a350f` show comes with it. Any
aircraft can be followed: registration, transponder address and schedule are settings.

## What it shows

- **Lower third** — the live map in the square, following the aircraft; altitude, ground
  speed, vertical speed, heading and distance from Toulouse in the strap; the headline
  with its timer (countdown to the scheduled take-off, then flight time, then total flight
  time once landed); a ticker with the aircraft's facts before take-off and the flight's
  milestones after it.
- **Fullscreen** — the map on the whole canvas with the track in red, the flight data under
  the headline block (column `telemetry`), and the **flight profile** (altitude and speed
  over time) in the corner card; `main.profile` swaps them.
- **Recap** (`layout.recap`) — after landing: the whole route and the flight's numbers
  (column `recap`), compared with the A350-900 and A350-1000 first flights. Setting
  « Bilan : automatique » moves an on-air fullscreen to it 3 minutes after landing.

The headline follows the flight by itself (*l'A350F roule vers la piste* → *décollage !* →
*en montée* / *essais en cours* / *en descente* → *en finale* → *premier vol réussi !*); a
low pass, a go-around or a touch-and-go gets its own headline for three minutes. Each
milestone (take-off and its runway, 10 000 ft, each level-off, Mach 0.80 / 0.85, the
Atlantic, top of descent, landing…) is announced in the show's flash and marked on the
profile. The position is told in words (*à 12 km au nord de Mont-de-Marsan (Landes)*,
*au large d'Arcachon*), offline, from `places.js`. Before take-off the ticker rotates the
aircraft's facts and Toulouse's weather (METAR). The figures roll between reports like
instruments. An emergency squawk (7500 / 7600 / 7700) switches to neutral wording and
raises `a350f_alert`: nothing alarming goes on air by itself.

## Live data: ADS-B through the extension

Positions come from the aircraft's transponder through the free community aggregators
[adsb.lol](https://adsb.lol) (ODbL) and [adsb.fi](https://adsb.fi). Neither sends CORS
headers, so the bundle's extension relays them (`adsb/…`): it asks each API every 5 s (`every`),
taking turns — a fresh position every 2.5 s whatever the number of outputs — and leaves an
API alone after an error or a 429 (30 s, doubling up to 5 min, or its `Retry-After`).

**Every point is recorded** in `flight-log/<hex>-<UTC date>.jsonl` (git-ignored), reloaded
on restart; holes (outages, the aircraft out of coverage) are filled from adsb.lol's own
trace of the aircraft. The outputs fetch the recording on load and after a reconnection,
so a source opened mid-flight shows the whole track at once. The extension only polls
while the active show uses the module (not in demo), or for the aircraft given in `watch`.

Its options go in the bundle's configuration, `cfg/EclipseGraphics.json`:
`{"modules": {"a350f": {"every": 5, "watch": "39856b", "log": "flight-log"}}}`.

| Option | |
|---|---|
| `every` | Seconds between two requests to the same API (default `5`, minimum `2`). |
| `watch` | Aircraft to record from startup, whatever the show (`"hex,hex"`). |
| `log` | Where the recordings go (default `flight-log/`, in the bundle's folder). |

| Route (under `/bundles/EclipseGraphics/`) | |
|---|---|
| `GET adsb/hex/<hex>` · `adsb/reg/<reg>` · `adsb/callsign/<cs>` | The aircraft, as the APIs give it. |
| `GET adsb/history/<hex>[?since=<ms>][&raw]` | The recording, oldest first. |
| `GET wx/<ICAO>` | The airport's METAR ([aviationweather.gov](https://aviationweather.gov)), cached 5 min. |
| `GET flight-log/<file>` | A day's recording as written. |

## Settings

Aircraft (registration, Mode S address, callsign, MSN), schedule (day, planned take-off
and landing — or a planned duration —, the actual take-off when ADS-B missed it), data
(another machine's relay, `http://<host>:9090/bundles/EclipseGraphics`; polling period), basemap (tile template `{z}/{x}/{y}` or `none`,
recolouring, credit; OpenStreetMap by default, fine for one broadcast under its
[tile policy](https://operations.osmfoundation.org/policies/tiles/)), units, recap, the
graphics it drives, and a synthetic demo flight (speed, start point, a simulated squawk).

## Commands

Sent to `a350f` (HTTP, or `{"a350f": "<command>"}` as an OBS custom event, like the
original overlay):

| Command | |
|---|---|
| `t0.HH:MM` · `t0.+N` · `t0.-N` · `t0.reset` | Reschedule the take-off. |
| `land.HH:MM` · `land.+N` · `land.-N` · `land.reset` | Move the planned landing. |
| `takeoff.now` · `takeoff.HH:MM[:SS]` · `takeoff.auto` | The actual take-off, when ADS-B missed it. |
| `headline.<text>` · `headline.set` + text · `headline.auto` | The operator's own headline. |
| `mode.neutral` · `mode.auto` · `mode.toggle` | Factual wording only. |
| `units.metric` · `units.aviation` · `units.toggle` | Which units come first. |
| `reset` · `demo.restart` | Forget the outputs' stored track (the recording stays) · restart the demo. |
| `banner.<text>` · `banner.set` + text · `banner.clear` | The module's flash. |
| `air.*` · `layout.*` (`lower`, `full`, `recap`) · `main.map` / `main.profile` · `card.*` · `map.track` / `map.follow` | The module's bandeau. |

## Companion variables

| Variable | Example | |
|---|---|---|
| `a350f_air` · `_layout` · `_main` · `_card` · `_map` | `on`, `full`, `map`, `on`, `track` | The module's bandeau. |
| `a350f_mode` · `_units` · `_headline` | `auto`, `aviation`, `custom` | The operator's overrides. |
| `a350f_alert` | `7700` or empty | Emergency squawk or status. |
| `a350f_event` · `_event_text` · `_event_n` | `palier` · `En palier à 31 000 ft` · `4` | The last milestone announced, and how many so far (for a "variable changed" trigger). |
| `a350f_where` | `à 12 km au nord de Mont-de-Marsan (Landes)` | The position in words. |
| `a350f_phase` | `attente`, `roulage`, `decollage`, `montee`, `palier`, `descente`, `finale`, `atterri`… | The flight phase. |
| `a350f_signal` · `_source` | `live` / `stale` / `none` · `adsb.lol + adsb.fi` | Whether ADS-B is current, and from where. |
| `a350f_timer` · `_time` | `01:23:45` · `1 h 23` | The timer, and a coarse version (once a minute). |
| `a350f_status` · `_label` | `Premier vol, en montée` · `en vol depuis` | Headline and timer label in words. |
| `a350f_alt` · `_alt_m` · `_speed` · `_speed_kmh` · `_vs` · `_hdg` · `_dist` | `24 500 ft`, `7 470 m`, `460 kt`… | Live figures. |
| `a350f_t_sched` · `_t_land` · `_t_takeoff` · `_t_landing` | `10:30` | Planned and actual times. |
| `a350f_alt_max` · `_speed_max` · `_distance` | `31 000 ft`, `470 kt`, `1 250 km` | The flight's records. |
| `a350f_reg` · `_callsign` | `F-WXLD` · `AIB01` | Identity. |

A periodic Twitch message, and one per milestone on a trigger watching `$(custom:a350f_event_n)`:

```
✈️ Premier vol de l'Airbus A350F en direct de Toulouse · $(custom:a350f_status) · $(custom:a350f_alt), $(custom:a350f_speed) · $(custom:a350f_where)
📍 $(custom:a350f_event_text) · premier vol de l'A350F en direct
```

## Credits

ADS-B data from adsb.lol (ODbL) and adsb.fi (personal, non-commercial use, with
attribution), map tiles © OpenStreetMap contributors (ODbL), credited on screen.
`places.js` is derived from [GeoNames](https://www.geonames.org) (CC BY 4.0). The weather is
the public METAR of the US National Weather Service's aviationweather.gov.
