"use client";

/**
 * The "More" nav item, 2026-08-18: Goals, Playbook, Phone, Offers, and Promo
 * consolidated here so the primary nav (sidebar and mobile bar alike) stops
 * growing a column per phase. Same active-state rule as the items it holds:
 * the trigger itself lights up when any child route is open, so leaving the
 * flyout closed never hides where you are.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Ico } from "./ui";
import type { MobileNavItem } from "./MobileNav";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MoreMenu({
  items,
  variant,
}: {
  items: MobileNavItem[];
  variant: "sidebar" | "mobile";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = items.some((n) => isActive(pathname, n.href));

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (variant === "sidebar") {
    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] transition-colors hover:bg-[#ECEAE1] hover:text-[#14201B] ${
            active ? "text-[#14201B]" : "text-[#3D4A44]"
          }`}
        >
          <Ico name="more" />
          More
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-[190px] rounded-md border border-[#E2DFD5] bg-white py-1.5 shadow-[0_8px_24px_rgba(20,32,27,0.12)]">
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2.5 px-3 py-2 text-[14px] transition-colors hover:bg-[#ECEAE1] hover:text-[#14201B] ${
                  isActive(pathname, n.href) ? "text-[#14201B]" : "text-[#3D4A44]"
                }`}
              >
                <Ico name={n.icon} />
                {n.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative flex flex-col items-center">
      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-[180px] rounded-md border border-[#E2DFD5] bg-white py-1.5 shadow-[0_8px_24px_rgba(20,32,27,0.16)]">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors ${
                isActive(pathname, n.href) ? "text-[#14201B]" : "text-[#3D4A44]"
              }`}
            >
              <Ico name={n.icon} size={16} />
              {n.label}
            </Link>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium tracking-wide transition-colors ${
          active || open ? "text-[#14201B]" : "text-[#8A928C]"
        }`}
      >
        <span
          aria-hidden
          className={`-mt-2.5 mb-0.5 h-[2px] w-7 rounded-full ${
            active ? "bg-[#2C6A46]" : "bg-transparent"
          }`}
        />
        <Ico name="more" size={17} />
        More
      </button>
    </div>
  );
}
