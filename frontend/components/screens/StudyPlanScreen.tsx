"use client";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/primitives/Button";
import { AlternateCourseCard } from "@/components/ui/AlternateCourseCard";
import { CourseCard } from "@/components/ui/CourseCard";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import type { EnrichedGap } from "@/lib/schemas/api";
import { useAnalysis } from "@/state/AnalysisContext";
import { useProgress } from "@/state/ProgressContext";

export function StudyPlanScreen() {
  const { result, setView } = useAnalysis();
  const { items, snapshot, reset } = useProgress();

  const onReset = () => {
    if (
      typeof window !== "undefined" &&
      window.confirm(
        "Reset progress for this analysis? (Other analyses are unaffected.)",
      )
    ) {
      reset();
    }
  };

  if (!result) {
    return (
      <div className="text-sm text-slate-500">No analysis loaded yet.</div>
    );
  }

  const allGaps: EnrichedGap[] = [
    ...result.required_gaps,
    ...result.nice_to_have_gaps,
  ];

  const progressById = new Map(items.map((i) => [i.courseId, i] as const));

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setView("results")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Results
        </Button>
        <button
          onClick={onReset}
          className="text-xs text-slate-500 hover:text-rose-600"
          title="Wipe all course progress saved in this browser"
        >
          Reset progress
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Progress</h2>
          <p className="text-sm text-slate-600">
            {snapshot.completed} of {snapshot.totalCourses}{" "}
            {snapshot.totalCourses === 1 ? "course" : "courses"} ·{" "}
            <span className="font-medium">{snapshot.overallPercent}%</span>
          </p>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-100">
          <div
            className="h-full bg-brand-500 transition-all"
            style={{ width: `${snapshot.weightedPercent}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>Weighted by severity: {snapshot.weightedPercent}%</span>
          <span>Required: {snapshot.requiredGapsPercent}%</span>
          <span>Nice-to-have: {snapshot.niceToHavePercent}%</span>
          <span className="text-slate-400">
            (1 primary per gap; alternates count only when watched)
          </span>
          {snapshot.currentStreak > 0 && (
            <span className="text-amber-700">
              🔥 {snapshot.currentStreak}-day streak
            </span>
          )}
          {snapshot.staleItems.length > 0 && (
            <span className="text-rose-700">
              ⚠ {snapshot.staleItems.length} stale (in-progress &gt; 7d)
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {allGaps.map((gap) => {
          const primary = gap.courses[0];
          const alternates = gap.courses.slice(1);
          const primaryDone =
            primary && progressById.get(primary.course_id)?.status === "completed";
          const touchedAlts = alternates.filter((c) => {
            const s = progressById.get(c.course_id)?.status;
            return s && s !== "not_started";
          }).length;

          return (
            <details
              key={gap.skill}
              className="rounded-xl border border-slate-200 bg-white shadow-sm"
              open={gap.category === "required" && gap.severity >= 4}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 p-4">
                <span className="flex items-center gap-3">
                  <SeverityBadge severity={gap.severity} />
                  <span className="font-semibold text-slate-900">
                    {gap.skill}
                  </span>
                  <span className="text-xs text-slate-500">
                    {gap.category === "required" ? "required" : "nice to have"}
                  </span>
                </span>
                <span className="text-xs tabular-nums text-slate-600">
                  {primaryDone ? "1" : "0"} / 1
                  {touchedAlts > 0 && (
                    <span className="ml-1 text-slate-400">
                      (+{touchedAlts} alt)
                    </span>
                  )}
                </span>
              </summary>

              <div className="space-y-3 px-4 pb-4">
                {primary ? (
                  <CourseCard
                    key={primary.course_id}
                    course={primary}
                    progress={progressById.get(primary.course_id) ?? null}
                  />
                ) : (
                  <p className="rounded bg-slate-50 p-3 text-xs text-slate-500">
                    No courses available for this skill.
                  </p>
                )}

                {alternates.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer list-none text-xs font-medium text-slate-600 hover:text-brand-700">
                      <span className="inline-block group-open:hidden">▸</span>
                      <span className="hidden group-open:inline-block">▾</span>{" "}
                      Show {alternates.length} alternate{" "}
                      {alternates.length === 1 ? "video" : "videos"}
                    </summary>
                    <div className="mt-2 space-y-2">
                      {alternates.map((c) => (
                        <AlternateCourseCard
                          key={c.course_id}
                          course={c}
                          progress={progressById.get(c.course_id) ?? null}
                        />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </details>
          );
        })}
      </div>

      {snapshot.recentlyCompleted.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recently completed
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {snapshot.recentlyCompleted.map((c) => (
              <li key={c.courseId}>
                ✓ {c.courseTitle}{" "}
                <span className="text-xs text-slate-400">— {c.gapSkill}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
