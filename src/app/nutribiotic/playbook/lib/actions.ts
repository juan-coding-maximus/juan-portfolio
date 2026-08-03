"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PLAYBOOK_COOKIE, PLAYBOOK_PIN } from "./pin";

export async function unlockPlaybook(formData: FormData) {
  const pin = String(formData.get("pin") ?? "").trim();
  if (pin === PLAYBOOK_PIN) {
    const jar = await cookies();
    jar.set(PLAYBOOK_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/nutribiotic/playbook",
      maxAge: 60 * 60 * 24 * 90,
    });
  }
  redirect("/nutribiotic/playbook");
}
