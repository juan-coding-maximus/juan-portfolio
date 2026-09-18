/**
 * Turn what a customer asked for into an email Juan could actually send.
 *
 * WHAT WAS WRONG. A logged visit carries `outreach_asks`: something the
 * customer asked for or was promised, extracted in the rep's own words
 * ("samples of the deodorant and other creams"). Those fragments were written
 * straight into nb_outbound_drafts.body_md with no subject and no recipient,
 * so the Outbound queue showed a half-sentence wearing the costume of a draft.
 * Juan's verdict, 2026-09-17, was "these drafts are bullshit". Nothing ever
 * composed them, because nothing was ever asked to. This module is what was
 * missing.
 *
 * WHY IT LIVES ALONE. This file imports the Anthropic SDK and nothing else
 * from this app. That is deliberate: touchpoint.ts calls it when a visit is
 * logged, and scripts/repair-ask-drafts.mts calls the identical function to
 * repair rows the old path already wrote. One copy of the rule, two callers
 * (root AGENTS.md P4).
 *
 * THE MODEL PROPOSES, THE SCRIPT DECIDES (root AGENTS.md P2). No fabrication
 * is the hardest rule in this repo, and "the prompt says not to" is not an
 * enforcement mechanism. So every composed email is run through
 * groundingFailure() before it can be written, and a failure is not a retry or
 * a warning: the row falls back to the unwritten form, which states the ask
 * and says plainly that it was not written. The check that carries the most
 * weight is the numbers one. A price, a quantity, a date, a case count and an
 * order number are all digits, they are what a customer would act on, and a
 * digit that appears in no source text is an invention no matter how plausible
 * the sentence around it reads.
 *
 * AN ASK IS NOT ALWAYS AN EMAIL. "The owner Sari is expected to email asking
 * about the samples" and "they said they will quote me on the business cards"
 * are both real facts and neither is a thing Juan sends. Those come back
 * unwritten with a reason, rather than being dressed up into an email nobody
 * asked for.
 *
 * THE VOICE COMES FROM HIS OWN SENT MAIL (2026-09-17). This module used to
 * carry a hand-typed paraphrase of PREFERENCES.md under the heading "HOW HE
 * WRITES", which is how the queue filled with competent strangers: "Following
 * up as promised on the vegan proteins you're interested in starting with. Let
 * me know what other information you need from me to move forward." Juan:
 * "these drafts are bullshit... none of that is high quality." The style
 * section is now assistant/EMAIL-VOICE.md, built by
 * bridges/email_voice/email_voice_scout.py from the emails he actually sent,
 * every rule carrying a line of his, and imported here through the generated
 * copy. One source of truth (root AGENTS.md P4), and it is evidence rather
 * than somebody's impression of him.
 *
 * FILLER IS REFUSED THE SAME WAY AN INVENTED NUMBER IS. A sentence that would
 * read identically for any account in the book carries no information, and a
 * model asked to write a short email will reach for one every time. So the
 * empty sentences are a deterministic refusal (fillerFailure), not a note in
 * the prompt, and so is a body that never names anything from the note
 * (specificityFailure).
 */

import Anthropic from "@anthropic-ai/sdk";
// The .ts extension is deliberate and tsconfig allows it: this module is also
// imported by scripts/repair-ask-drafts.mts under `node --experimental-strip-types`,
// which resolves real files and will not guess an extension.
import { EMAIL_VOICE } from "./email-voice.generated.ts";

export type AskContact = {
  id: string;
  /** Full name as it is on file, first name first. Empty names are not passed. */
  name: string;
  title: string | null;
  email: string | null;
};

export type AskAccount = {
  id: string;
  name: string;
  city: string | null;
  /** The store's own general address, used only when no named contact has one. */
  email: string | null;
};

export type ComposeAskInput = {
  /** What the customer asked for, in the rep's own words, verbatim. */
  ask: string;
  /** The full note the ask was extracted from. The only other source of truth. */
  noteText: string;
  account: AskAccount;
  contacts: AskContact[];
};

