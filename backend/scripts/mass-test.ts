import { readFileSync } from 'fs';
import { join } from 'path';
import { ExperimentPlanSchema } from '../lib/schema';

interface TestHypothesis {
  id: string;
  title: string;
  domain: string;
  experimentType: string;
  hypothesis: string;
  expectedNovelty: 'novel' | 'similar_exists' | 'exact_match';
  demoPriority: number;
  notes: string;
}

interface CatalogEntry {
  id: string;
  name: string;
  catalogNumber: string;
}

const url = process.env.DEPLOY_URL ?? 'http://localhost:3000';

function loadTestHypotheses(): TestHypothesis[] {
  const raw = readFileSync(join(process.cwd(), 'data', 'test_hypotheses.json'), 'utf-8');
  return JSON.parse(raw);
}

function loadCatalog(): CatalogEntry[] {
  const raw = readFileSync(join(process.cwd(), 'data', 'catalog.json'), 'utf-8');
  return JSON.parse(raw);
}

async function testHypothesis(
  hypo: TestHypothesis,
  catalog: CatalogEntry[]
): Promise<{ passed: boolean; schemaOk: boolean; noveltyOk: boolean; catalogWarnings: number }> {
  console.log(`\n[${hypo.id}] ${hypo.title}`);

  const res = await fetch(`${url}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hypothesis: hypo.hypothesis }),
  });

  if (!res.ok) {
    console.error(`  ✗ HTTP ${res.status}: ${await res.text()}`);
    return { passed: false, schemaOk: false, noveltyOk: false, catalogWarnings: 0 };
  }

  const json = await res.json();

  // 1. Schema validation
  const result = ExperimentPlanSchema.safeParse(json);
  if (!result.success) {
    console.error('  ✗ Schema violation:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    return { passed: false, schemaOk: false, noveltyOk: false, catalogWarnings: 0 };
  }

  const plan = result.data;
  console.log(
    `  ✓ Schema valid — ${plan.protocol.length} steps, ${plan.materials.length} materials, €${plan.budget.totalEur}, ${plan.timeline.totalWeeks}w`
  );

  // 2. Catalog validation — check each material against catalog by catalogNumber or name prefix
  const catalogNumbers = new Set(catalog.map((e) => e.catalogNumber));
  const catalogNames = catalog.map((e) => e.name.toLowerCase());
  let catalogWarnings = 0;

  for (const mat of plan.materials) {
    const byNumber = catalogNumbers.has(mat.catalogNumber);
    const byName = catalogNames.some((n) =>
      n.includes(mat.name.toLowerCase().slice(0, 12).trim())
    );
    if (!byNumber && !byName) {
      console.warn(`  ⚠ Not in catalog: "${mat.name}" (Cat# ${mat.catalogNumber})`);
      catalogWarnings++;
    }
  }
  if (catalogWarnings === 0) {
    console.log(`  ✓ All ${plan.materials.length} materials found in catalog`);
  } else {
    console.log(
      `  ⚠ ${catalogWarnings}/${plan.materials.length} materials not matched in catalog`
    );
  }

  // 3. Novelty coherence check
  const actualNovelty = plan.noveltyCheck.status;
  const noveltyOk = actualNovelty === hypo.expectedNovelty;
  if (noveltyOk) {
    console.log(`  ✓ Novelty signal matches: "${actualNovelty}"`);
  } else {
    console.warn(
      `  ⚠ Novelty mismatch: expected="${hypo.expectedNovelty}", got="${actualNovelty}"`
    );
    console.warn(`    ${plan.noveltyCheck.rationale.slice(0, 120)}...`);
  }

  return { passed: true, schemaOk: true, noveltyOk, catalogWarnings };
}

async function main() {
  const hypotheses = loadTestHypotheses();
  const catalog = loadCatalog();

  console.log(`Mass test — ${hypotheses.length} hypotheses → ${url}/api/plan`);
  console.log('='.repeat(65));

  let schemaPassed = 0;
  let schemaFailed = 0;
  let noveltyMatched = 0;
  let totalCatalogWarnings = 0;

  for (const hypo of hypotheses) {
    const r = await testHypothesis(hypo, catalog);
    if (r.schemaOk) schemaPassed++;
    else schemaFailed++;
    if (r.noveltyOk) noveltyMatched++;
    totalCatalogWarnings += r.catalogWarnings;
  }

  console.log('\n' + '='.repeat(65));
  console.log(`Schema:   ${schemaPassed}/${hypotheses.length} passed${schemaFailed > 0 ? ` (${schemaFailed} FAILED)` : ''}`);
  console.log(`Novelty:  ${noveltyMatched}/${hypotheses.length} matched expected`);
  console.log(`Catalog:  ${totalCatalogWarnings} unmatched material(s) across all plans`);

  if (schemaFailed > 0) {
    console.error('\nContract violated — schema failures detected.');
    process.exit(1);
  }

  console.log('\nAll schema contracts OK ✓');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
