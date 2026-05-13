export type CourseStatus = "not_started" | "in_progress" | "completed" | "skipped";

export interface CourseProgress {
  courseId: string;
  courseTitle: string;
  courseUrl: string;
  channel: string;
  gapSkill: string;
  gapSeverity: 1 | 2 | 3 | 4 | 5;
  gapCategory: "required" | "nice_to_have";
  isPrimary: boolean; // first course per gap; counts toward progress totals
  status: CourseStatus;
  startedAt: number | null;
  completedAt: number | null;
  lastTouchedAt: number;
  notes: string;
}

export interface ProgressState {
  schemaVersion: number;
  items: CourseProgress[];
}

export interface ProgressSnapshot {
  totalCourses: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overallPercent: number;
  weightedPercent: number;
  requiredGapsPercent: number;
  niceToHavePercent: number;
  staleItems: CourseProgress[];
  recentlyCompleted: CourseProgress[];
  currentStreak: number;
  recommendedNext: CourseProgress | null;
}
