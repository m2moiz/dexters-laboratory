export type DexterScreen =
  | "LOADING"
  | "HYPOTHESIS_INPUT"
  | "LITERATURE_GRAPH"
  | "PLAN_GENERATING"
  | "PLAN_VIEW";

export type Paper = {
  id: string;
  title: string;
  authors: string;
  year: number;
  abstract: string;
  x: number;
  y: number;
};

export type PlanSection = {
  id: string;
  label: string;
  title: string;
  content: string[];
};

export type DexterPlan = {
  hypothesis: string;
  metrics: string[];
  sections: PlanSection[];
  citations: string[];
  comments: string[];
  papers: Paper[];
  edges: { id: string; source: string; target: string }[];
  activity: string[];
};

export const exampleHypotheses = {
  "TREHALOSE CRYO":
    "Replacing sucrose with trehalose as a cryoprotectant in the freezing medium will increase post-thaw viability of HeLa cells by 15 percentage points after 24 hours of recovery.",
  "GUT MICROBIOME":
    "Introducing a resistant starch intervention will increase butyrate-producing taxa abundance by 20% in simulated gut microbiome cultures after 10 days.",
  "CO2 BIOFIXATION":
    "Increasing photobioreactor CO2 concentration from 2% to 8% will improve Chlorella vulgaris biomass productivity by 18% without reducing chlorophyll fluorescence.",
};

