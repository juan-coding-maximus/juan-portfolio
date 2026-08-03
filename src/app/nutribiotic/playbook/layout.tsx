/**
 * Playbook gate. Checks the unlock cookie before rendering the index or any
 * document; wrong or missing PIN just lands back on this same locked screen,
 * which is feedback enough without a separate error path.
 */

import { cookies } from "next/headers";
import { Card, Ico, PageHead } from "../lib/ui";
import { unlockPlaybook } from "./lib/actions";
import { PLAYBOOK_COOKIE } from "./lib/pin";

export default async function PlaybookLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const unlocked = jar.get(PLAYBOOK_COOKIE)?.value === "1";

  if (!unlocked) {
    return (
      <>
        <PageHead title="Playbook" sub="PIN-gated. Enter the code to open the shelf." />
        <Card className="max-w-[340px]">
          <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#8A928C]">
            <Ico name="book" size={13} />
            Enter PIN
          </div>
          <form action={unlockPlaybook} className="flex items-center gap-2">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              name="pin"
              maxLength={8}
              autoFocus
              placeholder="····"
              className="w-full rounded-md border border-[#E2DFD5] bg-[#FAF9F5] px-3 py-2 text-[16px] tracking-[0.35em] text-[#14201B] placeholder:tracking-normal placeholder:text-[#A9AFA9] focus:border-[#14201B] focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-[#14201B] px-3.5 py-2 text-[13px] font-medium text-[#F7F6F1] transition-opacity hover:opacity-90"
            >
              Unlock
            </button>
          </form>
        </Card>
      </>
    );
  }

  return <>{children}</>;
}
