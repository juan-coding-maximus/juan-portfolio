"use client";

/**
 * SDR. Plan calls and visits onto specific days, dial out, log what happened
 * through the same box /visit uses, and flag Outbound, all from one desk
 * screen. Juan's ask, 2026-09-08.
 *
 * RINGING IN FROM THE COMPUTER, HONESTLY. There is no VoIP provider wired into
 * this app (no Twilio, no WebRTC softphone), and standing one up needs Juan to
 * sign up for and pay for one himself, that is not a call this page makes for
 * him. So "Call" is a plain `tel:` link: it rings through whatever the Mac
 * already resolves tel: links to (Continuity/Handoff to a paired iPhone, a
 * default softphone app, FaceTime audio). True in-computer call audio with no
 * phone involved at all is a real, separate build once Juan picks a provider.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addSdrItemToRoute,
  addSdrScheduleItem,
  getRecommendedPack,
  getSdrAccountPanel,
  rescheduleSdrItem,
  runQuickEnrichment,
  searchSdrAccounts,
  searchSdrClients,
  updateSdrScheduleStatus,
  type QuickEnrichResult,
  type SdrAccountPanel,
  type SdrSearchHit,
} from "./sdr-actions";
import type { PriorityBook, SdrPriority, SdrScheduleItem, Tier } from "./dal";
import { AccountFilterBar } from "./filter-bar";
import {
  countSubjects,
  emptyFilters,
  isSmallPractice,
  LEAD_STAGE_COLOR,
  matchesFilters,
  type AccountFilterState,
  type FilterSubject,
  type LeadStage,
} from "./account-filters";
import { planningHorizonDates } from "./field-week";
import { laTodayKey, type BusinessHours } from "./hours";
import {
  toggleShowChainAccounts,
  toggleShowPracticeAccounts,
  toggleShowProspectAccounts,
} from "./prefs-actions";
import type { Readiness } from "./priority";
import { OpportunityTypeLists, TopOpportunities } from "./priority-ui";
import { setAccountPhone, setPotentialJuan } from "./account-actions";
import { TouchpointCapture } from "./touchpoint-ui";
import type { FiledTouchpoint } from "./touchpoint-ui";
import { Ico, HUBSPOT_COMPANY_URL, OpenBadge, SuccessNote, daysAgo, fullAddress, googleMapsUrl, money } from "./ui";

/** One territory area, in the order the SDR queue and the map legend both use:
 *  most 80+ prospects first (see sdr/page.tsx and lib/priority.ts). `prospects`
 *  is that count, carried so the section header can show the reason it is
 *  where it is rather than asking Juan to take the order on faith. */
export type SdrAreaGroup = { id: string; label: string; color: string; prospects: number };

/** High first, then Mid, then Low, then null (nobody stated one) last. A stated
 *  Low still sorts above an unstated row, because "Juan looked at this and said
 *  not yet" is more information than silence.
 *
 *  Declared here rather than in dal.ts even though the column lives there:
 *  dal.ts is server-only, and a VALUE import of it from this client component
 *  drags the whole module (and googleapis with it) into the browser bundle,
 *  which Next refuses to build. Type imports are erased and stay in dal. */
const SDR_PRIORITY_RANK: Record<SdrPriority, number> = { high: 3, mid: 2, low: 1 };

export type SdrDayItem = SdrScheduleItem & {
  displayName: string;
  displayPhone: string | null;
  /** nb_accounts.area for the account behind this row, null for a prospect
   *  that is not an account yet. Null groups under "No area", never into a
   *  territory nobody assigned it to. */
  area: string | null;
  /** nb_accounts.business_hours, so the queue itself can show open-now and
   *  today's window without a click into the account panel (Juan, 2026-09-09:
   *  "it informs when I bring up a potential meeting and when I plan on
   *  calling them next"). Null on a prospect with no account, or an account
   *  enrichment hasn't reached yet, renders no badge at all (HARD RULE 1). */
  businessHours: BusinessHours | null;
  /** From lib/priority.ts, computed server-side in sdr/page.tsx. Null on a
   *  prospect with no account behind it, and on an account none of whose
   *  inputs are known: not scored is never rendered as a zero. */
  priorityScore: number | null;
  /** The evidence that produced the score. Required alongside it everywhere,
   *  same contract 0035 set for urgency_reason. */
  priorityReason: string | null;
  priorityBand: "now" | "soon" | "later" | "unscored" | null;
  /* THE FOUR FIELDS THE SHARED FILTER BAR READS (2026-09-09). Juan: "map
     filters (for map and SDR, they should be same)." A chip that exists on
     both screens has to read the same column on both, so the queue carries
     them per row from the account behind it. All four are null on a prospect
     with no account yet, and a null never matches a chip rather than being
     bucketed into one. */
  tier: Tier | null;
  channel: string | null;
  readiness: Readiness | null;
  leadStage: LeadStage | null;
  /** nb_accounts.chain_excluded, for the Chains hide toggle (2026-09-09, Juan:
   *  "the chains practices etc needs to show on SDR as well"). False on a
   *  prospect with no account behind it: nothing to hide it as. */
  chainExcluded: boolean;
};

/** Adds `n` calendar days to a YYYY-MM-DD string, anchored to the date the
 * server already resolved in America/Los_Angeles (see dal.ts's todayStartLA).
 * Deliberately not `new Date(Date.now() + n * 86_400_000)`: that anchors to
 * the browser's UTC instant, which is already tomorrow's date in UTC for
 * roughly the back half of every Pacific day, and would show a "Today" column
 * one day ahead of what the server just queried. */
function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function dayLabel(iso: string, todayIso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const diffDays = Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86_400_000);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (diffDays === 0) return `Today · ${md}`;
  if (diffDays === 1) return `Tomorrow · ${md}`;
  return `${weekday} · ${md}`;
}

/** The next `count` weekdays after `todayIso`, Saturday and Sunday skipped
 *  outright rather than offered as one-tap options nobody works (Juan,
 *  2026-09-15: quick-move buttons for "move to another day"). */
function nextWeekdays(todayIso: string, count: number): string[] {
  const out: string[] = [];
  let n = 1;
  while (out.length < count) {
    const iso = addDaysIso(todayIso, n);
    const dow = new Date(`${iso}T00:00:00`).getDay();
    if (dow !== 0 && dow !== 6) out.push(iso);
    n++;
  }
  return out;
}

