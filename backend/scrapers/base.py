"""
Base utilities — session factory, rate limiting, anti-bot bypass, rich text extraction.

Anti-scraper strategy (priority order):
  1. curl_cffi  — impersonates real Chrome/Firefox TLS + HTTP/2 fingerprint, no cookies needed
  2. cloudscraper — Cloudflare JS-challenge solver
  3. requests   — plain fallback (may fail on Cloudflare-protected sites)
"""
import logging
import random
import re
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}

# Per-domain polite delays (min, max) in seconds
DOMAIN_DELAYS = {
    "protocols.io":               (1.5, 3.0),
    "bio-protocol.org":           (2.0, 3.5),
    "nature.com":                 (2.0, 3.5),
    "jove.com":                   (2.0, 4.0),
    "openwetware.org":            (0.8, 1.5),
    "promega.com":                (1.5, 3.0),
    "qiagen.com":                 (1.5, 3.0),
    "idtdna.com":                 (1.5, 3.0),
    "addgene.org":                (1.5, 3.0),
    "atcc.org":                   (2.0, 3.5),
    "sigmaaldrich.com":           (2.0, 4.0),
    "thermofisher.com":           (2.0, 4.0),
    "pubmed.ncbi.nlm.nih.gov":   (0.3, 0.8),
    "eutils.ncbi.nlm.nih.gov":   (0.3, 0.8),
    "arxiv.org":                  (0.5, 1.5),
    "api.semanticscholar.org":    (0.5, 1.5),
    "biorxiv.org":                (1.0, 2.0),
    "megazyme.com":               (1.5, 3.0),
    "dsmz.de":                    (2.0, 4.0),
    "bio-rad.com":                (1.5, 3.0),
    "neb.com":                    (1.5, 3.0),
}


