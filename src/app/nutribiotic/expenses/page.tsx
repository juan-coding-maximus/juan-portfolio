/**
 * Expenses. UI onto the same Drive/Sheets tree the `expensos` CLI skill
 * files into: clock in/out with a break in minutes, and a photo dropzone
 * that auto-sorts odometer vs receipt vs statement. See lib/expenses.ts for
 * the filing logic and ExpensesClient.tsx for the form.
 */

import { ExpensesClient } from "./ExpensesClient";
import { PageHead } from "../lib/ui";

export const dynamic = "force-dynamic";
/* appleWebApp.title names the Home Screen icon when this exact screen is the
   one added: an "Expenses" tile that lands on clock-in, not a second "NutriBiotic"
   tile that lands on the map. See /nutribiotic/widget for the install steps. */
export const metadata = {
  title: "Expenses · NutriBiotic OS",
  /* ExpensOS on the Home Screen, Juan's own name for it and the same word the
     CLI skill answers to. The tile wears NutriBiotic's real logo (apple-icon.png
     in this folder), not a generated mark: this is the one screen he opens in a
     parking lot with a receipt in his hand, and it should look like the company
     he is doing it for. */
  appleWebApp: { title: "ExpensOS" },
};

export default function ExpensesPage() {
  return (
    <>
      <PageHead
        title="Expenses"
        sub="Clock in and out, log a break, and drop in a photo. It sorts itself into a receipt or an odometer reading, you confirm the fields, and it files straight into this pay period's sheet."
      />
      <ExpensesClient />
    </>
  );
}
