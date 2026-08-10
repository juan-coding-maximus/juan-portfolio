"use client";

/**
 * Builder editor. Two panes of the mockup collapsed into one honest form:
 * the parts library IS the form controls (fixed claims, fixed friction
 * removers, the product catalog), and the canvas is the buyer page itself,
 * one Preview click away via a real code. No drag-and-drop theater over
 * what is structurally a list of choices.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionSaveProduct, actionSaveTemplate } from "../lib/promo-actions";
import {
  CLAIMS,
  CLIENT_TYPES,
  FRICTION_REMOVERS,
  LOCKED_CLAIMS,
  clientTypeLabel,
  money,
  type PromoProduct,
  type PromoTemplate,
  type TemplateBlocks,
} from "../lib/promo";

const field =
  "w-full rounded-md border border-[#C9CEC6] bg-white px-3 py-2 text-[14px] outline-none placeholder:text-[#C2C8C0] focus:border-[#14201B]";
const label = "mb-1 block text-[12.5px] font-medium text-[#3D4A44]";
const btn =
  "rounded-md border border-[#C9CEC6] bg-white px-3 py-1.5 text-[13px] font-medium text-[#3D4A44] hover:border-[#14201B]";
const btnPrimary =
  "rounded-lg bg-[#14201B] px-4 py-2.5 text-[14px] font-semibold text-[#F7F6F1] disabled:opacity-60";

type Draft = {
  id?: string;
  name: string;
  client_type: string;
  headline: string;
  subhead: string;
  bonus_label: string;
  show_margin: boolean;
  is_general: boolean;
  active: boolean;
  blocks: TemplateBlocks;
};

const emptyDraft = (): Draft => ({
  name: "",
  client_type: "retail",
  headline: "",
  subhead: "",
  bonus_label: "",
  show_margin: false,
  is_general: false,
  active: false,
  blocks: {
    line_items: [],
    mechanic: null,
    baseline_discount_pct: 0,
    friction: [...FRICTION_REMOVERS],
    claims: [...CLAIMS],
    testimonial: null,
  },
});

const toDraft = (t: PromoTemplate): Draft => ({
  id: t.id,
  name: t.name,
  client_type: t.client_type,
  headline: t.headline ?? "",
  subhead: t.subhead ?? "",
  bonus_label: t.bonus_label ?? "",
  show_margin: t.show_margin,
  is_general: t.is_general,
  active: t.active,
  blocks: {
    line_items: t.body_blocks.line_items ?? [],
    mechanic: t.body_blocks.mechanic ?? null,
    baseline_discount_pct: t.body_blocks.baseline_discount_pct ?? 0,
    friction: t.body_blocks.friction ?? [],
    claims: t.body_blocks.claims ?? [],
    testimonial: t.body_blocks.testimonial ?? null,
  },
});

export function BuilderClient({ templates, products }: { templates: PromoTemplate[]; products: PromoProduct[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setBlocks = (patch: Partial<TemplateBlocks>) =>
    setDraft((d) => (d ? { ...d, blocks: { ...d.blocks, ...patch } } : d));

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Give the template a name.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await actionSaveTemplate({
      id: draft.id,
      name: draft.name.trim(),
      client_type: draft.client_type,
      headline: draft.headline.trim() || null,
      subhead: draft.subhead.trim() || null,
      body_blocks: draft.blocks,
      show_margin: draft.show_margin,
      bonus_label: draft.bonus_label.trim() || null,
      is_general: draft.is_general,
      active: draft.active,
    });
    setBusy(false);
    if (res.ok) {
      setDraft(null);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="max-w-[720px] space-y-8">
      {/* ── Templates ──────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-fraunces)] text-[18px] font-semibold tracking-tight">
            Templates
          </h2>
          <button type="button" className={btn} onClick={() => setDraft(emptyDraft())}>
            New template
          </button>
        </div>

        {templates.length === 0 && !draft && (
          <p className="text-[14px] text-[#5B6560]">
            Nothing yet. A template is one offer described once; start with the products below, then build one.
          </p>
        )}

        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-[#E2DFD5] bg-white px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[14.5px] font-semibold">{t.name}</span>
                  <span className="text-[12px] text-[#8A928C]">
                    {clientTypeLabel(t.client_type)} · v{t.version}
                  </span>
                </div>
                <div className="truncate text-[13px] text-[#5B6560]">{t.headline ?? "No headline"}</div>
              </div>
              {t.is_general && (
                <span className="rounded bg-[#EFEDE4] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#5B6560]">
                  General
                </span>
              )}
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] ${
                  t.active ? "bg-[#EFF4EC] text-[#4A6242]" : "bg-[#F2F0E9] text-[#8A928C]"
                }`}
              >
                {t.active ? "Published" : "Draft"}
              </span>
              <button type="button" className={btn} onClick={() => setDraft(toDraft(t))}>
                Edit
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Editor ─────────────────────────────────────────────────────── */}
      {draft && (
        <section className="rounded-lg border border-[#14201B] bg-white p-5">
          <h2 className="font-[family-name:var(--font-fraunces)] text-[18px] font-semibold tracking-tight">
            {draft.id ? "Edit template" : "New template"}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tb-name" className={label}>Name</label>
              <input id="tb-name" className={field} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Beauty and spa · Q3" />
            </div>
            <div>
              <label htmlFor="tb-type" className={label}>Client type</label>
              <select id="tb-type" className={field} value={draft.client_type} onChange={(e) => set({ client_type: e.target.value })}>
                {CLIENT_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="tb-head" className={label}>Headline · the offer in plain words</label>
              <input id="tb-head" className={field} value={draft.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="Two free with every two." />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="tb-sub" className={label}>Subhead</label>
              <input id="tb-sub" className={field} value={draft.subhead} onChange={(e) => set({ subhead: e.target.value })} />
            </div>
          </div>

          {/* Products + quantities */}
          <div className="mt-5">
            <span className={label}>Products on this offer</span>
            {products.length === 0 ? (
              <p className="text-[13.5px] text-[#5B6560]">The catalog below is empty; add products first.</p>
            ) : (
              <div className="space-y-2">
                {draft.blocks.line_items.map((li, i) => {
                  const p = products.find((x) => x.id === li.product_id);
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-[#E2DFD5] px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                        {p ? `${p.name}${p.size ? ` · ${p.size}` : ""}` : "Missing product"}
                      </span>
                      <label className="flex items-center gap-1.5 text-[12.5px] text-[#5B6560]">
                        paid
                        <input
                          type="number" min={0} max={999} value={li.qty_paid}
                          onChange={(e) => {
                            const items = [...draft.blocks.line_items];
                            items[i] = { ...li, qty_paid: Number(e.target.value) || 0 };
                            setBlocks({ line_items: items });
                          }}
                          className="w-16 rounded border border-[#C9CEC6] px-2 py-1 text-right tabular-nums"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-[12.5px] text-[#5B6560]">
                        free
                        <input
                          type="number" min={0} max={999} value={li.qty_free}
                          onChange={(e) => {
                            const items = [...draft.blocks.line_items];
                            items[i] = { ...li, qty_free: Number(e.target.value) || 0 };
                            setBlocks({ line_items: items });
                          }}
                          className="w-16 rounded border border-[#C9CEC6] px-2 py-1 text-right tabular-nums"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setBlocks({ line_items: draft.blocks.line_items.filter((_, j) => j !== i) })}
                        className="text-[12.5px] text-[#8A4B2F] hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
                <select
                  className={field}
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setBlocks({
                      line_items: [...draft.blocks.line_items, { product_id: e.target.value, qty_paid: 1, qty_free: 0 }],
                    });
                  }}
                >
                  <option value="">Add a product…</option>
                  {products
                    .filter((p) => p.active && !draft.blocks.line_items.some((li) => li.product_id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.size ? `· ${p.size}` : ""} {p.wholesale_price == null ? "(no wholesale price)" : ""}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {/* Mechanic + discount */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tb-mech" className={label}>Offer mechanic</label>
              <select
                id="tb-mech"
                className={field}
                value={draft.blocks.mechanic?.type ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setBlocks({
                    mechanic:
                      v === "buy_x_get_y" ? { type: "buy_x_get_y", x: 2, y: 2 } :
                      v === "percent_off" ? { type: "percent_off", pct: 25 } : null,
                  });
                }}
              >
                <option value="">None</option>
                <option value="buy_x_get_y">Buy X get Y</option>
                <option value="percent_off">Percent off</option>
              </select>
              {draft.blocks.mechanic?.type === "buy_x_get_y" && (
                <div className="mt-2 flex items-center gap-2 text-[13px]">
                  Buy
                  <input type="number" min={1} value={draft.blocks.mechanic.x}
                    onChange={(e) => setBlocks({ mechanic: { type: "buy_x_get_y", x: Number(e.target.value) || 1, y: (draft.blocks.mechanic as { y: number }).y } })}
                    className="w-14 rounded border border-[#C9CEC6] px-2 py-1 text-right tabular-nums" />
                  get
                  <input type="number" min={1} value={draft.blocks.mechanic.y}
                    onChange={(e) => setBlocks({ mechanic: { type: "buy_x_get_y", x: (draft.blocks.mechanic as { x: number }).x, y: Number(e.target.value) || 1 } })}
                    className="w-14 rounded border border-[#C9CEC6] px-2 py-1 text-right tabular-nums" />
                  free
                </div>
              )}
              {draft.blocks.mechanic?.type === "percent_off" && (
                <div className="mt-2 flex items-center gap-2 text-[13px]">
                  <input type="number" min={1} max={90} value={draft.blocks.mechanic.pct}
                    onChange={(e) => setBlocks({ mechanic: { type: "percent_off", pct: Number(e.target.value) || 0 } })}
                    className="w-16 rounded border border-[#C9CEC6] px-2 py-1 text-right tabular-nums" />
                  % off
                </div>
              )}
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#8A928C]">
                The mechanic is the label on the offer; the free units themselves are the
                per-product quantities above. Keep the two in agreement.
              </p>
            </div>
            <div>
              <label htmlFor="tb-disc" className={label}>Baseline discount % (on paid units)</label>
              <input id="tb-disc" type="number" min={0} max={90} className={field}
                value={draft.blocks.baseline_discount_pct}
                onChange={(e) => setBlocks({ baseline_discount_pct: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} />
              <label htmlFor="tb-bonus" className={`${label} mt-3`}>Bonus label (what urgency counts down)</label>
              <input id="tb-bonus" className={field} value={draft.bonus_label}
                onChange={(e) => set({ bonus_label: e.target.value })} placeholder="Free freight on this order" />
            </div>
          </div>

          {/* Friction removers + claims */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Friction removers</span>
              {FRICTION_REMOVERS.map((f) => (
                <label key={f} className="flex items-center gap-2 py-0.5 text-[13.5px]">
                  <input
                    type="checkbox"
                    checked={draft.blocks.friction.includes(f)}
                    onChange={(e) =>
                      setBlocks({
                        friction: e.target.checked
                          ? [...draft.blocks.friction, f]
                          : draft.blocks.friction.filter((x) => x !== f),
                      })
                    }
                  />
                  {f}
                </label>
              ))}
            </div>
            <div>
              <span className={label}>Claims</span>
              {CLAIMS.map((c) => (
                <label key={c} className="flex items-center gap-2 py-0.5 text-[13.5px]">
                  <input
                    type="checkbox"
                    checked={draft.blocks.claims.includes(c)}
                    onChange={(e) =>
                      setBlocks({
                        claims: e.target.checked
                          ? [...draft.blocks.claims, c]
                          : draft.blocks.claims.filter((x) => x !== c),
                      })
                    }
                  />
                  {c}
                </label>
              ))}
              {LOCKED_CLAIMS.map((c) => (
                <label key={c} className="flex items-center gap-2 py-0.5 text-[13.5px] text-[#B0B6AE]">
                  <input type="checkbox" disabled />
                  {c} · awaits substantiation
                </label>
              ))}
            </div>
          </div>

          {/* Testimonial */}
          <div className="mt-5">
            <label htmlFor="tb-quote" className={label}>
              Testimonial · only a quote a real customer actually gave; blank beats invented
            </label>
            <input id="tb-quote" className={field} placeholder="Quote"
              value={draft.blocks.testimonial?.quote ?? ""}
              onChange={(e) =>
                setBlocks({
                  testimonial: e.target.value
                    ? { quote: e.target.value, attribution: draft.blocks.testimonial?.attribution ?? "" }
                    : null,
                })
              } />
            {draft.blocks.testimonial && (
              <input className={`${field} mt-2`} placeholder="Attribution (e.g. spa owner, Sacramento)"
                value={draft.blocks.testimonial.attribution}
                onChange={(e) =>
                  setBlocks({ testimonial: { quote: draft.blocks.testimonial!.quote, attribution: e.target.value } })
                } />
            )}
          </div>

          {/* Flags */}
          <div className="mt-5 flex flex-wrap gap-5 text-[13.5px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.show_margin} onChange={(e) => set({ show_margin: e.target.checked })} />
              Show margin at retail
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.is_general} onChange={(e) => set({ is_general: e.target.checked })} />
              This is the general fallback offer
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
              Published
            </label>
          </div>

          {error && <p className="mt-3 text-[13.5px] font-medium text-[#8A4B2F]" role="alert">{error}</p>}

          <div className="mt-5 flex gap-2">
            <button type="button" className={btnPrimary} disabled={busy} onClick={save}>
              {busy ? "Saving…" : draft.id ? "Save (bumps version)" : "Create template"}
            </button>
            <button type="button" className={btn} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* ── Product catalog ────────────────────────────────────────────── */}
      <ProductCatalog products={products} />
    </div>
  );
}

function ProductCatalog({ products }: { products: PromoProduct[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<PromoProduct> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!editing?.sku?.trim() || !editing?.name?.trim()) {
      setError("SKU and name are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await actionSaveProduct({
      id: editing.id,
      sku: editing.sku.trim(),
      name: editing.name.trim(),
      line: editing.line?.trim() || null,
      size: editing.size?.trim() || null,
      retail_price: editing.retail_price ?? null,
      wholesale_price: editing.wholesale_price ?? null,
      case_pack: editing.case_pack ?? null,
      upc: editing.upc?.trim() || null,
      image_url: editing.image_url?.trim() || null,
      active: editing.active ?? true,
    });
    setBusy(false);
    if (res.ok) {
      setEditing(null);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-fraunces)] text-[18px] font-semibold tracking-tight">
          Product catalog
        </h2>
        <button type="button" className={btn} onClick={() => setEditing({ active: true })}>
          Add product
        </button>
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-[#5B6560]">
        Typed in from the real price sheet; a product without both prices cannot enter an offer,
        because the snapshot refuses to guess a number.
      </p>

      {products.length === 0 && !editing && <p className="text-[14px] text-[#5B6560]">Empty.</p>}

      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-[#E2DFD5] bg-white px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <span className="text-[14px] font-medium">{p.name}</span>
              <span className="ml-2 text-[12.5px] text-[#8A928C]">
                {[p.sku, p.size, p.case_pack ? `${p.case_pack}pk` : null].filter(Boolean).join(" · ")}
              </span>
            </div>
            <span className="text-[13px] tabular-nums text-[#5B6560]">
              {p.retail_price != null ? money(p.retail_price) : "—retail"} /{" "}
              {p.wholesale_price != null ? money(p.wholesale_price) : "—wholesale"}
            </span>
            {!p.active && (
              <span className="rounded bg-[#F2F0E9] px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-[#8A928C]">
                Inactive
              </span>
            )}
            <button type="button" className={btn} onClick={() => setEditing(p)}>
              Edit
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="mt-3 rounded-lg border border-[#14201B] bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="pc-sku" className={label}>SKU</label>
              <input id="pc-sku" className={field} value={editing.sku ?? ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pc-name" className={label}>Name</label>
              <input id="pc-name" className={field} value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="pc-size" className={label}>Size</label>
              <input id="pc-size" className={field} value={editing.size ?? ""} onChange={(e) => setEditing({ ...editing, size: e.target.value })} placeholder="8 oz" />
            </div>
            <div>
              <label htmlFor="pc-retail" className={label}>Retail $</label>
              <input id="pc-retail" type="number" step="0.01" min={0} className={field}
                value={editing.retail_price ?? ""}
                onChange={(e) => setEditing({ ...editing, retail_price: num(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="pc-ws" className={label}>Wholesale $</label>
              <input id="pc-ws" type="number" step="0.01" min={0} className={field}
                value={editing.wholesale_price ?? ""}
                onChange={(e) => setEditing({ ...editing, wholesale_price: num(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="pc-case" className={label}>Case pack</label>
              <input id="pc-case" type="number" min={1} className={field}
                value={editing.case_pack ?? ""}
                onChange={(e) => setEditing({ ...editing, case_pack: e.target.value.trim() === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="pc-line" className={label}>Line</label>
              <select id="pc-line" className={field} value={editing.line ?? ""} onChange={(e) => setEditing({ ...editing, line: e.target.value || null })}>
                <option value="">—</option>
                <option value="body_care">Body care</option>
                <option value="protein">Protein</option>
                <option value="gse_defense">GSE defense</option>
                <option value="supplements">Supplements</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pc-img" className={label}>Image URL</label>
              <input id="pc-img" className={field} value={editing.image_url ?? ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
            Active
          </label>
          {error && <p className="mt-2 text-[13.5px] font-medium text-[#8A4B2F]" role="alert">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" className={btnPrimary} disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save product"}
            </button>
            <button type="button" className={btn} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
