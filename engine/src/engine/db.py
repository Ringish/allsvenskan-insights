"""SQLite schema and idempotent upserts.

New kinds of facts (lineups, events, stats) get their own tables keyed on
match.id; existing tables do not change.
"""

import sqlite3
from pathlib import Path

from engine.paths import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS competition (
    id          TEXT PRIMARY KEY,           -- e.g. 'allsvenskan-men'
    name        TEXT NOT NULL,
    gender      TEXT NOT NULL,
    tier        INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS season (
    id              TEXT PRIMARY KEY,       -- '<competition>-<year>'
    competition_id  TEXT NOT NULL REFERENCES competition(id),
    year            INTEGER NOT NULL,
    UNIQUE (competition_id, year)
);
CREATE TABLE IF NOT EXISTS team (
    id          TEXT PRIMARY KEY,           -- slug, e.g. 'malmo-ff'
    name        TEXT NOT NULL,
    short_name  TEXT NOT NULL,
    abbrv       TEXT,
    city        TEXT,
    color       TEXT,
    color2      TEXT
);
CREATE TABLE IF NOT EXISTS team_alias (
    alias       TEXT PRIMARY KEY,
    team_id     TEXT NOT NULL REFERENCES team(id)
);
CREATE TABLE IF NOT EXISTS venue (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    city        TEXT,
    lat         REAL,
    lon         REAL,
    capacity    INTEGER,
    opened      INTEGER,
    closed      INTEGER
);
CREATE TABLE IF NOT EXISTS venue_alias (
    alias       TEXT PRIMARY KEY,
    venue_id    TEXT NOT NULL REFERENCES venue(id)
);
CREATE TABLE IF NOT EXISTS match (
    id                  TEXT PRIMARY KEY,   -- '<source>:<source_match_id>'
    season_id           TEXT NOT NULL REFERENCES season(id),
    round               INTEGER,
    kickoff_utc         TEXT NOT NULL,
    home_team_id        TEXT NOT NULL REFERENCES team(id),
    away_team_id        TEXT NOT NULL REFERENCES team(id),
    home_goals          INTEGER,
    away_goals          INTEGER,
    attendance          INTEGER,            -- NULL = unknown, 0 = played without spectators
    attendance_source   TEXT,
    venue_id            TEXT REFERENCES venue(id),
    venue_source        TEXT,               -- 'feed' | 'home-venue'
    source              TEXT NOT NULL,
    source_match_id     TEXT NOT NULL,
    fogis_id            INTEGER
);
CREATE INDEX IF NOT EXISTS match_season ON match(season_id);
CREATE INDEX IF NOT EXISTS match_home ON match(home_team_id);
CREATE INDEX IF NOT EXISTS match_venue ON match(venue_id);
"""


def connect(path: Path = DB_PATH) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(SCHEMA)
    return con


def upsert(con: sqlite3.Connection, table: str, row: dict, key: str = "id") -> None:
    cols = list(row)
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c != key)
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)}) "
        f"ON CONFLICT({key}) DO UPDATE SET {updates}"
    )
    con.execute(sql, [row[c] for c in cols])
