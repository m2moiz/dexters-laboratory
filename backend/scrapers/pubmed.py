"""
PubMed / NCBI E-utilities scraper.

Free, no API key required (key optional to raise rate limit from 3 → 10 req/s).
Set NCBI_API_KEY env var if you have one.

Fetches papers as protocol/literature references formatted for protocols.json.
"""
import json
import logging
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).parent))
from base import make_session, polite_get, next_id, deduplicate
from config import PUBMED_QUERIES, EXPERIMENT_TYPE_MAP as EXPERIMENT_TYPES

log = logging.getLogger("pubmed")

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL  = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


def _api_params(extra: dict) -> dict:
    params = {"tool": "ai-scientist-hackathon", "email": "hackathon@example.com"}
    key = os.environ.get("NCBI_API_KEY")
    if key:
        params["api_key"] = key
    params.update(extra)
    return params


def search_pmids(query: str, session, max_results: int = 10) -> list[str]:
    params = _api_params({
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "retmode": "json",
        "sort": "relevance",
    })
    resp = polite_get(session, ESEARCH_URL, params=params, min_delay=0.4, max_delay=1.0)
    if resp is None:
        return []
    try:
        return resp.json()["esearchresult"]["idlist"]
    except Exception as exc:
        log.warning("esearch parse error for '%s': %s", query, exc)
        return []


def fetch_articles(pmids: list[str], session) -> list[ET.Element]:
    if not pmids:
        return []
    params = _api_params({
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
        "rettype": "abstract",
    })
    resp = polite_get(session, EFETCH_URL, params=params, min_delay=0.5, max_delay=1.2)
    if resp is None:
        return []
    try:
        root = ET.fromstring(resp.text)
        return root.findall(".//PubmedArticle")
    except ET.ParseError as exc:
        log.warning("XML parse error: %s", exc)
        return []


def _get_text(element: ET.Element, path: str, default: str = "") -> str:
    el = element.find(path)
    return (el.text or default).strip() if el is not None else default


def _get_year(article: ET.Element) -> int | None:
    for path in [
        ".//PubDate/Year",
        ".//DateCompleted/Year",
        ".//DateRevised/Year",
    ]:
        y = _get_text(article, path)
        if y and y.isdigit():
            return int(y)
    return None


def _get_doi(article: ET.Element) -> str | None:
    for id_el in article.findall(".//ArticleId"):
        if id_el.get("IdType") == "doi":
            return (id_el.text or "").strip() or None
    return None


def _get_pmid(article: ET.Element) -> str | None:
    for id_el in article.findall(".//ArticleId"):
        if id_el.get("IdType") == "pubmed":
            return (id_el.text or "").strip() or None
    return None


def _get_abstract(article: ET.Element) -> str:
    parts = []
    for ab in article.findall(".//AbstractText"):
        text = ab.text or ""
        label = ab.get("Label")
        if label:
            parts.append(f"{label}: {text.strip()}")
        else:
            parts.append(text.strip())
    return " ".join(parts)[:400]


def _infer_domain(title: str, abstract: str) -> str:
    text = (title + " " + abstract).lower()
    if any(k in text for k in ["cryopreserv", "hela", "trehalose", "dmso freeze", "cell viab", "post-thaw"]):
        return "cell_biology"
    if any(k in text for k in ["fitc-dextran", "gut permeab", "intestin", "tight junction", "probiotic", "claudin", "lactobacillus"]):
        return "gut_health"
    if any(k in text for k in ["c-reactive protein", "crp", "biosensor", "electrochemical detection", "immunoassay"]):
        return "diagnostics"
    if any(k in text for k in ["sporomusa", "bioelectrochem", "co2 reduction", "microbial electrosyn", "carbon capture"]):
        return "climate"
    return "cell_biology"


def _key_params_from_abstract(abstract: str) -> list[str]:
    """Pull measurement values / concentrations from abstract text."""
    params = []
    # Find numeric phrases like "10% DMSO", "150 mmol/L/day", etc.
    hits = re.findall(r"[\d.,]+\s*(?:%|mg/L|mmol|mM|µM|µg|ng|°C|min|h\b|days?|weeks?)[^,;.]{0,60}", abstract)
    for h in hits:
        h = h.strip()
        if 8 < len(h) < 100:
            params.append(h)
        if len(params) >= 4:
            break
    return params


def article_to_protocol(article: ET.Element, domain: str, existing: list[dict]) -> dict:
    title = _get_text(article, ".//ArticleTitle", "Untitled")
    abstract = _get_abstract(article)
    pmid = _get_pmid(article)
    doi = _get_doi(article)
    year = _get_year(article)
    url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else ""
    exp_type = EXPERIMENT_TYPES.get(domain, "in_vitro")

    summary = abstract[:280] if len(abstract) >= 10 else title[:280]

    return {
        "id": next_id("PROT-", existing),
        "title": title[:120],
        "source": "PubMed",
        "doi": doi,
        "url": url,
        "year": year,
        "domain": [domain],
        "experimentType": exp_type,
        "summary": summary,
        "keyParameters": _key_params_from_abstract(abstract),
    }


def scrape(
    existing_protocols: list[dict],
    max_per_query: int = 6,
) -> list[dict]:
    session = make_session()
    accumulated = list(existing_protocols)
    new_entries = []
    existing_pmids = set()

    for proto in existing_protocols:
        url = proto.get("url", "")
        m = re.search(r"/(\d{6,})/?$", url)
        if m:
            existing_pmids.add(m.group(1))

    for domain, queries in PUBMED_QUERIES.items():
        for query in queries:
            log.info("[pubmed] Searching: %s (domain=%s)", query, domain)
            pmids = search_pmids(query, session, max_results=max_per_query)
            new_pmids = [p for p in pmids if p not in existing_pmids]
            if not new_pmids:
                continue
            articles = fetch_articles(new_pmids, session)
            for article in articles:
                pmid = _get_pmid(article)
                if pmid in existing_pmids:
                    continue
                proto = article_to_protocol(article, domain, accumulated)
                accumulated.append(proto)
                new_entries.append(proto)
                if pmid:
                    existing_pmids.add(pmid)

    log.info("[pubmed] Done — %d new entries", len(new_entries))
    return new_entries


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Scrape PubMed for protocol references")
    parser.add_argument("--out", default="../protocols.json")
    parser.add_argument("--max-per-query", type=int, default=6)
    args = parser.parse_args()

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []

    new_entries = scrape(existing, max_per_query=args.max_per_query)
    merged = deduplicate(existing + new_entries, key="url")
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"✓ protocols.json updated — {len(merged)} total ({len(new_entries)} new from PubMed)")
