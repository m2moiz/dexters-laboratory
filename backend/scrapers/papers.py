"""
Scientific papers scraper — produces papers.json.
Sources (all free, no API key required):
  - PubMed E-utilities (NCBI)
  - arXiv API
  - Semantic Scholar API (public, no key for basic use)
  - bioRxiv (preprint RSS)

Output schema (papers.json entry):
  id, title, authors, year, journal, doi, url, abstract,
  domain, experimentType, tags, citationCount, metrics,
  keyFindings, meshTerms, source
"""
import json
import logging
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import (make_session, polite_get, next_id, deduplicate,
                  extract_metrics, infer_domain, infer_experiment_type, infer_tags)
from config import PUBMED_QUERIES

log = logging.getLogger("papers")
OUT_FILE = Path(__file__).parent.parent / "papers.json"


# ── PubMed ────────────────────────────────────────────────────────────────────

ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH  = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
ELINK   = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi"

_NCBI_BASE = {"tool": "ai-scientist-hackathon", "email": "hackathon@ai-scientist.io"}


def _ncbi_params(extra: dict) -> dict:
    return {**_NCBI_BASE, **extra}


def pubmed_search(query: str, session, max_results: int = 20) -> list[str]:
    resp = polite_get(session, ESEARCH, params=_ncbi_params({
        "db": "pubmed", "term": query, "retmax": max_results,
        "retmode": "json", "sort": "relevance",
    }), min_delay=0.3, max_delay=0.8)
    if resp is None:
        return []
    try:
        return resp.json()["esearchresult"]["idlist"]
    except Exception:
        return []


def pubmed_fetch(pmids: list[str], session) -> list[ET.Element]:
    if not pmids:
        return []
    resp = polite_get(session, EFETCH, params=_ncbi_params({
        "db": "pubmed", "id": ",".join(pmids),
        "retmode": "xml", "rettype": "abstract",
    }), min_delay=0.4, max_delay=1.0)
    if resp is None:
        return []
    try:
        return ET.fromstring(resp.text).findall(".//PubmedArticle")
    except Exception:
        return []


def _get_text(el: ET.Element, path: str, default: str = "") -> str:
    node = el.find(path)
    return (node.text or default).strip() if node is not None else default


def _get_abstract(article: ET.Element) -> str:
    parts = []
    for ab in article.findall(".//AbstractText"):
        label = ab.get("Label")
        text = (ab.text or "").strip()
        parts.append(f"{label}: {text}" if label else text)
    return " ".join(parts)[:800]


def _get_mesh(article: ET.Element) -> list[str]:
    return [
        m.text.strip() for m in article.findall(".//MeshHeading/DescriptorName")
        if m.text
    ][:10]


def _get_pmid(article: ET.Element) -> str:
    for el in article.findall(".//ArticleId"):
        if el.get("IdType") == "pubmed":
            return (el.text or "").strip()
    return ""


def _get_doi(article: ET.Element) -> str | None:
    for el in article.findall(".//ArticleId"):
        if el.get("IdType") == "doi":
            return (el.text or "").strip() or None
    return None


