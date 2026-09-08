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

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSdrScheduleItem, flagNeedsEmail, searchSdrAccounts, updateSdrScheduleStatus } from "./sdr-actions";
import type { SdrScheduleItem } from "./dal";
import { TouchpointCapture } from "./touchpoint-ui";
import type { FiledTouchpoint } from "./touchpoint-ui";
import { Ico } from "./ui";

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

function AddToDayForm({ date, onAdded }: { date: string; onAdded: () => void }) {
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
      await addSdrScheduleItem({
        account_id: mode === "account" ? picked!.id : null,
        prospect_name: mode === "prospect" ? prospectName.trim() : null,
        prospect_phone: mode === "prospect" ? prospectPhone.trim() || null : null,
        kind,
        scheduled_date: date,
        notes: notes.trim() || null,
      });
      reset();
      onAdded();
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

function NeedsEmailFlag({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return <span className="text-[12px] font-medium text-[#3D6B4A]">Flagged for Outbound</span>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[12px] font-medium text-[#5B6560] hover:text-[#14201B]"
      >
        <Ico name="mail" size={12} />
        Needs email
      </button>
    );
  }

  return (
    <div className="mt-1.5 w-full">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What the email needs to cover, specifically"
        rows={2}
        className="w-full resize-none rounded-md border border-[#E2DFD5] bg-white px-2 py-1.5 text-[12.5px] outline-none focus:border-[#14201B]"
      />
      {error && <div className="mt-1 text-[11.5px] text-[#8A6D2F]">{error}</div>}
      <div className="mt-1 flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="text-[11.5px] text-[#8A928C]">
          Cancel
        </button>
        <button
          disabled={pending || !text.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await flagNeedsEmail(accountId, text);
              if (res.ok) setSent(true);
              else setError(res.error);
            })
          }
          className="rounded-md bg-[#14201B] px-2.5 py-1 text-[11.5px] font-medium text-[#F7F6F1] disabled:opacity-30"
        >
          {pending ? "Sending…" : "Flag to Outbound"}
        </button>
      </div>
    </div>
  );
}

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
    <li className={`rounded-md border p-2.5 ${active ? "border-[#14201B]" : "border-[#E2DFD5]"} ${done ? "opacity-60" : ""} ${skipped ? "opacity-40" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[13.5px] font-medium text-[#14201B]">{item.displayName}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.08em] text-[#8A928C]">
            <span>{item.kind}</span>
            {item.status !== "pending" && <span>· {item.status}</span>}
          </div>
          {item.notes && <div className="mt-1 text-[12.5px] text-[#5B6560]">{item.notes}</div>}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {item.displayPhone && (
            <a
              href={`tel:${item.displayPhone.replace(/[^0-9+]/g, "")}`}
              className="flex items-center gap-1 rounded-md bg-[#8A2E2E] px-2.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
              title={`Call ${item.displayPhone}`}
            >
              <Ico name="phone" size={12} />
              Call
            </a>
          )}
          {!done && !skipped && (
            <>
              <button
                onClick={() => onStatus("done")}
                title="Mark done"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E2DFD5] text-[#5B6560] hover:bg-[#F7F6F1]"
              >
                <Ico name="check" size={13} />
              </button>
              <button
                onClick={() => onStatus("skipped")}
                title="Skip"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E2DFD5] text-[#8A928C] hover:bg-[#F7F6F1]"
              >
                <Ico name="close" size={13} />
              </button>
            </>
          )}
        </div>
      </div>
      {item.account_id && !done && <div className="mt-1.5">
        <NeedsEmailFlag accountId={item.account_id} />
      </div>}
    </li>
  );
}

export function SdrScreen({ initialItems, todayIso, days }: { initialItems: SdrDayItem[]; todayIso: string; days: number }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [active, setActive] = useState<SdrDayItem | null>(null);

  const dayIsos = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < days; i++) out.push(addDaysIso(todayIso, i));
    return out;
  }, [todayIso, days]);

  function refresh() {
    router.refresh();
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
      <div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {dayIsos.map((iso) => {
          const dayItems = items
            .filter((it) => it.scheduled_date === iso)
            // Pending first, so a fresh Today never buries an open call under
            // yesterday's already-done rows carried in the same fetch window.
            .sort((a, b) => (a.status === b.status ? 0 : a.status === "pending" ? -1 : 1));
          return (
            <div key={iso} className="rounded-lg border border-[#E2DFD5] bg-white p-3">
              <div className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-[#5B6560]">
                {dayLabel(iso, todayIso)}
              </div>
              <ul className="flex flex-col gap-2">
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
                <AddToDayForm date={iso} onAdded={refresh} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="w-full lg:sticky lg:top-7 lg:w-[360px] lg:shrink-0">
        <div className="mb-2 text-[12px] uppercase tracking-[0.1em] text-[#8A928C]">
          {active ? `Logging: ${active.displayName}` : "Pick a call or visit to log it"}
        </div>
        <TouchpointCapture accountIdHint={active?.account_id ?? null} onFiled={onFiled} />
      </div>
    </div>
  );
}
