/**
 * Home screen. The ways the OS reaches Juan's phone without a browser around
 * it: the route as a real WidgetKit widget, and ClientOS and ExpensOS as icons.
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

/**
 * One screen, one Home Screen tile.
 *
 * ADD TO HOME SCREEN, NOT A SHORTCUT, and the difference is visible every time:
 * a Shortcut flashes the Shortcuts app on the way through and lands in Safari
 * with an address bar, while this opens the screen itself, full bleed, with its
 * own icon. Same destination, one of them feels like the app it is.
 *
 * Each launchable screen carries its own apple-icon.png beside its page, so two
 * of these sitting side by side are not two identical tiles. Both are the real
 * NutriBiotic mark; the ground is what tells them apart. See apple-icon.tsx at
 * the segment root for why.
 */
function Launcher({
  heading,
  name,
  path,
  icon,
  blurb,
}: {
  heading: string;
  name: string;
  path: string;
  icon: React.ComponentProps<typeof Ico>["name"];
  blurb: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A928C]">
        {heading}
      </h2>

      <Card>
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-[#5B6560]">
          {blurb} No browser chrome, no tab to find.
        </p>

        <ol className="mt-5 list-none">
          <Step n={1} title={`Open ${name} in Safari on the phone`}>
            <a
              href={path}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
            >
              <Ico name={icon} size={13} />
              {SITE}
              {path}
            </a>
          </Step>
          <Step n={2} title="Share, then Add to Home Screen">
            Name it <span className="font-medium text-[#3D4A44]">{name}</span>. It opens full screen
            with its own icon and keeps the eight-hour session, so it is not a PIN prompt every
            morning.
          </Step>
          <Step n={3} title="If you would rather have a Shortcut">
            Shortcuts app, +, add the{" "}
            <span className="font-medium text-[#3D4A44]">Open URLs</span> action, paste{" "}
            <span className="font-medium text-[#3D4A44]">
              {SITE}
              {path}
            </span>
            , then Share to Home Screen. Same destination, one extra flash of the Shortcuts app on
            the way.
          </Step>
        </ol>
      </Card>
    </section>
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
        sub="The route as a widget, ClientOS and ExpensOS as icons. All three point at this OS; none is a second copy of it."
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
              stop opens turn-by-turn to it. It asks iOS to redraw every two minutes, which iOS
              honours on its own budget, so the widget prints the time it read the route rather than
              implying it is live. It never reorders anything and never invents a drive time.
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
                <Step n={2} title="Copy the script, then open a blank one in Scriptable">
                  <div className="mt-2.5">
                    <CopyBlock code={bootstrap!} label="Scriptable script" secret={token} />
                  </div>
                  {/* scriptable:///add opens a NEW empty script, ready to paste
                      into. The URL scheme cannot carry the source itself (only
                      /open and /run take parameters), so the clipboard is still
                      how the code travels; this just removes the app-switch and
                      the tap on +. */}
                  <a
                    href="scriptable:///add"
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-[#E2DFD5] bg-white px-3 py-2 text-[12.5px] font-medium text-[#3D4A44] transition-colors hover:bg-[#FAF9F5]"
                  >
                    <Ico name="external" size={13} />
                    Open a new script in Scriptable
                  </a>
                  <p className="mt-2.5">
                    Long-press the empty editor, Paste, then name it{" "}
                    <span className="font-medium text-[#3D4A44]">NutriBiotic Route</span> and tap Done.
                    It carries your widget token, so treat the script the way you treat the PIN.
                  </p>
                </Step>
                <Step n={3} title="Long-press the home screen, add a Scriptable widget">
                  Tap <span className="font-medium text-[#3D4A44]">+</span> at the top left, search
                  Scriptable, pick a size, Add Widget. Then tap the placed widget once and set{" "}
                  <span className="font-medium text-[#3D4A44]">Script</span> to NutriBiotic Route and{" "}
                  <span className="font-medium text-[#3D4A44]">When Interacting</span> to{" "}
                  <span className="font-medium text-[#3D4A44]">Run Script</span>. The GO, Call and See
                  account buttons keep working under that setting: a URL set on a button always wins
                  over the script-running behaviour.
                </Step>
                <Step n={4} title="Pick the size for what you want to see">
                  <span className="font-medium text-[#3D4A44]">Small</span> is the next stop alone, and
                  the whole tile is one GO button, because iOS allows a small widget exactly one tap
                  target.{" "}
                  <span className="font-medium text-[#3D4A44]">Medium</span> is the next stop with its
                  numbers, its three buttons, and a peek at the two after it.{" "}
                  <span className="font-medium text-[#3D4A44]">Large</span> is four stops with the
                  facts that decide one at the curb. The Lock Screen rectangle shows the next stop and
                  the count.
                </Step>
              </ol>
            )}
          </Card>
        </section>

        <Launcher
          heading="ClientOS icon"
          name="ClientOS"
          path="/nutribiotic/visit"
          icon="mic"
          blurb="Straight to the capture screen, typed or recorded, the same act the clientos keyword performs."
        />

        <Launcher
          heading="ExpensOS icon"
          name="ExpensOS"
          path="/nutribiotic/expenses"
          icon="receipt"
          blurb="Straight to clock in and out and the photo dropzone, which is the whole point of it: a receipt gets filed in the parking lot or it does not get filed."
        />
      </div>
    </>
  );
}
