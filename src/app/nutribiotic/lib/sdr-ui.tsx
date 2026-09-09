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

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addSdrScheduleItem,
  getSdrAccountPanel,
  rescheduleSdrItem,
  searchSdrAccounts,
  searchSdrClients,
  updateSdrScheduleStatus,
  type SdrAccountPanel,
  type SdrSearchHit,
} from "./sdr-actions";
import type { PriorityBook } from "./dal";
import type { SdrScheduleItem } from "./dal";
import { TopOpportunities } from "./priority-ui";
import { TouchpointCapture } from "./touchpoint-ui";
import type { FiledTouchpoint } from "./touchpoint-ui";
import { Ico, HUBSPOT_COMPANY_URL, daysAgo, fullAddress, googleMapsUrl } from "./ui";

export type SdrDayItem = SdrScheduleItem & {
  displayName: string;
  displayPhone: string | null;
  /** From lib/priority.ts, computed server-side in sdr/page.tsx. Null on a
   *  prospect with no account behind it, and on an account none of whose
   *  inputs are known: not scored is never rendered as a zero. */
  priorityScore: number | null;
  /** The evidence that produced the score. Required alongside it everywhere,
   *  same contract 0035 set for urgency_reason. */
  priorityReason: string | null;
  priorityBand: "now" | "soon" | "later" | "unscored" | null;
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

type AccountHit = { id: string; name: string; city: string | null; phone: string | null };

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
        // Unscored until the next server render, deliberately: scoring needs
        // the whole book's revenue distribution (see priority.ts), and pulling
        // 437 accounts into this form to rank one freshly typed row would cost
        // more egress than the ordering is worth. Null renders as no chip at
        // all rather than as a zero, and the row ranks on the next load.
        priorityScore: null,
        priorityReason: null,
        priorityBand: null,
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
        priorityScore: null,
        priorityReason: null,
        priorityBand: null,
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
function ScheduleRow({
  item,
  active,
  onSelect,
  onStatus,
  onReschedule,
}: {
  item: SdrDayItem;
  active: boolean;
  onSelect: () => void;
  onStatus: (status: "done" | "skipped") => void;
  onReschedule: (date: string) => void;
}) {
  const done = item.status === "done";
  const skipped = item.status === "skipped";
  const [moving, setMoving] = useState(false);

  return (
    <li
      className={`flex flex-wrap items-center gap-2 rounded-md border p-2 ${active ? "border-[#14201B] bg-[#FAF9F5]" : "border-[#E2DFD5]"} ${done ? "opacity-60" : ""} ${skipped ? "opacity-40" : ""}`}
    >
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
          {item.status !== "pending" && <span>· {item.status}</span>}
        </div>
        {/* Why it is ranked here, in words. The rail is narrow, so it clamps
            to two lines; the full sentence is the title. A score with no
            visible reason is the black box 0035 refused to build. */}
        {item.priorityReason && (
          <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[#8A928C]" title={item.priorityReason}>
            {item.priorityReason}
          </div>
        )}
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
              onClick={() => onStatus("skipped")}
              title="Skip"
              className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E2DFD5] text-[#8A928C] hover:bg-[#F7F6F1]"
            >
              <Ico name="close" size={12} />
            </button>
          </>
        )}
      </div>

      {moving && (
        <div className="flex w-full items-center gap-2 border-t border-[#EFEDE5] pt-2">
          <label className="text-[11px] uppercase tracking-[0.08em] text-[#8A928C]">Move to</label>
          {/* A native date input, not a custom calendar: it is the control both
              iOS and the Mac already know how to open, and this row is worked
              from a phone as often as a desk. `defaultValue` is the day it is
              on now, so the picker opens where the row actually is. */}
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
      )}
    </li>
  );
}

/** One labeled fact. Empty/null stays out entirely, HARD RULE 1: a blank
 * field is never shown as a dash or a guess, it just isn't a row. */
function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-1.5 text-[13px]">
      <span className="text-[#8A928C]">{label}</span>
      <span className="text-[#3D4A44]">{value}</span>
    </div>
  );
}

/**
 * The main working surface: what the business is, how to reach it, what's
 * already on file, who's there, the one most recent thing that happened, and
 * the call log itself. Modeled on Juan's own Salesloft reference, but
 * deliberately thinner: no activity table, no order history, no full
 * property dump, just what he'd want in front of him before dialing.
 */
