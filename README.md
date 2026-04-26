# Dexter's Laboratory

AI experiment-plan generator. Type a scientific hypothesis, get a fact-checkable, fully-costed experiment plan a real lab could execute Monday morning.

Built for Hack-Nation 5 — Fulcrum Track.

## Structure

```
.
├── frontend/   # Vite + TanStack Start — UI, literature graph, plan view
└── backend/    # Next.js — POST /api/plan (GPT-4o + Tavily + local catalog)
```

## Live URLs

- **Frontend:** https://dexter-frontend.vercel.app
- **Backend:** https://ai-scientist-ruddy.vercel.app

## Local development

```bash
# Backend
cd backend
npm install
echo "OPENAI_API_KEY=sk-..." > .env.local
echo "TAVILY_API_KEY=tvly-..." >> .env.local
npm run dev   # http://localhost:3000

# Frontend (separate terminal)
cd frontend
npm install
echo "VITE_API_BASE_URL=http://localhost:3000" > .env.local
npm run dev   # http://localhost:5173
```

Without `VITE_API_BASE_URL` the frontend talks to the deployed backend by default.

## Deploy

Push to `main` → Vercel auto-deploys both apps. Frontend project root: `frontend/`. Backend project root: `backend/`.
