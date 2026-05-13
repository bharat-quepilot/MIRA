import { AnalysisResultSchema, type AnalysisResult } from "@/lib/schemas/api";

export interface AnalysisService {
  analyze(resume: string, jd: string): Promise<AnalysisResult>;
}

export class HttpAnalysisService implements AnalysisService {
  constructor(
    private baseUrl: string = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  ) {}

  async analyze(resume: string, jd: string): Promise<AnalysisResult> {
    const res = await fetch(`${this.baseUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume, jd }),
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        if (typeof body.detail === "string") detail = body.detail;
      } catch {
        /* ignore */
      }
      throw new Error(`Analysis failed (${res.status}): ${detail}`);
    }
    const data = await res.json();
    return AnalysisResultSchema.parse(data);
  }
}
