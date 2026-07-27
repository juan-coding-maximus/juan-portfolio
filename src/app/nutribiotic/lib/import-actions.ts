"use server";

import { revalidatePath } from "next/cache";
import { setImportDecision, type ImportDecision } from "./dal";

/**
 * The human gate on the import path.
 *
 * Mirrors decideCalendarProposal exactly, and for the same reason: the click
 * RECORDS a decision, it does not execute one. Nothing reaches nb_accounts here.
 * bridges/nutribiotic/promote_import.py is what applies decided rows, run
 * deliberately from a terminal.
 *
 * That separation is doing real work. A merge silently fuses two stores'
 * histories and poisons both accounts' scores with no error raised
 * (import_data.py:5-13), so the irreversible step must not be one mis-tap away
 * on a phone in a parking lot. Deciding is cheap and reversible; applying is
 * neither, and they are therefore different actions in different places.
 */
export async function decideImportRow(id: number, decision: ImportDecision) {
  await setImportDecision(id, decision);
  revalidatePath("/nutribiotic/review");
}
