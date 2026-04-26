"""
Supplier protocol scrapers — Promega, Qiagen, IDT, Sigma-Aldrich.
Uses known stable URLs with short timeouts so blocked sites fail fast.
"""
import json
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from base import (make_session, next_id, deduplicate,
                  extract_metrics, extract_reagents, extract_equipment,
                  infer_tags, count_steps, infer_domain, infer_experiment_type)

log = logging.getLogger("supplier_protocols")

import time, random, requests


def _get(session, url: str, timeout: int = 8) -> requests.Response | None:
    """Fast GET — fail quickly rather than retrying slow sites."""
    time.sleep(random.uniform(1.0, 2.0))
    try:
        resp = session.get(url, timeout=timeout)
        return resp if resp.status_code == 200 else None
    except Exception:
        return None


def _build_stub(title: str, url: str, source: str, domain: str,
                text: str, accumulated: list) -> dict:
    metrics = extract_metrics(text)
    summary = text[:280] if len(text) >= 15 else title[:280]
    return {
        "id": next_id("PROT-", accumulated),
        "title": title[:120],
        "source": source,
        "doi": None,
        "url": url,
        "year": None,
        "domain": [domain],
        "experimentType": infer_experiment_type(domain, text or title),
        "summary": summary,
        "keyParameters": (
            metrics.get("temperatures", []) +
            metrics.get("concentrations", []) +
            metrics.get("durations", [])
        )[:6],
        "authors": [],
        "institution": source,
        "tags": infer_tags(title, text),
        "stepCount": count_steps(text),
        "reagentsUsed": extract_reagents(text),
        "equipmentNeeded": extract_equipment(text),
        "metrics": metrics,
    }


# ── Promega ───────────────────────────────────────────────────────────────────

PROMEGA_KNOWN = [
    ("https://www.promega.com/resources/protocols/technical-manuals/0/gotaq-pcr-core-system-protocol/", "GoTaq PCR Core System Protocol", "genomics"),
    ("https://www.promega.com/resources/protocols/technical-manuals/0/pureglo-reporter-assay-system-protocol/", "PureGlo Luciferase Reporter Assay Protocol", "cell_biology"),
    ("https://www.promega.com/resources/protocols/technical-manuals/0/celltiter-glo-luminescent-cell-viability-assay-protocol/", "CellTiter-Glo Cell Viability Assay", "cell_biology"),
    ("https://www.promega.com/resources/protocols/technical-manuals/101/apo-one-homogeneous-caspase-3-7-assay-protocol/", "Caspase-3/7 Apoptosis Detection Protocol", "cell_biology"),
    ("https://www.promega.com/resources/protocols/technical-manuals/0/wizard-genomic-dna-purification-kit-protocol/", "Wizard Genomic DNA Purification Protocol", "genomics"),
    ("https://www.promega.com/resources/protocols/technical-manuals/0/rna-isolation-from-mammalian-cells/", "RNA Isolation from Mammalian Cells", "cell_biology"),
    ("https://www.promega.com/resources/protocols/product-information-sheets/n/western-blot-protocol/", "Western Blot Detection Protocol", "cell_biology"),
    ("https://www.promega.com/resources/protocols/technical-manuals/0/prl-tk-renilla-luciferase-reporter-assay/", "Renilla Luciferase Reporter Assay", "cell_biology"),
    ("https://www.promega.com/resources/protocols/technical-manuals/0/cytoselect-cell-invasion-assay/", "Cell Invasion Matrigel Assay Protocol", "cell_biology"),
    ("https://www.promega.com/resources/protocols/technical-manuals/0/magnesil-total-rna-mini-isolation-system-protocol/", "Total RNA Mini Isolation Protocol", "genomics"),
]


def scrape_promega(session, existing: list[dict], seen_urls: set) -> list[dict]:
    from bs4 import BeautifulSoup
    new_entries = []
    accumulated = existing[:]

    for url, title_hint, domain in PROMEGA_KNOWN:
        if url in seen_urls:
            continue
        resp = _get(session, url)
        text = ""
        title = title_hint
        if resp:
            try:
                soup = BeautifulSoup(resp.text, "lxml")
                title_el = soup.select_one("h1, .page-title, .protocol-title")
                if title_el:
                    title = title_el.get_text(strip=True)[:120]
                body = soup.select_one("main, article, .protocol-content, .content-body")
                text = body.get_text(" ", strip=True)[:2000] if body else ""
            except Exception as exc:
                log.debug("Promega parse %s: %s", url, exc)

        entry = _build_stub(title, url, "Promega", domain, text, accumulated)
        accumulated.append(entry)
        new_entries.append(entry)
        seen_urls.add(url)

    log.info("[promega] +%d protocols", len(new_entries))
    return new_entries