function AccountPanel({ item, onFiled }: { item: SdrDayItem; onFiled: (r: FiledTouchpoint) => void }) {
  const [panel, setPanel] = useState<SdrAccountPanel | null>(null);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    setPanel(null);
    if (!item.account_id) return;
    startTransition(async () => {
      setPanel(await getSdrAccountPanel(item.account_id!));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.account_id]);

  const phone = panel?.phone ?? item.displayPhone;
  const address = panel ? [panel.street, panel.city].filter(Boolean).join(", ") : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-[#E2DFD5] bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[17px] font-semibold text-[#14201B]">{item.displayName}</div>
            {!item.account_id && (
              <div className="mt-0.5 text-[12px] text-[#8A928C]">New prospect, not yet an account</div>
            )}
            {panel && (
              <div className="mt-0.5 text-[12.5px] text-[#5B6560]">
                {panel.channel.replace(/_/g, " ")}
                {panel.currentState ? ` · ${panel.currentState}` : panel.quirks ? ` · ${panel.quirks}` : ""}
              </div>
            )}
          </div>
          {phone && (
            <a
              href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#8A2E2E] px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
            >
              <Ico name="phone" size={13} />
              Call {phone}
            </a>
          )}
        </div>

        {loading && <div className="mt-3 text-[12.5px] text-[#8A928C]">Loading account…</div>}

        {panel && (
          <>
            <div className="mt-3 flex flex-col gap-1.5">
              <Fact label="Website" value={panel.website} />
              <Fact label="Address" value={address} />
              <Fact label="Status" value={panel.lifecycle} />
              <Fact label="Potential" value={panel.potentialJuan} />
              <Fact label="Last order" value={panel.lastOrderAt ? daysAgo(panel.lastOrderAt) : null} />
            </div>

            {/* The two ways to look the place up before dialing: their own
                site, and their Google Maps profile (hours, photos, reviews,
                and often a phone the ERP never had). Maps always renders,
                because it needs only a name; the website renders only when one
                is on file. */}
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {panel.website ? (
                <a
                  href={panel.website.startsWith("http") ? panel.website : `https://${panel.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#3D6B4A] hover:underline"
                >
                  <Ico name="external" size={12} />
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
                  <Ico name="external" size={12} />
                  Open in HubSpot
                </a>
              )}
              <ViewInOutbound accountId={panel.id} />
            </div>

            {panel.lastActivity && (
              <div className="mt-3 rounded-md bg-[#FAF9F5] p-2.5 text-[12.5px] text-[#5B6560]">
                <span className="font-medium text-[#3D4A44] capitalize">{panel.lastActivity.kind}</span>{" "}
                <span className="text-[#8A928C]">{daysAgo(panel.lastActivity.at)}</span>
                {panel.lastActivity.detail && <div className="mt-0.5 line-clamp-2">{panel.lastActivity.detail}</div>}
              </div>
            )}

            {panel.contacts.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-[#E2DFD5] pt-3">
                {panel.contacts.map((c) => (
                  <div key={c.id} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="font-medium text-[#3D4A44]">
                      Contact: {c.name}
                      {c.title ? `, ${c.title}` : ""}
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
          lockKind="call"
          initialText={`Called ${item.displayName} and spoke with: `}
        />
      </div>
    </div>
  );
}

export function SdrScreen({
  initialItems,
  todayIso,
  days,
  focusAccountId,
  focusAccountName,
  focusAccountPhone,
  topRanked,
}: {
  initialItems: SdrDayItem[];
  todayIso: string;
  days: number;
  /** From /nutribiotic/sdr?account=<id>, which the priority panel's "Call ..."
   *  action links to. The panel opens on that account whether or not it has a
   *  row scheduled: a prescriptive list has to be able to hand off to the
   *  thing it prescribes, and most high-priority accounts are high priority
   *  precisely because nothing is scheduled for them yet. */
  focusAccountId?: string | null;
  focusAccountName?: string | null;
  focusAccountPhone?: string | null;
  /** PriorityBook.ranked, plain array (see priority-ui.tsx's TopOpportunities
   *  for why it's this and not the book itself). Optional only so this
   *  component doesn't hard-fail if a caller ever renders it without a
   *  priority book computed; the SDR page always passes it. */
  topRanked?: PriorityBook["ranked"];
}) {
  const [items, setItems] = useState(initialItems);
  const [active, setActive] = useState<SdrDayItem | null>(null);

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
      origin: "manual",
      displayName: focusAccountName,
      displayPhone: focusAccountPhone ?? null,
      priorityScore: null,
      priorityReason: null,
      priorityBand: null,
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
      origin: "manual",
      displayName: hit.accountName,
      displayPhone: hit.phone,
      priorityScore: null,
      priorityReason: null,
      priorityBand: null,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <GlobalSearch todayIso={todayIso} onView={viewHit} onAdded={addItem} />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* The queue, 2026-09-08 redesign: this used to be the main view (a
          grid of day columns) with a generic capture box off to the side.
          Juan's ask was the other way round, an account panel doing the real
          work, this list just picks what goes in it, so it's now a narrow
          rail rather than the dominant surface. */}
      <div className="flex w-full flex-col gap-4 lg:w-[300px] lg:shrink-0">
        {dayIsos.map((iso) => {
          const dayItems = items
            .filter((it) => it.scheduled_date === iso)
            // Pending first, so a fresh Today never buries an open call under
            // yesterday's already-done rows carried in the same fetch window.
            // Then by priority INSIDE the pending block (2026-09-08): the old
            // fallback was creation order, which only recorded which row was
            // typed first. Null sorts last, never as zero, and Array.sort's
            // stability keeps creation order as the final tiebreak.
            .sort((a, b) => {
              if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
              return (b.priorityScore ?? -1) - (a.priorityScore ?? -1);
            });
          return (
            <div key={iso} className="rounded-lg border border-[#E2DFD5] bg-white p-3">
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5B6560]">
                {dayLabel(iso, todayIso)}
              </div>
              <ul className="flex flex-col gap-1.5">
                {dayItems.map((it) => (
                  <ScheduleRow
                    key={it.id}
                    item={it}
                    active={active?.id === it.id}
                    onSelect={() => setActive(it)}
                    onStatus={(status) => setStatus(it.id, status)}
                    onReschedule={(date) => reschedule(it.id, date)}
                  />
                ))}
              </ul>
              <div className="mt-2">
                <AddToDayForm date={iso} onAdded={addItem} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="min-w-0 flex-1">
        {active ? (
          <AccountPanel item={active} onFiled={onFiled} />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[#D8D4C8] text-[13px] text-[#8A928C]">
            Pick a call or visit from the queue
          </div>
        )}
      </div>

      {/* Left is SDR work to do, center is the selected account, right is
          all-time best (Juan, 2026-09-08). */}
      {topRanked && topRanked.length > 0 && <TopOpportunities ranked={topRanked} />}
      </div>
    </div>
  );
}
