import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ExperimentPlanSchema, type ExperimentPlan } from '@/lib/schema';
import { MOCK_PLAN } from '@/data/mock-plan';

interface Protocol {
  id: string;
  title: string;
  source: string;
  doi: string;
  url: string;
  year: number;
  domain: string[];
  experimentType: string;
  summary: string;
}

interface LocalPaper {
  id: string;
  title: string;
  authors: string[] | string;
  year: number;
  abstract?: string;
  journal?: string;
  doi?: string;
  url?: string;
  domain?: string[];
  tags?: string[];
  meshTerms?: string[];
  citationCount?: number;
  source?: string;
}

export interface EnrichedPaper {
  id: string;
  title: string;
  authors: string;
  year: number;
  abstract: string;
  source: string;
  url: string;
  tags: string[];
  influenceScore: number;
}

export type EnrichedPlan = ExperimentPlan & { enrichedPapers: EnrichedPaper[] };

interface BudgetConstants {
  laborRates: Record<string, number>;
  equipmentTimeRates: Record<string, number>;
  consumableCostBands?: Record<string, { low: number; mid: number; high: number }>;
  typicalLabTimeByExperimentType?: Record<string, { totalHours: number; breakdown: Record<string, number> }>;
  perDomainBudgetRanges?: Record<string, { min: number; typical: number; max: number }>;
  animalCosts?: Record<string, number>;
  sequencingCosts?: Record<string, number>;
  shippingAndHandling?: Record<string, number>;
  overheadRates: {
    institutional_overhead_fraction: number;
    consumables_markup_fraction: number;
  };
  contingencyPercentRecommended: number;
}

function loadProtocols(): Protocol[] {
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'protocols.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

let _cachedPapers: LocalPaper[] | null = null;
function loadPapers(): LocalPaper[] {
  if (_cachedPapers) return _cachedPapers;
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'papers.json'), 'utf-8');
    _cachedPapers = JSON.parse(raw) as LocalPaper[];
    return _cachedPapers;
  } catch {
    return [];
  }
}

function loadBudgetConstants(): BudgetConstants | null {
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'budget_constants.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function scoreByKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw)).length;
}

function filterRelevantProtocols(protocols: Protocol[], hypothesis: string): Protocol[] {
  if (protocols.length === 0) return [];
  const keywords = hypothesis.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return protocols
    .map((p) => ({
      p,
      score:
        scoreByKeywords(p.title, keywords) * 2 +
        scoreByKeywords(p.summary, keywords) +
        p.domain.filter((d) => keywords.some((kw) => d.includes(kw))).length * 2,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ p }) => p);
}

function filterRelevantPapers(papers: LocalPaper[], hypothesis: string): LocalPaper[] {
  if (papers.length === 0) return [];
  const keywords = hypothesis
    .toLowerCase()
    .split(/[\s,.()\-]+/)
    .filter((w) => w.length > 3);
  return papers
    .map((p) => ({
      p,
      score:
        scoreByKeywords(p.title, keywords) * 3 +
        scoreByKeywords(p.abstract ?? '', keywords) +
        (p.tags ?? []).filter((t) => keywords.some((kw) => t.toLowerCase().includes(kw))).length * 2 +
        (p.domain ?? []).filter((d) => keywords.some((kw) => d.toLowerCase().includes(kw))).length * 2,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ p }) => p);
}

function titleOverlap(a: string, b: string): number {
  const wordsA = a.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  if (wordsA.length === 0) return 0;
  const matchCount = wordsA.filter((w) => b.toLowerCase().includes(w)).length;
  return matchCount / wordsA.length;
}

