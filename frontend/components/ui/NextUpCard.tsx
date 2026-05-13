import { Target } from "lucide-react";

import type { CourseProgress } from "@/lib/progress/types";

export function NextUpCard({ next }: { next: CourseProgress | null }) {
  if (!next) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">
          🎉 You're all caught up
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Every recommended course has been started or completed. Pick something
          to revisit, or re-run analysis with an updated resume.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 shadow-sm">
      <header className="flex items-center gap-2 text-sm font-semibold text-brand-700">
        <Target className="h-4 w-4" />
        Next Up
      </header>
      <div className="mt-2">
        <a
          href={next.courseUrl}
          target="_blank"
          rel="noreferrer"
          className="text-base font-semibold text-slate-900 hover:text-brand-700"
        >
          {next.courseTitle}
        </a>
        <p className="mt-0.5 text-xs text-slate-600">{next.channel}</p>
      </div>
      <p className="mt-2 text-xs text-slate-700">
        Why: <strong>{next.gapSkill}</strong> is{" "}
        {next.gapCategory === "required" ? "required" : "nice-to-have"} (severity{" "}
        {next.gapSeverity}).
      </p>
    </div>
  );
}
