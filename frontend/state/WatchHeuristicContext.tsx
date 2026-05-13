"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

import { useProgress } from "@/state/ProgressContext";
import { useToast } from "@/state/ToastContext";

interface WatchEntry {
  courseId: string;
  title: string;
  clickedAt: number;
  expectMs: number;
  prompted: boolean;
}

interface WatchHeuristicCtx {
  /**
   * Register a non-trackable course the user just opened in an external tab.
   * When the user returns to MIRA after ≥ 70% of `expectMs` has elapsed,
   * we push a "Did you finish?" toast with a one-click Mark-complete shortcut.
   *
   * Pass `expectMs = 0` (or omit) to skip the heuristic — caller should fall
   * back to the basic 30-second nudge toast in that case.
   */
  trackWatch: (entry: {
    courseId: string;
    title: string;
    expectMs: number;
  }) => void;
}

const Ctx = createContext<WatchHeuristicCtx | null>(null);

/** Triggers the "Did you finish?" toast at this fraction of expected duration. */
const TRIGGER_FRACTION = 0.7;

export function WatchHeuristicProvider({ children }: { children: ReactNode }) {
  const { push } = useToast();
  const { updateStatus } = useProgress();

  const entriesRef = useRef<Map<string, WatchEntry>>(new Map());
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Stable refs so trackWatch can use the latest push/updateStatus without
  // re-creating the callback (which would force re-renders downstream).
  const sinksRef = useRef({ push, updateStatus });
  sinksRef.current = { push, updateStatus };

  const maybePrompt = useCallback((courseId: string) => {
    const entry = entriesRef.current.get(courseId);
    if (!entry || entry.prompted) return;
    const elapsed = Date.now() - entry.clickedAt;
    if (elapsed < entry.expectMs * TRIGGER_FRACTION) return;
    entry.prompted = true;

    const minutes = Math.max(1, Math.round(elapsed / 60_000));
    sinksRef.current.push({
      message: `Did you finish “${truncate(entry.title, 50)}”?`,
      description: `It's been about ${minutes} minutes since you opened it.`,
      actionLabel: "Yes, mark complete",
      onAction: () =>
        sinksRef.current.updateStatus(entry.courseId, "completed"),
      durationMs: 60_000,
      tone: "info",
    });
  }, []);

  // Visibility trigger: if the user comes back to MIRA's tab and an entry
  // is past its trigger point, prompt now.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      for (const id of entriesRef.current.keys()) {
        maybePrompt(id);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [maybePrompt]);

  // Cleanup on unmount: drop pending timers so we don't fire after teardown.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const trackWatch = useCallback<WatchHeuristicCtx["trackWatch"]>(
    ({ courseId, title, expectMs }) => {
      if (!expectMs || expectMs <= 0) return;
      entriesRef.current.set(courseId, {
        courseId,
        title,
        clickedAt: Date.now(),
        expectMs,
        prompted: false,
      });
      // Timer trigger: if MIRA happens to still be focused at 70%, prompt then.
      const delay = expectMs * TRIGGER_FRACTION;
      const t = setTimeout(() => maybePrompt(courseId), delay);
      timersRef.current.add(t);
    },
    [maybePrompt],
  );

  return <Ctx.Provider value={{ trackWatch }}>{children}</Ctx.Provider>;
}

export function useWatchHeuristic(): WatchHeuristicCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Soft fallback so cards work even if a parent forgot the provider.
    return { trackWatch: () => undefined };
  }
  return ctx;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
