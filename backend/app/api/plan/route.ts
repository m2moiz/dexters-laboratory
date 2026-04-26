import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MOCK_PLAN } from '@/data/mock-plan';
import { searchPapers } from '@/lib/tavily';
import { getCatalogContext } from '@/lib/catalog';
import { generatePlan, type EnrichedPlan } from '@/lib/llm/generate-plan';

const RequestSchema = z.object({
  hypothesis: z.string().min(1),
});

// Allow the frontend dev server and any deployed origin.
// In production set FRONTEND_URL to your actual domain.
const allowedOrigin = process.env.FRONTEND_URL ?? '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'hypothesis is required' }, { status: 400, headers: corsHeaders });
  }

  const { hypothesis } = parsed.data;

  const [tavilyContext, catalogContext] = await Promise.all([
    searchPapers(hypothesis),
    getCatalogContext(hypothesis),
  ]);

  try {
    const plan: EnrichedPlan = await generatePlan(hypothesis, catalogContext, tavilyContext);
    return NextResponse.json(plan, { headers: corsHeaders });
  } catch (err) {
    console.error('[/api/plan] generatePlan failed:', err);
    return NextResponse.json(
      { error: 'Plan generation failed', detail: String(err) },
      { status: 500, headers: corsHeaders },
    );
  }
}
