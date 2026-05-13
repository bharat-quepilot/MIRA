# MIRA — Architecture Document
## Multi-agent Intelligence for Resume Analysis

> *Your AI career mentor — analyzes your resume against a target job description, identifies skill gaps, and builds you a personalized study plan.*

**Project:** MIRA — Resume → JD Gap Analyzer & Study Planner
**Version:** 4.0 (FastAPI Backend, Final)
**Status:** Approved for Implementation
**Time Budget:** ~5 hours

---

## 1. Purpose

This is the architectural north star. It captures the *why* behind every decision. Companion documents:
- **02-hld.md** — system shape, components, data flow
- **03-lld.md** — file-by-file implementation
- **04-tech-stack.md** — every library, every "why this not that"

---

## 2. The Problem

A user pastes their resume and a target JD. MIRA tells them: (1) which JD skills they're missing or weak in, (2) free learning content for each, (3) progress tracking that survives a refresh. Bonus: separate "required gaps" from "nice-to-have." Build in ~4–5 hours.

### Why "MIRA"?

**M**ulti-agent **I**ntelligence for **R**esume **A**nalysis. "Mira" reads as a person's name — matching the product's job. A user shouldn't feel like they're using a tool; they should feel like they have a coach.

---

## 3. What the Interviewer Is Testing

| Signal | What demonstrates it |
|---|---|
| Scoping | App works end-to-end at hour 1; later phases additive |
| Pragmatism | Tools fit scope; fallback at every external boundary |
| Product thinking | Single obvious next action on every screen |
| Code quality | Single-responsibility modules; typed contracts |
| Communication | README names tradeoffs, alternatives, what was cut |

Every decision below serves one of these.

---

## 4. Architectural Principles

1. **Ship the spine first.** Working app at hour 1; everything after is additive.
2. **Decompose by cognitive boundary.** Five agents because there are five distinct cognitive tasks.
3. **Every LLM boundary has a non-LLM fallback.** App never fails — it degrades.
4. **Contracts at every seam.** Pydantic on backend, Zod on frontend; JSON on the wire validated both sides.
5. **Backend stays stateless.** Brief says "localStorage is fine, no backend needed" for progress — we respect scope.
6. **Server-only secrets.** API keys never reach the browser.
7. **Parallelize independent work.** Resume + JD parsing concurrent; course fetches concurrent.
8. **Cheap models for parsing, smart models for reasoning.** Cost-aware.
9. **Cache by staleness sensitivity.** Analysis is expensive and slow-changing → 1h TTL. Courses are cheap and can go stale → 15min TTL. Different data deserves different lifetimes.
10. **Optimize for the second visit.** Progress tracker is the long-tail UX.
11. **No frameworks I don't need.** No LangChain, LangGraph, DSPy, Redis, Postgres.

---

## 4a. SOLID & Patterns

### SOLID

| Principle | How MIRA honors it |
|---|---|
| **S** — Single Responsibility | Each agent has one cognitive job. Snapshot computation is a pure function separate from storage. Each prompt in its own file. |
| **O** — Open/Closed | New agent = new module + one orchestrator line. New course source = implement `CourseSource`. New LLM = implement `LLMProvider`. |
| **L** — Liskov Substitution | Any `LLMProvider` impl returns the same contract. Agent fallbacks return same shape as primary path (with `used_fallback: true`). |
| **I** — Interface Segregation | Frontend repository split into `CourseProgressStore` + pure `computeSnapshot`. Components depend only on what they use. |
| **D** — Dependency Inversion | UI → `AnalysisService` interface. Orchestrator → `LLMProvider` interface. Composition Root wires impls. |

### Named Patterns

| Pattern | Where | Why this one |
|---|---|---|
| Pipeline / Chain of Responsibility | Orchestrator → Agents | Sequential transformations with parallel branches |
| Strategy | Primary LLM call + deterministic fallback per agent | Two interchangeable algorithms behind one interface |
| Repository | `CourseProgressStore` (frontend) | Decouples domain from storage tech |
| Adapter | `LLMProvider`, `CourseSource` | Wraps external APIs behind stable internal interfaces |
| Facade | `run_agent()` helper | Hides LLM call + Pydantic + retry behind one call |
| Service Layer | `AnalysisService` between UI and HTTP | UI doesn't know about HTTP |
| CQRS-lite | Snapshot is read-side projection over progress state | Writes mutate; reads compute |

### Skipped Patterns

