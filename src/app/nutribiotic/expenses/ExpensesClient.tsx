"use client";

/**
 * Expensos, from the browser. Two cards: a photo dropzone that auto-sorts
 * what it's handed (odometer vs receipt vs bank-statement screenshot), and a
 * link to the pay period's live sheet for review. Every
 * filing writes straight to the same Drive/Sheets tree the CLI's `expensos`
 * skill does; see lib/expenses.ts.
 *
 * AUTO-SORT IS A SUGGESTION, NEVER A SILENT SUBMIT. The classify call
 * proposes a photo_type and, where legible, a reading, a merchant, even a
 * purpose for the obvious cases (a meal, a parking stub); every one of those
 * lands in an editable field. What changed 2026-08-31: the rep no longer has
 * to say which odometer photo was the start (the lower reading always is),
 * no longer has to pick a date per photo (one date for the whole batch,
 * guessed from the evidence and overridable), and no longer has to click
 * "File it" once per photo, one "File all" sends everything that's ready.
 * Nothing here writes to Drive on a photo's arrival alone; File is always a
 * deliberate click.
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
  // the date actually printed on a receipt, when legible; feeds the one
  // shared filing date below, it is never shown or edited on the card itself
  ocrDate?: string;
  // odometer fields
  odo: string;
};

function todayPT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

/** A file's own last-modified stamp, read in Pacific local time. This is
 *  when the photo reached the phone/Mac, not necessarily the shutter time,
 *  but it is what a browser can see without an EXIF library, and it is only
 *  used to guess which CALENDAR DAY a batch belongs to, never a time. */
