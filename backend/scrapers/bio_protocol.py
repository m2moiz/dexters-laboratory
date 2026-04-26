"""
Bio-protocol.org scraper — peer-reviewed, linked to papers.
https://bio-protocol.org/search
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
from config import LITERATURE_PROTOCOL_TOPICS

log = logging.getLogger("bio_protocol")
SOURCE = "bio-protocol.org"
SEARCH_URL = "https://bio-protocol.org/search"


def search_page(query: str, session, page: int = 1) -> list[dict]:
    """Scrape search results page and return list of protocol metadata dicts."""
    from bs4 import BeautifulSoup
    params = {"q": query, "type": "1", "page": page}  # type=1 = protocols
    resp = polite_get(session, SEARCH_URL, params=params)
    if resp is None:
        return []
    try:
        soup = BeautifulSoup(resp.text, "lxml")
        results = []

        # Bio-protocol search results are in article cards
        for card in soup.select(".search-result-item, .protocol-item, article.result"):
            title_el = card.select_one("h2 a, h3 a, .title a, a.protocol-title")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            url = title_el.get("href", "")
            if url and not url.startswith("http"):
                url = "https://bio-protocol.org" + url

            authors_el = card.select(".authors, .author-list, .byline")
            authors = [a.get_text(strip=True) for a in authors_el] if authors_el else []

            abstract_el = card.select_one(".abstract, .description, .summary, p")
            abstract = abstract_el.get_text(" ", strip=True)[:400] if abstract_el else ""

            doi_el = card.select_one("[data-doi], .doi")
            doi = (doi_el.get("data-doi") or doi_el.get_text(strip=True)) if doi_el else None

            year_el = card.select_one(".year, .date, time")
            year = None
            if year_el:
                m = re.search(r"20\d{2}", year_el.get_text())
                year = int(m.group()) if m else None

            if not url or not title:
                continue
            results.append({
                "title": title, "url": url, "authors": authors,
                "abstract": abstract, "doi": doi, "year": year,
            })
        return results
    except Exception as exc:
        log.debug("Parse error for '%s': %s", query, exc)
        return []


def fetch_protocol_detail(url: str, session) -> dict:
    """Fetch a single protocol page for richer data."""
    from bs4 import BeautifulSoup
    resp = polite_get(session, url)
    if resp is None:
        return {}
    try:
        soup = BeautifulSoup(resp.text, "lxml")
        # Abstract / summary
        abstract = ""
        for sel in [".abstract", ".protocol-abstract", "#abstract", ".summary"]:
            el = soup.select_one(sel)
            if el:
                abstract = el.get_text(" ", strip=True)[:600]
                break

        # Full text for metrics
        body = soup.get_text(" ")

        # Authors
        authors = [a.get_text(strip=True) for a in soup.select(".author, .authors li")][:6]

        # DOI
        doi = None
        for el in soup.select("[data-doi], .doi, a[href*='doi.org']"):
            text = el.get("data-doi") or el.get("href") or el.get_text(strip=True)
            if "10." in (text or ""):
                doi = re.search(r"10\.\S+", text).group() if re.search(r"10\.\S+", text) else None
                break

        # Year
        year = None
        m = re.search(r"\b(20\d{2})\b", body[:500])
        if m:
            year = int(m.group(1))

        # Institution
        inst_el = soup.select_one(".institution, .affiliation, .org")
        institution = inst_el.get_text(strip=True)[:80] if inst_el else ""

        return {
            "abstract": abstract,
            "full_text_snippet": body[500:1500],
            "authors": authors,
            "doi": doi,
            "year": year,
            "institution": institution,
        }
    except Exception as exc:
        log.debug("Detail fetch error %s: %s", url, exc)
        return {}


def result_to_protocol(result: dict, detail: dict, domain: str, existing: list[dict]) -> dict:
    title = result["title"]
    url = result["url"]
    text = result.get("abstract", "") + " " + detail.get("full_text_snippet", "")
    abstract = detail.get("abstract") or result.get("abstract", title)
    authors = detail.get("authors") or result.get("authors", [])
    doi = detail.get("doi") or result.get("doi")
    year = detail.get("year") or result.get("year")
    institution = detail.get("institution", "")

    domains = infer_domain(title, text) or [domain]
    exp_type = infer_experiment_type(domains[0], text)
    metrics = extract_metrics(text)
    reagents = extract_reagents(text)
    equipment = extract_equipment(text)
    tags = infer_tags(title, text)
    steps = count_steps(text)

    summary = abstract[:280] if len(abstract) >= 15 else title[:280]

    return {
        "id": next_id("PROT-", existing),
        "title": title[:120],
        "source": SOURCE,
        "doi": doi,
        "url": url,
        "year": year,
        "domain": domains,
        "experimentType": exp_type,
        "summary": summary,
        "keyParameters": [
            v for v in (
                metrics["temperatures"] + metrics["concentrations"] + metrics["durations"]
            ) if v
        ][:6],
        "authors": authors[:4],
        "institution": institution,
        "tags": tags,
        "stepCount": steps if steps > 0 else None,
        "reagentsUsed": reagents,
        "equipmentNeeded": equipment,
        "metrics": metrics,
    }


def scrape(existing_protocols: list[dict], max_per_query: int = 8, fetch_detail: bool = True) -> list[dict]:
    session = make_session()
    accumulated = list(existing_protocols)
    new_entries = []
    seen_urls = {p.get("url") for p in existing_protocols}

    # Use every other topic to stay within reasonable request count
    topics = LITERATURE_PROTOCOL_TOPICS[::2][:40]

    for topic in topics:
        log.info("[bio-protocol] Searching: %s", topic)
        results = search_page(topic, session)
        for r in results[:max_per_query]:
            if r["url"] in seen_urls:
                continue
            detail = fetch_protocol_detail(r["url"], session) if fetch_detail else {}
            domain = infer_domain(r["title"], r.get("abstract", ""))
            domain = domain[0] if domain else "cell_biology"
            proto = result_to_protocol(r, detail, domain, accumulated)
            accumulated.append(proto)
            new_entries.append(proto)
            seen_urls.add(r["url"])

    log.info("[bio-protocol] Done — %d new protocols", len(new_entries))
    return new_entries


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="../protocols.json")
    parser.add_argument("--max-per-query", type=int, default=8)
    parser.add_argument("--no-detail", action="store_true")
    args = parser.parse_args()

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []
    new_entries = scrape(existing, max_per_query=args.max_per_query, fetch_detail=not args.no_detail)
    merged = deduplicate(existing + new_entries, key="url")
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"protocols.json: {len(merged)} total (+{len(new_entries)} from bio-protocol)")