export const samplePlan: DexterPlan = {
  hypothesis: exampleHypotheses["TREHALOSE CRYO"],
  metrics: ["6 weeks", "EUR 5,860", ">=15pp viability"],
  sections: [
    {
      id: "summary",
      label: "§ SUMMARY",
      title: "Summary",
      content: [
        "Run a controlled cryopreservation comparison between a standard sucrose-containing freezing medium and an isomolar trehalose substitution.",
        "Primary endpoint is post-thaw HeLa cell viability at 24 hours. Secondary endpoints include attachment efficiency, proliferation recovery, and morphology score.",
      ],
    },
    {
      id: "novelty",
      label: "§ NOVELTY",
      title: "Novelty",
      content: [
        "Trehalose is well documented as a membrane stabilizer, but direct substitution thresholds in routine HeLa freezing workflows remain under-characterized.",
        "The experiment tests a pragmatic protocol-level change rather than a new storage device or post-thaw rescue treatment.",
      ],
    },
    {
      id: "protocol",
      label: "§ PROTOCOL",
      title: "Protocol",
      content: [
        "Prepare matched HeLa cultures at 70–80% confluence and randomize flasks into control and trehalose treatment arms.",
        "Freeze cells at 1°C/minute to -80°C, transfer to liquid nitrogen vapor phase, then thaw matched vials at week 1, week 3, and week 6.",
        "Quantify viability with trypan blue exclusion and confirm with ATP luminescence assay after 24 hours of recovery.",
      ],
    },
    {
      id: "materials",
      label: "§ MATERIALS",
      title: "Materials",
      content: [
        "HeLa cell stock, DMEM, fetal bovine serum, DMSO, sucrose, trehalose dihydrate, cryovials, controlled-rate freezing container, viability assay reagent, and sterile filtration supplies.",
        "Instrumentation: biosafety cabinet, CO2 incubator, centrifuge, automated cell counter, luminometer, liquid nitrogen storage, and temperature logger.",
      ],
    },
    {
      id: "budget",
      label: "§ BUDGET",
      title: "Budget",
      content: [
        "Estimated consumables: EUR 2,140. Assay reagents: EUR 1,320. Cell culture and storage overhead: EUR 900. Personnel allocation: EUR 1,500.",
        "Total projected direct cost is EUR 5,860 with a 12% contingency reserved for repeat thaw batches.",
      ],
    },
    {
      id: "timeline",
      label: "§ TIMELINE",
      title: "Timeline",
      content: [
        "Week 1: reagent preparation, osmolarity confirmation, pilot freeze. Weeks 2–4: production freeze and scheduled thaw assessments.",
        "Weeks 5–6: final thaw, viability analysis, statistical review, and decision package preparation.",
      ],
    },
    {
      id: "validation",
      label: "§ VALIDATION",
      title: "Validation",
      content: [
        "Use n=6 vials per condition per timepoint. Analyze the primary endpoint with a two-sided Welch t-test and report confidence intervals for viability delta.",
        "Success criterion is a reproducible improvement of at least 15 percentage points without detectable proliferation penalty at 24 hours.",
      ],
    },
  ],
  citations: [
    "Crowe et al. 2001 — Trehalose and anhydrobiosis in membrane systems.",
    "Eroglu et al. 2000 — Intracellular trehalose improves mammalian cell cryosurvival.",
    "Hubálek 2003 — Protectants used in the cryopreservation of microorganisms.",
    "Meryman 2007 — Cryopreservation of living cells: principles and practice.",
  ],
  comments: [
    "Confirm trehalose osmolarity before freezing medium release.",
    "Keep thaw operators blinded to condition labels.",
    "Add morphology image capture if attachment diverges from viability.",
  ],
  papers: [
    {
      id: "p1",
      title: "Trehalose and membrane stabilization during freezing",
      authors: "Crowe, Carpenter, Crowe",
      year: 2001,
      abstract:
        "Trehalose preserves membrane structure during dehydration and freezing by replacing water at phospholipid headgroups and suppressing phase transitions.",
      x: 120,
      y: 140,
    },
    {
      id: "p2",
      title: "Intracellular trehalose improves mammalian cell cryosurvival",
      authors: "Eroglu, Russo, Bieganski",
      year: 2000,
      abstract:
        "Delivery of trehalose into mammalian cells improved recovery after cryogenic storage and reduced membrane damage during thaw.",
      x: 340,
      y: 90,
    },
    {
      id: "p3",
      title: "Cryoprotectants in biological preservation",
      authors: "Hubálek",
      year: 2003,
      abstract:
        "A comparative review of permeating and non-permeating cryoprotectants across microbial and mammalian systems.",
      x: 560,
      y: 170,
    },
    {
      id: "p4",
      title: "Controlled-rate freezing protocols for adherent cell lines",
      authors: "Ishikawa, North, Patel",
      year: 2015,
      abstract:
        "Standardized cooling rates reduce inter-vial variation and clarify the effect size of freezing medium changes.",
      x: 240,
      y: 300,
    },
    {
      id: "p5",
      title: "Osmotic stress thresholds in HeLa recovery",
      authors: "Mendez, Al-Khatib",
      year: 2018,
      abstract:
        "Post-thaw attachment and ATP recovery are sensitive to osmolarity changes introduced by non-permeating solutes.",
      x: 500,
      y: 340,
    },
    {
      id: "p6",
      title: "Viability assays after cryogenic storage",
      authors: "Bauer, Singh, Moretti",
      year: 2020,
      abstract:
        "Pairing dye exclusion with metabolic assays improves confidence when evaluating cryoprotectant interventions.",
      x: 720,
      y: 270,
    },
    {
      id: "p7",
      title: "DMSO-sparing freezing media for epithelial cell lines",
      authors: "Ko and Yamamoto",
      year: 2022,
      abstract:
        "Alternative solute systems can reduce toxicity while preserving attachment, but require careful dose matching.",
      x: 760,
      y: 90,
    },
    {
      id: "p8",
      title: "Statistical design for small-batch cell culture experiments",
      authors: "Reed, Olsen",
      year: 2019,
      abstract:
        "Replicate structure and batch randomization are central to interpreting modest viability improvements.",
      x: 100,
      y: 390,
    },
  ],
  edges: [
    { id: "e1", source: "p1", target: "p2" },
    { id: "e2", source: "p2", target: "p3" },
    { id: "e3", source: "p2", target: "p4" },
    { id: "e4", source: "p4", target: "p5" },
    { id: "e5", source: "p5", target: "p6" },
    { id: "e6", source: "p3", target: "p7" },
    { id: "e7", source: "p8", target: "p4" },
    { id: "e8", source: "p1", target: "p5" },
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
};