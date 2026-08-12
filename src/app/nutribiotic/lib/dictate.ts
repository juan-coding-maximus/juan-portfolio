"use client";

/**
 * Live dictation for the capture box.
 *
 * NOT A VOICE MEMO, which is the whole point and the reason this is not just
 * RecordVisit with a different button. RecordVisit uploads audio and Juan finds
 * out what it heard later, on the Mac. This types into the box as he speaks so
 * he can see the words land and fix them with the keyboard before anything is
 * filed. Web Speech is noticeably weaker than whisper.cpp on store names and
 * product SKUs ("Erewhon", "Sonne 7"), and being able to correct "Air One" to
 * "Erewhon" in place is what makes that weakness survivable.
 *
 * THE HARD PART IS KEYBOARD EDITS DURING DICTATION. The naive version rebuilds
 * the textarea from the recognizer on every event, which erases whatever Juan
 * just typed. So the text is split in two: `committed`, which dictation owns and
 * only ever appends to, and `interim`, the in-flight guess the recognizer keeps
 * revising. The box renders committed + interim; only committed survives.
 *
 * When Juan types, his edit is adopted as the new committed text and the
 * in-flight utterance is abandoned by index (`skipBefore`), so the final that
 * arrives a moment later for words he has already corrected is dropped instead
 * of being appended a second time. Aborting the recognizer would also work and
 * is simpler, but it cuts the audio mid-sentence; this keeps the mic running.
 *
 * SpeechRecognition is not in TypeScript's DOM lib and is still webkit-prefixed
 * in Safari, hence the local structural types rather than a dependency.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; 0: RecognitionAlternative; length: number };
type RecognitionResultList = { length: number; [i: number]: RecognitionResult };
type RecognitionEvent = { resultIndex: number; results: RecognitionResultList };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Join two spoken chunks without doubling spaces or orphaning punctuation. */
function joinSpoken(a: string, b: string): string {
  const left = a.replace(/\s+$/, "");
  const right = b.replace(/^\s+/, "");
  if (!left) return right;
  if (!right) return left;
  // The recognizer emits ", and then" style continuations often enough that
  // gluing a space in front of punctuation looks wrong.
  if (/^[,.;:!?]/.test(right)) return left + right;
  return `${left} ${right}`;
}

export type DictationLang = "en-US" | "es-US";

export type Dictation = {
  /** False when the browser has no Web Speech API. Fall back to typing. */
  supported: boolean;
  listening: boolean;
  /** Human-readable problem, already translated out of the spec's error codes. */
  error: string | null;
  /** The in-flight guess, still being revised. Never file this on its own. */
  interim: string;
  /** What the textarea should render: committed text plus the in-flight guess. */
  value: string;
  /** Committed text only. This is what gets filed. */
  committed: string;
  lang: DictationLang;
  setLang: (l: DictationLang) => void;
  toggle: () => void;
  stop: () => void;
  /** Call from the textarea's onChange. Adopts the edit, drops the in-flight guess. */
  onUserEdit: (next: string) => void;
  /** Clear everything, e.g. after a successful file. */
  reset: () => void;
};

/**
 * Whether this browser has Web Speech, without tripping a hydration mismatch.
 *
 * The server has no `window`, so a plain initializer would render "supported"
 * as false on the server and true on the client. useSyncExternalStore is the
 * supported way to say "this value differs between server and client and never
 * changes after mount": the third argument is the server snapshot.
 */
const NEVER_CHANGES = () => () => {};