/** "Thu 17", compact enough for four of these across one row. */
function quickDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()}`;
}

type AccountHit = { id: string; name: string; city: string | null; phone: string | null; area: string | null };

function AddToDayForm({ date, onAdded }: { date: string; onAdded: (item: SdrDayItem) => void }) {
  const [mode, setMode] = useState<"account" | "prospect">("account");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AccountHit[]>([]);
  const [picked, setPicked] = useState<AccountHit | null>(null);
  const [prospectName, setProspectName] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [kind, setKind] = useState<"call" | "visit">("call");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function search(q: string) {
    setQuery(q);
    setPicked(null);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    startTransition(async () => {
      setHits(await searchSdrAccounts(q));
    });
  }

  function reset() {
    setQuery("");
    setHits([]);
    setPicked(null);
    setProspectName("");
    setProspectPhone("");
    setNotes("");
    setKind("call");
    setOpen(false);
  }

  function submit() {
    if (mode === "account" && !picked) return;
    if (mode === "prospect" && !prospectName.trim()) return;
    startTransition(async () => {
      const row = await addSdrScheduleItem({
        account_id: mode === "account" ? picked!.id : null,
        prospect_name: mode === "prospect" ? prospectName.trim() : null,
        prospect_phone: mode === "prospect" ? prospectPhone.trim() || null : null,
        kind,
        scheduled_date: date,
        notes: notes.trim() || null,
      });
      // The row the server just created has no joined account name/phone on
      // it (nb_sdr_schedule doesn't carry a copy, see getAccountCallCards's
      // comment); this form already has it live from the picker/typed fields,
      // so it builds the display item itself instead of waiting on a refetch
      // that a mounted client component's own state would ignore anyway.
      onAdded({
        ...row,
        displayName: mode === "account" ? picked!.name : prospectName.trim(),
        displayPhone: mode === "account" ? picked!.phone : prospectPhone.trim() || null,
        // From the picker, so the new row appears under the right area header
        // straight away. A typed prospect has none, and says so.
        area: mode === "account" ? picked!.area : null,
        // AccountHit doesn't carry hours (same egress reasoning as the score
        // below); no badge on this row until the next server render.
        businessHours: null,
        // Unscored until the next server render, deliberately: scoring needs
        // the whole book's revenue distribution (see priority.ts), and pulling
        // 437 accounts into this form to rank one freshly typed row would cost
        // more egress than the ordering is worth. Null renders as no chip at
        // all rather than as a zero, and the row ranks on the next load.
        priorityScore: null,
        priorityReason: null,
        priorityBand: null,
        /* Not loaded on a row this component just built or stood in for.
           Null, never a guess: the next server render fills all four from
           the account, and until then this row simply matches no chip.
           chainExcluded defaults false for the same reason: a freshly typed
           or picked row hasn't hidden itself from anything yet. */
        tier: null,
        channel: null,
        readiness: null,
        leadStage: null,
        chainExcluded: false,
      });
      reset();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#D8D4C8] py-2 text-[12.5px] font-medium text-[#8A928C] transition-colors hover:border-[#B8B3A4] hover:text-[#5B6560]"
      >
        <Ico name="plus" size={12} />
        Add to this day
      </button>
    );
  }

  return (
    <div className="rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-3">
      <div className="mb-2 flex gap-1.5">
        <button
          onClick={() => setMode("account")}
          className={`rounded-md px-2 py-1 text-[12px] font-medium ${mode === "account" ? "bg-[#14201B] text-[#F7F6F1]" : "bg-[#ECEAE1] text-[#5B6560]"}`}
        >
          Existing account
        </button>
        <button
          onClick={() => setMode("prospect")}
          className={`rounded-md px-2 py-1 text-[12px] font-medium ${mode === "prospect" ? "bg-[#14201B] text-[#F7F6F1]" : "bg-[#ECEAE1] text-[#5B6560]"}`}
        >
          New prospect
        </button>
      </div>

      {mode === "account" ? (
        <div className="relative">
          <input
            value={picked ? picked.name : query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search your accounts by name"
            className="w-full rounded-md border border-[#E2DFD5] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#14201B]"
          />
          {hits.length > 0 && !picked && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-[#E2DFD5] bg-white shadow-sm">
              {hits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setPicked(h);
                    setHits([]);
                  }}
                  className="block w-full px-2.5 py-1.5 text-left text-[13px] hover:bg-[#F7F6F1]"
                >
                  {h.name}
                  {h.city ? <span className="text-[#8A928C]"> · {h.city}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={prospectName}
            onChange={(e) => setProspectName(e.target.value)}
            placeholder="Business or contact name"
            className="w-full rounded-md border border-[#E2DFD5] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#14201B]"
          />
          <input
            value={prospectPhone}
            onChange={(e) => setProspectPhone(e.target.value)}
            placeholder="Phone"
            className="w-40 rounded-md border border-[#E2DFD5] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#14201B]"
          />
        </div>
      )}

      <div className="mt-2 flex gap-1.5">
        {(["call", "visit"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium capitalize ${kind === k ? "bg-[#14201B] text-[#F7F6F1]" : "bg-[#ECEAE1] text-[#5B6560]"}`}
          >
            {k}
          </button>
        ))}
      </div>

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Why (optional): what to say, what they asked for"
        className="mt-2 w-full rounded-md border border-[#E2DFD5] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#14201B]"
      />

      <div className="mt-2 flex justify-end gap-2">
        <button onClick={reset} className="rounded-md px-2.5 py-1.5 text-[12.5px] text-[#8A928C]">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={pending || (mode === "account" ? !picked : !prospectName.trim())}
          className="rounded-md bg-[#14201B] px-3 py-1.5 text-[12.5px] font-medium text-[#F7F6F1] disabled:opacity-30"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

/**
 * Opens Outbound for this one account in a new tab. Used to be a manual
 * "Needs email" flag Juan typed by hand; Juan's ask, 2026-09-08: that should
 * come from the call he already logged (touchpoint.ts's outreach_asks, filed
 * automatically), not a second thing to fill in here. So this button doesn't
 * flag anything itself, it just shows what's already queued for this client
 * so Juan can check before he moves on.
 */
