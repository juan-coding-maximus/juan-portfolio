/**
 * Goals ladder data. DERIVED, not the source of truth.
 * The canonical file is agency/nutribiotic/playbook/GOALS.md; edit there and
 * mirror here. Targets flagged `proposed` are drafts awaiting Juan's ratification
 * at a QBR; nothing below is a measured fact unless listed under BASELINES.
 */

export const NORTH_STAR = {
  mantra: "Director in one. VP in four.",
  milestones: [
    {
      title: "Commercial Director",
      deadline: "Aug 2027",
      proof:
        "Territory measurably revived, a playbook another rep can run, one hire onboarded on it, and a quarterly evidence file that makes the promotion the obvious call.",
    },
    {
      title: "VP of Commercialization or CCO",
      deadline: "Aug 2030",
      proof:
        "The playbook running in 3+ territories through people Juan hired and trained, marketing and field sales under one commercial motion.",
    },
  ],
};

/* Measured 2026-08-02, sources in GOALS.md (nb_accounts, nb_orders, nb_contacts, ERP). */
export const BASELINES = [
  { value: "273", label: "SoCal accounts owned" },
  { value: "61", label: "ordered since 2024" },
  { value: "66", label: "overdue for reorder" },
  { value: "41d", label: "median reorder gap" },
  { value: "133", label: "with a named contact" },
];

export type Goal = {
  id: string;
  title: string;
  what: string;
  measure: string;
  deadline: string;
  proposed: boolean;
};

export const GOALS: Goal[] = [
  {
    id: "G1",
    title: "Revive the territory",
    what: "The day job, done visibly well. Reactivate dormant accounts and hold active ones to their reorder cadence.",
    measure:
      "All 66 overdue accounts visited or called by Sep 30. 90 accounts ordering in the trailing 12 months by Jul 2027 (baseline 61).",
    deadline: "Jul 2027",
    proposed: true,
  },
  {
    id: "G2",
    title: "Ship Sales Playbook v1",
    what: "A written, field-tested playbook another rep could run without Juan in the room. Every section field-tested or marked TODO, never untested advice presented as proven.",
    measure: "v1 by Sep 30, 2026. v2 within 60 days of the first hire's start.",
    deadline: "Sep 2026",
    proposed: true,
  },
  {
    id: "G3",
    title: "Run the seasonal marketing engine",
    what: "A repeating wheel across website, newsletter, email nurture and social: immune in fall, mental clarity at finals, electrolytes in summer.",
    measure:
      "Fall immune live Oct 1. Finals mental clarity Nov 15. Summer electrolytes May 15. No campaign closes without its order-lift ROI number.",
    deadline: "Rolling",
    proposed: true,
  },
  {
    id: "G4",
    title: "Build the in-store program",
    what: "Endcap promos, seasonal specials, monthly mailed brochure buys, manager merch, staff knowledge one-pagers.",
    measure:
      "Endcap pilot in 5 stores by Nov 30 with per-store lift measured. One brochure buy tracked. Merch kits with 20 store managers by Dec 31.",
    deadline: "Dec 2026",
    proposed: true,
  },
  {
    id: "G5",
    title: "Make the stack repackageable",
    what: "The legacy goal: OS, HubSpot sync, ERP loaders, enrichment, dossier export and route planning packaged so a new territory spins up in days.",
    measure:
      "New-territory runbook proven end-to-end against a second owner id, producing a working dossier, map and route plan without hand-editing code.",
    deadline: "Dec 2026",
    proposed: true,
  },
  {
    id: "G6",
    title: "Hire, onboard, build the case",
    what: "First rep hired and running the playbook; a quarterly written evidence file that builds the Director case.",
    measure:
      "Scorecard Sep 15. Offer signed Dec 2. Hire solo within 14 days of start. First QBR Nov 1. Director conversation by Jun 30, 2027.",
    deadline: "Jun 2027",
    proposed: true,
  },
];

export const ARC = [
  {
    span: "Year 2",
    line: "Playbook v3 in 2+ territories through hires; seasonal wheel on its second cycle with year-over-year numbers; a team goal, not a personal quota alone.",
  },
  {
    span: "Year 3",
    line: "3+ territories or channels; marketing, in-store and field sales reporting into one commercial plan Juan writes; hiring delegated to the runbook.",
  },
  {
    span: "Year 4",
    line: "The commercial org is the infrastructure: people, playbooks, stack. The VP or CCO conversation ratifies what already runs.",
  },
];

export const CADENCE = [
  { when: "Friday, 20 min", what: "Metrics vs the overdue list; next week's field days set." },
  { when: "Monthly", what: "One written paragraph per goal, red/yellow/green, into the QBR draft." },
  { when: "Quarterly", what: "Full QBR. Targets re-confirmed or re-set; proposed labels retired as numbers are ratified." },
];
