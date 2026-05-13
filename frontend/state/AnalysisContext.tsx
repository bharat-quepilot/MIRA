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
import type { AnalysisResult } from "@/lib/schemas/api";

export type View = "input" | "results" | "plan";

interface AnalysisCtx {
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  view: View;
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

  const analyze = useCallback(
    async (resume: string, jd: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await resolvedService.analyze(resume, jd);
        setResult(data);
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
  }, []);

  return (
    <Ctx.Provider value={{ result, loading, error, view, setView, analyze, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAnalysis(): AnalysisCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAnalysis must be used within AnalysisProvider");
  return ctx;
}
