from datetime import datetime, timezone

# Channel quality scores — higher = preferred. Picked by reputation for
# free, structured developer content. Unknown channels get a neutral 0.4.
_CHANNEL_QUALITY: dict[str, float] = {
    "freeCodeCamp.org": 1.0,
    "Fireship": 0.95,
    "ByteByteGo": 0.95,
    "Hussein Nasser": 0.9,
    "Traversy Media": 0.9,
    "The Net Ninja": 0.9,
    "Web Dev Simplified": 0.9,
    "TechWorld with Nana": 0.9,
    "Academind": 0.85,
    "Programming with Mosh": 0.8,
    "Theo - t3.gg": 0.8,
    "Honeycomb": 0.85,
    "Stephane Maarek": 0.85,
    "Tech with Tim": 0.8,
    "AI Jason": 0.7,
    "Continuous Delivery": 0.85,
    "Beyond Code": 0.7,
}


def rank_course(snippet: dict) -> float:
    """Score = 0.7 * channel + 0.3 * recency, clamped to [0,1]."""
    channel = snippet.get("channelTitle", "")
    channel_score = _CHANNEL_QUALITY.get(channel, 0.4)

    published = snippet.get("publishedAt")
    if published:
        try:
            published_dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
            months_old = (datetime.now(timezone.utc) - published_dt).days / 30
            recency_score = max(0.4, 1 - months_old / 60)
        except Exception:
            recency_score = 0.5
    else:
        recency_score = 0.5

    return round(channel_score * 0.7 + recency_score * 0.3, 3)
