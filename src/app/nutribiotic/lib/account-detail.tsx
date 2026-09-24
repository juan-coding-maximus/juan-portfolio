"use client";

/**
 * The account profile body. Pure presentation, no data fetching, so it renders
 * identically whether it lands on the standalone /account/[id] page (deep
 * link, direct visit) or inside the pop-up modal every list link opens by
 * default (see modal.tsx). One shape, two hosts.
 *
 * "use client" only because it reads the route context for the Add to route
 * button; the standalone page is a Server Component, which can still render
 * this as a client child.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Account, Activity, Contact, PurchaseLine, PurchaseOrder, Tier } from "./dal";
import { draftAccountPitch, setPotentialJuan } from "./account-actions";
import { planningHorizonDates } from "./field-week";
import { owaComposeLink } from "./outbound-ui";
import { useRoute } from "./route-context";
import { addAccountToSdr } from "./sdr-actions";
import { TouchpointCapture } from "./touchpoint-ui";
import {
  Card,
  Empty,
  HUBSPOT_COMPANY_URL,
  Ico,
  OpenBadge,
  PhoneDisplay,
  TierChip,
  absoluteUrl,
  daysAgo,
  money,
  prettyPhone,
  prettyUrl,
  withinTrailing12mo,
} from "./ui";

/**
 * The "+" on an open profile (Juan, 2026-09-15: standing in front of an
 * account he already has open, the only thing he actually wants next is to
 * log what just happened here, not the global QuickCapture button underneath
 * this very modal, unreachable at z-40 while the profile sits at z-50). Opens
 * the SAME TouchpointCapture every other door uses, with this account already
 * hinted (skips account matching entirely) and the name seeded into the box
 * so he never has to say what store he's at. z-[60]: one layer above the
 * account modal (modal.tsx, z-50) it renders inside of.
 */
function LogVisitSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#14201B]/40 px-4 py-8 backdrop-blur-[2px] sm:py-14"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] rounded-xl border border-[#E2DFD5] bg-[#F7F6F1] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-t-xl border-b border-[#E2DFD5] bg-[#F7F6F1] px-5 py-4">
          <h2 className="truncate font-[family-name:var(--font-fraunces)] text-[19px] leading-none font-semibold tracking-tight">
            Log a visit &middot; {account.name}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-[#8A928C] transition-colors hover:bg-[#ECEAE1] hover:text-[#14201B]"
          >
            <Ico name="close" size={16} />
          </button>
        </div>
        {/* No max-h/overflow-y here: iOS Safari won't hand a touch-scroll
            gesture between nested overflow-y-auto containers, so nesting
            one inside the backdrop's own scroll region (above) traps the
            gesture on the backdrop. One scroll container for the modal. */}
        <div className="overflow-x-hidden px-5 py-5">
          <TouchpointCapture accountIdHint={account.id} initialText={`${account.name}: `} />
        </div>
      </div>
    </div>
  );
}

function routeDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Add to route, asking which day first (Juan, 2026-09-23: the plain button
 * used to drop the account onto whichever day happened to be active on
 * /map, not necessarily today and not a day chosen for this account). A tap
 * opens a day picker scoped to the planning horizon; nothing is written
 * until a day is actually picked. Once scheduled, on ANY day, it goes inert
 * and names the day rather than staying tappable, same one-tap rule as the
 * plain button it replaces.
 */
