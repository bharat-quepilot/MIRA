"use client";

import { Play } from "lucide-react";

import { useProgress } from "@/state/ProgressContext";
import { useToast } from "@/state/ToastContext";
import type { CourseProgress } from "@/lib/progress/types";
import type { Course } from "@/lib/schemas/api";

/**
 * Lighter-weight card for the 2 alternate videos behind the disclosure.
 * No thumbnail, no status dropdown. Clicking "Watch" auto-marks the alternate
 * as in_progress, which (per smart counting) also adds it to the user's plan.
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
  const status = progress?.status ?? "not_started";

  const handleWatch = () => {
    if (status === "not_started") {
      updateStatus(course.course_id, "in_progress");
    }
    if (typeof window !== "undefined") {
      window.open(course.url, "_blank", "noopener,noreferrer");
    }
    push({
      message: `📺 Watching “${truncate(course.title, 50)}”?`,
      description: "Click below when you're done to mark it complete.",
      actionLabel: "Mark complete",
      onAction: () => updateStatus(course.course_id, "completed"),
      durationMs: 30000,
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-800">{course.title}</p>
        <p className="text-xs text-slate-500">
          {course.channel}
          {typeof course.duration_minutes === "number" &&
            ` · ${course.duration_minutes}min`}
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
        onClick={handleWatch}
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
