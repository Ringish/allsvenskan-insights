"""Compare per-team home attendance averages in the DB against Wikipedia tables."""

from engine import db
from engine.normalize import Reference
from engine.sources.wikipedia import Wikipedia

# Wikipedia often truncates instead of rounding.
TOLERANCE = 1.0


def validate(years: list[int], fetch: bool = False) -> int:
    ref = Reference.load()
    wiki = Wikipedia()
    con = db.connect()
    mismatches = 0
    for year in years:
        rows = con.execute(
            """SELECT home_team_id, COUNT(*) n, COUNT(attendance) known, AVG(attendance) avg
               FROM match WHERE season_id = ? GROUP BY home_team_id""",
            (f"allsvenskan-men-{year}",),
        ).fetchall()
        if not rows:
            continue
        reference = {ref.team(name): avg for name, avg in wiki.attendance(year, fetch=fetch).items()}
        if not reference:
            print(f"{year}: no Wikipedia reference cached (use --fetch)")
            continue
        bad = []
        for r in rows:
            want = reference.get(r["home_team_id"])
            if want is None:
                bad.append(f"{r['home_team_id']}: not in Wikipedia table")
                continue
            if r["avg"] is None:
                bad.append(f"{r['home_team_id']}: no attendance data, wiki {want:,.0f}")
                continue
            diff = r["avg"] - want
            if abs(diff) > TOLERANCE:
                note = f" ({r['n'] - r['known']} of {r['n']} matches missing)" if r["known"] < r["n"] else ""
                bad.append(
                    f"{r['home_team_id']}: ours {r['avg']:,.0f} wiki {want:,.0f} diff {diff:+,.0f}{note}"
                )
        status = "OK" if not bad else f"{len(bad)} of {len(rows)} teams differ"
        print(f"{year}: {status}")
        for b in bad:
            print(f"    {b}")
        mismatches += len(bad)
    return 1 if mismatches else 0
