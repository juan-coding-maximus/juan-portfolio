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
  searchSdrAccounts,
  updateSdrScheduleStatus,
  type SdrAccountPanel,
} from "./sdr-actions";
import type { SdrScheduleItem } from "./dal";
import { TouchpointCapture } from "./touchpoint-ui";
import type { FiledTouchpoint } from "./touchpoint-ui";
import { Ico, HUBSPOT_COMPANY_URL, daysAgo } from "./ui";

export type SdrDayItem = SdrScheduleItem & {
  displayName: string;
  displayPhone: string | null;
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
}: {
  item: SdrDayItem;
  active: boolean;
  onSelect: () => void;
  onStatus: (status: "done" | "skipped") => void;
}) {
  const done = item.status === "done";
  const skipped = item.status === "skipped";

  return (
    <li
      className={`flex items-center gap-2 rounded-md border p-2 ${active ? "border-[#14201B] bg-[#FAF9F5]" : "border-[#E2DFD5]"} ${done ? "opacity-60" : ""} ${skipped ? "opacity-40" : ""}`}
    >
      <button onClick={onSelect} className="min-w-0 flex-1 text-left">
        <div className="truncate text-[13px] font-medium text-[#14201B]">{item.displayName}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[#8A928C]">
          <span>{item.kind}</span>
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
        {!done && !skipped && (
          <>
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

            {panel.website && (
              <a
                href={panel.website.startsWith("http") ? panel.website : `https://${panel.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-[#3D6B4A] hover:underline"
              >
                <Ico name="external" size={12} />
                Open website
              </a>
            )}

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
                      {c.name}
                      {c.title && <span className="font-normal text-[#8A928C]"> · {c.title}</span>}
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
        <TouchpointCapture accountIdHint={item.account_id} onFiled={onFiled} lockKind="call" />
      </div>
    </div>
  );
}

export function SdrScreen({ initialItems, todayIso, days }: { initialItems: SdrDayItem[]; todayIso: string; days: number }) {
  const [items, setItems] = useState(initialItems);
  const [active, setActive] = useState<SdrDayItem | null>(null);

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

  function onFiled(result: FiledTouchpoint) {
    if (!active) return;
    setStatus(active.id, "done", result.activityId ?? undefined);
  }

  return (
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
            .sort((a, b) => (a.status === b.status ? 0 : a.status === "pending" ? -1 : 1));
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
    </div>
  );
}
