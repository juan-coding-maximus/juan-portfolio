# Playbook · the department's legacy shelf

This folder is the **source of truth** for NutriBiotic strategy documents: the goal
ladder, the sales playbook, the seasonal marketing playbook, the in-store program,
and the onboarding kit that repackages the whole stack for the next hire. It lives
inside the OS app (`portfolio/src/app/nutribiotic/playbook/content/`) so the same
files the repo versions are what the website renders at `/nutribiotic/playbook`.

Rules of the shelf:

1. **Edit here, nowhere else.** The website reads these files directly, so an edit
   here ships on the next deploy. The Desktop bundle (`~/Desktop/NutriBiotic/09-playbook/`)
   and the Sales OS Goals tab are derived copies; `export_dossier.py` rebuilds the
   Desktop copy and edits made there do not travel back.
2. **No fabricated numbers.** A target is a decision, so targets are fine, but they
   are labeled `proposed` until Juan confirms them. Measured baselines cite where
   they came from (OS table, ERP workbook, HubSpot).
3. **A playbook section earns its place by being field-tested.** Untested advice is
   marked TODO, not written as if proven. This is principle 5 of the agency
   constitution applied to sales craft.

## Map

| File | What it is |
| --- | --- |
| [`GOALS.md`](GOALS.md) | The goal ladder. Director in one, VP in four, and the six Year-1 goals in SMART form. |
| [`sales-playbook.md`](sales-playbook.md) | How to work the territory: visit loop, cadence, grading, objection notes. |
| [`marketing-seasonal.md`](marketing-seasonal.md) | The seasonal wheel: immune in fall, mental clarity at finals, electrolytes in summer, and the channel calendar. |
| [`in-store-program.md`](in-store-program.md) | Endcaps, brochure buys, manager merch, staff knowledge. Each tactic with its cost and its measure. |
| [`onboarding/`](onboarding/README.md) | The new-hire kit and the [stack-repackaging guide](onboarding/stack.md) (new territory in days, not months). |
| [`hiring/`](hiring/README.md) | The 4-month hiring plan and role scorecard. |
| [`qbr/`](qbr/README.md) | Quarterly business reviews. The promotion case is built here, one quarter at a time. |
