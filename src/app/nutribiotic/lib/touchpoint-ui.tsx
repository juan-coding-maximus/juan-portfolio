"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPotentialJuan, setReadiness } from "./account-actions";
import { decideCalendarProposal } from "./calendar-actions";
import type { Tier } from "./dal";
import type { Readiness } from "./priority";
import { AccountMatchResolver } from "./new-account-ui";
import { NextStepResolver } from "./next-step-ui";
import { ReviewCard } from "./review-ui";
import { previewTouchpoint, type RecordTouchpointResult, type TouchpointDraft } from "./touchpoint";
import { Ico, SuccessNote } from "./ui";

/**
 * A-E, not the full A-G the account card offers.
 *
 * The seven HubSpot options are A very big / B big / C medium / D small /
 * E very small / F no at all / G personal use through wholesale line. A-E is
 * the size judgment a rep actually forms standing in a store. F and G are
 * administrative dispositions, not sizes, and mis-tapping one from the field
 * would overwrite HQ's grade with a classification Juan did not mean. They stay
 * available on the account card, where there is room to read what they mean.
 */
export const VISIT_GRADES: Tier[] = ["A", "B", "C", "D", "E"];

export const GRADE_TITLE: Record<string, string> = {
  A: "A · very big",
  B: "B · big",
  C: "C · medium",
  D: "D · small",
  E: "E · very small",
};

/**
 * Readiness, a separate axis from the size grade above: how close this
 * account is to buying right now, not how big it could get. Set by the rep
 * on the same call/visit, converges into lib/priority.ts's 0-100 score as a
 * stated point adjustment (see READINESS_ADJUSTMENT there), never silently.
 */
// Icon, not a word, per option (Juan, 2026-09-15): four states read faster as
// a shape and a color than as four labels competing for the same row.
export const READINESS_OPTIONS: { value: Readiness; icon: string; title: string; activeClass: string }[] = [
  { value: "urgent", icon: "urgent", title: "Urgent · ready now, +20 to priority", activeClass: "bg-[#9C4A44] text-[#F7F6F1]" },
  { value: "hot", icon: "hot", title: "Hot · close, +10 to priority", activeClass: "bg-[#A8703D] text-[#F7F6F1]" },
  { value: "normal", icon: "dot", title: "Normal · no change to priority", activeClass: "bg-[#14201B] text-[#F7F6F1]" },
  { value: "cold", icon: "snowflake", title: "Cold · not close, -10 to priority", activeClass: "bg-[#5C7E8C] text-[#F7F6F1]" },
];

/** Survives a gate redirect, an iOS eviction, or a version-skew reload. The
 * key is per-surface, so a draft typed in ClientOS is the one ClientOS
 * restores. Text only: never a customer's name keyed to an account id. */
const DRAFT_KEY = "nb.touchpoint.draft.v1";

