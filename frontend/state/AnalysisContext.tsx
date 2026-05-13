"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  HttpAnalysisService,
  type AnalysisService,
} from "@/lib/services/analysis-service";
import { computeSessionKey } from "@/lib/progress/session-key";
import type { AnalysisResult } from "@/lib/schemas/api";

export type View = "input" | "results" | "plan";

interface AnalysisCtx {
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  view: View;
  /**
   * Stable identifier of the current analysis derived from `hash(resume + jd)`.
   * Used by ProgressContext to scope localStorage per (resume, jd) pair so
   * progress can't leak across analyses. `null` until the first analyze().
   */
  sessionKey: string | null;
  setView: (v: View) => void;
  analyze: (resume: string, jd: string) => Promise<void>;
  reset: () => void;
}

const Ctx = createContext<AnalysisCtx | null>(null);

export function AnalysisProvider({
  service,
  children,
}: {
  service?: AnalysisService;
  children: ReactNode;
}) {
  const resolvedService = useMemo(
    () => service ?? new HttpAnalysisService(),
    [service],
  );
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("input");
  const [sessionKey, setSessionKey] = useState<string | null>(null);

  const analyze = useCallback(
    async (resume: string, jd: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await resolvedService.analyze(resume, jd);
        setResult(data);
        // Bind the result to the inputs that produced it. Doing this *after*
        // the request returns means a failed analysis doesn't churn the key.
        setSessionKey(computeSessionKey(resume, jd));
        setView("results");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [resolvedService],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setView("input");
    setSessionKey(null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        result,
        loading,
        error,
        view,
        sessionKey,
        setView,
        analyze,
        reset,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAnalysis(): AnalysisCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAnalysis must be used within AnalysisProvider");
  return ctx;
}
