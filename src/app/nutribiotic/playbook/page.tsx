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
import { listPlaybookReports, listPlaybookReportArchive } from "../lib/dal";
import { DOCS, GROUPS } from "./manifest";

export const metadata = { title: "Playbook · NutriBiotic OS" };

const REPORT_TITLE: Record<"daily" | "weekly", string> = {
  daily: "Daily Field Report",
  weekly: "Weekly Field Report",
};

export default async function PlaybookIndex() {
  const [reports, archive] = await Promise.all([listPlaybookReports(), listPlaybookReportArchive()]);

  return (
    <>
      <PageHead
        title="Playbook"
        sub="The department's legacy shelf: the playbooks and the kit that scales them to the next hire. Rendered from the repo's own files."
      />

      <section className="mb-7">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8A928C]">
          Reports
        </div>
        <div className="grid gap-3.5 md:grid-cols-2">
          {(["daily", "weekly"] as const).map((kind) => {
            const report = reports.find((r) => r.kind === kind);
            return (
              <Card key={kind} className="flex h-full flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-[family-name:var(--font-fraunces)] text-[16.5px] font-semibold tracking-tight">
                    {REPORT_TITLE[kind]}
                  </span>
                  {report && (
                    <span className="shrink-0 text-[#8A928C]">
                      <Ico name="external" size={13} />
                    </span>
                  )}
                </div>
                {report ? (
                  <>
                    <p className="text-[13px] leading-relaxed text-[#5B6560]">{report.label}</p>
                    <a
                      href={report.url}
                      className="mt-1 text-[13px] font-medium text-[#2C6A46] underline decoration-[#2C6A46]/40 underline-offset-2 hover:decoration-[#2C6A46]"
                    >
                      Open PDF
                    </a>
                  </>
                ) : (
                  <p className="text-[13px] leading-relaxed text-[#8A928C]">
                    Not generated yet. The next {kind} report run publishes here.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
        {archive.reports.length > 0 ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-[11.5px] text-[#8A928C]">
              Archive ({archive.reports.length} earlier report{archive.reports.length === 1 ? "" : "s"})
            </summary>
            <div className="mt-2 grid gap-3.5 md:grid-cols-2">
              {(["daily", "weekly"] as const).map((kind) => {
                const items = archive.reports.filter((r) => r.kind === kind);
                const hidden = archive.truncated[kind];
                if (!items.length && !hidden) return null;
                return (
                  <div key={kind}>
                    <ul className="space-y-1">
                      {items.map((r) => (
                        <li key={r.url} className="flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="text-[#5B6560]">{r.label}</span>
                          <a
                            href={r.url}
                            className="shrink-0 font-medium text-[#2C6A46] underline decoration-[#2C6A46]/40 underline-offset-2 hover:decoration-[#2C6A46]"
                          >
                            Open PDF
                          </a>
                        </li>
                      ))}
                    </ul>
                    {hidden ? (
                      <p className="mt-1 text-[12px] text-[#8A928C]">+{hidden} more not shown</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </details>
        ) : (
          <p className="mt-3 text-[11.5px] text-[#8A928C]">
            Archive: empty so far, every report before 2026-08-23 was pruned by the old
            delete-on-publish behavior. Starts filling in from the next daily/weekly run onward.
          </p>
        )}
      </section>

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
        link points to it. Reports above are read straight from Supabase storage, published by the
        field-report scripts, never edited by hand. Every run archives rather than replaces, the
        cards show the latest of each kind, the Archive disclosure holds the rest. Edit a file, and
        every copy follows.
      </p>
    </>
  );
}
