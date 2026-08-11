/**
 * Promo domain: shared types and pure helpers for the three offer surfaces
 * (phone = rep code generator, offer_builder = template maker, promo = the
 * buyer page). No IO here; this file is imported by client and server alike.
 *
 * THE MODEL, in one paragraph: a template is an offer described once (products,
 * quantities, mechanic, claims). A code binds a buyer to a template at a moment
 * in time by FREEZING a snapshot of everything the buyer page will render,
 * numbers included. The buyer page renders from the snapshot alone, so a later
 * price change or template edit can never move an offer already handed to
 * someone on a card. freezeSnapshot() below is that single moment, and it is
 * deterministic arithmetic over stored numbers: it can reorder and derive, it
 * cannot introduce a fact.
 */

/** One function, used on write and on read. 'ja spa 04 k7' == 'JA-SPA-04-K7'. */
export const normalizeCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Random 2-char suffix, Crockford base32 (no I L O U). Rep-chosen stems are
 * sequential and therefore guessable; without this, anyone can walk
 * JA-SPA-01..99 and read other buyers' names and pricing.
 */
export function codeSuffix(): string {
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  return ALPHABET[bytes[0] % 32] + ALPHABET[bytes[1] % 32];
}

/** The rep on every surface. Phone comes from env so a wrong number is never invented. */
export const REP = {
  name: "Juan Arenas",
  prefix: "JA",
  email: "juan@nutribiotic.com",
} as const;

/** Offer grid in the phone tab; 3-letter stems for the handwritten code. */
export const CLIENT_TYPES = [
  { key: "retail", label: "Generalist retail", stem: "RET" },
  { key: "spa", label: "Beauty and spa", stem: "SPA" },
  { key: "immune", label: "Immune defense", stem: "IMM" },
  { key: "gym", label: "Gym and fitness", stem: "GYM" },
  { key: "naturopathic", label: "Naturopathic", stem: "NAT" },
  { key: "pharmacy", label: "Pharmacy", stem: "PHM" },
  { key: "general", label: "General fallback", stem: "GEN" },
] as const;
export type ClientTypeKey = (typeof CLIENT_TYPES)[number]["key"];

export const clientTypeLabel = (key: string): string =>
  CLIENT_TYPES.find((t) => t.key === key)?.label ?? key;
export const clientTypeStem = (key: string): string =>
  CLIENT_TYPES.find((t) => t.key === key)?.stem ?? "GEN";

/**
 * Claims the buyer page may carry, exactly as Juan's spec states them.
 * LOCKED_CLAIMS are visible in the builder but not selectable until someone
 * hands over substantiation; rendering an unsubstantiated product claim on a
 * sales page is the textbook fabrication this OS exists to prevent.
 */
export const CLAIMS = ["Made in California", "cGMP compliant", "Third-party tested", "Higher Standards since 1981"] as const;
export const LOCKED_CLAIMS = ["Vegan", "Gluten free", "Non-GMO", "Cruelty free", "Linus Pauling lineage"] as const;

/** Risk-removal terms, from the spec's own list. One idea: sell it before you pay for it. */
export const FRICTION_REMOVERS = [
  "Net 30 invoicing",
  "60 day money back guarantee",
  "Return freight paid",
  "No minimum order",
] as const;

/**
 * Each term restated in plain words (Juan's ask, 2026-08-10). Restatements of
 * what the term already promises, nothing added: the map is fixed here so a
 * template cannot carry an explanation its term does not back.
 */
export const TERMS_PLAIN: Record<string, string> = {
  "Net 30 invoicing":
    "Nothing is paid today. Juan confirms the order first, and the invoice is due 30 days after it ships.",
  "60 day money back guarantee":
    "If it does not sell within 60 days, send it back and the money comes back.",
  "Return freight paid":
    "If anything goes back, the return shipping is covered. It costs nothing to return.",
  "No minimum order":
    "Order exactly what fits the shelf. There is no minimum to hit.",
};

export const OFFER_TTL_DAYS = 30;

export type Mechanic =
  | { type: "buy_x_get_y"; x: number; y: number }
  | { type: "percent_off"; pct: number };

export type TemplateBlocks = {
  line_items: { product_id: string; qty_paid: number; qty_free: number }[];
  mechanic: Mechanic | null;
  baseline_discount_pct: number;
  friction: string[];
  claims: string[];
  testimonial?: { quote: string; attribution: string } | null;
};

export type PromoProduct = {
  id: string;
  sku: string;
  name: string;
  line: string | null;
  size: string | null;
  retail_price: number | null;
  wholesale_price: number | null;
  case_pack: number | null;
  upc: string | null;
  image_url: string | null;
  active: boolean;
};

export type PromoTemplate = {
  id: string;
  name: string;
  client_type: string;
  headline: string | null;
  subhead: string | null;
  body_blocks: TemplateBlocks;
  show_margin: boolean;
  bonus_label: string | null;
  is_general: boolean;
  active: boolean;
  version: number;
  updated_at: string;
};

export type SnapshotLine = {
  sku: string;
  name: string;
  size: string | null;
  case_pack: number | null;
  image_url: string | null;
  qty_paid: number;
  qty_free: number;
  retail_each: number;
  wholesale_each: number;
  effective_each: number;
};

export type Snapshot = {
  headline: string;
  subhead: string | null;
  client_type: string;
  line_items: SnapshotLine[];
  mechanic: Mechanic | null;
  baseline_discount_pct: number;
  totals: { you_pay: number; normally: number; retail_value: number };
  margin_at_retail_pct: number | null;
  reorder_pricing_note: string | null;
  friction: string[];
  claims: string[];
  testimonial?: { quote: string; attribution: string } | null;
};

