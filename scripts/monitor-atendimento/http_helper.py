"""
HTTP helper — GET/POST com retry e backoff exponencial.
Usa apenas stdlib (urllib). Sem dependências externas.
"""

import json
import time
import logging
import urllib.request
import urllib.parse

from config import RETRY_COUNT, RETRY_BASE_BACKOFF, REQUEST_TIMEOUT

log = logging.getLogger(__name__)

_DEFAULT_HEADERS = {
    "User-Agent": "MonitorAtendimento/1.0",
    "Accept": "application/json",
}


def http_get(url, headers=None, params=None):
    """GET request com retry."""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    merged = {**_DEFAULT_HEADERS, **(headers or {})}

    for attempt in range(RETRY_COUNT):
        try:
            req = urllib.request.Request(url)
            for k, v in merged.items():
                req.add_header(k, v)
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                return json.loads(resp.read())
        except Exception as e:
            wait = RETRY_BASE_BACKOFF ** (attempt + 1)
            log.warning("GET %s falhou (tentativa %d/%d): %s — retry em %ds",
                        url[:80], attempt + 1, RETRY_COUNT, e, wait)
            if attempt + 1 == RETRY_COUNT:
                log.error("GET %s falhou após %d tentativas", url[:80], RETRY_COUNT)
                raise
            time.sleep(wait)


def http_post(url, headers=None, body=None):
    """POST request com retry."""
    data = json.dumps(body).encode("utf-8") if body else None

    merged = {**_DEFAULT_HEADERS, "Content-Type": "application/json; charset=utf-8", **(headers or {})}

    for attempt in range(RETRY_COUNT):
        try:
            req = urllib.request.Request(url, data=data, method="POST")
            for k, v in merged.items():
                req.add_header(k, v)
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                return json.loads(resp.read())
        except Exception as e:
            wait = RETRY_BASE_BACKOFF ** (attempt + 1)
            log.warning("POST %s falhou (tentativa %d/%d): %s — retry em %ds",
                        url[:80], attempt + 1, RETRY_COUNT, e, wait)
            if attempt + 1 == RETRY_COUNT:
                log.error("POST %s falhou após %d tentativas", url[:80], RETRY_COUNT)
                raise
            time.sleep(wait)
