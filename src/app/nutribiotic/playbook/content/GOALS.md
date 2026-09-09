# Goals · the ladder

**Director in one. VP in four.**

Written 2026-08-02. Owner: Juan Arenas Martin, first sales and marketing hire.
This file is the single source of truth for the goals; the Sales OS Goals tab and
the Desktop copy are derived from it. Targets marked `proposed` are drafts Juan can
confirm or reset; every baseline cites its source.

## North star

| Milestone | Deadline | What has to be true |
| --- | --- | --- |
| **Commercial Director** | 2027-08-02 | The territory measurably revived, a playbook that another rep can run, at least one hire onboarded on it, and a written quarterly evidence file that makes the promotion the obvious call. |
| **VP of Commercialization or CCO** | 2030-08-02 | The playbook running in 3+ territories through people Juan hired and trained, marketing and field sales under one commercial motion, and the infrastructure recognized as the company's operating system for growth. |

The route is deliberate: be the best rep the company has, write down how, make the
written thing hire-scalable, then run the people who run it. Infrastructure over
immediacy, exactly because the infrastructure is what a Director owns.

## Baselines

Refreshed 2026-09-08 (`bridges/nutribiotic/check_config_drift.py`), account count/ordered/
contact lines only, the territory grew from 273 to 398 owned since the 2026-08-02 measurement.
"Overdue for reorder" and "median inter-order gap" are left at their 2026-08-02 values below,
unverified since: they are methodologically coupled (overdue is defined relative to the gap
figure), no live query for the median gap exists yet in this codebase, and G1's own `proposed`
target quotes both together, changing one without the other and without Juan's sign-off would
silently change what the ratified-pending target means.

- 398 SoCal accounts owned (HubSpot owner id 36242368); 613 accounts in the OS overall. Source: `nb_accounts` / HubSpot. (was 273 / 459, 2026-08-02)
- 56 of 398 have ordered since 2024; the rest last ordered before 2024. Source: `nb_orders` from the 2024+ ERP export. (was 61 of 273, 2026-08-02)
- 66 accounts were overdue for a reorder against the territory's median inter-order gap of 41 days, as of 2026-08-02. Unverified since; no live query exists for either number yet.
- 185 of 398 have at least one named contact. Source: `nb_contacts`. (was 133 of 273, 2026-08-02)
- Loaded 2024+ revenue: $340,665.96 across 146 accounts (includes pre-assignment history; the personal baseline starts at hire). Source: ERP invoice lines in `nb_order_lines`.

## The six Year-1 goals

### G1 · Revive the territory
The day job, done visibly well. This is the first line of the Director case.
- **S** Reactivate dormant accounts and hold active ones to their reorder cadence.
- **M** `proposed` Every one of the 66 overdue accounts visited or called by 2026-09-30. 90 accounts ordering in the trailing 12 months by 2027-07-31 (baseline 61).
- **A** The overdue list is known by name, route plans exist, and the OS flags cadence misses automatically.
- **R** Revenue growth is the one number every promotion conversation starts with.
- **T** Checked at each quarterly QBR; the trailing-12-month count is the scoreboard.

### G2 · Ship Sales Playbook v1
- **S** A written, field-tested playbook another rep could run without Juan in the room: visit loop, cadence rules, grading, objection handling, tools.
- **M** `proposed` v1 complete by 2026-09-30 with every section marked field-tested or TODO, no untested advice presented as proven. v2 after the first hire uses it.
- **A** The skeleton exists ([`sales-playbook.md`](sales-playbook.md)) and every field day generates material.
- **R** The playbook is the difference between a good rep and a Director who scales reps.
- **T** v1 2026-09-30, v2 within 60 days of the first hire's start.

### G3 · Run the seasonal marketing engine
- **S** A repeating seasonal wheel across website, newsletter, email nurture, and social: immune in fall, mental clarity at college finals, electrolytes in summer.
- **M** `proposed` Fall immune campaign live across all four channels by 2026-10-01; finals mental-clarity by 2026-11-15; summer electrolytes by 2027-05-15. Each campaign gets a before/after order-lift readout from `nb_order_lines`, no campaign closes without its ROI number.
- **A** The calendar and channel templates are in [`marketing-seasonal.md`](marketing-seasonal.md); the OS already holds the order data the measurement needs.
- **R** Marketing plus field sales under one motion is the Commercialization part of the VP title.
- **T** Campaign dates above; the wheel repeats annually with a written retro each cycle.

