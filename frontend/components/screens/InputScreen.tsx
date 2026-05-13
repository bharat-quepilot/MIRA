"use client";

import { useState } from "react";

import { Button } from "@/components/primitives/Button";
import { TextArea } from "@/components/primitives/TextArea";
import { SAMPLE_JD, SAMPLE_RESUME } from "@/data/sample-inputs";
import { useAnalysis } from "@/state/AnalysisContext";

const MAX = 8000;

export function InputScreen() {
  const { analyze, loading, error } = useAnalysis();
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");

  const valid =
    resume.trim().length > 0 &&
    jd.trim().length > 0 &&
    resume.length <= MAX &&
    jd.length <= MAX;

  const onUseSample = () => {
    setResume(SAMPLE_RESUME);
    setJd(SAMPLE_JD);
  };

  const onSubmit = async () => {
    if (!valid || loading) return;
    await analyze(resume, jd);
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          MIRA <span className="text-slate-400">— your AI career mentor</span>
        </h1>
        <p className="mt-1 text-slate-600">
          Paste a resume and a target job description. MIRA will surface skill
          gaps and build a personalized study plan.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <TextArea
          label="Resume"
          placeholder="Paste the candidate's resume…"
          maxLengthHint={MAX}
          value={resume}
          onChange={(e) => setResume(e.target.value)}
        />
        <TextArea
          label="Job description"
          placeholder="Paste the target JD…"
          maxLengthHint={MAX}
          value={jd}
          onChange={(e) => setJd(e.target.value)}
        />
      </div>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button variant="secondary" size="md" onClick={onUseSample} disabled={loading}>
          Use sample data
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={onSubmit}
          disabled={!valid || loading}
        >
          {loading ? "Analyzing…" : "Analyze"}
        </Button>
        {loading && (
          <span className="text-xs text-slate-500">
            5-agent pipeline runs ~30-45s on the first request. Subsequent
            identical requests hit the cache.
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}
    </section>
  );
}
