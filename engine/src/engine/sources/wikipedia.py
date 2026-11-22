"""Per-team home attendance averages from en.wikipedia season pages, used as a reference.

Reads the first table after the "Attendance(s)" heading and takes the column whose
header contains "Average". Wikipedia tables have their own errors, so these are
compared against, never merged into, the match data.
"""

import re
from html import unescape
from html.parser import HTMLParser

from engine.http import CachedClient

SOURCE = "wikipedia"


class _Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables: list[list[list[str]]] = []
        self._depth = 0
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._depth += 1
            if self._depth == 1:
                self.tables.append([])
        elif self._depth == 1 and tag == "tr":
            self._row = []
        elif self._depth == 1 and tag in ("td", "th"):
            self._cell = []
        elif tag in ("sup", "style"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag == "table":
            self._depth -= 1
        elif self._depth == 1 and tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif self._depth == 1 and tag == "tr" and self._row is not None:
            self.tables[-1].append(self._row)
            self._row = None
        elif tag in ("sup", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if self._cell is not None and not self._skip:
            self._cell.append(data)


def _number(text: str) -> float | None:
    digits = re.sub(r"[^\d.]", "", text.replace(",", "").replace(" ", "").replace(" ", ""))
    try:
        return float(digits) if digits else None
    except ValueError:
        return None


def parse_attendance(html: str) -> dict[str, float]:
    m = re.search(r'id="Attendances?[^"]*"', html)
    if not m:
        return {}
    parser = _Tables()
    parser.feed(html[m.end() :])
    if not parser.tables:
        return {}
    rows = parser.tables[0]
    header = next((r for r in rows if any("verage" in c for c in r)), None)
    if not header:
        return {}
    avg_col = next(i for i, c in enumerate(header) if "verage" in c)
    out: dict[str, float] = {}
    for r in rows[rows.index(header) + 1 :]:
        if len(r) <= avg_col:
            continue
        # Team is the first cell that is not purely a rank number.
        team = next((c for c in r if c and not c.isdigit()), None)
        avg = _number(r[avg_col])
        if team and avg is not None and not team.lower().startswith("total"):
            out[unescape(team)] = avg
    return out


class Wikipedia:
    def __init__(self, client: CachedClient | None = None):
        self.client = client or CachedClient(SOURCE, min_interval=1.0)

    def attendance(self, year: int, fetch: bool = True) -> dict[str, float]:
        key = f"en/{year}_Allsvenskan.html"
        if not fetch and not self.client.cached(key):
            return {}
        return parse_attendance(self.client.get(key, f"https://en.wikipedia.org/wiki/{year}_Allsvenskan"))
