"use client";

import { useEffect } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/primitives/Button";
import { FallbackBanner } from "@/components/ui/FallbackBanner";
import { GapCard } from "@/components/ui/GapCard";
import { MatchScoreRing } from "@/components/ui/MatchScoreRing";
import { useAnalysis } from "@/state/AnalysisContext";
import { useProgress } from "@/state/ProgressContext";

export function ResultsScreen() {
  const { result, reset, setView } = useAnalysis();
  const { syncFromAnalysis } = useProgress();

  useEffect(() => {
    if (result) syncFromAnalysis(result);
  }, [result, syncFromAnalysis]);

  if (!result) {
    return (
      <div className="text-sm text-slate-500">No analysis loaded yet.</div>
    );
  }

  const totalRequired = result.required_gaps.length;
  const totalNice = result.nice_to_have_gaps.length;

  return (
    <section className="space-y-6">
      <Button variant="ghost" size="sm" onClick={reset}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Re-analyze
      </Button>

      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-6">
          <MatchScoreRing score={result.match_score} />
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Match Score
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {totalRequired} required {totalRequired === 1 ? "gap" : "gaps"} ·{" "}
              {totalNice} nice-to-have ·{" "}
              {result.strengths.length} matched{" "}
              {result.strengths.length === 1 ? "strength" : "strengths"}
            </p>
          </div>
        </div>
        <Button size="md" onClick={() => setView("plan")}>
          View Study Plan <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <FallbackBanner
        fallbacks={result.meta.fallbacks_used}
        mockMode={result.meta.mock_mode}
      />

      {result.strengths.length > 0 && (
        <details className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <summary className="cursor-pointer text-sm font-medium text-emerald-800">
            ✓ {result.strengths.length} strengths matched
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.strengths.map((s) => (
              <span
                key={s}
                className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
              >
                {s}
              </span>
            ))}
          </div>
        </details>
      )}

      {totalRequired > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Critical gaps (required)
          </h3>
          <div className="mt-3 grid gap-3">
            {result.required_gaps.map((g) => (
              <GapCard key={g.skill} gap={g} />
            ))}
          </div>
        </div>
      )}

      {totalNice > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Bonus gaps (nice to have)
          </h3>
          <div className="mt-3 grid gap-3">
            {result.nice_to_have_gaps.map((g) => (
              <GapCard key={g.skill} gap={g} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