| Pattern | Why skipped |
|---|---|
| Factory | One-line instantiation at Composition Root is clearer |
| Command | React event handlers suffice |
| Observer / Event Bus | Sync pipeline; no events |
| Decorator | Retry + telemetry inside `run_agent` |
| DI Container | Manual wiring is clearer at this scale |

Patterns that aren't load-bearing violate YAGNI.

---

## 4b. Optimization Layer

These are the performance-critical additions to the base architecture. Each one solves a specific bottleneck.

### Layered Caching (Two-Tier)

The single most important optimization. **Different data has different staleness sensitivity** — caching them uniformly is wrong.

| Cache layer | Stores | TTL | Reasoning |
|---|---|---|---|
| **L1: Analysis Cache** | `hash(resume+jd) → AnalysisCore` (gaps, scores, strengths — no courses) | 1 hour | Expensive to recompute (~$0.002 + 8s LLM work); slow-changing (same inputs → same gaps) |
| **L2: Semantic Cache** | `embedding(resume+jd) → AnalysisCore` | 1 hour | Catches near-duplicate inputs (cosine > 0.95) that L1 misses |
| **L3: Course Cache** | `(search_query, skill_id) → Course[]` | 15 minutes | Cheap to refresh (~1s YouTube call); YouTube videos can go stale (deleted, made private) |

On request:
1. Check L1 exact-match cache → hit returns in ~50ms
2. Else check L2 semantic cache (1 embedding call + cosine search) → hit returns in ~200ms
3. Else run full pipeline; on completion write to both L1 and L2

When returning from L1/L2 hit, **courses are re-attached from L3** — if cached, instant; if expired, refetched per-gap concurrently. This bounds stale-link risk to 15 minutes while preserving the expensive cache's full hour.

**Bonus:** L3 is keyed by `(query, skill_id)`, not by user. The same skill query benefits all users — natural multi-tenant speedup.

### SSE Streaming Response

The orchestrator runs ~8 seconds end-to-end. Without streaming, users stare at a blank screen. With Server-Sent Events:

- Backend emits structured events at each pipeline stage
- Frontend shows a progress bar that advances at each phase
- Optional: render gaps progressively as they arrive (Step 6.6 in the flow)

Doesn't reduce total time. **Reduces perceived time by ~3x.** Real production signal.

### Hybrid Taxonomy Matching

Keyword-only taxonomy (the v1 design) catches ~85% of skills. Adding embedding-based matching catches the rest:

- Keyword first (deterministic, instant, high-confidence) — runs always
- Embedding cosine match against pre-computed skill embeddings — fills synonym gaps
- Examples caught: "k8s" → Kubernetes, "ML eng" → Machine Learning, "pg" → PostgreSQL

Pre-computes ~80 skill embeddings at app startup (one-time ~$0.0001 cost). Match step adds ~100ms (1 embedding call) to compute resume/JD embeddings, then microsecond cosine search.

### OpenAI Prompt Caching

OpenAI charges 50% less for repeated input tokens (system prompts) automatically. Each of our 5 agents has a stable system prompt — they all benefit on the second request onward. **Free 50% cost reduction.** Zero code change beyond OpenAI's automatic caching behavior.

### Tight Per-Agent Timeouts

Instead of a uniform 12s timeout, tune by agent:

| Agent | Timeout | Why |
|---|---|---|
| Resume Parser | 5s | Simple extraction |
| JD Parser | 5s | Simple extraction |
| Gap Reasoner | 8s | Reasoning needs time |
| Study Planner | 5s | Templating-ish |

p99 latency bounded; faster fallback when models slow down.

### Concurrent Preparation

Start the taxonomy embedding call while agents 1+2 are running. They don't depend on it. Saves ~100ms of overlap time. Free win.

### Optimization Impact Summary

| Scenario | Latency | Cost |
|---|---|---|
| Cold (full pipeline) | ~7s (vs ~8s base, due to tight timeouts + concurrent prep) | ~$0.0022 |
| L1 exact-cache hit | ~50ms | ~$0 |
| L2 semantic-cache hit | ~200ms | ~$0.00002 |
| L1/L2 hit + all L3 hits | ~80ms | ~$0 |
| L1/L2 hit + all L3 expired (re-fetch courses only) | ~1.5s | ~$0 |
| Perceived (via streaming) | First feedback at ~500ms regardless | — |

---

## 5. The Critical Bet

