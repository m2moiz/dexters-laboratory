"""
JoVE (Journal of Visualized Experiments) scraper.
Uses cloudscraper to bypass Cloudflare + joveiptoken cookie for content access.
No API key needed.
"""
import json
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import (make_cloudscraper, next_id, deduplicate, cookies_for,
                  extract_metrics, extract_reagents, extract_equipment,
                  infer_tags, count_steps, infer_domain, infer_experiment_type)
from config import LITERATURE_PROTOCOL_TOPICS

log = logging.getLogger("jove")
SOURCE = "JoVE"

SEARCH_URLS = [
    "https://www.jove.com/search",
    "https://app.jove.com/search",
]


def _jove_session():
    """Build a cloudscraper session pre-loaded with JoVE cookies."""
    scraper = make_cloudscraper()
    cks = cookies_for("jove.com")
    if cks:
        scraper.cookies.update(cks)
        log.info("[jove] Loaded %d cookies", len(cks))
    return scraper


def search_articles(query: str, scraper, page: int = 1) -> list[dict]:
    from bs4 import BeautifulSoup
    import time, random

    for base_url in SEARCH_URLS:
        time.sleep(random.uniform(2.0, 3.5))
        try:
            resp = scraper.get(
                base_url,
                params={"q": query, "page": page},
                timeout=20,
                headers={"Referer": "https://www.jove.com/"},
            )
            if resp.status_code not in (200, 202):
                continue

            soup = BeautifulSoup(resp.text, "lxml")

            # Try JSON embedded in page (Next.js __NEXT_DATA__)
            next_tag = soup.find("script", {"id": "__NEXT_DATA__"})
            if next_tag:
                data = json.loads(next_tag.string)
                pp = data.get("props", {}).get("pageProps", {})
                articles = (pp.get("articles") or pp.get("results") or
                            pp.get("searchResults", {}).get("results", []))
                if articles:
                    return _parse_json_articles(articles)

            # HTML fallback
            results = []
            selectors = [
                ".search-result", ".article-card", ".jove-article",
                "article", ".result-item", ".col-article",
            ]
            for sel in selectors:
                cards = soup.select(sel)
                if cards:
                    for card in cards[:15]:
                        r = _parse_html_card(card)
                        if r:
                            results.append(r)
                    if results:
                        return results

        except Exception as exc:
            log.debug("JoVE search '%s' error: %s", query, exc)

    return []


def _parse_json_articles(articles: list) -> list[dict]:
    results = []
    for a in articles:
        title = a.get("title") or a.get("name") or ""
        url = a.get("url") or a.get("href") or ""
        if not url.startswith("http"):
            url = "https://www.jove.com" + url
        abstract = (a.get("abstract") or a.get("description") or "")[:400]
        year = None
        for df in ["publishDate", "date", "year"]:
            val = a.get(df, "")
            m = re.search(r"20\d{2}", str(val))
            if m:
                year = int(m.group())
                break
        doi = a.get("doi") or a.get("DOI")
        authors = a.get("authors", [])
        if authors and isinstance(authors[0], dict):
            authors = [au.get("name", "") for au in authors]
        if title and url:
            results.append({"title": title, "url": url, "abstract": abstract,
                            "year": year, "doi": doi, "authors": authors})
    return results


def _parse_html_card(card) -> dict | None:
    title_el = card.select_one("h2 a, h3 a, .title a, a.article-title, .jove-title a")
    if not title_el:
        return None
    title = title_el.get_text(strip=True)
    href = title_el.get("href", "")
    url = href if href.startswith("http") else "https://www.jove.com" + href
    abstract_el = card.select_one(".abstract, .description, .teaser, p")
    abstract = abstract_el.get_text(" ", strip=True)[:400] if abstract_el else ""
    year_el = card.select_one("time, .date, .year")
    year = None
    if year_el:
        m = re.search(r"20\d{2}", year_el.get_text())
        year = int(m.group()) if m else None
    return {"title": title, "url": url, "abstract": abstract, "year": year, "doi": None, "authors": []}


