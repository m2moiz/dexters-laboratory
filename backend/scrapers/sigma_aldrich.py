"""
Sigma-Aldrich (MilliporeSigma) product scraper.

Uses their product search JSON API endpoint (same endpoint their site uses).
Returns reagent entries formatted for catalog.json.

Rate limit: 1–2 req/s with jitter. If blocked (403), wait longer.
"""
import json
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import make_session, polite_get, next_id, deduplicate
from config import REAGENT_QUERIES

log = logging.getLogger("sigma_aldrich")

SUPPLIER = "Sigma-Aldrich"

# Product search API (used internally by the Sigma website)
SEARCH_URL = "https://www.sigmaaldrich.com/api/v1/products/search"
PRODUCT_URL = "https://www.sigmaaldrich.com/US/en/product"

# Fallback: HTML search page (if API is blocked)
SEARCH_HTML_URL = "https://www.sigmaaldrich.com/US/en/search#catalog"


def _parse_price(price_raw) -> float | None:
    """Parse price from various formats to EUR float."""
    if price_raw is None:
        return None
    if isinstance(price_raw, (int, float)):
        return float(price_raw)
    price_str = str(price_raw).replace(",", "")
    m = re.search(r"[\d]+\.?\d*", price_str)
    return float(m.group()) if m else None


def _build_url(brand: str, product_number: str) -> str:
    brand_slug = (brand or "sigma").lower().replace(" ", "-")
    return f"https://www.sigmaaldrich.com/US/en/product/{brand_slug}/{product_number.lower()}"


def _infer_domain(name: str, desc: str) -> list[str]:
    text = (name + " " + desc).lower()
    domains = []
    if any(k in text for k in ["trehalose", "dmso", "fbs", "cryoprot", "hela", "cell culture", "trypsin"]):
        domains.append("cell_biology")
    if any(k in text for k in ["fitc", "claudin", "lactobacillus", "probiotic", "intestin", "tight junction"]):
        domains.append("gut_health")
    if any(k in text for k in ["crp", "antibody anti-", "nanopart", "electrode", "nafion", "biosensor"]):
        domains.append("diagnostics")
    if any(k in text for k in ["sporomusa", "bicarbonate", "acetate", "cathode", "anaerob", "graphite"]):
        domains.append("climate")
    return domains or ["cell_biology"]


def _infer_experiment_types(domains: list[str]) -> list[str]:
    type_map = {
        "cell_biology": "in_vitro",
        "gut_health": "in_vivo",
        "diagnostics": "electrochemical",
        "climate": "microbial",
    }
    return list({type_map.get(d, "in_vitro") for d in domains})


def search_products(query: str, session, page_size: int = 15) -> list[dict]:
    """
    Try the Sigma JSON API. Returns list of raw product dicts.
    Falls back to empty list if the endpoint is unavailable.
    """
    # Method 1: JSON API
    params = {
        "query": query,
        "region": "US",
        "language": "en",
        "page": 1,
        "pageSize": page_size,
        "sort": "relevance",
        "filter": "",
    }
    extra_headers = {
        "Accept": "application/json",
        "Referer": "https://www.sigmaaldrich.com/",
        "X-Requested-With": "XMLHttpRequest",
    }
    resp = polite_get(
        session, SEARCH_URL,
        params=params,
        extra_headers=extra_headers,
        min_delay=1.5, max_delay=3.0,
    )
    if resp is not None:
        try:
            data = resp.json()
            # The response structure varies; try common paths
            products = (
                data.get("results", [])
                or data.get("products", [])
                or data.get("items", [])
            )
            if products:
                return products
        except Exception as exc:
            log.debug("JSON parse for '%s': %s", query, exc)

    # Method 2: catalog search page (returns JSON in __NEXT_DATA__ script tag)
    from bs4 import BeautifulSoup
    search_page = f"https://www.sigmaaldrich.com/US/en/search#catalog?query={query.replace(' ', '+')}&perpage=15"
    resp2 = polite_get(session, search_page, min_delay=2.0, max_delay=4.0)
    if resp2 is None:
        return []
    try:
        soup = BeautifulSoup(resp2.text, "html.parser")
        next_data_tag = soup.find("script", {"id": "__NEXT_DATA__"})
        if next_data_tag:
            next_data = json.loads(next_data_tag.string)
            # Drill into Next.js page props to find product list
            page_props = next_data.get("props", {}).get("pageProps", {})
            results = (
                page_props.get("searchResults", {}).get("results", [])
                or page_props.get("products", [])
            )
            return results
    except Exception as exc:
        log.debug("Next.js data parse for '%s': %s", query, exc)

    return []


