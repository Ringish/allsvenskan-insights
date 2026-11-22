"""plood/AllStat: community CSVs with per-match attendance, 2000-2015.

Used only to fill matches where the feed has no attendance.
Columns: leaguename, matchdate, matchday, hometeam, awayteam, homescore, awayscore, attendance.
The 2013 file uses ';' as separator.
"""

import csv
import io
from dataclasses import dataclass

from engine.http import CachedClient

SOURCE = "allstat"
BASE = "https://raw.githubusercontent.com/plood/AllStat/master/data/seasons"
YEARS = range(2000, 2016)


@dataclass(frozen=True)
class AllStatMatch:
    date: str
    home: str
    away: str
    home_goals: int | None
    away_goals: int | None
    attendance: int | None


def _int(v: str) -> int | None:
    v = (v or "").strip()
    return int(v) if v and v.upper() != "NULL" else None


def parse(text: str) -> list[AllStatMatch]:
    sep = ";" if text.split("\n", 1)[0].count(";") > text.split("\n", 1)[0].count(",") else ","
    rows = csv.DictReader(io.StringIO(text), delimiter=sep)
    return [
        AllStatMatch(
            date=r["matchdate"].strip()[:10],
            home=r["hometeam"].strip(),
            away=r["awayteam"].strip(),
            home_goals=_int(r["homescore"]),
            away_goals=_int(r["awayscore"]),
            attendance=_int(r["attendance"]),
        )
        for r in rows
    ]


class AllStat:
    def __init__(self, client: CachedClient | None = None):
        self.client = client or CachedClient(SOURCE, min_interval=1.0)

    def season(self, year: int) -> list[AllStatMatch]:
        if year not in YEARS:
            return []
        url = f"{BASE}/{year // 10 * 10}s/{year}.csv"
        return parse(self.client.get(f"{year}.csv", url))