### G4 · Build the in-store program
- **S** Endcap promos, seasonal specials, monthly mailed brochure buys, manager merch (tumblers, pins, free product), and staff knowledge one-pagers.
- **M** `proposed` Endcap pilot in 5 stores by 2026-11-30 with per-store order lift measured. One brochure placement bought and its window tracked. Merch kits in the hands of 20 store managers by 2026-12-31.
- **A** Tactics and their measures are specced in [`in-store-program.md`](in-store-program.md); store relationships come from G1's visit loop.
- **R** In-store presence is what turns a reactivated account into a growing one.
- **T** Pilot dates above; scale decisions at the Q2 QBR, on ROI, not on vibes.

### G5 · Make the stack repackageable
The legacy goal. Infrastructure over immediacy, stated as a deliverable.
- **S** The whole stack (OS, HubSpot sync, ERP loaders, Places enrichment, dossier export, route planning) packaged so a new territory or client spins up in days.
- **M** `proposed` A new-territory runbook proven end-to-end by 2026-12-31: run it against a second owner id and produce a working dossier, map, and route plan without hand-editing code.
- **A** Every component already runs for SoCal; the work is parameterization and the runbook, not invention.
- **R** This is what makes hire #2 cheap and territory #3 possible, the scalability the VP case rests on.
- **T** Proven by 2026-12-31, then used for real in the first hire's onboarding.

### G6 · Hire, onboard, and build the promotion case
- **S** Hire the first additional rep, onboard them on the playbook and stack, and keep a quarterly written evidence file (QBR) that builds the Director case.
- **M** `proposed` Role scorecard by 2026-09-15, offer signed by 2026-12-02 (the 4-month mark), new hire running their territory solo within 2 weeks of start. QBR written every quarter, first one 2026-11-01. Director conversation held with the evidence file by 2027-06-30.
- **A** Hiring plan in [`hiring/`](hiring/README.md), onboarding kit in [`onboarding/`](onboarding/README.md), QBR template in [`qbr/`](qbr/README.md).
- **R** Managing a rep who succeeds on your system is the difference between claiming Director and demonstrating it.
- **T** Dates above; the promotion conversation is calendar-driven, not mood-driven.

### G7 · Double the territory
- **S** Grow the number of SoCal accounts owned, new-door prospecting, not reactivation (that's G1's job).
- **M** `proposed` 275 -> 550 owned accounts (baseline: Juan's approximate starting count when he took the territory) by 2026-12-31. Juan, verbatim, 2026-09-09: "grow the book to double by the end of 2026... G7 in goals is not 800 accounts but 550 since we started with 275 approx." Live count is already 398 (123 of the 275 climb done, 45%).
- **A** The daily protected prospecting block (`score_weights.json`'s `capacity.prospect_block`, 09:00-09:30) is the mechanism; `lifecycle='prospect'` accounts (104 as of 2026-09-09) are the leading indicator to watch, not lagging revenue.
- **R** A bigger book is the base every other goal compounds on: more accounts to revive (G1), more territory for the playbook (G2) to prove itself against.
- **T** Tracked live: `bridges/nutribiotic/check_config_drift.py`'s book-growth check.

## Year 2 to 4 arc (to VP of Commercialization / CCO)

- **Y2 (to 2028-08)** Playbook v3 running in 2+ territories through hires; seasonal wheel on its second cycle with year-over-year comparisons; Juan carries the Commercial Director title and a team goal, not a personal quota alone. Team-structure math (comp, headcount, sequencing) is under "Team expansion" in [`hiring/README.md`](hiring/README.md); it does not start until hire #1 has run solo.
- **Y3 (to 2029-08)** 3+ territories or channels; marketing calendar, in-store program, and field sales reporting into one commercial plan Juan writes; hiring and onboarding fully delegated to the runbook.
- **Y4 (to 2030-08)** The commercial org is the infrastructure: people, playbooks, stack. The VP or CCO conversation is about ratifying what already runs.

## Cadence

- **Weekly, Friday, 20 min**: Metrics tab review against G1; next week's field days set.
- **Monthly**: one written paragraph per goal in `qbr/`, red/yellow/green.
- **Quarterly**: full QBR, targets re-confirmed or re-set, `proposed` labels retired as numbers are ratified.
