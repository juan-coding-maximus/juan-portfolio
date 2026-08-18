import type { Metadata } from "next";
import Link from "next/link";
import { getRouteDraft, isConfigured, workspaceMode } from "./lib/dal";
import { LAUNCHERS } from "./lib/launchers";
import { ModalProvider } from "./lib/modal";
import { MobileNav } from "./lib/MobileNav";
import { MoreMenu } from "./lib/MoreMenu";
import { RouteProvider } from "./lib/route-context";
import { hasAccess } from "./lib/devices";
import { Ico } from "./lib/ui";

export const metadata: Metadata = {
  title: "NutriBiotic OS",
  robots: { index: false, follow: false },
  /* The manifest is declared HERE, not by a root app/manifest.ts, and that is
     the fix for three Home Screen tiles that all opened the map (2026-08-17).
     Next's root manifest convention injects one <link rel="manifest"> into every
     page of the site, and iOS 16.4+ launches whatever `start_url` it finds there
     rather than the page that was added — so one manifest meant one app. This
     one covers the OS; Visit and Expenses each override it with their own.
     See lib/launchers.ts. */
  manifest: LAUNCHERS.OS.href,
  /* Added to Home Screen, this opens standalone: no address bar, no tab strip,
     which on a phone held at a door is the difference between a tool and a web
     page. Once the tile is remembered as a device (lib/devices.ts) it is not a
     PIN prompt at all; before that it was one every eight hours, per tile, since
     each iOS web app carries its own cookie jar. Icon comes from apple-icon.tsx
     in this segment. See /nutribiotic/widget for the install steps. */
  appleWebApp: { capable: true, title: "NutriBiotic", statusBarStyle: "default" },
  /* Next 16 renders appleWebApp.capable as <meta name="mobile-web-app-capable">
     only. iOS 16.4+ honours that; everything before it looks exclusively for the
     apple-prefixed name and, not finding it, opens the tile in Safari with an
     address bar instead of standalone. One duplicated tag is cheaper than a
     launcher that quietly is not one. */
  other: { "apple-mobile-web-app-capable": "yes" },
};

// Every read is request-time; nothing here may be statically cached.
export const dynamic = "force-dynamic";

/* Nav consolidation, 2026-07-20; Today retired in favor of Plan, 2026-08-02;
   Plan retired outright 2026-08-12 (its static month itinerary was stale and
   superseded by Map's live routing; its daily-capture widgets went with it,
   Juan's call). Map is home now. Pipeline merged into Clients (it is a view
   over the same accounts, and with a pre-first-visit territory a separate
   board was empty ceremony). Route and Support keep their pages but leave the
   nav until their phases ship: a permanent nav item whose screen says "not
   built" or holds a twice-a-month log is nav noise. Nav that grows as phases
   land beats nav that promises them.

   Outbound used to appear only when a draft was waiting (the approval-gate
   rule above). 2026-08-13: it also hosts the WhatsApp composer now (wa.me
   deep-link drafts grounded in the account's last logged touchpoint, plus
   marketing/field-material attachments), and that half is a tool Juan reaches
   for on his own schedule, not a backlog notification, so Outbound moved into
   NAV proper rather than staying conditionally spliced in. Juan was explicit
   this had to be the SAME tab as the existing drafts queue, not a second one
   ([[nutribiotic-whatsapp-bridge]]).

   MORE, 2026-08-18: ten flat items ran the sidebar into a scrollbar and the
   mobile bar into ten cramped columns, so Goals, Playbook, and the offer-code
   trio (Phone, Offers, Promo) moved behind a single "More" flyout (lib/MoreMenu.tsx).
   These five are reference/occasional-use, not the daily loop Map through
   Expenses is, so folding them costs no reachability, just chrome. */