export function useDictation(): Dictation {
  const supported = useSyncExternalStore(
    NEVER_CHANGES,
    () => recognitionCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState("");
  const [interim, setInterim] = useState("");
  const [lang, setLangState] = useState<DictationLang>("en-US");

  const recRef = useRef<Recognition | null>(null);
  // Whether the user still wants the mic on. Browsers end recognition on
  // silence even with continuous=true, so onend restarts while this is true.
  const wantRef = useRef(false);
  // Results at an index below this belong to an utterance the user has already
  // edited past. Their finals are dropped rather than appended.
  const skipBeforeRef = useRef(0);
  const seenResultsRef = useRef(0);
  const langRef = useRef<DictationLang>("en-US");

  const stop = useCallback(() => {
    wantRef.current = false;
    setListening(false);
    setInterim("");
    try {
      recRef.current?.stop();
    } catch {
      // Already stopped. Nothing to do and nothing worth reporting.
    }
  }, []);

  const begin = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = langRef.current;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      seenResultsRef.current = e.results.length;

      let finalAdd = "";
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (i < skipBeforeRef.current) continue; // superseded by a keyboard edit
        const r = e.results[i];
        const chunk = r[0]?.transcript ?? "";
        if (r.isFinal) finalAdd += chunk;
        else pending += chunk;
      }

      if (finalAdd) setCommitted((prev) => joinSpoken(prev, finalAdd));
      setInterim(pending.trim());
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // routine
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantRef.current = false;
        setListening(false);
        setError("Microphone permission denied. Allow it in the browser, or just type.");
        return;
      }
      if (e.error === "network") {
        setError("Dictation lost its network. Keep typing; it retries on the next tap.");
        return;
      }
      setError(`Dictation stopped (${e.error}). Typing still works.`);
    };

    rec.onend = () => {
      // Roll any in-flight guess into the committed text rather than dropping
      // it: the recognizer often ends right after the last word of a sentence.
      setInterim((tail) => {
        if (tail) setCommitted((prev) => joinSpoken(prev, tail));
        return "";
      });
      if (wantRef.current) {
        try {
          rec.start();
          return;
        } catch {
          wantRef.current = false;
        }
      }
      setListening(false);
    };

    recRef.current = rec;
    try {
      rec.start();
      wantRef.current = true;
      setListening(true);
      setError(null);
    } catch {
      setError("Could not start dictation. Typing still works.");
    }
  }, []);

  const toggle = useCallback(() => {
    if (wantRef.current) stop();
    else begin();
  }, [begin, stop]);

  const setLang = useCallback(
    (l: DictationLang) => {
      langRef.current = l;
      setLangState(l);
      // The spec reads `lang` at start(), so a live switch needs a bounce.
      if (wantRef.current) {
        stop();
        setTimeout(begin, 120);
      }
    },
    [begin, stop],
  );

  const sep = committed && interim ? " " : "";
  const value = committed + sep + interim;

  const onUserEdit = useCallback(
    (next: string) => {
      // Abandon whatever the recognizer is still chewing on, so its final does
      // not reappend words the user has just rewritten.
      skipBeforeRef.current = seenResultsRef.current;
      const suffix = sep + interim;
      const base = interim && next.endsWith(suffix) ? next.slice(0, next.length - suffix.length) : next;
      setInterim("");
      setCommitted(base);
    },
    [interim, sep],
  );

  const reset = useCallback(() => {
    skipBeforeRef.current = seenResultsRef.current;
    setCommitted("");
    setInterim("");
  }, []);

  useEffect(() => () => {
    wantRef.current = false;
    try {
      recRef.current?.abort();
    } catch {
      // Unmounting; nothing to recover.
    }
  }, []);

  return {
    supported, listening, error, interim, value, committed,
    lang, setLang, toggle, stop, onUserEdit, reset,
  };
}

// ---------------------------------------------------------------------------
// Keyword routing
//
// The same first-word rule as scripts/keyword-trigger.py, kept deliberately
// deterministic rather than inferred. Juan already says "clientos" out of habit
// from the CLI, and a spoken routing token that sometimes routes is worse than
// one that never does.
// ---------------------------------------------------------------------------

export type CaptureRoute = "clientos" | "expensos" | null;

const KEYWORDS: Record<string, Exclude<CaptureRoute, null>> = {
  clientos: "clientos",
  cliente: "clientos",
  clientes: "clientos",
  clients: "clientos",
  client: "clientos",
  expensos: "expensos",
  gasto: "expensos",
  gastos: "expensos",
  expenses: "expensos",
  expense: "expensos",
};

/**
 * Which skill the text is addressed to, by its first word only.
 *
 * First word only, exactly as the CLI hook does it, so "renamed the expenses
 * table" does not route to the expense filer.
 */
export function routeOf(text: string): CaptureRoute {
  const first = text.trim().toLowerCase().match(/^[a-záéíóúñ]+/i)?.[0];
  return first ? (KEYWORDS[first] ?? null) : null;
}

/** The note without its routing token, which is an address and not content. */
export function stripKeyword(text: string): string {
  if (!routeOf(text)) return text.trim();
  return text.trim().replace(/^[a-záéíóúñ]+[\s,.:;-]*/i, "").trim();
}
