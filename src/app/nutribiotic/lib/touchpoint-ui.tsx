"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPotentialJuan } from "./account-actions";
import { decideCalendarProposal } from "./calendar-actions";
import type { Tier } from "./dal";
import { AccountMatchResolver } from "./new-account-ui";
import { recordTouchpoint, type RecordTouchpointResult } from "./touchpoint";
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
const VISIT_GRADES: Tier[] = ["A", "B", "C", "D", "E"];

const GRADE_TITLE: Record<string, string> = {
  A: "A · very big",
  B: "B · big",
  C: "C · medium",
  D: "D · small",
  E: "E · very small",
};

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

function mtMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

type FiledTouchpoint = Extract<RecordTouchpointResult, { ok: true; needsAccount: false }>;

function fmtTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * One capture surface, typed or spoken, for whatever just happened. Both
 * paths land in the same recordTouchpoint() extractor (see lib/touchpoint.ts),
 * so a typed note and a transcribed one are parsed identically; this
 * component is presentation only.
 *
 * DELIBERATELY QUIET (2026-08-17, Juan: "it looks like a wall of text").
 * Earlier versions explained the pipeline in three separate paragraphs
 * before he'd typed a word. The only copy left is the placeholder and
 * whatever feedback a result actually produces. The record button carries
 * no label at all: red and round is the whole affordance, same convention
 * as every voice-memo and camera app.
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

export function TouchpointCapture({ accountIdHint }: { accountIdHint?: string | null }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<KindOption>("meeting");
  // WHETHER HE ACTUALLY PICKED, as opposed to leaving the default sitting there.
  // This toggle used to send its value on every submit, so "meeting" was forced
  // onto every note whether or not he touched it, and the extractor's own read
  // was overwritten every single time. That is half of why eight notes to self
  // became Meetings and Calls on 2026-09-02: the other half had no field_note
  // kind to choose, but even once it does, an untouched default would keep
  // overriding it. His explicit pick still wins (a rep's own word for what just
  // happened outranks a model's guess); an untouched default now stays quiet.
  const [kindTouched, setKindTouched] = useState(false);
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
  const [newCompany, setNewCompany] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const restoredRef = useRef(false);

  const [voice, setVoice] = useState<"idle" | "recording" | "uploading" | "uploaded" | "error">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const t0Ref = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!success) return;
    router.refresh();
    const t = setTimeout(() => setSuccess(null), 2200);
    return () => clearTimeout(t);
  }, [success, router]);

  useEffect(() => {
    if (voice !== "uploaded") return;
    const t = setTimeout(() => setVoice("idle"), 1800);
    return () => clearTimeout(t);
  }, [voice]);

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
    }
    textareaRef.current?.focus({ preventScroll: true });
  }, [autosize]);

  function submit() {
    const value = text;
    if (!value.trim() || pending) return;
    startTransition(async () => {
      const res = await recordTouchpoint(value, accountIdHint, null, {
        kindOverride: kindTouched ? kind : undefined,
        forceNewAccount: newCompany,
      });
      if (res.ok && !res.needsAccount) {
        // The grade goes on only once the note has landed and named its
        // account, so a failed file never leaves a grade on the wrong record.
        // Not awaited: it reaches HubSpot on the sync worker's own 60-second
        // cycle either way, and making the rep wait for it would undo the
        // point of this screen.
        if (grade && res.accountId) void setPotentialJuan(res.accountId, grade);
        setText("");
        writeDraft("");
        setKind("meeting");
        setKindTouched(false);
        setGrade(null);
        setNewCompany(false);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            autosize(textareaRef.current);
            textareaRef.current.focus({ preventScroll: true });
          }
        });
        setSuccess(res);
      } else {
        // Parked or failed: the text stays in the box AND in storage. This is
        // the case where the rep still has work to do on this note.
        setResult(res);
      }
    });
  }

  async function finishRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    const startedAt = new Date(t0Ref.current).toISOString();
    const endedAt = new Date().toISOString();
    const mime = recRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mime });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];

    if (blob.size < 1000) {
      setVoice("error");
      setVoiceError("Recording was empty.");
      return;
    }

    setVoice("uploading");
    try {
      const form = new FormData();
      form.set("audio", blob, "visit");
      form.set("started_at", startedAt);
      form.set("ended_at", endedAt);
      if (accountIdHint) form.set("account_id_hint", accountIdHint);
      const res = await fetch("/nutribiotic/api/visits/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Upload failed.");
      setVoice("uploaded");
    } catch (err) {
      setVoice("error");
      setVoiceError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  async function startRecording() {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = mtMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      t0Ref.current = Date.now();
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = finishRecording;
      recRef.current = rec;
      streamRef.current = stream;
      rec.start(1000);
      setVoice("recording");
      setElapsedMs(0);
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - t0Ref.current), 1000);
    } catch {
      setVoice("error");
      setVoiceError("Microphone unavailable or permission denied.");
    }
  }

  function stopRecording() {
    recRef.current?.stop();
  }

  const recording = voice === "recording";
  const uploading = voice === "uploading";

  return (
    <div className="mx-auto w-full max-w-[600px]">
      <div className="rounded-xl border border-[#E2DFD5] bg-white p-4 sm:p-5">
        {success ? (
          // The confirmation beat: tappable to skip the wait and start the
          // next one immediately, otherwise clears itself (see the effect
          // above) once the lists below have had a chance to refresh.
          <button onClick={() => setSuccess(null)} className="block w-full text-left">
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
        ) : (
          <>
            <div className="mb-3 flex gap-1.5">
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
            </div>

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  writeDraft(e.target.value);
                  autosize(e.target);
                }}
                placeholder="What just happened?"
                rows={5}
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck
                className="min-h-[132px] w-full resize-none border-none bg-transparent p-0 pr-14 text-[16px] leading-relaxed text-[#14201B] placeholder:text-[#A9AFA9] focus:outline-none"
              />

              {recording && (
                <span className="pointer-events-none absolute bottom-1 right-[60px] text-[12.5px] font-medium tabular-nums text-[#8A2E2E]">
                  {fmtTimer(elapsedMs)}
                </span>
              )}

              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={uploading}
                aria-label={recording ? "Stop recording" : "Record a visit"}
                className={`absolute bottom-0 right-0 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-all disabled:opacity-50 ${
                  recording ? "scale-105 bg-[#B23B3B]" : "bg-[#8A2E2E] hover:opacity-90"
                }`}
              >
                {uploading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <Ico name={recording ? "stop" : "mic"} size={17} />
                )}
              </button>
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

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="min-h-[1em] text-[12px] leading-relaxed text-[#8A6D2F]">
                {voice === "uploaded" ? "Recording sent, transcribing." : voiceError}
              </span>
              <button
                onClick={submit}
                disabled={pending || !text.trim()}
                className="shrink-0 rounded-md bg-[#14201B] px-4 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90 disabled:opacity-30"
              >
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
          onResolved={() => {
            // Fires 5s after the resolver's own success note lands (or on a
            // tap to skip the wait, same pattern as `success` above). Clears
            // `result` too, which unmounts the resolver and drops its note:
            // before 2026-09-02 this stayed forever and the only way back to
            // a loggable screen was reloading the page.
            setText("");
            writeDraft("");
            setKind("meeting");
            setGrade(null);
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
