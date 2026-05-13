# MIRA — High-Level Design (HLD)

**Companion to:** `01-architecture.md`
**Drives:** `03-lld.md`
**Read this to understand:** system shape, components, data flow, contracts

---

## 1. System Context

```
   👤 Job-seeker                       🧑‍💻 Reviewer
        │                                    │
        ▼                                    ▼
┌──────────────────────────────────────────────────────┐
│              MIRA (two services)                      │
│                                                       │
│   Inputs:  Resume text + JD text                      │
│   Outputs: Ranked gaps, courses, progress UI          │
└────────────────────┬─────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌──────────┐ ┌────────────┐ ┌─────────────────┐
   │ OpenAI   │ │ YouTube    │ │ Static Catalog  │
   │ API      │ │ Data API   │ │ (in-repo JSON)  │
   └──────────┘ └────────────┘ └─────────────────┘
```

Two services: **Next.js frontend** (3000) and **FastAPI backend** (8000). docker-compose orchestrates both for local dev.

---

## 2. Logical Components

### 2.1 Frontend (Next.js, port 3000)

| Component | Responsibility | Pattern |
|---|---|---|
| `InputScreen` | Two textareas, length validation, trigger analysis | Presentational |
| `ResultsScreen` | Match score, gap cards (required vs nice-to-have), strengths | Presentational |
| `StudyPlanScreen` | Courses per gap, status dropdowns, snapshot, "Next Up" CTA | Presentational |
| `CourseCard` | Single course UI: thumbnail, "Watch on YouTube" button, status dropdown; orchestrates auto-progress + nudge on click | Presentational + behavior |
| `NudgeToast` | Dismissible toast after Watch click with "Mark complete" shortcut | Presentational |
| `AnalysisContext` | Hold gap analysis result + view state | React Context |
| `ProgressContext` | Wrap `CourseProgressStore`, expose `snapshot` | React Context |
| `ToastContext` | Lightweight toast queue (used by NudgeToast + Fallback toasts) | React Context |
| `AnalysisService` *(interface)* | Abstraction over HTTP analyze call | Service Layer |
| `HttpAnalysisService` | Calls FastAPI `POST /analyze` (SSE) | Adapter impl |
| `CourseProgressStore` *(interface)* | Read/write course progress | Repository |
| `LocalStorageProgressStore` | localStorage impl | Repository |
| `computeSnapshot` *(pure fn)* | Derive metrics from progress state | CQRS read-side |

### 2.2 Backend (FastAPI, port 8000)

| Component | Responsibility | Pattern |
|---|---|---|
| `main.py` | FastAPI app, CORS, route registration | App entry |
| `POST /analyze` | SSE endpoint — runs pipeline through CacheGate | Composition Root |
| `GET /health` | Liveness probe for docker-compose | — |
| `GET /docs` | Auto-generated Swagger UI | FastAPI built-in |
| `CacheGate` | Tries L1 → L2 before invoking orchestrator; reattaches courses via L3 | Decorator over orchestrator |
| `Orchestrator` | Coordinate agents, apply fallbacks, emit SSE events | Pipeline / Mediator |
| Agents 1–5 | Specialized cognitive units | Strategy (primary + fallback) |
| `LLMProvider` *(interface)* | LLM vendor abstraction | Adapter |
| `OpenAIProvider`, `MockProvider` | Concrete impls | Adapter |
| `CourseSource` *(interface)* | Course catalog abstraction | Adapter |
| `YouTubeSource`, `StaticCatalogSource` | Concrete impls | Adapter |
| `run_agent()` | LLM call + retry + per-agent timeout + fallback | Facade |
| `Embedder` | OpenAI embeddings client | Adapter |
| `TaxonomyIndex` | Pre-computed skill embeddings (loaded at startup) | Cached pure data |
| `HybridTaxonomyMatcher` | Keyword + cosine match (Strategy combined) | Pure function |
| `AnalysisCache` (L1) | `hash → AnalysisCore`, 1h TTL | Cache |
| `SemanticCache` (L2) | `embedding → AnalysisCore`, 1h TTL, cosine ≥ 0.95 | Cache |
| `CourseCache` (L3) | `(query, skill_id) → Course[]`, 15min TTL | Cache |
| `Logger` | Structured JSON logs | — |

### 2.3 External Services

