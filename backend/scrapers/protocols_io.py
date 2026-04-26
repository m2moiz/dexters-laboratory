"""
protocols.io scraper.

Public API v3 — free read access to public protocols.
Get a free token at: https://www.protocols.io/developers
Set env var PROTOCOLS_IO_TOKEN or pass --token flag.

Without a token the scraper tries unauthenticated calls (works for some
public endpoints but is rate-limited to ~10 req/min).

Output schema (protocols.json entry):
  id, title, source, doi, url, year, domain, experimentType, summary, keyParameters
"""
import json
import logging
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import make_session, polite_get, next_id, deduplicate
from config import PROTOCOL_TOPICS as PROTOCOL_QUERIES, EXPERIMENT_TYPE_MAP as EXPERIMENT_TYPES

log = logging.getLogger("protocols_io")

API_BASE = "https://www.protocols.io/api/v3"
SOURCE_LABEL = "protocols.io"


def _auth_headers(token: str | None) -> dict:
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def search_protocols(
    query: str,
    session,
    token: str | None,
    page_size: int = 10,
) -> list[dict]:
    """Search protocols.io and return raw API items."""
    url = f"{API_BASE}/protocols"
    params = {
        "key": query,          # API uses 'key', not 'search_query'
        "filter": "public",
        "page_id": 1,
        "page_size": page_size,
        "order_field": "activity",
        "order_dir": "desc",
    }
    resp = polite_get(
        session, url, params=params,
        extra_headers=_auth_headers(token),
        min_delay=1.5, max_delay=3.0,
    )
    if resp is None:
        return []
    try:
        data = resp.json()
        return data.get("items", [])
    except Exception as exc:
        log.warning("JSON parse error for query '%s': %s", query, exc)
        return []


def _extract_year(item: dict) -> int | None:
    for field in ("published_on", "created_on", "changed_on"):
        val = item.get(field)
        if val:
            m = re.search(r"(\d{4})", str(val))
            if m:
                return int(m.group(1))
    return None


def _extract_doi(item: dict) -> str | None:
    doi = item.get("doi") or item.get("slug") or ""
    if doi and ("protocols.io" in doi or doi.startswith("dx.doi")):
        return doi
    uri = item.get("uri", "")
    if "protocols.io" in uri:
        return f"dx.doi.org/10.17504/protocols.io.{uri.split('/')[-1]}"
    return None


def _infer_domain(title: str, desc: str) -> str:
    text = (title + " " + desc).lower()
    if any(k in text for k in ["hela", "cryopreserv", "trehalose", "dmso freeze", "cell viab"]):
        return "cell_biology"
    if any(k in text for k in ["fitc-dextran", "gut", "intestin", "probiotic", "claudin", "occludin", "lactobacillus"]):
        return "gut_health"
    if any(k in text for k in ["crp", "biosensor", "electrochemical", "immunoassay", "lateral flow", "elisa"]):
        return "diagnostics"
    if any(k in text for k in ["sporomusa", "co2", "bioelectrochemical", "acetate", "cathode", "carbon capture"]):
        return "climate"
    return "cell_biology"


def _extract_key_parameters(item: dict) -> list[str]:
    """Best-effort extraction of key protocol parameters."""
    params = []
    desc = item.get("description", "") or ""
    # Look for numbered steps or bullet points in description (markdown)
    lines = desc.splitlines()
    for line in lines:
        line = line.strip()
        if re.match(r"^\d+[\.\)]\s+", line) or line.startswith("- "):
            cleaned = re.sub(r"^\d+[\.\)]\s+|- ", "", line).strip()
            if 10 < len(cleaned) < 120:
                params.append(cleaned)
        if len(params) >= 5:
            break
    if not params:
        # fallback: first 3 non-empty sentences
        sentences = re.split(r"(?<=[.!?])\s+", desc)
        for s in sentences:
            s = s.strip()
            if len(s) > 20:
                params.append(s[:100])
            if len(params) >= 3:
                break
    return params[:5]


def item_to_protocol(item: dict, domain: str, existing: list[dict]) -> dict:
    from base import (extract_metrics, extract_reagents, extract_equipment,
                      infer_tags, count_steps, infer_domain, infer_experiment_type)
    title = item.get("title", "Untitled protocol")
    desc = item.get("description", "") or ""
    url = item.get("url", "") or f"https://www.protocols.io/view/{item.get('uri', '')}"
    doi = _extract_doi(item)
    year = _extract_year(item)

    text = desc
    domains = infer_domain(title, text) or [domain]
    exp_type = infer_experiment_type(domains[0], text)
    metrics = extract_metrics(text)
    reagents = extract_reagents(text)
    equipment = extract_equipment(text)
    tags = infer_tags(title, text)
    steps = count_steps(text)

    # Authors
    authors = []
    for a in item.get("authors", [])[:4]:
        name = a.get("name", "") if isinstance(a, dict) else str(a)
        if name:
            authors.append(name)

    summary = desc[:280].replace("\n", " ").strip() or title

    return {
        "id": next_id("PROT-", existing),
        "title": title[:120],
        "source": SOURCE_LABEL,
        "doi": doi,
        "url": url,
        "year": year,
        "domain": domains,
        "experimentType": exp_type,
        "summary": summary,
        "keyParameters": _extract_key_parameters(item),
        "authors": authors,
        "institution": "",
        "tags": tags,
        "stepCount": steps if steps > 0 else None,
        "reagentsUsed": reagents,
        "equipmentNeeded": equipment,
        "metrics": metrics,
    }


def scrape(
    existing_protocols: list[dict],
    token: str | None = None,
    max_per_query: int = 8,
) -> list[dict]:
    token = token or os.environ.get("PROTOCOLS_IO_TOKEN")
    if not token:
        log.info("No PROTOCOLS_IO_TOKEN set — using unauthenticated calls (rate-limited)")

    session = make_session()
    accumulated = list(existing_protocols)
    new_entries = []

    existing_urls = {p.get("url") for p in existing_protocols}

    from config import PROTOCOLS_IO_TOPICS
    # Merge the configured topics with the broader flat list
    all_topics_by_domain = {**PROTOCOL_QUERIES}
    # Also run a flat list of short topics for maximum breadth
    flat_topics = [(t, "cell_biology") for t in PROTOCOLS_IO_TOPICS[:60]]

    for domain, queries in all_topics_by_domain.items():
        for query in queries:
            log.info("[protocols.io] Searching: %s (domain=%s)", query, domain)
            items = search_protocols(query, session, token, page_size=max_per_query)
            for item in items:
                url = item.get("url", "")
                if url in existing_urls:
                    continue
                proto = item_to_protocol(item, domain, accumulated)
                accumulated.append(proto)
                new_entries.append(proto)
                existing_urls.add(url)

    log.info("[protocols.io] Done — %d new protocols scraped", len(new_entries))
    return new_entries


if __name__ == "__main__":
    import argparse, json
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Scrape protocols.io")
    parser.add_argument("--token", help="protocols.io access token (or set PROTOCOLS_IO_TOKEN env var)")
    parser.add_argument("--out", default="../protocols.json", help="output file path")
    parser.add_argument("--max-per-query", type=int, default=8)
    args = parser.parse_args()

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []

    new_entries = scrape(existing, token=args.token, max_per_query=args.max_per_query)

    merged = deduplicate(existing + new_entries, key="url")
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"✓ protocols.json updated — {len(merged)} total entries ({len(new_entries)} new)")
