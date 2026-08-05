"use server";

import { revalidatePath } from "next/cache";
import { setShowChainAccounts, setShowPracticeAccounts } from "./dal";

/** The map's "chains" button. Persists to nb_ui_prefs (see migration 0024)
 * rather than client state, so the undo Juan asked to be semi-permanent
 * actually survives a reload and follows him to his other device. */
export async function toggleShowChainAccounts(show: boolean): Promise<void> {
  await setShowChainAccounts(show);
  revalidatePath("/nutribiotic/map");
}

/** Same as toggleShowChainAccounts, for the map's "practices" button
 * (single-practitioner offices, channel = 'clinic'). See migration 0025. */
export async function toggleShowPracticeAccounts(show: boolean): Promise<void> {
  await setShowPracticeAccounts(show);
  revalidatePath("/nutribiotic/map");
}
