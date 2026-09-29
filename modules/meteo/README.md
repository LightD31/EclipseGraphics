# Module `meteo` — Météo

The weather where you are, from [Open-Meteo](https://open-meteo.com): free, no key, data
under CC BY 4.0 (credit « Météo : Open-Meteo.com »; the fullscreen visual shows it). The
server asks every 15 minutes (a setting), once for every output.

## Setting up

In **Modules**, switch *Météo* on, type a town in the search box and pick it (the name,
latitude and longitude fill in), and choose the units (°C/°F; km/h, m/s, knots, mph). A
paid Open-Meteo plan or your own Open-Meteo server goes in « Adresse du service » and
« Clé d'API » — or give the key as the `OPEN_METEO_APIKEY` environment variable, since the
settings are saved in the show's file.

Then:

- the **Météo** graphic (« + Ajouter » → *Module « Météo »*): a corner chip with the
  icon, the temperature, the place and the sky, optionally the day's range and the next
  days;
- the bandeau's visual **Météo** (`module:meteo.now`, in « Panneau et plein écran »): the
  icon and temperature in the lower third's square; in fullscreen, the place, now in big,
  feels-like, wind, gusts, humidity, and three days;
- the variables in any text, and ready-made lists for the tickers: `{{meteo.messages}}`
  for a Défilant (« Messages d'une variable »), `{{meteo.ticker}}` for a bandeau's ticker.

If the service refuses (a 429 when the free quota of a shared address is used up) the
module keeps the last figures, says `erreur`, and tries again an hour later.

## Variables

| Variable | Example |
|---|---|
| `{{meteo.lieu}}` | `Toulouse` |
| `{{meteo.temp}}` · `temp_n` · `ressenti` | `18 °C` · `18` · `16 °C` |
| `{{meteo.ciel}}` · `resume` · `icone` | `Partiellement nuageux` · `18 °C, partiellement nuageux` · `partly` |
| `{{meteo.vent}}` · `vent_dir` · `vent_txt` · `rafales` | `12 km/h` · `O` · `vent d'ouest, 12 km/h` · `28 km/h` |
| `{{meteo.humidite}}` · `pluie` | `71 %` · `40 %` (today's chance of rain) |
| `{{meteo.min}}` · `max` · `lever` · `coucher` | the day's range, sunrise and sunset |
| `{{meteo.demain}}` · `j1` · `j2` · `j3` | `pluie faible, 11 à 17 °C` · `mercredi : pluie faible, 11 à 17 °C`… |
| `{{meteo.maj}}` · `etat` | the last update's time · `ok` or `erreur` |

In Companion: `meteo_temp`, `meteo_ciel`, `meteo_vent_txt`… Command: `refresh` (update now).
