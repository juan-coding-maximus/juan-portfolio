/**
 * SDR. Juan's ask, 2026-09-08: schedule calls and visits into days, dial out
 * from the computer, log what happens through the same box /visit uses, and
 * flag Outbound, all from one desk screen. Replaces Expenses at the top level
 * of the nav; Expenses moved into More (see ../layout.tsx for why).
 */

import { getAccountCallCards, isConfigured, listSdrSchedule, todayStartLA } from "../lib/dal";
import { PageHead, Empty } from "../lib/ui";
import { SdrScreen, type SdrDayItem } from "../lib/sdr-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "SDR · NutriBiotic OS" };

const DAYS_AHEAD = 6;

export default async function SdrPage() {
  if (!isConfigured()) {
    return (
      <>
        <PageHead title="SDR" />
        <Empty>No data source configured. Nothing is being shown, and nothing is being guessed.</Empty>
      </>
    );
  }

  const res = await listSdrSchedule(DAYS_AHEAD);
  const accountIds = [...new Set(res.data.map((r) => r.account_id).filter((id): id is string => !!id))];
  const cards = await getAccountCallCards(accountIds);

  const items: SdrDayItem[] = res.data.map((r) => {
    const card = r.account_id ? cards[r.account_id] : undefined;
    return {
      ...r,
      displayName: card?.name ?? r.prospect_name ?? "Unnamed",
      displayPhone: card?.phone ?? r.prospect_phone ?? null,
    };
  });

  const todayIso = todayStartLA().slice(0, 10);

  return (
    <>
      <PageHead title="SDR" sub="Scheduled calls and visits, dial out, log, and flag Outbound from one screen." />
      <SdrScreen initialItems={items} todayIso={todayIso} days={DAYS_AHEAD} />
    </>
  );
}