| Service | Purpose | Quota | Fallback |
|---|---|---|---|
| OpenAI Chat Completions | Agents 1–4 cognitive work | Paid | Deterministic per-agent fallback |
| OpenAI Embeddings (`text-embedding-3-small`) | Semantic cache + taxonomy embeddings | Paid (~$0.00002/call) | Skip semantic features; degrade to keyword-only |
| YouTube Data API v3 | Agent 5 course fetch | 10k units/day free | Static catalog |

---

## 3. Data Flow

### 3.1 Primary Flow: Analyze (Optimized, with SSE + 3-tier cache)

```
[0] Frontend pre-flight
     0.1  Validate inputs (non-empty, ≤ 8000 chars each)
     0.2  Disable Analyze button; show progress UI
     0.3  Open SSE connection: new EventSource('/analyze-stream')
     0.4  Register handlers: phase / progress / partial / done / error
     │
     ▼
[1] HTTP POST /analyze-stream
     Body: { resume, jd }
     Accept: text/event-stream
     │
     ▼
[2] Backend request validation
     2.1  Extract client IP → rate limit check (10/hr, token bucket)
          ├─ EXCEEDED → emit {error:"rate_limited"}, close stream
     2.2  Pydantic AnalyzeRequest validation
     2.3  Truncate inputs to 8000 chars (toast if happened)
     2.4  Emit SSE: {phase: "validated"}
     │
     ▼
[3] Two-level cache gate
     3.1  cache_key = hash(resume + "|" + jd)
     3.2  L1 AnalysisCache.get(cache_key)         ← 1h TTL
          ├─ HIT → core = cached_core; goto step 9 (reattach courses)
     3.3  Compute embedding of (resume + " " + jd)  ← ~100ms, $0.00002
     3.4  L2 SemanticCache.search(embedding)        ← cosine ≥ 0.95
          ├─ HIT → core = cached_core; goto step 9 (reattach courses)
          └─ MISS → keep embedding for step 10.2
     3.5  Emit SSE: {phase: "cache_miss"}
     │
     ▼
[4] Deterministic pre-pass (concurrent with embedding from step 3.3)
     4.1  Tokenize resume + JD
     4.2  HYBRID taxonomy match:
          a. Keyword pass (regex word-boundary against 80 skills)
          b. Embedding pass (cosine vs pre-computed TaxonomyIndex)
          c. Merge (keyword wins on tie; embeddings only add)
     4.3  Emit SSE: {phase: "taxonomy_done", count: N}
     │
     ▼
[5] Agents 1 + 2 (asyncio.gather, per-agent timeouts 5s each)
     ┌────────────────────────────┐  ┌────────────────────────────┐
     │ AGENT 1: Resume Parser     │  │ AGENT 2: JD Parser         │
     │ run_agent(timeout=5s)      │  │ run_agent(timeout=5s)      │
     │ Schema: ResumeStructured   │  │ Schema: JdStructured       │
     │ Fallback: taxonomy match   │  │ Fallback: regex + taxonomy │
     └────────────────────────────┘  └────────────────────────────┘
     5.x  Emit SSE: {phase: "parsers_done", fallbacks_used: [...]}
     │
     ▼
[6] Agent 3: Gap Reasoner (8s timeout)
     6.1  Input: { resume_structured, jd_structured, taxonomy_hints }
     6.2  run_agent(model="gpt-4o-mini", schema=GapAnalysis, temperature=0.2)
     6.3  Output: { overall_match_score, gaps[], strengths_matching[] }
     6.4  Fallback: set-difference + category-based severity
     6.5  Emit SSE: {phase: "gap_analysis_done", match_score, gap_count}
     6.6  Emit SSE: {partial: GapAnalysisCore}  ← UI can render now
     │
     ▼
[7] Agent 4: Study Planner (5s timeout)
     7.1  Input: gaps[]
     7.2  run_agent(schema=StudyPlan)
     7.3  Output: enriched per-gap { search_queries, prereqs, hours, order }
     7.4  Fallback: static query templates from taxonomy
     7.5  Emit SSE: {phase: "study_plan_done"}
     │
     ▼
[8] Agent 5: Course Curator × N gaps (asyncio.gather)
     For each gap concurrently:
       8.1  Check L3 CourseCache.get(query, skill_id)   ← 15min TTL
            ├─ HIT → use cached Course[]
            └─ MISS → continue
       8.2  CourseSource priority list:
            a. YouTubeSource.fetch_courses(query)
               ├─ filter to whitelisted channels
               ├─ rank: channel_quality × 0.7 + recency × 0.3
               └─ top 3 (1 primary + 2 alternates for FE display)
            b. StaticCatalogSource.fetch_courses(skill_id)  ← never fails
       8.3  L3 CourseCache.set(query, skill_id, courses)
     8.4  Emit SSE: {phase: "courses_done"}
     │
     ▼
[9] Assemble response
     9.1  Zip gaps with their courses (cached or freshly fetched)
     9.2  Split into required_gaps / nice_to_have_gaps
     9.3  Sort each by severity desc
     9.4  Build meta: { fallbacks_used, agent_timings_ms, mock_mode, cache_layer_hit }
     9.5  Construct AnalyzeResponse Pydantic model
     │
     ▼
[10] Cache writes (skip if responding from L1/L2 hit path)
     10.1  L1 AnalysisCache.set(cache_key, AnalysisCore)         ← 1h
     10.2  L2 SemanticCache.set(embedding, AnalysisCore)         ← 1h
     10.3  (L3 already written per-gap in step 8.3)
     10.4  Log telemetry: total_ms, fallbacks, cost_estimate
     │
     ▼
[11] Stream final response
     11.1  Emit SSE: {done: AnalyzeResponse}
     11.2  Close SSE stream
     │
     ▼
[12] Frontend render
     12.1  SSE handlers update progress bar at each phase
     12.2  On {done} → AnalysisContext.setResult(); setView("results")
     12.3  If meta.fallbacks_used.length > 0 → show FallbackBanner
     12.4  If meta.cache_layer_hit → optional dev badge
```

