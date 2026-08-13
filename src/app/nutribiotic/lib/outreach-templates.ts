/**
 * Starter WhatsApp message templates. Content, not logic: the one place to
 * edit copy without touching the composer. The only substitution is the
 * account's own name (a fact already on file), never an invented detail
 * about the account, the recipient, or their order history.
 */

export type OutreachTemplate = {
  id: string;
  label: string;
  body: (accountName: string) => string;
};

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: "checkin",
    label: "Check-in / reorder",
    body: (name) =>
      `Hi! This is Juan from NutriBiotic. Checking in with ${name} to see how things are looking on the shelf and if you're ready to reorder anything.`,
  },
  {
    id: "new-product",
    label: "New product intro",
    body: (name) =>
      `Hi! Juan here from NutriBiotic. Wanted to let ${name} know we've got a new item I think would be a good fit for your shelf, happy to bring by a sample.`,
  },
  {
    id: "follow-up",
    label: "Follow-up after a visit",
    body: (name) =>
      `Hi! Great seeing you at ${name} the other day. Following up on what we talked about, let me know if you need anything from my end.`,
  },
  {
    id: "blank",
    label: "Blank",
    body: () => "",
  },
];
