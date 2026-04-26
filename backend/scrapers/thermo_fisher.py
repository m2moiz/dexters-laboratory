"""
Thermo Fisher Scientific product scraper.

Uses Thermo Fisher's product search API / HTML pages.
Produces catalog.json-compatible entries.
"""
import json
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import make_session, polite_get, next_id, deduplicate
from config import REAGENT_QUERIES

log = logging.getLogger("thermo_fisher")

SUPPLIER = "Thermo Fisher"
SEARCH_API = "https://www.thermofisher.com/api/products"
SEARCH_HTML = "https://www.thermofisher.com/us/en/home/life-science/search.html"


def _parse_price(raw) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    m = re.search(r"[\d,]+\.?\d*", str(raw).replace(",", ""))
    return float(m.group().replace(",", "")) if m else None


def _infer_domain(name: str, desc: str) -> list[str]:
    text = (name + " " + desc).lower()
    domains = []
    if any(k in text for k in ["dmso", "fbs", "serum", "media", "cell culture", "trypsin", "cryoprot", "viability"]):
        domains.append("cell_biology")
    if any(k in text for k in ["fitc", "dextran", "elisa", "claudin", "intestin", "probiotic", "il-6", "tnf"]):
        domains.append("gut_health")
    if any(k in text for k in ["antibody", "elisa", "crp", "immunoassay", "lateral flow", "nanoparticle"]):
        domains.append("diagnostics")
    if any(k in text for k in ["anaerob", "bicarbonate", "acetate", "electrode", "graphite", "carbon"]):
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


def search_products_api(query: str, session, page_size: int = 15) -> list[dict]:
    """Try the Thermo Fisher product search API."""
    params = {
        "keyword": query,
        "countPerPage": page_size,
        "page": 1,
        "sortBy": "relevance",
    }
    extra_headers = {
        "Accept": "application/json",
        "Referer": "https://www.thermofisher.com/",
    }
    resp = polite_get(
        session, SEARCH_API,
        params=params,
        extra_headers=extra_headers,
        min_delay=1.5, max_delay=3.0,
    )
    if resp is None:
        return []
    try:
        data = resp.json()
        return (
            data.get("products", [])
            or data.get("results", [])
            or data.get("items", [])
            or []
        )
    except Exception as exc:
        log.debug("API JSON parse for '%s': %s", query, exc)
        return []


def search_products_html(query: str, session, page_size: int = 15) -> list[dict]:
    """Fallback: parse Thermo Fisher HTML search results."""
    from bs4 import BeautifulSoup
    params = {
        "query": query,
        "productTypeParam": "Products",
        "resultPage": 1,
        "rows": page_size,
    }
    resp = polite_get(
        session, SEARCH_HTML,
        params=params,
        min_delay=2.0, max_delay=4.0,
    )
    if resp is None:
        return []

    products = []
    try:
        soup = BeautifulSoup(resp.text, "html.parser")

        # Try __NEXT_DATA__ first
        next_tag = soup.find("script", {"id": "__NEXT_DATA__"})
        if next_tag:
            data = json.loads(next_tag.string)
            page_props = data.get("props", {}).get("pageProps", {})
            results = page_props.get("searchResults", {}).get("results", [])
            if results:
                return results

        # Fallback: parse product cards from HTML
        cards = soup.select("[data-catalog-number], .product-thumbnail, .search-result-item")
        for card in cards[:page_size]:
            name = card.select_one(".product-name, h3, .title")
            cat_num = card.get("data-catalog-number") or card.select_one(".catalog-number, .catNum")
            price = card.select_one(".price, .list-price")

            if not name or not cat_num:
                continue

            cat_num_text = cat_num.text.strip() if hasattr(cat_num, "text") else str(cat_num)
            products.append({
                "name": name.text.strip(),
                "catalogNumber": cat_num_text,
                "price": price.text.strip() if price else None,
                "description": "",
            })
    except Exception as exc:
        log.debug("HTML parse for '%s': %s", query, exc)

    return products


def product_to_catalog(product: dict, existing: list[dict]) -> dict | None:
    name = (
        product.get("name")
        or product.get("productName")
        or product.get("title")
        or ""
    ).strip()
    if not name:
        return None

    catalog_number = (
        product.get("catalogNumber")
        or product.get("productNumber")
        or product.get("sku")
        or product.get("productId")
        or ""
    ).strip()
    if not catalog_number:
        return None

    # Price
    price = None
    for price_key in ["price", "listPrice", "unitPrice", "priceUSD", "priceEUR"]:
        raw = product.get(price_key)
        if raw is not None:
            price = _parse_price(raw)
            break

    # Package size
    package = (
        product.get("size")
        or product.get("packageSize")
        or product.get("quantity")
        or ""
    )
    if isinstance(package, list):
        package = package[0] if package else ""
    package = str(package).strip()

    desc = (product.get("description") or product.get("shortDescription") or "").strip()[:200]
    domain = _infer_domain(name, desc)
    exp_types = _infer_experiment_types(domain)
    url = f"https://www.thermofisher.com/order/catalog/product/{catalog_number}"

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
        "notes": desc or f"Thermo Fisher catalog #{catalog_number}",
    }


def scrape(existing_catalog: list[dict], max_per_query: int = 10) -> list[dict]:
    session = make_session()
    accumulated = list(existing_catalog)
    new_entries = []

    existing_keys = {
        f"{e.get('supplier','').lower()}|{e.get('catalogNumber','').lower()}"
        for e in existing_catalog
    }

    thermo_queries = (
        REAGENT_QUERIES["cell_biology"]
        + REAGENT_QUERIES["gut_health"]
        + REAGENT_QUERIES["diagnostics"]
    )

    for query in thermo_queries:
        log.info("[thermo] Searching: %s", query)
        products = search_products_api(query, session, page_size=max_per_query)
        if not products:
            log.info("  API returned nothing, trying HTML fallback...")
            products = search_products_html(query, session, page_size=max_per_query)

        added = 0
        for product in products:
            entry = product_to_catalog(product, accumulated)
            if entry is None:
                continue
            key = f"thermo fisher|{entry['catalogNumber'].lower()}"
            if key in existing_keys:
                continue
            accumulated.append(entry)
            new_entries.append(entry)
            existing_keys.add(key)
            added += 1
        log.info("  → %d new products for '%s'", added, query)

    log.info("[thermo] Done — %d new catalog entries", len(new_entries))
    return new_entries


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Scrape Thermo Fisher product catalog")
    parser.add_argument("--out", default="../catalog.json")
    parser.add_argument("--max-per-query", type=int, default=10)
    args = parser.parse_args()

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []

    new_entries = scrape(existing, max_per_query=args.max_per_query)
    merged = deduplicate(existing + new_entries, key="catalogNumber")
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"✓ catalog.json updated — {len(merged)} total ({len(new_entries)} new from Thermo Fisher)")
