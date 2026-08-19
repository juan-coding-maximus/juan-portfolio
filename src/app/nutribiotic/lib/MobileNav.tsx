"use client";

/**
 * The OS mobile nav.
 *
 * Until now the OS had NO navigation on a phone: the sidebar is hidden below
 * md and nothing replaced it, so every screen was a dead end in the field,
 * which is exactly where this app is used. This is a fixed bottom tab bar,
 * thumb-reachable one-handed at a car door, with the same items the sidebar
 * carries so there is one nav model, not two.
 *
 * It is a client component only for usePathname (the active state); the item
 * list stays owned by the server layout so gates like Outbound keep their
 * appear-only-when-waiting rule in one place.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ico } from "./ui";
import { MoreMenu } from "./MoreMenu";

export type MobileNavItem = {
  href: string;
  label: string;
  icon: React.ComponentProps<typeof Ico>["name"];
};

export function MobileNav({
  items,
  moreItems = [],
}: {
  items: MobileNavItem[];
  moreItems?: MobileNavItem[];
}) {
  const pathname = usePathname();
  const columns = items.length + (moreItems.length ? 1 : 0);
  return (
    <nav
      aria-label="The OS mobile nav"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E2DFD5] bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {items.map((n) => {
          const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[64px] flex-col items-center justify-center gap-1.5 py-3 text-[11.5px] font-medium tracking-wide transition-colors ${
                active ? "text-[#14201B]" : "text-[#8A928C]"
              }`}
            >
              {/* The active signal is a filled top hairline plus ink, readable in
                  sunlight on a phone; color alone would be too quiet at this size. */}
              <span
                aria-hidden
                className={`-mt-3 mb-0.5 h-[2px] w-8 rounded-full ${
                  active ? "bg-[#2C6A46]" : "bg-transparent"
                }`}
              />
              <Ico name={n.icon} size={22} />
              {n.label}
            </Link>
          );
        })}
        {moreItems.length > 0 && <MoreMenu items={moreItems} variant="mobile" />}
      </div>
    </nav>
  );
}
