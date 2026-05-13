import type { EnrichedGap } from "@/lib/schemas/api";
import { SeverityBadge } from "./SeverityBadge";

export function GapCard({ gap }: { gap: EnrichedGap }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={gap.severity} />
          <h3 className="text-base font-semibold text-slate-900">
            {gap.skill}
          </h3>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {gap.status}
          </span>
        </div>
        <span className="whitespace-nowrap text-xs text-slate-500">
          {gap.courses.length} {gap.courses.length === 1 ? "course" : "courses"}
        </span>
      </header>
      <p className="mt-2 text-sm text-slate-700">{gap.evidence}</p>
      {gap.jd_quote && (
        <p className="mt-2 rounded bg-slate-50 p-2 text-xs italic text-slate-600">
          “{gap.jd_quote}”
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Estimated time: {gap.estimated_hours}h
      </p>
    </article>
  );
}
