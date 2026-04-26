interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  results: TavilyResult[];
}

export async function searchPapers(hypothesis: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return '';

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: 'scientific paper ' + hypothesis,
        search_depth: 'advanced',
        max_results: 8,
        include_domains: [
          'pubmed.ncbi.nlm.nih.gov',
          'arxiv.org',
          'biorxiv.org',
          'protocols.io',
        ],
      }),
    });

    if (!res.ok) return '';

    const data: TavilyResponse = await res.json();

    return data.results
      .map((r) => `- ${r.title} (${r.url}): ${r.content.slice(0, 200)}`)
      .join('\n');
  } catch {
    return '';
  }
}
