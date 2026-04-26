# Data Scrapers

Pulls real protocol and reagent data from all sources listed in the Fulcrum challenge.

## Setup (one-time)

```powershell
py -m pip install requests beautifulsoup4 lxml
```

## Quick run (protocols only, all free sources)

```powershell
py run_all.py --protocols-io-token YOUR_TOKEN --skip-sigma --skip-thermo --skip-atcc --validate
```

## Full run (all sources)

```powershell
py run_all.py --protocols-io-token YOUR_TOKEN --validate
```

## Sources covered

| Source | Type | Auth needed |
|--------|------|-------------|
| protocols.io | protocols | Client token (free) |
| PubMed | papers/protocols | None |
| bio-protocol.org | peer-reviewed protocols | None |
| Nature Protocols | protocols | None (metadata only) |
| JoVE | video protocols | None (metadata; cookies for full access) |
| OpenWetWare | wiki protocols | None (currently unreachable) |
| Promega | supplier protocols | None |
| Qiagen | supplier protocols | None |
| IDT | supplier protocols | None |
| Sigma-Aldrich | reagent catalog | None |
| Thermo Fisher | reagent catalog | None |
| ATCC | cell line catalog | None |
| Addgene | cloning protocols | None |

## Getting the protocols.io token

1. Go to https://www.protocols.io/developers (must be logged in)
2. Scroll to "Client access" section
3. Copy the **client access token** (long hex string)

## Cookie-based access (optional, for better rate limits)

Edit `cookies.json` and fill in your browser cookies for sites that block heavy scraping:

1. Open the site in Chrome/Firefox
2. Press F12 → Application tab → Cookies
3. Copy cookie name + value into `cookies.json`

## Output schema

### catalog.json entry
```json
{
  "id": "MAT-001",
  "name": "Trehalose dihydrate 99%",
  "supplier": "Sigma-Aldrich",
  "catalogNumber": "T9531",
  "packageSize": "100 g",
  "priceEur": 48,
  "supplierUrl": "https://...",
  "applicableExperimentTypes": ["in_vitro"],
  "domain": ["cell_biology"],
  "notes": "..."
}
```

### protocols.json entry (rich format)
```json
{
  "id": "PROT-001",
  "title": "Cryopreservation of mammalian cells",
  "source": "protocols.io",
  "doi": "10.17504/...",
  "url": "https://...",
  "year": 2022,
  "domain": ["cell_biology"],
  "experimentType": "in_vitro",
  "summary": "...",
  "keyParameters": ["10% DMSO v/v", "1e6 cells/mL", "-1C/min rate"],
  "authors": ["Smith J", "Jones A"],
  "institution": "MIT",
  "tags": ["cryopreservation", "cell_culture"],
  "stepCount": 12,
  "reagentsUsed": ["DMSO", "FBS", "PBS"],
  "equipmentNeeded": ["Mr. Frosty", "liquid nitrogen tank"],
  "metrics": {
    "temperatures": ["-80C", "-196C"],
    "concentrations": ["10% v/v"],
    "durations": ["1 hour", "24 hours"],
    "volumes": ["1 mL"],
    "speeds": [],
    "ph_values": []
  }
}
```

## Validation

```powershell
py validate.py --catalog ../catalog.json --protocols ../protocols.json
```
