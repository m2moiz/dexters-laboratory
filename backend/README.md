# ai-scientist — backend API

Next.js 15 API-only server. Exposes `POST /api/plan` which generates a structured experiment plan using GPT-4o.

See the root [README](../README.md) for full setup instructions and architecture details.

## Dev server

```bash
npm install
# create .env.local with OPENAI_API_KEY and TAVILY_API_KEY
npm run dev   # http://localhost:3000
```

## Endpoint

```
POST /api/plan
Content-Type: application/json

{ "hypothesis": "Your scientific hypothesis here" }
```

Returns an `ExperimentPlan` object (see `lib/schema.ts`) enriched with a `enrichedPapers` array sourced from the local `data/papers.json` corpus.
