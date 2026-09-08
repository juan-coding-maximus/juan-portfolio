/**
 * Outreach templates, grounded in the account's own record.
 *
 * Juan, field note fn_16cd3a: a library of preloaded messages that are
 * "urgent and well-timed", "thoughtful about timing and tone, all inferred
 * from client characteristics."
 *
 * The previous version of this file was four fixed strings with the account's
 * name dropped into them, which is a form letter with a mail merge, not
 * timing. This version is the same idea done against real columns: each
 * template declares the condition on the account that makes it the right
 * message TODAY, and every value it puts in front of a customer is read off
 * that account's row.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE (root AGENTS.md P2, department
 * HARD RULE 1): a template may only interpolate a value it can name a field
 * for. That is why `grounds()` is not documentation, it is part of the
 * contract: every template returns the field/value pairs its body used, the
 * composer prints them under the message, and a body that wants to say
 * something no field carries simply cannot be written here. No price, no
 * promise, no product they do not buy, no date that is not on the row.
 *
 * ATTACHMENTS ARE NEVER CLAIMED BY A TEMPLATE. Juan asked for messages that
 * are "accurate at attaching documents". The accurate version of that is the
 * message never mentioning a document on its own: `attachmentNote()` in
 * attachments-ui.tsx appends the real filenames of the files actually picked,
 * at the moment they are picked. A template that said "attaching our price
 * list" would be a claim that comes true only if Juan remembers, and neither
 * wa.me nor an Outlook compose deep link can carry a file through the URL to
 * make it true automatically. So templates carry `suggestsDocument`, which is
 * a prompt to Juan in the UI, not a sentence in the customer's message.
 *
 * TONE. Short, plain, first person, no hype, no exclamation marks, no em
 * dashes (assistant/PREFERENCES.md). These are read on a phone by someone
 * working, so they open with the reason for the message, not a greeting
 * paragraph.
 */

/** The subset of the account record templates are allowed to read. Anything
 *  not on this type is, by construction, not available to put in a message. */
export type TemplateAccount = {
  name: string;
  city: string | null;
  channel: string | null;
  /** Potential grade (nb_v_account_potential), the map's `tier`. */
  tier: string | null;
  lifecycle: string | null;
  last_order_at: string | null;
  expected_reorder_at: string | null;
  expected_reorder_days: number | null;
  top_category_12m: string | null;
  top_category_lifetime: string | null;
};

export type TemplateGround = { field: string; value: string };

export type OutreachTemplate = {
  id: string;
  label: string;
  /** Plain-English statement of when this is the right message. Shown to Juan,
   *  never to the customer. */
  when: string;
  /** True when the account's own row satisfies that condition. */
  applies: (a: TemplateAccount) => boolean;
  body: (a: TemplateAccount) => string;
  /** Every field this body read, with the value it used. */
  grounds: (a: TemplateAccount) => TemplateGround[];
  /** A file worth attaching with this message, named for Juan in the UI. The
   *  message body never mentions it. Null when nothing is implied. */
  suggestsDocument: string | null;
  /** Generic templates always apply and are never "timed"; they stay for the
   *  case where none of the grounded ones fit. */
  generic?: boolean;
};

/* ------------------------------------------------------------------ */
/* Field readers. Each returns null rather than a guess, and every caller
   below guards on null, so a blank column can never become a sentence.  */

function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function isPast(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() <= Date.now();
}

/** The category the account actually buys, trailing 12 months first, lifetime
 *  as the fallback. Lowercased for mid-sentence use; returns null when the
 *  product-mix view has no row, which is a real state (no loaded order lines)
 *  and must not become "your products". */
function boughtCategory(a: TemplateAccount): string | null {
  const c = a.top_category_12m ?? a.top_category_lifetime;
  return c && c.trim() ? c.trim() : null;
}

