"""Resolve source spellings of teams and venues to canonical ids."""

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from engine.paths import REFERENCE


def slug(text: str) -> str:
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _key(text: str) -> str:
    return " ".join(text.casefold().split())


@dataclass
class Reference:
    teams: dict[str, dict]
    venues: dict[str, dict]
    home_venues: dict[str, list[dict]]
    team_alias: dict[str, str] = field(default_factory=dict)
    venue_alias: dict[str, str] = field(default_factory=dict)
    unknown_teams: set[str] = field(default_factory=set)
    unknown_venues: set[tuple[str, str]] = field(default_factory=set)

    @classmethod
    def load(cls, ref_dir: Path = REFERENCE) -> "Reference":
        teams = {t["id"]: t for t in yaml.safe_load((ref_dir / "teams.yml").read_text())}
        venues = {v["id"]: v for v in yaml.safe_load((ref_dir / "venues.yml").read_text())}
        hv_path = ref_dir / "home_venues.yml"
        home_venues = (yaml.safe_load(hv_path.read_text()) or {}) if hv_path.exists() else {}
        ref = cls(teams, venues, home_venues)
        for t in teams.values():
            for name in [t["name"], t["short"], *t.get("aliases", [])]:
                ref.team_alias[_key(name)] = t["id"]
        for v in venues.values():
            for name in [v["name"], *v.get("aliases", [])]:
                ref.venue_alias[_key(name)] = v["id"]
        return ref

    def team(self, name: str) -> str:
        tid = self.team_alias.get(_key(name))
        if tid:
            return tid
        tid = slug(name)
        if tid not in self.teams:
            self.unknown_teams.add(name)
            self.teams[tid] = {"id": tid, "name": name, "short": name, "aliases": []}
        self.team_alias[_key(name)] = tid
        return tid

    def venue(self, name: str, home_team_id: str) -> str | None:
        """Resolve a source arena name, trying team-scoped, exact, then the part before a comma."""
        candidates = [f"{name}@{home_team_id}", name]
        if "," in name:
            head = name.split(",")[0]
            candidates += [f"{head}@{home_team_id}", head]
            # "Nationalarenan, Friends Arena": the sponsor name is after the comma.
            candidates.append(name.split(",", 1)[1])
        for c in candidates:
            vid = self.venue_alias.get(_key(c))
            if vid:
                return vid
        self.unknown_venues.add((name, home_team_id))
        return None

    def venue_open(self, venue_id: str, year: int) -> bool:
        v = self.venues[venue_id]
        return (v.get("opened") or 0) <= year <= (v.get("closed") or 9999)

    def home_venue_override(self, team_id: str, year: int) -> str | None:
        for spell in self.home_venues.get(team_id, []):
            if spell.get("from", 0) <= year <= spell.get("to", 9999):
                return spell["venue"]
        return None
