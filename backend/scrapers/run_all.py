"""
Orchestrator — runs all scrapers and merges results.

Usage:
  py run_all.py [options]

Key options:
  --protocols-io-token TOKEN   protocols.io client access token
  --max-per-query N            results per search query (default 10)
  --skip-X                     skip a specific scraper
  --validate                   run schema validation after scraping
  --protocols-only             skip catalog scrapers
  --catalog-only               skip protocol scrapers

Full run example:
  py run_all.py --protocols-io-token <token> --validate

Quick protocol-only run (all free, no auth):
  py run_all.py --skip-sigma --skip-thermo --skip-atcc --protocols-only --validate
"""
import argparse
import json
import logging
import sys
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import deduplicate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("run_all")


def load_json(path: Path) -> list:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            log.error("Failed to parse %s: %s", path, exc)
    return []


def save_json(path: Path, data: list) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("Saved %d items to %s", len(data), path)


def reassign_ids(items: list[dict], prefix: str) -> list[dict]:
    for i, item in enumerate(items, start=1):
        item["id"] = f"{prefix}{i:03d}"
    return items


def clean_blanks(items: list[dict], required_field: str = "title") -> list[dict]:
    """Remove entries with blank required fields."""
    bad_values = {"", "Untitled", "Untitled protocol", None}
    before = len(items)
    items = [e for e in items if e.get(required_field, "") not in bad_values]
    removed = before - len(items)
    if removed:
        log.info("Removed %d blank entries", removed)
    return items


def print_stats(label: str, items: list[dict], domain_field: str = "domain",
                source_field: str = "supplier") -> None:
    from collections import Counter
    if source_field in (items[0] if items else {}):
        by_source = Counter(e.get(source_field, "?") for e in items)
        print(f"  {label}: {len(items)} entries")
        for s, n in sorted(by_source.items(), key=lambda x: -x[1])[:8]:
            print(f"    {s}: {n}")
    else:
        by_source = Counter(e.get("source", "?") for e in items)
        print(f"  {label}: {len(items)} entries")
        for s, n in sorted(by_source.items(), key=lambda x: -x[1])[:10]:
            print(f"    {s}: {n}")


