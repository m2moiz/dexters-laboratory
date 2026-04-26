"""
Validates catalog.json and protocols.json against the expected schemas.
Run after scraping to check data quality before merging into the repo.

Usage:
  python validate.py --catalog ../catalog.json --protocols ../protocols.json
"""
import json
import sys
from pathlib import Path

CATALOG_REQUIRED = {"id", "name", "supplier", "catalogNumber", "supplierUrl", "domain"}
PROTOCOL_REQUIRED = {"id", "title", "source", "url", "domain", "experimentType", "summary"}
# These are optional enrichment fields — present in scraped entries, absent in legacy entries
PROTOCOL_OPTIONAL_RICH = {"authors", "institution", "tags", "stepCount",
                           "reagentsUsed", "equipmentNeeded", "metrics",
                           "citationCount", "keyParameters"}

VALID_SUPPLIERS = {
    "Sigma-Aldrich", "Thermo Fisher", "Addgene", "ATCC", "IDT",
    "Promega", "Qiagen", "NEB", "Bio-Rad", "Abcam", "R&D Systems", "Other",
}
VALID_EXPERIMENT_TYPES = {
    "in_vitro", "in_vivo", "ex_vivo", "electrochemical",
    "microbial", "computational", "other",
}
VALID_DOMAINS = {
    "diagnostics", "gut_health", "cell_biology", "climate",
    "oncology", "neuroscience", "immunology", "cardiology",
    "genomics", "proteomics", "microbiology", "other",
}


def validate_catalog(items: list[dict]) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    ids_seen = set()
    cat_nums_seen = set()

    for i, item in enumerate(items):
        loc = f"catalog[{i}] id={item.get('id', '?')}"

        # Required fields
        for field in CATALOG_REQUIRED:
            if not item.get(field):
                errors.append(f"{loc}: missing required field '{field}'")

        # ID uniqueness
        item_id = item.get("id", "")
        if item_id in ids_seen:
            errors.append(f"{loc}: duplicate id '{item_id}'")
        ids_seen.add(item_id)

        # Catalog number uniqueness within same supplier
        key = f"{item.get('supplier', '')}|{item.get('catalogNumber', '')}"
        if key in cat_nums_seen:
            warnings.append(f"{loc}: duplicate supplier+catalogNumber '{key}'")
        cat_nums_seen.add(key)

        # Supplier enum
        supplier = item.get("supplier", "")
        if supplier and supplier not in VALID_SUPPLIERS:
            warnings.append(f"{loc}: supplier '{supplier}' not in allowed list")

        # Domain list
        for d in item.get("domain", []):
            if d not in VALID_DOMAINS:
                warnings.append(f"{loc}: unknown domain '{d}'")

        # Experiment types list
        for et in item.get("applicableExperimentTypes", []):
            if et not in VALID_EXPERIMENT_TYPES:
                warnings.append(f"{loc}: unknown experimentType '{et}'")

        # URL format
        url = item.get("supplierUrl", "")
        if url and not url.startswith("http"):
            errors.append(f"{loc}: supplierUrl '{url}' must start with http/https")

        # Price sanity
        price = item.get("priceEur")
        if price is not None:
            if not isinstance(price, (int, float)):
                errors.append(f"{loc}: priceEur must be numeric, got {type(price).__name__}")
            elif price < 0 or price > 100000:
                warnings.append(f"{loc}: priceEur={price} seems out of range")

    return errors, warnings


def validate_protocols(items: list[dict]) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    ids_seen = set()
    urls_seen = set()

    for i, item in enumerate(items):
        loc = f"protocols[{i}] id={item.get('id', '?')}"

        for field in PROTOCOL_REQUIRED:
            if not item.get(field):
                errors.append(f"{loc}: missing required field '{field}'")

        item_id = item.get("id", "")
        if item_id in ids_seen:
            errors.append(f"{loc}: duplicate id '{item_id}'")
        ids_seen.add(item_id)

        url = item.get("url", "")
        if url in urls_seen:
            warnings.append(f"{loc}: duplicate URL '{url}'")
        urls_seen.add(url)

        if url and not url.startswith("http"):
            errors.append(f"{loc}: url '{url}' must start with http/https")

        for d in item.get("domain", []):
            if d not in VALID_DOMAINS:
                warnings.append(f"{loc}: unknown domain '{d}'")

        et = item.get("experimentType", "")
        if et and et not in VALID_EXPERIMENT_TYPES:
            warnings.append(f"{loc}: unknown experimentType '{et}'")

        summary = item.get("summary", "")
        if len(summary) < 10:
            warnings.append(f"{loc}: summary is very short ('{summary}')")

    return errors, warnings


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="../catalog.json")
    parser.add_argument("--protocols", default="../protocols.json")
    parser.add_argument("--strict", action="store_true", help="Exit 1 on warnings too")
    args = parser.parse_args()

    all_errors = []
    all_warnings = []

    cat_path = Path(args.catalog)
    if cat_path.exists():
        catalog = json.loads(cat_path.read_text(encoding="utf-8"))
        errs, warns = validate_catalog(catalog)
        all_errors += errs
        all_warnings += warns
        print(f"catalog.json: {len(catalog)} entries — {len(errs)} errors, {len(warns)} warnings")
    else:
        print(f"catalog.json not found at {cat_path}")

    proto_path = Path(args.protocols)
    if proto_path.exists():
        protocols = json.loads(proto_path.read_text(encoding="utf-8"))
        errs, warns = validate_protocols(protocols)
        all_errors += errs
        all_warnings += warns
        print(f"protocols.json: {len(protocols)} entries — {len(errs)} errors, {len(warns)} warnings")
    else:
        print(f"protocols.json not found at {proto_path}")

    if all_errors:
        print("\nERRORS:")
        for e in all_errors:
            print(f"  [ERR] {e}")

    if all_warnings:
        print("\nWARNINGS:")
        for w in all_warnings:
            print(f"  [WARN] {w}")

    if not all_errors and not all_warnings:
        print("\nAll checks passed.")

    if all_errors or (args.strict and all_warnings):
        sys.exit(1)


if __name__ == "__main__":
    main()
