"""
Addgene plasmid / protocol scraper.

Addgene has:
  - A protocol page at https://www.addgene.org/protocols/
  - A plasmid search API at https://www.addgene.org/api/v1/search/

Protocols are scraped and added to protocols.json.
Key plasmids (for lentiviral overexpression, CRISPR) go into catalog.json as
category=other with supplier=Addgene.
"""
import json
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import make_session, polite_get, next_id, deduplicate

log = logging.getLogger("addgene")

PROTOCOLS_INDEX = "https://www.addgene.org/protocols/"
SEARCH_API = "https://www.addgene.org/search/advanced/"

# Protocol pages that are directly relevant to the 4 domains
PROTOCOL_PAGES = [
    {
        "url": "https://www.addgene.org/protocols/transduction/",
        "title": "Lentiviral transduction of mammalian cells",
        "domain": "cell_biology",
        "experimentType": "in_vitro",
    },
    {
        "url": "https://www.addgene.org/protocols/crispr/",
        "title": "CRISPR/Cas9 genome editing protocol",
        "domain": "cell_biology",
        "experimentType": "in_vitro",
    },
    {
        "url": "https://www.addgene.org/protocols/transfection/",
        "title": "Plasmid transfection (lipid-based) protocol",
        "domain": "cell_biology",
        "experimentType": "in_vitro",
    },
    {
        "url": "https://www.addgene.org/protocols/virus-production/",
        "title": "Lentivirus production protocol (HEK293T)",
        "domain": "cell_biology",
        "experimentType": "in_vitro",
    },
]


def scrape_protocol_page(url: str, title: str, domain: str, exp_type: str,
                          session, existing: list[dict]) -> dict | None:
    from bs4 import BeautifulSoup
    existing_urls = {p.get("url") for p in existing}
    if url in existing_urls:
        log.info("[addgene] %s already in protocols, skipping", url)
        return None

    resp = polite_get(session, url, min_delay=1.5, max_delay=3.0)
    if resp is None:
        # If page unreachable, build a stub from known metadata
        return {
            "id": next_id("PROT-", existing),
            "title": title,
            "source": "Addgene",
            "doi": None,
            "url": url,
            "year": 2023,
            "domain": [domain],
            "experimentType": exp_type,
            "summary": f"Addgene community protocol: {title}. See {url} for full details.",
            "keyParameters": [],
        }

    try:
        soup = BeautifulSoup(resp.text, "html.parser")
        # Extract main article text
        article = soup.select_one("article, .protocol-content, main, .content")
        text = (article.get_text(" ", strip=True) if article else soup.get_text(" ", strip=True))[:600]

        # Extract list items as key parameters
        params = []
        for li in (article or soup).select("li")[:8]:
            t = li.get_text(" ", strip=True)
            if 15 < len(t) < 120:
                params.append(t)
            if len(params) >= 5:
                break

        return {
            "id": next_id("PROT-", existing),
            "title": title,
            "source": "Addgene",
            "doi": None,
            "url": url,
            "year": 2023,
            "domain": [domain],
            "experimentType": exp_type,
            "summary": text[:280],
            "keyParameters": params,
        }
    except Exception as exc:
        log.debug("Addgene protocol parse for %s: %s", url, exc)
        return None


def scrape(
    existing_protocols: list[dict],
    existing_catalog: list[dict],
) -> tuple[list[dict], list[dict]]:
    """Returns (new_protocols, new_catalog_items)."""
    session = make_session()
    accumulated_protocols = list(existing_protocols)
    new_protocols = []
    new_catalog = []  # Addgene plasmids (empty for now; extend if needed)

    for page_meta in PROTOCOL_PAGES:
        proto = scrape_protocol_page(
            url=page_meta["url"],
            title=page_meta["title"],
            domain=page_meta["domain"],
            exp_type=page_meta["experimentType"],
            session=session,
            existing=accumulated_protocols,
        )
        if proto:
            accumulated_protocols.append(proto)
            new_protocols.append(proto)

    log.info("[addgene] Done — %d new protocols", len(new_protocols))
    return new_protocols, new_catalog


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Scrape Addgene protocols")
    parser.add_argument("--protocols-out", default="../protocols.json")
    parser.add_argument("--catalog-out", default="../catalog.json")
    args = parser.parse_args()

    proto_path = Path(args.protocols_out)
    cat_path = Path(args.catalog_out)

    existing_protocols = json.loads(proto_path.read_text(encoding="utf-8")) if proto_path.exists() else []
    existing_catalog = json.loads(cat_path.read_text(encoding="utf-8")) if cat_path.exists() else []

    new_protocols, new_catalog = scrape(existing_protocols, existing_catalog)

    merged_protocols = deduplicate(existing_protocols + new_protocols, key="url")
    proto_path.write_text(json.dumps(merged_protocols, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"✓ protocols.json — {len(merged_protocols)} total ({len(new_protocols)} new from Addgene)")

    if new_catalog:
        merged_catalog = deduplicate(existing_catalog + new_catalog, key="catalogNumber")
        cat_path.write_text(json.dumps(merged_catalog, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"✓ catalog.json — {len(merged_catalog)} total ({len(new_catalog)} new from Addgene)")
