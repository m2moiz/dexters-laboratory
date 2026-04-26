"""
OpenWetWare scraper — community wiki protocols.
Uses the MediaWiki API (no auth needed, unlimited).
https://openwetware.org/api.php
"""
import json
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import (make_session, polite_get, next_id, deduplicate,
                  extract_metrics, extract_reagents, extract_equipment,
                  infer_tags, count_steps, infer_domain, infer_experiment_type)
from config import PROTOCOL_TOPICS

log = logging.getLogger("openwetware")
SOURCE = "OpenWetWare"
API_URL = "https://openwetware.org/w/api.php"   # /w/ path is the standard MediaWiki location
FALLBACK_DISABLED = True   # site appears to redirect to localhost — skip gracefully


def search_pages(query: str, session, limit: int = 10) -> list[dict]:
    """MediaWiki full-text search."""
    params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "srnamespace": "0",   # main namespace
        "srlimit": limit,
        "srprop": "snippet|titlesnippet|sectionsnippet",
        "format": "json",
    }
    resp = polite_get(session, API_URL, params=params, min_delay=0.5, max_delay=1.5)
    if resp is None:
        return []
    try:
        data = resp.json()
        return data.get("query", {}).get("search", [])
    except Exception as exc:
        log.debug("Search error '%s': %s", query, exc)
        return []


def fetch_page_content(title: str, session) -> dict:
    """Fetch wikitext + parse to plain text."""
    params = {
        "action": "query",
        "titles": title,
        "prop": "extracts|info",
        "exintro": False,       # include full content not just intro
        "explaintext": True,    # plain text, no HTML
        "exsectionformat": "plain",
        "inprop": "url",
        "format": "json",
    }
    resp = polite_get(session, API_URL, params=params, min_delay=0.4, max_delay=1.0)
    if resp is None:
        return {}
    try:
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        for page_id, page in pages.items():
            if page_id == "-1":
                continue
            return {
                "text": page.get("extract", "")[:3000],
                "url": page.get("fullurl", f"https://openwetware.org/wiki/{title.replace(' ', '_')}"),
            }
    except Exception as exc:
        log.debug("Page fetch error '%s': %s", title, exc)
    return {}


def page_to_protocol(search_result: dict, page_content: dict,
                     domain: str, existing: list[dict]) -> dict | None:
    title = search_result.get("title", "")
    if not title:
        return None

    text = page_content.get("text", "")
    url = page_content.get("url", f"https://openwetware.org/wiki/{title.replace(' ', '_')}")

    # Skip category/user/talk pages
    if any(x in title for x in ["Category:", "User:", "Talk:", "Template:", "Help:"]):
        return None

    # Use snippet as summary fallback
    snippet = re.sub(r"<[^>]+>", " ", search_result.get("snippet", "")).strip()
    summary = text[:280] if len(text) >= 20 else snippet[:280] or title[:280]
    if len(summary) < 10:
        summary = title[:280]

    domains = infer_domain(title, text) or [domain]
    exp_type = infer_experiment_type(domains[0], text)
    metrics = extract_metrics(text)
    reagents = extract_reagents(text)
    equipment = extract_equipment(text)
    tags = infer_tags(title, text)
    steps = count_steps(text)

    return {
        "id": next_id("PROT-", existing),
        "title": title[:120],
        "source": SOURCE,
        "doi": None,
        "url": url,
        "year": None,
        "domain": domains,
        "experimentType": exp_type,
        "summary": summary,
        "keyParameters": (
            metrics["temperatures"] + metrics["concentrations"] + metrics["durations"]
        )[:6],
        "authors": [],
        "institution": "",
        "tags": tags,
        "stepCount": steps if steps > 0 else None,
        "reagentsUsed": reagents,
        "equipmentNeeded": equipment,
        "metrics": metrics,
    }


def scrape(existing_protocols: list[dict], max_per_query: int = 10) -> list[dict]:
    if FALLBACK_DISABLED:
        log.info("[openwetware] Site currently unreachable — skipping")
        return []
    session = make_session()
    accumulated = list(existing_protocols)
    new_entries = []
    seen_urls = {p.get("url") for p in existing_protocols}

    # Flatten all topic lists and sample broadly
    all_topics = []
    for topics in PROTOCOL_TOPICS.values():
        all_topics.extend(topics)

    for topic in all_topics:
        log.info("[openwetware] Searching: %s", topic)
        results = search_pages(topic, session, limit=max_per_query)
        for result in results:
            title = result.get("title", "")
            url = f"https://openwetware.org/wiki/{title.replace(' ', '_')}"
            if url in seen_urls:
                continue
            page = fetch_page_content(title, session)
            if not page:
                continue
            actual_url = page.get("url", url)
            if actual_url in seen_urls:
                continue
            proto = page_to_protocol(result, page, "cell_biology", accumulated)
            if proto is None:
                continue
            accumulated.append(proto)
            new_entries.append(proto)
            seen_urls.add(actual_url)

    log.info("[openwetware] Done — %d new protocols", len(new_entries))
    return new_entries


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="../protocols.json")
    parser.add_argument("--max-per-query", type=int, default=10)
    args = parser.parse_args()

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []
    new_entries = scrape(existing, max_per_query=args.max_per_query)
    merged = deduplicate(existing + new_entries, key="url")
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"protocols.json: {len(merged)} total (+{len(new_entries)} from OpenWetWare)")
