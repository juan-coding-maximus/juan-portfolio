/**
 * Home screen. Two things that put the OS on Juan's phone without a browser
 * around it: the route as a real WidgetKit widget, and Visit as an icon.
 *
 * NOT called "Phone", which is already a nav tab and a different thing (the
 * offer-code screen a rep works from in a parking lot).
 *
 * WHY THE TOKEN IS RENDERED HERE. The widget has to carry a bearer, and the
 * ways to hand Juan a secret are all bad except one: paste it into a chat (it
 * lands in a transcript), commit it (it lands in a public repo), or read it off
 * a page that already required the PIN to open. This is the third. The value is
 * NB_WIDGET_TOKEN, which buys exactly one read (see lib/session.ts) and rotates
 * in Vercel without logging him out of anything.
 *
 * NOT IN THE NAV, on the same rule Review follows: this is an install screen
 * read twice, not a tool used daily.
 */

import { Card, Ico, PageHead } from "../lib/ui";
import { CopyBlock } from "./CopyBlock";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home screen · NutriBiotic OS" };

const SITE = "https://juanarenas.bio";

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#14201B] text-[11.5px] font-semibold tabular-nums text-[#F7F6F1]">
        {n}
      </span>
      <div className="min-w-0 flex-1 pb-5">
        <div className="text-[14px] font-medium leading-snug">{title}</div>
        {children && <div className="mt-1.5 text-[13px] leading-relaxed text-[#5B6560]">{children}</div>}
      </div>
    </li>
  );
}

export default async function WidgetSetupPage() {
  const token = process.env.NB_WIDGET_TOKEN ?? null;

  /* The whole script Juan pastes. It holds the secret and fetches the drawing
     code from the deploy, so the widget can be redesigned without him ever
     opening Scriptable again. */
  const bootstrap = token
    ? [
        `const NB = {`,
        `  base: "${SITE}",`,
        `  token: "${token}",`,
        `};`,
        `const src = await new Request(NB.base + "/nb-widget.js").loadString();`,
        `await new Function("NB", "return (async () => {" + src + "})()")(NB);`,
      ].join("\n")
    : null;

  return (
    <>
      <PageHead
        title="Home screen"
        sub="The route as a widget, and Visit as an icon. Both point at this OS; neither is a second copy of it."
      />

      <div className="flex max-w-[720px] flex-col gap-9">
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
            Route widget
          </h2>

          <Card>
            <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-[#5B6560]">
              A real home-screen widget, drawn by WidgetKit, showing the route exactly as the map
              shows it: your stops, your order, the trading facts, the straight-line legs. Tapping a
              stop opens turn-by-turn to it. It refreshes about every fifteen minutes and whenever
              iOS decides to; it never reorders anything and never invents a drive time.
            </p>

            {!token ? (
              <div className="mt-4 rounded-md border border-[#E5D9BF] bg-[#FBF6E9] px-3.5 py-3 text-[13px] leading-relaxed text-[#8A6D2F]">
                NB_WIDGET_TOKEN is not set on this deployment, so there is no token to install and
                the widget endpoint will refuse every request. Nothing here is being guessed.
              </div>
            ) : (
              <ol className="mt-5 list-none">
                <Step n={1} title="Install Scriptable from the App Store">
                  Free, by Simon Støvring. It is what renders the widget; the design and the data
                  are this OS&apos;s, not its.
                </Step>
                <Step n={2} title="Open Scriptable, tap +, and paste this in">
                  <div className="mt-2.5">
                    <CopyBlock code={bootstrap!} label="Scriptable script" />
                  </div>
                  <p className="mt-2.5">
                    Name it <span className="font-medium text-[#3D4A44]">NutriBiotic Route</span>.
                    It carries your widget token, so treat the script the way you treat the PIN.
                  </p>
                </Step>
                <Step n={3} title="Long-press the home screen, add a Scriptable widget">
                  Choose the size you want, then tap the placed widget once and set{" "}
                  <span className="font-medium text-[#3D4A44]">Script</span> to NutriBiotic Route and{" "}
                  <span className="font-medium text-[#3D4A44]">When Interacting</span> to{" "}
                  <span className="font-medium text-[#3D4A44]">Run Script</span>.
                </Step>
                <Step n={4} title="Pick the size for what you want to see">
                  <span className="font-medium text-[#3D4A44]">Small</span> is the next stop alone.{" "}
                  <span className="font-medium text-[#3D4A44]">Medium</span> is the next stop with its
                  numbers plus a peek at the two after it.{" "}
                  <span className="font-medium text-[#3D4A44]">Large</span> is up to seven stops with
                  the facts that decide one at the curb. The Lock Screen rectangle shows the next
                  stop and the count.
                </Step>
              </ol>
            )}
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
            Visit icon
          </h2>

          <Card>
            <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-[#5B6560]">
              Straight to the capture screen, no browser chrome, no tab to find. Safari&apos;s Add to
              Home Screen beats a Shortcut here for one reason: a Shortcut flashes the Shortcuts app
              on the way through, and this opens the screen directly.
            </p>

            <ol className="mt-5 list-none">
              <Step n={1} title="Open the Visit screen in Safari on the phone">
                <a
                  href="/nutribiotic/visit"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
                >
                  <Ico name="mic" size={13} />
                  {SITE}/nutribiotic/visit
                </a>
              </Step>
              <Step n={2} title="Share, then Add to Home Screen">
                Name it <span className="font-medium text-[#3D4A44]">Visit</span>. It opens full
                screen with the OS&apos;s own icon and keeps the eight-hour session, so it is not a
                PIN prompt every morning.
              </Step>
              <Step n={3} title="If you would rather have a Shortcut">
                Shortcuts app, +, add the <span className="font-medium text-[#3D4A44]">Open URLs</span>{" "}
                action, paste <span className="font-medium text-[#3D4A44]">{SITE}/nutribiotic/visit</span>,
                then Share to Home Screen. Same destination, one extra flash of the Shortcuts app on
                the way.
              </Step>
            </ol>
          </Card>
        </section>
      </div>
    </>
  );
}