function buildEnrichedPapers(
  plan: ExperimentPlan,
  relevantLocalPapers: LocalPaper[],
): EnrichedPaper[] {
  const used = new Set<string>();

  // 1. Try to match each noveltyCheck reference to a local paper
  const fromRefs: EnrichedPaper[] = plan.noveltyCheck.references.map((ref, i) => {
    const match = relevantLocalPapers.find(
      (lp) => titleOverlap(ref.title, lp.title) > 0.4 || titleOverlap(lp.title, ref.title) > 0.4,
    );
    if (match) used.add(match.id);
    const paperId = `p${i + 1}`;
    return match
      ? {
          id: paperId,
          title: match.title,
          authors: Array.isArray(match.authors)
            ? match.authors.slice(0, 3).join(', ')
            : String(match.authors ?? ref.source),
          year: match.year,
          abstract: match.abstract ?? `Source: ${ref.source}.`,
          source: ref.source,
          url: ref.url || (match.doi ? `https://doi.org/${match.doi}` : match.url ?? ''),
          tags: match.tags ?? [],
          influenceScore: parseFloat(
            Math.min(0.97, 0.5 + Math.min(0.45, (match.citationCount ?? 0) / 2000)).toFixed(2),
          ),
        }
      : {
          id: paperId,
          title: ref.title,
          authors: ref.source,
          year: ref.year,
          abstract: `Source: ${ref.source}. Link: ${ref.url.slice(0, 100)}`,
          source: ref.source,
          url: ref.url,
          tags: [],
          influenceScore: parseFloat((0.5 + (plan.noveltyCheck.references.length - i) / (plan.noveltyCheck.references.length * 2.5)).toFixed(2)),
        };
  });

  // 2. Fill remaining slots with additional local papers (up to 20 total)
  const targetCount = 20;
  const additional: EnrichedPaper[] = relevantLocalPapers
    .filter((lp) => !used.has(lp.id))
    .slice(0, Math.max(0, targetCount - fromRefs.length))
    .map((lp, i) => ({
      id: `p${fromRefs.length + i + 1}`,
      title: lp.title,
      authors: Array.isArray(lp.authors)
        ? lp.authors.slice(0, 3).join(', ')
        : String(lp.authors ?? 'Unknown'),
      year: lp.year,
      abstract: lp.abstract ?? 'No abstract available.',
      source: lp.source ?? 'Local database',
      url: lp.doi ? `https://doi.org/${lp.doi}` : (lp.url ?? ''),
      tags: lp.tags ?? [],
      influenceScore: parseFloat(
        Math.min(0.92, 0.35 + Math.min(0.55, (lp.citationCount ?? 0) / 3000)).toFixed(2),
      ),
    }));

  return [...fromRefs, ...additional];
}

// Q2 — strip hallucinated DOIs
function sanitizeProtocolRefs(plan: ExperimentPlan, allProtocols: Protocol[]): ExperimentPlan {
  const knownDois = allProtocols
    .filter((p) => p.doi != null)
    .map((p) => p.doi.toLowerCase());
  const looksLikeDoi = /10\.\d{4,}\/\S+/;

  return {
    ...plan,
    protocol: plan.protocol.map((step) => ({
      ...step,
      protocolRefs: step.protocolRefs.filter(Boolean).filter((ref) => {
        const r = ref.toLowerCase();
        if (knownDois.some((doi) => r.includes(doi))) return true;
        if (looksLikeDoi.test(r)) return false;
        return true;
      }),
    })),
  };
}

function buildBudgetSection(bc: BudgetConstants): string {
  const lr = bc.laborRates;
  const eq = bc.equipmentTimeRates;
  const ah = bc.animalCosts;
  const sh = bc.shippingAndHandling;

  const lines: string[] = [
    `Budget rules — use these EXACT rates for budget line items:`,
    `Labor: technician €${lr.lab_technician_per_hour}/h, postdoc €${lr.postdoc_per_hour}/h, PhD student €${lr.phd_student_per_hour}/h, senior scientist €${lr.senior_scientist_per_hour}/h, research associate €${lr.research_associate_per_hour ?? 35}/h`,
    `Equipment (time-based): flow cytometer €${eq.flow_cytometer_per_hour}/h, confocal €${eq.confocal_microscope_per_hour}/h, HPLC €${eq.hplc_per_hour}/h, potentiostat €${eq.potentiostat_per_day}/day, qPCR €${eq.qpcr_machine_per_run}/run, plate reader €${eq.plate_reader_per_hour}/h, anaerobic chamber €${eq.anaerobic_chamber_per_day}/day, LN2 storage €${eq.liquid_nitrogen_storage_per_week}/week, TEER meter €${eq.teer_meter_per_session ?? 5}/session, WB system €${eq.western_blot_system_per_gel ?? 15}/gel, NanoDrop €${eq.nanodrop_per_session ?? 8}/session, syringe pump €${eq.syringe_pump_per_day ?? 20}/day, plasma cleaner €${eq.plasma_cleaner_per_session ?? 15}/session`,
    ah
      ? `Animal costs: C57BL/6J mouse purchase €${ah.c57bl6_mouse_purchase_eur ?? 42}/animal, housing €${ah.animal_housing_per_mouse_per_week_eur ?? 12}/mouse/week, IACUC fee €${ah.iacuc_protocol_fee_eur ?? 500}`
      : '',
    sh
      ? `Shipping: standard €${sh.standard_reagent_per_order_eur ?? 25}/order, dry-ice biological €${sh.dry_ice_biological_per_order_eur ?? 55}/order, live cells €${sh.live_cell_priority_per_order_eur ?? 95}/order`
      : '',
    `Overhead: ${(bc.overheadRates.institutional_overhead_fraction * 100).toFixed(0)}% institutional overhead on direct costs. Consumables markup: ${(bc.overheadRates.consumables_markup_fraction * 100).toFixed(0)}%. Contingency: ${bc.contingencyPercentRecommended}%.`,
    `Reagent catalog context: catalog entries tagged [INDISPENSABLE] must appear in the materials list. [RECOMMENDED] items should be included unless clearly irrelevant. [OPTIONAL] items may be omitted if budget is tight.`,
    `Calculate each labor/equipment budget line from actual time estimate × rate. Do not use vague round numbers.`,
  ];

  return lines.filter(Boolean).join('\n');
}

