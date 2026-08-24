/**
 * Reports. The daily and weekly field-report PDFs, one click away, plus the
 * archive of every prior one. Split out of Playbook, 2026-08-23 (Juan's ask):
 * these are generated artifacts refreshed by a script, not part of the
 * strategy shelf Playbook indexes, and folding them together buried a
 * frequently-checked page inside a reference one.
 */

import { PageHead, Card, Ico } from "../lib/ui";
import { listPlaybookReports, listPlaybookReportArchive } from "../lib/dal";

export const metadata = { title: "Reports · NutriBiotic OS" };

const REPORT_TITLE: Record<"daily" | "weekly", string> = {
  daily: "Daily Field Report",
  weekly: "Weekly Field Report",
};

export default async function ReportsIndex() {
  const [reports, archive] = await Promise.all([listPlaybookReports(), listPlaybookReportArchive()]);

  return (
    <>
      <PageHead
        title="Reports"
        sub="The latest daily and weekly field-report PDFs, published straight from the field-report scripts, never edited by hand."
      />

      <section className="mb-7">
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

      <p className="mt-2 max-w-[70ch] text-[12.5px] leading-relaxed text-[#8A928C]">
        Read straight from Supabase storage. Every run archives rather than replaces: the cards
        above show the latest of each kind, the Archive disclosure holds the rest.
      </p>
    </>
  );
}
