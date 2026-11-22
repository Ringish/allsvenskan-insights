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
| Sportomedia `teamsForLeague`, Wikipedia | club logos | `engine logos` draws each logo on a round badge. When the feed has no logo or its host is gone, the team's `logo_file` in teams.yml is fetched from Wikipedia; otherwise initials in the club color. `--offline` renders from cache only. |

svenskfotboll.se is not used: its robots.txt disallows the results, match and API paths, and it serves a Cloudflare challenge.

Attendance semantics: `NULL` = unknown, `0` = played without spectators (all of 2020). Each match records `attendance_source` and `venue_source` (`feed` or `home-venue`, inferred when the feed has no arena).

## Engine

```
cd engine
uv sync
uv run engine fetch --seasons 2026-2000   # ~6,000 requests, newest first, adaptive pacing, resumable
uv run engine build --seasons 2000-2026   # SQLite from cache, prints a per-season report
uv run engine validate --seasons 2000-2026 --fetch
uv run engine logos --seasons 2000-2026   # team logos -> round badges in web/public/logos
uv run engine export                       # -> web/public/data
uv run pytest
```

`build` reports duplicates dropped, attendance coverage per source, arena names missing from `venues.yml`, teams missing from `teams.yml`, and feed arenas that were not open that year. Fix the reference YAML and rebuild; nothing is refetched. Before about 2007 the feed names no arena, so the venue is the team's home ground from the nearest season with one, or from `data/reference/home_venues.yml` where that is wrong or missing (each entry cites its source).

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

The timeline steps by round (default) or by match day. A round stops on the day by which 75% of its matches are played, so a postponed match is shown with a later round instead of holding the round open.

Keys: space play/pause, arrows one step (round or day), Shift+arrows season.