def fetch_article_detail(url: str, scraper) -> dict:
    import time, random
    from bs4 import BeautifulSoup
    time.sleep(random.uniform(2.0, 3.5))
    try:
        resp = scraper.get(url, timeout=20, headers={"Referer": "https://www.jove.com/"})
        if resp.status_code != 200:
            return {}
        soup = BeautifulSoup(resp.text, "lxml")

        abstract = ""
        for sel in ["#abstract", ".abstract-content", "section.abstract",
                    ".article-abstract", "[data-section='abstract']"]:
            el = soup.select_one(sel)
            if el:
                abstract = el.get_text(" ", strip=True)[:600]
                break

        methods = ""
        for sel in ["#protocol", ".protocol-content", "section#methods",
                    ".methods-content", "[data-section='protocol']"]:
            el = soup.select_one(sel)
            if el:
                methods = el.get_text(" ", strip=True)[:1500]
                break

        authors = [a.get_text(strip=True) for a in soup.select(".author-name, .jove-author, [itemprop='author']")][:6]
        institution = ""
        inst_el = soup.select_one(".institution, .affiliation, [itemprop='affiliation']")
        if inst_el:
            institution = inst_el.get_text(strip=True)[:80]

        doi = None
        doi_el = soup.select_one("a[href*='doi.org'], [data-doi]")
        if doi_el:
            doi_text = doi_el.get("href", "") or doi_el.get("data-doi", "")
            m = re.search(r"10\.\S+", doi_text)
            doi = m.group() if m else None

        return {"abstract": abstract, "methods": methods, "authors": authors,
                "institution": institution, "doi": doi}
    except Exception as exc:
        log.debug("JoVE detail %s: %s", url, exc)
        return {}


def result_to_protocol(r: dict, detail: dict, existing: list[dict]) -> dict:
    title = r["title"]
    url = r["url"]
    abstract = detail.get("abstract") or r.get("abstract", "")
    methods = detail.get("methods", "")
    full_text = abstract + " " + methods
    authors = detail.get("authors") or r.get("authors", [])
    year = r.get("year")
    doi = detail.get("doi") or r.get("doi")
    institution = detail.get("institution", "")

    domains = infer_domain(title, full_text) or ["cell_biology"]
    exp_type = infer_experiment_type(domains[0], full_text)
    metrics = extract_metrics(full_text)

    return {
        "id": next_id("PROT-", existing),
        "title": title[:120],
        "source": SOURCE,
        "doi": doi,
        "url": url,
        "year": year,
        "domain": domains,
        "experimentType": exp_type,
        "summary": (abstract[:280] if len(abstract) >= 15 else title[:280]),
        "keyParameters": (metrics["temperatures"] + metrics["concentrations"] + metrics["durations"])[:6],
        "authors": authors[:4],
        "institution": institution,
        "tags": infer_tags(title, full_text),
        "stepCount": count_steps(methods),
        "reagentsUsed": extract_reagents(full_text),
        "equipmentNeeded": extract_equipment(full_text),
        "metrics": metrics,
    }


def scrape(existing_protocols: list[dict], max_per_query: int = 8) -> list[dict]:
    cks = cookies_for("jove.com")
    if not cks:
        log.info("[jove] No cookies — skipping. Add joveiptoken to cookies.json.")
        return []

    scraper = _jove_session()
    accumulated = list(existing_protocols)
    new_entries = []
    seen_urls = {p.get("url") for p in existing_protocols}

    topics = LITERATURE_PROTOCOL_TOPICS[2::3][:30]
    for topic in topics:
        log.info("[jove] Searching: %s", topic)
        results = search_articles(topic, scraper)
        for r in results[:max_per_query]:
            if r["url"] in seen_urls:
                continue
            detail = fetch_article_detail(r["url"], scraper)
            proto = result_to_protocol(r, detail, accumulated)
            accumulated.append(proto)
            new_entries.append(proto)
            seen_urls.add(r["url"])

    log.info("[jove] Done — %d new protocols", len(new_entries))
    return new_entries
