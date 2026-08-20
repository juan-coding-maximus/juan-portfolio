"use client";

/**
 * Expensos, from the browser. Three cards: clock in/out with a break in
 * minutes, a photo dropzone that auto-sorts what it's handed (odometer vs
 * receipt vs bank-statement screenshot), and a link to the pay period's
 * live sheet for review. Every filing writes straight to the same Drive/
 * Sheets tree the CLI's `expensos` skill does; see lib/expenses.ts.
 *
 * AUTO-SORT IS A SUGGESTION, NEVER A SUBMIT. The classify call proposes a
 * photo_type and, where legible, a reading; both land in editable fields
 * the rep confirms before "File it" does anything. Nothing here writes to
 * Drive on a photo's arrival alone.
 */

import { useEffect, useRef, useState } from "react";
import { Card, Ico, SuccessNote } from "../lib/ui";

type Summary = { period: string; label: string; sheetLink: string } | null;

type PhotoType = "odometer" | "receipt" | "statement" | "unsure";

type PhotoCard = {
  id: string;
  file: File;
  previewUrl: string;
  status: "classifying" | "ready" | "filing" | "filed" | "error" | "paired";
  type: PhotoType;
  message?: string;
  // receipt fields
  merchant: string;
  purpose: string;
  amount: string;
  companyCard: boolean;
  date: string;
  // odometer fields
  moment: "start" | "end" | "";
  odo: string;
};

function todayPT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const inputCls =
  "w-full rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-2.5 py-1.5 text-[13px] text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none";
const labelCls = "mb-1 block text-[11px] uppercase tracking-[0.1em] text-[#8A928C]";
const primaryBtn =
  "rounded-md bg-[#14201B] px-3.5 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40";
const ghostBtn =
  "rounded-md border border-[#E2DFD5] px-3 py-1.5 text-[12.5px] text-[#5B6560] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40";

export function ExpensesClient() {
  const [summary, setSummary] = useState<Summary>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/nutribiotic/api/expenses/summary")
      .then((r) => r.json())
      .then((j) => (j.ok ? setSummary({ period: j.period, label: j.label, sheetLink: j.sheetLink }) : setSummaryError(j.error)))
      .catch(() => setSummaryError("Could not reach the expenses API."));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <ReviewCard summary={summary} error={summaryError} />
      <HoursCard />
      <PhotosCard />
    </div>
  );
}

function ReviewCard({ summary, error }: { summary: Summary; error: string | null }) {
  return (
    <Card className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Current pay period</div>
        <div className="mt-1 font-[family-name:var(--font-fraunces)] text-[17px] font-semibold tracking-tight">
          {summary?.label ?? (error ? "Unavailable" : "Loading...")}
        </div>
        {error && <div className="mt-1 text-[12px] text-[#8A2E2E]">{error}</div>}
      </div>
      {summary && (
        <a href={summary.sheetLink} target="_blank" rel="noopener noreferrer" className={`${primaryBtn} flex shrink-0 items-center gap-1.5`}>
          <Ico name="external" size={13} />
          Open the sheet
        </a>
      )}
    </Card>
  );
}

/* 0 to 3h. Past three hours it is not a break, it is a split shift, and that
   is a conversation with payroll rather than a longer dropdown. */
const BREAK_CHOICES = [0, 30, 60, 90, 120, 150, 180];

/** 0 -> "None", 30 -> "30 min", 90 -> "1h 30m". Hours FLOOR before the
 *  remainder: dividing by 60 straight through rendered 90 as "1.5h 30m". */
