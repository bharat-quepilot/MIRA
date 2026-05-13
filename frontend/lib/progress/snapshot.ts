import type { CourseProgress, ProgressSnapshot } from "./types";

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

/**
 * Smart counting (architecture §15):
 *   - Primary courses count toward total ALWAYS.
 *   - Alternate courses count only if the user has *touched* them
 *     (status !== "not_started"). This keeps the progress bar meaningful
 *     ("9 things to learn") instead of overwhelming ("27 videos to watch").
 */
function isCounted(item: CourseProgress): boolean {
  if (item.isPrimary) return true;
  return item.status !== "not_started";
}

export function computeSnapshot(items: CourseProgress[]): ProgressSnapshot {
  // The caller now passes only items belonging to the current session
  // (see LocalStorageProgressStore.getSession). No scope-filter needed here.
  const counted = items.filter(isCounted);

  const total = counted.length;
  const completed = counted.filter((i) => i.status === "completed");
  const inProgress = counted.filter((i) => i.status === "in_progress");
  const notStarted = counted.filter((i) => i.status === "not_started");

  const totalWeight = counted.reduce((s, i) => s + i.gapSeverity, 0);
  const completedWeight = completed.reduce((s, i) => s + i.gapSeverity, 0);
  const weightedPercent = totalWeight ? (completedWeight / totalWeight) * 100 : 0;

  const required = counted.filter((i) => i.gapCategory === "required");
  const niceToHave = counted.filter((i) => i.gapCategory === "nice_to_have");
  const requiredDone = required.filter((i) => i.status === "completed").length;
  const niceDone = niceToHave.filter((i) => i.status === "completed").length;

  const now = Date.now();
  const staleItems = inProgress.filter((i) => now - i.lastTouchedAt > SEVEN_DAYS);
  const recentlyCompleted = completed
    .filter((i) => i.completedAt && now - i.completedAt < SEVEN_DAYS)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 5);

  return {
    totalCourses: total,
    completed: completed.length,
    inProgress: inProgress.length,
    notStarted: notStarted.length,
    overallPercent: total ? Math.round((completed.length / total) * 100) : 0,
    weightedPercent: Math.round(weightedPercent),
    requiredGapsPercent: required.length
      ? Math.round((requiredDone / required.length) * 100)
      : 0,
    niceToHavePercent: niceToHave.length
      ? Math.round((niceDone / niceToHave.length) * 100)
      : 0,
    staleItems,
    recentlyCompleted,
    currentStreak: computeStreak(items), // streak counts ANY touch, primary or alt
  };
}

function computeStreak(items: CourseProgress[]): number {
  const dates = new Set(
    items
      .filter((i) => i.lastTouchedAt)
      .map((i) => new Date(i.lastTouchedAt).toISOString().slice(0, 10)),
  );
  let streak = 0;
  const d = new Date();
  while (streak < 60) {
    const key = d.toISOString().slice(0, 10);
    if (!dates.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
