import { z } from "zod";

export const GapSchema = z.object({
  skill: z.string(),
  category: z.enum(["required", "nice_to_have"]),
  severity: z.number().int().min(1).max(5),
  status: z.enum(["missing", "weak"]),
  evidence: z.string(),
  jd_quote: z.string(),
  search_query: z.string(),
});

export const CourseSchema = z.object({
  course_id: z.string(),
  title: z.string(),
  channel: z.string(),
  duration_minutes: z.number().int().nullable(),
  url: z.string(),
  thumbnail: z.string().nullable(),
  quality_score: z.number(),
});

export const EnrichedGapSchema = GapSchema.extend({
  courses: z.array(CourseSchema),
  estimated_hours: z.number().int(),
});

export const AnalyzeMetaSchema = z.object({
  fallbacks_used: z.array(z.string()),
  agent_timings_ms: z.record(z.string(), z.number()),
  mock_mode: z.boolean(),
});

export const AnalysisResultSchema = z.object({
  match_score: z.number().int(),
  required_gaps: z.array(EnrichedGapSchema),
  nice_to_have_gaps: z.array(EnrichedGapSchema),
  strengths: z.array(z.string()),
  meta: AnalyzeMetaSchema,
});

export type Gap = z.infer<typeof GapSchema>;
export type Course = z.infer<typeof CourseSchema>;
export type EnrichedGap = z.infer<typeof EnrichedGapSchema>;
export type AnalyzeMeta = z.infer<typeof AnalyzeMetaSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