def main():
    parser = argparse.ArgumentParser(description="Run all scrapers")
    # Output paths
    parser.add_argument("--catalog-out",   default="../catalog.json")
    parser.add_argument("--protocols-out", default="../protocols.json")
    # Skip flags — catalog
    parser.add_argument("--skip-sigma",    action="store_true")
    parser.add_argument("--skip-thermo",   action="store_true")
    parser.add_argument("--skip-atcc",     action="store_true")
    # Skip flags — protocols
    parser.add_argument("--skip-protocols-io",  action="store_true")
    parser.add_argument("--skip-pubmed",         action="store_true")
    parser.add_argument("--skip-addgene",        action="store_true")
    parser.add_argument("--skip-bio-protocol",   action="store_true")
    parser.add_argument("--skip-nature",         action="store_true")
    parser.add_argument("--skip-jove",           action="store_true")
    parser.add_argument("--skip-openwetware",    action="store_true")
    parser.add_argument("--skip-supplier-protocols", action="store_true")
    parser.add_argument("--skip-papers",             action="store_true")
    # Mode shortcuts
    parser.add_argument("--protocols-only", action="store_true")
    parser.add_argument("--catalog-only",   action="store_true")
    parser.add_argument("--papers-only",    action="store_true")
    # Auth (optional — scrapers work without these)
    parser.add_argument("--protocols-io-token", default=None)
    # Tuning
    parser.add_argument("--max-per-query", type=int, default=10)
    parser.add_argument("--validate", action="store_true")
    args = parser.parse_args()

    catalog_path   = Path(args.catalog_out)
    protocols_path = Path(args.protocols_out)
    papers_path    = Path(args.catalog_out).parent / "papers.json"

    catalog   = load_json(catalog_path)
    protocols = load_json(protocols_path)
    papers    = load_json(papers_path)

    n_cat_start   = len(catalog)
    n_proto_start = len(protocols)
    n_paper_start = len(papers)

    print(f"\n{'='*60}")
    print(f"Scrape run starting")
    print(f"  catalog.json:   {n_cat_start} existing entries")
    print(f"  protocols.json: {n_proto_start} existing entries")
    print(f"{'='*60}\n")

    # ── CATALOG scrapers ───────────────────────────────────────────
    if not args.protocols_only:

        if not args.skip_sigma:
            try:
                from sigma_aldrich import scrape as fn
                log.info("Running Sigma-Aldrich scraper...")
                new = fn(catalog, max_per_query=args.max_per_query)
                catalog = deduplicate(catalog + new, key="catalogNumber")
                print(f"  Sigma-Aldrich: +{len(new)}")
            except Exception as exc:
                log.error("Sigma scraper failed: %s", exc)
        else:
            print("  Sigma-Aldrich: skipped")

        if not args.skip_thermo:
            try:
                from thermo_fisher import scrape as fn
                log.info("Running Thermo Fisher scraper...")
                new = fn(catalog, max_per_query=args.max_per_query)
                catalog = deduplicate(catalog + new, key="catalogNumber")
                print(f"  Thermo Fisher: +{len(new)}")
            except Exception as exc:
                log.error("Thermo scraper failed: %s", exc)
        else:
            print("  Thermo Fisher: skipped")

        if not args.skip_atcc:
            try:
                from atcc import scrape as fn
                log.info("Running ATCC scraper...")
                new = fn(catalog)
                catalog = deduplicate(catalog + new, key="catalogNumber")
                print(f"  ATCC:          +{len(new)}")
            except Exception as exc:
                log.error("ATCC scraper failed: %s", exc)
        else:
            print("  ATCC: skipped")

    # ── PROTOCOL scrapers ──────────────────────────────────────────
    if not args.catalog_only:

        if not args.skip_protocols_io:
            try:
                from protocols_io import scrape as fn
                log.info("Running protocols.io scraper...")
                new = fn(protocols, token=args.protocols_io_token,
                         max_per_query=args.max_per_query)
                protocols = deduplicate(protocols + new, key="url")
                print(f"  protocols.io:  +{len(new)}")
            except Exception as exc:
                log.error("protocols.io failed: %s", exc)
        else:
            print("  protocols.io: skipped")

        if not args.skip_pubmed:
            try:
                from pubmed import scrape as fn
                log.info("Running PubMed scraper...")
                new = fn(protocols, max_per_query=args.max_per_query)
                protocols = deduplicate(protocols + new, key="url")
                print(f"  PubMed:        +{len(new)}")
            except Exception as exc:
                log.error("PubMed failed: %s", exc)
        else:
            print("  PubMed: skipped")

        if not args.skip_bio_protocol:
            try:
                from bio_protocol import scrape as fn
                log.info("Running bio-protocol.org scraper...")
                new = fn(protocols, max_per_query=args.max_per_query)
                protocols = deduplicate(protocols + new, key="url")
                print(f"  bio-protocol:  +{len(new)}")
            except Exception as exc:
                log.error("bio-protocol failed: %s", exc)
        else:
            print("  bio-protocol.org: skipped")

        if not args.skip_nature:
            try:
                from nature_protocols import scrape as fn
                log.info("Running Nature Protocols scraper...")
                new = fn(protocols, max_per_query=args.max_per_query)
                protocols = deduplicate(protocols + new, key="url")
                print(f"  Nature Protocols: +{len(new)}")
            except Exception as exc:
                log.error("Nature Protocols failed: %s", exc)
        else:
            print("  Nature Protocols: skipped")

        if not args.skip_jove:
            try:
                from jove import scrape as fn
                log.info("Running JoVE scraper...")
                new = fn(protocols, max_per_query=args.max_per_query)
                protocols = deduplicate(protocols + new, key="url")
                print(f"  JoVE:          +{len(new)}")
            except Exception as exc:
                log.error("JoVE failed: %s", exc)
        else:
            print("  JoVE: skipped")

        if not args.skip_openwetware:
            try:
                from openwetware import scrape as fn
                log.info("Running OpenWetWare scraper...")
                new = fn(protocols, max_per_query=args.max_per_query)
                protocols = deduplicate(protocols + new, key="url")
                print(f"  OpenWetWare:   +{len(new)}")
            except Exception as exc:
                log.error("OpenWetWare failed: %s", exc)
        else:
            print("  OpenWetWare: skipped")

        if not args.skip_supplier_protocols:
            try:
                from supplier_protocols import scrape as fn
                log.info("Running supplier protocol scrapers...")
                new = fn(protocols, max_per_query=args.max_per_query)
                protocols = deduplicate(protocols + new, key="url")
                print(f"  Supplier protocols: +{len(new)}")
            except Exception as exc:
                log.error("Supplier protocols failed: %s", exc)
        else:
            print("  Supplier protocols: skipped")

        if not args.skip_addgene:
            try:
                from addgene import scrape as fn
                log.info("Running Addgene scraper...")
                new_protos, new_cats = fn(protocols, catalog)
                protocols = deduplicate(protocols + new_protos, key="url")
                catalog   = deduplicate(catalog + new_cats, key="catalogNumber")
                print(f"  Addgene:       +{len(new_protos)} protocols, +{len(new_cats)} catalog")
            except Exception as exc:
                log.error("Addgene failed: %s", exc)
        else:
            print("  Addgene: skipped")

    # ── PAPERS scraper ────────────────────────────────────────────
    if not args.catalog_only and not args.protocols_only and not args.skip_papers:
        try:
            from papers import scrape as fn
            log.info("Running papers scraper (PubMed + arXiv + Semantic Scholar)...")
            new = fn(papers, max_per_query=args.max_per_query)
            papers = deduplicate(papers + new, key="url")
            print(f"  Papers:        +{len(new)}")
        except Exception as exc:
            log.error("Papers scraper failed: %s", exc)
    else:
        print("  Papers: skipped")

    # ── Cleanup & save ────────────────────────────────────────────
    protocols = clean_blanks(protocols, required_field="title")
    catalog   = clean_blanks(catalog,   required_field="name")
    papers    = clean_blanks(papers,    required_field="title")

    catalog   = reassign_ids(catalog,   "MAT-")
    protocols = reassign_ids(protocols, "PROT-")
    for i, p in enumerate(papers, 1):
        p["id"] = f"PAPER-{i:03d}"

    save_json(catalog_path,   catalog)
    save_json(protocols_path, protocols)
    save_json(papers_path,    papers)

    print(f"\n{'='*60}")
    print(f"Scrape complete")
    print_stats("catalog.json",   catalog,   source_field="supplier")
    print_stats("protocols.json", protocols, source_field="source")
    print(f"  New catalog entries:   +{len(catalog) - n_cat_start}")
    print(f"  New protocol entries:  +{len(protocols) - n_proto_start}")
    print(f"  New paper entries:     +{len(papers) - n_paper_start}")
    print(f"{'='*60}\n")

    if args.validate:
        result = subprocess.run(
            [sys.executable, "validate.py",
             "--catalog", str(catalog_path),
             "--protocols", str(protocols_path)],
            capture_output=False,
            cwd=str(Path(__file__).parent),
        )
        if result.returncode != 0:
            print("[WARN] Validation errors detected.")
            sys.exit(1)

    print("Files ready:")
    print(f"  {catalog_path.resolve()}")
    print(f"  {protocols_path.resolve()}")


if __name__ == "__main__":
    main()