def pubmed_article_to_paper(article: ET.Element, domain: str, existing: list[dict]) -> dict | None:
    title = _get_text(article, ".//ArticleTitle", "")
    if not title or title == "Untitled":
        return None
    abstract = _get_abstract(article)
    pmid = _get_pmid(article)
    doi = _get_doi(article)
    url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else ""
    year = None
    for path in [".//PubDate/Year", ".//DateCompleted/Year"]:
        y = _get_text(article, path)
        if y.isdigit():
            year = int(y)
            break
    journal = _get_text(article, ".//Journal/Title") or _get_text(article, ".//MedlineTA")
    authors = []
    for auth in article.findall(".//Author")[:6]:
        ln = _get_text(auth, "LastName")
        fn = _get_text(auth, "ForeName")
        if ln:
            authors.append(f"{ln} {fn}".strip())

    mesh = _get_mesh(article)
    text = title + " " + abstract
    domains = infer_domain(title, abstract) or [domain]
    exp_type = infer_experiment_type(domains[0], abstract)
    metrics = extract_metrics(abstract)

    # Key findings: extract sentences with numeric results
    findings = []
    for sent in re.split(r"(?<=[.!?])\s+", abstract):
        if re.search(r"\d+%|\d+\.\d+|significantly|p\s*[<=>]\s*0\.\d+", sent):
            findings.append(sent.strip()[:150])
        if len(findings) >= 3:
            break

    return {
        "id": next_id("PAPER-", existing),
        "title": title[:200],
        "authors": authors,
        "year": year,
        "journal": journal[:100] if journal else None,
        "doi": doi,
        "url": url,
        "abstract": abstract[:800],
        "domain": domains,
        "experimentType": exp_type,
        "tags": infer_tags(title, abstract),
        "meshTerms": mesh,
        "keyFindings": findings,
        "metrics": metrics,
        "citationCount": None,
        "source": "PubMed",
    }


# ── arXiv ─────────────────────────────────────────────────────────────────────

ARXIV_API = "https://export.arxiv.org/api/query"

ARXIV_QUERIES = [
    "cryopreservation cells membrane stabilization",
    "electrochemical biosensor point-of-care CRP",
    "microbial electrosynthesis CO2 reduction acetate",
    "gut microbiome intestinal permeability barrier",
    "CRISPR genome editing efficiency",
    "machine learning drug discovery",
    "single cell RNA sequencing analysis",
    "deep learning protein structure prediction",
    "lateral flow assay rapid diagnostic",
    "organ-on-chip microfluidic cell culture",
    "flow cytometry cell sorting protocol",
    "proteomics mass spectrometry quantitative",
    "bioelectrochemical system cathode biofilm",
    "tight junction claudin occludin epithelial",
    "trehalose sugar glass membrane stabilization",
]


def arxiv_search(query: str, session, max_results: int = 10) -> list[dict]:
    resp = polite_get(session, ARXIV_API, params={
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": max_results,
        "sortBy": "relevance",
    }, min_delay=0.5, max_delay=1.5)
    if resp is None:
        return []
    try:
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(resp.text)
        results = []
        for entry in root.findall("atom:entry", ns):
            title = (entry.findtext("atom:title", "", ns) or "").strip().replace("\n", " ")
            abstract = (entry.findtext("atom:summary", "", ns) or "").strip()[:800]
            url = ""
            for link in entry.findall("atom:link", ns):
                if link.get("type") == "text/html":
                    url = link.get("href", "")
            doi = None
            doi_el = entry.find("{http://arxiv.org/schemas/atom}doi")
            if doi_el is not None and doi_el.text:
                doi = doi_el.text.strip()
            pub = entry.findtext("atom:published", "", ns)
            year = int(pub[:4]) if pub and pub[:4].isdigit() else None
            authors = [
                a.findtext("atom:name", "", ns)
                for a in entry.findall("atom:author", ns)
            ][:6]
            arxiv_id = entry.findtext("atom:id", "", ns).split("/abs/")[-1]
            if not url:
                url = f"https://arxiv.org/abs/{arxiv_id}"
            results.append({"title": title, "abstract": abstract, "url": url,
                            "doi": doi, "year": year, "authors": authors})
        return results
    except Exception as exc:
        log.debug("arXiv parse error '%s': %s", query, exc)
        return []


def arxiv_to_paper(r: dict, existing: list[dict]) -> dict | None:
    title = r.get("title", "")
    if not title:
        return None
    abstract = r.get("abstract", "")
    text = title + " " + abstract
    domains = infer_domain(title, abstract) or ["cell_biology"]
    metrics = extract_metrics(abstract)
    findings = []
    for sent in re.split(r"(?<=[.!?])\s+", abstract):
        if re.search(r"\d+%|\d+\.\d+|outperform|achiev|demonstrat", sent, re.I):
            findings.append(sent.strip()[:150])
        if len(findings) >= 3:
            break
    return {
        "id": next_id("PAPER-", existing),
        "title": title[:200],
        "authors": r.get("authors", []),
        "year": r.get("year"),
        "journal": "arXiv preprint",
        "doi": r.get("doi"),
        "url": r.get("url", ""),
        "abstract": abstract,
        "domain": domains,
        "experimentType": infer_experiment_type(domains[0], abstract),
        "tags": infer_tags(title, abstract),
        "meshTerms": [],
        "keyFindings": findings,
        "metrics": metrics,
        "citationCount": None,
        "source": "arXiv",
    }


