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
  weekWindowFor,
  type PlaybookReportArchive,
} from "../lib/dal";
import { DateNav, ReportReview, WeeklyReportReview } from "../lib/report-review-ui";

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

export default async function ReportsIndex({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const today = reportDateLA();
  // Which day to review (2026-08-28, Juan's ask): a date picker spanning
  // every day up to today, defaulting to today when nothing's picked. A
  // malformed value falls back to today rather than sending a bad date into
  // Supabase/HubSpot queries.
  const sp = await searchParams;
  const selectedDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;

  // "Weekly is derived from daily so should auto update" (2026-08-28,
  // Juan's follow-up): no separate weekly picker. Whichever day is selected,
  // the weekly section below always shows the Mon-Thu week that day falls
  // in -- null on a Fri/Sat/Sun pick, since no such week contains it.
  const weekWindow = weekWindowFor(selectedDate);

  const [reports, archive, draft, home, allTime, weeklyDraft, archivedDailyUrl, archivedWeeklyUrl] =
    await Promise.all([
      listPlaybookReports().catch(() => []),
      listPlaybookReportArchive().catch((): PlaybookReportArchive => ({ reports: [], truncated: {} })),
      getReportDraft(selectedDate, "daily").catch(() => null),
      getHomeEndpoint().catch(() => null),
      getAllTimeMetrics().catch(() => null),
      weekWindow ? getReportDraft(weekWindow.end, "weekly").catch(() => null) : Promise.resolve(null),
      // The real, already-sent artifact for this day/week (2026-08-28, Juan:
      // "I need to be able to see what was sent, which you should refer to
      // from the archives, you do have this information already"). Exact
      // filenames field_report.py/weekly_report.py publish on send --
      // signReportPreview signs-if-exists, null otherwise, no separate
      // listing call needed.
      signReportPreview(`daily-${selectedDate}.pdf`).catch(() => null),
      weekWindow ? signReportPreview(`weekly-${weekWindow.start}_to_${weekWindow.end}.pdf`).catch(() => null) : Promise.resolve(null),
    ]);
  const previewUrl = draft?.preview_path && !draft.dirty ? await signReportPreview(draft.preview_path) : null;
  const weeklyPreviewUrl =
    weeklyDraft?.preview_path && !weeklyDraft.dirty ? await signReportPreview(weeklyDraft.preview_path) : null;

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
          reads it first. DateNav (2026-08-28) is what lets this be any day up
          to today, not only today. */}
      <DateNav date={selectedDate} today={today} />

      {/* key={selectedDate}: without it, switching dates reuses the same
          ReportReview instance and every useState in it (stop order, hq
          notes, route overrides, miles) stays frozen at whatever the
          PREVIOUS date's payload produced -- caught 2026-08-28 by Juan
          picking Aug 27 and seeing "Stops - 17 of 17" (a fresh prop) next to
          "No stops on this day" (stale state). The key forces a clean
          remount per date, same fix as keying a list item by its id. */}
      {draft ? (
        <ReportReview
          key={selectedDate}
          draft={draft}
          previewUrl={previewUrl}
          archivedUrl={archivedDailyUrl}
          home={home}
        />
      ) : (
        <ReportReview
          key={selectedDate}
          draft={{
            report_date: selectedDate,
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
          archivedUrl={archivedDailyUrl}
          home={home}
        />
      )}

      {/* WEEKLY REVIEW GATE (2026-08-28). Same story as the daily gate above,
          one week later: the Friday rollup used to --send straight to
          juan@nutribiotic.com with nobody having looked at it. Tracks
          whichever day is selected above -- no separate picker ("weekly is
          derived from daily", his follow-up) -- and field_report.py's
          build_draft() cascades a rebuild here whenever a day inside this
          window is rebuilt, so it's never stale relative to a daily edit.
          Absent on a Fri/Sat/Sun pick (no Mon-Thu week contains it) or
          before com.agency.nutribiotic-weekly-summary/a daily rebuild has
          ever staged one for this window -- no build button, staging one is
          what a daily rebuild in-window (or the Friday cron) is for. */}
      {weeklyDraft && weeklyDraft.payload ? (
        <WeeklyReportReview
          key={weekWindow?.end}
          draft={weeklyDraft}
          previewUrl={weeklyPreviewUrl}
          archivedUrl={archivedWeeklyUrl}
        />
      ) : archivedWeeklyUrl && weekWindow ? (
        // No draft row at all (a week from before the review gate existed),
        // but the real sent PDF is still in the archive -- same "refer to
        // the archives" fix as the daily side above.
        <section className="mb-8 rounded-xl border border-[#E2DFD5] bg-white p-5">
          <h2 className="mb-3 font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
            Week of {weekWindow.start} – {weekWindow.end}
          </h2>
          <p className="mb-3 text-[13.5px] text-[#5B6560]">No draft on file, but a report was sent that week.</p>
          <a
            href={archivedWeeklyUrl}
            target="_blank"
            rel="noreferrer"
            className="mb-5 inline-flex items-center gap-1.5 rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90"
          >
            <Ico name="external" size={13} />
            Open the sent PDF
          </a>
          <div className="overflow-hidden rounded-lg border border-[#E2DFD5]">
            <iframe
              src={archivedWeeklyUrl}
              title={`Sent weekly report, ${weekWindow.start} to ${weekWindow.end}`}
              className="h-[70vh] w-full"
            />
          </div>
        </section>
      ) : weekWindow ? (
        <p className="mb-8 text-[12.5px] text-[#8A928C]">
          No weekly report staged or sent for {weekWindow.start} – {weekWindow.end}. It appears here once a
          day in that week is rebuilt, or at the Friday 10:00 cron.
        </p>
      ) : null}

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
