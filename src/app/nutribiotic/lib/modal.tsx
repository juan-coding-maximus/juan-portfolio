"use client";

/**
 * Account profiles pop up in a window over whatever list you were looking at,
 * instead of navigating away to a full page. `AccountLink` replaces every
 * plain `<Link href="/nutribiotic/account/...">` in the app; the real route
 * still exists underneath (direct visits, deep links, and modifier-clicks
 * that open a new tab all still work), it's just no longer the default way
 * in from a list.
 */

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { getAccountDetail, type AccountDetailData } from "./account-actions";
import { AccountDetailBody } from "./account-detail";
import { Ico } from "./ui";

type ModalCtx = { open: (id: string) => void };
const Ctx = createContext<ModalCtx | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [data, setData] = useState<AccountDetailData>(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback((id: string) => {
    setOpenId(id);
    setData(null);
    setLoading(true);
    getAccountDetail(id).then((res) => {
      setData(res);
      setLoading(false);
    });
  }, []);

  const close = useCallback(() => {
    setOpenId(null);
    setData(null);
  }, []);

  useEffect(() => {
    if (!openId) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [openId, close]);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {openId && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#14201B]/40 px-4 py-8 backdrop-blur-[2px] sm:py-14"
          onClick={close}
        >
          <div
            className="w-full max-w-[880px] rounded-xl border border-[#E2DFD5] bg-[#F7F6F1] shadow-2xl"
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E2DFD5] px-6 py-5">
              <div className="min-w-0">
                <h2 className="truncate font-[family-name:var(--font-fraunces)] text-[22px] leading-tight font-semibold tracking-tight">
                  {loading ? "Loading..." : (data?.account.name ?? "Not found")}
                </h2>
                {data?.account && (
                  <p className="mt-1 truncate text-[13px] text-[#5B6560]">
                    {[data.account.channel, [data.account.street, data.account.city, data.account.postal].filter(Boolean).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="shrink-0 rounded-md p-1.5 text-[#8A928C] transition-colors hover:bg-[#ECEAE1] hover:text-[#14201B]"
              >
                <Ico name="close" size={16} />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto px-6 py-6">
              {loading && <div className="py-10 text-center text-[13.5px] text-[#8A928C]">Loading account...</div>}
              {!loading && !data && (
                <div className="py-10 text-center text-[13.5px] text-[#8A928C]">Account not found.</div>
              )}
              {!loading && data && (
                <AccountDetailBody account={data.account} activities={data.activities} contacts={data.contacts} />
              )}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

function useModal(): ModalCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AccountLink must be used inside ModalProvider (see layout.tsx)");
  return ctx;
}

export function AccountLink({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const { open } = useModal();
  return (
    <Link
      href={`/nutribiotic/account/${id}`}
      className={className}
      onClick={(e) => {
        // Modifier/middle clicks keep native "open in new tab" behavior.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        open(id);
      }}
    >
      {children}
    </Link>
  );
}