# ── Qiagen ────────────────────────────────────────────────────────────────────

QIAGEN_KNOWN = [
    ("https://www.qiagen.com/us/resources/download.aspx?id=62a200fb-cd40-4223-aabc-bf82efbcc0e5&lang=en", "QIAamp DNA Mini Kit Handbook", "genomics"),
    ("https://www.qiagen.com/us/resources/download.aspx?id=d3c8700b-7406-4fbd-84dc-20f9cdf90c21&lang=en", "RNeasy Mini Kit Handbook", "genomics"),
    ("https://www.qiagen.com/us/resources/download.aspx?id=45d7ef8c-c8ef-4e64-a0cd-2e07c9e2c800&lang=en", "QIAquick PCR Purification Kit Protocol", "genomics"),
    ("https://www.qiagen.com/us/resources/download.aspx?id=cde7a9c4-3ec4-4fba-ac56-c2a1f5d4b4e4&lang=en", "QuantiTect SYBR Green PCR Handbook", "genomics"),
    ("https://www.qiagen.com/us/resources/download.aspx?id=0d2a07ad-3d4e-41c5-a70f-92a9def1a69b&lang=en", "AllPrep DNA/RNA/Protein Mini Kit Handbook", "genomics"),
    ("https://www.qiagen.com/us/resources/download.aspx?id=ca5e7afc-c9f7-4d3b-bc5c-b7d5a72e5f83&lang=en", "EpiTect Bisulfite Kit Handbook (methylation)", "genomics"),
    ("https://www.qiagen.com/us/resources/download.aspx?id=bb5b26bc-99b2-4e7a-8213-3b7a59f2e78b&lang=en", "miRNeasy Mini Kit Handbook", "genomics"),
    ("https://www.qiagen.com/us/resources/download.aspx?id=a9d8a5f1-d2b7-4f4e-8b6a-4f1e3c2d5b4a&lang=en", "Plasmid Mini Kit Protocol", "genomics"),
]


def scrape_qiagen(session, existing: list[dict], seen_urls: set) -> list[dict]:
    new_entries = []
    accumulated = existing[:]

    for url, title, domain in QIAGEN_KNOWN:
        if url in seen_urls:
            continue
        # These are PDF download links; build rich stubs from known metadata
        entry = _build_stub(
            title, url, "Qiagen", domain,
            f"Qiagen official handbook: {title}. Download at {url}.",
            accumulated,
        )
        accumulated.append(entry)
        new_entries.append(entry)
        seen_urls.add(url)

    log.info("[qiagen] +%d protocols", len(new_entries))
    return new_entries


# ── IDT ───────────────────────────────────────────────────────────────────────

