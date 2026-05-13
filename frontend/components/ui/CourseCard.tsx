"use client";

import { useState } from "react";
import { Play, X } from "lucide-react";

import { YouTubeEmbed } from "@/components/ui/YouTubeEmbed";
import { useProgress } from "@/state/ProgressContext";
import { useToast } from "@/state/ToastContext";
import { useWatchHeuristic } from "@/state/WatchHeuristicContext";
import type { CourseProgress, CourseStatus } from "@/lib/progress/types";
import type { Course } from "@/lib/schemas/api";
import { cx } from "@/lib/utils/cx";
import { extractYouTubeVideoId } from "@/lib/youtube/extract-id";

const STATUS_LABELS: Record<CourseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  skipped: "Skipped",
};

const STATUS_TONE: Record<CourseStatus, string> = {
  not_started: "bg-slate-50 text-slate-600 border-slate-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  skipped: "bg-slate-50 text-slate-400 border-slate-200",
};

export function CourseCard({
  course,
  progress,
}: {
  course: Course;
  progress: CourseProgress | null;
}) {
  const { updateStatus } = useProgress();
  const { push } = useToast();
  const { trackWatch } = useWatchHeuristic();
  const status: CourseStatus = progress?.status ?? "not_started";
  const videoId = extractYouTubeVideoId(course);

  const [playing, setPlaying] = useState(false);

  /**
   * Embedded path (YouTube): show inline player; auto-track via IFrame Player API.
   * External path: open new tab; if duration is known, register a Visibility
   * heuristic that prompts the user at ~70% of expected duration ("Did you
   * finish?"). If duration is unknown, fall back to the simple 30s nudge toast.
   */
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
      // No duration metadata — fall back to the original short nudge.
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
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {course.title}
            </p>
            <p className="text-xs text-slate-500">{course.channel}</p>
          </div>
          <button
            onClick={() => setPlaying(false)}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close player"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <YouTubeEmbed
          videoId={videoId}
          fallbackUrl={course.url}
          initialStatus={status}
          onStatusChange={(next) => updateStatus(course.course_id, next)}
        />
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Auto-tracks · marks <strong>in-progress</strong> on play, then{" "}
            <strong>completed</strong> at ≥ 90% watched.
          </span>
          <select
            value={status}
            onChange={(e) =>
              updateStatus(course.course_id, e.target.value as CourseStatus)
            }
            className={cx(
              "rounded border px-2 py-1 text-xs font-medium",
              STATUS_TONE[status],
            )}
            aria-label={`Status for ${course.title}`}
          >
            {Object.entries(STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      {course.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={course.thumbnail}
          alt=""
          className="h-20 w-32 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-20 w-32 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
          no thumb
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{course.title}</p>
          <p className="text-xs text-slate-500">
            {course.channel}
            {typeof course.duration_minutes === "number" &&
              ` · ${course.duration_minutes}min`}
            {videoId && (
              <span
                className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700"
                title="Plays inline and tracks your progress automatically"
              >
                auto-track
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onWatch}
            className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
          >
            <Play className="h-3 w-3 fill-current" />
            {videoId ? "Watch (auto-track)" : "Watch on YouTube"}
          </button>

          <select
            value={status}
            onChange={(e) =>
              updateStatus(course.course_id, e.target.value as CourseStatus)
            }
            className={cx(
              "rounded border px-2 py-1 text-xs font-medium",
              STATUS_TONE[status],
            )}
            aria-label={`Status for ${course.title}`}
          >
            {Object.entries(STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
