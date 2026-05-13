"use client";

import { useState } from "react";
import { Play, X } from "lucide-react";

import { YouTubeEmbed } from "@/components/ui/YouTubeEmbed";
import { useProgress } from "@/state/ProgressContext";
import { useToast } from "@/state/ToastContext";
import { useWatchHeuristic } from "@/state/WatchHeuristicContext";
import type { CourseProgress } from "@/lib/progress/types";
import type { Course } from "@/lib/schemas/api";
import { extractYouTubeVideoId } from "@/lib/youtube/extract-id";

/**
 * Lighter card for the 2 alternate videos behind the disclosure.
 * Clicking Watch reveals an inline auto-tracking embed (YouTube) or opens
 * the external URL with a nudge toast (anything else).
 */
export function AlternateCourseCard({
  course,
  progress,
}: {
  course: Course;
  progress: CourseProgress | null;
}) {
  const { updateStatus } = useProgress();
  const { push } = useToast();
  const { trackWatch } = useWatchHeuristic();
  const status = progress?.status ?? "not_started";
  const videoId = extractYouTubeVideoId(course);

  const [playing, setPlaying] = useState(false);

  const onWatch = () => {
    if (videoId) {
      setPlaying(true);
      return;
    }
    if (status === "not_started") {
      updateStatus(course.course_id, "in_progress");
    }
    if (typeof window !== "undefined") {
      window.open(course.url, "_blank", "noopener,noreferrer");
    }
    const expectMs = (course.duration_minutes ?? 0) * 60 * 1000;
    if (expectMs > 0) {
      trackWatch({
        courseId: course.course_id,
        title: course.title,
        expectMs,
      });
    } else {
      push({
        message: `📺 Watching “${truncate(course.title, 50)}”?`,
        description: "Click below when you're done to mark it complete.",
        actionLabel: "Mark complete",
        onAction: () => updateStatus(course.course_id, "completed"),
        durationMs: 30000,
      });
    }
  };

  if (playing && videoId) {
    return (
      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="truncate text-xs text-slate-700">{course.title}</p>
          <button
            onClick={() => setPlaying(false)}
            className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close player"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <YouTubeEmbed
          videoId={videoId}
          fallbackUrl={course.url}
          initialStatus={status}
          onStatusChange={(next) => updateStatus(course.course_id, next)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-800">{course.title}</p>
        <p className="text-xs text-slate-500">
          {course.channel}
          {typeof course.duration_minutes === "number" &&
            ` · ${course.duration_minutes}min`}
          {videoId && (
            <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
              auto-track
            </span>
          )}
          {status !== "not_started" && (
            <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              {status === "completed"
                ? "completed"
                : status === "skipped"
                ? "skipped"
                : "in progress"}
            </span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onWatch}
        className="inline-flex flex-none items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
      >
        <Play className="h-3 w-3" /> Watch
      </button>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
