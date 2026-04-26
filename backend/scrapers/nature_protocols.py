"""
Nature Protocols scraper — nature.com/nprot
Scrapes article metadata + abstracts (freely available even without subscription).
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

log = logging.getLogger("nature_protocols")
SOURCE = "Nature Protocols"
SEARCH_URL = "https://www.nature.com/search"


def search_articles(query: str, session, page: int = 1) -> list[dict]:
    from bs4 import BeautifulSoup
    params = {
        "q": query,
        "journal": "nprot",
        "order": "relevance",
        "page": page,
    }
    resp = polite_get(session, SEARCH_URL, params=params,
                      extra_headers={"Accept": "text/html"})
    if resp is None:
        return []
    try:
        soup = BeautifulSoup(resp.text, "lxml")
        results = []

        for article in soup.select("article, li.app-article-list-row, .c-card"):
            title_el = article.select_one("h3 a, h2 a, .c-card__title a, a.c-card__link")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            href = title_el.get("href", "")
            url = href if href.startswith("http") else "https://www.nature.com" + href

            # Abstract / deck
            abstract_el = article.select_one(
                ".c-card__summary, .article__teaser, p.article-item__teaser, .c-card__description"
            )
            abstract = abstract_el.get_text(" ", strip=True)[:400] if abstract_el else ""

            # Authors
            authors = [a.get_text(strip=True) for a in article.select(".c-author-list__item, .authors li")][:4]

            # Year
            year = None
            time_el = article.select_one("time, .c-meta__item")
            if time_el:
                m = re.search(r"20\d{2}", time_el.get_text())
                year = int(m.group()) if m else None

            # DOI from URL pattern like /articles/nprot.YYYY.NNN
            doi = None
            doi_m = re.search(r"(/articles/[a-z0-9\-\.]+)", url)
            if doi_m:
                doi = "10.1038" + doi_m.group(1)

            results.append({
                "title": title, "url": url, "abstract": abstract,
                "authors": authors, "year": year, "doi": doi,
            })
        return results
    except Exception as exc:
        log.debug("Parse error '%s': %s", query, exc)
        return []


def fetch_article_detail(url: str, session) -> dict:
    from bs4 import BeautifulSoup
    resp = polite_get(session, url)
    if resp is None:
        return {}
    try:
        soup = BeautifulSoup(resp.text, "lxml")
        # Abstract
        abstract = ""
        for sel in ["#Abs1-content", ".c-article-section__content", ".article__body p", "section#abstract"]:
            el = soup.select_one(sel)
            if el:
                abstract = el.get_text(" ", strip=True)[:600]
                break

        body_text = soup.get_text(" ")

        # Authors with affiliations
        authors = [a.get_text(strip=True) for a in soup.select("li.c-article-author-list__item a")][:6]
        affil_el = soup.select_one(".c-article-author-affiliation__address")
        institution = affil_el.get_text(strip=True)[:80] if affil_el else ""

        # Citation count (if shown)
        cit_el = soup.select_one(".c-article-metrics-bar__count, [data-track-label='Article citations']")
        citation_count = None
        if cit_el:
            m = re.search(r"\d+", cit_el.get_text())
            citation_count = int(m.group()) if m else None

        return {
            "abstract": abstract,
            "full_text_snippet": body_text[1000:2500],
            "authors": authors,
            "institution": institution,
            "citation_count": citation_count,
        }
    except Exception as exc:
        log.debug("Detail error %s: %s", url, exc)
        return {}


def article_to_protocol(result: dict, detail: dict, existing: list[dict]) -> dict:
    title = result["title"]
    url = result["url"]
    abstract = detail.get("abstract") or result.get("abstract", "")
    text = abstract + " " + detail.get("full_text_snippet", "")
    authors = detail.get("authors") or result.get("authors", [])
    year = result.get("year")
    doi = result.get("doi")
    institution = detail.get("institution", "")
    citation_count = detail.get("citation_count")

    domains = infer_domain(title, text) or ["cell_biology"]
    exp_type = infer_experiment_type(domains[0], text)
    metrics = extract_metrics(text)
    reagents = extract_reagents(text)
    equipment = extract_equipment(text)
    tags = infer_tags(title, text)

    summary = abstract[:280] if len(abstract) >= 15 else title[:280]

    entry = {
        "id": next_id("PROT-", existing),
        "title": title[:120],
        "source": SOURCE,
        "doi": doi,
        "url": url,
        "year": year,
        "domain": domains,
        "experimentType": exp_type,
        "summary": summary,
        "keyParameters": (
            metrics["temperatures"] + metrics["concentrations"] + metrics["durations"]
        )[:6],
        "authors": authors[:4],
        "institution": institution,
        "tags": tags,
        "reagentsUsed": reagents,
        "equipmentNeeded": equipment,
        "metrics": metrics,
    }
    if citation_count is not None:
        entry["citationCount"] = citation_count
    return entry


def scrape(existing_protocols: list[dict], max_per_query: int = 6, fetch_detail: bool = False) -> list[dict]:
    # fetch_detail=False by default for Nature to avoid hitting rate limits on main article pages
    session = make_session()
    accumulated = list(existing_protocols)
    new_entries = []
    seen_urls = {p.get("url") for p in existing_protocols}

    topics = LITERATURE_PROTOCOL_TOPICS[::3][:35]  # every 3rd topic, 35 total

    for topic in topics:
        log.info("[nature-protocols] Searching: %s", topic)
        results = search_articles(topic, session)
        for r in results[:max_per_query]:
            if r["url"] in seen_urls:
                continue
            detail = fetch_article_detail(r["url"], session) if fetch_detail else {}
            proto = article_to_protocol(r, detail, accumulated)
            accumulated.append(proto)
            new_entries.append(proto)
            seen_urls.add(r["url"])

    log.info("[nature-protocols] Done — %d new protocols", len(new_entries))
    return new_entries


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="../protocols.json")
    parser.add_argument("--max-per-query", type=int, default=6)
    parser.add_argument("--fetch-detail", action="store_true")
    args = parser.parse_args()

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []
    new_entries = scrape(existing, max_per_query=args.max_per_query, fetch_detail=args.fetch_detail)
    merged = deduplicate(existing + new_entries, key="url")
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"protocols.json: {len(merged)} total (+{len(new_entries)} from Nature Protocols)")
