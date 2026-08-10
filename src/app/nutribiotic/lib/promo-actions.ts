"use server";

/**
 * Server actions for the two rep-side promo surfaces. Thin by design: every
 * one delegates to the gated DAL, so the phone tab and the builder cannot
 * drift from each other or from the session gate.
 */

import { revalidatePath } from "next/cache";
import {
  createPromoCode,
  savePromoCodeNotes,
  setPromoOrderState,
  upsertPromoProduct,
  upsertPromoTemplate,
  voidPromoCode,
} from "./dal";
import type { PromoCode, PromoProduct, TemplateBlocks } from "./promo";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : String(e),
});

export async function actionCreateCode(opts: {
  template_id: string;
  client_name: string | null;
  client_company?: string | null;
  urgency: "none" | "72h" | "7d";
  rep_notes?: string | null;
  /** Bound run: issue N nameless codes in one go ("apply to next 20 cards"). */
  batch?: number;
}): Promise<ActionResult<PromoCode[]>> {
  try {
    const n = Math.min(Math.max(opts.batch ?? 1, 1), 20);
    const codes: PromoCode[] = [];
    for (let i = 0; i < n; i++) {
      codes.push(
        await createPromoCode({
          template_id: opts.template_id,
          client_name: n > 1 ? null : opts.client_name,
          client_company: opts.client_company,
          urgency: opts.urgency,
          rep_notes: opts.rep_notes,
        }),
      );
    }
    revalidatePath("/nutribiotic/phone");
    return { ok: true, data: codes };
  } catch (e) {
    return fail(e);
  }
}

export async function actionVoidCode(code_norm: string): Promise<ActionResult> {
  try {
    await voidPromoCode(code_norm);
    revalidatePath("/nutribiotic/phone");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function actionSaveNotes(code_norm: string, notes: string): Promise<ActionResult> {
  try {
    await savePromoCodeNotes(code_norm, notes);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function actionSetOrderState(
  id: string,
  state: "new" | "reviewed" | "relayed" | "closed",
): Promise<ActionResult> {
  try {
    await setPromoOrderState(id, state);
    revalidatePath("/nutribiotic/phone");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function actionSaveTemplate(t: {
  id?: string;
  name: string;
  client_type: string;
  headline: string | null;
  subhead: string | null;
  body_blocks: TemplateBlocks;
  show_margin: boolean;
  bonus_label: string | null;
  is_general: boolean;
  active: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const saved = await upsertPromoTemplate(t);
    revalidatePath("/nutribiotic/offer_builder");
    return { ok: true, data: { id: saved.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function actionSaveProduct(
  p: Omit<PromoProduct, "id"> & { id?: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    const saved = await upsertPromoProduct(p);
    revalidatePath("/nutribiotic/offer_builder");
    return { ok: true, data: { id: saved.id } };
  } catch (e) {
    return fail(e);
  }
}
