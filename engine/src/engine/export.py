"""Export SQLite to static JSON for the web app (web/public/data)."""

import json
from collections import Counter, defaultdict
from datetime import UTC, datetime

from engine import db
from engine.paths import WEB_DATA

MATCH_COLUMNS = ["id", "kickoff", "round", "home", "away", "hg", "ag", "att", "venue", "attSrc"]


def _write(path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def export() -> None:
    con = db.connect()
    teams = [
        dict(r)
        for r in con.execute("SELECT id, name, short_name, city, color, color2 FROM team ORDER BY name")
    ]
    venues = [
        dict(r)
        for r in con.execute(
            "SELECT id, name, city, lat, lon, capacity, opened, closed FROM venue ORDER BY name"
        )
    ]
    seasons = []
    for s in con.execute("SELECT id, year FROM season ORDER BY year"):
        rows = con.execute(
            """SELECT source_match_id, kickoff_utc, round, home_team_id, away_team_id, home_goals, away_goals,
                      attendance, venue_id, attendance_source
               FROM match WHERE season_id = ? ORDER BY kickoff_utc, source_match_id""",
            (s["id"],),
        ).fetchall()
        if not rows:
            continue
        homes: dict[str, Counter] = defaultdict(Counter)
        for r in rows:
            if r["venue_id"]:
                homes[r["home_team_id"]][r["venue_id"]] += 1
        known = [r["attendance"] for r in rows if r["attendance"] is not None]
        _write(
            WEB_DATA / "matches" / f"{s['year']}.json",
            {
                "year": s["year"],
                "columns": MATCH_COLUMNS,
                "rows": [list(r) for r in rows],
                "homes": {t: c.most_common(1)[0][0] for t, c in homes.items()},
            },
        )
        seasons.append(
            {
                "year": s["year"],
                "matches": len(rows),
                "withAttendance": sum(1 for a in known if a > 0),
                "closedDoors": sum(1 for r in rows if r["attendance_source"] == "closed-doors"),
                "total": sum(known),
                "average": round(sum(known) / len(known)) if known and sum(known) else None,
                "start": rows[0]["kickoff_utc"],
                "end": rows[-1]["kickoff_utc"],
            }
        )

    _write(WEB_DATA / "teams.json", teams)
    _write(WEB_DATA / "venues.json", venues)
    _write(
        WEB_DATA / "meta.json",
        {
            "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
            "competition": "Allsvenskan (men)",
            "sources": {
                "sportomedia": "allsvenskan.se data feed",
                "allstat": "github.com/plood/AllStat",
                "closed-doors": "played without spectators",
            },
            "seasons": seasons,
        },
    )
    print(f"exported {len(seasons)} seasons, {len(teams)} teams, {len(venues)} venues to {WEB_DATA}")
