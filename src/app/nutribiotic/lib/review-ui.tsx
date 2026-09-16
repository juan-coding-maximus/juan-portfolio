"use client";

/**
 * The review-before-commit screen (Juan, 2026-09-15, after a note filed to
 * HubSpot he expected to be asked about first). Pops for 5 seconds after a
 * note that resolved to a matched account with a stated next step, the one
 * path that used to file to HubSpot the instant Log was pressed with no
 * human in the loop at all (see touchpoint.ts's previewTouchpoint doc).
 * Touch any field and the countdown stops; nothing commits until the green
 * "Looks good" is pressed. Touch nothing and it commits itself.
 *
 * Field notes, a needs-account park, and a needs-next-step park never reach
 * this screen: they already have their own explicit-tap gate downstream
 * (AccountMatchResolver / NextStepResolver), so previewTouchpoint routes
 * them straight through unchanged.
 */

import { useEffect, useRef, useState } from "react";
import type { Tier } from "./dal";
import type { Readiness } from "./priority";
import { GRADE_TITLE, READINESS_OPTIONS, VISIT_GRADES, type FiledTouchpoint } from "./touchpoint-ui";
import { commitTouchpointDraft, type TouchpointDraft } from "./touchpoint";
import { Ico } from "./ui";

const AUTO_COMMIT_MS = 5000;

const PRIORITY_BAND_LABEL: Record<string, string> = {
  now: "Now",
  soon: "Soon",
  later: "Later",
  unscored: "Unscored",
};

function ContactField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[#A9AFA9]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 rounded-md border border-[#E2DFD5] bg-white px-2 py-1.5 text-[13px] text-[#14201B] placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none"
      />
    </label>
  );
}

