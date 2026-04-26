import { readFileSync } from 'fs';
import { join } from 'path';

interface CatalogEntry {
  id: string;
  name: string;
  supplier: string;
  catalogNumber: string;
  packageSize: string;
  priceEur: number;
  supplierUrl: string;
  necessity: 'indispensable' | 'recommended' | 'optional';
  applicableExperimentTypes: string[];
  domain: string[];
  notes: string;
}

function loadCatalog(): CatalogEntry[] {
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'catalog.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function findRelevantReagents(
  hypothesis: string,
  experimentType?: string,
  domains?: string[]
): CatalogEntry[] {
  const entries = loadCatalog();
  if (entries.length === 0) return [];

  const keywords = hypothesis.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  const scored = entries
    .map((entry) => {
      const nameText = entry.name.toLowerCase();
      const notesText = entry.notes.toLowerCase();
      let score = 0;

      // Keyword match on name (high weight) and notes
      score += keywords.filter((kw) => nameText.includes(kw)).length * 2;
      score += keywords.filter((kw) => notesText.includes(kw)).length;

      // Necessity boost: indispensable items surface first
      if (entry.necessity === 'indispensable') score += 4;
      else if (entry.necessity === 'recommended') score += 1;

      // Experiment type boost
      if (experimentType) {
        if (entry.applicableExperimentTypes.includes(experimentType)) score += 3;
      } else {
        const h = hypothesis.toLowerCase();
        for (const et of entry.applicableExperimentTypes) {
          if (h.includes(et.replace('_', ' ')) || h.includes(et)) score += 1;
        }
      }

      // Domain boost
      if (domains) {
        score += domains.filter((d) => entry.domain.includes(d)).length * 2;
      } else {
        for (const d of entry.domain) {
          if (keywords.some((kw) => d.includes(kw) || kw.includes(d.replace('_', '')))) score += 1;
        }
      }

      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ entry }) => entry);

  return scored.length > 0 ? scored : entries.slice(0, 10);
}

export function getCatalogContext(hypothesis: string): string {
  const results = findRelevantReagents(hypothesis);
  return results
    .map(
      (e) =>
        `- [${(e.necessity ?? 'recommended').toUpperCase()}] ${e.name} | ${e.supplier} | Cat# ${e.catalogNumber} | ${e.packageSize} | €${e.priceEur} | ${e.supplierUrl}`
    )
    .join('\n');
}