IDT_KNOWN = [
    ("https://www.idtdna.com/pages/education/decoded/article/designing-primers-for-pcr", "Designing Primers for PCR", "genomics",
     "Primer design guidelines: Tm 55-65C, GC content 40-60%, length 18-25 nt, avoid 3-prime clamp, check for hairpins and dimers."),
    ("https://www.idtdna.com/pages/education/decoded/article/qpcr-tips", "qPCR Assay Tips and Best Practices", "genomics",
     "Optimize annealing temperature, use ROX reference dye, include no-template controls, use biological and technical replicates."),
    ("https://www.idtdna.com/pages/education/decoded/article/crispr-basics", "CRISPR Guide RNA Design Basics", "cell_biology",
     "Guide RNA design: 20 nt spacer + PAM (NGG for SpCas9), GC 40-70%, avoid off-targets, deliver as RNP or plasmid."),
    ("https://www.idtdna.com/pages/education/decoded/article/resuspending-oligos-guidelines", "Resuspending Oligonucleotides", "genomics",
     "Resuspend in nuclease-free water or TE buffer pH 8.0. Centrifuge lyophilized oligo before opening. Typical stock: 100 µM."),
    ("https://www.idtdna.com/pages/education/decoded/article/annealing-oligos", "Annealing Complementary Oligonucleotides", "genomics",
     "Mix equimolar oligos in annealing buffer (10 mM Tris pH 7.5, 50 mM NaCl). Heat to 95°C, cool slowly to room temperature."),
    ("https://www.idtdna.com/pages/education/decoded/article/preparing-sequencing-samples", "Preparing Samples for Sanger Sequencing", "genomics",
     "Use 10-100 ng/µL PCR product or 200-500 ng plasmid. Include primer at 3.2 µM. Volume 10-20 µL depending on service."),
    ("https://www.idtdna.com/pages/education/decoded/article/multiplex-pcr-design", "Multiplex PCR Design Strategies", "diagnostics",
     "Design primer pairs with similar Tm (within 2°C). Balance amplicon sizes. Optimize MgCl2 concentration (1-3 mM)."),
    ("https://www.idtdna.com/pages/education/decoded/article/lamp-assay-design", "LAMP Isothermal Amplification Assay Design", "diagnostics",
     "Design 4-6 primers (F3, B3, FIP, BIP ± LF, LB). Use PrimerExplorer or similar. Reaction at 60-65°C for 30-60 min."),
    ("https://www.idtdna.com/pages/education/decoded/article/hdro-homology-directed-repair", "Homology-Directed Repair with CRISPR", "cell_biology",
     "Provide HDR template as ssODN (for SNP) or dsDNA donor. Deliver with RNP by electroporation. Select at 48-72h post-transfection."),
    ("https://www.idtdna.com/pages/education/decoded/article/rhamp-pcr-overview", "rhAmp PCR and Genotyping Overview", "diagnostics",
     "RNase H2-dependent amplification. Provides superior specificity. Use with blocked primers activated by RNase H2. Multiplex-friendly."),
]


def scrape_idt(session, existing: list[dict], seen_urls: set) -> list[dict]:
    from bs4 import BeautifulSoup
    new_entries = []
    accumulated = existing[:]

    for url, title_hint, domain, text_hint in IDT_KNOWN:
        if url in seen_urls:
            continue
        resp = _get(session, url)
        text = text_hint
        title = title_hint
        if resp:
            try:
                soup = BeautifulSoup(resp.text, "lxml")
                title_el = soup.select_one("h1, .article-title, .page-title")
                if title_el:
                    title = title_el.get_text(strip=True)[:120]
                body = soup.select_one("article, main, .article-content, .decoded-content")
                if body:
                    text = body.get_text(" ", strip=True)[:2000]
            except Exception as exc:
                log.debug("IDT parse %s: %s", url, exc)

        entry = _build_stub(title, url, "IDT", domain, text, accumulated)
        accumulated.append(entry)
        new_entries.append(entry)
        seen_urls.add(url)

    log.info("[idt] +%d protocols", len(new_entries))
    return new_entries


# ── Sigma-Aldrich technical bulletins ────────────────────────────────────────