**Monolithic LLM call vs multi-agent pipeline.**

| | Monolithic | Multi-agent |
|---|---|---|
| Code complexity | 1 prompt, 1 schema | 5 prompts, 5 schemas |
| Reasoning quality | Mediocre | Higher — narrow jobs |
| Failure isolation | None | Strong — independent |
| Cost | Higher | Lower — cheap models for parsing |
| Prompt tunability | Painful | Each independent |
| Demo signal | "Wrote a prompt" | "Designed a pipeline" |

**Decision: multi-agent**, wrapped in a thin `run_agent()` helper. Five agents on paper, ~150 LOC orchestration in practice. No LangChain.

---

## 6. Why FastAPI

| Benefit | Detail |
|---|---|
| Python is LLM-native | OpenAI, Anthropic, embeddings — all first-class Python |
| Pydantic + OpenAI native parse | `client.beta.chat.completions.parse(response_format=Model)` returns typed objects |
| Async-first | `asyncio.gather` for parallel agents is natural |
| Service decoupling | Backend can scale/deploy independently |
| OpenAPI auto-docs | Swagger UI at `/docs` — reviewer explores the API for free |

What we give up: single deploy artifact. Solved by docker-compose — local dev stays one command.

---

## 7. System Shape

```
┌──────────────────────────────────────────────────────────────────┐
│                          BROWSER                                  │
│   Next.js Frontend (port 3000)                                    │
│                                                                   │
│   React UI ──► AnalysisService ──► HTTP POST /analyze (SSE) ──┐  │
│                CourseProgressStore                              │  │
│                       │                                  │         │
│                       ▼ persists                         │         │
│              ┌──────────────────────────┐                │         │
│              │ localStorage              │                │         │
│              │ - mira:progress:v1        │                │         │
│              └──────────────────────────┘                │         │
└──────────────────────────────────────────────────────────┼─────────┘
                                                           │ CORS
                                                           ▼
┌──────────────────────────────────────────────────────────────────┐
│              FastAPI Backend (port 8000) — STATELESS              │
│                                                                   │
│   /analyze (SSE) ──► Cache Gate (L1 exact → L2 semantic)          │
│   /health              │                                          │
│   /docs                ├─ HIT → reattach courses via L3 → return  │
│                        └─ MISS                                    │
│                            ▼                                      │
│      ┌────────────────────────────────────────────────────┐       │
│      │ Orchestrator (Composition Root)                     │       │
│      │ Agents: A1 → A2 → A3 → A4 → A5                      │       │
│      │   (A1+A2 concurrent; A5 fans out per gap)           │       │
│      │      │                       │                      │       │
│      │      ▼                       ▼                      │       │
│      │  LLMProvider          CourseSource[]                │       │
│      │  (OpenAI/Mock)        (YouTube/Static)              │       │
│      └────────────────────────────────────────────────────┘       │
│                            │                                      │
│                            ▼                                      │
│      ┌────────────────────────────────────────────────────┐       │
│      │ Caching Layer                                       │       │
│      │  L1 AnalysisCache  (hash → AnalysisCore, 1h)        │       │
│      │  L2 SemanticCache  (embed → AnalysisCore, 1h)       │       │
│      │  L3 CourseCache    ((query,skill) → Course[], 15m)  │       │
│      │                                                      │       │
│      │ Semantic Layer                                       │       │
│      │  Embedder (OpenAI text-embedding-3-small)            │       │
│      │  TaxonomyIndex (pre-computed skill embeddings)       │       │
│      └────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────┘
              │                                       │
              ▼                                       ▼
        OpenAI API                          YouTube Data API v3
        (LLM + embeddings)
```

---

## 8. The Five Agents

| # | Agent | Job | Model | Fallback |
|---|---|---|---|---|
| 1 | Resume Parser | Extract skills + proficiency | `gpt-4o-mini` | Taxonomy keyword scan |
| 2 | JD Parser | Extract required vs nice-to-have | `gpt-4o-mini` | Regex section split + taxonomy |
| 3 | Gap Reasoner | Compare → ranked gaps with severity | `gpt-4o-mini` (CoT) | Set-difference + category severity |
| 4 | Study Planner | Generate search queries + order | `gpt-4o-mini` | Static query templates |
| 5 | Course Curator | Fetch + rank courses | None (YouTube + heuristics) | Static curated catalog |

A1+A2 concurrent. A5 fans out concurrent per gap. End-to-end target: < 8s.

---

