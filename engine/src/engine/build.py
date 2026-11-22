"""Build SQLite from cached raw data. Never fetches from the feed; run `engine fetch` first."""

import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from engine import db
from engine.normalize import Reference
from engine.sources.allstat import AllStat
from engine.sources.sportomedia import FeedMatch, Sportomedia, parse_match

COMPETITION = {"id": "allsvenskan-men", "name": "Allsvenskan", "gender": "men", "tier": 1}
# Every 2020 match was played without spectators (COVID-19 restrictions).
CLOSED_DOORS_YEARS = {2020}


@dataclass
class SeasonReport:
    year: int
    matches: int = 0
    teams: int = 0
    duplicates: list[str] = field(default_factory=list)
    attendance: Counter = field(default_factory=Counter)
    venue: Counter = field(default_factory=Counter)
    anachronisms: list[str] = field(default_factory=list)
    missing_raw: int = 0
    unplayed: int = 0

    def line(self) -> str:
        n = self.teams
        expected = n * (n - 1)
        flag = "" if self.matches == expected else f"  (expected {expected})"
        att = ", ".join(f"{k}={v}" for k, v in sorted(self.attendance.items()))
        ven = ", ".join(f"{k}={v}" for k, v in sorted(self.venue.items()))
        out = f"{self.year}: {self.matches} matches, {n} teams{flag} | attendance {att} | venue {ven}"
        if self.missing_raw:
            out += f" | {self.missing_raw} match details not fetched"
        if self.unplayed:
            out += f" | {self.unplayed} not yet played"
        for d in self.duplicates:
            out += f"\n    duplicate dropped: {d}"
        for a in self.anachronisms:
            out += f"\n    venue not open that year, replaced: {a}"
        return out


def load_feed_season(feed: Sportomedia, year: int, report: SeasonReport) -> list[FeedMatch]:
    if not feed.client.cached(f"{year}/season.json"):
        return []
    out = []
    for mid in feed.season_match_ids(year):
        key = f"{year}/match-{mid}.json"
        if not feed.client.cached(key):
            report.missing_raw += 1
            continue
        m = parse_match(year, json.loads(feed.client.read(key))["data"]["match"]["match"])
        if m.status != "FINISHED":
            report.unplayed += 1
            continue
        out.append(m)
    return out


def dedupe(matches: list[FeedMatch], ref: Reference, report: SeasonReport) -> list[FeedMatch]:
    """Each pairing is played once per season with a given home team; keep the best row."""
    by_pair: dict[tuple[str, str], list[FeedMatch]] = defaultdict(list)
    for m in matches:
        by_pair[(ref.team(m.home_name), ref.team(m.away_name))].append(m)
    kept = []
    for group in by_pair.values():
        group.sort(key=lambda m: (not m.spectators, m.id))
        kept.append(group[0])
        for m in group[1:]:
            report.duplicates.append(
                f"{m.id} {m.home_name}-{m.away_name} {m.kickoff_utc[:10]} (kept {group[0].id})"
            )
    return sorted(kept, key=lambda m: (m.kickoff_utc, m.id))


