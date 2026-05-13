"use client";

import { InputScreen } from "@/components/screens/InputScreen";
import { ResultsScreen } from "@/components/screens/ResultsScreen";
import { StudyPlanScreen } from "@/components/screens/StudyPlanScreen";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { AnalysisProvider, useAnalysis } from "@/state/AnalysisContext";
import { ProgressProvider } from "@/state/ProgressContext";
import { ToastProvider } from "@/state/ToastContext";
import { WatchHeuristicProvider } from "@/state/WatchHeuristicContext";

function ScreenRouter() {
  const { view } = useAnalysis();
  if (view === "input") return <InputScreen />;
  if (view === "results") return <ResultsScreen />;
  return <StudyPlanScreen />;
}

export default function Home() {
  return (
    <ToastProvider>
      <AnalysisProvider>
        <ProgressProvider>
          <WatchHeuristicProvider>
            <main className="mx-auto max-w-5xl px-6 py-10">
              <ScreenRouter />
            </main>
            <ToastContainer />
          </WatchHeuristicProvider>
        </ProgressProvider>
      </AnalysisProvider>
    </ToastProvider>
  );
}
