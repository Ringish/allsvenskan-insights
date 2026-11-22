import json
from pathlib import Path

import pytest

from engine import db
from engine.build import SeasonReport, dedupe
from engine.normalize import Reference
from engine.sources.allstat import parse as parse_allstat
from engine.sources.sportomedia import parse_match
from engine.sources.wikipedia import parse_attendance

FIX = Path(__file__).parent / "fixtures"


def feed_fixture(name: str) -> dict:
    return json.loads((FIX / name).read_text())["data"]["match"]["match"]


@pytest.fixture(scope="module")
def ref() -> Reference:
    return Reference.load()


def test_parse_feed_match():
    m = parse_match(2024, feed_fixture("feed_match_4456660.json"))
    assert (m.home_name, m.away_name) == ("IFK Norrköping", "Malmö FF")
    assert m.spectators == 13028
    assert m.arena == "Platinumcars Arena"
    assert m.fogis_id is None  # feed sends 0


def test_parse_feed_match_without_attendance():
    assert not parse_match(2024, feed_fixture("feed_match_no_att.json")).spectators


def test_team_aliases(ref):
    assert ref.team("Malmö FF") == ref.team("Malmö") == "malmo-ff"
    assert ref.team("Hammarby") == "hammarby"


def test_unknown_team_is_auto_created(ref):
    assert ref.team("Testklubben IF") == "testklubben-if"
    assert "Testklubben IF" in ref.unknown_teams


@pytest.mark.parametrize(
    ("arena", "home", "venue"),
    [
        ("Nationalarenan, Friends Arena", "aik", "strawberry-arena"),
        ("Nationalarenan, Strawberry Arena", "aik", "strawberry-arena"),
        ("Tele2 Arena", "hammarby", "3arena"),
        ("Guldfågeln Arena, Kalmar", "kalmar-ff", "guldfageln-arena"),
        ("Idrottsparken", "ifk-norrkoping", "norrkoping-idrottspark"),
        ("Idrottsparken", "gif-sundsvall", "np3-arena"),
    ],
)
def test_venue_aliases(ref, arena, home, venue):
    assert ref.venue(arena, home) == venue


def test_venue_open(ref):
    assert not ref.venue_open("strawberry-arena", 2010)
    assert ref.venue_open("rasunda", 2010)
    assert not ref.venue_open("rasunda", 2014)


def test_dedupe_keeps_row_with_attendance(ref):
    base = feed_fixture("feed_match_4456660.json")
    dup = {**base, "id": 1, "spectators": 0}
    rep = SeasonReport(2024)
    kept = dedupe([parse_match(2024, dup), parse_match(2024, base)], ref, rep)
    assert [m.id for m in kept] == [4456660]
    assert len(rep.duplicates) == 1


def test_allstat_semicolon_and_null():
    text = (
        "leaguename;matchdate;matchday;hometeam;awayteam;homescore;awayscore;attendance\n"
        "Allsvenskan;2013-03-31;1;Malmö FF;IFK Göteborg;2;1;NULL\n"
    )
    (m,) = parse_allstat(text)
    assert (m.home, m.away, m.home_goals, m.attendance) == ("Malmö FF", "IFK Göteborg", 2, None)


def test_wikipedia_attendance_table():
    avg = parse_attendance((FIX / "wiki_attendance_2024.html").read_text())
    assert len(avg) == 16
    assert avg["AIK Fotboll"] == 28589
    assert avg["IF Brommapojkarna"] == 1907


def test_upsert_is_idempotent(tmp_path):
    con = db.connect(tmp_path / "t.sqlite")
    row = {
        "id": "x",
        "name": "X",
        "short_name": "X",
        "abbrv": None,
        "city": None,
        "color": None,
        "color2": None,
    }
    db.upsert(con, "team", row)
    db.upsert(con, "team", {**row, "name": "Y"})
    assert tuple(con.execute("SELECT COUNT(*), MAX(name) FROM team").fetchone()) == (1, "Y")


def test_badge_with_and_without_logo():
    import io

    from PIL import Image

    from engine.logos import SIZE, _initials, badge

    team = {"id": "x", "name": "IFK Göteborg", "short": "Göteborg", "color": "#1F5FBF"}
    assert badge(team, None).size == (SIZE, SIZE)
    buf = io.BytesIO()
    Image.new("RGBA", (300, 200), (255, 0, 0, 255)).save(buf, "PNG")
    img = badge(team, buf.getvalue())
    # Logo sits on a white disc; the center pixel comes from the logo.
    assert img.getpixel((SIZE // 2, SIZE // 2))[:3] == (255, 0, 0)
    assert _initials("Göteborg") == "GÖT"
    assert _initials("V Frölunda") == "VF"


def test_logo_urls_newest_season_wins():
    from engine.logos import logo_urls

    class Feed:
        class client:
            @staticmethod
            def cached(key):
                return True

        def teams(self, year):
            return [
                {"name": "AIK", "displayName": "AIK", "logoImageUrl": f"https://x/{year}.png"},
                {"name": "Okänt FF", "displayName": None, "logoImageUrl": None},
            ]

    urls, unknown = logo_urls([2023, 2024], Reference.load(), Feed())
    assert urls["aik"] == "https://x/2024.png"
    assert unknown == {"Okänt FF"}