## 9. Persistence Strategy

**Brief:** *"Persist this — localStorage is fine, no backend needed."* (for progress)

| What | Where | Why |
|---|---|---|
| Gap analysis pipeline | FastAPI backend | Server-side key, compute |
| Course recommendations | FastAPI backend | YouTube API key, ranking |
| Course progress | **localStorage** | Brief says so |
| Analysis result (current view) | React state | Re-fetch on demand |

**Backend is stateless.** No DB. `docker-compose up` has nothing to migrate. Correct scope.

---

## 10. A2A Communication

**Synchronous, sequential, in-process pipeline.** All agent calls happen inside one FastAPI request handler, mediated by the orchestrator.

| Property | Value |
|---|---|
| Pattern | Orchestrator-mediated, schema-validated, immutable data passing |
| Transport | Direct async function calls (`await agent.run(input)`) |
| Validation | Pydantic at every boundary |
| Parallelism | `asyncio.gather` for independent agents |

**Not used:**
- **Kafka / NATS** — for async messaging between services; we have sync sequential single-process
- **Google A2A protocol** — for cross-vendor agents over the network; we have in-process functions
- **Event bus / pub-sub** — no event semantics; one request → one response
- **MCP** — for LLMs calling external tools mid-prompt; we don't need that

Function calls are the right primitive. Climbing the protocol ladder would be over-engineering.

---

## 11. Scalability Seams (Without Building For Scale)

Architecture supports these later without building them now:

| Concern | How |
|---|---|
| 1000s of users | FastAPI stateless; horizontal scale trivial |
| Response cache | `hash(resume, jd)` is a natural key |
| Cost optimization | Each agent's model is independently swappable |
| Server-persisted progress | Add `CourseProgressStore` API impl; FE interface ready |
| Multi-tenancy | Add user_id to requests; storage already abstracted |
| Better course quality | Add LLM re-ranker to Agent 5 without changing orchestrator |
| Embeddings for skill matching | Replace taxonomy without touching agents 2-5 |

Seams exist. Just not filled in for v1.

---

## 12. What's NOT Used (And Why)

| Tech | Why not |
|---|---|
| LangChain | Heavy abstraction for sequential calls. Native Pydantic parse + 50-line helper does the same. Worth it at 20+ agents. |
| LangGraph | Stateful branching graphs. My pipeline is linear with parallel parsing. |
| DSPy | Prompt optimization framework. Needs eval data. Hand-tuned prompts in one-shot build don't benefit. |
| CrewAI / AutoGen | Multi-agent collaboration. My agents pass data forward, don't collaborate. |
| LlamaIndex | RAG/retrieval. Both documents already in prompt. |
| Postgres / SQLite | Brief says no backend needed for progress. |
| Redis | Caching. In-memory dict with TTL suffices for single-instance demo. |
| Auth | Single-user browser tool. No identity needed. |
| Pinecone / Weaviate | No embeddings in v1. |
| tRPC / GraphQL | One endpoint. Neither earns its place. |

The discipline of saying "no" is itself architectural maturity.

---

## 13. Critical Path

```
P0 Scaffold (30m) ──► P1 Taxonomy + deterministic fallback (40m) ──►
SHIPPABLE — could submit here if everything else fails
                        │
                        ▼
P2 Agents 1+2 (45m) ──► P3 Agent 3, the brain (45m) ──► P4 Agents 4+5 + YouTube (45m)
                        │
                        ▼
P5 Progress + UI (45m) ──► P6 Polish + mock mode (25m)
                        │
                        ▼
═══════════════════ OPTIMIZATION LAYER (optional phases) ═════════════
P-OPT1 L1+L3 caches + per-agent timeouts (40m)
P-OPT2 Semantic cache + Embedder + L2 (45m)
P-OPT3 Taxonomy embeddings hybrid match (40m)
P-OPT4 SSE streaming end-to-end (45m)
══════════════════════════════════════════════════════════════════════
                        │
                        ▼
P7 README + cleanup (35m) ──► P8 Loom (optional, 20m)
```

By end of P1, MIRA is submittable. P2–P6 add quality. P-OPT* add performance optimization. Each phase is independently cuttable if running short. **Final scope: ~9h** (5h base + 3h optimizations + 1h README/Loom). Video playback uses Approach D (external link + auto-progress + nudge) inside P5; Approach C (embedded IFrame Player + anti-skip) is documented as a future-step upgrade in the README.

---

