import time
from collections import defaultdict

_BUCKETS: dict[str, list[float]] = defaultdict(list)

_LIMIT = 10           # requests
_WINDOW_S = 3600      # per hour


def check_rate_limit(client_ip: str) -> bool:
    """Sliding-window rate limit. Returns True if request allowed."""
    now = time.time()
    window_start = now - _WINDOW_S
    bucket = _BUCKETS[client_ip]
    # Drop expired entries
    while bucket and bucket[0] < window_start:
        bucket.pop(0)
    if len(bucket) >= _LIMIT:
        return False
    bucket.append(now)
    return True
