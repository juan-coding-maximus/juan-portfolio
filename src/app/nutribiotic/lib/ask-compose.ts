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
 */

import Anthropic from "@anthropic-ai/sdk";

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
 *  a publish over one), and "ship" is a word he does not use. */
const BANNED = [
  { re: /[—–]/, why: "an em dash" },
  { re: /\bship(s|ped|ping)?\b/i, why: "the word ship" },
  { re: /no questions asked/i, why: "the phrase no questions asked" },
  { re: /\b(circle back|move the needle|game.?changer|best.in.class|thought leader|synergy|cutting.edge)\b/i, why: "a buzzword" },
  { re: /!/, why: "an exclamation mark" },
];

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
 * Returns the reason this composition must be refused, or null when it is
 * clean. Called on every composed email before it can reach the queue.
 */
export function groundingFailure(
  subject: string,
  body: string,
  sources: string[],
  allowedFirstNames: string[],
): string | null {
  const text = `${subject}\n${body}`;

  for (const b of BANNED) {
    if (b.re.test(text)) return `the draft used ${b.why}`;
  }

  if (body.length > BODY_LIMIT) return "the draft ran longer than an answer to one ask should";

  const stated = new Set(digitRuns(sources.join(" \n ")));
  for (const n of digitRuns(text)) {
    if (!stated.has(n)) return `the draft used a number nobody stated (${n})`;
  }

  // The greeting names a person, and that person is on file. "Hi there" is a
  // greeting for nobody, which QuickReach already refuses for the same reason.
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

HOW HE WRITES:
- Direct, warm, specific. Short sentences. Plain words.
- Lead with the thing itself. No preamble, no "I hope this finds you well".
- No hype, no buzzwords, no exclamation marks, no em dashes anywhere. Never the word "ship".
- Never "circle back", "touch base", "leverage", "utilize", "best-in-class", "game-changer".
- Greet the person by the first name on file: "Hi Julie,". If no named contact fits, open with "Hello,". Never "Hi there".
- Close with a line that says what happens next, only if the note says what happens next.
- Sign off with exactly:

Juan

- Four or five short sentences is a long email. Most are three.`;
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
export async function composeAsk(input: ComposeAskInput): Promise<ComposedAsk> {
  if (!client) return { written: false, reason: "Not written: no model is configured on this deployment." };

  let out: { writable: boolean; reason: string; contact_id: string | null; subject: string; body: string };
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 900,
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt(input) }],
      tools: [COMPOSE_TOOL],
      tool_choice: { type: "tool", name: "write_outreach_email" },
    });
    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { written: false, reason: "Not written: the draft came back empty." };
    }
    out = toolUse.input as typeof out;
  } catch (err) {
    return {
      written: false,
      reason: `Not written: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!out.writable || !out.body.trim() || !out.subject.trim()) {
    return { written: false, reason: out.reason?.trim() || "Not written: there is nothing to send on this one yet." };
  }

  const contact = input.contacts.find((c) => c.id === out.contact_id) ?? null;
  const failure = groundingFailure(
    out.subject,
    out.body,
    [input.ask, input.noteText, input.account.name, input.account.city ?? ""],
    input.contacts.map((c) => c.name.split(/\s+/)[0]).filter(Boolean),
  );
  if (failure) return { written: false, reason: `Not written: ${failure}.` };

  return {
    written: true,
    subject: out.subject.trim(),
    body: out.body.trim(),
    contactId: contact?.id ?? null,
    toName: contact?.name ?? null,
    toEmail: contact?.email ?? input.account.email ?? null,
  };
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
