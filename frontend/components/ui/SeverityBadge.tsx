import { cx } from "@/lib/utils/cx";

const COLORS: Record<number, string> = {
  5: "text-rose-700 bg-rose-50 border-rose-200",
  4: "text-orange-700 bg-orange-50 border-orange-200",
  3: "text-amber-700 bg-amber-50 border-amber-200",
  2: "text-blue-700 bg-blue-50 border-blue-200",
  1: "text-slate-700 bg-slate-50 border-slate-200",
};

const DOT = "●";
const EMPTY = "○";

export function SeverityBadge({ severity }: { severity: number }) {
  const filled = Math.max(1, Math.min(5, severity));
  const dots = DOT.repeat(filled) + EMPTY.repeat(5 - filled);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium",
        COLORS[filled] ?? COLORS[3],
      )}
      title={`Severity ${filled}/5`}
    >
      <span className="font-mono">{dots}</span>
      <span>sev {filled}</span>
    </span>
  );
}
