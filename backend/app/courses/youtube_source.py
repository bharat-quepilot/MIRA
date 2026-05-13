import html

import httpx

from app.courses.ranker import rank_course
from app.courses.source import CourseSource
from app.schemas.llm_models import Course

YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"


class YouTubeSource(CourseSource):
    name = "youtube"

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def fetch_courses(self, *, query: str, skill_id: str) -> list[Course]:
        params = {
            "part": "snippet",
            "q": query,
            "type": "video",
            "videoDuration": "medium",
            "relevanceLanguage": "en",
            "maxResults": "10",
            "key": self.api_key,
        }
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get(YT_SEARCH_URL, params=params)
        res.raise_for_status()
        data = res.json()
        items = data.get("items", [])
        if not items:
            return []

        courses = [
            Course(
                course_id=f"yt:{item['id']['videoId']}",
                title=html.unescape(item["snippet"]["title"]),
                channel=html.unescape(item["snippet"]["channelTitle"]),
                duration_minutes=None,
                url=f"https://www.youtube.com/watch?v={item['id']['videoId']}",
                thumbnail=item["snippet"]["thumbnails"].get("medium", {}).get("url"),
                quality_score=rank_course(item["snippet"]),
            )
            for item in items
            if item.get("id", {}).get("videoId")
        ]
        courses.sort(key=lambda c: c.quality_score, reverse=True)
        return courses
