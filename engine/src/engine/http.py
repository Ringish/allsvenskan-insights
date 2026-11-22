"""Polite HTTP client with an on-disk raw cache.

Every response is stored under data/raw/<source>/<key>. A cached key is never
fetched again unless refresh=True, so parsing and rebuilding work offline.
"""

import json
import time
from pathlib import Path

import httpx

from engine.paths import RAW

USER_AGENT = "allsvenskan-insights/0.1 (private research project)"


class CachedClient:
    def __init__(self, source: str, min_interval: float = 1.0, raw_dir: Path = RAW):
        self.dir = raw_dir / source
        self.min_interval = min_interval
        self._last = 0.0
        self._http = httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT}, follow_redirects=True)

    def path(self, key: str) -> Path:
        return self.dir / key

    def cached(self, key: str) -> bool:
        return self.path(key).exists()

    def read(self, key: str) -> str:
        return self.path(key).read_text(encoding="utf-8")

    def _throttle(self) -> None:
        wait = self.min_interval - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()

    def _send(self, method: str, url: str, **kw) -> str:
        return self._request(method, url, **kw).text

    def _request(self, method: str, url: str, **kw) -> httpx.Response:
        delay = 2.0
        for attempt in range(5):
            self._throttle()
            try:
                r = self._http.request(method, url, **kw)
                if r.status_code in (429, 500, 502, 503, 504):
                    raise httpx.HTTPStatusError("retryable", request=r.request, response=r)
                r.raise_for_status()
                return r
            except (httpx.TransportError, httpx.HTTPStatusError):
                if attempt == 4:
                    raise
                time.sleep(delay)
                delay *= 2
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
