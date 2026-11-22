import argparse
import sys
from collections import Counter


def parse_years(spec: str) -> list[int]:
    years: list[int] = []
    for part in spec.split(","):
        if "-" in part:
            a, b = map(int, part.split("-"))
            # "2026-2000" runs newest first.
            years.extend(range(a, b + 1) if a <= b else range(a, b - 1, -1))
        else:
            years.append(int(part))
    return years


def cmd_fetch(args: argparse.Namespace) -> None:
    import time

    from engine.sources.sportomedia import Sportomedia

    feed = Sportomedia()
    available = set(feed.seasons())
    for year in parse_years(args.seasons):
        if year not in available:
            print(f"{year}: not in the feed, skipped", flush=True)
            continue
        matches = feed.season_matches(year, refresh=args.refresh)
        # A season in progress: refresh the list so newly finished matches are seen.
        if any(m["status"] != "FINISHED" for m in matches) and not args.refresh:
            matches = feed.season_matches(year, refresh=True)
        feed.teams(year, refresh=args.refresh)
        ids = [m["id"] for m in matches if m["status"] == "FINISHED"]
        # Matches cached before they were played are fetched again.
        todo = [mid for mid in ids if args.refresh or feed.cached_status(year, mid) != "FINISHED"]
        unplayed = len(matches) - len(ids)
        print(f"{year}: {len(ids)} played, {unplayed} not yet played, {len(todo)} to fetch", flush=True)
        started = time.monotonic()
        for n, mid in enumerate(todo, 1):
            feed.match(year, mid, refresh=args.refresh)
            if n % 50 == 0:
                rate = (time.monotonic() - started) / n
                print(f"  {year}: {n}/{len(todo)}, ~{rate * (len(todo) - n) / 60:.0f} min left", flush=True)
        att = Counter("with" if feed.match(year, mid).spectators else "without" for mid in ids)
        print(f"{year}: done, attendance with={att['with']} without={att['without']}", flush=True)
        if todo and args.pause:
            time.sleep(args.pause)


def cmd_build(args: argparse.Namespace) -> None:
    from engine.build import build

    build(parse_years(args.seasons))


def cmd_validate(args: argparse.Namespace) -> None:
    from engine.validate import validate

    sys.exit(validate(parse_years(args.seasons), fetch=args.fetch))


def cmd_logos(args: argparse.Namespace) -> None:
    from engine.logos import logos

    logos(parse_years(args.seasons), offline=args.offline)


def cmd_export(args: argparse.Namespace) -> None:
    from engine.export import export

    export()


def main() -> None:
    p = argparse.ArgumentParser(prog="engine")
    sub = p.add_subparsers(required=True)

    f = sub.add_parser("fetch", help="fetch raw data from the Sportomedia feed into data/raw")
    f.add_argument("--seasons", default="2000-2025")
    f.add_argument("--refresh", action="store_true", help="refetch even if cached")
    f.add_argument("--pause", type=float, default=20, help="seconds to rest between seasons")
    f.set_defaults(fn=cmd_fetch)

    b = sub.add_parser("build", help="build SQLite from cached raw data")
    b.add_argument("--seasons", default="2000-2025")
    b.set_defaults(fn=cmd_build)

    v = sub.add_parser("validate", help="compare per-team attendance vs Wikipedia reference")
    v.add_argument("--seasons", default="2000-2025")
    v.add_argument("--fetch", action="store_true", help="allow fetching Wikipedia pages not yet cached")
    v.set_defaults(fn=cmd_validate)

    lg = sub.add_parser("logos", help="fetch team logos and render badges into web/public/logos")
    lg.add_argument("--seasons", default="2000-2025")
    lg.add_argument("--offline", action="store_true", help="only use cached team lists and logos")
    lg.set_defaults(fn=cmd_logos)

    e = sub.add_parser("export", help="export SQLite to static JSON for the web app")
    e.set_defaults(fn=cmd_export)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
