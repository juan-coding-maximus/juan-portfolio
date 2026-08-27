"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReportDraft, ReportHqNote } from "./dal";
import { actionDecideReport, actionRequestRebuild, actionSaveReportEdits } from "./report-actions";
import { Ico, SuccessNote } from "./ui";

const HQ_CATEGORIES = [
  "FORMULATION & PRODUCT",
  "DISCOUNTS & PRICING",
  "ENTERPRISE & HQ ACCESS",
  "COMPETITIVE INTEL",
  "OTHER",
];

type StopEdit = { hidden: boolean; call_only: boolean; message_only: boolean };

/**
 * Tonight's report, before it goes out.
 *
 * Juan, 2026-08-27: "I want to be able to edit the current report before it
 * goes to my inbox to make sure that all the details are right and that the
 * map looks right... just so I don't have to edit after the fact." And, on the
 * timing: "not necessarily a 7pm daily thing, just like after the day is done
 * and before the 10pm cron."
 *
 * THE PREVIEW IS THE ARTIFACT. The button opens the actual PDF the Mac
 * rendered from this payload, map included, not a second rendering of the same
 * data in the browser. Two renderings would eventually disagree, and the one
 * he checked would not be the one that got mailed. The cost is that after an
 * edit the PDF is briefly behind the payload, which the screen says outright
 * rather than showing a stale map as though it were final.
 *
 * WHAT IS EDITABLE is only what the OS owns: the HQ notes, each stop's
 * classification, and the mileage. Every other line on the report is a HubSpot
 * record and is corrected in HubSpot. Nothing on this screen writes to the CRM.
 */
