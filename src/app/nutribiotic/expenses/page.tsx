/**
 * Expenses. UI onto the same Drive/Sheets tree the `expensos` CLI skill
 * files into: clock in/out with a break in minutes, and a photo dropzone
 * that auto-sorts odometer vs receipt vs statement. See lib/expenses.ts for
 * the filing logic and ExpensesClient.tsx for the form.
 */

import { ExpensesClient } from "./ExpensesClient";
import { PageHead } from "../lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expenses · NutriBiotic OS" };

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
