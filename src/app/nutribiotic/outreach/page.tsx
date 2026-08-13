import { listMarketingFiles, listOwnerAccounts, listOwnerContactPhones } from "../lib/dal";
import { OutreachComposer } from "../lib/outreach-ui";
import { Card } from "../lib/ui";

export const metadata = { title: "Outreach · NutriBiotic OS" };

/**
 * A client's WhatsApp message drafted and opened via a wa.me deep link, never
 * sent by anything but Juan's own tap in WhatsApp. See
 * bridges/whatsapp/WHATSAPP_CONFIG.md for why that boundary is drawn here:
 * there is no WhatsApp Business API in this agency, click-to-chat is the
 * officially supported, zero-setup, zero-ban-risk mechanism for a pre-filled
 * draft, and it is what "deep link with the draft already made" actually
 * means on WhatsApp's own platform.
 */
export default async function OutreachPage() {
  const [accountsResult, contacts, files] = await Promise.all([
    listOwnerAccounts(),
    listOwnerContactPhones(),
    listMarketingFiles(),
  ]);

  const accounts = accountsResult.data
    .map((a) => ({ id: a.id, name: a.name, phone: a.phone, city: a.city }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-[19px] font-medium text-[#14201B]">Outreach</h1>
        <p className="mt-1 text-[13px] text-[#8A928C]">
          Draft a WhatsApp message, open it pre-filled in WhatsApp, send it yourself. Marking it sent files it
          to the OS right away and queues the HubSpot Note.
        </p>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <p className="text-[13px] text-[#8A928C]">No accounts loaded yet.</p>
        </Card>
      ) : (
        <OutreachComposer accounts={accounts} contacts={contacts} files={files} />
      )}
    </div>
  );
}
