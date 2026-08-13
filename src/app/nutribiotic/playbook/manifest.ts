/**
 * The playbook shelf manifest: which markdown files exist, what they are called,
 * and how they group on the shelf. The files in ./content/ are the SOURCE OF
 * TRUTH; this manifest only presents them. Adding a doc = drop the .md in
 * content/ and add one entry here.
 */

export type PlaybookDoc = {
  slug: string;
  file: string; // relative to ./content
  title: string;
  blurb: string;
  group: "The ladder" | "Playbooks" | "Scale";
};

export const DOCS: PlaybookDoc[] = [
  {
    // Not on the shelf (see GROUPS below): the Goals nav tab is the daily-use
    // surface for this content now. The doc and route stay live so that tab's
    // "GOALS.md on the Playbook shelf" cross-link keeps resolving.
    slug: "goals",
    file: "GOALS.md",
    title: "Goals · the ladder",
    blurb:
      "Director in one, VP in four. The six Year-1 SMART goals, measured baselines, and the Y2-4 arc. The Goals tab is the summary; this is the full text.",
    group: "The ladder",
  },
  {
    slug: "notes-to-self",
    file: "notes-to-self.md",
    title: "Notes to Self",
    blurb:
      "The running list of field learnings worth carrying to every account of that shape: prospecting, area scoping, the value proposition that opens each account type.",
    group: "Playbooks",
  },
  {
    slug: "document-standards",
    file: "document-standards.md",
    title: "Document Standards",
    blurb:
      "The house standard for any sales sheet, offer sheet, or talking-points doc built for this department: cut prose, lead with facts, frame pricing to favor the reader, check typography every time.",
    group: "Playbooks",
  },
  {
    slug: "sales-playbook",
    file: "sales-playbook.md",
    title: "Sales Playbook",
    blurb:
      "How the territory is worked: the model, the week, the visit loop, reactivation. Every section field-tested or marked TODO, never untested advice as proven.",
    group: "Playbooks",
  },
  {
    slug: "marketing-seasonal",
    file: "marketing-seasonal.md",
    title: "Seasonal Marketing",
    blurb:
      "The annual wheel: immune in fall, mental clarity at finals, electrolytes in summer. Four channels per campaign; no campaign closes without its ROI number.",
    group: "Playbooks",
  },
  {
    slug: "in-store-program",
    file: "in-store-program.md",
    title: "In-Store Program",
    blurb:
      "Endcaps, brochure buys, manager merch, staff knowledge one-pagers. Each tactic with a cost line and a measure before it runs.",
    group: "Playbooks",
  },
  {
    slug: "onboarding",
    file: "onboarding/README.md",
    title: "Onboarding Kit",
    blurb:
      "A new hire solo in their territory within two weeks: what they receive on day 1, the two-week runbook, and the rules that transfer with the kit.",
    group: "Scale",
  },
  {
    slug: "stack",
    file: "onboarding/stack.md",
    title: "The Stack, repackaged",
    blurb:
      "The full component inventory and the spin-up order for a new territory or client. The G5 test: a second owner id, end-to-end, without editing code.",
    group: "Scale",
  },
  {
    slug: "hiring",
    file: "hiring/README.md",
    title: "Hiring",
    blurb:
      "The 4-month runway to the first rep: scorecard, timeline, the ride-along as the real interview, and the human-gated agentic help.",
    group: "Scale",
  },
  {
    slug: "qbr",
    file: "qbr/README.md",
    title: "QBR · the evidence file",
    blurb:
      "One file per quarter. Where the Director case is built: written, dated, numeric, with the template every quarter fills.",
    group: "Scale",
  },
  {
    slug: "about",
    file: "README.md",
    title: "How this shelf works",
    blurb:
      "The rules of the shelf: where the source of truth lives, what is derived, and why nothing here is written as proven unless it survived real doors.",
    group: "Scale",
  },
];

// "The ladder" is deliberately absent: Goals now has its own nav tab as the
// daily-use surface, and a second copy of it on the shelf was clutter. The
// doc stays in DOCS above so /nutribiotic/playbook/goals keeps resolving.
export const GROUPS: PlaybookDoc["group"][] = ["Playbooks", "Scale"];

export function docBySlug(slug: string): PlaybookDoc | undefined {
  return DOCS.find((d) => d.slug === slug);
}

/** Resolve a relative .md link inside a doc to its slug, so cross-references
 *  navigate the site instead of 404ing on a raw file path. */
export function slugForMdLink(fromFile: string, href: string): string | null {
  if (!href.endsWith(".md")) return null;
  const clean = href.replace(/^\.\//, "");
  const baseDir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/") + 1) : "";
  const candidates = [clean, baseDir + clean];
  for (const c of candidates) {
    const hit = DOCS.find((d) => d.file === c);
    if (hit) return hit.slug;
  }
  return null;
}
