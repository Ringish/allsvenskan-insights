"""Sportomedia GraphQL feed, the data source behind allsvenskan.se.

Undocumented. The season list query returns every match of a season; per-match
attendance (`spectators`) is only exposed by the single-match query, so a full
season costs one list call plus one call per match. Everything is cached raw.
"""

from collections.abc import Iterator
from dataclasses import dataclass

from engine.http import CachedClient

URL = "https://gql.sportomedia.se/graphql"
SOURCE = "sportomedia"
LEAGUE = "allsvenskan"
HEADERS = {"Origin": "https://allsvenskan.se", "Referer": "https://allsvenskan.se/"}

SEASONS_Q = """query seasons($league: String!) {
  seasons(configLeagueName: $league, sort: "ASC") { id years configSeasonStartYear }
}"""

SEASON_MATCHES_Q = """query season($league: String!, $year: Int!) {
  matchesForLeague(configLeagueName: $league, configSeasonStartYear: $year) {
    matches {
      id startDate round status leagueName arenaName
      homeTeamName visitingTeamName homeTeamAbbrv visitingTeamAbbrv
      homeTeamScore visitingTeamScore
      fogisId homeTeamFogisId visitingTeamFogisId
    }
  }
}"""

MATCH_Q = """query match($league: String!, $year: Int!, $id: Int!) {
  match(configLeagueName: $league, configSeasonStartYear: $year, id: $id) {
    match {
      id startDate round status leagueName arenaName spectators referees
      homeTeamName visitingTeamName homeTeamAbbrv visitingTeamAbbrv
      homeTeamScore visitingTeamScore
      fogisId homeTeamFogisId visitingTeamFogisId
      matchEvents {
        type typeString gameTime period minuteWithStoppageTime teamName byHomeTeam
        playerName assistPlayerName inPlayerName outPlayerName goalType
        homeTeamScore visitingTeamScore
      }
    }
  }
}"""


@dataclass(frozen=True)
class FeedMatch:
    id: int
    year: int
    kickoff_utc: str
    round: int | None
    status: str | None
    home_name: str
    away_name: str
    home_abbrv: str | None
    away_abbrv: str | None
    home_goals: int | None
    away_goals: int | None
    arena: str | None
    spectators: int | None
    fogis_id: int | None
    referees: tuple[str, ...]
    events: tuple[dict, ...]


class Sportomedia:
    def __init__(self, client: CachedClient | None = None):
        self.client = client or CachedClient(SOURCE, min_interval=1.0)

    def _q(self, key: str, query: str, variables: dict, refresh: bool = False) -> dict:
        payload = {"query": query, "variables": {"league": LEAGUE, **variables}}
        return self.client.post_json(key, URL, payload, refresh=refresh, headers=HEADERS)["data"]

    def seasons(self, refresh: bool = False) -> list[int]:
        data = self._q("seasons.json", SEASONS_Q, {}, refresh=refresh)
        return [s["configSeasonStartYear"] for s in data["seasons"]]

    def season_match_ids(self, year: int, refresh: bool = False) -> list[int]:
        data = self._q(f"{year}/season.json", SEASON_MATCHES_Q, {"year": year}, refresh=refresh)
        return [m["id"] for m in data["matchesForLeague"]["matches"]]

    def match(self, year: int, match_id: int, refresh: bool = False) -> FeedMatch:
        data = self._q(
            f"{year}/match-{match_id}.json", MATCH_Q, {"year": year, "id": match_id}, refresh=refresh
        )
        return parse_match(year, data["match"]["match"])

    def fetch_season(self, year: int, refresh: bool = False) -> Iterator[FeedMatch]:
        for mid in self.season_match_ids(year, refresh=refresh):
            yield self.match(year, mid, refresh=refresh)


def _nz(v: int | None) -> int | None:
    # The feed uses 0 for "unknown" on ids.
    return v or None


def parse_match(year: int, m: dict) -> FeedMatch:
    return FeedMatch(
        id=m["id"],
        year=year,
        kickoff_utc=m["startDate"],
        round=m.get("round"),
        status=m.get("status"),
        home_name=m["homeTeamName"],
        away_name=m["visitingTeamName"],
        home_abbrv=m.get("homeTeamAbbrv"),
        away_abbrv=m.get("visitingTeamAbbrv"),
        home_goals=m.get("homeTeamScore"),
        away_goals=m.get("visitingTeamScore"),
        arena=m.get("arenaName") or None,
        # 0 is ambiguous (unknown vs played behind closed doors); reconcile decides.
        spectators=m.get("spectators"),
        fogis_id=_nz(m.get("fogisId")),
        referees=tuple(m.get("referees") or ()),
        events=tuple(m.get("matchEvents") or ()),
    )