## 14. Failure Philosophy

The app must produce useful output for any valid input. No stack traces. No empty screens.

```
Agent X (LLM)
   ↓ fails (timeout / 5xx / malformed JSON / 429 / no key)
Retry once with stricter prompt
   ↓ fails
Deterministic fallback (taxonomy / regex / static map)
   ↓ never fails (pure functions)
RESULT — with FallbackBanner
```

User sees: results + a small banner. Never broken UI.

---

## 15. Product Thinking Hooks

- **Match Score Ring** — single number, top of Results. Instant orientation.
- **Severity Badges** — color-coded 1-5. Visual prioritization without reading.
- **"Next Up" CTA** — Study Plan leads with one recommended action.
- **Weighted Progress %** — alongside naive %. Honest signal.
- **Stale Indicator** — items in-progress > 7 days marked.
- **Sample Data Button** — reviewer demos in one click without typing.
- **Fallback Banner** — when LLM degrades, plain language. Trust through transparency.
- **Auto-Progress On Click** — clicking "Watch on YouTube" auto-marks the course as "in progress." Removes a friction step the user would forget.
- **Nudge Toast** — after click, a dismissible toast banner offers a one-click "Mark complete" shortcut. User comes back from YouTube → one click closes the loop instead of hunting for the dropdown.
- **One primary course per gap (with collapsed alternates)** — MIRA recommends *one* video per skill by default. Two alternates are tucked behind a "Show alternates" disclosure. A mentor doesn't hand you 5 tabs — a mentor says "watch this one."
- **Smart progress counting** — primary courses count toward total; alternates only count if the user explicitly touches them. Keeps the progress bar meaningful ("9 things to learn") instead of overwhelming ("27 videos to watch").

---

## 16. Sample-Input Acceptance Target

- Match score: ~30–50%
- Required gaps surfaced (≥ 8 of): TypeScript, Next.js, Node.js, PostgreSQL, GraphQL, Docker, CI/CD, integration tests, system design, code review
- Nice-to-have: Redis, AWS, observability, LLM APIs
- Strengths matched: React, REST APIs, Jest, responsive design, accessibility
- Courses per gap: 1 primary + up to 2 alternates (3 total in API response)
- Status changes persist across refresh

---

## 17. Out of Scope

Documented in README as "what I'd do next":
- PDF/DOCX parsing
- User accounts / multi-device sync
- Server-persisted progress
- Embedding-based skill similarity
- LLM-powered course re-ranker
- Spaced-repetition reminders
- Shareable study plans via URL
- A/B testing framework for prompts

---

## 18. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Reviewer has no OpenAI key | High | High | Mock mode returns hand-crafted realistic response |
| R2 | OpenAI rate limit | Med | Med | In-memory 1h cache + retry with backoff |
| R3 | YouTube quota burn | Med | Med | Static catalog fallback + 24h cache |
| R4 | LLM hallucinates skills | Low | Med | Cross-check Agents 1+2 against taxonomy before Agent 3 |
| R5 | Time over-run | Med | Med | P1 ships standalone; later phases additive |
| R6 | Sample inputs miss expected gaps | Low | High | Hand-test; fallback covers via taxonomy |
| R7 | CORS misconfiguration | Med | Med | localhost:3000 allowed by default in docker-compose |
| R8 | Docker not installed on reviewer | Low | Med | README has two-terminal alternative (`uvicorn` + `npm run dev`) |
| R9 | YouTube video deleted/private between cache write and view | Low | Low | L3 cache 15min TTL bounds risk; user sees YouTube's "unavailable" page if they click (non-fatal) |
| R10 | User forgets to mark course complete | High | Low | Auto-progress on click + nudge toast with one-click "Mark complete" |

---

## 19. Sign-Off Checklist

- [ ] `docker-compose up` brings both services up
- [ ] Works without `OPENAI_API_KEY` (mock mode engages)
- [ ] Works without `YOUTUBE_API_KEY` (static catalog engages)
- [ ] Sample inputs produce ≥ 8 expected gaps
- [ ] Required vs nice-to-have visually distinct
- [ ] Progress persists across refresh
- [ ] Match score visible on Results
- [ ] "Next Up" CTA visible on Study Plan
- [ ] FallbackBanner appears when fallbacks used
- [ ] README has all required sections + time spent
- [ ] Swagger UI at `/docs` accessible

---

**Architectural contract. HLD and LLD elaborate. This defines.**
