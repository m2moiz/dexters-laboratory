import { ExperimentPlanSchema } from '../lib/schema';

const url = process.env.DEPLOY_URL ?? 'http://localhost:3000';

async function main() {
  console.log(`Testing ${url}/api/plan ...`);

  const res = await fetch(`${url}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hypothesis: "Test: increasing dietary fiber improves gut microbiome diversity in mice over 4 weeks.",
    }),
  });

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const json = await res.json();
  const result = ExperimentPlanSchema.safeParse(json);

  if (!result.success) {
    console.error('Contract violated:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  console.log('Contract OK ✓');
  console.log(`Hypothesis: ${result.data.hypothesis}`);
  console.log(`Summary: ${result.data.summary}`);
  console.log(`Steps: ${result.data.protocol.length}`);
  console.log(`Materials: ${result.data.materials.length}`);
  console.log(`Total budget: €${result.data.budget.totalEur}`);
  console.log(`Total weeks: ${result.data.timeline.totalWeeks}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