# ── Semantic Scholar ──────────────────────────────────────────────────────────

SS_API = "https://api.semanticscholar.org/graph/v1/paper/search"

SS_QUERIES = [
    "trehalose cryoprotection mammalian cells",
    "electrochemical immunosensor C-reactive protein",
    "Sporomusa ovata acetogenesis electrode",
    "Lactobacillus rhamnosus GG gut barrier",
    "CRISPR Cas9 efficiency off-target",
    "single cell sequencing transcriptomics",
    "biosensor lateral flow immunoassay",
    "tight junction claudin gut epithelial",
    "bioelectrochemical system acetate",
    "cell viability cryopreservation post-thaw",
    "qPCR quantification gene expression normalization",
    "protein-protein interaction co-immunoprecipitation",
    "flow cytometry cell sorting immunophenotyping",
    "ELISA sensitivity limit detection",
    "PCR amplification fidelity thermostable polymerase",
    "Western blot quantification normalization",
    "RNA sequencing differential expression",
    "proteomics mass spectrometry quantification",
    "antibody functionalization electrode surface",
    "anaerobic bacteria culture technique",
]


def semantic_scholar_search(query: str, session, max_results: int = 10) -> list[dict]:
    resp = polite_get(session, SS_API, params={
        "query": query,
        "fields": "title,authors,year,abstract,externalIds,citationCount,publicationVenue",
        "limit": max_results,
    }, extra_headers={"Accept": "application/json"}, min_delay=0.5, max_delay=1.2)
    if resp is None:
        return []
    try:
        data = resp.json()
        return data.get("data", [])
    except Exception as exc:
        log.debug("S2 parse error '%s': %s", query, exc)
        return []


def s2_to_paper(item: dict, existing: list[dict]) -> dict | None:
    title = item.get("title", "")
    if not title:
        return None
    abstract = (item.get("abstract") or "")[:800]
    authors = [a.get("name", "") for a in item.get("authors", [])[:6]]
    year = item.get("year")
    ext_ids = item.get("externalIds", {}) or {}
    doi = ext_ids.get("DOI")
    pmid = ext_ids.get("PubMed")
    url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else \
          (f"https://doi.org/{doi}" if doi else "https://www.semanticscholar.org/")
    venue = item.get("publicationVenue", {}) or {}
    journal = venue.get("name", "")
    citation_count = item.get("citationCount")
    domains = infer_domain(title, abstract) or ["cell_biology"]
    metrics = extract_metrics(abstract)
    findings = []
    for sent in re.split(r"(?<=[.!?])\s+", abstract):
        if re.search(r"\d+%|\d+\.\d+|p\s*[<=>]\s*0\.", sent):
            findings.append(sent.strip()[:150])
        if len(findings) >= 3:
            break
    return {
        "id": next_id("PAPER-", existing),
        "title": title[:200],
        "authors": authors,
        "year": year,
        "journal": journal[:100] if journal else None,
        "doi": doi,
        "url": url,
        "abstract": abstract,
        "domain": domains,
        "experimentType": infer_experiment_type(domains[0], abstract),
        "tags": infer_tags(title, abstract),
        "meshTerms": [],
        "keyFindings": findings,
        "metrics": metrics,
        "citationCount": citation_count,
        "source": "Semantic Scholar",
    }


# ── Main scrape ───────────────────────────────────────────────────────────────