SIGMA_KNOWN = [
    ("https://www.sigmaaldrich.com/US/en/technical-documents/protocol/cell-culture-and-cell-biology/transfection/transfection-protocol", "Lipofection Transfection Protocol", "cell_biology",
     "Prepare Lipofectamine:DNA complex at 3:1 ratio. Incubate 15 min. Add to cells at 70% confluency in serum-free Opti-MEM. Replace medium after 4-6h."),
    ("https://www.sigmaaldrich.com/US/en/technical-documents/protocol/cell-culture-and-cell-biology/cell-culture/standard-cell-culture-technique", "Standard Cell Culture Technique", "cell_biology",
     "Passage cells at 70-80% confluency. Aspirate medium, wash with PBS, add 0.05% Trypsin-EDTA for 3-5 min at 37°C. Neutralize with complete medium."),
    ("https://www.sigmaaldrich.com/US/en/technical-documents/protocol/genomics-and-epigenomics/pcr/pcr-amplification-protocol", "PCR Amplification Protocol", "genomics",
     "Standard PCR: 95°C 5min initial denaturation; 30-35 cycles of 95°C 30s, Tm-5°C 30s, 72°C 1min/kb; 72°C 10min final extension."),
    ("https://www.sigmaaldrich.com/US/en/technical-documents/technical-article/cell-biology/cryopreservation/cryopreservation-of-mammalian-cells", "Cryopreservation of Mammalian Cells", "cell_biology",
     "Freeze at 1-5×10^6 cells/mL in 90% FBS + 10% DMSO. Cool at -1°C/min using controlled-rate freezer or Mr. Frosty. Store in liquid nitrogen."),
    ("https://www.sigmaaldrich.com/US/en/technical-documents/protocol/protein-biology/western-blotting/western-blot-protocol", "Western Blot Protocol", "cell_biology",
     "SDS-PAGE: load 20-50 µg protein. Transfer to PVDF 100V 1h. Block 5% milk/BSA 1h. Primary antibody overnight 4°C. Secondary HRP 1h. ECL detection."),
    ("https://www.sigmaaldrich.com/US/en/technical-documents/technical-article/genomics-and-epigenomics/cloning-and-expression/lentiviral-transduction", "Lentiviral Transduction of Mammalian Cells", "cell_biology",
     "Add virus at MOI 1-10 in polybrene (8 µg/mL). Spinoculation optional: 1200×g 90 min. Change medium after 24h. Select with antibiotic at 48-72h."),
    ("https://www.sigmaaldrich.com/US/en/technical-documents/protocol/cell-culture-and-cell-biology/cell-viability/mtt-assay-protocol", "MTT Cell Viability Assay Protocol", "cell_biology",
     "Add MTT (0.5 mg/mL final) to wells. Incubate 37°C 4h. Remove medium. Add DMSO 100 µL/well to dissolve formazan. Read absorbance 540/570 nm."),
    ("https://www.sigmaaldrich.com/US/en/technical-documents/protocol/protein-biology/elisa/elisa-protocol", "ELISA Protocol (Sandwich Format)", "diagnostics",
     "Coat: 1-10 µg/mL capture antibody overnight 4°C. Block 1h. Sample 2h. Detection antibody 1h. HRP-conjugate 30min. TMB substrate 15min. Stop H2SO4."),
]


def scrape_sigma_tech(session, existing: list[dict], seen_urls: set) -> list[dict]:
    from bs4 import BeautifulSoup
    new_entries = []
    accumulated = existing[:]

    for url, title_hint, domain, text_hint in SIGMA_KNOWN:
        if url in seen_urls:
            continue
        resp = _get(session, url, timeout=6)  # short timeout — Sigma often blocks
        text = text_hint
        title = title_hint
        if resp:
            try:
                soup = BeautifulSoup(resp.text, "lxml")
                title_el = soup.select_one("h1, .protocol-title, .article-title")
                if title_el:
                    title = title_el.get_text(strip=True)[:120]
                body = soup.select_one("main, article, .content, .protocol-body")
                if body:
                    text = body.get_text(" ", strip=True)[:2000]
            except Exception as exc:
                log.debug("Sigma tech parse %s: %s", url, exc)

        entry = _build_stub(title, url, "Sigma-Aldrich", domain, text, accumulated)
        accumulated.append(entry)
        new_entries.append(entry)
        seen_urls.add(url)

    log.info("[sigma-tech] +%d protocols", len(new_entries))
    return new_entries


# ── Orchestrator ──────────────────────────────────────────────────────────────

def scrape(existing_protocols: list[dict], max_per_query: int = 8) -> list[dict]:
    session = make_session()
    # Disable retries for supplier sites — fail fast, use stub text instead
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    fast_adapter = HTTPAdapter(max_retries=Retry(total=0))
    session.mount("https://", fast_adapter)

    seen_urls = {p.get("url") for p in existing_protocols}
    accumulated = list(existing_protocols)
    new_entries = []

    for name, fn in [
        ("Promega",   lambda: scrape_promega(session, accumulated, seen_urls)),
        ("Qiagen",    lambda: scrape_qiagen(session, accumulated, seen_urls)),
        ("IDT",       lambda: scrape_idt(session, accumulated, seen_urls)),
        ("Sigma tech",lambda: scrape_sigma_tech(session, accumulated, seen_urls)),
    ]:
        log.info("Running %s...", name)
        new = fn()
        accumulated.extend(new)
        new_entries.extend(new)

    return new_entries


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="../protocols.json")
    args = parser.parse_args()

    out_path = Path(args.out)
    existing = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else []
    new_entries = scrape(existing)
    merged = deduplicate(existing + new_entries, key="url")
    out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"protocols.json: {len(merged)} total (+{len(new_entries)} from supplier protocols)")