function readDraft(): string {
  try {
    return window.localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(value: string): void {
  try {
    if (value.trim()) window.localStorage.setItem(DRAFT_KEY, value);
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* Private mode, or storage disabled. The draft is a safety net, never a
     * dependency: capture must keep working without it. */
  }
}

export type FiledTouchpoint = Extract<RecordTouchpointResult, { ok: true; needsAccount: false; needsNextStep: false }>;

/**
 * One capture surface for whatever just happened: type it, optionally attach
 * a photo, send. This component is presentation only; recordTouchpoint()
 * (lib/touchpoint.ts) does the parsing.
 *
 * DELIBERATELY QUIET (2026-08-17, Juan: "it looks like a wall of text").
 * Earlier versions explained the pipeline in three separate paragraphs
 * before he'd typed a word. The only copy left is the placeholder and
 * whatever feedback a result actually produces.
 *
 * Audio recording (dictate the note) was removed 2026-09-15: typing is the
 * one path now. A photo attaches before the note is sent, held in
 * `pendingPhoto` and uploaded onto the touchpoint the moment submit() knows
 * its id, rather than after a following screen.
 */
const KIND_OPTIONS = [
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  // Not a customer contact. Stays in the OS, never files to HubSpot, counts as
  // a touchpoint but never as a visit, call or email.
  { value: "field_note", label: "Field note" },
] as const;
type KindOption = (typeof KIND_OPTIONS)[number]["value"];

export function TouchpointCapture({
  accountIdHint,
  onFiled,
  lockKind,
  defaultKind,
  initialText,
}: {
  accountIdHint?: string | null;
  /** Fires once, right after a clean file (matched, no follow-up needed).
   * Never fires on the needsAccount/error paths, those still need Juan to
   * act, not a caller-side side effect. The SDR schedule uses this to mark
   * its own planning row done without keeping a second opinion about what
   * happened (see lib/dal.ts's setSdrScheduleStatus). */
  onFiled?: (result: FiledTouchpoint) => void;
  /** SDR's account panel, 2026-09-08: this box only ever logs a call there,
   * so the Meeting/Email/Field note choice (a real choice on /visit, where
   * Juan could be doing any of them) is just noise to hide, not disable. When
   * set, the kind selector never renders and every submit sends this kind,
   * touched or not. */
  lockKind?: KindOption;
  /** Same box, 2026-09-15: Juan still wants a toggle here, not a hidden lock,
   *  a call sometimes turns into a real sit-down meeting worth logging as
   *  one. Pre-selects this kind (pills stay visible, unlike lockKind) and, if
   *  he never taps another pill, still sends it: a visible default he could
   *  see and didn't change is his call, not a silent guess. */
  defaultKind?: KindOption;
  /** SDR's call log, 2026-09-08: "Called X and spoke with: " pre-typed so
   *  Juan only has to add what was actually said. Applied once, on mount
   *  (this component is keyed per schedule item in sdr-ui.tsx, so a new
   *  instance mounts, and gets its own initialText, every time he switches
   *  who he's calling), and only when there's no saved draft to restore, a
   *  half-typed note always wins over a fresh template. */
  initialText?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<KindOption>(lockKind ?? defaultKind ?? "meeting");
  // WHETHER HE ACTUALLY PICKED, as opposed to leaving the default sitting there.
  // This toggle used to send its value on every submit, so "meeting" was forced
  // onto every note whether or not he touched it, and the extractor's own read
  // was overwritten every single time. That is half of why eight notes to self
  // became Meetings and Calls on 2026-09-02: the other half had no field_note
  // kind to choose, but even once it does, an untouched default would keep
  // overriding it. His explicit pick still wins (a rep's own word for what just
  // happened outranks a model's guess); an untouched default now stays quiet.
  const [kindTouched, setKindTouched] = useState(Boolean(lockKind ?? defaultKind));
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RecordTouchpointResult | null>(null);
  // A clean file (matched, no follow-up needed) gets its own confirmation
  // beat instead of sitting in `result` indefinitely: show it, refresh the
  // lists below so the just-filed activity is already gone from the queue,
  // then drop back to a blank capture on its own. needsAccount/error stay in
  // `result` since those need Juan to read and act, not a timed dismiss.
  const [success, setSuccess] = useState<FiledTouchpoint | null>(null);
  // The size read he formed at the door, applied to whatever account the note
  // lands on. Held here rather than written immediately because the account is
  // not known until the note is filed.
  const [grade, setGrade] = useState<Tier | null>(null);
  // The rep's own read of how close this account is to buying, formed on the
  // same call/visit. Same hold-until-filed pattern as `grade` above: the
  // account is not known until the note lands.
  const [readiness, setReadiness_] = useState<Readiness | null>(null);
  const [newCompany, setNewCompany] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const restoredRef = useRef(false);

  // Photo attach, held in the composer until the note is sent (0060 /
  // dir_67b159, moved ahead of submit): a rep decides "this needs a picture"
  // while writing, not after. Uploaded onto the touchpoint the moment its id
  // exists, whichever branch submit() lands in.
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoUiState, setPhotoUiState] = useState<"idle" | "attached" | "uploading" | "sent" | "error">("idle");

  // The 5s review-before-commit screen (Juan, 2026-09-15): set only for the
  // one case that used to file to HubSpot the instant Log was pressed with
  // no human in the loop at all. See touchpoint.ts's previewTouchpoint doc
  // for why every other outcome (field note, needs-account, needs-next-step,
  // error) never sets this and instead flows through exactly as it always
  // has.
  const [draft, setDraft] = useState<TouchpointDraft | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!success) return;
    router.refresh();
    const t = setTimeout(() => setSuccess(null), 2200);
    return () => clearTimeout(t);
  }, [success, router]);

  async function attachPhoto(touchpointId: string, file: File) {
    setPhotoUiState("uploading");
    try {
      const form = new FormData();
      form.set("touchpoint_id", touchpointId);
      form.set("photo", file);
      const res = await fetch("/nutribiotic/api/visits/attach", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Attach failed.");
      setPhotoUiState("sent");
      setTimeout(() => setPhotoUiState("idle"), 1500);
    } catch {
      setPhotoUiState("error");
      setTimeout(() => setPhotoUiState("idle"), 2500);
    }
  }

  const autosize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 420)}px`;
  }, []);

  /**
   * Restore a draft, then put the caret in the box.
   *
   * The focus call is deliberately NOT an `autoFocus` attribute. iOS Safari,
   * standalone web apps included, ignores focus that does not originate in a
   * user-gesture task, so on a cold launch the caret lands but the keyboard
   * does not rise. Focusing here at least means the first tap anywhere in the
   * card types rather than aims, and on every warm navigation (the common
   * case, since /nutribiotic and both tiles all land here) it does raise the
   * keyboard. `preventScroll` keeps the card from jumping under a thumb that
   * is already moving toward it.
   */
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = readDraft();
    if (saved) {
      setText(saved);
      requestAnimationFrame(() => textareaRef.current && autosize(textareaRef.current));
    } else if (initialText) {
      // Not written to the draft key: a template isn't a thing Juan typed,
      // and writeDraft() only fires from here on his own keystrokes.
      setText(initialText);
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        autosize(textareaRef.current);
        // Caret at the end, right after "spoke with: ", so the first
        // keystroke continues the sentence instead of landing mid-template.
        textareaRef.current.setSelectionRange(initialText.length, initialText.length);
      });
    }
    textareaRef.current?.focus({ preventScroll: true });
  }, [autosize, initialText]);

  /** The one clean landing, whether it came straight through or through the
   *  review card below. */
  function handleFiled(res: FiledTouchpoint) {
    // The grade goes on only once the note has landed and named its
    // account, so a failed file never leaves a grade on the wrong record.
    // Not awaited: it reaches HubSpot on the sync worker's own 60-second
    // cycle either way, and making the rep wait for it would undo the
    // point of this screen.
    if (grade && res.accountId) void setPotentialJuan(res.accountId, grade);
    if (readiness && res.accountId) void setReadiness(res.accountId, readiness);
    if (pendingPhoto) void attachPhoto(res.touchpoint_id, pendingPhoto);
    setPendingPhoto(null);
    setDraft(null);
    setText("");
    writeDraft("");
    setKind(lockKind ?? defaultKind ?? "meeting");
    setKindTouched(Boolean(lockKind ?? defaultKind));
    setGrade(null);
    setReadiness_(null);
    setNewCompany(false);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        autosize(textareaRef.current);
        textareaRef.current.focus({ preventScroll: true });
      }
    });
    setSuccess(res);
    onFiled?.(res);
  }

  function submit() {
    const value = text;
    if (!value.trim() || pending) return;
    startTransition(async () => {
      const preview = await previewTouchpoint(value, accountIdHint, {
        kindOverride: kindTouched ? kind : undefined,
        forceNewAccount: newCompany,
      });
      if (!preview.ok) {
        setResult(preview);
        return;
      }
      if (preview.needsReview) {
        // Held on screen for the review card below; nothing has been
        // written anywhere yet. The photo, if any, waits with it, still in
        // `pendingPhoto`, and attaches once handleFiled actually runs.
        setDraft(preview.draft);
        return;
      }
      const res = preview.result;
      if (res.ok && !res.needsAccount && !res.needsNextStep) {
        handleFiled(res);
      } else {
        // Parked (needs an account, or an account but no stated next step) or
        // failed: the text stays in the box AND in storage. This is the case
        // where the rep still has work to do on this note. The account is
        // already known on a needsNextStep park, so the grade/readiness he
        // picked at the door can go on right now rather than waiting on the
        // popup below to resolve.
        if (res.ok && res.needsNextStep) {
          if (grade) void setPotentialJuan(res.accountId, grade);
          if (readiness) void setReadiness(res.accountId, readiness);
        }
        if (res.ok && pendingPhoto) void attachPhoto(res.touchpoint_id, pendingPhoto);
        if (res.ok) setPendingPhoto(null);
        setResult(res);
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-[600px]">
      <div className="rounded-xl border border-[#E2DFD5] bg-white p-4 sm:p-5">
        {success ? (
          // The confirmation beat: tappable to skip the wait and start the
          // next one immediately, otherwise clears itself (see the effect
          // above) once the lists below have had a chance to refresh.
          <button type="button" onClick={() => setSuccess(null)} className="block w-full cursor-pointer text-left">
            <SuccessNote
              title={`Logged${success.accountName ? `: ${success.accountName}` : ""}`}
              detail={success.summary}
              hubspotFiled={success.hubspotFiled}
              hubspotId={success.hubspotNoteId}
              hubspotError={success.hubspotError}
              meta={
                <>
                  {(success.peopleAdded > 0 || success.peopleUpdated > 0 || (success.routeDirectives ?? 0) > 0) && (
                    <div className="mt-1.5 text-[12px] text-[#8A928C]">
                      {success.peopleAdded > 0 && `${success.peopleAdded} contact${success.peopleAdded === 1 ? "" : "s"} added`}
                      {success.peopleAdded > 0 && success.peopleUpdated > 0 && ", "}
                      {success.peopleUpdated > 0 && `${success.peopleUpdated} updated`}
                      {(success.routeDirectives ?? 0) > 0 &&
                        `${success.peopleAdded || success.peopleUpdated ? " · " : ""}${success.routeDirectives} return visit${success.routeDirectives === 1 ? "" : "s"} queued for the route planner`}
                    </div>
                  )}
                  {success.companyPhoneFilled && (
                    <div className="mt-1.5 text-[12px] text-[#8A928C]">
                      Company phone set to {success.companyPhoneFilled}
                    </div>
                  )}
                  {success.companyPhoneConflict && (
                    <div className="mt-1.5 flex items-start gap-1.5 text-[12px] text-[#8A6D2F]">
                      <Ico name="alert" size={11} />
                      <span>
                        Company already lists {success.companyPhoneConflict}. Kept it; the new number is on the contact.
                      </span>
                    </div>
                  )}
                  {success.hubspotLeaks > 0 && (
                    <div className="mt-1.5 flex items-start gap-1.5 text-[12px] text-[#8A6D2F]">
                      <Ico name="alert" size={11} />
                      <span>
                        HubSpot linked this to {success.hubspotLeaks} other{" "}
                        {success.hubspotLeaks === 1 ? "company" : "companies"} on its own. Unlinked.
                      </span>
                    </div>
                  )}
                  <div className="mt-1.5 text-[11px] uppercase tracking-[0.1em] text-[#A9AFA9]">Tap for the next one</div>
                </>
              }
            />
          </button>
        ) : null}
        {draft && (
          <ReviewCard
            draft={draft}
            grade={grade}
            onGradeChange={setGrade}
            readiness={readiness}
            onReadinessChange={setReadiness_}
            onCommitted={handleFiled}
          />
        )}
        {!success && !draft && (
          <>
            {!lockKind && <div className="mb-3 flex gap-1.5">
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setKind(opt.value);
                    setKindTouched(true);
                  }}
                  // Nothing reads as selected until he actually picks one.
                  // A pre-lit "Meeting" is a claim the note is a meeting, and
                  // the submit used to send exactly that claim every time.
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[13px] font-medium transition-colors ${
                    kindTouched && kind === opt.value
                      ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                      : "border-[#E2DFD5] bg-transparent text-[#5B6560] hover:bg-[#FAF9F5]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>}

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  const value = e.target.value;
                  setText(value);
                  writeDraft(value);
                  autosize(e.target);
                  // Typing before picking a kind is itself a pick: Meeting,
                  // the state `kind` already starts at, is what a rep means
                  // by default when they just start writing (Juan,
                  // 2026-09-15). Never fires with lockKind, which never
                  // shows this selector and is already touched on mount.
                  if (!kindTouched && !lockKind && value.trim()) setKindTouched(true);
                }}
                placeholder="What just happened?"
                rows={5}
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck
                className="min-h-[132px] w-full resize-none border-none bg-transparent p-0 text-[16px] leading-relaxed text-[#14201B] placeholder:text-[#A9AFA9] focus:outline-none"
              />
            </div>

            {/* Potential and New company sit BELOW the textarea on purpose.
                Above it they would push the one thing this screen exists for
                further from the thumb, and they are both decisions the rep
                makes about the note he has already written. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-[#EDEBE3] pt-3">
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
                      onClick={() => setGrade(active ? null : t)}
                      className={`h-8 w-8 rounded-md text-[13px] font-semibold transition-colors ${
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
              <button
                type="button"
                aria-pressed={newCompany}
                onClick={() => setNewCompany((v) => !v)}
                title="Skip matching against your accounts and create this business from Google Places"
                className={`ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  newCompany
                    ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                    : "border-[#E2DFD5] bg-transparent text-[#5B6560] hover:bg-[#FAF9F5]"
                }`}
              >
                <Ico name={newCompany ? "check" : "plus"} size={13} />
                New company
              </button>
            </div>

            {/* Readiness: a separate read from Potential above, how close this
                account is to buying, not how big it could get. Feeds the
                priority score as a stated point shift the moment it's set. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
              <span className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Lead readiness</span>
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
                      onClick={() => setReadiness_(active ? null : opt.value)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                        active ? opt.activeClass : "bg-[#ECEAE1] text-[#3D4A44] hover:bg-[#E2DFD5]"
                      }`}
                    >
                      <Ico name={opt.icon} size={15} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) setPendingPhoto(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  aria-label={pendingPhoto ? "Photo attached, tap to replace" : "Add a photo"}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    pendingPhoto
                      ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                      : "border-[#E2DFD5] bg-transparent text-[#5B6560] hover:bg-[#FAF9F5]"
                  }`}
                >
                  <Ico name="camera" size={17} />
                </button>
                <span className="min-h-[1em] text-[12px] leading-relaxed text-[#8A6D2F]">
                  {photoUiState === "uploading" && "Attaching photo…"}
                  {photoUiState === "error" && "Photo failed to attach."}
                  {photoUiState === "idle" && pendingPhoto && "1 photo, sends with this note."}
                </span>
              </div>
              <button
                onClick={submit}
                disabled={pending || !text.trim()}
                aria-label="Log this note"
                className="flex shrink-0 items-center gap-2 rounded-full bg-[#14201B] px-6 py-3 text-[14.5px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                {pending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <Ico name="send" size={18} />
                )}
                {pending ? "Logging…" : "Log"}
              </button>
            </div>
          </>
        )}
      </div>

      {result && !result.ok && (
        <div className="mt-3 rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-3 py-2.5 text-[13px] leading-relaxed text-[#8A6D2F]">
          {result.error}
        </div>
      )}

      {result?.ok && result.needsAccount && (
        <AccountMatchResolver
          touchpointId={result.touchpoint_id}
          nameGuess={result.businessNameGuess}
          matchAccountId={result.matchAccountId}
          matchAccountName={result.matchAccountName}
          pendingGrade={grade}
          pendingReadiness={readiness}
          onResolved={() => {
            // Fires 5s after the resolver's own success note lands (or on a
            // tap to skip the wait, same pattern as `success` above). Clears
            // `result` too, which unmounts the resolver and drops its note:
            // before 2026-09-02 this stayed forever and the only way back to
            // a loggable screen was reloading the page.
            setText("");
            writeDraft("");
            setKind(lockKind ?? defaultKind ?? "meeting");
            setGrade(null);
            setReadiness_(null);
            setNewCompany(false);
            setResult(null);
            requestAnimationFrame(() => textareaRef.current && autosize(textareaRef.current));
          }}
        />
      )}

      {result?.ok && !result.needsAccount && result.needsNextStep && (
        <NextStepResolver
          touchpointId={result.touchpoint_id}
          accountName={result.accountName}
          onResolved={() => {
            // Same clear-and-reset as AccountMatchResolver's onResolved above.
            setText("");
            writeDraft("");
            setKind(lockKind ?? defaultKind ?? "meeting");
            setGrade(null);
            setReadiness_(null);
            setNewCompany(false);
            setResult(null);
            requestAnimationFrame(() => textareaRef.current && autosize(textareaRef.current));
          }}
        />
      )}
    </div>
  );
}

export type ProposalRowData = {
  id: string;
  title: string;
  kind: string;
  starts_at: string | null;
  notes: string | null;
};

export function CalendarProposalRow({ proposal }: { proposal: ProposalRowData }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function decide(decision: "approved" | "dismissed") {
    startTransition(async () => {
      await decideCalendarProposal(proposal.id, decision);
      setDone(true);
    });
  }

  if (done) return null;

  const when = proposal.starts_at
    ? new Date(proposal.starts_at).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "no time stated";

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{proposal.title}</div>
        <div className="mt-0.5 truncate text-[12px] text-[#8A928C]">
          {proposal.kind} · {when}
          {proposal.notes ? ` · ${proposal.notes}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={() => decide("dismissed")}
          disabled={pending}
          className="rounded-md border border-[#E2DFD5] px-2.5 py-1.5 text-[12px] text-[#5B6560] transition-colors hover:bg-[#FAF9F5] disabled:opacity-40"
        >
          Dismiss
        </button>
        <button
          onClick={() => decide("approved")}
          disabled={pending}
          className="rounded-md bg-[#14201B] px-2.5 py-1.5 text-[12px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Approve
        </button>
      </div>
    </li>
  );
}
