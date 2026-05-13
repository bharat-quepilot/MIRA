import { cx } from "@/lib/utils/cx";

export function MatchScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const tone =
    clamped >= 70
      ? "text-emerald-600"
      : clamped >= 40
      ? "text-amber-600"
      : "text-rose-600";

  return (
    <div className="relative inline-flex h-36 w-36 items-center justify-center">
      <svg height="144" width="144" className="rotate-[-90deg]">
        <circle
          cx="72"
          cy="72"
          r={radius}
          stroke="#e2e8f0"
          strokeWidth="10"
          fill="transparent"
        />
        <circle
          cx="72"
          cy="72"
          r={radius}
          stroke="currentColor"
          strokeWidth="10"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cx("transition-all duration-700", tone)}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cx("text-3xl font-bold tabular-nums", tone)}>
          {clamped}%
        </span>
        <span className="text-xs text-slate-500">Match</span>
      </div>
    </div>
  );
}
