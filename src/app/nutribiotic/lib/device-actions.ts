"use server";

import { revalidatePath } from "next/cache";
import { revokeDevice, trustedDeviceId } from "./devices";
import { verifySession } from "./dal";

/**
 * Stop trusting a device.
 *
 * GATED like every other write here: verifySession() first, so this cannot be
 * reached by anyone who is not already inside the OS. Revoking is deliberately
 * NOT dangerous in the other direction — the worst case is Juan typing his PIN
 * once on a phone he still owns.
 *
 * The row is marked, never deleted, so a revoked device that keeps trying is
 * still visible on the list.
 */
export async function forgetDevice(id: string): Promise<void> {
  await verifySession();
  await revokeDevice(id);
  revalidatePath("/nutribiotic/devices");
}

/** Which row is the browser asking, so the list can say "this device" and think
 *  twice before revoking it. */
export async function currentDeviceId(): Promise<string | null> {
  await verifySession();
  return trustedDeviceId();
}
