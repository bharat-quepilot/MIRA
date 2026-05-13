# MIRA — Resume → JD Gap Analyzer & Study Planner

Hi, I'm Bharat. This is my submission for the GrowQR take-home.

**The short version:** paste a resume and a target JD. MIRA tells you which JD skills you're missing, ranks them by severity, builds a small study plan, and — for YouTube courses — actually *watches you watch them* and ticks the progress bar without you doing anything. Click the **Use sample data** button on the input screen to load the exact resume + JD from the assignment PDF, then hit Analyze.

I spent ~5 hours on the core build and another ~2 hours on the polish you'll see if you click around (auto-tracking, the smart toast, the inline embed). I'll walk you through the *why* of each choice below. Where I cut a corner, I'll say so out loud.

---

## How to run it

You **don't need an OpenAI key**. Without one, MIRA boots in mock mode and runs the full 5-agent pipeline against hand-crafted fixtures that reproduce the assignment's expected output. With a key, you get real `gpt-4o-mini` reasoning. Either path is fully functional.

### A note on the keys in `backend/.env`

To make this easy for you to evaluate, I've **committed my own `OPENAI_API_KEY` and `YOUTUBE_API_KEY` to `backend/.env`** so the app runs against the real APIs the moment you `docker-compose up`. I know committing keys is bad practice in a normal project — I'm doing it here purely so you don't have to sign up for anything to see the live pipeline. I'll rotate both keys after the review.

**Please also verify the fallback path** the brief asks about — it's the whole reason the architecture has a deterministic spine. Easiest way: open `backend/.env` in your editor, **blank out the two `*_API_KEY` values** so they read `OPENAI_API_KEY=` and `YOUTUBE_API_KEY=`, then restart the backend:

```bash
# Docker
docker-compose restart backend

# or two-terminal — Ctrl+C the uvicorn process, run the start command again
```

(If you'd rather use a shell: on bash, `cp backend/.env.example backend/.env` gets you a key-free file in one command. On PowerShell, just edit the file — `echo > .env` writes UTF-16 which `pydantic-settings` won't parse.)

You should see:
- The orange **"Reduced quality" banner** appear on Results (because every agent fell back to its deterministic path)
- A **"Demo mode" badge** indicating MIRA is using the hand-crafted mock fixtures
- Courses still rendered, but pulled from the [in-repo static catalog](backend/app/courses/data/static_courses.json) instead of YouTube
- Match score, gap list, and study plan all still functional — the spine works without a single external call

That's the resilience guarantee the README claims, made testable. Put the keys back when you're done if you want to see the live LLM + YouTube version again.

### A. Docker (the easy way)

```bash
cp backend/.env.example backend/.env       # leave keys blank for mock mode, or paste your own
docker-compose up --build
```

- Frontend → http://localhost:3000
- Backend → http://localhost:8000
- Swagger UI → http://localhost:8000/docs

### B. Two terminals (if Docker's not handy)

```bash
# Backend — Python 3.12 (pydantic-core has no 3.13/3.14 wheels yet)
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt          # Windows
# or: source .venv/bin/activate && pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

Then click **Use sample data** → **Analyze**. The first cold request takes around 15–25 seconds (real LLM calls; per-agent timeout is 30s with no retry — fail-fast to the deterministic path). Identical follow-up requests hit the in-memory cache and come back in ~15 ms. Mock mode is ~20 ms either way.

---

## What you'll find under each requirement from the brief

| The brief asked for… | …I built |
|---|---|
| Two textareas (resume + JD) | [InputScreen.tsx](frontend/components/screens/InputScreen.tsx) with the brief's sample inputs one click away |
| Gap analysis with study topics | A 5-agent pipeline coordinated by an [Orchestrator](backend/app/agents/orchestrator.py) |
| Course recommendations | [YouTube Data API v3](backend/app/courses/youtube_source.py), with a [static curated catalog](backend/app/courses/static_source.py) as backup |
| Progress tracking in localStorage | [CourseProgressStore](frontend/lib/progress/course-progress-store.ts) + [ProgressContext](frontend/state/ProgressContext.tsx) |
| Overall progress visible | Weighted progress bar + per-gap completion ratio on Study Plan |
| Bonus: separate required vs. nice-to-have | Agent 2 (JD Parser) splits the JD by section markers; UI renders two distinct cards |
| "Supply your own key or mock the call" | Mock mode engages automatically when `OPENAI_API_KEY` is unset — no degraded UX |

---

## How I approached the gap analysis (and *why*)

I had three options. Here's how I thought about them.

**A monolithic LLM call** — one prompt does it all. Fastest to write, but if the model trips on one part (say, the severity scoring), the whole thing is unusable. No way to tune one rule without touching everything.

**Plain keyword matching against a skill taxonomy** — robust, predictable, but blind. It would say "you don't have TypeScript" the same way whether the resume says "no TypeScript" or "used TypeScript for 4 years at scale." The match score would be coarse.

**A multi-agent pipeline with deterministic fallbacks** — five small agents, each with a narrow job. The LLM does the reasoning; if any agent fails, a non-LLM fallback takes over and the user gets a transparency banner.

I went with the third one. Here's what it looks like:

```
[Resume] ─┐                                            ┌─ OpenAI gpt-4o-mini (primary)
          ├─► A1: Resume Parser ──┐                    │   structured outputs via
