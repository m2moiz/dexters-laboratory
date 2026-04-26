import { z } from 'zod';

// ============ ENUMS ============

export const NoveltyStatus = z.enum([
  'novel',
  'similar_exists',
  'exact_match',
]);

export const Supplier = z.enum([
  'Sigma-Aldrich',
  'Thermo Fisher',
  'Addgene',
  'ATCC',
  'IDT',
  'Promega',
  'Qiagen',
  'NEB',
  'Bio-Rad',
  'Other',
]);

export const SourceType = z.enum([
  'arXiv',
  'PubMed',
  'protocols.io',
  'bioRxiv',
  'Nature',
  'Science',
  'Other',
]);

export const BudgetCategory = z.enum([
  'reagents',
  'cell_lines',
  'equipment_time',
  'labor',
  'consumables',
  'overhead',
]);

export const RiskLikelihood = z.enum(['low', 'medium', 'high']);

// ============ SUB-SCHEMAS ============

export const Reference = z.object({
  title: z.string(),
  url: z.string(),
  year: z.number(),
  source: SourceType,
}).strict();

export const NoveltyCheck = z.object({
  status: NoveltyStatus,
  rationale: z.string(),
  references: z.array(Reference),
}).strict();

export const ProtocolStep = z.object({
  step: z.number(),
  title: z.string(),
  description: z.string(),
  durationMinutes: z.number(),
  protocolRefs: z.array(z.string()),
}).strict();

export const Material = z.object({
  name: z.string(),
  supplier: Supplier,
  catalogNumber: z.string(),
  packageSize: z.string(),
  quantity: z.string(),
  priceEur: z.number(),
  supplierUrl: z.string(),
}).strict();

export const EquipmentItem = z.object({
  name: z.string(),
  required: z.boolean(),
  notes: z.string(),
}).strict();

export const BudgetLine = z.object({
  category: BudgetCategory,
  lineItem: z.string(),
  amountEur: z.number(),
  notes: z.string(),
}).strict();

export const Budget = z.object({
  lines: z.array(BudgetLine),
  totalEur: z.number(),
  contingencyPercent: z.number(),
}).strict();

export const TimelinePhase = z.object({
  phase: z.string(),
  weeks: z.number(),
  dependsOn: z.string().nullable(),
  deliverable: z.string(),
  keyMilestone: z.string(),
}).strict();

export const Timeline = z.object({
  phases: z.array(TimelinePhase),
  totalWeeks: z.number(),
}).strict();

export const ValidationCriterion = z.object({
  metric: z.string(),
  threshold: z.string(),
  method: z.string(),
  successCondition: z.string(),
}).strict();

export const Risk = z.object({
  description: z.string(),
  likelihood: RiskLikelihood,
  mitigation: z.string(),
}).strict();

// ============ MAIN SCHEMA ============

export const ExperimentPlanSchema = z.object({
  hypothesis: z.string(),
  summary: z.string(),
  noveltyCheck: NoveltyCheck,
  assumptions: z.array(z.string()),
  protocol: z.array(ProtocolStep),
  materials: z.array(Material),
  equipment: z.array(EquipmentItem),
  budget: Budget,
  timeline: Timeline,
  validation: z.array(ValidationCriterion),
  risks: z.array(Risk),
}).strict();

export type ExperimentPlan = z.infer<typeof ExperimentPlanSchema>;