const BASE_SYSTEM_PROMPT = `You are a senior research scientist designing rigorous laboratory experiments.
Rules:
- All work assumes a BSL-2 lab environment.
- All prices must be in EUR.
- Only use suppliers from this approved list: Sigma-Aldrich, Thermo Fisher, Addgene, ATCC, IDT, Promega, Qiagen, NEB, Bio-Rad, Other.
- Do not invent references. Only cite sources provided in the literature context or protocol context.
- For protocolRefs in each protocol step, only cite DOIs from the provided protocol context, formatted as "DOI: <doi> — <title>". Never invent a DOI.
- Novelty assessment: read every abstract and title in the literature context carefully. Set noveltyCheck.status to "exact_match" if a paper tests the same intervention on the same model, "similar_exists" if related work exists, "novel" only if no comparable study appears in the provided literature. Your rationale must explicitly reference the titles found.
- Validation criteria must be quantitative and binary: every threshold field must contain a specific number with units (e.g. "≥85% post-thaw viability", "LOD ≤ 0.5 mg/L", "p < 0.05 by Student t-test"). Never write vague thresholds like "improved" or "significant".
- Be precise, realistic, and complete.`;

const MAX_ATTEMPTS = 2;

export async function generatePlan(
  hypothesis: string,
  catalogContext: string,
  tavilyContext: string,
): Promise<EnrichedPlan> {
  const allPapers = loadPapers();
  const relevantLocalPapers = filterRelevantPapers(allPapers, hypothesis);

  // Build literature context: local corpus first, Tavily as supplement
  const localLiteratureContext =
    relevantLocalPapers.length > 0
      ? relevantLocalPapers
          .map((p) => {
            const authorsStr = Array.isArray(p.authors)
              ? p.authors.slice(0, 2).join(', ')
              : String(p.authors ?? 'Unknown');
            return `- ${p.title} (${authorsStr}, ${p.year}): ${(p.abstract ?? '').slice(0, 200)}`;
          })
          .join('\n')
      : '';

  const combinedLiteratureContext = localLiteratureContext
    ? `Local literature database (prioritise these):\n${localLiteratureContext}${tavilyContext ? `\n\nAdditional web results:\n${tavilyContext}` : ''}`
    : tavilyContext;

  if (!process.env.OPENAI_API_KEY) {
    return { ...MOCK_PLAN, enrichedPapers: [] };
  }

  const client = new OpenAI();
  const allProtocols = loadProtocols();
  const budgetConstants = loadBudgetConstants();
  const relevantProtocols = filterRelevantProtocols(allProtocols, hypothesis);

  const systemPrompt = budgetConstants
    ? `${BASE_SYSTEM_PROMPT}\n\n${buildBudgetSection(budgetConstants)}`
    : BASE_SYSTEM_PROMPT;

  const protocolContext =
    relevantProtocols.length > 0
      ? relevantProtocols
          .map((p) => `- DOI: ${p.doi} — ${p.title} (${p.source}, ${p.year}): ${p.summary}`)
          .join('\n')
      : '';

  const userPrompt = `Hypothesis: ${hypothesis}

${combinedLiteratureContext ? `Relevant literature:\n${combinedLiteratureContext}\n` : ''}
${catalogContext ? `Available reagents from catalog:\n${catalogContext}\n` : ''}
${protocolContext ? `Reference protocols (only cite these DOIs in protocolRefs, never invent one):\n${protocolContext}\n` : ''}
Design a complete experiment plan for this hypothesis.`;

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const completion = await client.chat.completions.parse({
        model: 'gpt-4o-2024-08-06',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: zodResponseFormat(ExperimentPlanSchema, 'experiment_plan'),
      });

      const msg = completion.choices[0].message;
      if (msg.refusal) throw new Error(`Model refused: ${msg.refusal}`);
      if (!msg.parsed) throw new Error('OpenAI returned no parsed output');

      const plan = sanitizeProtocolRefs(msg.parsed, allProtocols);
      const enrichedPapers = buildEnrichedPapers(plan, relevantLocalPapers);

      return { ...plan, enrichedPapers };
    } catch (err) {
      console.error(`[generatePlan] attempt ${attempt} failed:`, err);
      lastError = err;
      if (attempt < MAX_ATTEMPTS) continue;
    }
  }

  throw lastError;
}
