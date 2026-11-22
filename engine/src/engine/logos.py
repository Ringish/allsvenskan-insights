"""Team badges for the web app: the feed's club logo on a round disc, or initials when there is no logo."""

import io
from pathlib import Path
from urllib.parse import unquote

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

from engine.http import CachedClient
from engine.normalize import Reference, _key
from engine.paths import ROOT
from engine.sources.sportomedia import Sportomedia

OUT = ROOT / "web" / "public" / "logos"
SIZE = 128
# Drawn at 4x and downsampled for clean edges.
SS = 4


def _rgb(hex_color: str | None, default: tuple[int, int, int]) -> tuple[int, int, int]:
    if not hex_color:
        return default
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _luma(c: tuple[int, int, int]) -> float:
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


# Bold sans faces with Swedish glyphs; Pillow's built-in font lacks å, ä and ö.
FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def _font(size: float) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size=size)


def _initials(short: str) -> str:
    words = [w for w in short.replace("-", " ").split() if w[:1].isalpha()]
    if len(words) >= 2:
        return (words[0][0] + words[1][0]).upper()
    return short[:3].upper()


def badge(team: dict, logo: bytes | None) -> Image.Image:
    """A disc with a soft shadow and a ring in the team color; the logo or initials inside."""
    s = SIZE * SS
    c = s / 2
    r = s * 0.44
    ring = s * 0.035
    color = _rgb(team.get("color"), (120, 120, 120))
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))

    shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((c - r, c - r + s * 0.03, c + r, c + r + s * 0.03), fill=(0, 0, 0, 110))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(s * 0.025)))

    d = ImageDraw.Draw(img)
    face = (255, 255, 255) if logo else color
    d.ellipse((c - r, c - r, c + r, c + r), fill=color)
    d.ellipse((c - r + ring, c - r + ring, c + r - ring, c + r - ring), fill=face)

    if logo:
        mark = Image.open(io.BytesIO(logo)).convert("RGBA")
        # Some source images carry wide transparent or white padding; trim it so every crest fills the disc.
        ink = ImageChops.difference(mark.convert("RGB"), Image.new("RGB", mark.size, "white")).convert("L")
        alpha = mark.getchannel("A").point(lambda v: 255 if v > 40 else 0)
        visible = ImageChops.multiply(ink.point(lambda v: 255 if v > 12 else 0), alpha)
        bbox = visible.getbbox()
        if bbox:
            mark = mark.crop(bbox)
        box = int(r * 1.32)
        # Scale to fit both ways; thumbnail() would never enlarge a small source.
        f = box / max(mark.size)
        mark = mark.resize(
            (max(1, round(mark.width * f)), max(1, round(mark.height * f))), Image.Resampling.LANCZOS
        )
        img.alpha_composite(mark, (int(c - mark.width / 2), int(c - mark.height / 2)))
    else:
        text = _initials(team.get("short") or team["name"])
        ink = (255, 255, 255) if _luma(color) < 150 else (20, 20, 20)
        font = _font(r * (0.78 if len(text) <= 2 else 0.6))
        d.text((c, c), text, font=font, fill=ink, anchor="mm")

    return img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def logo_urls(years: list[int], ref: Reference, feed: Sportomedia) -> tuple[dict[str, str], set[str]]:
    """Team id -> logo URL from the feed's team lists, newest season first. Also returns unmatched names."""
    urls: dict[str, str] = {}
    unknown: set[str] = set()
    for year in sorted(years, reverse=True):
        # Team lists are saved by `engine fetch`; this command only downloads images.
        if not feed.client.cached(f"{year}/teams.json"):
            continue
        for t in feed.teams(year):
            tid = next(
                (
                    ref.team_alias[k]
                    for k in (_key(t["name"]), _key(t["displayName"] or ""))
                    if k in ref.team_alias
                ),
                None,
            )
            if not tid:
                unknown.add(t["name"])
                continue
            if t.get("logoImageUrl") and tid not in urls:
                urls[tid] = t["logoImageUrl"]
    return urls, unknown


def logos(years: list[int], out: Path = OUT, offline: bool = False) -> None:
    ref = Reference.load()
    urls, unknown = logo_urls(years, ref, Sportomedia())
    images = CachedClient("logos")
    out.mkdir(parents=True, exist_ok=True)
    fallback = []
    for tid, team in sorted(ref.teams.items()):
        url = urls.get(tid)
        data = None
        key = f"{tid}{Path(unquote(url)).suffix or '.png'}" if url else None
        if key and (not offline or images.cached(key)):
            data = images.get_bytes(key, url)
        else:
            fallback.append(tid)
        badge(team, data).save(out / f"{tid}.png", optimize=True)
    print(f"badges: {len(ref.teams) - len(fallback)} with logo, {len(fallback)} with initials -> {out}")
    if fallback:
        print("  initials only: " + ", ".join(fallback))
    if unknown:
        print("  feed team names not in teams.yml: " + ", ".join(sorted(unknown)))
