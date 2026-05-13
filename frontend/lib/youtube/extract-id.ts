/**
 * Return a YouTube video ID for a course, or null if it isn't a YouTube video.
 *
 * Accepts:
 *   - `course_id` like "yt:BwuLxPH8IDs" (YouTube source)
 *   - `url` like "https://www.youtube.com/watch?v=BwuLxPH8IDs"
 *   - `url` like "https://youtu.be/BwuLxPH8IDs"
 *
 * Returns null for channel pages, non-YouTube hosts, or malformed URLs —
 * the caller falls back to opening the URL externally.
 */
export function extractYouTubeVideoId(course: {
  course_id: string;
  url: string;
}): string | null {
  if (course.course_id.startsWith("yt:")) {
    const id = course.course_id.slice(3);
    return isLikelyVideoId(id) ? id : null;
  }

  try {
    const u = new URL(course.url);
    if (u.hostname.replace(/^www\./, "") === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return isLikelyVideoId(id) ? id : null;
    }
    if (u.hostname.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && isLikelyVideoId(v)) return v;
      // /embed/VIDEO_ID and /shorts/VIDEO_ID forms
      const match = u.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/);
      if (match && isLikelyVideoId(match[1])) return match[1];
    }
  } catch {
    /* malformed URL — fall through */
  }
  return null;
}

function isLikelyVideoId(id: string): boolean {
  // YouTube IDs are 11 characters of [A-Za-z0-9_-], but we accept 6+ to be
  // liberal — the player will surface an `onError` if the ID is bad.
  return /^[A-Za-z0-9_-]{6,}$/.test(id);
}
