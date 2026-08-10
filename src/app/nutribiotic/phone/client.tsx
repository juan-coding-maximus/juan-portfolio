"use client";

/**
 * The three screens of the mockup, one component: A (new code), B (code
 * created, oversized for hand-copying), C (my codes + requests). Confirmation
 * is local state; the row itself was written server-side before B ever shows.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { actionCreateCode, actionSaveNotes, actionSetOrderState, actionVoidCode } from "../lib/promo-actions";
import {
  clientTypeLabel,
  relayText,
  money,
  type PromoCode,
  type PromoOrder,
  type PromoTemplate,
} from "../lib/promo";
import { Ico } from "../lib/ui";

const ago = (iso: string): string => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  const w = Math.floor(d / 7);
  return w === 1 ? "1 week ago" : `${w} weeks ago`;
};

const STATE_TINT: Record<PromoCode["state"], string> = {
  issued: "bg-[#EFEDE4] text-[#5B6560]",
  viewed: "bg-[#FBF6E9] text-[#8A6D2F]",
  requested: "bg-[#EFF4EC] text-[#4A6242]",
  expired: "bg-[#F2F0E9] text-[#8A928C]",
  void: "bg-[#F9EFEB] text-[#8A4B2F]",
};

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="rounded-md border border-[#C9CEC6] bg-white px-3 py-1.5 text-[13px] font-medium text-[#3D4A44] hover:border-[#14201B]"
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function PhoneClient({
  templates,
  codes,
  orders,
  origin,
}: {
  templates: PromoTemplate[];
  codes: PromoCode[];
  orders: PromoOrder[];
  origin: string;
}) {
  const router = useRouter();
  const [tplId, setTplId] = useState(templates[0]?.id ?? "");
  const [name, setName] = useState("");
  const [urgency, setUrgency] = useState<"none" | "72h" | "7d">("none");
  const [batch, setBatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PromoCode[] | null>(null);
  const [openCode, setOpenCode] = useState<string | null>(null);

  const codeByNorm = useMemo(() => new Map(codes.map((c) => [c.code_norm, c])), [codes]);
  const pendingOrders = orders.filter((o) => o.state === "new" || o.state === "reviewed");

  async function create() {
    if (!tplId) return;
    setBusy(true);
    setError(null);
    const res = await actionCreateCode({
      template_id: tplId,
      client_name: name.trim() || null,
      urgency,
      batch: batch ? 20 : 1,
    });
    setBusy(false);
    if (res.ok) {
      setCreated(res.data);
      setName("");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  const seg = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
      active ? "bg-[#14201B] text-[#F7F6F1]" : "bg-white text-[#3D4A44] border border-[#C9CEC6]"
    }`;

  // ── Screen B: created ──────────────────────────────────────────────────
  if (created) {
    const first = created[0];
    const tpl = templates.find((t) => t.id === first.template_id);
    return (
      <div className="max-w-[420px]">
        <div className="rounded-lg border border-[#E2DFD5] bg-white p-6 text-center">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#8A928C]">
            {created.length > 1 ? `${created.length} codes issued` : "Created just now"}
          </div>
          {created.length === 1 ? (
            <div className="mt-3 font-mono text-[34px] font-semibold tracking-[0.08em] tabular-nums">
              {first.display_code}
            </div>
          ) : (
            <div className="mt-3 max-h-56 space-y-1 overflow-y-auto font-mono text-[17px] tabular-nums">
              {created.map((c) => (
                <div key={c.code_norm}>{c.display_code}</div>
              ))}
            </div>
          )}
          <div className="mt-2 text-[13px] text-[#5B6560]">Write this on the card</div>
          {tpl?.headline && (
            <div className="mt-3 rounded-md bg-[#F2F0E9] px-3 py-2 text-[13.5px]">
              Also write: <span className="font-medium">{tpl.headline}</span> · 30 days
            </div>
          )}
          <div className="mt-4 flex justify-center gap-2">
            <CopyButton
              text={created.map((c) => `${c.display_code} · ${origin}/nutribiotic/promo`).join("\n")}
            />
            <a
              href={`/nutribiotic/promo/o/${first.code_norm}`}
              target="_blank"
              className="rounded-md border border-[#C9CEC6] bg-white px-3 py-1.5 text-[13px] font-medium text-[#3D4A44] hover:border-[#14201B]"
            >
              Preview
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreated(null)}
          className="mt-4 w-full rounded-lg bg-[#14201B] px-4 py-3 text-[15px] font-semibold text-[#F7F6F1]"
        >
          Create another
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[640px] space-y-8">
      {/* ── Screen A: new code ─────────────────────────────────────────── */}
      <section className="rounded-lg border border-[#E2DFD5] bg-white p-5">
        <h2 className="font-[family-name:var(--font-fraunces)] text-[18px] font-semibold tracking-tight">
          New code
        </h2>
        {templates.length === 0 ? (
          <p className="mt-2 text-[14px] leading-relaxed text-[#5B6560]">
            No published offers yet. Build and publish one in the{" "}
            <a href="/nutribiotic/offer_builder" className="underline underline-offset-2">
              offer builder
            </a>{" "}
            first; codes bind to a published template.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {!batch && (
              <div>
                <label htmlFor="ph-name" className="mb-1 block text-[12.5px] font-medium text-[#3D4A44]">
                  Client first name
                </label>
                <input
                  id="ph-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Maria"
                  autoComplete="off"
                  className="w-full rounded-md border border-[#C9CEC6] px-3 py-2.5 text-[16px] outline-none placeholder:text-[#C2C8C0] focus:border-[#14201B]"
                />
              </div>
            )}

            <div>
              <span className="mb-1.5 block text-[12.5px] font-medium text-[#3D4A44]">Offer</span>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTplId(t.id)}
                    className={`rounded-md border px-3 py-2.5 text-left text-[13.5px] transition-colors ${
                      tplId === t.id
                        ? "border-[#14201B] bg-[#14201B] text-[#F7F6F1]"
                        : "border-[#C9CEC6] bg-white text-[#3D4A44] hover:border-[#14201B]"
                    }`}
                  >
                    <div className="font-medium">{clientTypeLabel(t.client_type)}</div>
                    <div className={`mt-0.5 truncate text-[12px] ${tplId === t.id ? "text-[#C9D2CC]" : "text-[#8A928C]"}`}>
                      {t.headline ?? t.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[12.5px] font-medium text-[#3D4A44]">Urgency (bonus only)</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setUrgency("none")} className={seg(urgency === "none")}>None</button>
                <button type="button" onClick={() => setUrgency("72h")} className={seg(urgency === "72h")}>72 hours</button>
                <button type="button" onClick={() => setUrgency("7d")} className={seg(urgency === "7d")}>7 days</button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[13.5px] text-[#3D4A44]">
              <input type="checkbox" checked={batch} onChange={(e) => setBatch(e.target.checked)} />
              Apply to next 20 cards (nameless bound run)
            </label>

            {error && <p className="text-[13.5px] font-medium text-[#8A4B2F]" role="alert">{error}</p>}

            <button
              type="button"
              onClick={create}
              disabled={busy || !tplId}
              className="w-full rounded-lg bg-[#14201B] px-4 py-3 text-[15px] font-semibold text-[#F7F6F1] disabled:opacity-60"
            >
              {busy ? "Creating…" : batch ? "Create 20 codes" : "Create code"}
            </button>
          </div>
        )}
      </section>

      {/* ── Requests waiting on Juan ───────────────────────────────────── */}
      {pendingOrders.length > 0 && (
        <section>
          <h2 className="mb-3 font-[family-name:var(--font-fraunces)] text-[18px] font-semibold tracking-tight">
            Requests · waiting on you
          </h2>
          <div className="space-y-3">
            {pendingOrders.map((o) => {
              const c = codeByNorm.get(o.code_norm);
              return (
                <div key={o.id} className="rounded-lg border border-[#CBD8C6] bg-[#EFF4EC] p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-[14.5px] font-semibold">
                      {[o.company, o.contact_name].filter(Boolean).join(" · ")}
                    </div>
                    <div className="font-mono text-[12.5px] tabular-nums text-[#5B6560]">
                      {c?.display_code ?? o.code_norm} · {ago(o.created_at)}
                    </div>
                  </div>
                  <ul className="mt-1.5 text-[13px] text-[#3D4A44]">
                    {o.line_items.map((l) => (
                      <li key={l.sku}>
                        {l.qty_paid} × {l.name}
                        {l.qty_free > 0 && ` (+${l.qty_free} free)`}
                        {l.qty_paid !== l.original_qty_paid && (
                          <span className="text-[#8A6D2F]"> · edited from {l.original_qty_paid}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {o.totals && <div className="mt-1 text-[13.5px] font-semibold tabular-nums">{money(o.totals.you_pay)}</div>}
                  {o.notes && <p className="mt-1 text-[13px] text-[#5B6560]">“{o.notes}”</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c && <CopyButton text={relayText(o, c)} label="Copy relay block" />}
                    <button
                      type="button"
                      onClick={async () => {
                        await actionSetOrderState(o.id, "relayed");
                        router.refresh();
                      }}
                      className="rounded-md border border-[#C9CEC6] bg-white px-3 py-1.5 text-[13px] font-medium text-[#3D4A44] hover:border-[#14201B]"
                    >
                      Mark relayed
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Screen C: my codes ─────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 font-[family-name:var(--font-fraunces)] text-[18px] font-semibold tracking-tight">
          My codes
        </h2>
        {codes.length === 0 ? (
          <p className="text-[14px] text-[#5B6560]">Nothing issued yet.</p>
        ) : (
          <div className="divide-y divide-[#EFEDE4] rounded-lg border border-[#E2DFD5] bg-white">
            {codes.map((c) => (
              <div key={c.code_norm}>
                <button
                  type="button"
                  onClick={() => setOpenCode(openCode === c.code_norm ? null : c.code_norm)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#FAF9F4]"
                >
                  <span className="font-mono text-[14px] font-semibold tabular-nums">{c.display_code}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#5B6560]">
                    {[c.client_name, clientTypeLabel(c.snapshot.client_type)].filter(Boolean).join(" · ")}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] ${STATE_TINT[c.state]}`}>
                    {c.state}
                  </span>
                  <span className="hidden text-[12px] text-[#8A928C] sm:block">{ago(c.created_at)}</span>
                </button>

                {openCode === c.code_norm && <CodeDetail code={c} onChanged={() => router.refresh()} />}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** C2: timeline from the stamps this system actually recorded, notes, void. */
function CodeDetail({ code, onChanged }: { code: PromoCode; onChanged: () => void }) {
  const [notes, setNotes] = useState(code.rep_notes ?? "");
  const [saving, setSaving] = useState(false);

  const stamp = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  const timeline: { label: string; at: string }[] = [
    { label: "Created", at: code.created_at },
    ...(code.first_viewed_at ? [{ label: "First viewed", at: code.first_viewed_at }] : []),
    ...(code.requested_at ? [{ label: "Requested", at: code.requested_at }] : []),
  ];

  return (
    <div className="border-t border-[#EFEDE4] bg-[#FAF9F4] px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">Timeline</div>
      <ul className="mt-1.5 space-y-1 text-[13px] text-[#3D4A44]">
        {timeline.map((t) => (
          <li key={t.label} className="flex items-center gap-2">
            <Ico name="clock" size={12} />
            {t.label} {stamp(t.at)}
          </li>
        ))}
        <li className="flex items-center gap-2 text-[#8A928C]">
          <Ico name="clock" size={12} />
          Expires {stamp(code.expires_at)}
        </li>
      </ul>

      <div className="mt-3">
        <label htmlFor={`notes-${code.code_norm}`} className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
          Rep notes
        </label>
        <textarea
          id={`notes-${code.code_norm}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-[#C9CEC6] bg-white px-3 py-2 text-[13.5px] outline-none focus:border-[#14201B]"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await actionSaveNotes(code.code_norm, notes);
            setSaving(false);
            onChanged();
          }}
          className="rounded-md border border-[#C9CEC6] bg-white px-3 py-1.5 text-[13px] font-medium text-[#3D4A44] hover:border-[#14201B] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save notes"}
        </button>
        <a
          href={`/nutribiotic/promo/o/${code.code_norm}`}
          target="_blank"
          className="rounded-md border border-[#C9CEC6] bg-white px-3 py-1.5 text-[13px] font-medium text-[#3D4A44] hover:border-[#14201B]"
        >
          Open buyer page
        </a>
        {code.state !== "void" && code.state !== "requested" && (
          <button
            type="button"
            onClick={async () => {
              await actionVoidCode(code.code_norm);
              onChanged();
            }}
            className="rounded-md border border-[#E0C9C0] bg-white px-3 py-1.5 text-[13px] font-medium text-[#8A4B2F] hover:border-[#8A4B2F]"
          >
            Void this code
          </button>
        )}
      </div>
    </div>
  );
}
