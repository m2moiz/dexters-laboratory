# Session Handoff — AI Scientist Backend

## What the files do (short version)

- **`app/api/plan/route.ts`** — the single HTTP entry point. Validates the request, orchestrates the 3 helpers in parallel, and returns the experiment plan as JSON.
- **`lib/tavily.ts`** — googles scientific papers related to the hypothesis so the LLM has real references to work from instead of hallucinating them.
- **`lib/catalog.ts`** — filters a local reagent catalog to surface the most relevant products for the hypothesis, so the LLM picks real items with real prices and catalog numbers.
- **`lib/llm/generate-plan.ts`** — sends everything to GPT-4o and gets back a structured, fully-typed experiment plan that is guaranteed to match the Zod schema.

**Overall pattern: gather context → constrain the LLM → get typed output.**

---

## Full context for another session

**Project:** Hackathon "AI Scientist" — Next.js 14 App Router / TypeScript backend. User submits a scientific hypothesis, backend searches literature (Tavily), retrieves reagents from a catalog JSON, calls OpenAI with structured outputs (Zod), returns a typed experiment plan.

**Files that existed before this session:**
- `lib/schema.ts` — full Zod schema (`ExperimentPlanSchema`) with strict enums: `Supplier`, `SourceType`, `BudgetCategory`, `RiskLikelihood`, and all sub-schemas
- `data/mock-plan.ts` — valid `MOCK_PLAN` satisfying the schema (HeLa cell cryoprotection study), with `ExperimentPlanSchema.parse(MOCK_PLAN)` at the end for build-time validation
- `scripts/contract-check.ts` — script that POSTs to `/api/plan` and validates the response against the schema

**What was built this session:**

1. **Project initialized** — `npx create-next-app@latest ai-scientist --typescript --app --tailwind`, then `npm install zod openai` and `npm install -D tsx`

2. **`app/api/plan/route.ts`** (mock first, then final) — POST endpoint, Zod validation of `{ hypothesis: string }` with 400 if missing, first returned `MOCK_PLAN` directly, then replaced by the final version

3. **`lib/tavily.ts`** — `searchPapers(hypothesis)`: POST to `https://api.tavily.com/search` with `search_depth: "advanced"`, `max_results: 8`, `include_domains: [pubmed, arxiv, biorxiv, protocols.io]`, query = `"scientific paper " + hypothesis`. Returns a formatted string `- TITLE (URL): 200 chars`. Fallback `''` if no key or fetch fails.

4. **`lib/catalog.ts`** — `getCatalogContext(hypothesis)`: reads `data/catalog.json` with `fs.readFileSync`, extracts keywords from hypothesis (words > 3 chars), scores by number of matches on the `name` field, returns top 10 formatted. Falls back to first 10 if no match, `''` if file missing.

5. **`lib/llm/generate-plan.ts`** — `generatePlan(hypothesis, catalogContext, tavilyContext)`: uses `openai.beta.chat.completions.parse()` with `zodResponseFormat(ExperimentPlanSchema, 'experiment_plan')`, model `gpt-4o-2024-08-06`. System prompt: senior scientist, BSL-2, EUR prices, suppliers from enum only, do not invent references. Fallback to `MOCK_PLAN` if `OPENAI_API_KEY` missing.

6. **`app/api/plan/route.ts` (final version)** — calls `searchPapers` and `getCatalogContext` in parallel with `Promise.all`, then `generatePlan`. If generation fails: returns `{ ...MOCK_PLAN, warning: 'used mock' }`.

**Current state:**
- Dev server runs on `localhost:3000`
- `contract-check.ts` passes: **Contract OK ✓**
- `.env.local` with `OPENAI_API_KEY` and `TAVILY_API_KEY` still needed to enable real generation
- `data/catalog.json` does not exist yet — code handles the fallback gracefully
