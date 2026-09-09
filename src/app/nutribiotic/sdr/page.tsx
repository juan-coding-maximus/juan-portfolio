/**
 * SDR. Juan's ask, 2026-09-08: schedule calls and visits into days, dial out
 * from the computer, log what happens through the same box /visit uses, and
 * flag Outbound, all from one desk screen. Replaces Expenses at the top level
 * of the nav; Expenses moved into More (see ../layout.tsx for why).
 */

import { getAccountCallCards, getPriorityBook, isConfigured, listSdrSchedule, todayStartLA } from "../lib/dal";
import { PageHead, Empty } from "../lib/ui";
import { SdrScreen, type SdrDayItem } from "../lib/sdr-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "SDR · NutriBiotic OS" };

const DAYS_AHEAD = 6;

export default async function SdrPage({
  searchParams,
}: {
  /* The priority panel's "Call ..." action, 2026-09-08. It opens this page
     already showing that account's panel, whether or not the account has a
     row scheduled: a ranked list whose action link only lands you on the right
     page is not a prescriptive action, it is a suggestion with extra steps. */
  searchParams: Promise<{ account?: string }>;
}) {
  const focusAccountId = (await searchParams).account?.trim() || null;
  if (!isConfigured()) {
    return (
      <>
        <PageHead title="SDR" />
        <Empty>No data source configured. Nothing is being shown, and nothing is being guessed.</Empty>
      </>
    );
  }

  const res = await listSdrSchedule(DAYS_AHEAD);
  const accountIds = [
    ...new Set([
      ...res.data.map((r) => r.account_id).filter((id): id is string => !!id),
      ...(focusAccountId ? [focusAccountId] : []),
    ]),
  ];
  const [cards, priority] = await Promise.all([getAccountCallCards(accountIds), getPriorityBook()]);

  /*
   * THE DAY IS STILL THE DAY. Priority orders the calls INSIDE each scheduled
   * date and never moves one across days: a date on an SDR row is something
   * Juan decided, and the department's routing rule already says a stated time
   * is an anchor the plan is built around, not a preference a score may
   * overrule. What it replaces is created_at order within a day, which only
   * ever said which row was typed first.
   *
   * A prospect with no account_id carries no score (nothing to score it from)
   * and keeps its place rather than sinking to the bottom, same rule as an
   * ungraded draft.
   */
  const items: SdrDayItem[] = res.data.map((r) => {
    const card = r.account_id ? cards[r.account_id] : undefined;
    const p = r.account_id ? priority.byId.get(r.account_id) : undefined;
    return {
      ...r,
      displayName: card?.name ?? r.prospect_name ?? "Unnamed",
      displayPhone: card?.phone ?? r.prospect_phone ?? null,
      priorityScore: p?.score ?? null,
      priorityReason: p?.reason ?? null,
      priorityBand: p?.band ?? null,
    };
  });

  const todayIso = todayStartLA().slice(0, 10);

  return (
    <>
      <PageHead title="SDR" />
      <SdrScreen
        initialItems={items}
        todayIso={todayIso}
        days={DAYS_AHEAD}
        focusAccountId={focusAccountId}
        focusAccountName={focusAccountId ? (cards[focusAccountId]?.name ?? null) : null}
        focusAccountPhone={focusAccountId ? (cards[focusAccountId]?.phone ?? null) : null}
        // Plain array, not the book: PriorityBook.byId is a Map, which cannot
        // cross into this client component. See priority-ui.tsx's
        // TopOpportunities for where this lands, the SDR page's own right
        // rail (Juan, 2026-09-08: "right is all time best").
        topRanked={priority.ranked}
      />
    </>
  );
}
