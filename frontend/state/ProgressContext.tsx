"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  LocalStorageProgressStore,
  type CourseProgressStore,
} from "@/lib/progress/course-progress-store";
import { computeSnapshot } from "@/lib/progress/snapshot";
import type {
  CourseProgress,
  CourseStatus,
  ProgressSnapshot,
} from "@/lib/progress/types";
import type { AnalysisResult } from "@/lib/schemas/api";

interface ProgressCtx {
  items: CourseProgress[];
  snapshot: ProgressSnapshot;
  syncFromAnalysis: (result: AnalysisResult) => void;
  updateStatus: (courseId: string, status: CourseStatus) => void;
  reset: () => void;
}

const Ctx = createContext<ProgressCtx | null>(null);

export function ProgressProvider({
  store,
  children,
}: {
  store?: CourseProgressStore;
  children: ReactNode;
}) {
  const resolvedStore = useMemo(
    () => store ?? new LocalStorageProgressStore(),
    [store],
  );
  const [items, setItems] = useState<CourseProgress[]>([]);
  const [visibleCourseIds, setVisibleCourseIds] = useState<Set<string> | null>(
    null,
  );

  useEffect(() => {
    setItems(resolvedStore.getAll());
  }, [resolvedStore]);

  const snapshot = useMemo(
    () => computeSnapshot(items, visibleCourseIds ?? undefined),
    [items, visibleCourseIds],
  );

  const syncFromAnalysis = useCallback(
    (result: AnalysisResult) => {
      const merged = resolvedStore.upsertFromAnalysis(result);
      setItems(merged);
      const ids = new Set<string>();
      for (const g of [...result.required_gaps, ...result.nice_to_have_gaps]) {
        for (const c of g.courses) ids.add(c.course_id);
      }
      setVisibleCourseIds(ids);
    },
    [resolvedStore],
  );

  const updateStatus = useCallback(
    (courseId: string, status: CourseStatus) => {
      const updated = resolvedStore.updateStatus(courseId, status);
      setItems(updated);
    },
    [resolvedStore],
  );

  const reset = useCallback(() => {
    resolvedStore.reset();
    setItems([]);
    setVisibleCourseIds(null);
  }, [resolvedStore]);

  return (
    <Ctx.Provider value={{ items, snapshot, syncFromAnalysis, updateStatus, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProgress(): ProgressCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProgress must be used within ProgressProvider");
  return ctx;
}
