"""Polite HTTP client with an on-disk raw cache.

Every response is stored under data/raw/<source>/<key>. A cached key is never
fetched again unless refresh=True, so parsing and rebuilding work offline.
"""

import json
import random
import time
from pathlib import Path

import httpx

from engine.paths import RAW

USER_AGENT = "allsvenskan-insights/0.1 (private research project)"


RETRYABLE = (429, 500, 502, 503, 504)


class CachedClient:
    """Adaptive pacing: requests are spaced by `interval` with +-20% jitter. A 429, 5xx or
    network error doubles the interval (up to `max_interval`) and waits at least Retry-After;
    each success eases it back toward `min_interval` by 5%."""

    def __init__(
        self, source: str, min_interval: float = 1.0, raw_dir: Path = RAW, max_interval: float = 60.0
    ):
        self.dir = raw_dir / source
        self.min_interval = min_interval
        self.max_interval = max_interval
        self.interval = min_interval
        self._last = 0.0
        self._http = httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT}, follow_redirects=True)

    def path(self, key: str) -> Path:
        return self.dir / key

    def cached(self, key: str) -> bool:
        return self.path(key).exists()

    def read(self, key: str) -> str:
        return self.path(key).read_text(encoding="utf-8")

    def _throttle(self) -> None:
        wait = self.interval * random.uniform(0.8, 1.2) - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()

    def _back_off(self, reason: str, retry_after: float, attempt: int) -> None:
        self.interval = min(self.max_interval, self.interval * 2)
        pause = max(retry_after, self.interval * 2**attempt)
        print(f"  {reason}: pausing {pause:.0f}s, then 1 request per {self.interval:.1f}s", flush=True)
        time.sleep(pause)

    def _send(self, method: str, url: str, **kw) -> str:
        return self._request(method, url, **kw).text

    def _request(self, method: str, url: str, **kw) -> httpx.Response:
        attempts = 6
        for attempt in range(attempts):
            self._throttle()
            try:
                r = self._http.request(method, url, **kw)
            except httpx.TransportError as e:
                if attempt == attempts - 1:
                    raise
                self._back_off(type(e).__name__, 0, attempt)
                continue
            if r.status_code in RETRYABLE and attempt < attempts - 1:
                self._back_off(f"HTTP {r.status_code}", _retry_after(r), attempt)
                continue
            r.raise_for_status()
            self.interval = max(self.min_interval, self.interval * 0.95)
            return r
        raise AssertionError("unreachable")

    def get(self, key: str, url: str, refresh: bool = False, **kw) -> str:
        if not refresh and self.cached(key):
            return self.read(key)
        text = self._send("GET", url, **kw)
        self._store(key, text)
        return text

    def get_bytes(self, key: str, url: str, refresh: bool = False, **kw) -> bytes:
        p = self.path(key)
        if not refresh and p.exists():
            return p.read_bytes()
        data = self._request("GET", url, **kw).content
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(p)
        return data

    def post_json(self, key: str, url: str, payload: dict, refresh: bool = False, **kw) -> dict:
        if not refresh and self.cached(key):
            return json.loads(self.read(key))
        text = self._send("POST", url, json=payload, **kw)
        data = json.loads(text)
        if data.get("errors"):
            raise RuntimeError(f"{url} {key}: {data['errors']}")
        self._store(key, text)
        return data

    def _store(self, key: str, text: str) -> None:
        p = self.path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(p)


def _retry_after(r: httpx.Response) -> float:
    try:
        return float(r.headers.get("Retry-After", 0))
    except ValueError:
        return 0.0
