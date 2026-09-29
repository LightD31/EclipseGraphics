# Module `flux` — Flux de données

Outside data as variables: an RSS or Atom feed (a site's headlines for a ticker), a JSON
API (a price, a counter, a result), a CSV file (a Google Sheets sheet « published to the
web » as CSV: a line-up, standings, a programme kept by a colleague), or plain text. The
server fetches each source on its own schedule — browsers can't read most of them (no
CORS) — so every output shows the same thing.

## Setting up

In **Modules**, add a source:

| Field | |
|---|---|
| Identifiant | The variables' name: `{{flux.<id>}}`… |
| Format | RSS/Atom, JSON, CSV, text. |
| Adresse | `https://…`, or a file of the media library: `/media/name.csv` (upload it in Réglages › Médias; the `emission` show reads `/media/exemple-breves.csv`). |
| Toutes les | Seconds between two reads (15 minimum). |
| Éléments gardés | How many items the lists keep. |
| Chemin de la liste | JSON: where the list is (`articles`, `data.items`); empty if the answer is the list. |
| Modèle d'un élément | How an item reads: RSS `{{title}}`, `{{description}}`, `{{date}}`, `{{time}}`, `{{author}}`, `{{category}}`; JSON fields or paths (`{{name}} : {{price}} $`); CSV column names (`{{Rubrique}} · {{Titre}}`). Filters as elsewhere: `|upper`, `|default:…`. |
| Valeurs nommées | Single values: JSON paths (`data.items.0.price`), CSV cells — a column's first value (`Score`), a sheet row and a column (`3.Score`: sheet row 3, the header being row 1), or a cell (`B2`) —, RSS (`0.title`). |

Text arrives in UTF-8, in the encoding the server or the XML prolog declares, else in
Windows-1252 (Excel's CSV exports). Limits: 15 s, 2 MB per read.

Put `{{flux.<id>_liste}}` in a **Défilant** (« Messages d'une variable ») for a news
crawl, `{{flux.<id>}}` or a named value in any text. The Modules tab shows each source's
state and what it gave; « Relire » reads it again now.

> The server fetches whatever addresses the show lists: import shows only from people you
> trust.

## Variables

| Variable | |
|---|---|
| `{{flux.<id>}}` | The first item (or the first named value). |
| `{{flux.<id>_liste}}` | The items (a list, for tickers). |
| `{{flux.<id>_n}}` | How many. |
| `{{flux.<id>_<name>}}` | Each named value. |
| `{{flux.<id>_maj}}` · `_etat` | When it was last read · `ok` or `erreur`. |

In Companion: `flux_<id>`, `flux_<id>_<name>`… Commands: `refresh` (every source now),
`refresh.<id>`.