### 3.1a Cache-Hit Reattachment Flow (Step 9 from L1/L2 hit path)

When L1 or L2 returns an `AnalysisCore` (no courses yet):

```
core = cached_core  // no courses field
For each gap in core.gaps (concurrent):
   L3 CourseCache.get(gap.search_query, gap.skill)
     ├─ HIT  → use cached Course[]
     └─ MISS → fetch from sources, populate L3
Assemble final AnalyzeResponse from core + freshly attached courses
Emit SSE: {done: response}
```

Latency: 50ms (full L3 hit) to ~1.5s (full L3 miss, re-fetch all). Average ~300ms.

### 3.2 Progress Flow (Frontend-Only)

```
User changes course status dropdown
     │
     ▼
ProgressContext.updateStatus(courseId, newStatus)
     │
     ├── Optimistic UI update (instant re-render)
     │
     ▼
LocalStorageProgressStore.updateStatus(...)
     │
     ├── Debounced localStorage write (200ms)
     │
     ▼
computeSnapshot(items)
     │
     ▼
Progress bar + "Next Up" + counts re-render
```

No network call. Pure client side.

### 3.2a Course Playback Flow (Approach D — External Link With Smart Nudges)

```
User clicks "▶ Watch on YouTube" on a CourseCard
     │
     ▼
CourseCard.handleWatchClick()
     │
     ├── If progress.status === "not_started":
     │     auto-transition → "in_progress" via updateStatus()
     │     (sets startedAt = now)
     │
     ├── window.open(course.url, "_blank", "noopener,noreferrer")
     │     → YouTube opens in new browser tab
     │
     ├── Show NudgeToast component:
     │     - Message: "📺 Watching {course.title}?"
     │     - Action button: "Mark complete"
     │     - Auto-dismiss: 30 seconds
     │     - Manual dismiss: X button
     │
     ▼ User watches on YouTube, returns to MIRA tab
     │
     ├── Path A: clicks "Mark complete" in toast
     │     → updateStatus(courseId, "completed")
     │     → toast dismisses
     │
     ├── Path B: changes dropdown manually
     │     → updateStatus(courseId, chosen_status)
     │
     ├── Path C: ignores toast
     │     → toast auto-dismisses; status stays "in_progress"
     │     → user can still update later via dropdown
     │
     ▼
Snapshot recomputes → progress bar updates
```

**Why Approach D (not embedded player):** YouTube IFrame embed has edge cases (disabled-embed videos, age restrictions, autoplay policies) that add 30-60+ minutes of debugging. The auto-progress nudge captures 80% of the UX benefit in 10 minutes of code. Approach C (embedded player + IFrame API auto-completion) is documented in README as the next-step upgrade.

