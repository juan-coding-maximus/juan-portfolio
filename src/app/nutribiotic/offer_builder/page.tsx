/**
 * Offer builder: the backoffice that makes templates, the approved parts a
 * code can bind to. Output is a template, not a page; publishing makes it
 * selectable in the phone tab's offer grid, and editing a published template
 * bumps its version rather than rewriting pages buyers already saw (their
 * codes carry frozen snapshots regardless).
 *
 * Assembles from approved blocks only. It cannot invent a claim: the claims
 * list is fixed in code to what Juan's spec substantiates, and the locked ones
 * render visible but unselectable until substantiation shows up. Products are
 * typed in from real price sheets, never seeded or guessed.
 */
import { PageHead } from "../lib/ui";
import { listPromoProducts, listPromoTemplates } from "../lib/dal";
import { BuilderClient } from "./client";

export const metadata = { title: "Offer builder · NutriBiotic OS" };
export const dynamic = "force-dynamic";

export default async function OfferBuilderPage() {
  const [templates, products] = await Promise.all([listPromoTemplates(), listPromoProducts()]);

  return (
    <>
      <PageHead
        title="Offer builder"
        sub="Templates are the offers codes bind to: products, quantities, mechanic, terms, claims. Approved parts only; publishing puts one on the phone tab's grid."
      />
      <BuilderClient templates={templates} products={products} />
    </>
  );
}