export type ComposedAsk =
  | {
      written: true;
      subject: string;
      body: string;
      contactId: string | null;
      toName: string | null;
      toEmail: string | null;
    }
  | { written: false; reason: string };

// ---------------------------------------------------------------------------
// Dedup. Two asks about one conversation must produce one row.
// ---------------------------------------------------------------------------

/** Contractions, expanded so "She's giving me an order" and "She is giving me
 *  an order." are the same string. That exact pair sat in the queue twice. */
const CONTRACTIONS: [RegExp, string][] = [
  [/\bit's\b/g, "it is"],
  [/\bshe's\b/g, "she is"],
  [/\bhe's\b/g, "he is"],
  [/\bthat's\b/g, "that is"],
  [/\bthere's\b/g, "there is"],
  [/\bwho's\b/g, "who is"],
  [/\bwhat's\b/g, "what is"],
  [/\bthey're\b/g, "they are"],
  [/\bwe're\b/g, "we are"],
  [/\byou're\b/g, "you are"],
  [/\bi'm\b/g, "i am"],
  [/\bdon't\b/g, "do not"],
  [/\bdoesn't\b/g, "does not"],
  [/\bdidn't\b/g, "did not"],
  [/\bcan't\b/g, "cannot"],
  [/\bwon't\b/g, "will not"],
  [/\bwouldn't\b/g, "would not"],
  [/\bisn't\b/g, "is not"],
  [/\baren't\b/g, "are not"],
  [/\bwasn't\b/g, "was not"],
  [/\bi'll\b/g, "i will"],
  [/\bwe'll\b/g, "we will"],
  [/\bthey'll\b/g, "they will"],
  [/\bi've\b/g, "i have"],
  [/\bwe've\b/g, "we have"],
  [/\bthey've\b/g, "they have"],
];

/** Words that carry no meaning for "is this the same ask". Kept short on
 *  purpose: an over-eager stoplist collapses two different asks into one. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "with", "on", "in", "at", "by", "from",
  "is", "are", "was", "were", "be", "been", "as", "that", "this", "it", "its",
  "he", "she", "they", "them", "him", "her", "his", "their", "we", "us", "our", "i", "me", "my",
  "asked", "asks", "ask", "asking", "wants", "want", "wanted", "would", "will", "like",
  "some", "any", "about", "also", "please", "said", "says", "me",
]);

export function normalizeAsk(ask: string): string {
  let s = ask.toLowerCase().replace(/[‘’ʼ]/g, "'");
  for (const [re, to] of CONTRACTIONS) s = s.replace(re, to);
  return s
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function contentTokens(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter((t) => t && !STOPWORDS.has(t)));
}

/**
 * Is this the same ask, said twice?
 *
 * Equal after normalizing, or one ask's content words are entirely contained
 * in the other's. Containment is what catches the real pattern: the same
 * conversation logged twice yields "Chlorella and Defense Plus" once and
 * "Julie asked for Chlorella and Defense Plus" the other time.
 *
 * Two content words are required before containment counts, so a bare "the
 * catalog" does not swallow every ask that happens to mention a catalog.
 */
export function asksCollide(a: string, b: string): boolean {
  const na = normalizeAsk(a);
  const nb = normalizeAsk(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ta = contentTokens(na);
  const tb = contentTokens(nb);
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (small.size < 2) return false;
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The grounding gate. Deterministic, and it has the last word.
// ---------------------------------------------------------------------------

/** Style that is never Juan's, enforced rather than requested. The em dash is
 *  a hard rule across the whole agency (jobhunt/scripts/style_check.py refuses
 *  a publish over one), and "ship" is a word he does not use.
 *
 *  Where a dash would go he writes a spaced hyphen, which the voice file
 *  documents in his own hand: "Let me know your preferred place - I'll be out
 *  in the field so I can adjust my schedule." That is allowed here on purpose.
 *
 *  THE BUZZWORDS ARE STEMMED. "Circling back in November, like we agreed" was
 *  the subject of a real queued draft, and a bare /circle back/ let it through. */
const BANNED = [
  { re: /[—–]/, why: "an em dash" },
  { re: /\bship(s|ped|ping|ment|ments)?\b/i, why: "the word ship" },
  { re: /no questions asked/i, why: "the phrase no questions asked" },
  {
    re: /\b(circl(e|es|ed|ing)\s+back|touch(es|ed|ing)?\s+base|move\s+the\s+needle|game.?changer|best.in.class|thought leader|synergy|cutting.edge|leverag(e|es|ed|ing)|utiliz(e|es|ed|ing)|spearhead(s|ed|ing)?)\b/i,
    why: "a buzzword",
  },
  { re: /\bhi\s+there\b/i, why: '"Hi there", a greeting addressed to nobody' },
  { re: /!/, why: "an exclamation mark" },
];

/**
 * Sentences that would read the same for any account in the book.
 *
 * Each one of these is contentless by construction: strike it and the email
 * loses nothing a customer could act on. They are listed rather than judged
 * because a model writing a short polite email reaches for them every time,
 * and "the prompt said not to" has never once been an enforcement mechanism.
 *
 * Narrow on purpose. "Let me know what quantities work" is a real ask and is
 * not here; only the empty forms of it are.
 */
const FILLER = [
  /let me know (if you (have any|need)|what other|how you(')?d like to proceed)/i,
  /if you have any questions/i,
  /(feel free|do not hesitate|don't hesitate) to (reach out|contact|ask|call)/i,
  /reach out with any questions/i,
  /to move forward/i,
  /at your earliest convenience/i,
  /looking forward to hearing (from you|back)/i,
  /i hope (this|all|you)\b[^.]{0,40}\b(well|finds you)/i,
  /hope all is well/i,
  /just wanted to (follow up|check in|reach out|touch)/i,
  /please advise/i,
  /thanks in advance/i,
  /any other information you need/i,
];

/**
 * The sign-off is his first name, alone.
 *
 * EMAIL-VOICE.md, from the corpus: "my first name alone. 'Juan', not 'Juan
 * Arenas': the full block is my auto signature, not something I type." Two
 * queued drafts ended in a typed-out "Juan Arenas Martin / NutriBiotic", which
 * is his mail client's job and reads like a form letter when a draft carries
 * it twice.
 *
 * A signature line is short and is not a sentence, which is what keeps this off
 * a real closing line like "NutriBiotic is made in Lakeport."
 */
const SIGNATURE_BLOCK = /^\s*(juan\s+arenas[\w\s.]{0,20}|nutribiotic[\w\s,]{0,20})\s*$/i;

/** How long an email written from one ask may get. A composed follow-up is
 *  four or five short sentences; past this, the model is filling space, and
 *  filled space is where invented facts live. */
const BODY_LIMIT = 1200;

/**
 * Everything the composed text is allowed to know, flattened. A number that is
 * not in here was not stated by anyone.
 */
function digitRuns(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}

/**
 * Words that appear in every follow-up ever written and so prove nothing about
 * WHICH account this one is for. Separate from STOPWORDS above, which exists to
 * decide whether two asks are the same ask.
 */
const UNSPECIFIC = new Set([
  "email", "emails", "emailed", "call", "called", "visit", "visited", "note", "notes",
  "follow", "following", "followup", "back", "next", "step", "steps", "time", "times",
  "info", "information", "detail", "details", "send", "sent", "sending", "give", "given",
  "want", "wants", "wanted", "need", "needs", "needed", "thing", "things", "today",
  "tomorrow", "week", "weeks", "month", "months", "said", "says", "talk", "talked",
  "spoke", "speak", "asked", "asking", "interested", "starting", "start", "started",
  "would", "could", "should", "there", "their", "them", "they", "your", "yours",
  "here", "have", "with", "that", "this", "from", "about", "when", "what", "will",
]);

/** Singular and plural read as the same word, so "samples" in the note matches
 *  "sample" in the draft. Crude on purpose: a stemmer would need a dictionary
 *  and this only has to answer "did the draft name the thing". */
function stem(word: string): string {
  return word.endsWith("s") && word.length > 4 ? word.slice(0, -1) : word;
}

function distinctive(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9+]+/)) {
    if (raw.length < 4) continue;
    if (STOPWORDS.has(raw) || UNSPECIFIC.has(raw)) continue;
    out.add(stem(raw));
  }
  return out;
}

/** The email minus its frame: no greeting line, no sign-off. What is left is
 *  what the recipient is actually being told. */
function bodyWithoutFrame(body: string): string {
  const lines = body.split("\n");
  while (lines.length && (!lines[0].trim() || /^\s*(hi|hello|hey|hola|buenos)\b/i.test(lines[0]))) lines.shift();
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (!last || /^(juan|thanks|thank you|talk soon|best|regards)[,.]?$/i.test(last) || SIGNATURE_BLOCK.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join("\n");
}

/**
 * Does this email tell the recipient anything about their own account?
 *
 * The test is whether the body, minus its greeting and sign-off, names at least
 * two things the source material named. Not a quality judgement, a floor: a
 * draft that shares nothing with the note it came from is a template with a
 * name pasted into it, and Juan can spot that from across the room.
 */
export function specificityFailure(body: string, sources: string[]): string | null {
  const said = distinctive(sources.join(" \n "));
  if (said.size < 2) return null; // The note itself said nothing specific; not the draft's fault.
  const written = distinctive(bodyWithoutFrame(body));
  let shared = 0;
  for (const w of written) if (said.has(w)) shared += 1;
  return shared >= 2 ? null : "the draft never names anything from the note, so it would read the same for any account";
}

/**
 * A fact in the draft that nobody stated. NEVER RETRIED.
 *
 * A model that has just invented a price and is told "you invented a price"
 * will hand back a different price. The only safe answer to a fabrication is to
 * stop writing, so this class of failure ends the composition and the row says
 * plainly that it was not written.
 */
export function fabricationFailure(
  subject: string,
  body: string,
  sources: string[],
  allowedFirstNames: string[],
): string | null {
  const text = `${subject}\n${body}`;

  const stated = new Set(digitRuns(sources.join(" \n ")));
  for (const n of digitRuns(text)) {
    if (!stated.has(n)) return `the draft used a number nobody stated (${n})`;
  }

  // The greeting names a person, and that person is on file. A greeting is the
  // first fabrication a reader would notice, and the cheapest one to make.
  const greeting = body.match(/^\s*(hi|hello|hey)\b([^,\n]*),/i);
  if (greeting) {
    const named = greeting[2].trim();
    if (named) {
      const allowed = allowedFirstNames.map((n) => n.toLowerCase());
      const first = named.split(/\s+/)[0].toLowerCase();
      if (!allowed.includes(first)) return `the draft greeted "${named}", who is not on file for this account`;
    }
  }

  return null;
}

/**
 * A draft that says nothing, or says it in words he does not use. RETRIED ONCE.
 *
 * Unlike a fabrication, this is safe to hand back: the facts are already
 * settled, and what is wrong is the writing. One correction is the difference
 * between Juan getting a sendable email and Juan getting a row that tells him
 * to write it himself, which is what he asked the OS to stop doing.
 */
export function styleFailure(subject: string, body: string, sources: string[]): string | null {
  const text = `${subject}\n${body}`;

  for (const b of BANNED) {
    if (b.re.test(text)) return `the draft used ${b.why}`;
  }

  for (const f of FILLER) {
    const m = text.match(f);
    if (m) return `the draft used a line that says nothing ("${m[0].trim()}")`;
  }

  // A typed-out signature. His mail client adds the block; a draft that carries
  // one sends it twice.
  const tail = body.trimEnd().split("\n").slice(-3);
  for (const line of tail) {
    if (SIGNATURE_BLOCK.test(line)) return "the draft typed out a signature block instead of signing off Juan";
  }

  if (body.length > BODY_LIMIT) return "the draft ran longer than an answer to one ask should";

  return specificityFailure(body, sources);
}

/**
 * Returns the reason this composition must be refused, or null when it is
 * clean. Fabrication is asked first: it is the failure that must never reach a
 * customer, and it is the one that ends the attempt rather than correcting it.
 */
export function groundingFailure(
  subject: string,
  body: string,
  sources: string[],
  allowedFirstNames: string[],
): string | null {
  return (
    fabricationFailure(subject, body, sources, allowedFirstNames) ?? styleFailure(subject, body, sources)
  );
}

// ---------------------------------------------------------------------------
// The composition itself.
// ---------------------------------------------------------------------------

const COMPOSE_TOOL = {
  name: "write_outreach_email",
  description:
    "Write the follow-up email for one thing a customer asked for, or report that it cannot be written from what is known.",
  input_schema: {
    type: "object" as const,
    properties: {
      writable: {
        type: "boolean",
        description:
          "true only when the note says enough to write an email the rep could send as-is, and the ask is something HE sends. false when the ask is something the other side will send him, when it is an internal reminder rather than a message, or when writing it would need a fact nobody stated.",
      },
      reason: {
        type: "string",
        description:
          "When writable is false, one plain sentence naming what is missing or why this is not an email he sends, addressed to the rep as 'you'. Empty string when writable is true.",
      },
      contact_id: {
        type: ["string", "null"],
        description:
          "The id of the ONE person this email is addressed to, from the contacts list given. The person who made the ask when the note names them. Null when no listed contact is the right recipient.",
      },
      subject: {
        type: "string",
        description:
          "A short, plain subject naming what this email is about, in sentence case: only proper nouns and product names are capitalized. A noun phrase, never marketing copy, never internal words like 'next step' or 'follow-up action'. Good: 'Chlorella and Defense Plus', 'Order list, per Susan', 'Getting Kim looped in on Clarity+'. Empty string when writable is false.",
      },
      body: {
        type: "string",
        description:
          "The email, greeting to sign-off. Empty string when writable is false.",
      },
    },
    required: ["writable", "reason", "contact_id", "subject", "body"],
  },
};

function systemPrompt(): string {
  return `You write one short follow-up email for Juan Arenas, NutriBiotic's Southern California field sales rep, from a note he typed after a visit or a call.

YOU MAY ONLY RE-WORD WHAT THE NOTE AND THE ACCOUNT RECORD ALREADY SAY. This is the hardest rule you have. You may re-order it, tighten it, and make it read like an email. You may never introduce a product, a price, a quantity, a date, a discount, a delivery time, a document, or a promise that is not already in the material given to you. If the note does not say when he is coming back, the email does not say when he is coming back. A number that is not in the note is an invention, and an invented number reaches a real customer.

WHAT IS NOT WRITABLE. Say so instead of writing something:
- The ask is something the OTHER side will send or do ("they will quote me", "the owner is expected to email me"). There is nothing for him to send yet.
- The ask is a note to himself, not a message to anyone.
- Writing it would need a fact nobody stated: a price, a sell-through figure, a document that does not exist.
Being honest that it cannot be written is always better than writing something plausible. A vague ask is still writable if he can honestly acknowledge it and say he is putting it together, as long as he promises nothing specific that the note does not already contain.

HOW HE WRITES. What follows is his own voice file, written from his own sent mail, with a real line of his behind every rule. Follow it over any instinct you have about how a sales email is supposed to read. Where it describes a habit, copy the habit, not the example sentence.

${EMAIL_VOICE}

THREE THINGS THAT FILE DOES NOT SAY, because they are about you and not about him:

1. Sign off with his first name alone, "Juan", on its own line. Never type "Juan Arenas Martin" or a company line under it: his mail client adds the block, and a draft carrying one sends it twice.

2. Every sentence must carry a fact from the note, a concrete ask, or a specific kindness about that person. A sentence that would read the same for any account in his book is filler, and filler is refused before he ever sees the draft. "Let me know what other information you need from me to move forward" is refused. "What sizes are you thinking to start with?" is not.

3. Greet the person by the first name on file: "Hi Julie,". If the note shows him replying rather than opening, skip the greeting and answer, the way he does. If no named contact fits, open with "Hello,".

4. The last line before his name does one of two things, and nothing else: it asks them one concrete question they can answer in a sentence, or it states the one thing he is doing next that the note already says he is doing. "Which sizes do you want to start with?" is a close. "I'll bring the Chlorella when I come back Thursday" is a close. "Following up as the next step" is not a close, it is a label, and it means the email asked for nothing.

Three short sentences is the normal length. Four or five is a long one.`;
}

function userPrompt(input: ComposeAskInput): string {
  const contacts = input.contacts.length
    ? input.contacts
        .map((c) => `${c.id} · ${c.name}${c.title ? `, ${c.title}` : ""}${c.email ? ` · ${c.email}` : " · no email on file"}`)
        .join("\n")
    : "(nobody on file for this account)";

  return `ACCOUNT: ${input.account.name}${input.account.city ? `, ${input.account.city}` : ""}

CONTACTS ON FILE (pick the recipient from these, by id):
${contacts}

THE ASK, in Juan's own words:
${input.ask}

THE FULL NOTE the ask came from, which is the only other thing you know:
${input.noteText}`;
}

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

/**
 * Compose one ask, or come back with the reason it was not composed.
 *
 * Never throws. A missing key, a model error and a refused grounding check all
 * land in the same place: an unwritten row that states the ask. Filing a visit
 * must not fail because an email could not be written from it.
 */
type ComposeOut = {
  writable: boolean;
  reason: string;
  contact_id: string | null;
  subject: string;
  body: string;
};

async function askModel(input: ComposeAskInput, correction: string | null): Promise<ComposeOut | string> {
  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: userPrompt(input) },
  ];
  if (correction) messages.push({ role: "user", content: correction });

  try {
    const msg = await client!.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 900,
      system: systemPrompt(),
      messages,
      tools: [COMPOSE_TOOL],
      tool_choice: { type: "tool", name: "write_outreach_email" },
    });
    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return "the draft came back empty";
    return toolUse.input as ComposeOut;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function composeAsk(input: ComposeAskInput): Promise<ComposedAsk> {
  if (!client) return { written: false, reason: "Not written: no model is configured on this deployment." };

  const sources = [input.ask, input.noteText, input.account.name, input.account.city ?? ""];
  const firstNames = input.contacts.map((c) => c.name.split(/\s+/)[0]).filter(Boolean);

  let correction: string | null = null;
  // Two attempts at most: the first, and one correction when what was wrong was
  // the writing rather than the facts.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const out = await askModel(input, correction);
    if (typeof out === "string") return { written: false, reason: `Not written: ${out}.` };

    if (!out.writable || !out.body.trim() || !out.subject.trim()) {
      return {
        written: false,
        reason: out.reason?.trim() || "Not written: there is nothing to send on this one yet.",
      };
    }

    const invented = fabricationFailure(out.subject, out.body, sources, firstNames);
    if (invented) return { written: false, reason: `Not written: ${invented}.` };

    const style = styleFailure(out.subject, out.body, sources);
    if (style) {
      if (attempt === 0) {
        correction = `That draft was refused before Juan saw it, because ${style}. Write it again. Change only the writing: every fact in it is already settled by the note, and you may not add a new one to fill the gap. Cut the empty sentence rather than rephrasing it, and if what is left is two sentences, two sentences is the email.`;
        continue;
      }
      return { written: false, reason: `Not written: ${style}.` };
    }

    const contact = input.contacts.find((c) => c.id === out.contact_id) ?? null;
    return {
      written: true,
      subject: out.subject.trim(),
      body: out.body.trim(),
      contactId: contact?.id ?? null,
      toName: contact?.name ?? null,
      toEmail: contact?.email ?? input.account.email ?? null,
    };
  }

  return { written: false, reason: "Not written: the draft could not be written in his voice." };
}

/**
 * The body of a row that could not be written: the ask as Juan said it, then
 * the reason, in that order. The ask leads because the ask is the fact, and
 * the fact is what he is deciding about.
 */
export function unwrittenBody(ask: string, reason: string): string {
  return `${ask.trim()}\n\n${reason.trim()}`;
}

/** play_key for a row composed from a customer ask, and for one that stayed
 *  unwritten. Rendered as-is on the Outbound card, underscores to spaces, so
 *  a row says which of the two it is without a second glance. */
export const ASK_COMPOSED_PLAY = "customer_ask";
export const ASK_UNWRITTEN_PLAY = "unwritten_ask";
