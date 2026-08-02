# The Stack, repackaged · new territory in days

The inventory of everything the department runs, and the order in which it spins
up for a new territory, client, or hire. G5's test: run this end-to-end against a
second owner id and get a working bundle, map, and route plan **without editing
code**. Where a step still needs a code edit, that is a TODO on this file.

## Inventory

| Component | What it does | Lives at |
| --- | --- | --- |
| Sales OS | Today / Territory / Map / Plan / Metrics / Goals tabs, touchpoint capture, review queues | `portfolio/src/app/nutribiotic/`, served at juanarenas.bio/nutribiotic |
| Supabase (`nb_` tables) | Accounts, contacts, orders, order lines, activities, scores, sync log | youraura Supabase project, `nb_` prefix |
| ERP loaders | Workbook normalization, order/line loading with checksums, cadence rollup | `bridges/nutribiotic/normalize_xlsx.py`, `load_orders.py` |
| HubSpot sync | Field-level, direction-declared sync + drift alarm; owner-scoped, twice | `bridges/nutribiotic/hubspot_sync.py` + `nutribiotic/config/hubspot_fields.json` |
| Enrichment | Places corroboration, geocoding, websites, presence, review counts | `bridges/nutribiotic/enrich_*.py`, `geocode.py` |
| Grading | Potential (A-G, capacity-based) and footprint, HQ-calibrated | `grade_potential.py`, `grade_footprint.py` |
| Import gate | Propose-then-promote review queue; merges are human calls | `import_data.py`, `promote_import.py`, `/nutribiotic/review` |
| Dossier export | The whole territory as one phone-readable folder | `export_dossier.py --owner <id> --dest <folder>` |
| Route planning | Cluster field days, briefs, maps | `bridges/nutribiotic/out/` planners + Plan tab |
| Visit capture | Voice/typed field notes to structured records, calendar proposals human-gated | `visits.py`, `lib/touchpoint.ts` |

## Spin-up order for a new territory

1. **Define the book by one fact**: the new rep's `hubspot_owner_id`. Never a hand-kept list.
2. **Load the ERP truth**: normalize the customer workbook, load orders and lines with checksums, run the cadence rollup.
3. **Enrich**: Places corroboration + geocode (corroborate-or-refuse; no loose mode), websites, review counts.
4. **Grade**: potential per the HQ-calibrated bands; blanks stay blank where evidence is missing.
5. **Sync scope**: declare the new owner in the sync scripts' scope; verify with a dry run before any write. `TODO: OWNER is a constant in grade_*/hubspot_push today; parameterize to a flag.`
6. **Export the bundle**: `export_dossier.py --owner <id> --dest <folder>`.
7. **Route plan** the active + overdue set into 10-stop cluster days.
8. **OS access**: scope the new rep's OS view to their book. `TODO: the OS is single-user today; multi-user scoping is the one real build item on this list.`
9. Hand the bundle plus the playbooks to the hire; onboarding runbook takes it from there.

## Repackaging for a different client (beyond NutriBiotic)

The stack's shape is client-agnostic: an ERP export, a shared CRM, a Places pass,
a grading rubric, a dossier, a route. The `nb_` prefix pattern, field-level sync
ownership declaration, and propose-then-promote import gate are the parts worth
carrying whole. What changes per client: the workbook parsers, the grade rubric
calibration, and the CRM property map, all deliberately isolated in config and
loaders already.