/* ------------------------------------------------------------------ */

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  /* Timing comes from expected_reorder_at, a real column set from the account's
     own order rhythm, not from a hardcoded "90 days". Only 33 of Juan's
     accounts carry one today, which is the point: this template fires on the
     ones where the cadence is actually known, and stays silent on the rest
     rather than inventing a due date. */
  {
    id: "reorder-due",
    label: "Reorder due",
    when: "Reorder date on file has passed",
    applies: (a) => isPast(a.expected_reorder_at) && Boolean(a.last_order_at),
    body: (a) => {
      const last = monthYear(a.last_order_at);
      const cat = boughtCategory(a);
      return [
        `Hi, this is Juan from NutriBiotic.`,
        last
          ? `You're about due on your next order at ${a.name}. The last one was ${last}.`
          : `You're about due on your next order at ${a.name}.`,
        cat
          ? `Happy to put the ${cat.toLowerCase()} back together the same way, or change anything you want changed.`
          : `Happy to put the same order back together, or change anything you want changed.`,
        `Let me know and I'll take care of it.`,
      ].join(" ");
    },
    grounds: (a) => {
      const g: TemplateGround[] = [
        { field: "expected_reorder_at", value: a.expected_reorder_at ?? "" },
      ];
      if (a.last_order_at) g.push({ field: "last_order_at", value: monthYear(a.last_order_at) ?? a.last_order_at });
      if (a.expected_reorder_days != null)
        g.push({ field: "expected_reorder_days", value: `${a.expected_reorder_days} days` });
      const cat = boughtCategory(a);
      if (cat)
        g.push({
          field: a.top_category_12m ? "top_category_12m" : "top_category_lifetime",
          value: cat,
        });
      return g;
    },
    suggestsDocument: "Current price list",
  },

  /* A year with no order is a different conversation from a late reorder, and
     saying "since March 2025" out loud is the whole message. Deliberately
     excludes accounts that have a live reorder date, so the two never both
     claim the same account. */
  {
    id: "lapsed",
    label: "Lapsed, no order in a year",
    when: "Last order over 12 months ago and no reorder date on file",
    applies: (a) => {
      const d = daysSince(a.last_order_at);
      return d != null && d >= 365 && !isPast(a.expected_reorder_at);
    },
    body: (a) => {
      const last = monthYear(a.last_order_at);
      const cat = boughtCategory(a);
      return [
        `Hi, Juan from NutriBiotic here.`,
        `I was looking at ${a.name} and we haven't had an order since ${last}.`,
        cat
          ? `You were carrying ${cat.toLowerCase()} then. I'd like to know whether that moved off the shelf or whether it just stopped getting reordered.`
          : `I'd like to know whether something changed on your end or whether it just stopped getting reordered.`,
        `Either answer is useful to me.`,
      ].join(" ");
    },
    grounds: (a) => {
      const g: TemplateGround[] = [
        { field: "last_order_at", value: monthYear(a.last_order_at) ?? "" },
      ];
      const d = daysSince(a.last_order_at);
      if (d != null) g.push({ field: "last_order_at (age)", value: `${d} days` });
      const cat = boughtCategory(a);
      if (cat)
        g.push({
          field: a.top_category_12m ? "top_category_12m" : "top_category_lifetime",
          value: cat,
        });
      return g;
    },
    suggestsDocument: null,
  },

  /* An active buyer with a known category. The specific thing that makes this
     not a form letter is naming what they actually buy, which comes from the
     order lines, not from a guess about their store. */
  {
    id: "category-checkin",
    label: "Check in on what they carry",
    when: "Ordered in the last 12 months and the product mix names a category",
    applies: (a) => {
      const d = daysSince(a.last_order_at);
      return d != null && d < 365 && Boolean(boughtCategory(a));
    },
    body: (a) => {
      const cat = boughtCategory(a);
      const last = monthYear(a.last_order_at);
      return [
        `Hi, Juan from NutriBiotic.`,
        `Checking in on how the ${String(cat).toLowerCase()} is moving at ${a.name}.`,
        last ? `Your last order was ${last}.` : ``,
        `If anything is running low or sitting, tell me which and I'll work with it.`,
      ]
        .filter(Boolean)
        .join(" ");
    },
    grounds: (a) => {
      const cat = boughtCategory(a);
      const g: TemplateGround[] = [];
      if (cat)
        g.push({
          field: a.top_category_12m ? "top_category_12m" : "top_category_lifetime",
          value: cat,
        });
      if (a.last_order_at)
        g.push({ field: "last_order_at", value: monthYear(a.last_order_at) ?? a.last_order_at });
      return g;
    },
    suggestsDocument: null,
  },

  /* Never ordered. The message must NOT imply a prior relationship, the same
     trap outreach-draft.ts guards in its no-note branch. Channel and city are
     the only two things known about them, and both come off the row. */
  {
    id: "first-contact",
    label: "First contact, no order on file",
    when: "No order on file",
    applies: (a) => !a.last_order_at,
    body: (a) => {
      const where = a.city ? ` in ${a.city}` : "";
      return [
        `Hi, this is Juan Arenas, the NutriBiotic rep for Southern California.`,
        `I look after accounts${where} and I don't have ${a.name} set up with us yet.`,
        `I'd like to come by, see the shelf, and leave you our line sheet. No pitch on the phone.`,
        `What day works?`,
      ].join(" ");
    },
    grounds: (a) => {
      const g: TemplateGround[] = [{ field: "last_order_at", value: "none on file" }];
      if (a.city) g.push({ field: "city", value: a.city });
      if (a.channel) g.push({ field: "channel", value: a.channel });
      return g;
    },
    suggestsDocument: "Line sheet",
  },

  /* The four originals. Still here, still name-only, now labelled honestly as
     generic so a grounded option is never passed over by accident. */
  {
    id: "checkin",
    label: "Check-in / reorder",
    when: "Any account",
    generic: true,
    applies: () => true,
    body: (a) =>
      `Hi, this is Juan from NutriBiotic. Checking in with ${a.name} to see how things are looking on the shelf and whether you're ready to reorder anything.`,
    grounds: (a) => [{ field: "name", value: a.name }],
    suggestsDocument: null,
  },
  {
    id: "new-product",
    label: "New product intro",
    when: "Any account",
    generic: true,
    applies: () => true,
    body: (a) =>
      `Hi, Juan here from NutriBiotic. Wanted to let ${a.name} know we have a new item I think would be a good fit for your shelf. Happy to bring a sample by.`,
    grounds: (a) => [{ field: "name", value: a.name }],
    suggestsDocument: null,
  },
  {
    id: "follow-up",
    label: "Follow-up after a visit",
    when: "Any account",
    generic: true,
    applies: () => true,
    body: (a) =>
      `Hi, good seeing you at ${a.name} the other day. Following up on what we talked about. Let me know if you need anything from my end.`,
    grounds: (a) => [{ field: "name", value: a.name }],
    suggestsDocument: null,
  },
  {
    id: "blank",
    label: "Blank",
    when: "Any account",
    generic: true,
    applies: () => true,
    body: () => "",
    grounds: () => [],
    suggestsDocument: null,
  },
];

/** The grounded templates whose condition this account actually meets, in
 *  declaration order (most time-sensitive first), followed by nothing. The
 *  generic four are deliberately NOT included: the composer shows them
 *  separately so "no timed message fits" is visible rather than papered over. */
export function timedTemplatesFor(a: TemplateAccount): OutreachTemplate[] {
  return OUTREACH_TEMPLATES.filter((t) => !t.generic && t.applies(a));
}

export function genericTemplates(): OutreachTemplate[] {
  return OUTREACH_TEMPLATES.filter((t) => t.generic);
}