function ViewInOutbound({ accountId }: { accountId: string }) {
  return (
    <a
      href={`/nutribiotic/outbound?account=${accountId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-[12px] font-medium text-[#5B6560] hover:text-[#14201B]"
    >
      <Ico name="mail" size={12} />
      View in Outbound
    </a>
  );
}

/**
 * One search bar for both companies and people, no mode toggle (Juan's ask,
 * 2026-09-08). A hit's "View" opens it in the main panel without scheduling
 * anything; "Add to day" picks a date and files it into the queue like
 * AddToDayForm does, from a different starting point (a name he already
 * knows, not a specific day he's already looking at).
 */
function GlobalSearch({
  todayIso,
  onView,
  onAdded,
}: {
  todayIso: string;
  onView: (hit: SdrSearchHit) => void;
  onAdded: (item: SdrDayItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SdrSearchHit[]>([]);
  const [pending, startTransition] = useTransition();
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [dateValue, setDateValue] = useState(todayIso);

  function search(q: string) {
    setQuery(q);
    setAddingFor(null);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    startTransition(async () => {
      setHits(await searchSdrClients(q));
    });
  }

  function confirmAdd(hit: SdrSearchHit) {
    startTransition(async () => {
      const row = await addSdrScheduleItem({
        account_id: hit.accountId,
        kind: "call",
        scheduled_date: dateValue,
        notes: null,
      });
      onAdded({
        ...row,
        displayName: hit.accountName,
        displayPhone: hit.phone,
        area: hit.area,
        businessHours: null,
        priorityScore: null,
        priorityReason: null,
        priorityBand: null,
        /* Not loaded on a row this component just built or stood in for.
           Null, never a guess: the next server render fills all four from
           the account, and until then this row simply matches no chip.
           chainExcluded defaults false for the same reason: a freshly typed
           or picked row hasn't hidden itself from anything yet. */
        tier: null,
        channel: null,
        readiness: null,
        leadStage: null,
        chainExcluded: false,
      });
      setAddingFor(null);
      setQuery("");
      setHits([]);
    });
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search your accounts and contacts by name"
          className="w-full rounded-md border border-[#E2DFD5] bg-white py-2 pr-3 pl-9 text-[13.5px] outline-none focus:border-[#14201B]"
        />
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#8A928C]">
          <Ico name="search" size={14} />
        </div>
      </div>

      {query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1.5 w-full rounded-md border border-[#E2DFD5] bg-white shadow-sm">
          {pending && hits.length === 0 ? (
            <div className="px-3 py-2.5 text-[13px] text-[#8A928C]">Searching…</div>
          ) : hits.length === 0 ? (
            <div className="px-3 py-2.5 text-[13px] text-[#8A928C]">No match in your book.</div>
          ) : (
            hits.map((hit) => (
              <div key={hit.accountId} className="flex items-center justify-between gap-2 border-b border-[#F0EEE6] p-2.5 last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-[#14201B]">
                    {hit.contactName
                      ? `${hit.contactName}${hit.contactTitle ? `, ${hit.contactTitle}` : ""} · ${hit.accountName}`
                      : hit.accountName}
                  </div>
                  <div className="text-[11.5px] text-[#8A928C]">{[hit.city, hit.phone].filter(Boolean).join(" · ") || " "}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {addingFor === hit.accountId ? (
                    <>
                      <input
                        type="date"
                        value={dateValue}
                        onChange={(e) => setDateValue(e.target.value)}
                        className="rounded-md border border-[#E2DFD5] px-1.5 py-1 text-[12px]"
                      />
                      <button
                        onClick={() => confirmAdd(hit)}
                        disabled={pending}
                        className="rounded-md bg-[#14201B] px-2.5 py-1 text-[11.5px] font-medium text-[#F7F6F1] disabled:opacity-30"
                      >
                        Add
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingFor(hit.accountId);
                        setDateValue(todayIso);
                      }}
                      className="rounded-md border border-[#E2DFD5] px-2.5 py-1 text-[11.5px] font-medium text-[#5B6560] hover:bg-[#F7F6F1]"
                    >
                      Add to day
                    </button>
                  )}
                  <button
                    onClick={() => onView(hit)}
                    className="rounded-md border border-[#E2DFD5] px-2.5 py-1 text-[11.5px] font-medium text-[#5B6560] hover:bg-[#F7F6F1]"
                  >
                    View
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One row in the day list. Deliberately thin (2026-09-08 redesign): the
 * notes preview and the Outbound link used to print on every row, which is
 * exactly the "crowded" Juan pointed at. Both moved into AccountPanel below,
 * which only ever shows one account at a time and has the room for them.
 */
/** Juan's own Low/Mid/High on the row (migration 0064), not the computed score
 *  next to it. Muted on purpose: it is a label, and the loud thing on a queue
 *  row should stay the business name. Null prints nothing, because nobody said. */
const PRIORITY_CHIP: Record<"low" | "mid" | "high", string> = {
  low: "bg-[#ECEAE1] text-[#8A928C]",
  mid: "bg-[#E7EDE4] text-[#3D6B4A]",
  high: "bg-[#F3E3C6] text-[#8A6D2F]",
};

/**
 * "Add to route" on an SDR row (Juan, 2026-09-08): pick a day from the same
 * rolling horizon the map plans over, optionally state a time, and the stop
 * lands on nb_ui_prefs.route_draft, the one hand-built route.
 *
 * THE TIME IS OPTIONAL AND IT IS AN ANCHOR, not a label. A stop with a stated
 * time holds its arrival in RoutePanel's schedule and the next leg starts from
 * it (migration 0065), which is Juan's routing rule of 2026-09-03 rather than a
 * new idea. Left blank, the stop is placed by order like every other one and
 * claims no time at all.
 *
 * THE ROW STAYS PENDING. Putting a visit on Thursday's route is not having made
 * the call, and closing the row here would log a touch that never happened.
 */
function AddToRoute({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const days = useMemo(() => planningHorizonDates(), []);
  const [day, setDay] = useState(days[0]);
  const [at, setAt] = useState("");
  const [placed, setPlaced] = useState<{ day: string; at: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setFailed(false);
    startTransition(async () => {
      try {
        await addSdrItemToRoute(accountId, day, at || null);
        setPlaced({ day, at: at || null });
      } catch {
        setFailed(true);
      }
    });
  }

  if (placed) {
    return (
      <div className="flex w-full items-center gap-1.5 border-t border-[#EFEDE5] pt-2 text-[11.5px] text-[#3D6B4A]">
        <Ico name="check" size={11} />
        On the route {dayLabelShort(placed.day)}
        {placed.at ? ` at ${placed.at}` : ""}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-[#EFEDE5] pt-2">
      <label className="text-[11px] uppercase tracking-[0.08em] text-[#8A928C]">Route</label>
      <select
        value={day}
        onChange={(e) => setDay(e.target.value)}
        className="rounded-md border border-[#E2DFD5] bg-white px-1.5 py-1 text-[12px] text-[#3D4A44] outline-none focus:border-[#14201B]"
      >
        {days.map((d) => (
          <option key={d} value={d}>
            {dayLabelShort(d)}
          </option>
        ))}
      </select>
      {/* Optional, and left blank it stays blank: an empty time is "no time was
          stated", never midnight. */}
      <input
        type="time"
        value={at}
        onChange={(e) => setAt(e.target.value)}
        className="rounded-md border border-[#E2DFD5] bg-white px-1.5 py-1 text-[12px] text-[#3D4A44] outline-none focus:border-[#14201B]"
      />
      <button
        onClick={submit}
        disabled={pending}
        className="rounded-md bg-[#2C6A46] px-2.5 py-1 text-[11.5px] font-medium text-white disabled:opacity-30"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      <button onClick={onClose} className="px-1 text-[11.5px] text-[#8A928C]">
        Cancel
      </button>
      {failed && <div className="w-full text-[11.5px] text-[#8A2E2E]">Could not add it. Nothing was scheduled.</div>}
    </div>
  );
}

/** "Thu Sep 11", the short form the route day picker reads at a glance. */
function dayLabelShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function ScheduleRow({
  item,
  active,
  onSelect,
  onStatus,
  onReschedule,
  onFiled,
  todayIso,
}: {
  item: SdrDayItem;
  active: boolean;
  onSelect: () => void;
  onStatus: (status: "done" | "skipped") => void;
  onReschedule: (date: string) => void;
  /** Files the call right from the row, no need to open the panel below to
   *  reach the log box: the phone-width layout stacks the panel under a full
   *  day of rows, which is a lot of scrolling for something this quick
   *  (Juan, 2026-09-14). Marks the row done the same way the panel's own
   *  onFiled does. */
  onFiled: (result: FiledTouchpoint) => void;
  /** The server-resolved LA date, so the "move to another day" quick picks
   *  (nextWeekdays) count from the same today the rest of the queue does,
   *  never the browser's own UTC clock. */
  todayIso: string;
}) {
  const done = item.status === "done";
  const skipped = item.status === "skipped";
  const [moving, setMoving] = useState(false);
  const [routing, setRouting] = useState(false);
  const [logging, setLogging] = useState(false);

  return (
    <li
      className={`flex flex-col gap-1 rounded-md border p-2 ${active ? "border-[#14201B] bg-[#FAF9F5]" : "border-[#E2DFD5]"} ${done ? "opacity-60" : ""} ${skipped ? "opacity-40" : ""}`}
    >
      {/* Row 1: name + the actions, top-aligned rather than centered against
          the whole card (Juan, 2026-09-15: the hours pill and the buttons
          used to share one crowded line and the pill wrapped mid-sentence).
          Kept short on purpose, hours/reason get their own full-width line
          below so they're never squeezed by the button row's fixed width. */}
      <div className="flex items-start justify-between gap-2">
        <button onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline gap-1.5">
            {/* The number that put this row where it is, printed on the row
                rather than only explaining itself in the panel above. */}
            {item.priorityScore !== null && (
              <span
                className={`shrink-0 rounded px-1 py-0.5 text-[10.5px] font-medium tabular-nums ${
                  item.priorityBand === "now" ? "bg-[#F3E3C6] text-[#8A6D2F]" : "bg-[#ECEAE1] text-[#5B6560]"
                }`}
              >
                {item.priorityScore}
              </span>
            )}
            <div className="truncate text-[13px] font-medium text-[#14201B]">{item.displayName}</div>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[#8A928C]">
            <span>{item.kind}</span>
            {/* Juan's own call, when he made one. A row nobody prioritised shows
                nothing here rather than a default that would speak for him. */}
            {item.priority && (
              <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${PRIORITY_CHIP[item.priority]}`}>
                {item.priority}
              </span>
            )}
            {item.status !== "pending" && <span>· {item.status}</span>}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {item.displayPhone && (
            <a
              href={`tel:${item.displayPhone.replace(/[^0-9+]/g, "")}`}
              className="flex items-center gap-1 rounded-md bg-[#8A2E2E] px-2 py-1 text-[11.5px] font-medium text-white hover:opacity-90"
              title={`Call ${item.displayPhone}`}
            >
              <Ico name="phone" size={11} />
              Call
            </a>
          )}
          {!done && !skipped && item.account_id && (
            /* Only for a row that IS an account. A cold prospect has no
               nb_accounts row to put on a route, and 0061 made that column
               nullable precisely so the OS would not invent one. */
            <button
              onClick={() => setRouting((v) => !v)}
              title="Put this account on a day's route"
              className={`flex h-6 w-6 items-center justify-center rounded-md border text-[#5B6560] hover:bg-[#F7F6F1] ${
                routing ? "border-[#14201B]" : "border-[#E2DFD5]"
              }`}
            >
              <Ico name="route" size={12} />
            </button>
          )}
        {!done && !skipped && (
          <>
            {/* Move this one to another day. Opens the picker rather than
                showing a date field on every row: the rail holds a week of
                calls and a permanent input on each would be more chrome than
                queue. The date itself is the only thing that moves, and the
                move is what stops the 30-minute follow-through pass proposing
                a competing day for this account (migration 0063). */}
            <button
              onClick={() => setMoving((v) => !v)}
              title="Move to another day"
              className={`flex h-6 w-6 items-center justify-center rounded-md border text-[#5B6560] hover:bg-[#F7F6F1] ${
                moving ? "border-[#14201B]" : "border-[#E2DFD5]"
              }`}
            >
              <Ico name="clock" size={12} />
            </button>
            <button
              onClick={() => onStatus("done")}
              title="Mark done"
              className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E2DFD5] text-[#5B6560] hover:bg-[#F7F6F1]"
            >
              <Ico name="check" size={12} />
            </button>
            <button
              onClick={() => setLogging((v) => !v)}
              title="Log this call"
              className={`flex h-6 w-6 items-center justify-center rounded-md border text-[#5B6560] hover:bg-[#F7F6F1] ${
                logging ? "border-[#14201B]" : "border-[#E2DFD5]"
              }`}
            >
              <Ico name="plus" size={12} />
            </button>
          </>
        )}
        </div>
      </div>

      {/* Row 2: open-now and why-ranked, on their own full-width line now
          rather than squeezed beside the button row (Juan, 2026-09-15: "not
          optimized space"). One line, truncated, not a 2-line clamp that cut
          mid-word; the full sentence is still the title. Renders nothing when
          there's neither, never an empty row. */}
      {(item.businessHours || item.priorityReason) && (
        <button onClick={onSelect} className="flex min-w-0 items-center gap-1.5 text-left">
          {item.businessHours && <OpenBadge businessHours={item.businessHours} />}
          {item.priorityReason && (
            <span className="min-w-0 truncate text-[11px] leading-snug text-[#8A928C]" title={item.priorityReason}>
              {item.priorityReason}
            </span>
          )}
        </button>
      )}

      {routing && item.account_id && <AddToRoute accountId={item.account_id} onClose={() => setRouting(false)} />}

      {logging && (
        <div className="w-full border-t border-[#EFEDE5] pt-2">
          {/* Same "Called X and spoke with: " template the desktop panel
              uses below, just reachable without opening it (Juan, 2026-09-14:
              this is the phone-friendly path). Keyed to the item so it always
              starts fresh for whoever picks up this time. */}
          <TouchpointCapture
            key={item.id}
            accountIdHint={item.account_id}
            onFiled={(result) => {
              onFiled(result);
              setLogging(false);
            }}
            defaultKind="call"
            initialText={`Called ${item.displayName} and spoke with: `}
          />
        </div>
      )}

      {moving && (
        <div className="flex w-full flex-col gap-1.5 border-t border-[#EFEDE5] pt-2">
          {/* Four one-tap days, next weekdays only (Juan, 2026-09-15): moving
              a call almost always means tomorrow or one of the next few
              working days, and typing a date for that is the slow path. Skips
              Saturday/Sunday outright rather than offering a day nobody
              works. The date input below stays for the real exception, an
              overnight trip or a specific far-out day. */}
          <div className="grid grid-cols-4 gap-1">
            {nextWeekdays(todayIso, 4).map((iso, i) => (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  setMoving(false);
                  onReschedule(iso);
                }}
                className="rounded-md border border-[#E2DFD5] bg-white px-1.5 py-1 text-[11.5px] font-medium text-[#3D4A44] hover:bg-[#FAF9F5]"
              >
                {i === 0 ? "Tomorrow" : quickDayLabel(iso)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {/* A native date input, not a custom calendar: it is the control
                both iOS and the Mac already know how to open, and this row is
                worked from a phone as often as a desk. `defaultValue` is the
                day it is on now, so the picker opens where the row actually
                is. No label here, the four buttons above already say what
                this row does (Juan, 2026-09-15: less crowded). */}
            <input
              type="date"
              defaultValue={item.scheduled_date}
              onChange={(e) => {
                const v = e.target.value;
                if (!v || v === item.scheduled_date) return;
                setMoving(false);
                onReschedule(v);
              }}
              className="rounded-md border border-[#E2DFD5] bg-white px-2 py-1 text-[12.5px] text-[#3D4A44] outline-none focus:border-[#14201B]"
            />
            {item.rescheduled_at && (
              <span
                className="text-[11px] text-[#8A928C]"
                title="You moved this one. The automatic follow-up pass will not propose a different day for it."
              >
                moved by you
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

const READINESS_FACT_LABEL: Record<Readiness, string> = { urgent: "Urgent", hot: "Hot", normal: "Normal", cold: "Cold" };

/** One labeled fact. Empty/null stays out entirely, HARD RULE 1: a blank
 * field is never shown as a dash or a guess, it just isn't a row. `href`
 * makes the value itself a clickable new-tab link. */
function Fact({ label, value, href }: { label: string; value: string | null; href?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-1.5 text-[13px]">
      <span className="text-[#8A928C]">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#3D6B4A] hover:underline">
          {value}
        </a>
      ) : (
        <span className="text-[#3D4A44]">{value}</span>
      )}
    </div>
  );
}

/** "53 days", a bare count for the parameter row (Juan, 2026-09-15: "last
 *  purchase: 53 days"). Distinct from ui.tsx's daysAgo(), which buckets into
 *  "7mo ago" for anything over 60 days, too coarse for this reading. */
function exactDaysAgo(iso: string | null): string | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  return `${d} day${d === 1 ? "" : "s"}`;
}

/** "22 days ago" / "in the future" reading of expected_reorder_at against
 *  today, LA wall-clock date rather than a UTC instant so the boundary lands
 *  on the same day a rep would say it does. */
function dueInDays(iso: string | null): string | null {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00`).getTime();
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })).getTime();
  const d = Math.round((target - today) / 86_400_000);
  if (d === 0) return "today";
  const n = Math.abs(d);
  return d > 0 ? `${n} day${n === 1 ? "" : "s"} in future` : `${n} day${n === 1 ? "" : "s"} ago`;
}

const SDR_POTENTIAL_LETTERS: Tier[] = ["A", "B", "C", "D", "E"];

/**
 * A-E only, same scope touchpoint-ui.tsx's own visit capture box holds to
 * (F/G are administrative dispositions, not a size a rep forms looking at a
 * business): editable right on the call panel, "up there close to the name"
 * (Juan, 2026-09-15), not buried in a read-only Fact row lower down. Same
 * write path as account-detail.tsx's own PotentialGrade, setPotentialJuan
 * (account-actions.ts) -> nb_accounts.potential_juan -> HubSpot's
 * potential__cloned_ on hubspot_sync.py's next 60-second cycle.
 */
function PotentialGradeInline({ accountId, value: initial }: { accountId: string; value: Tier | null }) {
  const [value, setValue] = useState<Tier | null>(initial);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.08em] text-[#8A928C]">Potential</span>
      <div className="flex gap-0.5">
        {SDR_POTENTIAL_LETTERS.map((t) => {
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
              className={`h-5 w-5 rounded text-[10.5px] font-semibold transition-colors ${
                active ? "bg-[#14201B] text-[#F7F6F1]" : "bg-[#ECEAE1] text-[#3D4A44] hover:bg-[#E2DFD5]"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The phone number, editable right where he's about to dial it, same "fix
 * the record" rule as account-actions.ts's setAccountPhone: a number heard
 * or read wrong is corrected on nb_accounts itself, never left as a note
 * beside a stale value.
 */
function PhoneEditable({ accountId, phone }: { accountId: string; phone: string | null }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(phone);
  const [value, setValue] = useState(phone ?? "");
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="+13105551234"
          className="w-[150px] rounded-md border border-[#E2DFD5] bg-white px-2 py-1 text-[13px] text-[#3D4A44] outline-none focus:border-[#14201B]"
        />
        <button
          type="button"
          disabled={pending || !value.trim()}
          onClick={() => {
            const next = value.trim();
            startTransition(async () => {
              await setAccountPhone(accountId, next);
              setSaved(next);
              setEditing(false);
            });
          }}
          className="rounded-md bg-[#14201B] px-2 py-1 text-[11.5px] font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-[11.5px] text-[#8A928C]">
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setValue(saved ?? "");
        setEditing(true);
      }}
      title="Correct this number"
      className="flex items-center gap-1 text-[13px] font-medium text-[#3D4A44] hover:text-[#14201B]"
    >
      {saved ?? <span className="font-normal text-[#8A928C]">No phone on file</span>}
      <Ico name="edit" size={11} />
    </button>
  );
}

/**
 * The main working surface: what the business is, how to reach it, what's
 * already on file, who's there, the one most recent thing that happened, and
 * the call log itself. Modeled on Juan's own Salesloft reference, but
 * deliberately thinner: no activity table, no order history, no full
 * property dump, just what he'd want in front of him before dialing.
 */
function AccountPanel({
  item,
  areas,
  onFiled,
}: {
  item: SdrDayItem;
  /** Same list the day groups and the right rail already colour their dots
   *  from, so the panel header's dot can never disagree with either. */
  areas: SdrAreaGroup[];
  onFiled: (r: FiledTouchpoint) => void;
}) {
  const [panel, setPanel] = useState<SdrAccountPanel | null>(null);
  const [loading, startTransition] = useTransition();
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<QuickEnrichResult | null>(null);

  useEffect(() => {
    setPanel(null);
    setEnrichResult(null);
    if (!item.account_id) return;
    const accountId = item.account_id;
    startTransition(async () => {
      setPanel(await getSdrAccountPanel(accountId));
    });
    // The recommended pack is never worth the panel's own paint waiting on
    // it (two sequential Storage HTTP calls, the slowest part of opening a
    // row by far): fetched after, merged in whenever it lands, same pattern
    // handleEnrich already uses below.
    void getRecommendedPack(accountId).then((recommendedPack) => {
      setPanel((p) => (p && p.id === accountId ? { ...p, recommendedPack } : p));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.account_id]);

  /** ~30s pass over the website, Google Places, and this account's own order
   *  history (lib/quick-enrich.ts), fired from the button beside Call. Merges
   *  the result straight into the panel already on screen rather than
   *  re-fetching it, so a field he already blank-filled doesn't flash. */
  async function handleEnrich() {
    if (!item.account_id || enriching) return;
    setEnriching(true);
    setEnrichResult(null);
    try {
      const result = await runQuickEnrichment(item.account_id);
      setEnrichResult(result);
      if (result.ok && (result.wroteHours || result.wroteSummary)) {
        setPanel((p) =>
          p
            ? {
                ...p,
                businessHours: result.wroteHours ? result.businessHours : p.businessHours,
                currentState: result.wroteSummary ? result.currentState : p.currentState,
                futureState: result.wroteSummary ? result.futureState : p.futureState,
                impact: result.wroteSummary ? result.impact : p.impact,
              }
            : p,
        );
      }
    } finally {
      setEnriching(false);
    }
  }

  const phone = panel?.phone ?? item.displayPhone;
  const address = panel ? [panel.street, panel.city].filter(Boolean).join(", ") : null;
  const area = panel?.area ? (areas.find((a) => a.id === panel.area) ?? null) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-[#E2DFD5] bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[17px] font-semibold text-[#14201B]">{item.displayName}</div>
              {panel?.businessHours && <OpenBadge businessHours={panel.businessHours} />}
              {/* The territory this account sits in, full name (not the
                  right rail's abbreviation) and its map colour, so the panel
                  answers "where is this" without a trip to the map
                  (Juan, 2026-09-14). */}
              {area && (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#5B6560]">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: area.color }} />
                  {area.label}
                </span>
              )}
            </div>
            {!item.account_id && (
              <div className="mt-0.5 text-[12px] text-[#8A928C]">New prospect, not yet an account</div>
            )}
            {panel && (panel.channel !== "unknown" || panel.currentState || panel.quirks) && (
              <div className="mt-0.5 text-[12.5px] text-[#5B6560]">
                {panel.channel !== "unknown" ? panel.channel.replace(/_/g, " ") : ""}
                {panel.currentState
                  ? `${panel.channel !== "unknown" ? " · " : ""}${panel.currentState}`
                  : panel.quirks
                    ? `${panel.channel !== "unknown" ? " · " : ""}${panel.quirks}`
                    : ""}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {phone && (
              <a
                href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
                className="flex items-center gap-1.5 rounded-md bg-[#8A2E2E] px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
              >
                <Ico name="phone" size={13} />
                Call {phone}
              </a>
            )}
            {item.account_id && (
              <button
                type="button"
                onClick={handleEnrich}
                disabled={enriching}
                title="~30s look at the website, Google Maps, and their order history for accurate hours and an executive summary"
                className="flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#3D4A44] hover:bg-[#FAF9F5] disabled:opacity-60"
              >
                <Ico name="wand" size={12} />
                {enriching ? "Enriching…" : "Enrich further"}
              </button>
            )}
          </div>
        </div>

        {/* Number and A-E potential, editable, right up top beside the name
            (Juan, 2026-09-15): the two things he corrects most often stood
            buried as read-only Facts lower in the panel before this. Keyed
            per account so switching rows never carries stale local state
            from whoever he was just looking at into the next one. */}
        {panel && item.account_id && (
          <div className="mt-2.5 flex flex-wrap items-center gap-4 border-t border-[#E2DFD5] pt-2.5">
            <PotentialGradeInline key={`grade-${panel.id}`} accountId={panel.id} value={panel.potentialJuan as Tier | null} />
            <PhoneEditable key={`phone-${panel.id}`} accountId={panel.id} phone={panel.phone} />
          </div>
        )}

        {loading && <div className="mt-3 text-[12.5px] text-[#8A928C]">Loading account…</div>}

        {panel && (
          <>
            {/* THE ANGLE, first thing under the header, the phone screen he's
                already scrolled to right before dialing (Juan, 2026-09-14).
                Same three fields account-detail.tsx's "The gap" card reads
                (nb_accounts.current_state/future_state/impact), read as a
                short paragraph: what this account actually is, where the gap
                is, what it's worth. current_state is written to read as a
                real angle now (quick-enrich.ts, 2026-09-15: "a nutrition
                specialty shop inside a gym"), not a bare fact restated, and
                weighs a rep's own logged calls/meetings above the website or
                Places when they disagree. A gap here is reported, not
                hidden, so it's visible as work still to do rather than
                looking finished when it isn't. */}
            <div className="mt-3 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-2.5 text-[13px] leading-relaxed text-[#3D4A44]">
              {panel.currentState || panel.futureState || panel.impact ? (
                <div className="flex flex-col gap-1">
                  {panel.currentState && <div>{panel.currentState}</div>}
                  {panel.futureState && <div>{panel.futureState}</div>}
                  {panel.impact && <div>{panel.impact}</div>}
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 text-[#8A928C]">
                  <Ico name="alert" size={12} />
                  No executive summary on file yet, nobody has run discovery on this account.
                </span>
              )}
              {panel.recommendedPack && (
                <a
                  href={panel.recommendedPack.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#E3EFE6] px-2.5 py-1 text-[12.5px] font-medium text-[#2C6A46] hover:opacity-90"
                >
                  <Ico name="book" size={12} />
                  Bring: {panel.recommendedPack.label}
                </a>
              )}
            </div>

            {/* Every parameter the exec summary used to leave in prose, now a
                labeled value (Juan, 2026-09-15: "if anything can be a
                parameter it is stated as a parameter"). Status here is HQ's
                own lead_status mirror, not the OS's behaviour-derived
                lifecycle, which stays lower with Address and readiness. */}
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md border border-[#E2DFD5] p-2.5 text-[13px]">
              <Fact label="Last purchase" value={exactDaysAgo(panel.lastOrderAt)} />
              <Fact label="Due purchase" value={dueInDays(panel.expectedReorderAt)} />
              <Fact label="Lifetime value" value={panel.lifetimeRevenue != null ? money(panel.lifetimeRevenue) : null} />
              <Fact label="Status" value={panel.leadStatus} />
            </div>

            {panel.purchases && (
              <div className="mt-3 border-t border-[#E2DFD5] pt-3">
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
                  <span>Main purchases</span>
                  <span className="normal-case tracking-normal">
                    {panel.purchases.orderCount} order{panel.purchases.orderCount === 1 ? "" : "s"} · () is last 3 orders
                  </span>
                </div>
                <ul className="flex flex-col divide-y divide-[#EDEBE3]">
                  {panel.purchases.topItems.map((it) => (
                    <li key={it.name} className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
                      <span className="min-w-0 truncate">{it.name}</span>
                      <span className="shrink-0 tabular-nums text-[#5B6560]">
                        ×{it.qty} <span className="text-[#8A928C]">· {money(it.revenueCents / 100)}</span>
                        {it.last3Qty > 0 && <span className="text-[#8A928C]"> (×{it.last3Qty})</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {panel.purchases.smallItemNames.length > 0 && (
                  <div className="mt-1.5 text-[12px] text-[#8A928C]">
                    Small amounts of {panel.purchases.smallItemNames.join(", ")}.
                  </div>
                )}
              </div>
            )}

            {enrichResult && !enriching && (
              <div className="mt-2">
                {enrichResult.ok ? (
                  <SuccessNote
                    title={enrichResult.wroteHours || enrichResult.wroteSummary ? "Enriched" : "Nothing new found"}
                    detail={
                      [
                        enrichResult.wroteHours ? "Hours updated." : null,
                        enrichResult.wroteSummary ? "Executive summary filled." : null,
                        !enrichResult.wroteHours && !enrichResult.wroteSummary
                          ? (enrichResult.skippedReason ?? "The website, Google Maps, and order history had nothing new to add.")
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" ")
                    }
                  />
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12.5px] text-[#8A6D2F]">
                    <Ico name="alert" size={12} />
                    Enrich further failed: {enrichResult.error}
                  </span>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-col gap-1.5">
              <Fact label="Address" value={address} />
              <Fact label="Lead readiness" value={panel.readiness ? READINESS_FACT_LABEL[panel.readiness] : null} />
            </div>

            {panel.businessHours && (
              <div className="mt-3 flex flex-col gap-1 border-t border-[#E2DFD5] pt-3">
                <span className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Hours</span>
                {Object.entries(panel.businessHours).map(([day, ranges]) => {
                  const isToday = day === laTodayKey();
                  return (
                    <div
                      key={day}
                      className={`flex items-baseline justify-between gap-3 text-[13px] ${isToday ? "font-medium" : ""}`}
                    >
                      <span className={`capitalize ${isToday ? "text-[#14201B]" : "text-[#8A928C]"}`}>
                        {day}
                        {isToday ? " (today)" : ""}
                      </span>
                      <span className={`tabular-nums ${isToday ? "text-[#14201B]" : "text-[#3D4A44]"}`}>
                        {ranges.length ? ranges.map((r) => r.join(" to ")).join(", ") : "closed"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* The website, when there's one on file, is only ever a link:
                the URL string itself is not information worth reading in a
                panel this tight, so nothing above duplicates it as plain
                text (Juan, 2026-09-09). The two ways to look the place up
                before dialing: their own site, and their Google Maps profile
                (photos, reviews, and often a phone the ERP never had). Maps
                always renders, because it needs only a name; the website link
                renders only when one is on file. */}
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {panel.website ? (
                <a
                  href={panel.website.startsWith("http") ? panel.website : `https://${panel.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#3D6B4A] hover:underline"
                >
                  <Ico name="globe" size={12} />
                  Open website
                </a>
              ) : (
                /* NOT A UI BUG, A DATA GAP, and it says which. 35 of Juan's
                   accounts carry no website; the fix is the enricher's
                   blank-fill job against Places/web search, never a URL this
                   component guesses from the business name. */
                <span className="inline-flex items-center gap-1 text-[12.5px] text-[#8A928C]">
                  <Ico name="alert" size={12} />
                  No website on file
                </span>
              )}
              <a
                href={googleMapsUrl({
                  name: panel.name,
                  address: fullAddress({ street: panel.street, city: panel.city, state: panel.state, postal: panel.postal }),
                  lat: panel.lat,
                  lng: panel.lng,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#3D6B4A] hover:underline"
              >
                <Ico name="pin" size={12} />
                Open in Google Maps
              </a>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#E2DFD5] pt-3">
              {panel.hubspotCompanyId && (
                <a
                  href={HUBSPOT_COMPANY_URL(panel.hubspotCompanyId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[12.5px] font-medium text-[#5B6560] hover:text-[#14201B]"
                >
                  <Ico name="hubspot" size={12} />
                  Open in HubSpot
                </a>
              )}
              <ViewInOutbound accountId={panel.id} />
            </div>

            {panel.activities.length > 0 && (
              <div className="mt-3 flex flex-col gap-2 border-t border-[#E2DFD5] pt-3">
                <span className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
                  Meetings and calls
                </span>
                {panel.activities.map((act, i) => (
                  <div key={`${act.at}-${i}`} className="rounded-md bg-[#FAF9F5] p-2.5 text-[12.5px] text-[#5B6560]">
                    <span className="font-medium text-[#3D4A44] capitalize">{act.kind.replace(/_/g, " ")}</span>{" "}
                    <span className="text-[#8A928C]">{daysAgo(act.at)}</span>
                    {act.detail && <div className="mt-0.5 whitespace-pre-wrap">{act.detail}</div>}
                  </div>
                ))}
              </div>
            )}

            {panel.contacts.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-[#E2DFD5] pt-3">
                {panel.contacts.map((c) => (
                  <div key={c.id} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="flex items-center gap-1.5 font-medium text-[#3D4A44]">
                      Contact: {c.name}
                      {c.title ? `, ${c.title}` : ""}
                      {c.isDecisionMaker && (
                        <span className="rounded bg-[#ECEAE1] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[#3D4A44] uppercase">
                          Decision maker
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[#8A928C]">{c.phone ?? c.email ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <div className="mb-2 text-[12px] uppercase tracking-[0.1em] text-[#8A928C]">Log this call</div>
        {/* Keyed per item: a fresh TouchpointCapture instance per selection,
            so the "Called X and spoke with: " template is right for whoever
            is on the line, not whoever he was calling before. */}
        <TouchpointCapture
          key={item.id}
          accountIdHint={item.account_id}
          onFiled={onFiled}
          defaultKind="call"
          initialText={`Called ${item.displayName} and spoke with: `}
        />
      </div>
    </div>
  );
}

/**
 * One day's rows, grouped by the territory area each account sits in, areas in
 * the order sdr/page.tsx handed down: most 80+ prospects first (Juan,
 * 2026-09-08). Returns only the groups that actually have rows on this day, so
 * a day with four calls shows the two or three areas they are in, never fifteen
 * empty headers.
 *
 * INSIDE a group the existing order stands unchanged: pending before closed,
 * then by computed priority, then creation order. Area is a new outer level,
 * not a replacement for how a call gets picked out of a group.
 *
 * A row whose account has no area (a cold prospect, or an account
 * assign_areas.py could not place) lands in a group of its own at the bottom,
 * named for what it is. It is never filed into a territory nobody assigned it
 * to, and never dropped, which is the failure that would actually cost a call.
 */
function groupByArea(
  dayItems: SdrDayItem[],
  areas: SdrAreaGroup[],
): { area: SdrAreaGroup | null; items: SdrDayItem[] }[] {
  const byArea = new Map<string, SdrDayItem[]>();
  const noArea: SdrDayItem[] = [];
  for (const it of dayItems) {
    if (!it.area) {
      noArea.push(it);
      continue;
    }
    const bucket = byArea.get(it.area);
    if (bucket) bucket.push(it);
    else byArea.set(it.area, [it]);
  }

  const groups: { area: SdrAreaGroup | null; items: SdrDayItem[] }[] = [];
  for (const area of areas) {
    const items = byArea.get(area.id);
    if (items) {
      groups.push({ area, items });
      byArea.delete(area.id);
    }
  }
  // An area id on a row that the areas list does not carry (a re-cut mid-render,
  // or an account still pointing at a retired area). Shown, not swallowed.
  for (const [id, items] of byArea) {
    groups.push({ area: { id, label: id, color: "#8A928C", prospects: 0 }, items });
  }
  if (noArea.length > 0) groups.push({ area: null, items: noArea });
  return groups;
}

export function SdrScreen({
  initialItems,
  todayIso,
  days,
  areas,
  focusAccountId,
  focusAccountName,
  focusAccountPhone,
  focusAccountBusinessHours,
  topRanked,
  initialShowChains,
  initialShowPractices,
  initialShowProspects,
}: {
  initialItems: SdrDayItem[];
  todayIso: string;
  days: number;
  /** Every territory area, already ordered by 80+ prospect count desc (see
   *  sdr/page.tsx). The queue groups each day's rows under these headers in
   *  exactly this order, the same order the map legend uses. */
  areas: SdrAreaGroup[];
  /** From /nutribiotic/sdr?account=<id>, which the priority panel's "Call ..."
   *  action links to. The panel opens on that account whether or not it has a
   *  row scheduled: a prescriptive list has to be able to hand off to the
   *  thing it prescribes, and most high-priority accounts are high priority
   *  precisely because nothing is scheduled for them yet. */
  focusAccountId?: string | null;
  focusAccountName?: string | null;
  focusAccountPhone?: string | null;
  focusAccountBusinessHours?: BusinessHours | null;
  /** PriorityBook.ranked, plain array (see priority-ui.tsx's TopOpportunities
   *  for why it's this and not the book itself). Optional only so this
   *  component doesn't hard-fail if a caller ever renders it without a
   *  priority book computed; the SDR page always passes it. */
  topRanked?: PriorityBook["ranked"];
  /** nb_ui_prefs (see sdr/page.tsx's getMapDisplayPrefs), the SAME row /map
   *  reads and writes: Juan, 2026-09-09, "the chains practices etc needs to
   *  show on SDR as well." One preference, followed between the two screens
   *  and his other device, not a second copy that can disagree with it. */
  initialShowChains: boolean;
  initialShowPractices: boolean;
  initialShowProspects: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [active, setActive] = useState<SdrDayItem | null>(null);

  /* Phone width stacks the panel BELOW the whole day's rail (this column
   * only sits beside it from lg up), so picking a name off the queue used to
   * leave Juan staring at the row he just tapped, with the account's phone
   * and contacts a scroll away. He wants his thumb already on the panel the
   * moment he's about to dial (2026-09-14: "exactly where I want to have my
   * phone in for the moment when I actually make that call"). `block:
   * "start"` on desktop, where the panel is already beside the rail and
   * already in view, is a no-op scroll, not a jump. */
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Keyed on the id on purpose: a status change on the already-open row
    // (done/skipped/filed) re-renders `active` with a new object but should
    // not yank the screen back down to a panel he's already looking at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  // area id -> colour, off the same `areas` list the day groups already
  // paint their dots with (see groupByArea below), so a right-rail dot and a
  // day-group dot for the same area can never disagree about its colour.
  const areaColor = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a.color])), [areas]);

  const [showChains, setShowChains] = useState(initialShowChains);
  function toggleChains() {
    const next = !showChains;
    setShowChains(next);
    toggleShowChainAccounts(next).catch(() => setShowChains(!next));
  }
  const [showPractices, setShowPractices] = useState(initialShowPractices);
  function togglePractices() {
    const next = !showPractices;
    setShowPractices(next);
    toggleShowPracticeAccounts(next).catch(() => setShowPractices(!next));
  }
  const [showProspects, setShowProspects] = useState(initialShowProspects);
  function toggleProspects() {
    const next = !showProspects;
    setShowProspects(next);
    toggleShowProspectAccounts(next).catch(() => setShowProspects(!next));
  }

  /* THE SAME FILTER BAR THE MAP RENDERS, not a second one that happens to
     look like it (Juan, 2026-09-09: "map filters (for map and SDR, they should
     be same)"). Five sections, one vocabulary, one predicate, all in
     lib/account-filters.ts. Empty set is unfiltered, multi-select, AND'd
     across sections and against the day.

     COLLAPSED BY DEFAULT, same as the map (Juan, 2026-09-09). Five sections
     is a wall of controls to open a page onto, and filtering is something you
     do occasionally while the queue behind it is what you came for. The
     summary line and the active-filter badge stay visible either way, so a
     filtered queue never looks like an empty one. */
  const [filters, setFilters] = useState<AccountFilterState>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* THE THREE HIDE TOGGLES, now shared with /map (Juan, 2026-09-09: "the
     chains, practices etc needs to show on SDR as well"). Same predicates as
     the map: Practices sized live off channel + tier (isSmallPractice), not
     the stored practice_excluded flag; Prospect is lead_stage === 'prospect'.
     A row Juan scheduled at a chain, a small practice, or an untouched lead
     drops out of the queue exactly as its pin drops off the map, until the
     matching toggle is switched on. */
  const visibleItems = useMemo(
    () =>
      items.filter(
        (it) =>
          (showChains || !it.chainExcluded) &&
          (showPractices || !isSmallPractice(it.channel, it.tier)) &&
          (showProspects || it.leadStage !== "prospect"),
      ),
    [items, showChains, showPractices, showProspects],
  );

  // Hide-toggle counts, over the WHOLE queue (not visibleItems), same rule as
  // the map's chainExcludedCount/practiceExcludedCount/prospectExcludedCount:
  // a toggle has to state how many rows it is hiding, not how many are left.
  const chainExcludedCount = useMemo(() => items.filter((it) => it.chainExcluded).length, [items]);
  const practiceExcludedCount = useMemo(
    () => items.filter((it) => isSmallPractice(it.channel, it.tier)).length,
    [items],
  );
  const prospectExcludedCount = useMemo(
    () => items.filter((it) => it.leadStage === "prospect").length,
    [items],
  );

  /* One subject per SCHEDULED ROW, not per account, because that is what this
     screen filters: two calls booked on the same store are two rows here and
     the counts have to say two. Built with the same shape the map builds, so
     lib/account-filters.ts counts and matches both screens identically.
     Built from visibleItems, same reason the map counts off visibleAccounts:
     a badge counting the whole queue while a hide toggle is hiding rows from
     it would read as a lie the moment one of Juan's own chip counts didn't
     add up to what's on screen. */
  const subjects = useMemo<FilterSubject[]>(
    () =>
      visibleItems.map((it) => ({
        id: it.id,
        area: it.area,
        tier: it.tier,
        readiness: it.readiness,
        score: it.priorityScore,
        channel: it.channel,
        leadStage: it.leadStage,
      })),
    [visibleItems],
  );

  const filterCounts = useMemo(() => countSubjects(subjects), [subjects]);

  function itemMatchesFilters(it: SdrDayItem): boolean {
    return matchesFilters(filters, {
      id: it.id,
      area: it.area,
      tier: it.tier,
      readiness: it.readiness,
      score: it.priorityScore,
      channel: it.channel,
      leadStage: it.leadStage,
    });
  }

  /* Opening on a deep-linked account when it has no scheduled row means
     showing AccountPanel for something nb_sdr_schedule does not contain. The
     stand-in exists only in this component's state and is never written: it
     carries a synthetic id so nothing can mark it done, and AccountPanel keys
     entirely off account_id anyway. Adding a real row here instead would put
     a call on Juan's calendar he never asked for. */
  useEffect(() => {
    if (!focusAccountId) return;
    const existing = initialItems.find((it) => it.account_id === focusAccountId && it.status === "pending");
    if (existing) {
      setActive(existing);
      return;
    }
    if (!focusAccountName) return;
    setActive({
      id: `unscheduled:${focusAccountId}`,
      account_id: focusAccountId,
      prospect_name: null,
      prospect_phone: null,
      kind: "call",
      scheduled_date: todayIso,
      status: "pending",
      notes: null,
      completed_activity_id: null,
      created_at: new Date().toISOString(),
      rescheduled_at: null,
      // A stand-in is not a row, so it carries no stated priority and no area
      // of its own: both come from the real row or the account behind it.
      priority: null,
      area: null,
      origin: "manual",
      displayName: focusAccountName,
      displayPhone: focusAccountPhone ?? null,
      businessHours: focusAccountBusinessHours ?? null,
      priorityScore: null,
      priorityReason: null,
      priorityBand: null,
      /* Not loaded on a row this component just built or stood in for.
         Null, never a guess: the next server render fills all four from
         the account, and until then this row simply matches no chip.
         chainExcluded defaults false, same reason. */
      tier: null,
      channel: null,
      readiness: null,
      leadStage: null,
      chainExcluded: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAccountId]);

  const dayIsos = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < days; i++) out.push(addDaysIso(todayIso, i));
    return out;
  }, [todayIso, days]);

  // Appended straight into local state, not a router.refresh(): this component
  // already mounted with initialItems, and a Server Component re-render after
  // revalidatePath() hands it a fresh initialItems prop that useState's own
  // rules say a mounted component ignores. Juan hit exactly this, 2026-09-08:
  // adding a call did nothing visible until a hard reload.
  function addItem(item: SdrDayItem) {
    setItems((prev) => [...prev, item]);
  }

  /** The row's own "+" log box, 2026-09-14: same result shape the panel's
   *  onFiled handles below, just addressed to whichever row was tapped
   *  rather than whatever is `active`. */
  function filedFromRow(id: string, result: FiledTouchpoint) {
    setStatus(id, "done", result.activityId ?? undefined);
  }

  function setStatus(id: string, status: "done" | "skipped", completedActivityId?: number) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status, completed_activity_id: completedActivityId ?? it.completed_activity_id } : it)));
    if (active?.id === id) setActive(null);
    void updateSdrScheduleStatus(id, status, completedActivityId);
  }

  /* Optimistic, same as setStatus: the row moves in the rail immediately and
     the write follows. `rescheduled_at` is stamped locally too so the "moved
     by you" note and the follow-through pass's stand-down are consistent
     without waiting for a refetch. */
  function reschedule(id: string, date: string) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, scheduled_date: date, rescheduled_at: new Date().toISOString() } : it)),
    );
    setActive((cur) => (cur?.id === id ? { ...cur, scheduled_date: date, rescheduled_at: new Date().toISOString() } : cur));
    void rescheduleSdrItem(id, date);
  }

  function onFiled(result: FiledTouchpoint) {
    if (!active) return;
    // A stand-in for a deep-linked, unscheduled account has no row to close.
    if (active.id.startsWith("unscheduled:")) {
      setActive(null);
      return;
    }
    setStatus(active.id, "done", result.activityId ?? undefined);
  }

  /* The search bar's "View": same unscheduled stand-in focusAccountId already
     uses above, so a client found by name behaves exactly like one landed on
     from the priority panel, opens the panel, schedules nothing. If it's
     already in today's or a later day's pending queue, that real row wins
     instead of a second stand-in for the same account. */
  function viewHit(hit: SdrSearchHit) {
    const existing = items.find((it) => it.account_id === hit.accountId && it.status === "pending");
    if (existing) {
      setActive(existing);
      return;
    }
    setActive({
      id: `unscheduled:${hit.accountId}`,
      account_id: hit.accountId,
      prospect_name: null,
      prospect_phone: null,
      kind: "call",
      scheduled_date: todayIso,
      status: "pending",
      notes: null,
      completed_activity_id: null,
      created_at: new Date().toISOString(),
      rescheduled_at: null,
      // A stand-in is not a row, so it carries no stated priority and no area
      // of its own: both come from the real row or the account behind it.
      priority: null,
      area: null,
      origin: "manual",
      displayName: hit.accountName,
      displayPhone: hit.phone,
      businessHours: null,
      priorityScore: null,
      priorityReason: null,
      priorityBand: null,
      /* Not loaded on a row this component just built or stood in for.
         Null, never a guess: the next server render fills all four from
         the account, and until then this row simply matches no chip.
         chainExcluded defaults false, same reason. */
      tier: null,
      channel: null,
      readiness: null,
      leadStage: null,
      chainExcluded: false,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <GlobalSearch todayIso={todayIso} onView={viewHit} onAdded={addItem} />

      {/* THE FILTER BAR, the same component /map renders (lib/filter-bar.tsx),
          now with the same three hide toggles too (Juan, 2026-09-09: "the
          chains practices etc needs to show on SDR as well" -- overriding
          the day-one call that a scheduled call should never disappear). */}
      <div className="overflow-hidden rounded-lg border border-[#E2DFD5] [&>*:last-child]:border-b-0">
        <AccountFilterBar
          value={filters}
          onChange={setFilters}
          counts={filterCounts}
          areas={areas}
          summary={`${visibleItems.filter(itemMatchesFilters).length} of ${items.length}`}
          open={filtersOpen}
          onToggleOpen={() => setFiltersOpen((v) => !v)}
          hideToggles={[
            ...(chainExcludedCount > 0
              ? [{
                  key: "chains",
                  count: chainExcludedCount,
                  shown: showChains,
                  onToggle: toggleChains,
                  shownLabel: "Chains shown",
                  hiddenLabel: "Chains",
                  icon: "accounts",
                  title: showChains
                    ? "Hide the big national chains again"
                    : `${chainExcludedCount} big-chain row(s) hidden (Whole Foods, Sprouts, Trader Joe's, CVS/Walgreens, Target)`,
                }]
              : []),
            ...(practiceExcludedCount > 0
              ? [{
                  key: "practices",
                  count: practiceExcludedCount,
                  shown: showPractices,
                  onToggle: togglePractices,
                  shownLabel: "Practices shown",
                  hiddenLabel: "Practices",
                  icon: "review",
                  title: showPractices
                    ? "Hide small practices again"
                    : `${practiceExcludedCount} small practice row(s) hidden: a clinic/practice grading E. A bigger clinic counts under Type's Clinics chip instead.`,
                }]
              : []),
          ]}
          leadStatusHideToggles={[
            ...(prospectExcludedCount > 0
              ? [{
                  key: "prospects",
                  count: prospectExcludedCount,
                  shown: showProspects,
                  onToggle: toggleProspects,
                  shownLabel: "Prospect shown",
                  hiddenLabel: "Prospect hidden",
                  dot: LEAD_STAGE_COLOR.prospect,
                  title: showProspects
                    ? "Hide unworked Prospect-stage rows again"
                    : `${prospectExcludedCount} row(s) hidden: Lead status Prospect, no touchpoint logged yet.`,
                }]
              : []),
          ]}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* The queue, 2026-09-08 redesign: this used to be the main view (a
          grid of day columns) with a generic capture box off to the side.
          Juan's ask was the other way round, an account panel doing the real
          work, this list just picks what goes in it, so it's now a narrow
          rail rather than the dominant surface. */}
      <div className="flex w-full flex-col gap-4 lg:w-[300px] lg:shrink-0">
        {dayIsos.map((iso) => {
          const dayItems = visibleItems
            .filter((it) => it.scheduled_date === iso)
            // The same predicate the map applies, from lib/account-filters.ts.
            // Empty selection is unfiltered; a picked chip hides everything
            // else, including rows carrying null for that field (a prospect
            // with no account behind it can't be "in" the area Juan chose, and
            // is not a Dormant account either).
            .filter(itemMatchesFilters)
            // Pending first, so a fresh Today never buries an open call under
            // yesterday's already-done rows carried in the same fetch window.
            // Then by priority INSIDE the pending block (2026-09-08): the old
            // fallback was creation order, which only recorded which row was
            // typed first. Null sorts last, never as zero, and Array.sort's
            // stability keeps creation order as the final tiebreak.
            // Juan's stated priority outranks the computed score inside a day
            // (0064): a High he typed is him overriding the arithmetic, and a
            // ranking that quietly ignored that would make the control a
            // decoration. Null (nobody said) sorts after every stated one,
            // then the computed score breaks the tie, then creation order.
            .sort((a, b) => {
              if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
              const pd =
                (b.priority ? SDR_PRIORITY_RANK[b.priority] : 0) - (a.priority ? SDR_PRIORITY_RANK[a.priority] : 0);
              if (pd !== 0) return pd;
              return (b.priorityScore ?? -1) - (a.priorityScore ?? -1);
            });
          const groups = groupByArea(dayItems, areas);
          return (
            <div key={iso} className="rounded-lg border border-[#E2DFD5] bg-white p-3">
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5B6560]">
                {dayLabel(iso, todayIso)}
              </div>
              {groups.map(({ area, items: areaItems }) => (
                <div key={area?.id ?? "no-area"} className="mb-2 last:mb-0">
                  {/* The area's own colour, the same swatch the map paints its
                      frontier and its filter chip with, so a section header and
                      the region it names are visibly one thing. The count is
                      how many rows are actually in THIS group, on THIS day
                      (Juan, 2026-09-14: the header number and the cards under
                      it disagreed, because this used to print area.prospects,
                      the book-wide count of that area's 80+-score accounts,
                      a different number entirely from what is on screen). */}
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[#8A928C]">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: area?.color ?? "#C9CCC6" }}
                    />
                    <span className="truncate">{area?.label ?? "No area"}</span>
                    <span className="tabular-nums text-[#B4B9B3]">{areaItems.length}</span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {areaItems.map((it) => (
                      <ScheduleRow
                        key={it.id}
                        item={it}
                        active={active?.id === it.id}
                        onSelect={() => setActive(it)}
                        onStatus={(status) => setStatus(it.id, status)}
                        onReschedule={(date) => reschedule(it.id, date)}
                        onFiled={(result) => filedFromRow(it.id, result)}
                        todayIso={todayIso}
                      />
                    ))}
                  </ul>
                </div>
              ))}
              <div className="mt-2">
                <AddToDayForm date={iso} onAdded={addItem} />
              </div>
            </div>
          );
        })}
      </div>

      <div ref={panelRef} className="min-w-0 flex-1 scroll-mt-3">
        {active ? (
          <AccountPanel item={active} areas={areas} onFiled={onFiled} />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[#D8D4C8] text-[13px] text-[#8A928C]">
            Pick a call or visit from the queue
          </div>
        )}
      </div>

      {/* Left is SDR work to do, center is the selected account, right is
          all-time best (Juan, 2026-09-08), then the three type-scoped
          opportunity lists stacked under it in the same column
          (Juan, 2026-09-14). */}
      {topRanked && topRanked.length > 0 && (
        <div className="flex w-full flex-col gap-4 lg:w-[220px] lg:shrink-0">
          <TopOpportunities ranked={topRanked} areaColor={areaColor} />
          <OpportunityTypeLists ranked={topRanked} areaColor={areaColor} />
        </div>
      )}
      </div>
    </div>
  );
}
