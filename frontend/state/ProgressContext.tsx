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
import { useAnalysis } from "@/state/AnalysisContext";

interface ProgressCtx {
  items: CourseProgress[];
  snapshot: ProgressSnapshot;
  syncFromAnalysis: (result: AnalysisResult) => void;
  updateStatus: (courseId: string, status: CourseStatus) => void;
  /** Wipes progress for the current session only. */
  reset: () => void;
  /** Wipes ALL sessions across all analyses. Use sparingly. */
  resetAll: () => void;
}

const Ctx = createContext<ProgressCtx | null>(null);

const EMPTY_ITEMS: CourseProgress[] = [];

export function ProgressProvider({
  store,
  children,
}: {
  store?: CourseProgressStore;
  children: ReactNode;
}) {
  const { sessionKey } = useAnalysis();

  const resolvedStore = useMemo(
    () => store ?? new LocalStorageProgressStore(),
    [store],
  );
  const [items, setItems] = useState<CourseProgress[]>(EMPTY_ITEMS);

  // Whenever the session changes (different resume/JD inputs, or first
  // analysis), reload items for that session's bucket. When there's no
  // session yet, items must be empty — there's nothing to show progress for.
  useEffect(() => {
    if (sessionKey) {
      setItems(resolvedStore.getSession(sessionKey));
    } else {
      setItems(EMPTY_ITEMS);
    }
  }, [sessionKey, resolvedStore]);

  const snapshot = useMemo(() => computeSnapshot(items), [items]);

  const syncFromAnalysis = useCallback(
    (result: AnalysisResult) => {
      if (!sessionKey) return; // no inputs yet — caller is racing analyze()
      const updated = resolvedStore.upsertFromAnalysis(sessionKey, result);
      setItems(updated);
    },
    [resolvedStore, sessionKey],
  );

  const updateStatus = useCallback(
    (courseId: string, status: CourseStatus) => {
      if (!sessionKey) return;
      const updated = resolvedStore.updateStatus(sessionKey, courseId, status);
      setItems(updated);
    },
    [resolvedStore, sessionKey],
  );

  const reset = useCallback(() => {
    if (!sessionKey) return;
    resolvedStore.resetSession(sessionKey);
    setItems(EMPTY_ITEMS);
  }, [resolvedStore, sessionKey]);

  const resetAll = useCallback(() => {
    resolvedStore.resetAll();
    setItems(EMPTY_ITEMS);
  }, [resolvedStore]);

  return (
    <Ctx.Provider
      value={{
        items,
        snapshot,
        syncFromAnalysis,
        updateStatus,
        reset,
        resetAll,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useProgress(): ProgressCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProgress must be used within ProgressProvider");
  return ctx;
}
