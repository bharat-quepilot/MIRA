import { Info } from "lucide-react";

export function FallbackBanner({
  fallbacks,
  mockMode,
}: {
  fallbacks: string[];
  mockMode: boolean;
}) {
  if (!mockMode && fallbacks.length === 0) return null;

  const human: Record<string, string> = {
    resume_parser: "resume parsing",
    jd_parser: "JD parsing",
    gap_reasoner: "gap analysis",
    study_planner: "study planning",
    course_curator: "course curation",
  };

  const items = fallbacks.map((f) => human[f] ?? f);

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <Info className="mt-0.5 h-4 w-4 flex-none" />
      <div>
        {mockMode ? (
          <strong>Demo mode active.</strong>
        ) : (
          <strong>Reduced quality:</strong>
        )}{" "}
        {mockMode ? (
          <span>
            Hand-crafted sample results — set <code>OPENAI_API_KEY</code> for
            live analysis.
          </span>
        ) : (
          <span>
            We used deterministic fallbacks for: {items.join(", ")}. Results are
            still useful but less nuanced.
          </span>
        )}
      </div>
    </div>
  );
}