export function ReportReview({ draft, previewUrl }: { draft: ReportDraft; previewUrl: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);

  const payload = draft.payload;
  const stops = payload?.stops ?? [];

  const [hqNotes, setHqNotes] = useState<ReportHqNote[]>(payload?.hq_notes ?? []);
  const [miles, setMiles] = useState<string>(
    payload?.miles_override != null ? String(payload.miles_override) : "",
  );
  const [stopEdits, setStopEdits] = useState<Record<string, StopEdit>>(() =>
    Object.fromEntries(
      stops.map((s) => [
        String(s.n),
        {
          hidden: Boolean(s.hidden),
          call_only: Boolean(s.is_call_only),
          message_only: Boolean(s.is_message_only),
        },
      ]),
    ),
  );

  const sent = draft.status === "sent";
  const locked = sent || pending;

  function save(then?: () => void) {
    startTransition(async () => {
      await actionSaveReportEdits(draft.report_date, {
        hqNotes,
        miles: miles.trim() === "" ? null : Number(miles),
        stops: stopEdits,
      });
      setSaved("Saved. The preview is re-rendering.");
      then?.();
      router.refresh();
    });
  }

  function decide(decision: "approved" | "held" | "pending") {
    startTransition(async () => {
      // Save first, always: approving something he edited but did not save
      // would mail the version he was looking away from.
      await actionSaveReportEdits(draft.report_date, {
        hqNotes,
        miles: miles.trim() === "" ? null : Number(miles),
        stops: stopEdits,
      });
      await actionDecideReport(draft.report_date, decision);
      setSaved(
        decision === "approved"
          ? "Approved. It goes out on the next pass, within a few minutes."
          : decision === "held"
            ? "Held. Nothing goes out tonight unless you release it."
            : "Back to pending.",
      );
      router.refresh();
    });
  }

  const statusLine = sent
    ? `Sent ${draft.sent_at ? new Date(draft.sent_at).toLocaleString("en-US") : ""}`
    : draft.status === "approved"
      ? "Approved, sending on the next pass"
      : draft.status === "held"
        ? "Held. Nothing goes out tonight."
        : draft.rebuild_requested
          ? "Rebuilding from today's data…"
          : draft.dirty
            ? "Preview is re-rendering from your edits…"
            : "Waiting on you";

  return (
    <section className="mb-8 rounded-xl border border-[#E2DFD5] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight">
          Tonight&rsquo;s report
        </h2>
        <span className={`text-[12.5px] ${draft.status === "held" ? "text-[#8A6D2F]" : "text-[#8A928C]"}`}>
          {statusLine}
        </span>
      </div>

      {draft.send_error && (
        <div className="mb-4 flex items-start gap-1.5 rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-3 py-2.5 text-[12.5px] text-[#8A6D2F]">
          <Ico name="alert" size={13} />
          <span>{draft.send_error}</span>
        </div>
      )}

      {!payload ? (
        <div className="text-[13.5px] text-[#5B6560]">
          <p className="mb-3">Nothing built for today yet.</p>
          <button
            onClick={() => startTransition(async () => {
              await actionRequestRebuild(draft.report_date);
              router.refresh();
            })}
            disabled={pending}
            className="rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Asking…" : "Build today's report"}
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90"
              >
                <Ico name="external" size={13} />
                Open the draft PDF
              </a>
            ) : (
              <span className="text-[12.5px] text-[#8A928C]">Preview not rendered yet.</span>
            )}
            <button
              onClick={() => startTransition(async () => {
                await actionRequestRebuild(draft.report_date);
                router.refresh();
              })}
              disabled={locked}
              title="Re-query HubSpot and rebuild from scratch. Discards the edits below."
              className="rounded-md border border-[#E2DFD5] px-3 py-2 text-[12.5px] text-[#5B6560] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
            >
              Rebuild from today&rsquo;s data
            </button>
            {draft.dirty && (
              <span className="text-[12px] text-[#8A6D2F]">
                The PDF is behind your edits. It re-renders within a few minutes.
              </span>
            )}
          </div>

          {/* STOPS. The three toggles are exactly the ones that decide what the
              map draws and what the mileage counts, which is where the keyword
              heuristics are wrong most often. */}
          <div className="mb-5">
            <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
              Stops · {stops.filter((s) => !stopEdits[String(s.n)]?.hidden).length} of {stops.length}
            </div>
            {stops.length === 0 ? (
              <p className="text-[13px] text-[#8A928C]">No stops on this day.</p>
            ) : (
              <ul className="divide-y divide-[#EDEBE3] overflow-hidden rounded-lg border border-[#E2DFD5]">
                {stops.map((s) => {
                  const key = String(s.n);
                  const e = stopEdits[key] ?? { hidden: false, call_only: false, message_only: false };
                  const set = (patch: Partial<StopEdit>) =>
                    setStopEdits((prev) => ({ ...prev, [key]: { ...e, ...patch } }));
                  return (
                    <li
                      key={key}
                      className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${e.hidden ? "opacity-45" : ""}`}
                    >
                      <span className="w-5 shrink-0 text-[12px] tabular-nums text-[#8A928C]">{s.n}</span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">
                        {s.name}
                        {s.city && <span className="text-[#8A928C]"> · {s.city}</span>}
                        {s.lat == null && (
                          <span className="ml-1.5 text-[11.5px] text-[#8A6D2F]">no coordinates, off the map</span>
                        )}
                      </span>
                      <div className="flex shrink-0 gap-1.5">
                        <Toggle on={e.call_only} onClick={() => set({ call_only: !e.call_only })} disabled={locked}>
                          Call only
                        </Toggle>
                        <Toggle
                          on={e.message_only}
                          onClick={() => set({ message_only: !e.message_only })}
                          disabled={locked}
                        >
                          Message
                        </Toggle>
                        <Toggle on={e.hidden} onClick={() => set({ hidden: !e.hidden })} disabled={locked} danger>
                          Hide
                        </Toggle>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* MILEAGE. Blank means recompute from whatever stops are still
              visible, which is what has to happen after hiding one. */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <label className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]" htmlFor="miles">
              Miles
            </label>
            <input
              id="miles"
              inputMode="numeric"
              value={miles}
              disabled={locked}
              onChange={(ev) => setMiles(ev.target.value.replace(/[^\d]/g, ""))}
              placeholder={payload.miles != null ? String(payload.miles) : "—"}
              className="w-24 rounded-md border border-[#E2DFD5] px-2.5 py-1.5 text-[14px] tabular-nums focus:border-[#14201B] focus:outline-none disabled:opacity-50"
            />
            <span className="text-[12px] text-[#8A928C]">
              Leave blank to recompute from the stops above.
            </span>
          </div>

          {/* HQ NOTES. The one free-text section: model-drafted, no upstream
              record to contradict, so editing it is authorship. */}
          <div className="mb-5">
            <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Notes to HQ</div>
            <div className="flex flex-col gap-2">
              {hqNotes.map((n, i) => (
                <div key={i} className="flex flex-wrap items-start gap-2">
                  <select
                    value={n.category}
                    disabled={locked}
                    onChange={(ev) =>
                      setHqNotes((prev) => prev.map((x, j) => (j === i ? { ...x, category: ev.target.value } : x)))
                    }
                    className="rounded-md border border-[#E2DFD5] bg-white px-2 py-1.5 text-[12px] disabled:opacity-50"
                  >
                    {HQ_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={n.text}
                    disabled={locked}
                    rows={2}
                    onChange={(ev) =>
                      setHqNotes((prev) => prev.map((x, j) => (j === i ? { ...x, text: ev.target.value } : x)))
                    }
                    className="min-w-[220px] flex-1 rounded-md border border-[#E2DFD5] px-2.5 py-1.5 text-[13.5px] leading-relaxed focus:border-[#14201B] focus:outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={() => setHqNotes((prev) => prev.filter((_, j) => j !== i))}
                    disabled={locked}
                    aria-label="Remove note"
                    className="rounded-md border border-[#E2DFD5] px-2 py-1.5 text-[12px] text-[#5B6560] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
                  >
                    <Ico name="close" size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setHqNotes((prev) => [...prev, { category: "OTHER", text: "", source: "Juan" }])}
                disabled={locked}
                className="self-start rounded-md border border-[#E2DFD5] px-3 py-1.5 text-[12.5px] text-[#5B6560] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
              >
                Add a note
              </button>
            </div>
          </div>

          {saved && <div className="mb-4"><SuccessNote title={saved} /></div>}

          {!sent && (
            <div className="flex flex-wrap gap-2 border-t border-[#EDEBE3] pt-4">
              <button
                onClick={() => decide("approved")}
                disabled={locked}
                className="rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {pending ? "Working…" : "Approve and send"}
              </button>
              <button
                onClick={() => save()}
                disabled={locked}
                className="rounded-md border border-[#E2DFD5] px-4 py-2 text-[13px] text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
              >
                Save edits
              </button>
              {draft.status === "held" ? (
                <button
                  onClick={() => decide("pending")}
                  disabled={locked}
                  className="rounded-md border border-[#E2DFD5] px-4 py-2 text-[13px] text-[#3D4A44] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
                >
                  Release the hold
                </button>
              ) : (
                <button
                  onClick={() => decide("held")}
                  disabled={locked}
                  title="Nothing goes out tonight, including at the 10pm deadline."
                  className="rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-4 py-2 text-[13px] text-[#8A6D2F] transition-colors hover:opacity-90 disabled:opacity-40"
                >
                  Hold tonight
                </button>
              )}
            </div>
          )}

          <p className="mt-4 text-[11.5px] leading-relaxed text-[#8A928C]">
            Approving sends within a few minutes. If you never get to it, the report still goes out at 10pm
            with whatever edits you saved. Hold is how you stop that.
          </p>
        </>
      )}
    </section>
  );
}

function Toggle({
  on,
  onClick,
  disabled,
  danger,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors disabled:opacity-40 ${
        on
          ? danger
            ? "border-[#8A2E2E] bg-[#8A2E2E] text-[#F7F6F1]"
            : "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
          : "border-[#E2DFD5] bg-white text-[#5B6560] hover:bg-[#FAF9F5]"
      }`}
    >
      {children}
    </button>
  );
}