function breakLabel(m: number): string {
  if (m === 0) return "None";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/* Half-hour grid, same increment as the Break dropdown, so Clock in/out
   stops handing the browser's native time picker, which lists every single
   minute regardless of `step`, a 30-min-only field cannot actually be off.
   Juan's field day starts 5am-2pm and ends 2pm-2am (2026-08-19), so the two
   fields get their own windows rather than one 00:00-23:30 list for both;
   an out time before 2pm or an in time before 5am was never a real reading. */
function halfHourRange(startMin: number, endMin: number): string[] {
  const out: string[] = [];
  for (let m = startMin; m <= endMin; m += 30) {
    const hh = Math.floor((m % 1440) / 60);
    const mm = m % 60 === 0 ? "00" : "30";
    out.push(`${String(hh).padStart(2, "0")}:${mm}`);
  }
  return out;
}
const CLOCK_IN_CHOICES: string[] = halfHourRange(5 * 60, 14 * 60);
// Wraps past midnight: 14:00 through 23:30, then 00:00 through 02:00.
const CLOCK_OUT_CHOICES: string[] = halfHourRange(14 * 60, 26 * 60);

/** "14:30" -> "2:30 PM". */
function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function HoursCard() {
  const [date, setDate] = useState(todayPT());
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [breakMin, setBreakMin] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);

  /* Half-hour grid, Juan 2026-08-14. A field day is remembered as "started
     around nine, knocked off around five", never as 5:23, so a minute-level
     picker was asking for a precision he does not have and cannot check. The
     spinner and this button now agree on the same grid, because a "now" that
     lands off-grid makes the picker look broken the next time it is opened.

     ROUNDS TO NEAREST, NOT DOWN: 5:25pm becomes 5:30pm. Rounding down would
     shade every entry toward under-reporting his own hours. */
  function markNow(which: "in" | "out") {
    const now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Los_Angeles" });
    const [h, m] = now.split(":").map(Number);
    let mins = Math.round((h * 60 + m) / 30) * 30;
    // 23:45+ rounds to 24:00, which is not a time. Hold at 23:30 rather than
    // wrapping to 00:00 and filing the shift against the wrong day.
    mins = Math.min(mins, 23 * 60 + 30);
    if (which === "in") {
      // Clamp into the 5am-2pm window; "now" outside it is not a real read.
      mins = Math.min(Math.max(mins, 5 * 60), 14 * 60);
      setClockIn(`${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`);
    } else {
      // Clock-out window is 2pm through 2am, so a time before 2pm is either
      // the early-morning wrap (00:00-02:00, already in range) or genuinely
      // too early, clamp forward to 2pm rather than snapping back to 2am.
      if (mins >= 2 * 60 && mins < 14 * 60) mins = 14 * 60;
      setClockOut(`${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`);
    }
  }

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/nutribiotic/api/expenses/hours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, clock_in: clockIn, clock_out: clockOut, break_min: Number(breakMin || 0), notes }),
      });
      const j = await res.json();
      if (!j.ok) {
        setMessage({ kind: "error", text: j.error });
        return;
      }
      if (j.result.status === "duplicate") {
        setMessage({ kind: "warn", text: j.result.why });
        return;
      }
      const flags: string[] = [];
      if (j.result.boundaryWeek) flags.push("this week crosses a pay period boundary, worth a by-hand overtime check");
      if (j.result.sevenDayWeek) flags.push("7th day worked this week, the consecutive-day premium isn't computed here");
      setMessage({
        kind: flags.length ? "warn" : "ok",
        text: `Filed ${j.result.hoursWorked}h for ${date}.${flags.length ? " " + flags.join("; ") + "." : ""}`,
      });
      setClockIn("");
      setClockOut("");
      setBreakMin("0");
      setNotes("");
      // Confirmation stands until the next filing starts or clears itself,
      // by which point the form below is already back to a blank start.
      if (!flags.length) setTimeout(() => setMessage((m) => (m?.text.startsWith("Filed") ? null : m)), 4000);
    } catch {
      setMessage({ kind: "error", text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
        <Ico name="clock" size={13} />
        Hours
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div>
          <label className={labelCls}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onBlur={(e) => { if (!e.target.value) setDate(todayPT()); }}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Clock in</label>
          <div className="flex gap-1.5">
            <select value={clockIn} onChange={(e) => setClockIn(e.target.value)} className={inputCls}>
              <option value="" disabled>
                Select
              </option>
              {CLOCK_IN_CHOICES.map((t) => (
                <option key={t} value={t}>
                  {timeLabel(t)}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => markNow("in")} className={`${ghostBtn} shrink-0 px-2`} title="Now">
              now
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Clock out</label>
          <div className="flex gap-1.5">
            <select value={clockOut} onChange={(e) => setClockOut(e.target.value)} className={inputCls}>
              <option value="" disabled>
                Select
              </option>
              {CLOCK_OUT_CHOICES.map((t) => (
                <option key={t} value={t}>
                  {timeLabel(t)}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => markNow("out")} className={`${ghostBtn} shrink-0 px-2`} title="Now">
              now
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Break (min)</label>
          <select value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className={inputCls}>
            {BREAK_CHOICES.map((m) => (
              <option key={m} value={String(m)}>
                {breakLabel(m)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3">
        <label className={labelCls}>Notes</label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Field day, SoCal loop" className={inputCls} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {message && message.kind !== "ok" ? (
          <p className={`text-[12.5px] leading-snug ${message.kind === "error" ? "text-[#8A2E2E]" : "text-[#8A6D2F]"}`}>
            {message.text}
          </p>
        ) : !message ? (
          <p className="text-[11.5px] leading-snug text-[#8A928C]">If no break was taken, leave it on None. That's a fact, not an assumption.</p>
        ) : (
          <span />
        )}
        <button type="button" onClick={submit} disabled={busy || !clockIn || !clockOut} className={`${primaryBtn} shrink-0`}>
          {busy ? "Filing..." : "File hours"}
        </button>
      </div>
      {message?.kind === "ok" && (
        <div className="mt-3">
          <SuccessNote title="Hours filed" detail={message.text} />
        </div>
      )}
    </Card>
  );
}

function PhotosCard() {
  const [cards, setCards] = useState<PhotoCard[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fresh: PhotoCard[] = Array.from(files).map((file) => ({
      id: newId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "classifying",
      type: "unsure",
      merchant: "",
      purpose: "",
      amount: "",
      companyCard: false,
      date: todayPT(),
      moment: "",
      odo: "",
    }));
    setCards((prev) => [...fresh, ...prev]);
    fresh.forEach(classify);
  }

  async function classify(card: PhotoCard) {
    try {
      const form = new FormData();
      form.append("photo", card.file);
      const res = await fetch("/nutribiotic/api/expenses/classify", { method: "POST", body: form });
      const j = await res.json();
      if (!j.ok) {
        update(card.id, { status: "error", message: j.error });
        return;
      }
      const s = j.suggestion;
      update(card.id, {
        status: "ready",
        type: s.photo_type,
        merchant: s.merchant ?? "",
        amount: s.amount ?? "",
        date: s.date ?? todayPT(),
        odo: s.odometer_reading ?? "",
        moment: s.odometer_moment ?? "",
        message: s.confidence === "low" ? "Low confidence, check every field." : undefined,
      });
    } catch {
      update(card.id, { status: "error", message: "Could not classify. Pick a type by hand." });
    }
  }

  function update(id: string, patch: Partial<PhotoCard>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function remove(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  async function fileReceipt(card: PhotoCard) {
    update(card.id, { status: "filing" });
    const form = new FormData();
    form.append("photo", card.file);
    form.append("date", card.date);
    form.append("merchant", card.merchant);
    form.append("purpose", card.purpose);
    form.append("amount", card.amount);
    form.append("companyCard", String(card.companyCard));
    try {
      const res = await fetch("/nutribiotic/api/expenses/receipt", { method: "POST", body: form });
      const j = await res.json();
      if (!j.ok) {
        update(card.id, { status: "ready", message: j.error });
        return;
      }
      update(card.id, { status: "filed" });
      // Confirmation shows as the "Filed" pill below; once Juan has had a
      // beat to see it, the card clears itself so the dropzone is a new
      // start rather than a growing pile of filed receipts.
      setTimeout(() => remove(card.id), 2200);
    } catch {
      update(card.id, { status: "ready", message: "Network error." });
    }
  }

  async function fileTripPair(start: PhotoCard, end: PhotoCard, purpose: string) {
    update(start.id, { status: "filing" });
    update(end.id, { status: "filing" });
    const form = new FormData();
    form.append("start_photo", start.file);
    form.append("end_photo", end.file);
    form.append("date", start.date);
    form.append("end_date", end.date);
    form.append("start_odo", start.odo);
    form.append("end_odo", end.odo);
    form.append("purpose", purpose);
    try {
      const res = await fetch("/nutribiotic/api/expenses/trip", { method: "POST", body: form });
      const j = await res.json();
      if (!j.ok) {
        update(start.id, { status: "ready", message: j.error });
        update(end.id, { status: "ready", message: j.error });
        return;
      }
      update(start.id, { status: "filed" });
      update(end.id, { status: "filed" });
      setTimeout(() => {
        remove(start.id);
        remove(end.id);
      }, 2200);
    } catch {
      update(start.id, { status: "ready", message: "Network error." });
      update(end.id, { status: "ready", message: "Network error." });
    }
  }

  const odometerCards = cards.filter((c) => c.type === "odometer" && (c.status === "ready" || c.status === "filing"));
  const startCard = odometerCards.find((c) => c.moment === "start") ?? null;
  const endCard = odometerCards.find((c) => c.moment === "end" && c.id !== startCard?.id) ?? null;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
          <Ico name="camera" size={13} />
          Bills and odometer photos
        </div>
        <button type="button" onClick={() => inputRef.current?.click()} className={primaryBtn}>
          Add a photo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {cards.length === 0 && (
        <p className="text-[12.5px] leading-relaxed text-[#8A928C]">
          Drop in a receipt or an odometer photo and it sorts itself. You confirm the reading before anything files.
        </p>
      )}

      {startCard && endCard && (
        <TripPairCard start={startCard} end={endCard} onFile={fileTripPair} onEdit={update} onRemove={remove} />
      )}

      <div className="mt-3 flex flex-col gap-3">
        {cards.map((c) => {
          const inPair = (c.id === startCard?.id || c.id === endCard?.id) && startCard && endCard;
          if (inPair) return null;
          return (
            <PhotoCardView key={c.id} card={c} onEdit={update} onRemove={remove} onFileReceipt={fileReceipt} />
          );
        })}
      </div>
    </Card>
  );
}

function statusPill(status: PhotoCard["status"]) {
  const map: Record<PhotoCard["status"], { text: string; cls: string }> = {
    classifying: { text: "Sorting...", cls: "text-[#8A928C]" },
    ready: { text: "Ready to review", cls: "text-[#5B6560]" },
    paired: { text: "Paired", cls: "text-[#5B6560]" },
    filing: { text: "Filing...", cls: "text-[#8A6D2F]" },
    filed: { text: "Filed", cls: "text-[#2C6A46]" },
    error: { text: "Couldn't sort", cls: "text-[#8A2E2E]" },
  };
  return map[status];
}

function PhotoCardView({
  card, onEdit, onRemove, onFileReceipt,
}: {
  card: PhotoCard;
  onEdit: (id: string, patch: Partial<PhotoCard>) => void;
  onRemove: (id: string) => void;
  onFileReceipt: (card: PhotoCard) => void;
}) {
  const pill = statusPill(card.status);
  const filed = card.status === "filed";
  const busy = card.status === "filing" || card.status === "classifying";

  return (
    <div className="flex gap-3 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={card.previewUrl} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <select
              value={card.type}
              disabled={filed || busy}
              onChange={(e) => onEdit(card.id, { type: e.target.value as PhotoType })}
              className="rounded border border-[#E2DFD5] bg-white px-1.5 py-1 text-[12px] font-medium text-[#14201B] disabled:opacity-60"
            >
              <option value="receipt">Receipt</option>
              <option value="odometer">Odometer</option>
              <option value="statement">Statement (use the CLI)</option>
              <option value="unsure">Not sure</option>
            </select>
            {!filed && <span className={`text-[11.5px] ${pill.cls}`}>{pill.text}</span>}
          </div>
          {!filed && (
            <button type="button" onClick={() => onRemove(card.id)} className="text-[#8A928C] hover:text-[#8A2E2E]">
              <Ico name="close" size={13} />
            </button>
          )}
        </div>

        {card.message && <p className="mt-1 text-[11.5px] text-[#8A6D2F]">{card.message}</p>}

        {card.type === "receipt" && (filed ? (
          <div className="mt-2">
            <SuccessNote
              title="Filed"
              detail={`${card.merchant || "Receipt"}${card.amount ? `, $${card.amount}` : ""}${card.purpose ? `, ${card.purpose}` : ""}`}
            />
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input placeholder="Merchant" value={card.merchant} onChange={(e) => onEdit(card.id, { merchant: e.target.value })} className={inputCls} />
            <input placeholder="Amount" value={card.amount} onChange={(e) => onEdit(card.id, { amount: e.target.value })} className={inputCls} />
            <input placeholder="Purpose (e.g. Lunch, burger)" value={card.purpose} onChange={(e) => onEdit(card.id, { purpose: e.target.value })} className={`${inputCls} col-span-2`} />
            <label className="col-span-2 flex items-center gap-1.5 text-[12.5px] text-[#5B6560]">
              <input
                type="checkbox"
                checked={card.companyCard}
                onChange={(e) => onEdit(card.id, { companyCard: e.target.checked })}
              />
              Company card, no reimbursement owed
            </label>
            <input
              type="date"
              value={card.date}
              onChange={(e) => onEdit(card.id, { date: e.target.value })}
              onBlur={(e) => { if (!e.target.value) onEdit(card.id, { date: todayPT() }); }}
              className={inputCls}
            />
            <button
              type="button"
              disabled={busy || !card.amount}
              onClick={() => onFileReceipt(card)}
              className={`${primaryBtn} justify-self-end`}
            >
              File it
            </button>
          </div>
        ))}

        {card.type === "odometer" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={card.moment}
              disabled={filed}
              onChange={(e) => onEdit(card.id, { moment: e.target.value as "start" | "end" | "" })}
              className={inputCls}
            >
              <option value="">Start or end?</option>
              <option value="start">Start of drive</option>
              <option value="end">End of drive</option>
            </select>
            <input placeholder="Odometer reading" value={card.odo} disabled={filed} onChange={(e) => onEdit(card.id, { odo: e.target.value })} className={inputCls} />
            <input
              type="date"
              value={card.date}
              disabled={filed}
              onChange={(e) => onEdit(card.id, { date: e.target.value })}
              onBlur={(e) => { if (!e.target.value) onEdit(card.id, { date: todayPT() }); }}
              className={`${inputCls} col-span-2`}
            />
            <p className="col-span-2 text-[11.5px] leading-snug text-[#8A928C]">
              Add the matching {card.moment === "end" ? "start" : "end"} photo and a Trip card appears below to file both together.
            </p>
          </div>
        )}

        {card.type === "statement" && (
          <p className="mt-2 text-[11.5px] leading-snug text-[#8A928C]">
            A bank-statement screenshot has several rows to read off it, best done from the CLI: say &quot;expensos&quot; in a Claude Code session with this photo.
          </p>
        )}

        {card.type === "unsure" && (
          <p className="mt-2 text-[11.5px] leading-snug text-[#8A928C]">Pick a type above to file it.</p>
        )}
      </div>
    </div>
  );
}

function TripPairCard({
  start, end, onFile, onEdit, onRemove,
}: {
  start: PhotoCard;
  end: PhotoCard;
  onFile: (start: PhotoCard, end: PhotoCard, purpose: string) => void;
  onEdit: (id: string, patch: Partial<PhotoCard>) => void;
  onRemove: (id: string) => void;
}) {
  const [purpose, setPurpose] = useState("Client visits");
  const filed = start.status === "filed" && end.status === "filed";
  const busy = start.status === "filing" || end.status === "filing";

  return (
    <div className="mb-3 rounded-md border border-[#B9C4BC] bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
        <Ico name="gauge" size={13} />
        Trip, start to end
      </div>
      <div className="flex gap-3">
        {[start, end].map((c) => (
          <div key={c.id} className="flex flex-1 items-center gap-2 rounded border border-[#E2DFD5] bg-[#FAF9F5] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#8A928C]">{c.moment === "start" ? "Start" : "End"}</div>
              <input value={c.odo} disabled={filed} onChange={(e) => onEdit(c.id, { odo: e.target.value })} className={`${inputCls} mt-0.5`} placeholder="Odometer" />
            </div>
            {!filed && (
              <button type="button" onClick={() => onRemove(c.id)} className="text-[#8A928C] hover:text-[#8A2E2E]">
                <Ico name="close" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {filed ? (
        <div className="mt-2">
          <SuccessNote title="Trip filed" detail={`${start.odo} to ${end.odo}${purpose ? `, ${purpose}` : ""}`} />
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Purpose, e.g. Santa Monica cluster, 6 accounts"
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            disabled={busy || !start.odo || !end.odo || !purpose}
            onClick={() => onFile(start, end, purpose)}
            className={`${primaryBtn} shrink-0`}
          >
            {busy ? "Filing..." : "File trip"}
          </button>
        </div>
      )}
    </div>
  );
}
