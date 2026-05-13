import type { AnalysisResult } from "@/lib/schemas/api";
import type {
  CourseProgress,
  CourseStatus,
  ProgressState,
  Session,
} from "./types";

const KEY = "mira:progress:v2";
const CURRENT_VERSION = 2;

/**
 * Per-session course progress store.
 *
 * `sessionKey` partitions localStorage so a fresh (resume, jd) pair lands in
 * its own bucket and can never inherit "completed" status from a prior
 * analysis. Re-running the same (resume, jd) lands in the same bucket so
 * legitimate in-flight progress survives page reloads.
 */
export interface CourseProgressStore {
  getSession(sessionKey: string): CourseProgress[];
  upsertFromAnalysis(
    sessionKey: string,
    result: AnalysisResult,
  ): CourseProgress[];
  updateStatus(
    sessionKey: string,
    courseId: string,
    status: CourseStatus,
  ): CourseProgress[];
  resetSession(sessionKey: string): void;
  resetAll(): void;
}

export class LocalStorageProgressStore implements CourseProgressStore {
  getSession(sessionKey: string): CourseProgress[] {
    return this._readAll().sessions[sessionKey]?.items ?? [];
  }

  upsertFromAnalysis(
    sessionKey: string,
    result: AnalysisResult,
  ): CourseProgress[] {
    const state = this._readAll();
    const now = Date.now();
    const prior = state.sessions[sessionKey]?.items ?? [];
    const priorById = new Map(prior.map((p) => [p.courseId, p] as const));

    // Build the fresh canonical list from the new analysis. For each course
    // that already existed in *this* session, preserve its status and
    // timestamps — re-running the same analysis shouldn't reset progress
    // you've already made. Cross-session leakage is impossible because each
    // (resume, jd) pair has its own bucket.
    const allGaps = [...result.required_gaps, ...result.nice_to_have_gaps];
    const items: CourseProgress[] = [];
    for (const gap of allGaps) {
      gap.courses.forEach((course, idx) => {
        const isPrimary = idx === 0;
        const p = priorById.get(course.course_id);
        items.push({
          courseId: course.course_id,
          courseTitle: course.title,
          courseUrl: course.url,
          channel: course.channel,
          gapSkill: gap.skill,
          gapSeverity: gap.severity as 1 | 2 | 3 | 4 | 5,
          gapCategory: gap.category,
          isPrimary: p ? p.isPrimary || isPrimary : isPrimary,
          status: p?.status ?? "not_started",
          startedAt: p?.startedAt ?? null,
          completedAt: p?.completedAt ?? null,
          lastTouchedAt: p?.lastTouchedAt ?? now,
          notes: p?.notes ?? "",
        });
      });
    }

    state.sessions[sessionKey] = { items, lastTouchedAt: now };
    this._writeAll(state);
    return items;
  }

  updateStatus(
    sessionKey: string,
    courseId: string,
    status: CourseStatus,
  ): CourseProgress[] {
    const state = this._readAll();
    const session = state.sessions[sessionKey];
    if (!session) return [];
    const idx = session.items.findIndex((i) => i.courseId === courseId);
    if (idx === -1) return session.items;
    const now = Date.now();
    const item: CourseProgress = {
      ...session.items[idx],
      status,
      lastTouchedAt: now,
    };
    if (status === "in_progress" && !item.startedAt) item.startedAt = now;
    if (status === "completed" && !item.completedAt) item.completedAt = now;
    session.items[idx] = item;
    session.lastTouchedAt = now;
    state.sessions[sessionKey] = session;
    this._writeAll(state);
    return session.items;
  }

  resetSession(sessionKey: string): void {
    const state = this._readAll();
    delete state.sessions[sessionKey];
    this._writeAll(state);
  }

  resetAll(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(KEY);
  }

  // ─── internals ──────────────────────────────────────────────────────

  private _readAll(): ProgressState {
    const empty: ProgressState = {
      schemaVersion: CURRENT_VERSION,
      sessions: {},
    };
    if (typeof window === "undefined") return empty;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return empty;
      const parsed = JSON.parse(raw) as Partial<ProgressState>;
      // v1 → v2 migration: v1 was a flat `items` array with no concept of
      // sessions. We can't reconstruct sessions from it, so we drop the old
      // data. The whole point of v2 is to fix the leakage v1 caused.
      if (parsed.schemaVersion !== CURRENT_VERSION || !parsed.sessions) {
        return empty;
      }
      return parsed as ProgressState;
    } catch {
      return empty;
    }
  }

  private _writeAll(state: ProgressState): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* quota or disabled — silently degrade; future-self can add a toast */
    }
  }
}

// Re-export for callers that want a default in-memory implementation (tests).
export class InMemoryProgressStore implements CourseProgressStore {
  private state: ProgressState = {
    schemaVersion: CURRENT_VERSION,
    sessions: {},
  };

  getSession(sessionKey: string): CourseProgress[] {
    return this.state.sessions[sessionKey]?.items ?? [];
  }

  upsertFromAnalysis(
    sessionKey: string,
    result: AnalysisResult,
  ): CourseProgress[] {
    // Delegate to the real store's logic by constructing a Session here.
    const prior = this.state.sessions[sessionKey]?.items ?? [];
    const priorById = new Map(prior.map((p) => [p.courseId, p] as const));
    const now = Date.now();
    const items: CourseProgress[] = [];
    for (const gap of [...result.required_gaps, ...result.nice_to_have_gaps]) {
      gap.courses.forEach((course, idx) => {
        const isPrimary = idx === 0;
        const p = priorById.get(course.course_id);
        items.push({
          courseId: course.course_id,
          courseTitle: course.title,
          courseUrl: course.url,
          channel: course.channel,
          gapSkill: gap.skill,
          gapSeverity: gap.severity as 1 | 2 | 3 | 4 | 5,
          gapCategory: gap.category,
          isPrimary: p ? p.isPrimary || isPrimary : isPrimary,
          status: p?.status ?? "not_started",
          startedAt: p?.startedAt ?? null,
          completedAt: p?.completedAt ?? null,
          lastTouchedAt: p?.lastTouchedAt ?? now,
          notes: p?.notes ?? "",
        });
      });
    }
    this.state.sessions[sessionKey] = { items, lastTouchedAt: now } as Session;
    return items;
  }

  updateStatus(
    sessionKey: string,
    courseId: string,
    status: CourseStatus,
  ): CourseProgress[] {
    const session = this.state.sessions[sessionKey];
    if (!session) return [];
    const idx = session.items.findIndex((i) => i.courseId === courseId);
    if (idx === -1) return session.items;
    const now = Date.now();
    const item: CourseProgress = {
      ...session.items[idx],
      status,
      lastTouchedAt: now,
    };
    if (status === "in_progress" && !item.startedAt) item.startedAt = now;
    if (status === "completed" && !item.completedAt) item.completedAt = now;
    session.items[idx] = item;
    session.lastTouchedAt = now;
    return session.items;
  }

  resetSession(sessionKey: string): void {
    delete this.state.sessions[sessionKey];
  }

  resetAll(): void {
    this.state = { schemaVersion: CURRENT_VERSION, sessions: {} };
  }
}
