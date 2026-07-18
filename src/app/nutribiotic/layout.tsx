import type { Metadata } from "next";
import Link from "next/link";
import { workspaceMode } from "./lib/dal";
import { hasValidSession } from "./lib/session";
import { Ico } from "./lib/ui";

export const metadata: Metadata = {
  title: "NutriBiotic OS",
  robots: { index: false, follow: false },
};

// Every read is request-time and gated; nothing here may be statically cached.
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/nutribiotic", label: "Today", icon: "today" as const },
  { href: "/nutribiotic/pipeline", label: "Pipeline", icon: "pipeline" as const },
  { href: "/nutribiotic/accounts", label: "Accounts", icon: "accounts" as const },
  { href: "/nutribiotic/route", label: "Route", icon: "route" as const },
  { href: "/nutribiotic/outbound", label: "Outbound", icon: "outbound" as const },
  { href: "/nutribiotic/support", label: "Support", icon: "support" as const },
  { href: "/nutribiotic/metrics", label: "Metrics", icon: "metrics" as const },
];

export default async function NutribioticLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The layout must NOT be the gate.
  //
  // The gate page renders as a child of this layout, so any redirect-on-failure
  // here bounces the gate to itself forever. (It did exactly that: /nutribiotic/gate
  // returned a 307 to /nutribiotic/gate.) So this checks the session WITHOUT
  // redirecting, and renders the unauthenticated view bare.
  //
  // Security is unaffected. The real gate is verifySession() inside the DAL, which
  // runs at the top of every query, so a page rendered without this chrome still
  // cannot read a single row.
  if (!(await hasValidSession())) {
    return <div className="min-h-screen bg-[#F7F6F1] text-[#14201B]">{children}</div>;
  }

  const mode = await workspaceMode();
  const synthetic = mode === "synthetic";

  return (
    <div
      className="min-h-screen bg-[#F7F6F1] text-[#14201B]"
      style={
        synthetic
          ? {
              // Hazard frame. Mode-level rather than per-row: row badges get
              // visually banked out within a week, but a striped viewport edge
              // survives familiarity AND survives a cropped screenshot, which is
              // how a number actually escapes into a conversation.
              boxShadow: "inset 0 0 0 6px transparent",
              backgroundImage:
                "repeating-linear-gradient(45deg,#E8A33D 0 14px,#14201B 14px 28px)",
              padding: 6,
            }
          : undefined
      }
    >
      <div className="min-h-screen bg-[#F7F6F1]">
        {synthetic && (
          <div className="bg-[#E8A33D] px-4 py-2 text-center text-[13px] font-semibold uppercase tracking-[0.14em] text-[#14201B]">
            Synthetic data · not real accounts · nothing here may be sent, exported, or reported
          </div>
        )}

        {mode === "empty" && (
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
              {NAV.map((n) => (
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

            <form action="/nutribiotic/api/auth" method="post" className="mt-10">
              <Link
                href="/nutribiotic/gate"
                className="text-[12px] text-[#8A928C] underline-offset-2 hover:underline"
              >
                Lock
              </Link>
            </form>
          </aside>

          <main className="min-w-0 flex-1 px-5 py-7 md:px-9">{children}</main>
        </div>
      </div>
    </div>
  );
}
