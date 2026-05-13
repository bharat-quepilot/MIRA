"use client";

import { Play } from "lucide-react";

import { useProgress } from "@/state/ProgressContext";
import { useToast } from "@/state/ToastContext";
import type { CourseProgress, CourseStatus } from "@/lib/progress/types";
import type { Course } from "@/lib/schemas/api";
import { cx } from "@/lib/utils/cx";

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
  const status: CourseStatus = progress?.status ?? "not_started";

  const handleWatch = () => {
    // Auto-progress: not_started → in_progress on first click.
    // Removes a friction step the user would otherwise forget.
    if (status === "not_started") {
      updateStatus(course.course_id, "in_progress");
    }
    // Open YouTube in a new tab; noopener/noreferrer for tabnabbing safety.
    if (typeof window !== "undefined") {
      window.open(course.url, "_blank", "noopener,noreferrer");
    }
    // Nudge toast — one-click "Mark complete" when they come back.
    push({
      message: `📺 Watching “${truncate(course.title, 50)}”?`,
      description: "Click below when you're done to mark it complete.",
      actionLabel: "Mark complete",
      onAction: () => updateStatus(course.course_id, "completed"),
      durationMs: 30000,
    });
  };

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
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleWatch}
            className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
          >
            <Play className="h-3 w-3 fill-current" />
            Watch on YouTube
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
