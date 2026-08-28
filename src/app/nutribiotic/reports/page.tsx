/**
 * Reports. The daily and weekly field-report PDFs, one click away, plus the
 * archive of every prior one. Split out of Playbook, 2026-08-23 (Juan's ask):
 * these are generated artifacts refreshed by a script, not part of the
 * strategy shelf Playbook indexes, and folding them together buried a
 * frequently-checked page inside a reference one.
 */

import { PageHead, Card, Ico } from "../lib/ui";
import {
  getAllTimeMetrics,
  getHomeEndpoint,
  getReportDraft,
  listPlaybookReports,
  listPlaybookReportArchive,
  reportDateLA,
  signReportPreview,
} from "../lib/dal";
import { ReportReview } from "../lib/report-review-ui";

export const metadata = { title: "Reports · NutriBiotic OS" };
export const dynamic = "force-dynamic";

const REPORT_TITLE: Record<"daily" | "weekly", string> = {
  daily: "Daily Field Report",
  weekly: "Weekly Field Report",
};

// All-time dashboard (migration 0048). Every tile is SUM(value) over
// nb_report_metrics for one metric key -- adding a metric later is a new key
// in field_report.py's upsert_daily_metrics, never a page change.
type NumericMetricKey = "visits" | "touchpoints" | "miles" | "daysWorked" | "newAccounts" | "accountsClosed";
const METRIC_TILES: Array<{ key: NumericMetricKey; label: string; fmt?: (n: number) => string }> = [
  { key: "visits", label: "Visits made" },
  { key: "touchpoints", label: "Total touchpoints" },
  { key: "miles", label: "Total miles", fmt: (n) => n.toLocaleString() },
  { key: "daysWorked", label: "Days worked on the road" },
  { key: "newAccounts", label: "New accounts opened" },
  { key: "accountsClosed", label: "Accounts confirmed closed" },
];

export default async function ReportsIndex() {
  const today = reportDateLA();
  const [reports, archive, draft, home, allTime] = await Promise.all([
    listPlaybookReports(),
    listPlaybookReportArchive(),
    getReportDraft(today).catch(() => null),
    getHomeEndpoint().catch(() => null),
    getAllTimeMetrics(),
  ]);
  const previewUrl = draft?.preview_path && !draft.dirty ? await signReportPreview(draft.preview_path) : null;

  return (
    <>
      <PageHead
        title="Reports"
        sub="Tonight's report before it goes out, then the latest daily and weekly PDFs and every prior one."
      />

      {/* ALL-TIME DASHBOARD (migration 0048). Juan's ask 2026-08-28: cumulative
          totals above the individual reports, since a single daily report only
          ever shows one day. Every number here is a SUM over the ledger
          field_report.py writes each time it builds a day -- never a running
          counter, so a correction to one day (like 2026-08-27's) moves the
          total automatically rather than needing this page to be fixed too. */}
      {allTime && (
        <section className="mb-7">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">All time</div>
            {allTime.throughDate && (
              <div className="text-[11px] text-[#8A928C]">through {allTime.throughDate}</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {METRIC_TILES.map((t) => (
              <Card key={t.key} className="p-3.5 text-center">
                <div className="font-[family-name:var(--font-fraunces)] text-[22px] leading-none font-semibold tracking-tight tabular-nums">
                  {(t.fmt ?? String)(allTime[t.key])}
                </div>
                <div className="mt-1.5 text-[11px] leading-snug text-[#5B6560]">{t.label}</div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* THE REVIEW GATE (migrations 0045/0046). Until 2026-08-27 the 22:00 cron
          mailed the PDF unread to Juan and to juan@nutribiotic.com, and a wrong
          pin could only be corrected by sending a follow-up. This is where he
          reads it first. Absent until a draft exists for today. */}
      {draft ? (
        <ReportReview draft={draft} previewUrl={previewUrl} home={home} />
      ) : (
        <ReportReview
          draft={{
            report_date: today,
            kind: "daily",
            payload: null,
            status: "pending",
            dirty: false,
            rebuild_requested: false,
            edited: false,
            preview_path: null,
            sent_at: null,
            send_error: null,
            updated_at: new Date().toISOString(),
          }}
          previewUrl={null}
          home={home}
        />
      )}

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