export function ReviewCard({
  draft,
  grade,
  onGradeChange,
  readiness,
  onReadinessChange,
  onCommitted,
}: {
  draft: TouchpointDraft;
  grade: Tier | null;
  onGradeChange: (g: Tier | null) => void;
  readiness: Readiness | null;
  onReadinessChange: (r: Readiness | null) => void;
  onCommitted: (result: FiledTouchpoint) => void;
}) {
  const [hubspotSummary, setHubspotSummary] = useState(draft.hubspotSummary);
  const [nextStep, setNextStep] = useState(draft.nextStep);
  const [contact, setContact] = useState(
    draft.contact ?? { firstName: null, lastName: null, title: null, phone: null, email: null },
  );
  const [touched, setTouched] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msLeft, setMsLeft] = useState(AUTO_COMMIT_MS);
  const startRef = useRef<number | null>(null);

  function markTouched() {
    setTouched(true);
  }

  async function doCommit() {
    if (committing) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await commitTouchpointDraft(draft, {
        hubspotSummary,
        nextStep,
        contact,
      });
      onCommitted(res);
    } catch (err) {
      setCommitting(false);
      setError(err instanceof Error ? err.message : "Could not log this. Tap Looks good to try again.");
      setTouched(true);
    }
  }

  // The passive countdown: ticks every 100ms so the bar reads as continuous,
  // stops the instant `touched` flips (any field edited, or the grade/
  // readiness pills below tapped) or once committing has started.
  useEffect(() => {
    if (touched || committing) return;
    if (startRef.current == null) startRef.current = Date.now();
    const t0 = startRef.current;
    const iv = setInterval(() => {
      const left = AUTO_COMMIT_MS - (Date.now() - t0);
      if (left <= 0) {
        clearInterval(iv);
        void doCommit();
      } else {
        setMsLeft(left);
      }
    }, 100);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, committing]);

  const pct = Math.max(0, Math.min(100, (msLeft / AUTO_COMMIT_MS) * 100));

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-[#E2DFD5] bg-[#FAF9F5] p-3">
      {/* Top center: the passive countdown bar, replaced the instant
          anything is touched by the one button that actually commits. */}
      <div className="flex flex-col items-center gap-1.5">
        {!touched ? (
          <>
            <div className="h-1 w-32 overflow-hidden rounded-full bg-[#ECEAE1]">
              <div className="h-full rounded-full bg-[#14201B] transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[11px] text-[#8A928C]">Logging in {Math.ceil(msLeft / 1000)}s unless you change something</div>
          </>
        ) : (
          <button
            type="button"
            onClick={doCommit}
            disabled={committing}
            className={`rounded-full px-5 py-2 text-[13px] font-semibold tracking-wide text-[#F7F6F1] transition-colors disabled:opacity-70 ${
              committing ? "bg-[#1E3A2A]" : "bg-[#2C6A46] hover:opacity-90"
            }`}
          >
            {committing ? "Logging…" : "Looks good"}
          </button>
        )}
        {error && <div className="text-[12px] text-[#8A6D2F]">{error}</div>}
      </div>

      <div className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">{draft.accountName}</div>

      {/* Contact, near the top per the ask: who was actually there. */}
      <div className="flex flex-wrap gap-2">
        <ContactField
          label="First name"
          value={contact.firstName ?? ""}
          onChange={(v) => {
            setContact((c) => ({ ...c, firstName: v || null }));
            markTouched();
          }}
          placeholder="First name"
        />
        <ContactField
          label="Last name"
          value={contact.lastName ?? ""}
          onChange={(v) => {
            setContact((c) => ({ ...c, lastName: v || null }));
            markTouched();
          }}
          placeholder="Last name"
        />
        <ContactField
          label="Role"
          value={contact.title ?? ""}
          onChange={(v) => {
            setContact((c) => ({ ...c, title: v || null }));
            markTouched();
          }}
          placeholder="Owner, buyer…"
        />
        <ContactField
          label="Phone"
          value={contact.phone ?? ""}
          onChange={(v) => {
            setContact((c) => ({ ...c, phone: v || null }));
            markTouched();
          }}
          placeholder="Phone"
          type="tel"
        />
        <ContactField
          label="Email"
          value={contact.email ?? ""}
          onChange={(v) => {
            setContact((c) => ({ ...c, email: v || null }));
            markTouched();
          }}
          placeholder="Email"
          type="email"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#EDEBE3] pt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Potential</span>
          <div className="flex gap-1">
            {VISIT_GRADES.map((t) => {
              const active = grade === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  title={GRADE_TITLE[t]}
                  onClick={() => {
                    onGradeChange(active ? null : t);
                    markTouched();
                  }}
                  className={`h-7 w-7 rounded-md text-[12.5px] font-semibold transition-colors ${
                    active ? "bg-[#14201B] text-[#F7F6F1]" : "bg-[#ECEAE1] text-[#3D4A44] hover:bg-[#E2DFD5]"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Readiness</span>
          <div className="flex gap-1">
            {READINESS_OPTIONS.map((opt) => {
              const active = readiness === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  aria-label={opt.title}
                  title={opt.title}
                  onClick={() => {
                    onReadinessChange(active ? null : opt.value);
                    markTouched();
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                    active ? opt.activeClass : "bg-[#ECEAE1] text-[#3D4A44] hover:bg-[#E2DFD5]"
                  }`}
                >
                  <Ico name={opt.icon} size={14} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="ml-auto text-[12px] text-[#8A928C]">
          SDR fit:{" "}
          <span className="font-medium text-[#14201B]">
            {draft.priorityScore != null ? draft.priorityScore : "not yet scored"}
          </span>
          {draft.priorityBand && ` · ${PRIORITY_BAND_LABEL[draft.priorityBand] ?? draft.priorityBand}`}
        </div>
      </div>

      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-[0.12em] text-[#A9AFA9]">What goes to HubSpot</span>
        <textarea
          value={hubspotSummary}
          onChange={(e) => {
            setHubspotSummary(e.target.value);
            markTouched();
          }}
          rows={3}
          className="w-full resize-none rounded-md border border-[#E2DFD5] bg-white px-2.5 py-2 text-[13px] leading-relaxed text-[#14201B] focus:border-[#14201B] focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-[0.12em] text-[#A9AFA9]">Next step</span>
        <input
          value={nextStep}
          onChange={(e) => {
            setNextStep(e.target.value);
            markTouched();
          }}
          className="w-full rounded-md border border-[#E2DFD5] bg-white px-2.5 py-2 text-[13px] text-[#14201B] focus:border-[#14201B] focus:outline-none"
        />
      </label>

      {draft.automationNotes.length > 0 && (
        <div className="text-[12px] text-[#8A928C]">
          The agency also does this on its own: {draft.automationNotes.join(", ")}.
        </div>
      )}
    </div>
  );
}
