# Allsvenskan Insights

Data engine and visualizations for Allsvenskan (men), 2000 onward.

```
engine/   Python: fetch -> SQLite -> validate -> static JSON
web/      Vite + React + deck.gl: insight views on the exported JSON
data/     reference YAML (committed), raw cache + SQLite (gitignored)
```

## Data sources

| Source | Used for | Notes |
|---|---|---|
| `gql.sportomedia.se/graphql` (feed behind allsvenskan.se) | all matches, attendance, arenas | Undocumented. One list call per season plus one call per match (attendance is only on the match query). Cached raw under `data/raw/sportomedia/`. |
| [plood/AllStat](https://github.com/plood/AllStat) | attendance gaps 2000-2015 | Only fills matches where the feed has none. |
| en.wikipedia season pages | validation only | Per-team averages; never merged into the data. |
| Wikidata | venue coordinates, capacity, opening year | Copied into `data/reference/venues.yml`. |
| Sportomedia `teamsForLeague` | club logos | `engine logos` draws each logo on a round badge; clubs without a logo get initials in the club color. `--offline` renders from cache only. |

svenskfotboll.se is not used: its robots.txt disallows the results, match and API paths, and it serves a Cloudflare challenge.

Attendance semantics: `NULL` = unknown, `0` = played without spectators (all of 2020). Each match records `attendance_source` and `venue_source` (`feed` or `home-venue`, inferred when the feed has no arena).

## Engine

```
cd engine
uv sync
uv run engine fetch --seasons 2000-2025   # ~5,500 requests at 1/s, resumable
uv run engine build --seasons 2000-2025   # SQLite from cache, prints a per-season report
uv run engine validate --seasons 2000-2025 --fetch
uv run engine logos --seasons 2000-2025   # team logos -> round badges in web/public/logos
uv run engine export                       # -> web/public/data
uv run pytest
```

`build` reports duplicates dropped, attendance coverage per source, arena names missing from `venues.yml`, teams missing from `teams.yml`, and feed arenas that were not open that year. Fix the reference YAML and rebuild; nothing is refetched.

## Web

```
cd web
npm install
npm run dev
```

Views are registered in `web/src/views/registry.ts`. Shared pieces for new insights:

- `src/data/` loads the exported JSON (`Dataset`: teams, venues, matches, match days)
- `src/timeline/` `useTimeline` (scrub, play, speed, keyboard) and the `Timeline` scrubber
- `src/map/` Sweden basemap and camera (presets, fly-to, auto-orbit)

### Crowd skyline

3D towers per team, at the venue of its home match (teams sharing a venue stand side by side). Height = home attendance (match day mode, fading over the following days) or season-to-date home average (skyline mode). Color = fill rate against capacity; the glass column is capacity; the badge on top and the base ring show the team. Arcs run from the away team's home ground. Venue and season records fire a light beam. Click a tower or a match for the venue's full history.

Follow up to 4 teams to compare them: followed teams keep a fixed color slot, other towers dim, and the panel shows their home average, rank and fill rate plus their running average through the season. The choice is remembered in the browser.

Keys: space play/pause, arrows day, Alt+arrows round, Shift+arrows season.