const NAV: { href: string; label: string; icon: React.ComponentProps<typeof Ico>["name"] }[] = [
  { href: "/nutribiotic/map", label: "Map", icon: "pin" },
  /* Visit, 2026-08-13: door 3 onto the shared extractor (lib/touchpoint.ts),
     typed or recorded, filing end to end the same way clientos does, Juan's
     own click on the preview standing in for the CLI skill's dry-run review.
     See lib/hubspot-engagement.ts. */
  { href: "/nutribiotic/visit", label: "Visit", icon: "mic" },
  { href: "/nutribiotic/clients", label: "Clients", icon: "accounts" },
  { href: "/nutribiotic/outbound", label: "Outbound", icon: "outbound" },
  /* Expenses, 2026-08-14: the `expensos` CLI skill's Drive/Sheets tree, now
     also reachable by hand: clock in/out with a break in minutes, a photo
     dropzone that auto-sorts odometer vs receipt, and a link to the current
     semi-monthly pay period's sheet. Writes via a service account (Vercel
     has no access to the Mac-side OAuth token the CLI uses); see lib/gdrive.ts
     and lib/expenses.ts. */
  { href: "/nutribiotic/expenses", label: "Expenses", icon: "receipt" },
];

const MORE_NAV: typeof NAV = [
  /* Goals earns its slot on the same rule the top-level items do: it is the
     standing ladder (Director in one, VP in four) and the six SMART goals it
     decomposes into, content meant to be seen every day, not a promise of a
     future phase, it just isn't a door-to-door daily tool. */
  { href: "/nutribiotic/goals", label: "Goals", icon: "flag" },
  /* Playbook is the shelf those goals produce: the strategy docs rendered from
     the repo's own markdown, so the site and the files can never disagree. */
  { href: "/nutribiotic/playbook", label: "Playbook", icon: "book" },
  /* The offer-code trio, added 2026-08-10 at Juan's direction (three tabs, all
     in the directory). Phone issues a handwritten code in a parking lot and
     holds the requests waiting on a relay; Offers is the template builder those
     codes bind to; Promo is the buyer page itself, PIN-free by design, here so
     the rep sees exactly what the buyer sees. */
  { href: "/nutribiotic/phone", label: "Phone", icon: "phone" },
  { href: "/nutribiotic/offer_builder", label: "Offers", icon: "tag" },
  { href: "/nutribiotic/promo", label: "Promo", icon: "external" },
];

export default async function NutribioticLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The layout must NOT be the gate.
  //
  // The gate page renders as a child of this layout, so any redirect-on-failure
  // here bounces the gate to itself forever. So this checks the session WITHOUT
  // redirecting, and renders the unauthenticated view bare (no nav, no data
  // reads — workspaceMode()/listDrafts() below touch the DAL, which is the real
  // gate and would redirect to /nutribiotic/gate itself if reached unauthed).
  if (!(await hasAccess())) {
    return <div className="min-h-screen bg-[#F7F6F1] text-[#14201B]">{children}</div>;
  }

  const mode = await workspaceMode();
  const synthetic = mode === "synthetic";

  const routeDraft = isConfigured() ? await getRouteDraft() : [];
  const nav = NAV;

  /* Review left the nav for good, 2026-08-02: the page stays reachable at
     /nutribiotic/review for an occasional import cleanup, same treatment as
     Route/Support, but it never surfaces here regardless of pending count. */

  return (
    <div className="min-h-screen bg-[#F7F6F1] text-[#14201B]">
      <RouteProvider initial={routeDraft}>
      <ModalProvider>
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
              <MoreMenu items={MORE_NAV} variant="sidebar" />
            </nav>

          </aside>

          {/* pb clears The OS mobile nav below md; the bar is fixed, so without
              this the last row of every screen hides behind it. */}
          <main className="min-w-0 flex-1 px-5 py-7 pb-24 md:px-9 md:pb-7">{children}</main>
        </div>

        {/* The OS mobile nav: the same items as the sidebar, same gating rules,
            rendered as a bottom tab bar below md where the sidebar disappears. */}
        <MobileNav items={nav} moreItems={MORE_NAV} />
      </div>
      </ModalProvider>
      </RouteProvider>
    </div>
  );
}