def product_to_catalog(product: dict, existing: list[dict]) -> dict | None:
    """Convert a raw Sigma product dict to catalog.json format."""
    # Field names differ between API versions; try multiple keys
    name = (
        product.get("name")
        or product.get("productName")
        or product.get("title")
        or ""
    ).strip()
    if not name:
        return None

    catalog_number = (
        product.get("productNumber")
        or product.get("catalogNumber")
        or product.get("sku")
        or product.get("productId")
        or ""
    ).strip()
    if not catalog_number:
        return None

    brand = product.get("brand", {})
    brand_key = brand.get("key", "") if isinstance(brand, dict) else str(brand)

    # Price: try several possible locations
    price = None
    for price_key in ["price", "listPrice", "unitPrice", "pricePerUnit"]:
        raw = product.get(price_key)
        if raw is not None:
            price = _parse_price(raw)
            break
    if price is None:
        # Some responses nest pricing
        pricing = product.get("pricing", {}) or {}
        raw = pricing.get("listPrice") or pricing.get("price")
        price = _parse_price(raw)

    # Package size
    package = (
        product.get("packageSize")
        or product.get("size")
        or product.get("quantity")
        or product.get("packSize")
        or ""
    )
    if isinstance(package, list):
        package = package[0] if package else ""
    package = str(package).strip()

    # Description / notes
    desc = (
        product.get("description")
        or product.get("shortDescription")
        or ""
    ).strip()[:200]

    url = _build_url(brand_key, catalog_number)
    domain = _infer_domain(name, desc)
    exp_types = _infer_experiment_types(domain)

    return {
        "id": next_id("MAT-", existing),
        "name": name[:100],
        "supplier": SUPPLIER,
        "catalogNumber": catalog_number,
        "packageSize": package or "see website",
        "priceEur": price,
        "supplierUrl": url,
        "applicableExperimentTypes": exp_types,
        "domain": domain,
        "notes": desc or f"Sigma-Aldrich catalog #{catalog_number}",
    }


def scrape(
    existing_catalog: list[dict],
    max_per_query: int = 10,
) -> list[dict]:
    session = make_session()
    accumulated = list(existing_catalog)
    new_entries = []

    existing_catalog_nums = {
        f"{e.get('supplier','').lower()}|{e.get('catalogNumber','').lower()}"
        for e in existing_catalog
    }

    all_queries = []
    for domain_queries in REAGENT_QUERIES.values():
        all_queries.extend(domain_queries)
    # Sigma is best for general reagent + cell biology + gut health
    sigma_queries = (
        REAGENT_QUERIES["cell_biology"]
        + REAGENT_QUERIES["gut_health"]
        + REAGENT_QUERIES["diagnostics"]
        + REAGENT_QUERIES["climate"]
    )

    for query in sigma_queries:
        log.info("[sigma] Searching: %s", query)
        products = search_products(query, session, page_size=max_per_query)
        added = 0
        for product in products:
            entry = product_to_catalog(product, accumulated)
            if entry is None:
                continue
            key = f"sigma-aldrich|{entry['catalogNumber'].lower()}"
            if key in existing_catalog_nums:
                continue
            accumulated.append(entry)
            new_entries.append(entry)
            existing_catalog_nums.add(key)
            added += 1
        log.info("  → %d new products for query '%s'", added, query)

    log.info("[sigma] Done — %d new catalog entries", len(new_entries))
    return new_entries


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Scrape Sigma-Aldrich product catalog")
    parser.add_argument("--out", default="../catalog.json")
    parser.add_argument("--max-per-query", type=int, default=10)
    args = parser.parse_args()

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []

    new_entries = scrape(existing, max_per_query=args.max_per_query)
    merged = deduplicate(existing + new_entries, key="catalogNumber")
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"✓ catalog.json updated — {len(merged)} total ({len(new_entries)} new from Sigma)")