### 3.3 Failure Flow

```
Agent call fails (timeout / 5xx / malformed JSON / no key)
     │
     ▼
Catch in run_agent
     │
     ├── First failure: retry once with stricter prompt
     │
     ▼ Still fails
Deterministic fallback runs (always succeeds — pure function)
     │
     ▼
Orchestrator records in meta.fallbacks_used[]
     │
     ▼
Pipeline continues — no cascade failure
     │
     ▼
Response includes meta.fallbacks_used
     │
     ▼
Client shows FallbackBanner
```

---

## 4. Screens (UI Architecture)

Three logical screens, single-page implementation. `view` state in `AnalysisContext` drives conditional render.

### 4.1 Input Screen

```
┌──────────────────────────────────────────────────────────┐
│  MIRA — your AI career mentor             [Demo mode]    │
│                                                          │
│  ┌────────────────────────┐  ┌────────────────────────┐  │
│  │ Resume                 │  │ Job Description        │  │
│  │ ┌────────────────────┐ │  │ ┌────────────────────┐ │  │
│  │ │ textarea ~12 rows  │ │  │ │ textarea ~12 rows  │ │  │
│  │ └────────────────────┘ │  │ └────────────────────┘ │  │
│  │  0 / 8000 chars        │  │  0 / 8000 chars        │  │
│  └────────────────────────┘  └────────────────────────┘  │
│                                                          │
│                  [Use Sample Data]                       │
│                                                          │
│                  [   Analyze   ]                         │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Results Screen

```
┌──────────────────────────────────────────────────────────┐
│  ◄ Re-analyze                                            │
│                                                          │
│              ┌────────────┐                              │
│              │    47%     │   Match Score                │
│              │   ████     │   Missing 9 of 13 required   │
│              └────────────┘                              │
│              [ View Study Plan → ]                       │
│                                                          │
│  ──────────────────────────────────────────────────────  │
│  CRITICAL GAPS (Required)                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ●●●●● TypeScript     missing     4 courses →       │  │
│  │   "JD lists TypeScript as required..."             │  │
│  └────────────────────────────────────────────────────┘  │
│  ... (sorted severity desc)                              │
│                                                          │
│  BONUS GAPS (Nice to have)                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ●●○○○ Redis          missing     3 courses →       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ▶ Strengths matching (collapsed)                        │
└──────────────────────────────────────────────────────────┘
```

### 4.3 Study Plan Screen

```
┌──────────────────────────────────────────────────────────┐
│  ◄ Back to Results                                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Progress: 3 of 9 courses · 33%                  │    │
│  │  Weighted: 28%   ██████░░░░░░░░░░░░░░░           │    │
│  │  (counting 1 primary per gap)                    │    │
│  │                                                  │    │
│  │  🎯 Next Up                                      │    │
│  │  Next.js App Router Tutorial — freeCodeCamp      │    │
│  │  Why: Next.js is required (severity 5)           │    │
│  │  [ Start → ]                                     │    │
│  │                                                  │    │
│  │  ✅ 2 completed this week   🔥 3-day streak      │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ▼ TypeScript (sev 5)             0/1 · ○                │
│    ┌──────────────────────────────────────────────────┐  │
│    │ [thumb] TypeScript Course for Beginners          │  │
│    │         Academind · 3h        [Not started ▾]    │  │
│    │         [ ▶ Watch on YouTube ]                   │  │
│    └──────────────────────────────────────────────────┘  │
│    ▸ Show 2 alternate videos                             │
│                                                          │
│  ▶ Next.js (sev 5)                1/1 · ●  ✓             │
│  ▶ Node.js (sev 5)                0/1 · ○                │
│  ▶ PostgreSQL (sev 4)             0/1 · ○                │
│  ...                                                     │
│                                                          │
│  Recently completed                                      │
│  ✓ Next.js App Router Tutorial    2 days ago             │
└──────────────────────────────────────────────────────────┘
```

**When user clicks "Show alternate videos":**

```
   ▼ 2 alternate videos
   ┌──────────────────────────────────────────────────┐
   │ │ TypeScript Tutorial — Programming with Mosh    │
   │ │ Mosh · 2h               [ ▶ Watch ]            │
   ├──────────────────────────────────────────────────┤
   │ │ Learn TypeScript — Net Ninja                   │
   │ │ Net Ninja · 1h 30m      [ ▶ Watch ]            │
   └──────────────────────────────────────────────────┘
