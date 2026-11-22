import argparse
import sys
from collections import Counter


def parse_years(spec: str) -> list[int]:
    years: list[int] = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            years.extend(range(int(a), int(b) + 1))
        else:
            years.append(int(part))
    return years


def cmd_fetch(args: argparse.Namespace) -> None:
    from engine.sources.sportomedia import Sportomedia

    feed = Sportomedia()
    for year in parse_years(args.seasons):
        ids = feed.season_match_ids(year, refresh=args.refresh)
        missing = sum(1 for mid in ids if not feed.client.cached(f"{year}/match-{mid}.json"))
        print(f"{year}: {len(ids)} matches, {missing} to fetch", flush=True)
        att = Counter()
        for mid in ids:
            m = feed.match(year, mid, refresh=args.refresh)
            att["with" if m.spectators else "without"] += 1
        print(f"{year}: attendance with={att['with']} without={att['without']}", flush=True)


def cmd_build(args: argparse.Namespace) -> None:
    from engine.build import build

    build(parse_years(args.seasons))


def cmd_validate(args: argparse.Namespace) -> None:
    from engine.validate import validate

    sys.exit(validate(parse_years(args.seasons), fetch=args.fetch))


def cmd_export(args: argparse.Namespace) -> None:
    from engine.export import export

    export()


def main() -> None:
    p = argparse.ArgumentParser(prog="engine")
    sub = p.add_subparsers(required=True)

    f = sub.add_parser("fetch", help="fetch raw data from the Sportomedia feed into data/raw")
    f.add_argument("--seasons", default="2000-2025")
    f.add_argument("--refresh", action="store_true", help="refetch even if cached")
    f.set_defaults(fn=cmd_fetch)

    b = sub.add_parser("build", help="build SQLite from cached raw data")
    b.add_argument("--seasons", default="2000-2025")
    b.set_defaults(fn=cmd_build)

    v = sub.add_parser("validate", help="compare per-team attendance vs Wikipedia reference")
    v.add_argument("--seasons", default="2000-2025")
    v.add_argument("--fetch", action="store_true", help="allow fetching Wikipedia pages not yet cached")
    v.set_defaults(fn=cmd_validate)

    e = sub.add_parser("export", help="export SQLite to static JSON for the web app")
    e.set_defaults(fn=cmd_export)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