def make_session(retries: int = 2, backoff: float = 1.0, fast: bool = False):
    """
    Return the best available HTTP session with anti-bot support.

    Priority:
      1. curl_cffi  — best: real TLS fingerprint impersonation (Chrome124), no cookies needed
      2. cloudscraper — good for Cloudflare-protected pages
      3. requests   — plain fallback
    """
    # 1. curl_cffi: impersonates Chrome at the TLS/HTTP2 layer
    try:
        from curl_cffi.requests import Session as CurlSession
        session = CurlSession(impersonate="chrome124")
        session.headers.update(HEADERS)
        return session
    except ImportError:
        pass

    # 2. cloudscraper: Cloudflare JS-challenge bypass
    try:
        import cloudscraper
        scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
        scraper.headers.update(HEADERS)
        return scraper
    except ImportError:
        pass

    # 3. Plain requests with retry
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry

    session = requests.Session()
    total = 0 if fast else retries
    retry = Retry(
        total=total,
        backoff_factor=backoff,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(HEADERS)
    return session


def make_cloudscraper():
    """Return a cloudscraper session for Cloudflare-protected sites."""
    try:
        import cloudscraper
        scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
        scraper.headers.update(HEADERS)
        return scraper
    except ImportError:
        logging.getLogger("base").warning("cloudscraper not installed — falling back to make_session()")
        return make_session()


def _domain_delay(url: str) -> tuple[float, float]:
    for domain, delay in DOMAIN_DELAYS.items():
        if domain in url:
            return delay
    return (1.0, 2.5)


def polite_get(
    session,
    url: str,
    params: dict = None,
    timeout: int = 15,
    extra_headers: dict = None,
    min_delay: float = None,
    max_delay: float = None,
    **_ignored,
) -> object:
    """
    Rate-limited GET with per-domain delay and optional header override.
    Cookies are handled transparently by the session (curl_cffi/cloudscraper).
    """
    lo, hi = _domain_delay(url)
    time.sleep(random.uniform(min_delay or lo, max_delay or hi))

    headers = {}
    if extra_headers:
        headers.update(extra_headers)

    try:
        resp = session.get(url, params=params, headers=headers, timeout=timeout)
        if resp.status_code == 200:
            return resp
        logging.getLogger("base").debug("GET %s -> %d", url[:80], resp.status_code)
        return None
    except Exception as exc:
        logging.getLogger("base").debug("GET %s failed: %s", url[:60], exc)
        return None


# ── ID / dedup helpers ────────────────────────────────────────────────────────

def next_id(prefix: str, existing: list[dict], id_key: str = "id") -> str:
    nums = [
        int(e[id_key][len(prefix):])
        for e in existing
        if e.get(id_key, "").startswith(prefix)
        and e[id_key][len(prefix):].isdigit()
    ]
    return f"{prefix}{max(nums, default=0) + 1:03d}"


def deduplicate(items: list[dict], key: str) -> list[dict]:
    seen, out = set(), []
    for item in items:
        val = item.get(key)
        if val and val not in seen:
            seen.add(val)
            out.append(item)
    return out


# ── Rich extraction helpers ───────────────────────────────────────────────────

_TEMP_RE = re.compile(r"-?\d+(?:\.\d+)?\s*°?[Cc]\b")
_CONC_RE = re.compile(
    r"\d+(?:\.\d+)?\s*(?:mM|µM|uM|nM|mg/mL|µg/mL|ug/mL|ng/mL|ng/uL|mg/L|g/L"
    r"|%\s*(?:v/v|w/v|v|w)?|M\b|mol/L|units?/mL)"
)
_DUR_RE  = re.compile(r"\d+(?:\.\d+)?\s*(?:minutes?|min|hours?|h\b|days?|d\b|weeks?|seconds?|sec|s\b)")
_VOL_RE  = re.compile(r"\d+(?:\.\d+)?\s*(?:mL|µL|uL|nL|L\b|ml|ul)")
_RPM_RE  = re.compile(r"\d[\d,]*\s*(?:rpm|rcf|×\s*g|xg)\b", re.IGNORECASE)
_PH_RE   = re.compile(r"pH\s*\d+(?:\.\d+)?")


def extract_metrics(text: str) -> dict:
    def _uniq(ms):
        seen, o = set(), []
        [(seen.add(m.strip()), o.append(m.strip())) for m in ms if m.strip() not in seen]
        return o[:8]
    return {
        "temperatures":   _uniq(_TEMP_RE.findall(text)),
        "concentrations": _uniq(_CONC_RE.findall(text)),
        "durations":      _uniq(_DUR_RE.findall(text)),
        "volumes":        _uniq(_VOL_RE.findall(text)),
        "speeds":         _uniq(_RPM_RE.findall(text)),
        "ph_values":      _uniq(_PH_RE.findall(text)),
    }


_REAGENT_KW = [
    "DMSO","PBS","DMEM","RPMI","FBS","BSA","EDTA","HEPES","trehalose","sucrose",
    "glycerol","methanol","ethanol","trypsin","collagenase","dispase","DNase","RNase",
    "paraformaldehyde","formaldehyde","glutaraldehyde","Triton X-100","NP-40","SDS",
    "Tween-20","DAPI","Hoechst","propidium iodide","annexin V","FITC","PE","APC",
    "chloroform","isopropanol","TRIzol","agarose","acrylamide","bromophenol blue",
    "acetate","butyrate","propionate","IPTG","doxycycline","puromycin","blasticidin",
    "hygromycin","G418","penicillin","streptomycin","ampicillin","kanamycin",
    "LPS","PMA","ionomycin","EDC","NHS","sulfo-NHS","nafion","chitosan","polyaniline",
    "methyl viologen","riboflavin","resazurin","cysteine","collagen","fibronectin",
    "Matrigel","laminin","gelatin","heparin","ATP","GTP","NAD","NADH","NADPH",
    "succinate","fumarate","formate","pyruvate","PDMS","calcein",
]

_EQUIP_KW = [
    "centrifuge","microcentrifuge","ultracentrifuge","incubator","CO2 incubator",
    "shaker incubator","PCR machine","thermocycler","real-time PCR","confocal",
    "fluorescence microscope","flow cytometer","FACS","plate reader","spectrophotometer",
    "gel electrophoresis","autoclave","biosafety cabinet","liquid nitrogen tank",
    "Mr. Frosty","potentiostat","HPLC","ion chromatography","gas chromatography",
    "mass spectrometer","NMR","UV-Vis","BioAnalyzer","Nanodrop","anaerobic chamber",
    "sonicator","vortex","water bath","heat block","rotator","magnetic stirrer",
    "microplate reader","western blot","transfer apparatus","electrophoresis",
    "Bioruptor","ChemiDoc","ImageJ","FlowJo","TEER","syringe pump","microfluidic",
    "plasma cleaner","spin coater","glovebox",
]


def extract_reagents(text: str) -> list[str]:
    tl = text.lower()
    return [r for r in _REAGENT_KW if r.lower() in tl][:15]


def extract_equipment(text: str) -> list[str]:
    tl = text.lower()
    return [e for e in _EQUIP_KW if e.lower() in tl][:10]


_TAG_MAP = {
    "cryopreservation": ["cryo","freeze","frozen","thaw","cryoprotect"],
    "cell_culture":     ["cell culture","passage","subculture","split cells"],
    "transfection":     ["transfect","lipofectamine","electroporation","lentivir"],
    "CRISPR":           ["crispr","cas9","cas12","guide rna","sgrna"],
    "qPCR":             ["qpcr","real-time pcr","rt-pcr","sybr green","taqman"],
    "Western_blot":     ["western blot","immunoblot","sds-page"],
    "ELISA":            ["elisa","sandwich assay","antibody capture"],
    "flow_cytometry":   ["flow cytometry","facs","fluorescent antibody"],
    "biosensor":        ["biosensor","electrode","voltammetry","impedance"],
    "lateral_flow":     ["lateral flow","nitrocellulose","test strip"],
    "gut_permeability": ["permeability","fitc-dextran","tight junction","teer"],
    "probiotic":        ["probiotic","lactobacillus","bifidobacterium"],
    "electrosynthesis": ["electrosynthesis","bioelectrochemical","biocathode"],
    "anaerobic":        ["anaerobic","anoxic","oxygen-free","glovebox"],
    "DNA_extraction":   ["dna extraction","genomic dna","nucleic acid"],
    "RNA_extraction":   ["rna extraction","trizol","rneasy"],
    "microscopy":       ["microscop","confocal","fluorescen"],
    "immunostaining":   ["immunostain","immunofluoresc","antibody stain"],
    "apoptosis":        ["apoptosis","annexin","caspase","programmed cell death"],
    "cloning":          ["cloning","restriction enzyme","ligation","gibson assembly"],
    "microfluidics":    ["microfluidic","pdms","soft lithograph","syringe pump"],
    "barrier_function": ["transwell","teer","paracellular","permeability insert"],
}


def infer_tags(title: str, text: str) -> list[str]:
    combined = (title + " " + text).lower()
    return [tag for tag, kws in _TAG_MAP.items() if any(k in combined for k in kws)]


def count_steps(text: str) -> int:
    n = len(re.findall(r"^\s*\d+[\.\)]\s+\S", text, re.MULTILINE))
    return n if n > 2 else 0


_DOMAIN_KW = {
    "cell_biology": ["cryo","hela","trehalose","cell viab","cell culture","mammalian cell","cell line","dmso freeze","post-thaw","caco-2","caco2"],
    "gut_health":   ["gut","intestin","probiotic","claudin","fitc-dextran","tight junction","microbiome","colon","lactobacillus","caco-2","teer","transwell"],
    "diagnostics":  ["biosensor","crp","c-reactive","electrochemical","immunoassay","lateral flow","point-of-care","voltammetry","amperometric"],
    "climate":      ["sporomusa","bioelectrochem","electrosynthes","co2 reduction","acetate product","biocathode","microbial electro","cathode potential","succinate"],
    "genomics":     ["pcr","sequencing","crispr","cloning","dna extract","rna extract","qpcr","genome","transcriptome","chip-seq"],
    "proteomics":   ["western blot","protein purif","mass spectrometry","elisa","sds-page","immunoprecip","2d gel"],
    "immunology":   ["pbmc","t cell","b cell","cytokine","antibody","flow cytometry","immunophenotyp","nk cell","dendritic","lps","endotoxin"],
    "microbiology": ["bacterial culture","antibiotic","biofilm","colony count","transformation","yeast","fungal","mycoplasma","virus"],
}


def infer_domain(title: str, text: str) -> list[str]:
    combined = (title + " " + text).lower()
    found = [d for d, kws in _DOMAIN_KW.items() if any(k in combined for k in kws)]
    return found or ["cell_biology"]


def infer_experiment_type(domain: str, text: str) -> str:
    tl = text.lower()
    if any(k in tl for k in ["mouse","rat"," in vivo","animal model","gavage"]):
        return "in_vivo"
    if any(k in tl for k in ["electrode","voltammetry","potentiostat","amperometric","impedance"]):
        return "electrochemical"
    if any(k in tl for k in ["anaerobic","microbial electro","bioelectrochem"]):
        return "microbial"
    return {
        "cell_biology":"in_vitro","gut_health":"in_vivo","diagnostics":"electrochemical",
        "climate":"microbial","genomics":"in_vitro","proteomics":"in_vitro",
        "immunology":"in_vitro","microbiology":"microbial",
    }.get(domain, "in_vitro")