function AddToRoutePicker({ accountId }: { accountId: string }) {
  const { days, stopDayById, addToRouteOnDay } = useRoute();
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(days[0]);
  const scheduledDay = stopDayById.get(accountId) ?? null;

  if (scheduledDay) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#EEECE3] px-3.5 py-2 text-[13px] font-semibold text-[#5B6560]">
        <Ico name="check" size={13} />
        On the route &middot; {routeDayLabel(scheduledDay)}
      </span>
    );
  }

  if (!picking) {
    return (
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#2C6A46] px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Ico name="route" size={13} />
        Add to route
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white py-1 pr-1 pl-2.5">
      <select
        value={date}
        onChange={(ev) => setDate(ev.target.value)}
        aria-label="Route day"
        className="bg-transparent text-[13px] font-medium text-[#3D4A44] outline-none"
      >
        {days.map((d) => (
          <option key={d} value={d}>
            {routeDayLabel(d)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          addToRouteOnDay(accountId, date);
          setPicking(false);
        }}
        className="rounded-md bg-[#2C6A46] px-2.5 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setPicking(false)}
        aria-label="Cancel"
        className="rounded-md p-1.5 text-[#8A928C] transition-colors hover:bg-[#ECEAE1] hover:text-[#14201B]"
      >
        <Ico name="close" size={12} />
      </button>
    </div>
  );
}

const SDR_HORIZON_DAYS = 14;

/**
 * Add to SDR, same day-picker shape as AddToRoutePicker just above (Juan,
 * 2026-09-23: "same quick select date as in route but for sdr in the next 2
 * weeks"), over a longer horizon since the SDR desk queue is worked further
 * out than the drivable route is. Writes straight to nb_sdr_schedule as a
 * call (addAccountToSdr, the same action the map pin's own "Add to SDR" card
 * uses, see AccountsMap.tsx), always at "mid" priority: this button is one
 * plain queue-it action, not the map card's three-way priority picker.
 * "On SDR" afterward is session-local, matching the map card's own
 * queued-state, since nothing here re-reads nb_sdr_schedule to know it was
 * already scheduled from elsewhere.
 */
function AddToSdrPicker({ accountId }: { accountId: string }) {
  const days = useMemo(() => planningHorizonDates(SDR_HORIZON_DAYS), []);
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(days[0]);
  const [queuedFor, setQueuedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await addAccountToSdr(accountId, "mid", date);
      if (res.ok) {
        setQueuedFor(date);
        setPicking(false);
      } else {
        setError(res.error);
      }
    });
  }

  if (queuedFor) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#EEECE3] px-3.5 py-2 text-[13px] font-semibold text-[#5B6560]">
        <Ico name="check" size={13} />
        On SDR &middot; {routeDayLabel(queuedFor)}
      </span>
    );
  }

  if (!picking) {
    return (
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] hover:text-[#14201B]"
      >
        <Ico name="phone" size={13} />
        Add to SDR
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white py-1 pr-1 pl-2.5">
        <select
          value={date}
          onChange={(ev) => setDate(ev.target.value)}
          aria-label="SDR day"
          className="bg-transparent text-[13px] font-medium text-[#3D4A44] outline-none"
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {routeDayLabel(d)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="rounded-md bg-[#14201B] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#F7F6F1] disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setPicking(false)}
          aria-label="Cancel"
          className="rounded-md p-1.5 text-[#8A928C] transition-colors hover:bg-[#ECEAE1] hover:text-[#14201B]"
        >
          <Ico name="close" size={12} />
        </button>
      </div>
      {error && <span className="max-w-[32ch] text-[12px] text-[#8A2E2E]">{error}</span>}
    </div>
  );
}

/**
 * Draft outreach, on the spot (Juan, 2026-09-23: "need to be able to open
 * this in outbound and automatically draft upon the click"). One tap
 * composes a pitch from this account's own Now/Opening/Impact summary --
 * the same composer touchpoint.ts calls on a logged customer ask, see
 * account-actions.ts's draftAccountPitch -- and, once it lands, opens
 * Outbound scoped to this account so the new draft is the first thing he
 * sees. A missing email or phone never blocks the draft itself: the
 * Outbound card offers a Copy button instead, meant for pasting into the
 * store's own website contact form.
 */
function DraftOutreachButton({ accountId }: { accountId: string }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function run() {
    setNote(null);
    startTransition(async () => {
      const res = await draftAccountPitch(accountId);
      if (res.status === "not_written") {
        setNote(res.reason);
        return;
      }
      window.open(`/nutribiotic/outbound?account=${accountId}`, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] hover:text-[#14201B] disabled:opacity-50"
      >
        <Ico name="mail" size={13} />
        {pending ? "Drafting…" : "Draft outreach"}
      </button>
      {note && <span className="max-w-[32ch] text-[12px] text-[#8A928C]">{note}</span>}
    </div>
  );
}

const POTENTIAL_LETTERS: Tier[] = ["A", "B", "C", "D", "E", "F", "G"];

/**
 * HQ's grade beside Juan's own read, same two-scale rule as TierChip
 * (ui.tsx): never a bare letter, always which scale it came from. HQ's is
 * read-only here on purpose, the mirror stays pull-only (0021). Juan's is a
 * toggle, PATCHed to nb_accounts.potential_juan by setPotentialJuan
 * (account-actions.ts), local only. HubSpot never enters this component: the
 * push is bridges/nutribiotic/hubspot_sync.py's --watch loop picking up the
 * new value on its own 60-second cycle and overwriting HQ's grade on
 * potential__cloned_ (nutribiotic/config/hubspot_fields.json's push-only
 * potential_juan entry), Juan's explicit call, 2026-08-21. Tapping the active
 * letter clears it back to "defer to HQ" locally only, the loop never blanks
 * the portal.
 */
function PotentialGrade({
  accountId,
  hq,
  juan,
}: {
  accountId: string;
  hq: string | null;
  juan: Tier | null;
}) {
  const [value, setValue] = useState<Tier | null>(juan);
  const [pending, startTransition] = useTransition();
  const hqLetter = hq ? hq.split(" ")[0] || null : null;

  return (
    <Card>
      <div className="mb-2.5 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Potential</div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-[#5B6560]">HQ grade</span>
        {hqLetter ? <TierChip tier={hqLetter} scale="hq" /> : <span className="text-[#A9AFA9]">not graded yet</span>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[13px] text-[#5B6560]">Your read</span>
        <div className="flex gap-1">
          {POTENTIAL_LETTERS.map((t) => {
            const active = value === t;
            return (
              <button
                key={t}
                type="button"
                disabled={pending}
                aria-pressed={active}
                onClick={() => {
                  const next = active ? null : t;
                  setValue(next);
                  startTransition(() => {
                    void setPotentialJuan(accountId, next);
                  });
                }}
                className={`h-6 w-6 rounded text-[11.5px] font-semibold transition-colors ${
                  active
                    ? "bg-[#14201B] text-[#F7F6F1]"
                    : "bg-[#ECEAE1] text-[#3D4A44] hover:bg-[#E2DFD5]"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>
      {value && (
        <p className="mt-2 text-[11.5px] text-[#8A928C]">
          Syncs to HubSpot within a minute, overwriting HQ&rsquo;s Potential (new).
        </p>
      )}
    </Card>
  );
}

// Website is NOT here: it graduated to the action row at the top of the profile
// (2026-08-05) and listing it twice would make the same link look like two.
const SOCIAL_LINKS = (a: Account) =>
  [
    a.email && { href: owaComposeLink(a.email, null, "").href, label: a.email, icon: "mail" as const },
    a.instagram_url && { href: a.instagram_url, label: "Instagram", icon: "instagram" as const },
    a.facebook_url && { href: a.facebook_url, label: "Facebook", icon: "facebook" as const },
    a.linkedin_url && { href: a.linkedin_url, label: "LinkedIn", icon: "linkedin" as const },
  ].filter(Boolean) as { href: string; label: string; icon: "mail" | "instagram" | "facebook" | "linkedin" }[];

export function AccountDetailBody({
  account: a,
  activities: acts,
  contacts,
  orders = [],
  lines = [],
}: {
  account: Account;
  activities: Activity[];
  contacts: Contact[];
  orders?: PurchaseOrder[];
  lines?: PurchaseLine[];
}) {
  const gap = a.current_state || a.future_state || a.impact;
  const links = SOCIAL_LINKS(a);
  const [logVisitOpen, setLogVisitOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {logVisitOpen && <LogVisitSheet account={a} onClose={() => setLogVisitOpen(false)} />}

      {/* THE THREE OUTSIDE HANDLES, ABOVE EVERYTHING. Juan, 2026-08-05: the
          HubSpot record was reachable only from a map pin's card, so opening an
          account from a list meant closing the profile again to get to the
          portal. Website and phone sat in the right column, which is the last
          thing read on a laptop and the last thing scrolled to on a phone. All
          three are actions, not attributes, so they lead. The full number stays
          in the sidebar too: this row is for tapping, that one is for reading
          aloud. Absent ones render as muted, unclickable text rather than
          vanishing, so "we never found a site" is visible as a gap to fill. */}
      <div className="flex flex-wrap items-center gap-2">
        {a.hubspot_company_id ? (
          <a
            href={HUBSPOT_COMPANY_URL(a.hubspot_company_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-[#2C6A46] px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Ico name="external" size={13} />
            Open in HubSpot
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#E2DFD5] px-3.5 py-2 text-[13px] text-[#A9AFA9]">
            <Ico name="external" size={13} />
            No HubSpot record
          </span>
        )}

        {a.website ? (
          <a
            href={absoluteUrl(a.website)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] hover:text-[#14201B]"
          >
            <Ico name="globe" size={13} />
            <span className="max-w-[26ch] truncate">{prettyUrl(a.website)}</span>
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#E2DFD5] px-3.5 py-2 text-[13px] text-[#A9AFA9]">
            <Ico name="globe" size={13} />
            No site on file
          </span>
        )}

        {a.phone ? (
          <a
            href={`tel:${a.phone}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3.5 py-2 text-[13px] font-medium tabular-nums text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] hover:text-[#14201B]"
          >
            <Ico name="phone" size={13} />
            {prettyPhone(a.phone)}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#E2DFD5] px-3.5 py-2 text-[13px] text-[#A9AFA9]">
            <Ico name="phone" size={13} />
            No phone on file
          </span>
        )}

        {/* Add to route, asking which day (AddToRoutePicker, account-detail.tsx):
            once scheduled, on any day, it goes inert and names the day rather
            than staying tappable. Removing a stop is the route panel's job. */}
        <AddToRoutePicker accountId={a.id} />

        {/* Add to SDR, same day-picker shape, over the desk queue's own
            two-week horizon (AddToSdrPicker, above). */}
        <AddToSdrPicker accountId={a.id} />

        {/* Draft outreach, composed from this account's own gap-selling summary
            and opened straight into Outbound (DraftOutreachButton, above). */}
        <DraftOutreachButton accountId={a.id} />

        {/* Log a visit, right here. Same capture box as ClientOS and /visit,
            pre-aimed at this account so it never has to say the store's name. */}
        <button
          type="button"
          onClick={() => setLogVisitOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] hover:text-[#14201B]"
        >
          <Ico name="plus" size={13} />
          Log a visit
        </button>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        {/* Quirks first. This is what makes or breaks the visit. */}
        {a.quirks && (
          <Card className="border-l-[3px] border-l-[#14201B]">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
              <Ico name="pin" size={13} />
              Field notes
            </div>
            <p className="text-[14.5px] leading-relaxed">{a.quirks}</p>
          </Card>
        )}

        {/* People. Who you are actually meeting. */}
        {contacts.length > 0 && (
          <Card>
            <div className="mb-3 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">People</div>
            <ul className="flex flex-col gap-3">
              {contacts.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
                // c.title is free text (e.g. "DVM, Veterinarian"); c.role_tag is the
                // coarse relationship the extractor read from what he actually
                // called them (owner/manager/buyer/clerk/other). Title wins when
                // set, since it's more specific, but a role_tag with no title is
                // real information (an owner named with no job title stated) and
                // used to render nothing at all here, silently.
                const roleLabel = c.title || (c.role_tag ? c.role_tag[0].toUpperCase() + c.role_tag.slice(1) : null);
                // The front desk whose name he did not catch is a real person he
                // met, so the role takes the name's place instead of leaving a
                // bare grey label floating where a person should be.
                const lead = name || roleLabel;
                if (!lead) return null;
                return (
                  <li key={c.id} className="flex flex-col gap-0.5 text-[13.5px]">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{lead}</span>
                      {name && roleLabel && <span className="text-[12px] text-[#8A928C]">{roleLabel}</span>}
                      {c.is_decision_maker && (
                        <span className="rounded bg-[#ECEAE1] px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide text-[#3D4A44] uppercase">
                          Decision maker
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-[#5B6560]">
                      {c.email && (
                        <a
                          href={owaComposeLink(c.email, null, "").href}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:underline"
                        >
                          {c.email}
                        </a>
                      )}
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="underline-offset-2 hover:underline">
                          {c.phone}
                        </a>
                      )}
                      {c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {/* Gap Selling. Diagnosis before pitch. Renders only once discovery has
            actually captured something, same rule as every other optional
            card below: a field nobody has filled in is absent, not explained. */}
        {gap && (
          <Card>
            <div className="mb-3 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
              Summary
            </div>
            <dl className="flex flex-col gap-3 text-[14px]">
              {[
                ["Now", a.current_state],
                ["Opening", a.future_state],
                ["Impact", a.impact],
              ].map(([label, val]) =>
                val ? (
                  <div key={label as string}>
                    <dt className="text-[12px] text-[#8A928C]">{label}</dt>
                    <dd className="mt-0.5 leading-relaxed">{val}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </Card>
        )}

        {/* Purchases. Every item this account has ever ordered, summed to net
            units across the full order history and ranked most-to-least, for
            the 146 of 459 accounts with loaded order history; absent entirely
            otherwise (see listPurchases in dal.ts), same honesty rule as
            every other card here: no orders on file is silence, not a zero.
            Summing net (not gross) matters: a credit line has negative qty,
            and a return should pull an item's rank down, not inflate it. */}
        {orders.length > 0 && (() => {
          const orderedAt = new Map(orders.map((o) => [o.id, o.ordered_at]));
          const totals = new Map<string, { qty: number; revenueCents: number; lastOrderedAt: string | null }>();
          for (const l of lines) {
            const name = l.product_name ?? "Item";
            const prev = totals.get(name) ?? { qty: 0, revenueCents: 0, lastOrderedAt: null };
            const at = orderedAt.get(l.order_id) ?? null;
            totals.set(name, {
              qty: prev.qty + (l.qty ?? 0),
              revenueCents: prev.revenueCents + l.line_revenue_cents,
              lastOrderedAt: at && (!prev.lastOrderedAt || at > prev.lastOrderedAt) ? at : prev.lastOrderedAt,
            });
          }
          const items = [...totals.entries()]
            .filter(([, t]) => t.qty !== 0)
            .sort((a, b) => b[1].qty - a[1].qty);

          return (
            <Card>
              <div className="mb-3 flex items-baseline justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
                <span>Purchases</span>
                <span className="normal-case tracking-normal">
                  {orders.length} order{orders.length === 1 ? "" : "s"} · most units first
                </span>
              </div>
              <ul className="flex flex-col divide-y divide-[#EDEBE3]">
                {items.map(([name, t]) => {
                  const recent = withinTrailing12mo(t.lastOrderedAt);
                  return (
                    <li key={name} className="flex items-baseline justify-between gap-3 py-1.5 text-[13.5px]">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="min-w-0 truncate">{name}</span>
                        {recent && (
                          <span className="shrink-0 rounded-full bg-[#B3452C] px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide text-white uppercase">
                            Recent
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-[#5B6560]">
                        ×{t.qty} <span className="text-[#8A928C]">· {money(t.revenueCents / 100)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })()}

        {/* History. Append-only, so this is the real record. Internal/system
            rows (corrections, geocode notes, import notes, admin log lines,
            all direction:"internal" per HARD RULE 16) never happened with
            the account and just eat time reading real notes, so they stay in
            the ledger (audit) but never render here (Juan, 2026-09-16). */}
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
            History
          </h2>
          {(() => {
            const realActs = acts.filter((t) => t.direction !== "internal");
            if (realActs.length === 0) return <Empty>No activity logged.</Empty>;
            return (
            <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5] bg-white">
              {realActs.map((t) => (
                <li key={t.id} className="flex flex-col gap-1 px-4 py-2.5 text-[13.5px]">
                  <span className="flex items-baseline gap-3">
                    <span className="w-[86px] shrink-0 text-[12px] text-[#8A928C]">
                      {daysAgo(t.at)}
                    </span>
                    <span className="font-medium">{t.kind.replace(/_/g, " ")}</span>
                  </span>
                  {/* Full note, not a squeezed one-liner (Juan, 2026-09-14):
                      meeting/call notes are the whole record of what was said,
                      so they wrap and read in full rather than truncating. */}
                  {(t.detail ?? t.outcome?.replace(/_/g, " ")) && (
                    <p className="ml-[98px] max-w-[68ch] whitespace-pre-wrap text-[#5B6560]">
                      {t.detail ?? t.outcome?.replace(/_/g, " ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            );
          })()}
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <PotentialGrade accountId={a.id} hq={a.potential_hq} juan={a.potential_juan} />

        <Card>
          {/* Two stat tiles per row on a phone, label stacked over value, both
              hard-truncated: a squeezed sidebar row that can't fit its value
              used to overflow the whole page sideways with body's dark bg
              bleeding through and the value scrolled out of view entirely,
              silent because of the site-wide overflow-x:hidden safety net.
              Truncating instead of wrapping keeps every tile one line at any
              width, since these values (a state word, "8mo ago", a dollar
              amount, a date) are always short. Reverts to the original
              compact single-column list once there is real sidebar width. */}
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-[13.5px] lg:flex lg:flex-col lg:gap-2.5">
            {[
              ["State", a.lifecycle || "unknown"],
              ["Last order", a.last_order_at ? daysAgo(a.last_order_at) : "never"],
              ["Lifetime", money(a.lifetime_revenue)],
              ["Trailing 12mo", money(a.trailing_12m_revenue)],
              ["Reorder due", a.expected_reorder_at ?? "not set"],
            ].map(([k, v]) => (
              <div
                key={k as string}
                className="flex min-w-0 flex-col gap-1 lg:flex-row lg:items-baseline lg:justify-between lg:gap-3"
              >
                <dt className="text-[11px] uppercase tracking-[0.08em] text-[#8A928C] lg:text-[13.5px] lg:normal-case lg:tracking-normal">
                  {k}
                </dt>
                <dd className="truncate text-[15px] font-semibold text-[#14201B] lg:text-right lg:text-[13.5px] lg:font-normal">
                  {v}
                </dd>
              </div>
            ))}
            {a.phone && (
              <div className="col-span-2 flex items-center justify-between gap-3 border-t border-[#EDEBE3] pt-4 lg:col-span-1 lg:pt-2.5">
                <dt className="text-[11px] uppercase tracking-[0.08em] text-[#8A928C] lg:text-[13.5px] lg:normal-case lg:tracking-normal">
                  Phone
                </dt>
                <dd className="min-w-0">
                  <PhoneDisplay value={a.phone} />
                </dd>
              </div>
            )}
          </dl>
        </Card>

        {links.length > 0 && (
          <Card>
            <div className="mb-2.5 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Channels</div>
            <ul className="flex flex-col gap-2">
              {links.map((l) => (
                <li key={l.icon}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-[13px] text-[#3D4A44] transition-colors hover:text-[#14201B] hover:underline"
                  >
                    <Ico name={l.icon} size={14} />
                    <span className="truncate">{l.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {a.business_hours && (
          <Card>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Hours</div>
              <OpenBadge businessHours={a.business_hours} />
            </div>
            <dl className="flex flex-col gap-1 text-[13px]">
              {Object.entries(a.business_hours).map(([day, ranges]) => (
                <div key={day} className="flex justify-between gap-3">
                  <dt className="w-9 shrink-0 text-[#8A928C] capitalize">{day}</dt>
                  <dd className="min-w-0 flex-1 text-right break-words tabular-nums">
                    {ranges.length ? ranges.map((r) => r.join(" to ")).join(", ") : "closed"}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </aside>
      </div>
    </div>
  );
}
