"use server";

import { revalidatePath } from "next/cache";
import { setRouteDraft, setShowChainAccounts, setShowPracticeAccounts, type RouteDraftEntry } from "./dal";

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

/**
 * Save the hand-built route (migration 0029). The whole ordered list every
 * time, because that is what an add / reorder / remove each produce and it
 * keeps the client and the row from ever disagreeing about position.
 *
 * DELIBERATELY NO revalidatePath. The route panel is optimistic: the click
 * already moved the stop on screen, and re-rendering the server component
 * would throw the map's pan, zoom and open InfoWindow away every time Juan
 * nudged a stop. The row is the durable copy, the screen is already right.
 */
export async function saveRouteDraft(entries: RouteDraftEntry[]): Promise<void> {
  await setRouteDraft(entries);
}
