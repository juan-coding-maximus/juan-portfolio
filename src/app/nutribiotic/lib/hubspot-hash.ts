/**
 * Payload normalization and hashing for HubSpot calls.
 *
 * BYTE-IDENTICAL TO PYTHON OR IT IS WORSE THAN USELESS. This is a port of
 * `normalize()` and `payload_hash()` in bridges/nutribiotic/hubspot.py:84-98.
 * The partial unique index `nb_hubspot_push_idempotent` (migration 0007:85-87)
 * keys on (entity, local_id, payload_hash) where direction='push' and
 * status='ok'. Two writers now reach that index: the Python scripts on the Mac
 * and this app. If their hashes disagree by a single byte, the index still
 * looks healthy while silently failing to dedupe, and the same note files twice
 * into a portal that is shared with another rep.
 *
 * Run `nutribiotic/tests/hash_parity.py` after touching anything in this file.
 * It runs the real Python implementation and this one over the same fixtures
 * and refuses to pass on a single mismatch.
 *
 * The four things Python does that a naive JSON.stringify does not:
 *
 *  1. NULLS ARE DROPPED FROM OBJECTS (but kept inside arrays, because Python's
 *     dict comprehension only filters dict values). JSON.stringify keeps them.
 *  2. KEYS ARE SORTED BY CODE POINT. JavaScript's default sort compares UTF-16
 *     code units, which orders astral characters differently from Python's
 *     `sorted()`. Property names are ASCII today; this is cheap insurance.
 *  3. NON-ASCII IS ESCAPED. Python's json.dumps defaults to ensure_ascii=True,
 *     so "Café Gratitude" serializes as "Café Gratitude". JSON.stringify
 *     emits the literal character. Southern California is full of accented and
 *     Spanish-language business names, so this is the trap most likely to fire.
 *  4. SEPARATORS ARE (",", ":") with no spaces.
 *
 * KNOWN LIMIT, floats. Python distinguishes int 1 from float 1.0 and renders
 * them "1" and "1.0". JavaScript has one number type and renders both "1", so a
 * whole-number float cannot round-trip. Nothing this app sends to HubSpot is a
 * float (property values are strings), and `assertNoWholeFloats` below turns
 * the unrepresentable case into a loud error instead of a silent divergence.
 */

/** Compare by Unicode code point, the way Python's `sorted()` orders strings. */
function codePointCompare(a: string, b: string): number {
  const ac = Array.from(a);
  const bc = Array.from(b);
  const n = Math.min(ac.length, bc.length);
  for (let i = 0; i < n; i++) {
    const d = (ac[i].codePointAt(0) ?? 0) - (bc[i].codePointAt(0) ?? 0);
    if (d !== 0) return d;
  }
  return ac.length - bc.length;
}

/**
 * Deterministic shape for hashing: sorted keys, nulls dropped, fixed floats.
 * Mirrors hubspot.py:84-92 exactly, including the asymmetry where nulls are
 * dropped from objects but preserved inside arrays.
 */
export function normalize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(normalize);
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) {
      throw new Error(`Refusing to hash a non-finite number (${obj}).`);
    }
    // Python: round(obj, 6) on floats only. Integers pass through untouched.
    return Number.isInteger(obj) ? obj : round6(obj);
  }
  if (typeof obj === "object") {
    const src = obj as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort(codePointCompare)) {
      const v = src[k];
      if (v === null || v === undefined) continue; // Python drops None here
      out[k] = normalize(v);
    }
    return out;
  }
  return obj;
}

/**
 * Round half to even, matching Python's `round()`. JavaScript's toFixed rounds
 * half away from zero, so 2.5 would land on 3 where Python gives 2. Only
 * reachable for non-integer floats, which this app does not currently send.
 */
function round6(x: number): number {
  const scaled = x * 1e6;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1; // exact half: to even
  return rounded / 1e6;
}

/** Escape a string the way Python's json.dumps does with ensure_ascii=True. */
function encodeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = s.charCodeAt(i);
    if (c === '"') out += '\\"';
    else if (c === "\\") out += "\\\\";
    else if (c === "\n") out += "\\n";
    else if (c === "\r") out += "\\r";
    else if (c === "\t") out += "\\t";
    else if (c === "\b") out += "\\b";
    else if (c === "\f") out += "\\f";
    else if (code < 0x20 || code > 0x7e) {
      // Python escapes anything outside the printable ASCII range. Iterating by
      // UTF-16 unit means astral characters emit their surrogate pair, which is
      // exactly what Python does too.
      out += "\\u" + code.toString(16).padStart(4, "0");
    } else out += c;
  }
  return out + '"';
}

function encodeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`Refusing to hash a non-finite number (${n}).`);
  }
  return String(n);
}

/** json.dumps(..., sort_keys=True, separators=(",", ":"), ensure_ascii=True) */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return encodeNumber(value);
  if (typeof value === "string") return encodeString(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object") {
    const src = value as Record<string, unknown>;
    const keys = Object.keys(src).sort(codePointCompare);
    return "{" + keys.map((k) => encodeString(k) + ":" + canonicalJson(src[k])).join(",") + "}";
  }
  throw new Error(`Refusing to hash an unserializable value of type ${typeof value}.`);
}

/**
 * Walk a payload and throw if it contains a whole-number float, the one shape
 * this port cannot reproduce. Callers that build payloads by hand should run
 * this in development; it is cheap and it fails loudly at the boundary rather
 * than as a duplicate row in the shared portal weeks later.
 *
 * JavaScript cannot actually tell 1.0 from 1, so this can only flag the case
 * where the Python side would have produced a float. It exists to document the
 * limit at the call site, not to detect it after the fact.
 */
export function assertNoWholeFloats(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoWholeFloats(v, `${path}[${i}]`));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertNoWholeFloats(v, `${path}.${k}`);
    }
  }
}

/** sha256 of the canonical form. Mirrors hubspot.py:95-98. */
export async function payloadHash(body: unknown): Promise<string> {
  const canonical = canonicalJson(normalize(body));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
