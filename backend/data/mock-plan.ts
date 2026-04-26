import { ExperimentPlanSchema, type ExperimentPlan } from '@/lib/schema';

export const MOCK_PLAN: ExperimentPlan = {
  hypothesis:
    "Replacing sucrose with trehalose as a cryoprotectant in the freezing medium will increase post-thaw viability of HeLa cells by at least 15 percentage points compared to the standard DMSO protocol.",
  summary:
    "A 6-week comparative cryopreservation study testing trehalose-based freezing medium against the standard DMSO protocol on HeLa CCL-2 cells, measured by trypan blue exclusion and recovery growth curves.",
  noveltyCheck: {
    status: 'similar_exists',
    rationale:
      "Trehalose has been studied as a cryoprotectant in multiple cell types, with prior work in HeLa cells showing modest improvements. The 15 percentage point threshold is more aggressive than published baselines.",
    references: [
      {
        title: "Trehalose as a cryoprotectant for mammalian cell lines",
        url: "https://www.protocols.io/view/example-trehalose-cryo",
        year: 2021,
        source: 'protocols.io',
      },
      {
        title: "Comparative analysis of cryoprotective agents",
        url: "https://pubmed.ncbi.nlm.nih.gov/example",
        year: 2022,
        source: 'PubMed',
      },
    ],
  },
  assumptions: [
    "Lab has access to a -80°C freezer and liquid nitrogen storage",
    "Standard cell culture facilities (BSL-2, biosafety cabinet, CO2 incubator)",
    "HeLa cells acquired fresh from ATCC, no prior passage history",
    "Trypan blue and FACS available for viability assays",
  ],
  protocol: [
    {
      step: 1,
      title: "Prepare cell culture",
      description:
        "Thaw HeLa CCL-2 vial, transfer to T75 flask with 15 mL DMEM + 10% FBS + 1% Pen/Strep. Incubate at 37°C, 5% CO2 until 80% confluence (approximately 3-4 days).",
      durationMinutes: 5760,
      protocolRefs: ["10.17504/protocols.io.example1"],
    },
    {
      step: 2,
      title: "Prepare cryoprotectant solutions",
      description:
        "Prepare two freezing media: (A) 10% DMSO in FBS, (B) 0.5M trehalose + 5% DMSO in FBS. Filter sterilize through 0.22 µm filter. Pre-chill to 4°C.",
      durationMinutes: 30,
      protocolRefs: ["10.17504/protocols.io.example2"],
    },
    {
      step: 3,
      title: "Harvest and aliquot cells",
      description:
        "Trypsinize cells, count via hemocytometer. Resuspend at 1×10^6 cells/mL in each freezing medium. Aliquot 1 mL per cryovial, 12 vials per condition.",
      durationMinutes: 60,
      protocolRefs: ["10.17504/protocols.io.example3"],
    },
    {
      step: 4,
      title: "Controlled freeze",
      description:
        "Place vials in Mr. Frosty container, transfer to -80°C overnight. Move to liquid nitrogen the next morning. Store for 7 days minimum.",
      durationMinutes: 1440,
      protocolRefs: ["10.17504/protocols.io.example4"],
    },
    {
      step: 5,
      title: "Thaw and viability assay",
      description:
        "Rapid thaw in 37°C water bath, transfer to pre-warmed DMEM. Centrifuge 200×g 5 min. Resuspend, count viable cells via trypan blue exclusion. n=12 per condition.",
      durationMinutes: 90,
      protocolRefs: ["10.17504/protocols.io.example5"],
    },
    {
      step: 6,
      title: "Recovery growth curve",
      description:
        "Seed 5×10^4 thawed cells per well in 6-well plates. Count daily for 7 days. Calculate doubling time and recovery efficiency vs. fresh control.",
      durationMinutes: 10080,
      protocolRefs: ["10.17504/protocols.io.example6"],
    },
  ],
  materials: [
    {
      name: "HeLa CCL-2 cells",
      supplier: 'ATCC',
      catalogNumber: "CCL-2",
      packageSize: "1 vial, ~1×10^6 cells",
      quantity: "1 vial",
      priceEur: 647,
      supplierUrl: "https://www.atcc.org/products/ccl-2",
    },
    {
      name: "D-(+)-Trehalose dihydrate ≥99%",
      supplier: 'Sigma-Aldrich',
      catalogNumber: "T9531",
      packageSize: "100 g",
      quantity: "100 g",
      priceEur: 142,
      supplierUrl: "https://www.sigmaaldrich.com/T9531",
    },
    {
      name: "Dimethyl sulfoxide (DMSO), cell culture grade",
      supplier: 'Sigma-Aldrich',
      catalogNumber: "D2650",
      packageSize: "100 mL",
      quantity: "50 mL",
      priceEur: 78,
      supplierUrl: "https://www.sigmaaldrich.com/D2650",
    },
    {
      name: "DMEM, high glucose",
      supplier: 'Thermo Fisher',
      catalogNumber: "11965092",
      packageSize: "500 mL",
      quantity: "1 L",
      priceEur: 32,
      supplierUrl: "https://www.thermofisher.com/11965092",
    },
    {
      name: "Fetal Bovine Serum",
      supplier: 'Thermo Fisher',
      catalogNumber: "10500064",
      packageSize: "500 mL",
      quantity: "100 mL",
      priceEur: 410,
      supplierUrl: "https://www.thermofisher.com/10500064",
    },
    {
      name: "Trypan Blue stain 0.4%",
      supplier: 'Thermo Fisher',
      catalogNumber: "T10282",
      packageSize: "100 mL",
      quantity: "100 mL",
      priceEur: 45,
      supplierUrl: "https://www.thermofisher.com/T10282",
    },
  ],
  equipment: [
    { name: "Biosafety Cabinet Class II", required: true, notes: "BSL-2 standard" },
    { name: "CO2 Incubator (37°C, 5% CO2)", required: true, notes: "" },
    { name: "Mr. Frosty freezing container", required: true, notes: "Or equivalent controlled-rate cooler" },
    { name: "-80°C freezer", required: true, notes: "" },
    { name: "Liquid nitrogen storage", required: true, notes: "Long-term storage" },
    { name: "Hemocytometer", required: true, notes: "Or automated cell counter" },
    { name: "37°C water bath", required: true, notes: "For rapid thawing" },
  ],
  budget: {
    lines: [
      { category: 'cell_lines', lineItem: "HeLa CCL-2 from ATCC", amountEur: 647, notes: "Single vial, includes shipping" },
      { category: 'reagents', lineItem: "Cryoprotectants (trehalose + DMSO)", amountEur: 220, notes: "" },
      { category: 'reagents', lineItem: "Cell culture media + FBS", amountEur: 442, notes: "Sufficient for 6-week project" },
      { category: 'consumables', lineItem: "Cryovials, pipettes, plates", amountEur: 380, notes: "Bulk consumables" },
      { category: 'consumables', lineItem: "Filter units, syringes", amountEur: 95, notes: "" },
      { category: 'equipment_time', lineItem: "Liquid nitrogen storage (6 weeks)", amountEur: 240, notes: "Facility charge" },
      { category: 'labor', lineItem: "Postdoc time (40 hours @ €40/h)", amountEur: 1600, notes: "Protocol execution + analysis" },
      { category: 'labor', lineItem: "Technician time (60 hours @ €25/h)", amountEur: 1500, notes: "Cell culture maintenance" },
      { category: 'overhead', lineItem: "Institutional overhead 12%", amountEur: 736, notes: "" },
    ],
    totalEur: 5860,
    contingencyPercent: 12,
  },
  timeline: {
    phases: [
      { phase: "Setup & material acquisition", weeks: 1, dependsOn: null, deliverable: "All reagents and cells in lab, validated", keyMilestone: "Cells thawed and growing" },
      { phase: "Protocol execution", weeks: 2, dependsOn: "Setup & material acquisition", deliverable: "12 cryovials per condition stored", keyMilestone: "Day 0 freeze complete" },
      { phase: "Cryostorage hold", weeks: 1, dependsOn: "Protocol execution", deliverable: "7-day minimum storage in LN2", keyMilestone: "Storage period complete" },
      { phase: "Thaw & viability assays", weeks: 1, dependsOn: "Cryostorage hold", deliverable: "Viability data n=12 per condition", keyMilestone: "Trypan blue counts collected" },
      { phase: "Recovery & analysis", weeks: 1, dependsOn: "Thaw & viability assays", deliverable: "Final report with statistics", keyMilestone: "Effect size calculated, p-value reported" },
    ],
    totalWeeks: 6,
  },
  validation: [
    {
      metric: "Post-thaw viability (trypan blue)",
      threshold: "≥15 percentage points improvement vs DMSO control",
      method: "Trypan blue exclusion, hemocytometer count, n=12 per condition",
      successCondition: "Trehalose condition shows mean viability at least 15pp above DMSO control with p<0.05 (two-tailed t-test)",
    },
    {
      metric: "Recovery doubling time",
      threshold: "Within 10% of fresh control",
      method: "Daily cell counts over 7-day post-thaw period, exponential fit",
      successCondition: "Both conditions recover normal proliferation, no significant lag",
    },
  ],
  risks: [
    {
      description: "Trehalose precipitation at low temperature affecting cell uptake",
      likelihood: 'medium',
      mitigation: "Pre-warm trehalose stock, use 0.22 µm filter immediately before use",
    },
    {
      description: "HeLa cell heterogeneity introduces variance larger than effect size",
      likelihood: 'medium',
      mitigation: "Use single-passage cells from same vial, increase n to 12 per condition for statistical power",
    },
    {
      description: "Unrealistic 15pp threshold - prior literature shows 5-10pp typical",
      likelihood: 'high',
      mitigation: "Pre-register secondary endpoint at 10pp; consider as positive result if seen",
    },
  ],
};

// Validate the mock at module load. If schema changes, build fails loudly.
ExperimentPlanSchema.parse(MOCK_PLAN);