```

Alternates render with lighter UI (no thumbnail, status dropdown only appears after first interaction). They're tucked away by default — the user sees one recommendation per skill, not a catalog.

---

## 5. Contracts (Wire Format)

Pydantic on backend, mirrored Zod on frontend. JSON shapes:

### Resume Parser output
```
ResumeStructured {
  years_experience: int | None
  role: str
  skills: [{ name, proficiency: 'mentioned'|'used'|'strong', evidence }]
  domains: [str]
}
```

### JD Parser output
```
JdStructured {
  role: str
  seniority: 'junior'|'mid'|'senior'|'lead'|'unknown'
  required: [{ skill, weight: 1-5, source_quote }]
  nice_to_have: [{ skill, weight: 1-5, source_quote }]
}
```

### Gap Reasoner output
```
GapAnalysis {
  overall_match_score: 0-100
  gaps: [Gap]
  strengths_matching: [str]
}
Gap {
  skill: str
  category: 'required' | 'nice_to_have'
  severity: 1-5
  status: 'missing' | 'weak'
  evidence: str
  jd_quote: str
  search_query: str
}
```

### Study Planner output (per gap)
```
StudyPlanItem {
  gap_skill: str
  search_queries: [str]  // 1..3
  prerequisites: [str]
  estimated_hours: int
  learning_order_rank: int
}
```

### Course Curator output (per query)
```
Course {
  course_id: str
  title: str
  channel: str
  duration_minutes: int | None
  url: str
  thumbnail: str | None
  quality_score: 0..1
}
```

### Final API response
```
AnalysisResult {
  match_score: int
  required_gaps: [Gap & { courses: [Course], estimated_hours: int }]
  nice_to_have_gaps: [Gap & { courses: [Course], estimated_hours: int }]
  strengths: [str]
  meta: {
    fallbacks_used: [str]
    agent_timings_ms: { [agent_name]: int }
    mock_mode: bool
  }
}
```

### Progress (frontend-only, localStorage)
```
ProgressState {
  schema_version: int
  course_progress: [CourseProgress]
}
CourseProgress {
  course_id, gap_skill, gap_severity, gap_category,
  status: 'not_started'|'in_progress'|'completed'|'skipped',
  started_at, completed_at, last_touched_at, notes
}
```

---

## 6. API Surface

### POST /analyze (SSE Streaming)

| | |
|---|---|
| Auth | None (rate-limited by IP) |
| Body | `{ resume: str, jd: str }` |
| Validation | Both non-empty, each ≤ 8000 chars |
| Response | `text/event-stream` (Server-Sent Events) |
| Event types | `phase`, `partial`, `done`, `error` |
| Latency target | first event < 200ms; `done` < 8s p95 |
| L1 cache hit | `done` at ~50ms |
| L2 cache hit | `done` at ~250ms |

**Event schemas:**

```
event: phase
data: {"phase": "validated" | "cache_miss" | "taxonomy_done" | "parsers_done"
       | "gap_analysis_done" | "study_plan_done" | "courses_done"}

event: partial
data: {"gaps": [...], "strengths": [...], "match_score": N}  // optional progressive render

event: done
data: AnalyzeResponse  // full final result

