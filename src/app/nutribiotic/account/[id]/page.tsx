/**
 * Account detail. The screen read in the car before walking in.
 *
 * This is the deep-linkable, direct-visit version. From inside the app, every
 * list opens the same content in a pop-up window instead (see lib/modal.tsx);
 * this route stays live for bookmarks, shared links, and modifier-clicks that
 * open a new tab.
 */

import { notFound } from "next/navigation";
import { getAccount, listActivities, listContacts, listPurchases } from "../../lib/dal";
import { AccountDetailBody } from "../../lib/account-detail";
import { PageHead, realChannel } from "../../lib/ui";

export const dynamic = "force-dynamic";

export default async function AccountDetail({
  params,
}: {
  // Next 16: route params arrive as a Promise.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [acc, acts, contacts, purchases] = await Promise.all([
    getAccount(id),
    listActivities(id),
    listContacts(id),
    listPurchases(id),
  ]);
  const a = acc.data[0];
  if (!a) notFound();

  return (
    <>
      <PageHead
        title={a.name}
        sub={[realChannel(a.channel), [a.street, a.city, a.postal].filter(Boolean).join(", ")]
          .filter(Boolean)
          .join(" · ")}
      />
      <AccountDetailBody
        account={a}
        activities={acts.data}
        contacts={contacts.data}
        orders={purchases.orders}
        lines={purchases.lines}
      />
    </>
  );
}
