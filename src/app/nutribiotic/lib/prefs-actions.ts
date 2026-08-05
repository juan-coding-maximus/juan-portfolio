"use server";

import { revalidatePath } from "next/cache";
import { setShowChainAccounts } from "./dal";

/** The map's "chains" button. Persists to nb_ui_prefs (see migration 0024)
 * rather than client state, so the undo Juan asked to be semi-permanent
 * actually survives a reload and follows him to his other device. */
export async function toggleShowChainAccounts(show: boolean): Promise<void> {
  await setShowChainAccounts(show);
  revalidatePath("/nutribiotic/map");
}
