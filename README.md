# Dexter

> **From hypothesis to runnable experiment in 90 seconds.**
> An AI co-scientist that turns a one-sentence hypothesis into a fact-checkable, fully-costed experiment plan a real lab could start running on Monday.

Built for **Hack-Nation 5 — Fulcrum Science Track**.

🔗 **Live demo:** [dexters-laboratory.mmmiscellaneous.workers.dev](https://dexters-laboratory.mmmiscellaneous.workers.dev)
🔌 **API:** [ai-scientist-ruddy.vercel.app/api/plan](https://ai-scientist-ruddy.vercel.app/api/plan)

---

## The problem

A grad student has an idea on Friday afternoon. To find out if it's worth running, they need to:

1. Read 30 papers to confirm nobody's done it
2. Find a protocol that actually works
3. Source reagents with real catalog numbers and EUR prices
4. Build a defensible budget and timeline
5. Write down what "success" even means

That's a week of work — *before* the experiment starts. Most ideas die there.

**Dexter compresses that week into 90 seconds.** Type a hypothesis, get back a plan a PI would trust enough to order materials Monday and start running it Friday.

## What you get

A single API call returns a strictly-typed `ExperimentPlan` containing:

| Section | What's inside |
|---|---|
| **Novelty check** | "Has anyone done this?" with linked references |
| **Assumptions** | The hidden bets the plan rests on, surfaced explicitly |
| **Protocol** | Numbered steps with durations and citations to real protocols |
| **Materials** | Real reagents from Sigma / Thermo / Addgene / ATCC with catalog #, EUR price, supplier URL |
| **Equipment** | Required vs nice-to-have |
| **Budget** | Line-item breakdown by category with contingency % |
| **Timeline** | Phased Gantt with dependencies and milestones |
| **Validation** | Quantitative success criteria — metric, threshold, method |
| **Risks** | Likelihood-rated failure modes with mitigations |

Every field is schema-guaranteed via Zod + OpenAI structured outputs. **No hallucinated suppliers. No invented catalog numbers.**

---

## How it works

```
                ┌──────────────────────────────────────────────────────┐
                │                       FRONTEND                        │
                │           Vite · React 19 · TanStack Router           │
                │                                                       │
   user ──▶  ┌──┴──┐   ┌───────────┐   ┌──────────┐   ┌──────────┐  │
             │ Hypo│──▶│ Literature│──▶│   Plan   │──▶│   Plan   │  │
             │Input│   │   Graph   │   │Generating│   │   View   │  │
             └─────┘   │ (d3-force │   │ (stream) │   │+comments │  │
                       │  + Lasso) │   └──────────┘   └──────────┘  │
                       └───────────┘                                  │
                └─────────────┬────────────────────────────────────────┘
                              │ POST /api/plan { hypothesis }
                              ▼
                ┌──────────────────────────────────────────────────────┐
                │                       BACKEND                         │
                │              Next.js 15 · Edge-compatible             │
                │                                                       │
                │  ┌──────────┐  ┌────────────┐  ┌──────────────────┐  │
                │  │  Tavily  │  │  Catalog   │  │ Scraped corpus:  │  │
                │  │ live web │  │  retriever │  │ • 1,253 papers   │  │
                │  │  search  │  │ (keyword + │  │ •   698 protocols│  │
                │  │          │  │  domain)   │  │ •   106 reagents │  │
                │  └────┬─────┘  └─────┬──────┘  └─────────┬────────┘  │
                │       └──────┬───────┴───────────────────┘           │
                │              ▼                                       │
                │     ┌────────────────────┐                          │
                │     │  GPT-4o (Aug 2024) │   zodResponseFormat()    │
                │     │  structured output │ ◀─ ExperimentPlanSchema  │
                │     └─────────┬──────────┘   (strict, .parse'd)     │
                │               ▼                                      │
                │     ExperimentPlan + enrichedPapers (typed JSON)    │
                └──────────────────────────────────────────────────────┘
```

### The key idea: **constrain the LLM three ways**

LLMs lie. Especially about catalog numbers and prices. Dexter makes that hard:

1. **Retrieval grounds the answer.** Before calling GPT-4o we run two parallel context-builders:
   - `lib/tavily.ts` — live search restricted to `pubmed.ncbi.nlm.nih.gov`, `arxiv.org`, `biorxiv.org`, `protocols.io`
   - `lib/catalog.ts` — keyword-scored top-K retrieval over a local catalog of real reagents we scraped from Sigma, Thermo Fisher, Addgene, and ATCC
2. **Schema constrains the output.** We use OpenAI's `zodResponseFormat` with our `ExperimentPlanSchema` (strict mode). The model literally cannot return a supplier outside the `Supplier` enum or skip a required field.
3. **Validation enforces the contract.** The response is `.parse()`'d at the boundary. Bad output crashes loudly rather than silently corrupting the UI.

### The corpus (the secret weapon)

The `backend/scrapers/` directory contains 13 polite Python scrapers that build the local knowledge base shipped with the API:

| Source | Items | What it gives us |
|---|---:|---|
| PubMed | papers | peer-reviewed novelty signal |
| protocols.io | protocols | step-by-step methodology |
| Bio-Protocol, JoVE, Nature Protocols | protocols | richer methods, parameters |
| Sigma-Aldrich, Thermo Fisher | reagents | EUR-priced catalog with real SKUs |
| ATCC | cell lines | cell-line authentication |
| Addgene | plasmids | molecular biology |

Total: **1,253 papers · 698 protocols · 106 catalog entries**, all served from JSON at request time. The scrapers are reproducible — see `backend/scrapers/README.md`.

---

## Frontend experience

Five sequential screens, single-page state machine via Zustand:

1. **Loading** — letter-by-letter wordmark reveal, sub-3s
2. **Hypothesis Input** — calm centered textarea with three example chips that prefill realistic hypotheses (cryoprotection, microbiome, CO₂ biofixation)
3. **Literature Graph** — interactive force-directed paper graph (d3-force + custom canvas), nodes sized by influence, lasso-select to filter, click to expand into a detail panel
4. **Plan Generating** — split view: skeleton plan on the left fills in section-by-section while a live "lab-log" activity feed streams on the right
5. **Plan View** — the deliverable: sticky TOC, all 10 sections rendered as chunky bordered cards with hard-offset shadows, citation hovercards, materials table with click-to-cross-reference, and PDF export via `jsPDF`

### Design system — "MIT Press meets NASA"

A deliberate aesthetic choice to *not* look like every other AI tool: cream + teal + rust-red, Fraunces display + Inter body + JetBrains Mono labels, **2-3px black borders, hard offset shadows (`4px 4px 0px`) — no soft blurs, no rounded everything**. Every card has a small monospace `§ SECTION` label in the corner. The chunkiness is the brand.

### Bonus: structured feedback

Users can highlight any text in the rendered plan and attach a comment. State is held in a Zustand `reportHighlights` array — easy to wire to a future fine-tuning loop.

---

## Tech stack

### Frontend (`frontend/`)
- **Framework:** Vite 7 + React 19 + TanStack Router (file-based routing)
- **State:** Zustand (single store, ~100 lines)
- **Styling:** Tailwind CSS v4 + custom CSS variables for the design system
- **UI primitives:** shadcn/ui on Radix
- **Graph:** d3-force + custom canvas rendering (we tried `react-force-graph-2d` and `@xyflow/react`; raw d3 won on look-and-feel)
- **PDF export:** jsPDF
- **Deploy:** Vercel + Cloudflare Vite plugin (edge-ready)

### Backend (`backend/`)
- **Framework:** Next.js 15 App Router (single `POST /api/plan` route)
- **LLM:** OpenAI `gpt-4o-2024-08-06` via `openai.beta.chat.completions.parse()`
- **Schema:** Zod v4 with `.strict()` everywhere
- **Live search:** Tavily API (advanced depth, scientific domains only)
- **Local retrieval:** keyword-scored JSON lookup (no vector DB needed at this corpus size — fast and reproducible)
- **Deploy:** Vercel

### Data pipeline (`backend/scrapers/`)
- **Language:** Python 3.11
- **Libraries:** `requests`, `beautifulsoup4`, `lxml`
- **Pattern:** every scraper extends `base.py` (rate-limited, polite, retry-aware), outputs to `data/*.json`, validated by `validate.py`

---

## Run it locally

### Prerequisites
- Node.js 20+
- An [OpenAI API key](https://platform.openai.com/api-keys) (required for real generation)
- A [Tavily API key](https://tavily.com) (optional — falls back to local corpus only)

### Backend

```bash
cd backend
npm install

cat > .env.local <<EOF
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...      # optional
FRONTEND_URL=http://localhost:5173   # for CORS in prod
EOF

npm run dev                  # http://localhost:3000
```

Without `OPENAI_API_KEY`, the API gracefully returns the bundled `MOCK_PLAN` so the demo never breaks.

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_BASE_URL=http://localhost:3000" > .env.local
npm run dev                  # http://localhost:8080
```

Without `VITE_API_BASE_URL`, the frontend talks to the deployed backend automatically — useful for offline UI work.

### Sanity check

```bash
curl -X POST http://localhost:3000/api/plan \
  -H "Content-Type: application/json" \
  -d '{"hypothesis":"Trehalose outperforms DMSO for HeLa cryopreservation"}' | jq .
```

You should get a fully-typed plan back in ~30–60s.

### Re-running the scrapers (optional)

```bash
cd backend/scrapers
pip install -r requirements.txt
python run_all.py --protocols-io-token YOUR_TOKEN --validate
```

---

## Project structure

```
dexter-plan-forge/
├── frontend/
│   ├── src/
│   │   ├── routes/index.tsx          # the entire 5-screen state machine
│   │   ├── lib/
│   │   │   ├── dexter-store.ts       # Zustand store
│   │   │   ├── backend-adapter.ts    # fetch + schema mapping
│   │   │   └── mock-plan.ts          # offline fallback data
│   │   ├── components/ui/            # shadcn primitives
│   │   └── styles.css                # design tokens + animations
│   └── vite.config.ts
│
├── backend/
│   ├── app/api/plan/route.ts         # POST /api/plan — the only endpoint
│   ├── lib/
│   │   ├── schema.ts                 # ExperimentPlanSchema (Zod, strict)
│   │   ├── tavily.ts                 # live web retrieval
│   │   ├── catalog.ts                # local catalog retrieval
│   │   └── llm/generate-plan.ts      # GPT-4o structured-output call
│   ├── data/
│   │   ├── papers.json               # 1,253 papers
│   │   ├── protocols.json            # 698 protocols
│   │   ├── catalog.json              # 106 reagents w/ EUR pricing
│   │   └── budget_constants.json     # labor / overhead rate cards
│   └── scrapers/                     # 13 reproducible Python scrapers
│
└── README.md                          # you are here
```

---

## Deployment

Both apps deploy to Vercel on push to `main`:

| App | Project root | URL |
|---|---|---|
| Frontend | `frontend/` | https://dexters-laboratory.mmmiscellaneous.workers.dev |
| Backend | `backend/` | https://ai-scientist-ruddy.vercel.app |

Set `OPENAI_API_KEY` and `TAVILY_API_KEY` in the backend's Vercel env vars. Set `VITE_API_BASE_URL` (optional) and `FRONTEND_URL` (CORS allowlist on the backend) in the frontend's.

---

## Team

Built overnight at Hack-Nation 5 by:

| Name | Role |
|---|---|
| **Moiz Ali** | Frontend lead · design system · interactive graph |
| _add teammate_ | Backend · LLM orchestration · schema design |
| _add teammate_ | Data pipeline · scrapers · catalog curation |
| _add teammate_ | Product · domain research · demo |

---

## Why this matters

Most "AI for science" demos stop at "look, it generates words." The hard part isn't generation — it's **trust**. A plan is only useful if a working scientist would stake a week of bench time on it.

Dexter is built around that bar: every claim has a source, every reagent has a catalog number, every cost has a line item. The schema is strict. The retrieval is grounded. The output is reproducible.

It's the difference between an LLM playing scientist and an LLM that respects the scientific method enough to be useful inside one.

---

## License

MIT — go build on it.