def scrape(existing_papers: list[dict], max_per_query: int = 15) -> list[dict]:
    session = make_session()
    accumulated = list(existing_papers)
    new_entries = []
    seen_urls = {p.get("url") for p in existing_papers}
    seen_dois = {p.get("doi") for p in existing_papers if p.get("doi")}

    # ── PubMed ──
    # Flatten all queries from all domains + extras
    all_pubmed = []
    for domain_queries in PUBMED_QUERIES.values():
        all_pubmed.extend(domain_queries)
    # Extra high-yield queries
    all_pubmed += [
        "cryopreservation protocol optimization mammalian",
        "electrochemical sensor blood point of care",
        "microbial electrosynthesis acetate production rate",
        "probiotics gut microbiome clinical trial",
        "CRISPR base editing efficiency comparison",
        "single cell RNA seq protocol optimization",
        "protein purification affinity chromatography",
        "biosensor sensitivity selectivity whole blood",
        "tight junction barrier intestinal epithelium",
        "acetogenesis Wood-Ljungdahl pathway",
        "flow cytometry panel design optimization",
        "Western blot signal-to-noise antibody dilution",
        "qPCR reference gene normalization selection",
        "cell viability MTT resazurin comparison",
        "DNA extraction yield quality assessment",
    ]

    log.info("[papers/pubmed] Running %d queries...", len(all_pubmed))
    for query in all_pubmed:
        pmids = pubmed_search(query, session, max_results=max_per_query)
        articles = pubmed_fetch([p for p in pmids if f"pubmed.ncbi.nlm.nih.gov/{p}/" not in seen_urls], session)
        for article in articles:
            pmid = _get_pmid(article)
            url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
            doi = _get_doi(article)
            if url in seen_urls or (doi and doi in seen_dois):
                continue
            paper = pubmed_article_to_paper(article, "cell_biology", accumulated)
            if paper:
                accumulated.append(paper)
                new_entries.append(paper)
                seen_urls.add(url)
                if doi:
                    seen_dois.add(doi)

    log.info("[papers/pubmed] +%d papers", len(new_entries))
    n_before_arxiv = len(new_entries)

    # ── arXiv ──
    log.info("[papers/arxiv] Running %d queries...", len(ARXIV_QUERIES))
    for query in ARXIV_QUERIES:
        results = arxiv_search(query, session, max_results=max_per_query)
        for r in results:
            url = r.get("url", "")
            doi = r.get("doi")
            if url in seen_urls or (doi and doi in seen_dois):
                continue
            paper = arxiv_to_paper(r, accumulated)
            if paper:
                accumulated.append(paper)
                new_entries.append(paper)
                seen_urls.add(url)
                if doi:
                    seen_dois.add(doi)
    log.info("[papers/arxiv] +%d papers", len(new_entries) - n_before_arxiv)
    n_before_s2 = len(new_entries)

    # ── Semantic Scholar ──
    log.info("[papers/semantic-scholar] Running %d queries...", len(SS_QUERIES))
    for query in SS_QUERIES:
        items = semantic_scholar_search(query, session, max_results=max_per_query)
        for item in items:
            doi = (item.get("externalIds") or {}).get("DOI")
            pmid = (item.get("externalIds") or {}).get("PubMed")
            url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else ""
            if (url and url in seen_urls) or (doi and doi in seen_dois):
                continue
            paper = s2_to_paper(item, accumulated)
            if paper:
                accumulated.append(paper)
                new_entries.append(paper)
                if url:
                    seen_urls.add(url)
                if doi:
                    seen_dois.add(doi)
    log.info("[papers/semantic-scholar] +%d papers", len(new_entries) - n_before_s2)

    log.info("[papers] Total new: %d", len(new_entries))
    return new_entries


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="../papers.json")
    parser.add_argument("--max-per-query", type=int, default=15)
    args = parser.parse_args()

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []
    new_entries = scrape(existing, max_per_query=args.max_per_query)
    merged = deduplicate(existing + new_entries, key="url")
    # Reassign IDs
    for i, e in enumerate(merged, 1):
        e["id"] = f"PAPER-{i:03d}"
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"papers.json: {len(merged)} total (+{len(new_entries)} new)")