def build(years: list[int]) -> list[SeasonReport]:
    ref = Reference.load()
    feed = Sportomedia()
    allstat = AllStat()
    con = db.connect()
    db.upsert(con, "competition", COMPETITION)

    seasons: dict[int, list[FeedMatch]] = {}
    reports: dict[int, SeasonReport] = {}
    for year in years:
        reports[year] = SeasonReport(year)
        raw = load_feed_season(feed, year, reports[year])
        if raw:
            seasons[year] = dedupe(raw, ref, reports[year])

    # Pass 1: venues named by the feed, used to infer home grounds where the feed has none.
    feed_venue: dict[int, str | None] = {}
    home_counts: dict[tuple[str, int], Counter] = defaultdict(Counter)
    for year, matches in seasons.items():
        for m in matches:
            home = ref.team(m.home_name)
            vid = ref.venue(m.arena, home) if m.arena else None
            if vid and not ref.venue_open(vid, year):
                reports[year].anachronisms.append(f"{m.home_name} {m.kickoff_utc[:10]} '{m.arena}'")
                vid = None
            feed_venue[m.id] = vid
            if vid:
                home_counts[(home, year)][vid] += 1

    def inferred_home(team: str, year: int) -> str | None:
        override = ref.home_venue_override(team, year)
        if override:
            return override
        for y in sorted({y for (t, y) in home_counts if t == team}, key=lambda y: (abs(y - year), y)):
            for vid, _ in home_counts[(team, y)].most_common():
                if ref.venue_open(vid, year):
                    return vid
        return None

    # Resolve every team first so auto-created teams exist before matches reference them.
    for matches in seasons.values():
        for m in matches:
            ref.team(m.home_name), ref.team(m.away_name)
    for t in ref.teams.values():
        db.upsert(
            con,
            "team",
            {
                "id": t["id"],
                "name": t["name"],
                "short_name": t["short"],
                "abbrv": t.get("abbrv"),
                "city": t.get("city"),
                "color": t.get("color"),
                "color2": t.get("color2"),
            },
        )
    for v in ref.venues.values():
        db.upsert(
            con,
            "venue",
            {k: v.get(k) for k in ("id", "name", "city", "lat", "lon", "capacity", "opened", "closed")},
        )
    con.execute("DELETE FROM team_alias")
    con.execute("DELETE FROM venue_alias")
    con.executemany("INSERT INTO team_alias VALUES (?, ?)", ref.team_alias.items())
    con.executemany("INSERT INTO venue_alias VALUES (?, ?)", ref.venue_alias.items())
    for year, matches in seasons.items():
        rep = reports[year]
        season_id = f"{COMPETITION['id']}-{year}"
        db.upsert(con, "season", {"id": season_id, "competition_id": COMPETITION["id"], "year": year})
        con.execute("DELETE FROM match WHERE season_id = ?", (season_id,))

        fill = {(ref.team(a.home), ref.team(a.away)): a for a in allstat.season(year)}
        teams = set()
        for m in matches:
            home, away = ref.team(m.home_name), ref.team(m.away_name)
            teams |= {home, away}

            if m.spectators:
                att, att_src = m.spectators, "sportomedia"
            elif year in CLOSED_DOORS_YEARS:
                att, att_src = 0, "closed-doors"
            elif (a := fill.get((home, away))) and a.attendance:
                att, att_src = a.attendance, "allstat"
            else:
                att, att_src = None, None
            rep.attendance[att_src or "missing"] += 1

            vid, vsrc = feed_venue.get(m.id), "feed"
            if not vid:
                vid, vsrc = inferred_home(home, year), "home-venue"
            rep.venue[vsrc if vid else "unknown"] += 1

            db.upsert(
                con,
                "match",
                {
                    "id": f"sportomedia:{m.id}",
                    "season_id": season_id,
                    "round": m.round,
                    "kickoff_utc": m.kickoff_utc.replace(".000Z", "Z"),
                    "home_team_id": home,
                    "away_team_id": away,
                    "home_goals": m.home_goals,
                    "away_goals": m.away_goals,
                    "attendance": att,
                    "attendance_source": att_src,
                    "venue_id": vid,
                    "venue_source": vsrc if vid else None,
                    "source": "sportomedia",
                    "source_match_id": str(m.id),
                    "fogis_id": m.fogis_id,
                },
            )
        rep.matches, rep.teams = len(matches), len(teams)

    con.commit()

    for year in years:
        print(reports[year].line())
    if ref.unknown_teams:
        print("\nTeams not in teams.yml (auto-created):", ", ".join(sorted(ref.unknown_teams)))
    if ref.unknown_venues:
        print("\nArena names not in venues.yml:")
        for name, team in sorted(ref.unknown_venues):
            print(f"  {name!r} (home: {team})")
    return list(reports.values())