export type PromoCode = {
  code_norm: string;
  display_code: string;
  template_id: string | null;
  client_name: string | null;
  client_company: string | null;
  snapshot: Snapshot;
  show_margin: boolean;
  bonus_label: string | null;
  bonus_expires_at: string | null;
  expires_at: string;
  state: "issued" | "viewed" | "requested" | "expired" | "void";
  rep_notes: string | null;
  first_viewed_at: string | null;
  requested_at: string | null;
  created_at: string;
};

export type PromoOrder = {
  id: string;
  code_norm: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  company: string | null;
  ship_address: { text?: string } | null;
  line_items: { sku: string; name: string; qty_paid: number; qty_free: number; original_qty_paid: number }[];
  totals: { you_pay: number } | null;
  notes: string | null;
  state: "new" | "reviewed" | "relayed" | "closed";
  created_at: string;
  relayed_at: string | null;
};

const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Freeze a template plus its products into the snapshot a code will carry.
 * Every number the buyer sees is derived here, once, from stored prices:
 *   line pays   qty_paid x wholesale x (1 - baseline discount)
 *   normally    all units x wholesale (what the same goods cost without the offer)
 *   retail      all units x retail (shelf value)
 * A product missing a wholesale or retail price is refused, not guessed.
 */
export function freezeSnapshot(tpl: PromoTemplate, products: PromoProduct[]): Snapshot {
  const byId = new Map(products.map((p) => [p.id, p]));
  const disc = tpl.body_blocks.baseline_discount_pct || 0;

  const lines: SnapshotLine[] = tpl.body_blocks.line_items.map((li) => {
    const p = byId.get(li.product_id);
    if (!p) throw new Error(`Template "${tpl.name}" references a product that no longer exists.`);
    if (p.wholesale_price == null || p.retail_price == null) {
      throw new Error(`"${p.name}" has no wholesale or retail price on file; refusing to guess one.`);
    }
    const units = li.qty_paid + li.qty_free;
    const pay = li.qty_paid * p.wholesale_price * (1 - disc / 100);
    return {
      sku: p.sku,
      name: p.name,
      size: p.size,
      case_pack: p.case_pack,
      image_url: p.image_url,
      qty_paid: li.qty_paid,
      qty_free: li.qty_free,
      retail_each: r2(p.retail_price),
      wholesale_each: r2(p.wholesale_price),
      effective_each: units > 0 ? r2(pay / units) : 0,
    };
  });
  if (lines.length === 0) throw new Error(`Template "${tpl.name}" has no products; nothing to offer.`);

  const you_pay = r2(lines.reduce((s, l) => s + l.qty_paid * l.wholesale_each * (1 - disc / 100), 0));
  const normally = r2(lines.reduce((s, l) => s + (l.qty_paid + l.qty_free) * l.wholesale_each, 0));
  const retail_value = r2(lines.reduce((s, l) => s + (l.qty_paid + l.qty_free) * l.retail_each, 0));

  const reorder =
    lines.length > 0
      ? `Reorder wholesale: ${lines.map((l) => `$${l.wholesale_each.toFixed(2)}`).join(" / ")}`
      : null;

  return {
    headline: tpl.headline ?? "",
    subhead: tpl.subhead,
    client_type: tpl.client_type,
    line_items: lines,
    mechanic: tpl.body_blocks.mechanic,
    baseline_discount_pct: disc,
    totals: { you_pay, normally, retail_value },
    margin_at_retail_pct: retail_value > 0 ? Math.round((1 - you_pay / retail_value) * 100) : null,
    reorder_pricing_note: reorder,
    friction: tpl.body_blocks.friction,
    claims: tpl.body_blocks.claims,
    testimonial: tpl.body_blocks.testimonial ?? null,
  };
}

export const money = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * The forwardable relay block for an order, exactly the shape Juan pastes to
 * the orders team. Generated text, never sent by the system: composing is
 * automatic, sending stays human (agency principle 1).
 */
export function relayText(order: PromoOrder, code: PromoCode): string {
  const items = order.line_items
    .flatMap((li) => {
      const rows = [];
      if (li.qty_paid > 0) rows.push(`  ${li.qty_paid} x ${li.sku}   ${li.name}   paid`);
      if (li.qty_free > 0) rows.push(`  ${li.qty_free} x ${li.sku}   ${li.name}   FREE`);
      return rows;
    })
    .join("\n");
  const mech = code.snapshot.mechanic;
  const mechLabel =
    mech?.type === "buy_x_get_y"
      ? `Buy ${mech.x} get ${mech.y} free`
      : mech?.type === "percent_off"
        ? `${mech.pct}% off`
        : "";
  const offerLine = [mechLabel, code.snapshot.baseline_discount_pct ? `${code.snapshot.baseline_discount_pct}% first order` : ""]
    .filter(Boolean)
    .join(" + ");
  return [
    "--- RELAY TO ORDERS ---",
    `Account:   ${[order.company, order.contact_name].filter(Boolean).join(", ")}`,
    `Ship to:   ${order.ship_address?.text ?? ""}`,
    `Contact:   ${[order.contact_email, order.contact_phone].filter(Boolean).join(" · ")}`,
    "",
    items,
    "",
    offerLine ? `Offer:     ${offerLine}` : null,
    code.bonus_label ? `Bonus:     ${code.bonus_label}` : null,
    order.totals ? `Total:     ${money(order.totals.you_pay)}` : null,
    "Terms:     Net 30",
    order.notes ? `Notes:     ${order.notes}` : null,
    "--- END RELAY ---",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
