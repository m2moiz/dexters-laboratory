/**
 * Validation script for real OpenAI responses.
 * Run after setting OPENAI_API_KEY in .env.local and starting the dev server.
 *
 * Usage:
 *   npx tsx scripts/validate-real.ts
 *   HYPOTHESIS="your hypothesis here" npx tsx scripts/validate-real.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ExperimentPlanSchema, type ExperimentPlan } from '../lib/schema';

const url = process.env.DEPLOY_URL ?? 'http://localhost:3000';
const hypothesis =
  process.env.HYPOTHESIS ??
  'Replacing DMSO with trehalose as a cryoprotectant in HeLa cell freezing medium will increase post-thaw viability by at least 15 percentage points.';

interface CatalogEntry {
  id: string;
  name: string;
  catalogNumber: string;
  supplier: string;
  priceEur: number;
}

interface Protocol {
  id: string;
  title: string;
  doi: string;
  source: string;
}

interface BudgetConstants {
  laborRates: Record<string, number>;
  equipmentTimeRates: Record<string, number>;
  contingencyPercentRecommended: number;
}

function load<T>(file: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), 'data', file), 'utf-8'));
}

// ── helpers ──────────────────────────────────────────────────────────────────

function checkCatalog(plan: ExperimentPlan, catalog: CatalogEntry[]) {
  console.log('\n━━━ 1. CATALOG NUMBERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const byNumber = new Map(catalog.map((e) => [e.catalogNumber, e]));
  const byName = catalog.map((e) => ({ name: e.name.toLowerCase(), entry: e }));

  let exact = 0;
  let nameMatch = 0;
  let unknown = 0;

  for (const mat of plan.materials) {
    const hit = byNumber.get(mat.catalogNumber);
    if (hit) {
      console.log(`  ✓ ${mat.name}`);
      console.log(`    Cat# ${mat.catalogNumber} → found in catalog (${hit.supplier}, €${hit.priceEur})`);
      exact++;
    } else {
      const fuzzy = byName.find((e) => e.name.includes(mat.name.toLowerCase().slice(0, 15).trim()));
      if (fuzzy) {
        console.log(`  ~ ${mat.name}`);
        console.log(`    Cat# ${mat.catalogNumber} → NOT in catalog, but name matches "${fuzzy.entry.name}"`);
        nameMatch++;
      } else {
        console.log(`  ✗ ${mat.name}`);
        console.log(`    Cat# ${mat.catalogNumber} → NOT FOUND in catalog`);
        unknown++;
      }
    }
  }

  console.log(`\n  Result: ${exact} exact | ${nameMatch} name-only | ${unknown} unknown (out of ${plan.materials.length})`);
  if (unknown > 0) console.log(`  ⚠ ${unknown} material(s) likely invented by LLM`);
  return { exact, nameMatch, unknown };
}

function checkDois(plan: ExperimentPlan, protocols: Protocol[]) {
  console.log('\n━━━ 2. PROTOCOL REFS / DOIs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const knownDois = new Set(protocols.map((p) => p.doi.toLowerCase()));
  const looksLikeDoi = /10\.\d{4,}\/\S+/;

  let real = 0;
  let freeText = 0;
  let hallucinated = 0;
  const seen = new Set<string>();

  for (const step of plan.protocol) {
    if (step.protocolRefs.length === 0) continue;
    console.log(`  Step ${step.step} — ${step.title}`);
    for (const ref of step.protocolRefs) {
      const r = ref.toLowerCase();
      if (seen.has(r)) continue;
      seen.add(r);

      const matchedDoi = Array.from(knownDois).find((doi) => r.includes(doi));
      if (matchedDoi) {
        const proto = protocols.find((p) => p.doi.toLowerCase() === matchedDoi);
        console.log(`    ✓ ${ref}`);
        if (proto) console.log(`      → "${proto.title}" (${proto.source})`);
        real++;
      } else if (looksLikeDoi.test(r)) {
        console.log(`    ✗ ${ref}`);
        console.log(`      → DOI pattern but NOT in protocols.json — hallucination`);
        hallucinated++;
      } else {
        console.log(`    · ${ref} (free text)`);
        freeText++;
      }
    }
  }

  console.log(`\n  Result: ${real} real DOIs | ${freeText} free-text | ${hallucinated} hallucinated`);
  if (hallucinated > 0) console.log(`  ⚠ sanitizeProtocolRefs should have caught these — check generate-plan.ts`);
  return { real, freeText, hallucinated };
}

function checkBudget(plan: ExperimentPlan, constants: BudgetConstants) {
  console.log('\n━━━ 3. BUDGET REALISM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const rates = {
    ...constants.laborRates,
    ...constants.equipmentTimeRates,
  };

  let directSum = 0;
  let suspiciousLines = 0;

  for (const line of plan.budget.lines) {
    directSum += line.amountEur;

    // Flag suspiciously round numbers > €500 on labor/equipment lines
    const isRound = line.amountEur % 100 === 0 && line.amountEur > 500;
    const isLaborOrEquipment = ['labor', 'equipment_time'].includes(line.category);
    const suspicious = isRound && isLaborOrEquipment;

    const flag = suspicious ? ' ⚠ round number' : '';
    console.log(`  ${line.category.padEnd(16)} €${String(line.amountEur).padStart(6)}  ${line.lineItem}${flag}`);
    if (suspicious) suspiciousLines++;
  }

  const contingencyFactor = 1 + plan.budget.contingencyPercent / 100;
  const expectedTotal = Math.round(directSum * contingencyFactor);
  const reportedTotal = plan.budget.totalEur;
  const totalMatch = Math.abs(reportedTotal - expectedTotal) <= 50;

  console.log(`\n  Direct sum:       €${directSum}`);
  console.log(`  Contingency:      ${plan.budget.contingencyPercent}%`);
  console.log(`  Expected total:   €${expectedTotal}`);
  console.log(`  Reported total:   €${reportedTotal}  ${totalMatch ? '✓ consistent' : '✗ MISMATCH'}`);
  console.log(`  Known rates used: ${Object.entries(rates).map(([k, v]) => `${k.split('_')[0]}=€${v}`).join(', ')}`);

  if (suspiciousLines > 0)
    console.log(`  ⚠ ${suspiciousLines} labor/equipment line(s) are suspiciously round — may be invented`);
  if (!totalMatch)
    console.log(`  ⚠ Total doesn't match sum×contingency — LLM may have invented the total`);

  return { directSum, reportedTotal, totalMatch, suspiciousLines };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Validation Report — Real LLM Output');
  console.log('====================================================');
  console.log(`Endpoint : ${url}/api/plan`);
  console.log(`Hypothesis: ${hypothesis.slice(0, 80)}...`);

  const res = await fetch(`${url}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hypothesis }),
  });

  if (!res.ok) {
    console.error(`\nHTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const json = await res.json();
  const result = ExperimentPlanSchema.safeParse(json);

  if (!result.success) {
    console.error('\n✗ Schema violation — this is the mock plan or a broken response:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  const plan = result.data;
  console.log(`\nSchema : ✓ valid`);
  console.log(`Novelty: ${plan.noveltyCheck.status} — ${plan.noveltyCheck.rationale.slice(0, 80)}...`);

  const catalog = load<CatalogEntry[]>('catalog.json');
  const protocols = load<Protocol[]>('protocols.json');
  const constants = load<BudgetConstants>('budget_constants.json');

  const cat = checkCatalog(plan, catalog);
  const doi = checkDois(plan, protocols);
  const bud = checkBudget(plan, constants);

  console.log('\n====================================================');
  console.log('SUMMARY');
  console.log(`  Catalog   ${cat.unknown === 0 ? '✓' : '✗'}  ${cat.exact}/${plan.materials.length} exact matches`);
  console.log(`  DOIs      ${doi.hallucinated === 0 ? '✓' : '✗'}  ${doi.real} real, ${doi.hallucinated} hallucinated`);
  console.log(`  Budget    ${bud.totalMatch ? '✓' : '✗'}  total ${bud.totalMatch ? 'consistent' : 'MISMATCH'}, ${bud.suspiciousLines} suspicious lines`);

  const credible = cat.unknown === 0 && doi.hallucinated === 0 && bud.totalMatch;
  console.log(`\n  Scientific credibility: ${credible ? '✓ PASS' : '⚠ ISSUES FOUND'}`);
  process.exit(credible ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
