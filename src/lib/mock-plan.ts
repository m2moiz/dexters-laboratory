export type DexterScreen = "LOADING" | "HYPOTHESIS_INPUT" | "LITERATURE_GRAPH" | "PLAN_GENERATING" | "PLAN_VIEW";

export type SourceCitation = {
  id: string; // "SRC-001"
  kind: 'paper' | 'preprint' | 'protocol' | 'supplier_catalog' | 'database' | 'guideline' | 'inferred';
  title: string;
  authors: string;
  url: string;
  doi: string | null;
  year: number | null;
  excerpt: string;
};

export type Claim = {
  field_path: string;     // e.g. "protocol.steps[2].description"
  span: string | null;
  citation_ids: string[]; // refs to SourceCitation.id
  inferred: boolean;
  inferred_rationale: string;
};

export type Material = {
  id: string;             // "MAT-001"
  name: string;
  category: 'reagent' | 'antibody' | 'cell_line' | 'consumable' | 'kit' | 'organism' | 'other';
  supplier: string;       // "Sigma-Aldrich" | "Thermo Fisher" | "ATCC" | "Addgene" | "Other"
  catalog_number: string;
  url: string;
  quantity: string;
  unit_cost_eur: number;
  total_cost_eur: number;
  lead_time_days: number;
  alternative: { name: string; supplier: string; catalog_number: string; note: string } | null;
  citation_id: string;
};

export type ProtocolStep = {
  step_number: number;
  title: string;
  description: string;
  duration_minutes: number;
  critical_parameters: string[];
  warnings: string[];
  materials_used: string[]; // refs to Material.id
  citation_ids: string[];
};

export type EquipmentItem = {
  name: string;
  required: boolean; // false = nice-to-have
  notes: string;
};

export type BudgetLine = {
  category: 'reagents' | 'consumables' | 'cell_lines' | 'equipment_time' | 'personnel' | 'overhead' | 'other';
  description: string;
  cost_eur: number;
  material_ids: string[];
};

export type Budget = {
  lines: BudgetLine[];
  total_eur: number;
  contingency_pct: number;
};

export type TimelinePhase = {
  phase_number: number;
  name: string;
  start_week: number;
  end_week: number;
  depends_on: number[]; // phase_numbers
  milestones: string[];
};

export type Timeline = {
  phases: TimelinePhase[];
  total_weeks: number;
};

export type Outcome = {
  name: string;
  measurement: string;
  threshold: string;
  primary: boolean;
};

export type Control = { name: string; rationale: string };
export type FailureMode = { description: string; mitigation: string };

export type Validation = {
  outcomes: Outcome[];
  controls: Control[];
  failure_modes: FailureMode[];
  statistical_design: string;
};

export type NoveltyCheck = {
  status: 'novel' | 'incremental' | 'replicates_prior_work';
  summary: string;
  related_paper_ids: string[]; // refs Paper.id in graph
};

export type Paper = {
  id: string;
  title: string;
  authors: string;
  year: number;
  abstract: string;
  source: 'arXiv' | 'PubMed' | 'bioRxiv' | 'Other';
  url: string;
  x: number;
  y: number;
  influence: number; // 0..1, "relevance_score"
};

export type LiteratureEdge = {
  id: string;
  source: string;
  target: string;
  weight: number;
  relationship: 'cites' | 'similar_topic' | 'contradicts';
};

export type ExperimentPlan = {
  hypothesis: string;
  summary: string;
  experiment_type: 'in_vitro' | 'in_vivo' | 'ex_vivo' | 'electrochemical' | 'microbial' | 'computational' | 'other';
  domain: 'diagnostics' | 'gut_health' | 'cell_biology' | 'climate' | 'oncology' | 'neuroscience' | 'immunology' | 'cardiology' | 'other';
  duration_weeks: number;
  budget_total_eur: number;
  primary_outcome_label: string; // e.g. "≥15pp viability"
  novelty_check: NoveltyCheck;
  assumptions: string[];
  protocol: { steps: ProtocolStep[] };
  materials: Material[];
  equipment: EquipmentItem[];
  budget: Budget;
  timeline: Timeline;
  validation: Validation;
  sources: SourceCitation[];
  claims: Claim[];
  papers: Paper[];           // for literature graph
  edges: LiteratureEdge[];   // for literature graph
  activity: string[];        // for plan generating screen
  comments: string[];        // user-entered notes
};

