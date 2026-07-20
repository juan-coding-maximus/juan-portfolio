import type { Metadata } from "next";
import Link from "next/link";
import { isConfigured, listDrafts, workspaceMode } from "./lib/dal";
import { Ico } from "./lib/ui";

export const metadata: Metadata = {
  title: "NutriBiotic OS",
  robots: { index: false, follow: false },
};

// Every read is request-time; nothing here may be statically cached.
export const dynamic = "force-dynamic";

/* Nav consolidation, 2026-07-20. Seven tabs -> four. Pipeline merged into
   Territory (it is a view over the same accounts, and with a pre-first-visit
   territory a separate board was empty ceremony). Route and Support keep their
   pages but leave the nav until their phases ship: a permanent nav item whose
   screen says "not built" or holds a twice-a-month log is nav noise. They are
   reachable from Today. Outbound is the approval gate, so it appears exactly
   when something is waiting on a human and not before. Nav that grows as
   phases land beats nav that promises them. */
const NAV: { href: string; label: string; icon: React.ComponentProps<typeof Ico>["name"] }[] = [
  { href: "/nutribiotic", label: "Today", icon: "today" },
  { href: "/nutribiotic/accounts", label: "Territory", icon: "accounts" },
  { href: "/nutribiotic/metrics", label: "Metrics", icon: "metrics" },
];

export default async function NutribioticLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const mode = await workspaceMode();
  const synthetic = mode === "synthetic";

  const drafts = isConfigured() ? await listDrafts(1) : { data: [] };
  const nav = [...NAV];
  if (drafts.data.length > 0) {
    nav.splice(2, 0, { href: "/nutribiotic/outbound", label: "Outbound", icon: "outbound" });
  }

  return (
    <div className="min-h-screen bg-[#F7F6F1] text-[#14201B]">
      <div className="min-h-screen bg-[#F7F6F1]">
        {/* Synthetic-data signal, redesigned 2026-07-18.
            The hazard tape was correct in substance and ugly in practice, and an
            ugly warning gets ignored or removed, which is worse than a quiet one
            that survives. This keeps the guarantee (mode-level, not a per-row
            badge, still impossible to miss on a cropped screenshot because it
            sits above the content) and drops the stripes. */}
        {synthetic && (
          <div className="flex items-center justify-center gap-2 border-b border-[#E5D9BF] bg-[#FBF6E9] px-4 py-1.5 text-[12px] text-[#8A6D2F]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#C9A24B]" aria-hidden />
            Sample data. Not real accounts, and nothing here can be sent or reported.
          </div>
        )}

        {/* Only shown when the backend is genuinely unwired. An empty RESULT is
            not the same as an empty SYSTEM, and saying "not configured" over a
            working tool that simply has nothing logged yet trains the user to
            distrust the banner. */}
        {!isConfigured() && (
          <div className="border-b border-[#D8D4C8] bg-[#EFEDE4] px-4 py-2 text-center text-[13px] text-[#5B6560]">
            No data source configured. Nothing is being shown, and nothing is being guessed.
          </div>
        )}

        <div className="mx-auto flex min-h-screen max-w-[1400px] gap-0">
          <aside className="hidden w-[210px] shrink-0 border-r border-[#E2DFD5] px-5 py-7 md:block">
            <div className="mb-8">
              <div className="font-[family-name:var(--font-fraunces)] text-[19px] leading-none font-semibold tracking-tight">
                NutriBiotic
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#8A928C]">
                Field Sales OS
              </div>
            </div>

            <nav className="flex flex-col gap-0.5">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] text-[#3D4A44] transition-colors hover:bg-[#ECEAE1] hover:text-[#14201B]"
                >
                  <Ico name={n.icon} />
                  {n.label}
                </Link>
              ))}
            </nav>

          </aside>

          <main className="min-w-0 flex-1 px-5 py-7 md:px-9">{children}</main>
        </div>
      </div>
    </div>
  );
}