function fileDatePT(file: File): string {
  return new Date(file.lastModified).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const inputCls =
  "w-full rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-2.5 py-1.5 text-[13px] text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none";
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

// ---------------------------------------------------------------------------
// photos: one drop zone, it sorts, pairs, dates, and files
// ---------------------------------------------------------------------------

function PhotosCard() {
  const [cards, setCards] = useState<PhotoCard[]>([]);
  // null = follow the auto-detected date; a string = Juan overrode the picker
  // and nothing here fights him until he hits "auto" again.
  const [manualDate, setManualDate] = useState<string | null>(null);
  const [tripPurpose, setTripPurpose] = useState("Client visits");
  const [dragOver, setDragOver] = useState(false);
  const [filingAll, setFilingAll] = useState(false);
  const [batchMessage, setBatchMessage] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
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
      odo: "",
    }));
    setCards((prev) => [...fresh, ...prev]);
    setBatchMessage(null);
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
      // Juan's fixed vocabulary, never an invented reason: a meal is always
      // "Lunch, <what it was>" and parking is always "Parking[, city]". Any
      // other category is left blank rather than guessed.
      let purpose = "";
      if (s.category === "meals" && s.item_summary) purpose = `Lunch, ${s.item_summary}`;
      else if (s.category === "parking") purpose = s.city ? `Parking, ${s.city}` : "Parking";
      update(card.id, {
        status: "ready",
        type: s.photo_type,
        merchant: s.merchant ?? "",
        amount: s.amount ?? "",
        ocrDate: s.date ?? undefined,
        odo: s.odometer_reading ?? "",
        purpose,
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

  // ONE date for the whole batch, never per photo: a receipt's printed date
  // wins if there is one, otherwise the file time on whichever odometer
  // photo read the LOWER number (the morning of the drive), otherwise
  // today. Purely derived from the current cards, so it stays live as
  // photos classify, with no effect/setState round trip.
  function detectDate(): string {
    const dated = cards.find((c) => c.type === "receipt" && c.ocrDate);
    if (dated?.ocrDate) return dated.ocrDate;
    const odo = cards.filter((c) => c.type === "odometer" && c.odo && !Number.isNaN(Number(c.odo)));
    if (odo.length > 0) {
      const lowest = odo.reduce((a, b) => (Number(a.odo) <= Number(b.odo) ? a : b));
      return fileDatePT(lowest.file);
    }
    return todayPT();
  }
  const dateOverridden = manualDate !== null;
  const batchDate = manualDate ?? detectDate();

  async function fileReceipt(card: PhotoCard): Promise<boolean> {
    update(card.id, { status: "filing" });
    const form = new FormData();
    form.append("photo", card.file);
    form.append("date", batchDate);
    form.append("merchant", card.merchant);
    form.append("purpose", card.purpose);
    form.append("amount", card.amount);
    form.append("companyCard", String(card.companyCard));
    try {
      const res = await fetch("/nutribiotic/api/expenses/receipt", { method: "POST", body: form });
      const j = await res.json();
      if (!j.ok) {
        update(card.id, { status: "ready", message: j.error });
        return false;
      }
      update(card.id, { status: "filed" });
      // Confirmation shows as the "Filed" pill below; once Juan has had a
      // beat to see it, the card clears itself so the dropzone is a new
      // start rather than a growing pile of filed receipts.
      setTimeout(() => remove(card.id), 2200);
      return true;
    } catch {
      update(card.id, { status: "ready", message: "Network error." });
      return false;
    }
  }

  async function fileTripPair(start: PhotoCard, end: PhotoCard, purpose: string): Promise<boolean> {
    update(start.id, { status: "filing" });
    update(end.id, { status: "filing" });
    const form = new FormData();
    form.append("start_photo", start.file);
    form.append("end_photo", end.file);
    form.append("date", batchDate);
    form.append("end_date", batchDate);
    form.append("start_odo", start.odo);
    form.append("end_odo", end.odo);
    form.append("purpose", purpose);
    try {
      const res = await fetch("/nutribiotic/api/expenses/trip", { method: "POST", body: form });
      const j = await res.json();
      if (!j.ok) {
        update(start.id, { status: "ready", message: j.error });
        update(end.id, { status: "ready", message: j.error });
        return false;
      }
      update(start.id, { status: "filed" });
      update(end.id, { status: "filed" });
      setTimeout(() => {
        remove(start.id);
        remove(end.id);
      }, 2200);
      return true;
    } catch {
      update(start.id, { status: "ready", message: "Network error." });
      update(end.id, { status: "ready", message: "Network error." });
      return false;
    }
  }

  // Pair the two odometer photos by READING, never by which screen they
  // show: the lower number is always the start of the drive, the higher is
  // always the end. Juan's own rule (2026-08-31): "that's obviously the
  // lesser number."
  const odometerReady = cards.filter(
    (c) => c.type === "odometer" && (c.status === "ready" || c.status === "filing") && c.odo && !Number.isNaN(Number(c.odo)),
  );
  const startCard = odometerReady.length >= 2 ? odometerReady.reduce((a, b) => (Number(a.odo) <= Number(b.odo) ? a : b)) : null;
  const endCard = odometerReady.length >= 2 ? odometerReady.reduce((a, b) => (Number(a.odo) >= Number(b.odo) ? a : b)) : null;

  const receiptsReady = cards.filter((c) => c.type === "receipt" && c.status === "ready" && c.amount);
  const tripReady = !!(startCard && endCard && startCard.status === "ready" && endCard.status === "ready");
  const canFileAll = tripReady || receiptsReady.length > 0;

  async function fileAll() {
    setFilingAll(true);
    setBatchMessage(null);
    let filed = 0;
    let skipped = 0;
    if (tripReady && startCard && endCard) {
      const ok = await fileTripPair(startCard, endCard, tripPurpose || "Client visits");
      if (ok) filed += 1; else skipped += 1;
    }
    // One photo upload at a time, deliberately sequential.
    for (const c of receiptsReady) {
      const ok = await fileReceipt(c);
      if (ok) filed += 1; else skipped += 1;
    }
    setFilingAll(false);
    setBatchMessage(
      skipped
        ? { kind: "warn", text: `Filed ${filed}, ${skipped} needs a look, see the message on its card.` }
        : { kind: "ok", text: `Filed ${filed} for ${batchDate}.` },
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
          <Ico name="camera" size={13} />
          Mileage and receipts
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={batchDate}
            onChange={(e) => setManualDate(e.target.value || todayPT())}
            className={`${inputCls} w-[152px]`}
            title="Filing date for everything below"
          />
          {dateOverridden && (
            <button type="button" onClick={() => setManualDate(null)} className={ghostBtn} title="Go back to the auto-detected date">
              auto
            </button>
          )}
        </div>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragOver ? "border-[#14201B] bg-[#F1F0E8]" : "border-[#D9D5C7] bg-[#FAF9F5] hover:border-[#B9C4BC]"
        }`}
      >
        <Ico name="camera" size={22} />
        <div className="text-[14px] font-medium text-[#14201B]">Drop mileage and receipt photos here</div>
        <div className="text-[12px] text-[#8A928C]">Or tap to choose. It sorts, pairs, and dates them; you confirm and file.</div>
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

      {startCard && endCard && (
        <div className="mt-3">
          <TripPairCard
            start={startCard}
            end={endCard}
            purpose={tripPurpose}
            onPurposeChange={setTripPurpose}
            onFile={() => fileTripPair(startCard, endCard, tripPurpose || "Client visits")}
            onEdit={update}
            onRemove={remove}
          />
        </div>
      )}

      {cards.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {cards.map((c) => {
            const inPair = (c.id === startCard?.id || c.id === endCard?.id) && startCard && endCard;
            if (inPair) return null;
            return <PhotoCardView key={c.id} card={c} onEdit={update} onRemove={remove} onFileReceipt={fileReceipt} />;
          })}
        </div>
      )}

      {cards.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#E2DFD5] pt-3">
          {batchMessage ? (
            <p className={`text-[12.5px] leading-snug ${batchMessage.kind === "warn" ? "text-[#8A6D2F]" : "text-[#2C6A46]"}`}>{batchMessage.text}</p>
          ) : (
            <p className="text-[11.5px] leading-snug text-[#8A928C]">Filing to {batchDate}. Fix anything that looks off, then file it all at once.</p>
          )}
          <button type="button" disabled={!canFileAll || filingAll} onClick={fileAll} className={`${primaryBtn} shrink-0`}>
            {filingAll ? "Filing..." : "File all"}
          </button>
        </div>
      )}
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
          <div className="mt-2 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Merchant" value={card.merchant} onChange={(e) => onEdit(card.id, { merchant: e.target.value })} className={inputCls} />
              <input placeholder="Amount" value={card.amount} onChange={(e) => onEdit(card.id, { amount: e.target.value })} className={inputCls} />
            </div>
            <input placeholder="Purpose (e.g. Lunch, burger)" value={card.purpose} onChange={(e) => onEdit(card.id, { purpose: e.target.value })} className={inputCls} />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-[12.5px] text-[#5B6560]">
                <input
                  type="checkbox"
                  checked={card.companyCard}
                  onChange={(e) => onEdit(card.id, { companyCard: e.target.checked })}
                />
                Company card, no reimbursement owed
              </label>
              <button
                type="button"
                disabled={busy || !card.amount}
                onClick={() => onFileReceipt(card)}
                className={primaryBtn}
              >
                File it
              </button>
            </div>
          </div>
        ))}

        {card.type === "odometer" && (
          <div className="mt-2">
            <input
              placeholder="Odometer reading"
              value={card.odo}
              disabled={filed}
              onChange={(e) => onEdit(card.id, { odo: e.target.value })}
              className={inputCls}
            />
            {!filed && (
              <p className="mt-1.5 text-[11.5px] leading-snug text-[#8A928C]">
                Add the matching odometer photo and a Trip card appears above. Start and end sort themselves, lower number first.
              </p>
            )}
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
  start, end, purpose, onPurposeChange, onFile, onEdit, onRemove,
}: {
  start: PhotoCard;
  end: PhotoCard;
  purpose: string;
  onPurposeChange: (v: string) => void;
  onFile: () => void;
  onEdit: (id: string, patch: Partial<PhotoCard>) => void;
  onRemove: (id: string) => void;
}) {
  const filed = start.status === "filed" && end.status === "filed";
  const busy = start.status === "filing" || end.status === "filing";

  return (
    <div className="mb-3 rounded-md border border-[#B9C4BC] bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
        <Ico name="gauge" size={13} />
        Trip, start to end
      </div>
      <div className="flex gap-3">
        {[{ c: start, label: "Start" }, { c: end, label: "End" }].map(({ c, label }) => (
          <div key={c.id} className="flex flex-1 items-center gap-2 rounded border border-[#E2DFD5] bg-[#FAF9F5] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#8A928C]">{label}</div>
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
            onChange={(e) => onPurposeChange(e.target.value)}
            placeholder="Purpose, e.g. Santa Monica cluster, 6 accounts"
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            disabled={busy || !start.odo || !end.odo || !purpose}
            onClick={onFile}
            className={`${primaryBtn} shrink-0`}
          >
            {busy ? "Filing..." : "File trip"}
          </button>
        </div>
      )}
    </div>
  );
}
