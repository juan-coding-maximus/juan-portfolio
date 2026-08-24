/**
 * Playbook. The shelf index: every strategy document the department runs on,
 * grouped by what it is for, rendered from the same markdown the repo versions.
 *
 * Data-health contract, stated on the page so it is never folklore: the files
 * in ./content/ are the source of truth; the Desktop 09-playbook bundle is a
 * derived copy; the Goals tab is a designed summary of GOALS.md.
 */

import Link from "next/link";
import { PageHead, Card, Ico } from "../lib/ui";
import { DOCS, GROUPS } from "./manifest";

export const metadata = { title: "Playbook · NutriBiotic OS" };

export default async function PlaybookIndex() {
  return (
    <>
      <PageHead
        title="Playbook"
        sub="The department's legacy shelf: the playbooks and the kit that scales them to the next hire. Rendered from the repo's own files."
      />

      {GROUPS.map((group) => (
        <section key={group} className="mb-7">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8A928C]">
            {group}
          </div>
          <div className="grid gap-3.5 md:grid-cols-2">
            {DOCS.filter((d) => d.group === group).map((d) => (
              <Link key={d.slug} href={`/nutribiotic/playbook/${d.slug}`} className="group">
                <Card className="flex h-full flex-col gap-1.5 transition-colors group-hover:border-[#B9C4BC]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-[family-name:var(--font-fraunces)] text-[16.5px] font-semibold tracking-tight">
                      {d.title}
                    </span>
                    <span className="shrink-0 text-[#8A928C] transition-colors group-hover:text-[#2C6A46]">
                      <Ico name="book" size={15} />
                    </span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-[#5B6560]">{d.blurb}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-2 max-w-[70ch] text-[12.5px] leading-relaxed text-[#8A928C]">
        Source of truth: the markdown in the OS repo (playbook/content/). This page renders those
        files as-is; the Desktop bundle&apos;s 09-playbook folder is a derived copy rebuilt by the
        dossier export. The goal ladder moved to its own Goals tab; GOALS.md is still there if a
        link points to it. Generated field reports moved to their own Reports tab, under More.
        Edit a file, and every copy follows.
      </p>
    </>
  );
}
