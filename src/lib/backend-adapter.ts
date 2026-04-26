import type { ExperimentPlan, Paper, SourceCitation } from "./mock-plan";

export type BackendEnrichedPlan = {
  hypothesis: string;
  summary: string;
  noveltyCheck: {
    status: "novel" | "similar_exists" | "exact_match";
    rationale: string;
    references: Array<{ title: string; url: string; year: number; source: string }>;
  };
  assumptions: string[];
  protocol: Array<{
    step: number;
    title: string;
    description: string;
    durationMinutes: number;
    protocolRefs: string[];
  }>;
  materials: Array<{
    name: string;
    supplier: string;
    catalogNumber: string;
    packageSize: string;
    quantity: string;
    priceEur: number;
    supplierUrl: string;
  }>;
  equipment: Array<{ name: string; required: boolean; notes: string }>;
  budget: {
    lines: Array<{ category: string; lineItem: string; amountEur: number; notes: string }>;
    totalEur: number;
    contingencyPercent: number;
  };
  timeline: {
    phases: Array<{ phase: string; weeks: number; dependsOn: string | null; deliverable: string; keyMilestone: string }>;
    totalWeeks: number;
  };
  validation: Array<{ metric: string; threshold: string; method: string; successCondition: string }>;
  risks: Array<{ description: string; likelihood: "low" | "medium" | "high"; mitigation: string }>;
  enrichedPapers: Array<{
    id: string;
    title: string;
    authors: string;
    year: number;
    abstract: string;
    source: string;
    url: string;
    tags: string[];
    influenceScore: number;
  }>;
};

const padId = (prefix: string, idx: number) => `${prefix}-${String(idx + 1).padStart(3, "0")}`;

const sourceKindFromString = (raw: string): SourceCitation["kind"] => {
  const lower = raw.toLowerCase();
  if (lower.includes("protocol")) return "protocol";
  if (lower.includes("biorxiv") || lower.includes("arxiv") || lower.includes("preprint")) return "preprint";
  return "paper";
};

const paperSourceFromString = (raw: string): string => raw || "Other";

export function adaptBackendPlan(raw: BackendEnrichedPlan): ExperimentPlan {
  const noveltyStatus: ExperimentPlan["novelty_check"]["status"] =
    raw.noveltyCheck.status === "novel"
      ? "novel"
      : raw.noveltyCheck.status === "similar_exists"
        ? "incremental"
        : "replicates_prior_work";

  // Walk phases in order, computing absolute start/end weeks from the dependsOn chain.
  const phaseEndByName = new Map<string, number>();
  const phaseNumberByName = new Map<string, number>();
  const phases = raw.timeline.phases.map((p, idx) => {
    const start = p.dependsOn ? (phaseEndByName.get(p.dependsOn) ?? 0) : 0;
    const end = start + p.weeks;
    phaseEndByName.set(p.phase, end);
    phaseNumberByName.set(p.phase, idx + 1);
    return {
      phase_number: idx + 1,
      name: p.phase,
      start_week: start + 1,
      end_week: Math.max(start + 1, end),
      depends_on: p.dependsOn && phaseNumberByName.has(p.dependsOn) ? [phaseNumberByName.get(p.dependsOn)!] : [],
      milestones: [p.keyMilestone].filter(Boolean) as string[],
    };
  });

  const materials = raw.materials.map((m, idx) => ({
    id: padId("MAT", idx),
    name: m.name,
    category: "reagent" as const,
    supplier: m.supplier,
    catalog_number: m.catalogNumber,
    url: m.supplierUrl,
    quantity: m.quantity,
    unit_cost_eur: m.priceEur,
    total_cost_eur: m.priceEur,
    lead_time_days: 0,
    alternative: null,
    citation_id: "",
  }));

  const sources: SourceCitation[] = raw.noveltyCheck.references.map((ref, idx) => ({
    id: padId("SRC", idx),
    kind: sourceKindFromString(ref.source),
    title: ref.title,
    authors: "",
    url: ref.url,
    doi: null,
    year: ref.year,
    excerpt: "",
  }));

  const papers: Paper[] = raw.enrichedPapers.map((p, idx, arr) => {
    const angle = (idx * 2 * Math.PI) / Math.max(arr.length, 1);
    const radius = 200 + (1 - p.influenceScore) * 200;
    return {
      id: p.id,
      title: p.title,
      authors: p.authors,
      year: p.year,
      abstract: p.abstract,
      source: paperSourceFromString(p.source),
      url: p.url,
      x: 600 + Math.cos(angle) * radius,
      y: 400 + Math.sin(angle) * radius,
      influence: p.influenceScore,
    };
  });

  return {
    hypothesis: raw.hypothesis,
    summary: raw.summary,
    experiment_type: "other",
    domain: "other",
    duration_weeks: raw.timeline.totalWeeks,
    budget_total_eur: raw.budget.totalEur,
    primary_outcome_label: raw.validation[0]?.threshold ?? "TBD",
    novelty_check: {
      status: noveltyStatus,
      summary: raw.noveltyCheck.rationale,
      related_paper_ids: [],
    },
    assumptions: raw.assumptions,
    protocol: {
      steps: raw.protocol.map((s) => ({
        step_number: s.step,
        title: s.title,
        description: s.description,
        duration_minutes: s.durationMinutes,
        critical_parameters: [],
        warnings: [],
        materials_used: [],
        citation_ids: s.protocolRefs,
      })),
    },
    materials,
    equipment: raw.equipment.map((e) => ({ name: e.name, required: e.required, notes: e.notes })),
    budget: {
      lines: raw.budget.lines.map((l) => ({
        category: l.category as ExperimentPlan["budget"]["lines"][number]["category"],
        description: l.lineItem,
        cost_eur: l.amountEur,
        material_ids: [],
      })),
      total_eur: raw.budget.totalEur,
      contingency_pct: raw.budget.contingencyPercent,
    },
    timeline: {
      phases,
      total_weeks: raw.timeline.totalWeeks,
    },
    validation: {
      outcomes: raw.validation.map((v, idx) => ({
        name: v.metric,
        measurement: v.successCondition + (v.method ? ` (${v.method})` : ""),
        threshold: v.threshold,
        primary: idx === 0,
      })),
      controls: [],
      failure_modes: raw.risks.map((r) => ({
        description: `${r.description} [risk: ${r.likelihood}]`,
        mitigation: r.mitigation,
      })),
      statistical_design: "",
    },
    sources,
    claims: [],
    papers,
    edges: [],
    activity: [],
    comments: [],
  };
}

export async function fetchPlanFromBackend(
  hypothesis: string,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<ExperimentPlan> {
  const res = await fetch(`${baseUrl}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hypothesis }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Plan API ${res.status}: ${text || res.statusText}`);
  }
  const raw = (await res.json()) as BackendEnrichedPlan;
  return adaptBackendPlan(raw);
}
