"""
ATCC cell line catalog scraper.

ATCC has a product search page at https://www.atcc.org/search
and product detail pages at https://www.atcc.org/products/<id>

Cell lines are the most valuable ATCC entries for this project.
"""
import json
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import make_session, polite_get, next_id, deduplicate

log = logging.getLogger("atcc")

SUPPLIER = "ATCC"

# Cell lines relevant to the 4 hackathon domains
CELL_LINE_TARGETS = [
    # cell_biology
    {"query": "HeLa CCL-2", "catalog": "CCL-2", "domain": ["cell_biology", "oncology"]},
    {"query": "HEK 293 CRL-1573", "catalog": "CRL-1573", "domain": ["cell_biology"]},
    {"query": "NIH 3T3 CRL-1658", "catalog": "CRL-1658", "domain": ["cell_biology"]},
    {"query": "CHO-K1 CCL-61", "catalog": "CCL-61", "domain": ["cell_biology"]},
    # gut_health
    {"query": "Caco-2 HTB-37", "catalog": "HTB-37", "domain": ["gut_health", "cell_biology"]},
    {"query": "HT-29 HTB-38", "catalog": "HTB-38", "domain": ["gut_health", "cell_biology"]},
    {"query": "T84 CCL-248", "catalog": "CCL-248", "domain": ["gut_health"]},
    # diagnostics
    {"query": "Jurkat TIB-152", "catalog": "TIB-152", "domain": ["diagnostics", "immunology"]},
    # microbial / climate
    {"query": "Sporomusa ovata DSM 2662", "catalog": "BAA-2375", "domain": ["climate"]},
]

SEARCH_API = "https://www.atcc.org/api/v1/products/search"
PRODUCT_PAGE = "https://www.atcc.org/products"


def search_cell_line(query: str, session) -> list[dict]:
    """Search ATCC product API."""
    params = {
        "searchTerm": query,
        "productType": "Cell Lines",
        "pageSize": 5,
        "pageNumber": 1,
    }
    extra_headers = {
        "Accept": "application/json",
        "Referer": "https://www.atcc.org/",
    }
    resp = polite_get(
        session, SEARCH_API, params=params,
        extra_headers=extra_headers,
        min_delay=1.5, max_delay=3.0,
    )
    if resp is not None:
        try:
            data = resp.json()
            return data.get("results", data.get("products", data.get("items", [])))
        except Exception as exc:
            log.debug("ATCC API parse for '%s': %s", query, exc)

    # HTML fallback
    from bs4 import BeautifulSoup
    html_url = f"https://www.atcc.org/search?q={query.replace(' ', '+')}&c=Cells"
    resp2 = polite_get(session, html_url, min_delay=2.0, max_delay=4.0)
    if resp2 is None:
        return []
    try:
        soup = BeautifulSoup(resp2.text, "html.parser")
        # Check for __NEXT_DATA__
        tag = soup.find("script", {"id": "__NEXT_DATA__"})
        if tag:
            data = json.loads(tag.string)
            page_props = data.get("props", {}).get("pageProps", {})
            return (
                page_props.get("searchResults", {}).get("results", [])
                or page_props.get("products", [])
                or []
            )
    except Exception as exc:
        log.debug("ATCC HTML parse for '%s': %s", query, exc)
    return []


def _build_atcc_url(catalog_number: str) -> str:
    return f"https://www.atcc.org/products/{catalog_number.lower()}"


def product_to_catalog(
    product: dict,
    catalog_number_override: str,
    domain_override: list[str],
    existing: list[dict],
) -> dict | None:
    name = (
        product.get("name")
        or product.get("productName")
        or product.get("title")
        or ""
    ).strip()
    if not name:
        return None

    catalog_number = (
        product.get("productId")
        or product.get("catalogNumber")
        or product.get("sku")
        or catalog_number_override
    ).strip()

    price = None
    for pk in ["price", "listPrice", "unitPrice"]:
        raw = product.get(pk)
        if raw is not None:
            try:
                price = float(re.sub(r"[^\d.]", "", str(raw)))
            except ValueError:
                pass
            break

    desc = (product.get("description") or product.get("shortDescription") or "").strip()[:200]
    exp_types = list({"in_vitro"} | ({"in_vivo"} if "gut_health" in domain_override else set()))

    return {
        "id": next_id("MAT-", existing),
        "name": name[:100],
        "supplier": SUPPLIER,
        "catalogNumber": catalog_number,
        "packageSize": product.get("size") or product.get("packageSize") or "1 vial",
        "priceEur": price,
        "supplierUrl": _build_atcc_url(catalog_number),
        "applicableExperimentTypes": exp_types,
        "domain": domain_override,
        "notes": desc or f"ATCC reference cell line {catalog_number}",
    }


def scrape(existing_catalog: list[dict]) -> list[dict]:
    session = make_session()
    accumulated = list(existing_catalog)
    new_entries = []

    existing_keys = {
        f"{e.get('supplier','').lower()}|{e.get('catalogNumber','').lower()}"
        for e in existing_catalog
    }

    for target in CELL_LINE_TARGETS:
        query = target["query"]
        cat_num = target["catalog"]
        domains = target["domain"]
        key = f"atcc|{cat_num.lower()}"

        if key in existing_keys:
            log.info("[atcc] %s already in catalog, skipping", cat_num)
            continue

        log.info("[atcc] Fetching cell line: %s", query)
        products = search_cell_line(query, session)

        if products:
            entry = product_to_catalog(products[0], cat_num, domains, accumulated)
        else:
            # Build entry from known data even if scraping fails
            log.info("[atcc]  → API returned nothing, building from known data")
            entry = {
                "id": next_id("MAT-", accumulated),
                "name": query.split()[0] + " " + cat_num,
                "supplier": SUPPLIER,
                "catalogNumber": cat_num,
                "packageSize": "1 vial",
                "priceEur": None,
                "supplierUrl": _build_atcc_url(cat_num),
                "applicableExperimentTypes": ["in_vitro"],
                "domain": domains,
                "notes": f"ATCC reference cell line. See {_build_atcc_url(cat_num)} for current pricing.",
            }

        if entry:
            accumulated.append(entry)
            new_entries.append(entry)
            existing_keys.add(key)
            log.info("[atcc]  → Added %s", entry["name"])

    log.info("[atcc] Done — %d new catalog entries", len(new_entries))
    return new_entries


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Scrape ATCC cell line catalog")
    parser.add_argument("--out", default="../catalog.json")
    args = parser.parse_args()

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []

    new_entries = scrape(existing)
    merged = deduplicate(existing + new_entries, key="catalogNumber")
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"✓ catalog.json updated — {len(merged)} total ({len(new_entries)} new from ATCC)")