export const exampleHypotheses = {
  "TREHALOSE CRYO": "Replacing sucrose with trehalose as a cryoprotectant in the freezing medium will increase post-thaw viability of HeLa cells by at least 15 percentage points compared to the standard DMSO protocol, due to trehalose's superior membrane stabilization at low temperatures.",
  "GUT MICROBIOME": "Supplementing C57BL/6 mice with Lactobacillus rhamnosus GG for 4 weeks will reduce intestinal permeability by at least 30% compared to controls, measured by FITC-dextran assay, due to upregulation of tight junction proteins claudin-1 and occludin.",
  "CO2 BIOFIXATION": "Introducing Sporomusa ovata into a bioelectrochemical system at a cathode potential of -400mV vs SHE will fix CO2 into acetate at a rate of at least 150 mmol/L/day, outperforming current biocatalytic carbon capture benchmarks by at least 20%.",
};

export const samplePlan: ExperimentPlan = {
  hypothesis: exampleHypotheses["TREHALOSE CRYO"],
  summary:
    "A controlled in-vitro comparison of a standard DMSO/sucrose freezing medium against an isomolar trehalose substitution, measuring post-thaw HeLa viability at 24 hours across three thaw timepoints (week 1, 3, 6) with n=6 vials per arm per timepoint.",
  experiment_type: "in_vitro",
  domain: "cell_biology",
  duration_weeks: 6,
  budget_total_eur: 5860,
  primary_outcome_label: "≥15pp viability",
  novelty_check: {
    status: "incremental",
    summary:
      "Trehalose membrane stabilization is well established (Crowe et al. 2001), but direct substitution thresholds in routine adherent HeLa workflows remain under-characterized. This experiment tests a pragmatic protocol-level swap rather than a novel cryodevice or post-thaw rescue.",
    related_paper_ids: ["p1", "p2", "p3", "p7"],
  },
  assumptions: [
    "HeLa CCL-2 stocks are mycoplasma-negative at passage <20.",
    "Controlled-rate freezer maintains 1°C/min cooling to -80°C within ±0.1°C/min.",
    "Trehalose dihydrate at 200 mM is iso-osmotic with the standard 10% sucrose comparator at 37°C.",
    "Operators thawing vials remain blinded to treatment arm via barcoded labels.",
    "A 15 percentage-point viability delta is biologically meaningful and detectable with n=6 per arm at α=0.05.",
  ],
  protocol: {
    steps: [
      {
        step_number: 1,
        title: "Prepare freezing media",
        description:
          "Prepare two freezing media: (A) Control = DMEM + 20% FBS + 10% DMSO + 100 mM sucrose; (B) Treatment = DMEM + 20% FBS + 10% DMSO + 200 mM trehalose dihydrate. Sterile-filter through 0.22 µm PES, confirm osmolarity at 1450 ± 50 mOsm/kg, and pre-chill to 4°C.",
        duration_minutes: 90,
        critical_parameters: ["pH 7.4 ± 0.1", "Osmolarity 1450 ± 50 mOsm/kg", "Filter pore 0.22 µm"],
        warnings: [
          "DMSO is cytotoxic above 10% — minimize handling time and keep media on ice once DMSO is added.",
          "Trehalose dihydrate is hygroscopic — weigh in a low-humidity environment.",
        ],
        materials_used: ["MAT-002", "MAT-003", "MAT-004", "MAT-005", "MAT-008"],
        citation_ids: ["SRC-001", "SRC-005"],
      },
      {
        step_number: 2,
        title: "Expand HeLa cells to harvest density",
        description:
          "Thaw HeLa CCL-2 working stock and expand in T-75 flasks with DMEM + 10% FBS at 37°C, 5% CO2 until cultures reach 70-80% confluence (typically 3-4 days). Verify mycoplasma-negative status before harvest.",
        duration_minutes: 5760,
        critical_parameters: ["37°C ± 0.5°C", "5% CO2 ± 0.2%", "Confluence 70-80%", "Passage <20"],
        warnings: ["Reject any flask showing acid color shift or detached colonies — indicates contamination."],
        materials_used: ["MAT-001", "MAT-002", "MAT-003"],
        citation_ids: ["SRC-006"],
      },
      {
        step_number: 3,
        title: "Harvest and randomize",
        description:
          "Trypsinize cells with 0.25% trypsin-EDTA for 4 minutes at 37°C, neutralize with complete medium, count on automated counter, and pool into a single suspension at 2×10^6 cells/mL. Randomize aliquots into condition A and B using a barcode-blinded scheme.",
        duration_minutes: 60,
        critical_parameters: ["Trypsin exposure ≤4 min", "Cell density 2×10^6/mL ± 10%", "Viability pre-freeze ≥95%"],
        warnings: ["Over-trypsinization damages membranes and confounds the freezing comparison."],
        materials_used: ["MAT-006", "MAT-007"],
        citation_ids: ["SRC-006"],
      },
      {
        step_number: 4,
        title: "Controlled-rate freeze",
        description:
          "Aliquot 1 mL of cell suspension into pre-labeled 2 mL cryovials (n=18 per arm: 6 vials × 3 thaw timepoints). Mix 1:1 with corresponding 2× freezing medium, transfer immediately to controlled-rate freezer programmed for -1°C/min from 4°C to -80°C, then transfer to liquid nitrogen vapor phase (≤-150°C) for storage.",
        duration_minutes: 180,
        critical_parameters: ["Cooling rate 1°C/min ± 0.1", "Final temp -80°C before LN2 transfer", "LN2 vapor ≤-150°C"],
        warnings: [
          "Do not exceed 15 minutes between adding DMSO-containing medium and starting the freeze.",
          "Vapor-phase storage avoids cross-contamination risk from liquid-phase LN2.",
        ],
        materials_used: ["MAT-008", "MAT-009"],
        citation_ids: ["SRC-002", "SRC-004"],
      },
      {
        step_number: 5,
        title: "Scheduled thaw and seeding",
        description:
          "At week 1, week 3, and week 6 post-freeze, retrieve 6 vials per arm. Thaw rapidly in a 37°C water bath (≤90 seconds, until a small ice sliver remains), dilute 10× into pre-warmed complete medium to dilute DMSO, centrifuge at 200×g for 5 minutes, resuspend pellet, and seed into 6-well plates at 2×10^5 cells/well.",
        duration_minutes: 75,
        critical_parameters: ["Thaw time ≤90 s", "DMSO dilution within 2 min of thaw", "Seeding density 2×10^5/well"],
        warnings: ["Slow thaw causes ice recrystallization and dramatically reduces viability — work fast."],
        materials_used: ["MAT-002", "MAT-003", "MAT-010"],
        citation_ids: ["SRC-003", "SRC-005"],
      },
      {
        step_number: 6,
        title: "24-hour viability assay",
        description:
          "After 24 hours of recovery at 37°C / 5% CO2, perform parallel viability measurements: (1) trypan blue exclusion via automated counter on a detached subsample, and (2) CellTiter-Glo ATP luminescence on the remaining adherent monolayer. Capture brightfield images at 10× for morphology scoring.",
        duration_minutes: 120,
        critical_parameters: ["Recovery 24 h ± 1 h", "Reader integration 1 s/well", "Images per well ≥3 fields"],
        warnings: ["Trypan blue alone underestimates damage — pair with ATP assay for confidence."],
        materials_used: ["MAT-007", "MAT-011"],
        citation_ids: ["SRC-006", "SRC-007"],
      },
      {
        step_number: 7,
        title: "Statistical analysis and reporting",
        description:
          "Compute viability per vial as (live count / total count) × 100. Compare arms with a two-sided Welch's t-test per timepoint and a mixed-effects model across timepoints (random effect: thaw batch). Report mean delta, 95% CI, and effect size (Cohen's d). Pre-registered success threshold: ≥15 pp improvement with lower CI bound > 0.",
        duration_minutes: 240,
        critical_parameters: ["α = 0.05", "n = 6 vials/arm/timepoint", "Pre-registered analysis plan"],
        warnings: ["Do not pool timepoints before checking for batch effects."],
        materials_used: [],
        citation_ids: ["SRC-008"],
      },
    ],
  },
  materials: [
    {
      id: "MAT-001",
      name: "HeLa CCL-2 cell line",
      category: "cell_line",
      supplier: "ATCC",
      catalog_number: "CCL-2",
      url: "https://www.atcc.org/products/ccl-2",
      quantity: "1 vial (≥1×10^6 cells)",
      unit_cost_eur: 647,
      total_cost_eur: 647,
      lead_time_days: 14,
      alternative: {
        name: "HeLa S3",
        supplier: "ECACC",
        catalog_number: "87110901",
        note: "Suspension-adapted variant; only use if adherent assay can be replaced.",
      },
      citation_id: "SRC-006",
    },
    {
      id: "MAT-002",
      name: "DMEM, high glucose, GlutaMAX",
      category: "reagent",
      supplier: "Thermo Fisher",
      catalog_number: "10566016",
      url: "https://www.thermofisher.com/order/catalog/product/10566016",
      quantity: "2 × 500 mL",
      unit_cost_eur: 32,
      total_cost_eur: 64,
      lead_time_days: 5,
      alternative: null,
      citation_id: "SRC-006",
    },
    {
      id: "MAT-003",
      name: "Fetal Bovine Serum, qualified",
      category: "reagent",
      supplier: "Thermo Fisher",
      catalog_number: "10270106",
      url: "https://www.thermofisher.com/order/catalog/product/10270106",
      quantity: "500 mL",
      unit_cost_eur: 410,
      total_cost_eur: 410,
      lead_time_days: 7,
      alternative: {
        name: "FBS, South America origin",
        supplier: "Sigma-Aldrich",
        catalog_number: "F7524",
        note: "Lot-test before swapping — viability assays are FBS-sensitive.",
      },
      citation_id: "SRC-006",
    },
    {
      id: "MAT-004",
      name: "Dimethyl sulfoxide (DMSO), Hybri-Max sterile",
      category: "reagent",
      supplier: "Sigma-Aldrich",
      catalog_number: "D2650",
      url: "https://www.sigmaaldrich.com/EN/en/product/sigma/d2650",
      quantity: "100 mL",
      unit_cost_eur: 78,
      total_cost_eur: 78,
      lead_time_days: 3,
      alternative: null,
      citation_id: "SRC-002",
    },
    {
      id: "MAT-005",
      name: "D-(+)-Trehalose dihydrate, ≥99%",
      category: "reagent",
      supplier: "Sigma-Aldrich",
      catalog_number: "T9531",
      url: "https://www.sigmaaldrich.com/EN/en/product/sigma/t9531",
      quantity: "100 g",
      unit_cost_eur: 85,
      total_cost_eur: 85,
      lead_time_days: 3,
      alternative: {
        name: "Trehalose, low-endotoxin",
        supplier: "Pfanstiehl",
        catalog_number: "T-104-1",
        note: "Higher purity, ~3× cost; only needed if endotoxin is a confounder.",
      },
      citation_id: "SRC-001",
    },
    {
      id: "MAT-006",
      name: "Sucrose, BioXtra ≥99.5%",
      category: "reagent",
      supplier: "Sigma-Aldrich",
      catalog_number: "S7903",
      url: "https://www.sigmaaldrich.com/EN/en/product/sigma/s7903",
      quantity: "500 g",
      unit_cost_eur: 54,
      total_cost_eur: 54,
      lead_time_days: 3,
      alternative: null,
      citation_id: "SRC-003",
    },
    {
      id: "MAT-007",
      name: "Trypsin-EDTA (0.25%), phenol red",
      category: "reagent",
      supplier: "Thermo Fisher",
      catalog_number: "25200056",
      url: "https://www.thermofisher.com/order/catalog/product/25200056",
      quantity: "100 mL",
      unit_cost_eur: 28,
      total_cost_eur: 28,
      lead_time_days: 5,
      alternative: null,
      citation_id: "SRC-006",
    },
    {
      id: "MAT-008",
      name: "Cryogenic vials, 2 mL, external thread",
      category: "consumable",
      supplier: "Thermo Fisher",
      catalog_number: "5000-1020",
      url: "https://www.thermofisher.com/order/catalog/product/5000-1020",
      quantity: "Pack of 100",
      unit_cost_eur: 96,
      total_cost_eur: 96,
      lead_time_days: 5,
      alternative: null,
      citation_id: "SRC-004",
    },
    {
      id: "MAT-009",
      name: "Mr. Frosty controlled-rate freezing container",
      category: "consumable",
      supplier: "Thermo Fisher",
      catalog_number: "5100-0001",
      url: "https://www.thermofisher.com/order/catalog/product/5100-0001",
      quantity: "1 unit (reusable)",
      unit_cost_eur: 142,
      total_cost_eur: 142,
      lead_time_days: 5,
      alternative: {
        name: "CoolCell LX",
        supplier: "Corning",
        catalog_number: "432002",
        note: "Alcohol-free alternative; comparable cooling profile.",
      },
      citation_id: "SRC-004",
    },
    {
      id: "MAT-010",
      name: "6-well tissue culture plate, treated",
      category: "consumable",
      supplier: "Corning",
      catalog_number: "3516",
      url: "https://www.corning.com/catalog/product/3516",
      quantity: "Pack of 50",
      unit_cost_eur: 78,
      total_cost_eur: 78,
      lead_time_days: 5,
      alternative: null,
      citation_id: "SRC-006",
    },
    {
      id: "MAT-011",
      name: "CellTiter-Glo 2.0 luminescent cell viability assay",
      category: "kit",
      supplier: "Promega",
      catalog_number: "G9241",
      url: "https://www.promega.com/products/cell-health-assays/cell-viability-and-cytotoxicity-assays/celltiter_glo-2_0-assay/",
      quantity: "100 mL (≈1000 assays)",
      unit_cost_eur: 720,
      total_cost_eur: 720,
      lead_time_days: 7,
      alternative: {
        name: "PrestoBlue HS",
        supplier: "Thermo Fisher",
        catalog_number: "P50200",
        note: "Resazurin-based; lower sensitivity but ~5× cheaper per well.",
      },
      citation_id: "SRC-007",
    },
    {
      id: "MAT-012",
      name: "Trypan blue solution, 0.4%",
      category: "reagent",
      supplier: "Thermo Fisher",
      catalog_number: "15250061",
      url: "https://www.thermofisher.com/order/catalog/product/15250061",
      quantity: "100 mL",
      unit_cost_eur: 21,
      total_cost_eur: 21,
      lead_time_days: 5,
      alternative: null,
      citation_id: "SRC-006",
    },
  ],
  equipment: [
    { name: "Class II biosafety cabinet", required: true, notes: "Annual certification current." },
    { name: "Humidified CO2 incubator (37°C, 5% CO2)", required: true, notes: "Two units recommended to separate arms." },
    { name: "Controlled-rate freezer or Mr. Frosty + -80°C freezer", required: true, notes: "Mr. Frosty acceptable for n=6 design." },
    { name: "Liquid nitrogen vapor-phase storage dewar", required: true, notes: "Vapor phase preferred over liquid to avoid cross-contamination." },
    { name: "Plate-reading luminometer", required: true, notes: "Any reader with 1 s/well integration." },
    { name: "Automated cell counter (Countess 3 or equivalent)", required: true, notes: "" },
    { name: "Inverted brightfield microscope, 10× objective", required: false, notes: "Used for morphology scoring; phone camera adapter acceptable." },
    { name: "Osmometer (freezing-point)", required: false, notes: "Can be borrowed from clinical chem; optional if media are made fresh per protocol." },
  ],
  budget: {
    lines: [
      { category: "cell_lines", description: "HeLa CCL-2 working stock from ATCC", cost_eur: 647, material_ids: ["MAT-001"] },
      { category: "reagents", description: "Cryoprotectants, sera, media, trypsin", cost_eur: 719, material_ids: ["MAT-002", "MAT-003", "MAT-004", "MAT-005", "MAT-006", "MAT-007"] },
      { category: "consumables", description: "Cryovials, freezing container, plates, trypan blue", cost_eur: 317, material_ids: ["MAT-008", "MAT-009", "MAT-010", "MAT-012"] },
      { category: "reagents", description: "CellTiter-Glo viability kit", cost_eur: 720, material_ids: ["MAT-011"] },
      { category: "equipment_time", description: "LN2 dewar fills, incubator and luminometer time (6 weeks)", cost_eur: 957, material_ids: [] },
      { category: "personnel", description: "Research technician, 0.25 FTE × 6 weeks", cost_eur: 1800, material_ids: [] },
      { category: "overhead", description: "Institutional overhead at 12% of direct costs", cost_eur: 700, material_ids: [] },
    ],
    total_eur: 5860,
    contingency_pct: 12,
  },
  timeline: {
    phases: [
      { phase_number: 1, name: "Procurement and setup", start_week: 1, end_week: 2, depends_on: [], milestones: ["All materials received", "Mycoplasma test passed"] },
      { phase_number: 2, name: "Media preparation and pilot freeze", start_week: 2, end_week: 3, depends_on: [1], milestones: ["Osmolarity confirmed", "Pilot cooling curve validated"] },
      { phase_number: 3, name: "Production freeze (n=36 vials)", start_week: 3, end_week: 3, depends_on: [2], milestones: ["All vials in LN2 vapor", "Pre-freeze viability ≥95%"] },
      { phase_number: 4, name: "Scheduled thaws and 24h assays", start_week: 4, end_week: 6, depends_on: [3], milestones: ["Week 1 thaw complete", "Week 3 thaw complete", "Week 6 thaw complete"] },
      { phase_number: 5, name: "Statistical analysis and decision package", start_week: 6, end_week: 6, depends_on: [4], milestones: ["Pre-registered analysis run", "Decision report delivered"] },
    ],
    total_weeks: 6,
  },
  validation: {
    outcomes: [
      { name: "Post-thaw viability delta", measurement: "Trypan blue exclusion + CellTiter-Glo ATP at 24 h", threshold: "≥15 percentage point improvement vs control, lower 95% CI > 0", primary: true },
      { name: "Attachment efficiency", measurement: "% adherent cells at 4 h post-seeding (manual count, 3 fields/well)", threshold: "Trehalose arm not inferior by >5 pp", primary: false },
      { name: "Proliferation recovery", measurement: "Doubling time over days 1-3 post-thaw", threshold: "Within 10% of fresh-culture baseline", primary: false },
      { name: "Morphology score", measurement: "Blinded 3-point scale on brightfield images", threshold: "No degradation vs control", primary: false },
    ],
    controls: [
      { name: "Standard DMSO/sucrose freezing medium", rationale: "Established lab baseline; defines the comparator." },
      { name: "Fresh (never-frozen) HeLa culture", rationale: "Upper bound for viability and proliferation reference." },
      { name: "DMSO-only freezing medium", rationale: "Isolates the contribution of the disaccharide vs DMSO alone." },
    ],
    failure_modes: [
      { description: "Mycoplasma contamination detected mid-experiment", mitigation: "Test pre-freeze and at each thaw; discard contaminated batches; budget includes contingency for a re-freeze." },
      { description: "Cooling-rate drift produces inter-vial variation", mitigation: "Log temperature with internal probe; reject vials whose curve deviates >0.2°C/min from target." },
      { description: "Trehalose arm fails to dissolve fully at 200 mM", mitigation: "Pre-warm to 50°C during dissolution, then cool and re-filter; verify osmolarity before use." },
    ],
    statistical_design: "Two-sided Welch's t-test per timepoint (α = 0.05), plus a linear mixed-effects model across all timepoints with thaw batch as a random effect. n=6 vials per arm per timepoint provides 80% power to detect a 15 pp viability delta assuming SD = 8 pp. Analysis plan pre-registered before freeze.",
  },
  sources: [
    {
      id: "SRC-001",
      kind: "paper",
      title: "The role of vitrification in anhydrobiosis",
      authors: "Crowe, J.H.; Carpenter, J.F.; Crowe, L.M.",
      url: "https://doi.org/10.1146/annurev.physiol.60.1.73",
      doi: "10.1146/annurev.physiol.60.1.73",
      year: 1998,
      excerpt: "Trehalose stabilizes membranes by hydrogen-bonding to phospholipid headgroups in place of water during dehydration, suppressing phase transitions and preserving bilayer integrity.",
    },
    {
      id: "SRC-002",
      kind: "paper",
      title: "Intracellular trehalose improves the survival of cryopreserved mammalian cells",
      authors: "Eroglu, A.; Russo, M.J.; Bieganski, R.; et al.",
      url: "https://doi.org/10.1038/74448",
      doi: "10.1038/74448",
      year: 2000,
      excerpt: "Loading of trehalose into mammalian cells via a genetically engineered pore yielded substantially improved post-thaw recovery compared to extracellular trehalose alone.",
    },
    {
      id: "SRC-003",
      kind: "paper",
      title: "Protectants used in the cryopreservation of microorganisms",
      authors: "Hubálek, Z.",
      url: "https://doi.org/10.1016/S0011-2240(03)00046-4",
      doi: "10.1016/S0011-2240(03)00046-4",
      year: 2003,
      excerpt: "Comparative review of permeating and non-permeating cryoprotectants. Trehalose and sucrose perform comparably as non-permeating agents, but trehalose shows lower toxicity at high concentrations.",
    },
    {
      id: "SRC-004",
      kind: "protocol",
      title: "Controlled-rate freezing of adherent mammalian cell lines",
      authors: "Ishikawa, T.; North, J.; Patel, R.",
      url: "https://www.protocols.io/view/controlled-rate-freezing-adherent-cells",
      doi: null,
      year: 2015,
      excerpt: "Standardized cooling at 1°C/min from 4°C to -80°C using a Mr. Frosty container reduces inter-vial viability variation to <3% and clarifies the effect size of freezing-medium changes.",
    },
    {
      id: "SRC-005",
      kind: "paper",
      title: "Osmotic stress thresholds in HeLa post-thaw recovery",
      authors: "Mendez, F.; Al-Khatib, S.",
      url: "https://doi.org/10.1016/j.cryobiol.2018.04.005",
      doi: "10.1016/j.cryobiol.2018.04.005",
      year: 2018,
      excerpt: "Post-thaw attachment and ATP recovery are sensitive to osmolarity excursions >100 mOsm/kg introduced by non-permeating solute substitutions.",
    },
    {
      id: "SRC-006",
      kind: "supplier_catalog",
      title: "ATCC HeLa CCL-2 product specification",
      authors: "ATCC",
      url: "https://www.atcc.org/products/ccl-2",
      doi: null,
      year: 2024,
      excerpt: "Cervical adenocarcinoma epithelial cell line. Recommended growth medium: DMEM with 10% FBS. Subculture at 70-80% confluence using 0.25% trypsin-EDTA. Mycoplasma-free at distribution.",
    },
    {
      id: "SRC-007",
      kind: "supplier_catalog",
      title: "CellTiter-Glo 2.0 technical manual TM403",
      authors: "Promega",
      url: "https://www.promega.com/resources/protocols/technical-manuals/0/celltiter-glo-2-0-assay-protocol/",
      doi: null,
      year: 2023,
      excerpt: "Homogeneous luminescent assay quantifies ATP as a proxy for viable cell count. Linear range 10-50,000 cells/well in 96-well format. 10-minute equilibration before reading.",
    },
    {
      id: "SRC-008",
      kind: "guideline",
      title: "Statistical design for small-batch cell culture experiments",
      authors: "Reed, K.; Olsen, M.",
      url: "https://doi.org/10.1186/s12915-019-0726-5",
      doi: "10.1186/s12915-019-0726-5",
      year: 2019,
      excerpt: "Pre-registered analysis plans, blinded measurement, and explicit treatment of batch effects are central to interpreting modest (10-20 pp) viability improvements in cryopreservation studies.",
    },
  ],
  claims: [
    {
      field_path: "novelty_check.summary",
      span: "Trehalose membrane stabilization is well established",
      citation_ids: ["SRC-001"],
      inferred: false,
      inferred_rationale: "",
    },
    {
      field_path: "protocol.steps[0].description",
      span: "200 mM trehalose dihydrate",
      citation_ids: ["SRC-001", "SRC-005"],
      inferred: false,
      inferred_rationale: "",
    },
    {
      field_path: "protocol.steps[0].warnings[0]",
      span: "DMSO is cytotoxic above 10%",
      citation_ids: ["SRC-002"],
      inferred: false,
      inferred_rationale: "",
    },
    {
      field_path: "protocol.steps[3].critical_parameters[0]",
      span: "Cooling rate 1°C/min ± 0.1",
      citation_ids: ["SRC-004"],
      inferred: false,
      inferred_rationale: "",
    },
    {
      field_path: "protocol.steps[4].critical_parameters[0]",
      span: "Thaw time ≤90 s",
      citation_ids: ["SRC-003"],
      inferred: false,
      inferred_rationale: "",
    },
    {
      field_path: "materials[0].unit_cost_eur",
      span: null,
      citation_ids: ["SRC-006"],
      inferred: false,
      inferred_rationale: "",
    },
    {
      field_path: "materials[4].unit_cost_eur",
      span: null,
      citation_ids: [],
      inferred: true,
      inferred_rationale: "Sigma-Aldrich web price for T9531 (100 g) at the time of plan generation; subject to lot pricing and EU VAT adjustment.",
    },
    {
      field_path: "materials[10].unit_cost_eur",
      span: null,
      citation_ids: ["SRC-007"],
      inferred: false,
      inferred_rationale: "",
    },
    {
      field_path: "validation.outcomes[0].threshold",
      span: "≥15 percentage point improvement",
      citation_ids: [],
      inferred: true,
      inferred_rationale: "Threshold derived from the user's stated hypothesis; not from prior literature. Power calculation assumes SD=8 pp from Eroglu 2000 follow-up data.",
    },
    {
      field_path: "validation.statistical_design",
      span: "n=6 vials per arm per timepoint provides 80% power",
      citation_ids: ["SRC-008"],
      inferred: false,
      inferred_rationale: "",
    },
    {
      field_path: "budget.total_eur",
      span: null,
      citation_ids: [],
      inferred: true,
      inferred_rationale: "Sum of itemized lines plus 12% institutional overhead typical for EU academic labs (range 8-25%).",
    },
    {
      field_path: "timeline.phases[3].milestones",
      span: "Week 1 thaw complete",
      citation_ids: [],
      inferred: true,
      inferred_rationale: "Three-timepoint thaw schedule chosen to balance early signal detection (week 1) against medium-term stability (week 6); not prescribed by source literature.",
    },
  ],
  papers: [
    {
      id: "p1",
      title: "Trehalose and membrane stabilization during freezing",
      authors: "Crowe, Carpenter, Crowe",
      year: 2001,
      abstract:
        "Trehalose preserves membrane structure during dehydration and freezing by replacing water at phospholipid headgroups and suppressing phase transitions.",
      source: "PubMed",
      url: "https://pubmed.ncbi.nlm.nih.gov/11118187/",
      x: 120,
      y: 140,
      influence: 0.95,
    },
    {
      id: "p2",
      title: "Intracellular trehalose improves mammalian cell cryosurvival",
      authors: "Eroglu, Russo, Bieganski",
      year: 2000,
      abstract:
        "Delivery of trehalose into mammalian cells improved recovery after cryogenic storage and reduced membrane damage during thaw.",
      source: "PubMed",
      url: "https://pubmed.ncbi.nlm.nih.gov/10748528/",
      x: 340,
      y: 90,
      influence: 0.88,
    },
    {
      id: "p3",
      title: "Cryoprotectants in biological preservation",
      authors: "Hubálek",
      year: 2003,
      abstract:
        "A comparative review of permeating and non-permeating cryoprotectants across microbial and mammalian systems.",
      source: "PubMed",
      url: "https://pubmed.ncbi.nlm.nih.gov/12878476/",
      x: 560,
      y: 170,
      influence: 0.7,
    },
    {
      id: "p4",
      title: "Controlled-rate freezing protocols for adherent cell lines",
      authors: "Ishikawa, North, Patel",
      year: 2015,
      abstract:
        "Standardized cooling rates reduce inter-vial variation and clarify the effect size of freezing medium changes.",
      source: "Other",
      url: "https://www.protocols.io/view/controlled-rate-freezing-adherent-cells",
      x: 240,
      y: 300,
      influence: 0.78,
    },
    {
      id: "p5",
      title: "Osmotic stress thresholds in HeLa recovery",
      authors: "Mendez, Al-Khatib",
      year: 2018,
      abstract:
        "Post-thaw attachment and ATP recovery are sensitive to osmolarity changes introduced by non-permeating solutes.",
      source: "PubMed",
      url: "https://pubmed.ncbi.nlm.nih.gov/29680447/",
      x: 500,
      y: 340,
      influence: 0.82,
    },
    {
      id: "p6",
      title: "Viability assays after cryogenic storage",
      authors: "Bauer, Singh, Moretti",
      year: 2020,
      abstract:
        "Pairing dye exclusion with metabolic assays improves confidence when evaluating cryoprotectant interventions.",
      source: "bioRxiv",
      url: "https://www.biorxiv.org/content/10.1101/2020.04.15.043125",
      x: 720,
      y: 270,
      influence: 0.62,
    },
    {
      id: "p7",
      title: "DMSO-sparing freezing media for epithelial cell lines",
      authors: "Ko and Yamamoto",
      year: 2022,
      abstract:
        "Alternative solute systems can reduce toxicity while preserving attachment, but require careful dose matching.",
      source: "PubMed",
      url: "https://pubmed.ncbi.nlm.nih.gov/35123456/",
      x: 760,
      y: 90,
      influence: 0.54,
    },
    {
      id: "p8",
      title: "Statistical design for small-batch cell culture experiments",
      authors: "Reed, Olsen",
      year: 2019,
      abstract:
        "Replicate structure and batch randomization are central to interpreting modest viability improvements.",
      source: "Other",
      url: "https://doi.org/10.1186/s12915-019-0726-5",
      x: 100,
      y: 390,
      influence: 0.68,
    },
  ],
  edges: [
    { id: "e1", source: "p1", target: "p2", weight: 0.92, relationship: "cites" },
    { id: "e2", source: "p2", target: "p3", weight: 0.7, relationship: "similar_topic" },
    { id: "e3", source: "p2", target: "p4", weight: 0.84, relationship: "cites" },
    { id: "e4", source: "p4", target: "p5", weight: 0.78, relationship: "similar_topic" },
    { id: "e5", source: "p5", target: "p6", weight: 0.58, relationship: "cites" },
    { id: "e6", source: "p3", target: "p7", weight: 0.42, relationship: "contradicts" },
    { id: "e7", source: "p8", target: "p4", weight: 0.64, relationship: "similar_topic" },
    { id: "e8", source: "p1", target: "p5", weight: 0.73, relationship: "cites" },
  ],
  activity: [
    "[LAB-LOG 14:23:01] Searching protocols.io for cryopreservation...",
    "[LAB-LOG 14:23:04] Found 4 relevant protocols",
    "[LAB-LOG 14:23:06] Reading methodology from Crowe et al. 2001...",
    "[LAB-LOG 14:23:09] Comparing trehalose osmolarity ranges",
    "[LAB-LOG 14:23:12] Estimating replicate count for 15pp effect",
    "[LAB-LOG 14:23:16] Drafting validation criteria and budget table",
    "[LAB-LOG 14:23:20] Final plan package assembled",
  ],
  comments: [
    "Confirm trehalose osmolarity before freezing medium release.",
    "Keep thaw operators blinded to condition labels.",
    "Add morphology image capture if attachment diverges from viability.",
  ],
};
