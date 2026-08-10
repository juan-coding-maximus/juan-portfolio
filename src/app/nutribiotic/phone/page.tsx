/**
 * Phone: the parking-lot code generator. Under five seconds, one hand: pick an
 * offer, type a first name, get a code to hand-write on the card. Below it,
 * every code issued (with its viewed/requested timeline) and every request
 * waiting to be relayed to the orders team, relay block one copy away.
 *
 * Sending stays human: this screen composes the relay text, Juan pastes it
 * into his own email. Nothing here sends anything.
 */
import { PageHead } from "../lib/ui";
import { listPromoCodes, listPromoOrders, listPromoTemplates } from "../lib/dal";
import { PhoneClient } from "./client";

export const metadata = { title: "Phone · NutriBiotic OS" };
export const dynamic = "force-dynamic";

export default async function PhonePage() {
  const [templates, codes, orders] = await Promise.all([
    listPromoTemplates(),
    listPromoCodes(),
    listPromoOrders(),
  ]);

  return (
    <>
      <PageHead
        title="Phone"
        sub="Issue a handwritten offer code in the parking lot, watch it get viewed and requested, and copy the relay block when an order comes in. Codes are voided, never deleted."
      />
      <PhoneClient
        templates={templates.filter((t) => t.active && !t.is_general)}
        codes={codes}
        orders={orders}
        origin={process.env.NB_PUBLIC_ORIGIN ?? "https://juanarenas.bio"}
      />
    </>
  );
}