[JD]    ──┤                       ├─► A3: Gap Reasoner │   beta.chat.completions.parse
          └─► A2: JD Parser    ───┘   ("the brain")    │
                                            │          ├─ MockLLMProvider (no-key demo)
                                            ▼          │
                                    A4: Study Planner  │
                                            │          └─ Deterministic fallback per agent
                                            ▼              (taxonomy / regex / set-diff)
                                  A5: Course Curator
                                            │
                                            ▼
                          YouTube Data API v3 → Static catalog
```

A1 and A2 run in parallel (`asyncio.gather`). A5 fans out per-gap, also in parallel. End-to-end cold latency is around 30–45s today; the architecture has the seams for streaming/caching to bring perceived latency down to ~200ms (more on that below).

A few things I'm genuinely proud of in this design:

1. **Every LLM boundary has a non-LLM fallback.** If OpenAI times out, returns malformed JSON, or isn't configured, the agent falls back to deterministic taxonomy matching. The app *never* throws or shows an empty screen — it shows results with a small "we used a fallback for X" banner. That's [the Failure Philosophy](docs/01-architecture.md) section of my architecture doc if you want to go deep.

2. **The 5-agent decomposition is load-bearing.** Each agent owns *one* prompt file, *one* Pydantic schema, *one* fallback function. When the Resume Parser was misclassifying TypeScript as nice-to-have, I tuned its prompt without risking breakage in the Gap Reasoner. That separation of concerns is the whole point.

3. **A taxonomy pre-pass runs every time** — even when the LLM is working. The ~80-skill list (with aliases like `k8s` → Kubernetes, `pg` → PostgreSQL) feeds the agents as `taxonomy_hints` so they disambiguate names consistently. When the LLM fails entirely, the same taxonomy is the foundation of the fallback gap analysis.

I almost reached for LangChain. The whole sub-genre of agent frameworks exists for this kind of pipeline. But after sketching it out, I realized I had **five sequential calls** to make, each with a Pydantic-validated structured output. Native OpenAI + a 50-line [`run_agent()`](backend/app/agents/run_agent.py) helper covered every concern LangChain would have addressed (timeout, retry, fallback) without the abstraction tax of forcing the reviewer to learn LangChain to read my code. That decision is defended in [docs/04-tech-stack.md §7](docs/04-tech-stack.md) if you want the long version.

### What a gap actually looks like on the wire

```jsonc
{
  "skill": "Next.js",
  "category": "required",          // bonus: separates required from nice-to-have
  "severity": 5,                   // 1–5; set by the Gap Reasoner via Chain-of-Thought
  "status": "missing",             // missing | weak
  "evidence": "JD requires Next.js for app-router work; resume has React only.",
  "jd_quote": "TypeScript, React, Next.js",
  "search_query": "Next.js 14 app router tutorial",
  "courses": [Course, …]
}
```

Severity rubric (in the Gap Reasoner's prompt): required + missing + foundational → 5; required + missing → 4; required + weak → 3; nice-to-have + missing → 2; nice-to-have + weak → 1. Skills the resume *does* match against the JD get surfaced separately as "Strengths" on the Results screen — giving the candidate a confidence anchor before they see the gaps.

### One-click verification of the brief's sample

Click **Use sample data** and you should see:

| Required gaps (9) | Nice-to-have gaps (4) |
|---|---|
| TypeScript, Next.js, Node.js, PostgreSQL, GraphQL, Docker, CI/CD, Integration Testing, System Design | Redis, AWS, Observability, LLM APIs |

And these strengths surfaced from the resume: **React, REST APIs, Jest, Responsive Design, Accessibility, Code Review.** Match score lands in the 30–40% range — exactly what the brief said a reasonable analyzer should produce.

---

## Which course API I picked, and what I'd switch to

I picked the **YouTube Data API v3**. Three reasons:

1. **Free tier, generous.** 10,000 units/day. One analysis uses about 13 search calls = 1,300 units. I'd need ~7 analyses per day to hit the ceiling with no caching at all.
2. **Massive breadth** across every gap topic the assignment surfaces. Trying to find a "PostgreSQL crash course" on Coursera turns up paid certificate programs; on YouTube it's the top result and free.
3. **Embeddable** — and embeddability is what unlocks the auto-tracking I'm about to talk about. The IFrame Player API ships JS events for play/pause/end, so I can mark courses complete without the user clicking anything.

If YouTube broke (quota exhausted, API change, regional block), here's where I'd go in order:

- **Static curated JSON catalog** (already wired) — always succeeds, no quota, ~16 hand-picked videos covering the sample gaps. This is the live fallback today and what mock mode uses.
- **freeCodeCamp curriculum data** — open, no API key, narrow but high-quality.
- **Coursera Catalog API** — structured metadata, less forgiving on niche skill names ("system design" returns mostly enterprise architecture certs).

All three sit behind the [`CourseSource` ABC](backend/app/courses/source.py). Swapping or adding a source is one new module + one line in the Composition Root.

### How I rank within YouTube

Every search result gets a score:

```
quality_score = 0.7 × channel_quality + 0.3 × recency
```

`channel_quality` is a curated lookup table — `freeCodeCamp.org → 1.0`, `Fireship → 0.95`, `ByteByteGo → 0.95`, `Traversy Media → 0.9`, …, unknown channel → `0.4`. `recency` decays linearly over ~5 years (so a 2024 video beats a 2016 video on the same topic). Top 3 per gap make it through — 1 primary that's visible by default, 2 alternates tucked behind a "Show alternates" disclosure. A mentor doesn't hand you 5 tabs to open; a mentor says "watch this one."

---

## The thing I'm most proud of: real auto-tracking

The brief asked for *manual* progress tracking (a dropdown the user flips). I shipped that, then went one step further. I want to walk you through it because it's the part I had the most fun building.

When a course is a YouTube video — which is most of them — clicking **Watch** doesn't open a new tab. The video starts playing **inside MIRA**, embedded via the IFrame Player API. From there:

- The first time you press play, status flips `not_started → in_progress` on its own.
- Every 2 seconds while the video is playing, I poll `getCurrentTime()` and update a `maxSeenT` counter — *but only when the timeline advanced by ≤ 5 seconds since the last poll.* If you scrub forward to the end, the counter doesn't move. **You have to actually watch.**
- When `maxSeenT / duration ≥ 0.9`, status flips to `completed` automatically. The "✓ Auto-completed" badge appears in the corner of the player.
- About 5–10% of YouTube videos have embedding disabled by the channel owner. The player's `onError` fires, I catch it, and we fall back to a polite "open this on YouTube" notice — no broken state.

For courses that *aren't* YouTube videos (the long tail — static catalog leftovers, future Coursera/Udemy sources), I added a **Visibility heuristic**: when the user clicks Watch on a non-embeddable course, I register a watch entry with the expected duration. When the user comes back to MIRA's tab — using the [Page Visibility API](frontend/state/WatchHeuristicContext.tsx) — and at least 70% of the expected time has elapsed, a smart toast asks "Did you finish?" with a one-click Mark Complete shortcut.

So the tracking ladder is:

| Course type | How it tracks |
|---|---|
| YouTube (embed allowed) | Fully automatic — IFrame Player events + 90% threshold + anti-skip |
| YouTube (embed blocked) | Falls back to the Visibility heuristic if duration is known, else manual nudge |
| Anything else with `duration_minutes` | Visibility heuristic — "Did you finish?" toast at ~70% elapsed |
| Anything without duration | Classic 30-second nudge toast with a Mark Complete button |

You can always override the auto-tracking with the manual dropdown. It's opportunistic, not authoritative.

---

## How I mapped this to your evaluation rubric

I built deliberately against the five criteria in your brief.

**On scoping** — there's a hard internal hierarchy in the build. P1 (taxonomy + deterministic spine) is *shippable without any LLM*. If the LLM phase had completely failed at hour 2, I could have submitted just P1 and still met the brief. Every later phase is purely additive. I never bet the demo on something I hadn't yet verified.

**On pragmatism** — every external boundary has a fallback. OpenAI → taxonomy. YouTube → static catalog. localStorage disabled → in-memory store. Browser → server. The 50-line `run_agent()` instead of LangChain is the same instinct applied to dependencies. And there are two ways to run the app (Docker or two terminals) because some reviewers might not have one or the other installed.

**On product thinking** — I tried to make every screen answer "what should I do next?" in one glance. Match Score Ring is the first thing you see. Severity badges are color-coded so you don't have to read to triage. Each gap shows one primary course (mentor energy, not catalog overwhelm). The progress bar is *weighted by severity* so completing one severity-5 course feels bigger than completing one severity-1 course — because it should. The FallbackBanner names degradation in plain language instead of hiding it. And auto-tracking removes the most common UX friction — "I forgot to mark this complete."

**On code quality** — Pydantic on the backend, Zod on the frontend; typed contracts on both sides of the wire. Interfaces at every seam: `LLMProvider`, `CourseSource`, `AnalysisService`, `CourseProgressStore`. A Composition Root in `main.py` that wires the implementations. Each agent ≤ 80 LOC. Each prompt in its own file so I can A/B test prompts without touching code.

**On communication** — this README + four design docs in [docs/](docs/) (architecture, HLD, LLD, tech stack). Every rejected library has a documented reason. Every cut feature is named in the "What's incomplete" section. I tried not to oversell.

---

## Tradeoffs I made — and what I gave up

| The choice | What it cost me |
|---|---|
| FastAPI backend + Next.js frontend (two services, not one) | Single deploy artifact. Adds `docker-compose`. Worth it because Python is where the LLM SDK, structured outputs, and async pipeline are most natural; TypeScript is where the UI is. The brief said "your choice" of stack. |
| Multi-agent pipeline | 5 prompts + 5 schemas instead of 1. Pays back in failure isolation and prompt tunability. |
| In-memory TTL cache (no Redis) | Single-instance only. Right scope for a take-home; the interface is there if a future instance needs Redis. |
| Pydantic + Zod (duplicated wire schemas) | Two definitions of the API shape. Worth it — backend rejects bad input at the boundary, frontend rejects bad backend output, both can evolve independently. |
| YouTube as primary catalog | At the mercy of channel owners (deleted videos, disabled embeds). Static catalog backstops it. |
| Auto-tracking via IFrame Player | One more loaded script; one more failure mode (embed disabled). Worth it — for ~90% of the catalog the user never clicks Mark Complete. |
| 80-skill taxonomy as plain JSON | No semantic matching for synonyms beyond what I hand-coded as aliases. Designed an embeddings-based hybrid matcher in the LLD; not yet built. |
| **Session-partitioned localStorage** (keyed by `hash(resume + jd)`) | Slightly more code in the progress store. Pays for itself the first time a user runs two different analyses — progress can't leak between them, and the same inputs re-analyzed restore your in-flight progress instead of wiping it. Mid-build I shipped a *"reset on every Analyze"* hack to plug the leakage; the proper session-key architecture supersedes that. See [session-key.ts](frontend/lib/progress/session-key.ts). |

---

## How this scales (and where it'd break first)

This is a take-home, not a production system. But I designed it with the seams in the right places, so I want to be honest about what scales out of the box and what would need real work.

**What scales today, mostly free:**

- **The backend is stateless.** No DB, no in-process session. Horizontal scaling is a matter of putting more containers behind a load balancer. The brief explicitly said no backend persistence, and I respected that.
- **CORS, rate limiting, and the cache are all per-instance.** Fine at one box. Each instance maintains its own 1-hour analysis cache; in a multi-instance world the cache hit rate goes down (each box has to "see" each unique input once) but correctness is unaffected.
- **The frontend is a Next.js SPA.** Deploys to Vercel/Cloudflare Pages/any static host. Zero ops once it's built.
- **Costs scale linearly with users.** ~$0.002 per analysis on `gpt-4o-mini`. OpenAI's automatic prompt caching cuts repeated-system-prompt tokens 50% — so the second request from any user on any instance is already half-price.

**What breaks first, in order:**

1. **The in-memory cache becomes wasteful.** Hit rate drops. Swap to Redis with the same TTL semantics. The cache abstraction is already in place; it's a one-file replacement.
2. **The rate limit becomes unfair.** It's a token bucket per IP, in memory. If a user lands on different instances they get their full quota on each. Move to Redis or Upstash for shared state. Same story — one-file swap.
3. **YouTube's 10k units/day cap is real.** At ~1,300 units per analysis, that's ~7 analyses/day across the entire fleet before quota burn. Mitigation today: the L3 course cache in my design (designed in [docs/01-architecture.md §4b](docs/01-architecture.md), partially built) caches `(query, skill_id) → Course[]` for 15 minutes per query — which is *per-query, not per-user*. The same TypeScript search benefits everybody. Beyond that, increase quota via Google Cloud Console application, or add the YouTube affiliate program with higher limits.
4. **Cold latency becomes a UX bottleneck.** First-time analyses are ~30s. Designed an SSE-streaming endpoint in the HLD that emits per-stage events so the frontend can render gaps progressively. Drops perceived latency from 30s → ~200ms first-feedback. Not built yet.
5. **Progress is per-device because localStorage.** This is the brief's design, but if a real user wanted to study on phone and laptop, they'd need cross-device sync. The `CourseProgressStore` interface on the frontend already accepts swapping `LocalStorageProgressStore` for an `HttpProgressStore` that hits a new backend endpoint — that's the seam for it.
6. **Multi-tenant analytics.** No user IDs today. To add observability ("which gaps are most common across all users?"), you'd thread a session/user ID through every request and pipe the JSON logs (already structured) into something like Datadog or just BigQuery via stdout-shipping.

Where I think the real architectural risk would emerge: the **LLM cost line item**. At 100k MAU each doing one analysis a week, that's ~400k analyses/month × $0.002 = $800/month — totally manageable. At 1M MAU doing the same, $8k/month, still fine. The L2 *semantic cache* I designed (cosine ≥ 0.95 against past embeddings) would catch near-duplicate inputs and cut LLM spend further — paraphrased resumes from the same person shouldn't trigger a full pipeline run.

The thing that wouldn't scale at all in its current form is the **static curated JSON catalog**. It's a hand-maintained ~16-entry file. Beyond the demo set, you'd want a real content service or just leaner-on-YouTube-with-better-caching.

---

## What's incomplete (honest list)

- **Tests are thin.** Three pytest cases on the taxonomy matcher. No E2E. The brief explicitly de-prioritizes this ("we are not evaluating comprehensive tests") but I want it on the record.
- **Cold pipeline is slow** (~30–45s for the first request). The in-memory cache makes repeat identical requests ~15ms, but the first-time user experience is "stare at a spinner." The SSE design in [docs/02-hld.md §3.1](docs/02-hld.md) would fix this; I didn't get to it.
- **L2 semantic cache and hybrid taxonomy embeddings** are designed in the docs but not built. They're the next-step performance work.
- **No PDF/DOCX parsing** — explicitly out of scope per the brief.
- **localStorage progress is single-device.** No cloud sync.
- **The rate limit is in-memory.** Single-instance only.
- **YouTube `duration_minutes` is `null` from the live API.** I don't make the extra `videos.list?part=contentDetails` call to fetch it. The static catalog has correct durations. Adding the enrichment is ~20 LOC.
- **Time overrun.** Brief targets ~4 hours; I spent ~5 on the core scope and another ~2 on auto-tracking, the Visibility heuristic, and this README. I'm honest about that.

---

## What I'd do next (with another half-day, in priority order)

1. **SSE streaming for `/analyze`.** The orchestrator already records per-stage events. Wrapping in `StreamingResponse` and rendering gaps progressively on the frontend would drop perceived latency from 30s to ~200ms first-feedback. Biggest UX win for the least effort.
2. **L2 semantic cache.** Embed `resume + jd` with `text-embedding-3-small`; check cosine ≥ 0.95 against past queries before running the pipeline. Catches paraphrases the exact-hash cache misses. ~30 minutes.
3. **Hybrid taxonomy.** Keyword pass + embedding cosine against pre-computed skill embeddings. Catches `k8s` → Kubernetes, `ML eng` → Machine Learning, `pg` → PostgreSQL without me having to keep adding aliases by hand. ~40 minutes.
4. **YouTube duration enrichment.** One extra `videos.list` call per result, parsing ISO-8601 like `PT5M30S` to populate `duration_minutes` on live results. Improves both display and the Visibility heuristic. ~20 minutes.
5. **PDF/DOCX upload.** `pdf-parse` and `mammoth` on the frontend → strip → existing pipeline. Out of scope per the brief but a real user would want it.
6. **A few more pytest cases.** Deterministic gap-analysis path and snapshot math.
7. **Vercel + Fly.io deploy.** A live URL so a reviewer doesn't have to run anything locally.

All of these are filling in *existing seams* — `LLMProvider`, `CourseSource`, `CourseProgressStore` interfaces — not rewrites. I left them as designed-but-unbuilt because shipping the spine first felt more honest than ½-building the optimization layer.

If I kept going beyond a half-day, the things I genuinely want to build are:

- **A real "learning journey" view.** Today MIRA gives you a study plan and tracks watches. With a database, it could track *which gaps closed over time*, surface trend lines ("your TypeScript score moved from 0 → strong over 3 weeks"), and let you re-analyze yourself periodically against the same JD to see progress against the *original* baseline.
- **Mock interviews.** Once we know your gaps, the natural next step is "drill me on these." Agent 6 — an Interviewer Agent — would generate practice questions per gap, evaluate your written/spoken answers, and feed completion data back into the progress tracker.
- **Multi-resume / multi-JD comparison.** Help someone choose between two roles by analyzing both JDs against their resume side-by-side.

---

## Project layout

```
mira/
├── docs/                              # Architecture · HLD · LLD · tech stack (4 design docs)
├── backend/                           # FastAPI · Python 3.12
│   ├── app/
│   │   ├── main.py                    # Composition Root, CORS, lifespan
│   │   ├── api/                       # POST /analyze, GET /health
│   │   ├── agents/                    # Orchestrator + 5 agents + run_agent() facade
│   │   │   └── prompts/               # One file per system prompt
│   │   ├── llm/                       # LLMProvider ABC + OpenAI + Mock + fixtures
│   │   ├── courses/                   # CourseSource ABC + YouTube + Static + ranker
│   │   ├── taxonomy/                  # ~80-skill JSON + word-boundary matcher
│   │   ├── schemas/                   # Pydantic models (agents + API)
│   │   ├── utils/                     # TTL cache, hash, rate limit
│   │   └── telemetry/                 # Structured JSON logger
│   ├── tests/                         # pytest (taxonomy)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                          # Next.js 14 · TypeScript
│   ├── app/                           # SPA shell + 3-screen view switching
│   ├── components/
│   │   ├── screens/                   # Input · Results · StudyPlan
│   │   ├── ui/                        # GapCard, CourseCard, YouTubeEmbed, MatchScoreRing, …
│   │   └── primitives/                # Button, TextArea
│   ├── lib/
│   │   ├── services/                  # AnalysisService (HTTP)
│   │   ├── progress/                  # CourseProgressStore + computeSnapshot
│   │   ├── schemas/                   # Zod (mirrors Pydantic)
│   │   └── youtube/                   # IFrame Player loader + ID extractor
│   └── state/                         # Analysis / Progress / Toast / WatchHeuristic contexts
├── docker-compose.yml
└── README.md
```

---

## API surface (in case you want to poke at it)

**`POST /analyze`**
```jsonc
// Request
{ "resume": "...", "jd": "..." }

// Response (excerpt)
{ "match_score": 30,
  "required_gaps":      [ EnrichedGap, … ],
  "nice_to_have_gaps":  [ EnrichedGap, … ],
  "strengths":          [ "React", "Jest", … ],
  "meta": { "fallbacks_used": [], "agent_timings_ms": {…}, "mock_mode": false } }
```

Validation: both fields non-empty, ≤ 8000 chars. Rate limit: 10/hr/IP, in-memory token bucket. `meta.fallbacks_used` lists any agent that fell back so the UI can show the transparency banner.

**`GET /health`** → `{ "status": "ok" }`

**`GET /docs`** → FastAPI's auto-generated Swagger UI — free OpenAPI playground for reviewers.

---

Thanks for taking the time to read through this. I had a genuinely fun couple of hours building it — there's a version of MIRA in my head that turns into a real product, and the seams I left in the architecture (the `LLMProvider`, `CourseSource`, `CourseProgressStore` interfaces; the staged pipeline; the cache layer the docs describe) are the bet on what that future looks like.

If anything's unclear or you want me to walk through a piece live, I'm happy to.

— Bharat (kaushikbharat3990@gmail.com)
