import type { AnalysisResult } from "@/lib/schemas/api";
import type { CourseProgress, CourseStatus, ProgressState } from "./types";

const KEY = "mira:progress:v1";
const CURRENT_VERSION = 1;

export interface CourseProgressStore {
  getAll(): CourseProgress[];
  upsertFromAnalysis(result: AnalysisResult): CourseProgress[];
  updateStatus(courseId: string, status: CourseStatus): CourseProgress[];
  reset(): void;
}

export class LocalStorageProgressStore implements CourseProgressStore {
  getAll(): CourseProgress[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed: ProgressState = JSON.parse(raw);
      if (parsed.schemaVersion !== CURRENT_VERSION) return [];
      // Migration: legacy entries (pre-isPrimary) → mark the FIRST item per
      // gapSkill as primary, others as alternates. localStorage preserves
      // insertion order, and we originally inserted gap-by-gap, so the first
      // entry per gap is in fact the original primary. This prevents over-
      // counting old data after the smart-counting change.
      const items = parsed.items ?? [];
      const seen = new Set<string>();
      return items.map((it) => {
        if (typeof it.isPrimary === "boolean") return it;
        const isPrimary = !seen.has(it.gapSkill);
        seen.add(it.gapSkill);
        return { ...it, isPrimary };
      });
    } catch {
      return [];
    }
  }

  upsertFromAnalysis(result: AnalysisResult): CourseProgress[] {
    const existing = this.getAll();
    const byId = new Map(existing.map((i) => [i.courseId, i] as const));
    const now = Date.now();

    const allGaps = [...result.required_gaps, ...result.nice_to_have_gaps];
    for (const gap of allGaps) {
      gap.courses.forEach((course, idx) => {
        const isPrimary = idx === 0;
        const prior = byId.get(course.course_id);
        if (prior) {
          byId.set(course.course_id, {
            ...prior,
            courseTitle: course.title,
            courseUrl: course.url,
            channel: course.channel,
            gapSkill: gap.skill,
            gapSeverity: gap.severity as 1 | 2 | 3 | 4 | 5,
            gapCategory: gap.category,
            isPrimary: prior.isPrimary || isPrimary, // sticky promotion to primary
          });
        } else {
          byId.set(course.course_id, {
            courseId: course.course_id,
            courseTitle: course.title,
            courseUrl: course.url,
            channel: course.channel,
            gapSkill: gap.skill,
            gapSeverity: gap.severity as 1 | 2 | 3 | 4 | 5,
            gapCategory: gap.category,
            isPrimary,
            status: "not_started",
            startedAt: null,
            completedAt: null,
            lastTouchedAt: now,
            notes: "",
          });
        }
      });
    }

    const merged = Array.from(byId.values());
    this._save(merged);
    return merged;
  }

  updateStatus(courseId: string, status: CourseStatus): CourseProgress[] {
    const items = this.getAll();
    const now = Date.now();
    const idx = items.findIndex((i) => i.courseId === courseId);
    if (idx === -1) return items;
    const item = { ...items[idx], status, lastTouchedAt: now };
    if (status === "in_progress" && !item.startedAt) item.startedAt = now;
    if (status === "completed" && !item.completedAt) item.completedAt = now;
    items[idx] = item;
    this._save(items);
    return items;
  }

  reset(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(KEY);
  }

  private _save(items: CourseProgress[]): void {
    if (typeof window === "undefined") return;
    const state: ProgressState = { schemaVersion: CURRENT_VERSION, items };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* quota or disabled — silently degrade; future-self can add a toast */
    }
  }
}