event: error
data: {"detail": "rate_limited" | "invalid_input" | "internal_error"}
```

### POST /analyze (non-streaming, optional fallback)

For clients that can't consume SSE. Returns `AnalyzeResponse` as plain JSON. Same caching behavior, no progress events.

### GET /health

| | |
|---|---|
| Purpose | Docker-compose liveness check |
| Response | `{ status: 'ok' }` |

### GET /docs

FastAPI auto-generated Swagger UI. No code needed.

---

## 7. State Management

| State | Owner | Lifecycle | Storage |
|---|---|---|---|
| Current resume/JD inputs | `InputScreen` local useState | Per-session | None |
| Analysis result | `AnalysisContext` | Until re-analyze | None (in-memory) |
| Course progress | `ProgressContext` → `LocalStorageProgressStore` | Permanent | localStorage |
| Current view | `AnalysisContext` | Per-session | None |

Two contexts. No Redux. No Zustand. Simplicity is intentional.

---

## 8. Persistence (Frontend Only)

```
localStorage
└── mira:progress:v1   ← ProgressState (versioned)
```

Schema versioning enables migrations:

```typescript
function loadProgress(): ProgressState {
  const raw = localStorage.getItem('mira:progress:v1');
  if (!raw) return defaultProgressState();
  const parsed = JSON.parse(raw);
  if (parsed.schema_version < CURRENT_VERSION) {
    return migrate(parsed);
  }
  return parsed;
}
```

---

## 9. Failure Modes — Decision Table

| Failure | Layer | Behavior | User-facing |
|---|---|---|---|
| OpenAI 5xx / timeout | Agent | Fallback | Banner |
| OpenAI malformed JSON | Agent | Retry once, then fallback | Banner |
| OpenAI 429 | Agent | Backoff + retry, then fallback | Delay, then banner |
| `OPENAI_API_KEY` unset | Orchestrator | Mock mode | "Demo mode" badge |
| YouTube 403 (quota) | Agent 5 | Static catalog | None / Banner |
| YouTube zero results | Agent 5 | Static catalog | None |
| Empty resume/JD | API | 400 with detail | Form error |
| Resume/JD > 8000 chars | API | Truncate + warn | Toast |
| localStorage disabled | Repository | In-memory fallback | Toast |
| localStorage corrupt | Repository | Reset + warn | Toast |
| Backend unreachable | Frontend service | Error state with retry | Banner with retry |
| All agents fail (extreme) | Orchestrator | Pure-taxonomy mode | Strong banner |

---

## 10. Observability

Structured JSON logs, stdout (Docker captures):

```
{"type":"agent","name":"gap_reasoner","ms":3214,"ok":true,"tokens_in":1187,"tokens_out":823}
{"type":"fallback","agent":"resume_parser","reason":"timeout"}
{"type":"cost","model":"gpt-4o-mini","tokens_in":2000,"tokens_out":1100,"usd":0.0019}
```

`meta.agent_timings_ms` and `meta.fallbacks_used` ride in API response → optional `?debug=1` panel in UI. Seam for future OpenTelemetry.

---

## 11. Performance Budget

### Per-Stage Targets

| Stage | Target | Reasoning |
|---|---|---|
| Pre-flight + validation | < 50ms | Pydantic + rate limit check |
| Embedding for cache lookup | < 150ms | OpenAI embeddings, fast |
| Hybrid taxonomy match | < 100ms | Keyword regex + cosine on 80 items |
| Resume + JD parsers (concurrent) | < 2s | `gpt-4o-mini` extraction; 5s timeout each |
| Gap Reasoner | < 4s | Reasoning takes longer; 8s timeout |
| Study Planner | < 2s | Templating-ish; 5s timeout |
| Course Curator (per gap, concurrent × N) | < 1.5s each | YouTube responds fast |
| Response assembly + cache write | < 50ms | In-memory |
| **First SSE event** | **< 200ms** | Validation completes quickly |
| Status update → re-render | < 16ms | Optimistic + debounced |

### End-to-End By Cache Tier

| Scenario | Latency target |
|---|---|
| L1 hit (exact match) + all L3 hits | ~80ms |
| L1 hit + some L3 misses (refetch) | ~600ms |
| L1 hit + all L3 misses | ~1.5s |
| L2 hit (semantic match) + all L3 hits | ~250ms |
| L2 hit + all L3 misses | ~1.7s |
| Full cold miss | < 7s p95 |
| Hard timeout (trigger fallback) | 12s |

**Perceived latency via SSE:** first feedback at ~200ms in all scenarios.

---

## 12. Security

- All keys in `.env` files, server-side only
- No PII server-side persistence (stateless)
- Input length caps (8000 chars) prevent token-bomb
- Rate limit: 10 req/hour per IP, in-memory token bucket
- CORS: `localhost:3000` only (configurable via env)
- localStorage holds non-sensitive data (course IDs + status)

---

## 13. Deployment (Local Dev)

```yaml
# docker-compose.yml (conceptual)
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: backend/.env
    healthcheck:
      test: curl -f http://localhost:8000/health

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    env_file: frontend/.env.local
    depends_on:
      backend:
        condition: service_healthy
```

One command: `docker-compose up`. Both services hot-reload (dev compose).

Alternate (no Docker): two terminals — `cd backend && uvicorn app.main:app --reload` and `cd frontend && npm run dev`.

---

**This HLD is implementation-ready. The LLD elaborates file by file.**
