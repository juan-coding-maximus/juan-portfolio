// src/app/page.tsx — Juan Arenas portfolio v1
// Archetypes: MAGICIAN (complexity → systems that feel like magic) + HERO (scrappy, treats it like his own).
// Palette: ink #13201A · cream #F2EFE6 · forest #284A3C · sage #9FC4AE · gold #C9A24B
// Fonts: Fraunces (display) + Hanken Grotesk (body) — loaded in layout.tsx

"use client";

import { useEffect, useRef, useState } from "react";

/* ---------- scroll reveal hook ---------- */
function useReveal(threshold = 0.18) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setShown(true),
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, shown };
}

/* ---------- animated count-up ---------- */
function CountUp({
  to,
  prefix = "",
  suffix = "",
}: {
  to: number;
  prefix?: string;
  suffix?: string;
}) {
  const { ref, shown } = useReveal();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!shown) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, to]);
  return (
    <span ref={ref}>
      {prefix}
      {n}
      {suffix}
    </span>
  );
}

/* ---------- reveal wrapper ---------- */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, shown } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ====================================================
   PAGE
==================================================== */
export default function Page() {
  return (
    <main className="bg-[#13201A] text-[#F2EFE6] font-body antialiased overflow-x-hidden">
      <Hero />
      <MetricWall />
      <BrandStrip />
      <CaseStudies />
      <Capabilities />
      <GTMFramework />
      <AIStack />
      <AskMyClone />
      <Testimonials />
      <About />
      <CTA />
      <Footer />
    </main>
  );
}

/* ====================================================
   1. HERO
==================================================== */
function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center px-6 md:px-12 lg:px-20 py-20 overflow-hidden">
      {/* video bg + scrim */}
      <div className="absolute inset-0 -z-10">
        <video
          className="w-full h-full object-cover opacity-40"
          autoPlay
          muted
          loop
          playsInline
          poster="/img/hero_poster.jpg"
        >
          <source src="/video/hero.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-[#13201A]/70 via-[#13201A]/40 to-[#13201A]" />
      </div>

      {/* nav */}
      <div className="absolute top-6 left-6 right-6 md:left-12 md:right-12 flex justify-between items-center text-sm">
        <span className="font-display italic text-lg text-[#F2EFE6]">Juan Arenas</span>
        <a
          href="#contact"
          className="rounded-full bg-[#C9A24B] text-[#13201A] px-5 py-2 uppercase tracking-widest text-xs font-medium hover:bg-[#d8b563] transition-colors"
        >
          Work together
        </a>
      </div>

      {/* headline */}
      <div className="max-w-6xl mx-auto w-full text-center">
        <h1 className="font-display font-light leading-[0.95] text-[clamp(3rem,11vw,9rem)] tracking-tight">
          JUAN ARENAS
        </h1>
        <div className="mt-8 font-display text-[clamp(1.6rem,4vw,3rem)] leading-[1.15] space-y-1">
          <p>
            Build the{" "}
            <span className="italic text-[#C9A24B]">system.</span>
          </p>
          <p>
            Build the{" "}
            <span className="italic text-[#C9A24B]">pipeline.</span>
          </p>
          <p>
            Build the{" "}
            <span className="italic text-[#9FC4AE]">company.</span>
          </p>
        </div>
        <p className="mt-8 max-w-2xl mx-auto text-[#F2EFE6]/70 text-lg">
          AI-native GTM operator for scientific startups. I make complexity
          disappear — and I fight like it&apos;s my own company.
        </p>
        <div className="mt-9 flex gap-4 justify-center">
          <a
            href="#work"
            className="rounded-full bg-[#284A3C] px-8 py-4 text-sm uppercase tracking-widest hover:bg-[#31594a] transition-colors"
          >
            See the work ↓
          </a>
        </div>
      </div>
    </section>
  );
}

/* ====================================================
   2. METRIC WALL
==================================================== */
function MetricWall() {
  const metrics = [
    { n: <CountUp to={400} suffix="+" />, label: "creators pipelined", color: "gold" },
    { n: <CountUp to={30} prefix="+" suffix="%" />, label: "sponsor revenue growth", color: "" },
    { n: <CountUp to={2} suffix="×" />, label: "reach in 8 months", color: "" },
    { n: <CountUp to={10} suffix="+ hrs" />, label: "/week automated", color: "sage" },
    { n: <CountUp to={0} />, label: "HIPAA compliance gaps", color: "" },
  ];

  return (
    <section className="px-6 md:px-12 lg:px-20 py-20 border-t border-[#F2EFE6]/10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <p className="font-display italic text-2xl text-[#F2EFE6]/60 mb-12">
            Outcomes, not adjectives.
          </p>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {metrics.map((m, i) => (
            <Reveal key={i} delay={i * 80}>
              <div
                className={`font-display text-[clamp(2rem,4vw,3.2rem)] leading-none ${
                  m.color === "gold"
                    ? "text-[#C9A24B]"
                    : m.color === "sage"
                    ? "text-[#9FC4AE]"
                    : "text-[#F2EFE6]"
                }`}
              >
                {m.n}
              </div>
              <div className="mt-3 text-xs uppercase tracking-widest text-[#F2EFE6]/50">
                {m.label}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ====================================================
   3. BRAND STRIP
==================================================== */
function BrandStrip() {
  const brands = [
    "Milieu Skin Microbiome",
    "USC Brain Health",
    "Biotech Connection LA",
    "Metaba Health",
    "Your Aura Fragrance",
    "Tranquilísimo",
  ];
  const all = [...brands, ...brands];

  return (
    <section className="px-6 md:px-12 lg:px-20 py-14 border-t border-[#F2EFE6]/10 overflow-hidden">
      <div className="max-w-7xl mx-auto mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[#F2EFE6]/40">
          Built with &amp; for
        </p>
      </div>
      <div
        className="flex gap-x-16 items-center whitespace-nowrap"
        style={{ animation: "marquee 28s linear infinite" }}
      >
        {all.map((b, i) => (
          <span key={i} className="font-display text-lg text-[#F2EFE6]/55 shrink-0">
            {b}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
}

/* ====================================================
   4. CASE STUDIES
==================================================== */
function CaseStudies() {
  const cases = [
    {
      tag: "0→1 · COMPANY BUILD · OPS + GTM",
      title: "I took a health startup from zero to paying clients.",
      body: "Metaba Health — built the company from the ground up: website live, first paying clients closed, operations running, and a team strategy with aligned milestones. Strategic and hands-on operating work, end to end.",
      result:
        "Zero → live, revenue, and a running operation. Proof I do the whole job, not a slice of it.",
      art: "Metaba Health — site / ops board",
    },
    {
      tag: "0→1 · FOUNDER · DTC + B2B",
      title: "I started a company and sold it into the market myself.",
      body: "Your Aura Fragrance — a bio-based perfumery startup built from zero. Outbound at events and online, consultative pitches closing DTC and small B2B, a customer journey mapped into an automated pipeline, a 6-person ambassador team, supplier terms at a 20% B2B discount.",
      result:
        "Repeat purchases at 30% of 200+ sales. Proof I build the whole GTM motion.",
      art: "Your Aura Fragrance — product / pipeline",
    },
    {
      tag: "HIPAA · CLINICAL GTM · AI SYSTEMS",
      title: "I run growth inside regulated science — and automate it.",
      body: "USC Center for Personalized Brain Health. Liaison to a 1,000+ patient/caregiver community. Campaigns that doubled newsletter and social reach in 8 months, a Spanish-language newsletter that grew recipients 50%, HIPAA-compliant workflows with zero gaps.",
      result:
        "A bigger, more engaged pipeline — without breaking a compliance rule. I move fast without breaking what matters.",
      art: "USC Brain Health — growth chart",
    },
    {
      tag: "AI EMAIL ENGINE · B2B · EVENTS",
      title: "I build AI-native pipelines that close.",
      body: "Milieu + Biotech Connection LA. An AI engine pipelining 400+ creators; n8n + Supabase email automation at 100% follow-up; outreach to 200+ accounts and 20+ KOLs via a custom CRM; sponsor packages that grew revenue 30%.",
      result:
        "10+ hrs/week eliminated, 100% follow-up, 30% revenue lift. I turn chaos into systems that scale.",
      art: "n8n pipeline demo video",
    },
  ];

  return (
    <section id="work" className="px-6 md:px-12 lg:px-20 py-24 border-t border-[#F2EFE6]/10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] mb-16">
            What I&apos;ve actually built.
          </h2>
        </Reveal>
        <div className="space-y-24">
          {cases.map((c, i) => (
            <Reveal key={i} delay={100}>
              <article className="grid lg:grid-cols-2 gap-10 items-center">
                <div className={i % 2 ? "lg:order-2" : ""}>
                  <p className="text-xs tracking-[0.25em] text-[#C9A24B] uppercase mb-4">
                    {c.tag}
                  </p>
                  <h3 className="font-display text-2xl md:text-3xl leading-snug mb-5">
                    {c.title}
                  </h3>
                  <p className="text-[#F2EFE6]/70 leading-relaxed mb-5">{c.body}</p>
                  <p className="text-[#9FC4AE] italic">{c.result}</p>
                </div>
                <div className={i % 2 ? "lg:order-1" : ""}>
                  <div className="aspect-video rounded-xl border border-[#284A3C] bg-[#0e1813] flex items-center justify-center text-[#F2EFE6]/20 text-sm px-6 text-center">
                    {c.art}
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ====================================================
   5. CAPABILITIES
==================================================== */
function Capabilities() {
  const caps: [string, string][] = [
    [
      "0→1 GTM",
      "Find the first customers, build the motion that wins them, make it repeatable.",
    ],
    [
      "AI automation",
      "n8n + Claude Code + Supabase systems that qualify, personalize, and follow up while you sleep.",
    ],
    [
      "Regulated marketing",
      "HIPAA-compliant campaigns and content — fast, without breaking the rules that matter.",
    ],
    [
      "B2B sales & pipeline",
      "Outbound, KOL and account management, custom CRMs, sponsor and partnership deals.",
    ],
    [
      "A deployable network",
      "LA design teams, merch, and SEO/AIO/GEO contractors ready to plug in. I arrive with resources.",
    ],
  ];

  return (
    <section className="px-6 md:px-12 lg:px-20 py-24 border-t border-[#F2EFE6]/10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] mb-3">
            What I can do for your startup.
          </h2>
          <p className="text-[#F2EFE6]/60 italic mb-12">
            Not a service menu — a partner who picks up whatever the company needs.
          </p>
        </Reveal>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {caps.map(([title, desc], i) => (
            <Reveal key={i} delay={i * 60}>
              <div className="group rounded-xl border border-[#284A3C] p-6 bg-[#0e1813] hover:bg-[#284A3C] transition-colors h-full">
                <p className="font-display text-xl text-[#C9A24B] group-hover:text-[#F2EFE6] mb-2 transition-colors">
                  {title}
                </p>
                <p className="text-sm text-[#F2EFE6]/70 group-hover:text-[#F2EFE6]/90 leading-relaxed transition-colors">
                  {desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ====================================================
   6. GTM FRAMEWORK
==================================================== */
function GTMFramework() {
  const phases = [
    {
      key: "Phase 0",
      title: "Earn the first 100",
      weeks: "Wk 1–4",
      points: [
        "A sharp ICP — the 100 who bleed for it, not a broad audience.",
        "Deliberately manual outreach to learn the customer's exact words.",
        "Instrument everything: one source of truth, every touch logged.",
      ],
    },
    {
      key: "Phase 1",
      title: "Find the message that converts",
      weeks: "Wk 4–10",
      points: [
        "Test claims, not just creative — credibility often beats lifestyle in bio/health.",
        "Build the AI content engine: brief → variants → ship → measure → repeat.",
        "Find the one channel with real pull before spreading thin.",
      ],
    },
    {
      key: "Phase 2",
      title: "Build the repeatable engine",
      weeks: "Wk 10–20",
      points: [
        "Automate the proven motion: lead → qualify → personalize → send → follow-up.",
        "Layer a creator/UGC pipeline for social proof at scale.",
        "Stand up retention early — repeat purchase is the whole business.",
      ],
    },
    {
      key: "Phase 3",
      title: "Pour fuel only where proven",
      weeks: "Wk 20+",
      points: [
        "Scale paid behind a channel already converting organically — never before.",
        "Watch CAC:LTV — the bio-DTC trap is buying growth that doesn't repeat.",
        "Compliance scales with you; I've run regulated workflows with zero gaps.",
      ],
    },
  ];

  return (
    <section className="px-6 md:px-12 lg:px-20 py-24 border-t border-[#F2EFE6]/10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] mb-3">
            If we matched tomorrow, here&apos;s how I&apos;d think about it.
          </h2>
          <p className="text-[#F2EFE6]/60 mb-16 italic font-display text-lg">
            A 0→1 GTM framework for a consumer-health / bio-based DTC startup.
          </p>
        </Reveal>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {phases.map((p, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="rounded-xl border border-[#284A3C] p-6 bg-[#0e1813] h-full">
                <p className="text-[#C9A24B] text-xs tracking-widest uppercase">
                  {p.key}
                </p>
                <p className="text-[#F2EFE6]/40 text-xs mb-3">{p.weeks}</p>
                <h3 className="font-display text-xl mb-4">{p.title}</h3>
                <ul className="space-y-3 text-sm text-[#F2EFE6]/70 leading-relaxed">
                  {p.points.map((pt, j) => (
                    <li key={j} className="flex gap-2">
                      <span className="text-[#9FC4AE] shrink-0">—</span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <p className="mt-12 text-[#F2EFE6]/60 italic max-w-3xl">
            A starting hypothesis, not a script. Your data rewrites it by week
            2 — and I&apos;ll have built the system that captures that data.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ====================================================
   7. AI STACK
==================================================== */
function AIStack() {
  const tools: [string, string][] = [
    ["n8n", "orchestrates the whole pipeline"],
    ["Claude Code", "builds the custom tools & CRMs I need"],
    ["Supabase", "single source of truth for every contact"],
    ["Apps Script", "glues Google Workspace into the system"],
    ["HubSpot / custom CRM", "pipeline visibility end to end"],
    ["Meta / Mailchimp / Manychat", "the demand and nurture layer"],
  ];

  return (
    <section className="px-6 md:px-12 lg:px-20 py-24 border-t border-[#F2EFE6]/10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] mb-12">
            My unfair advantage: I operate like a team of five.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#284A3C] rounded-xl overflow-hidden border border-[#284A3C]">
            {tools.map(([name, job], i) => (
              <div key={i} className="bg-[#0e1813] p-6">
                <p className="font-display text-xl text-[#C9A24B] mb-1">{name}</p>
                <p className="text-sm text-[#F2EFE6]/65">{job}</p>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={200}>
          <p className="mt-10 text-[#F2EFE6]/60 italic max-w-3xl">
            Most operators can list these. I wire them into systems that run
            while I sleep — and build the missing pieces myself.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ====================================================
   8. ASK MY CLONE
==================================================== */
function AskMyClone() {
  const qa: Record<string, string> = {
    "How would you grow my biotech startup?":
      "First I'd find the 100 people who actually bleed for your product — not a broad audience, a sharp ICP. I'd do manual outreach to learn their exact words, then build the AI engine that turns that into a repeatable pipeline. In bio, credibility converts: we'd lead with mechanism and science, test it, and scale only behind what's already pulling. I'd have the system capturing your data by week two.",
    "What makes you different from other operators?":
      "I build, I don't just advise. Most operators hand you a deck — I hand you a working system. I'm AI-native: n8n, Claude Code, Supabase, the whole stack wired together so it runs while you sleep. And I treat your company like my own, because I've built my own from zero. Twice.",
    "What's your background?":
      "USC drug development, honors, while running three operating roles. Founder of Your Aura Fragrance. I've run HIPAA-compliant growth for a USC Alzheimer's clinic, built an AI email engine that pipelined 400+ creators, and took Metaba Health from zero to paying clients. Bilingual, LA-based, with a deployable network of design, merch, and SEO contractors.",
    "Can you really code and automate?":
      "Yes — and not in theory. The n8n flow on this page is real: it finds creators, cleans them with AI in batches, writes personalized emails, sends at scale, and books calls. It cut 10+ hours a week and hit 100% follow-up. I build the tools I need when I need them.",
    "Why should a founder pick you as a partner?":
      "Because I'm complementary, not redundant. You know the science cold — I bring the GTM, the systems, and the hustle to turn it into revenue. I move fast, I treat it like my own, and I arrive with a network: LA design, merch, and SEO/AIO/GEO contractors ready to deploy. You're not hiring a consultant; you're getting an operating partner.",
    "What are you like to work with?":
      "Direct, fast, and genuinely invested. I'd rather show you a working system than a deck. I play bass in an LA band, so I think in rhythm — find the beat, get everyone in sync, ship something people feel. Founders tell me I make the chaos calm.",
  };

  const questions = Object.keys(qa);
  const [active, setActive] = useState<string | null>(null);

  return (
    <section className="px-6 md:px-12 lg:px-20 py-24 border-t border-[#F2EFE6]/10">
      <div className="max-w-4xl mx-auto">
        <Reveal>
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] mb-3">
            Ask my AI.
          </h2>
          <p className="text-[#F2EFE6]/60 italic mb-10">
            I&apos;m an AI-native operator — so of course you can interrogate
            an AI version of me. Pick a question.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div className="rounded-2xl border border-[#284A3C] bg-[#0e1813] p-6 md:p-8">
            <div className="min-h-[120px] mb-6">
              {active ? (
                <div>
                  <p className="text-sm text-[#C9A24B] mb-3 uppercase tracking-widest">
                    {active}
                  </p>
                  <p className="text-[#F2EFE6]/85 leading-relaxed font-display text-lg">
                    {qa[active]}
                  </p>
                </div>
              ) : (
                <p className="text-[#F2EFE6]/40 italic">
                  Choose a question below — answered in my voice.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {questions.map((q) => (
                <button
                  key={q}
                  onClick={() => setActive(active === q ? null : q)}
                  className={`text-left text-sm rounded-full border px-4 py-2 transition-colors cursor-pointer ${
                    active === q
                      ? "bg-[#C9A24B] text-[#13201A] border-[#C9A24B]"
                      : "border-[#284A3C] text-[#F2EFE6]/80 hover:border-[#C9A24B]"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ====================================================
   9. TESTIMONIALS
==================================================== */
function Testimonials() {
  const testimonials = [
    {
      quote:
        "Juan built our entire GTM motion and treated the company like his own. Most people deliver a slide deck — he delivered a system.",
      who: "Past CEO / Founder",
    },
    {
      quote:
        "Turned chaos into systems no one else could build. He was the operating glue that held everything together.",
      who: "Past Manager",
    },
    {
      quote:
        "Scrappy, AI-fluent, and relentless about results. Bilingual, operates at a pace that's hard to match.",
      who: "Collaborator",
    },
  ];

  return (
    <section className="px-6 md:px-12 lg:px-20 py-24 border-t border-[#F2EFE6]/10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] mb-12">
            What people say.
          </h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="rounded-xl border border-[#284A3C] p-6 bg-[#0e1813] h-full flex flex-col">
                <p className="text-[#C9A24B] font-display text-4xl leading-none mb-3">
                  &ldquo;
                </p>
                <p className="text-[#F2EFE6]/80 italic leading-relaxed mb-4 flex-1">
                  {t.quote}
                </p>
                <p className="text-xs uppercase tracking-widest text-[#F2EFE6]/50">
                  {t.who}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <p className="mt-8 text-xs text-[#F2EFE6]/30 italic">
            * To be replaced with real quotes — names and companies pending permission.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ====================================================
   10. ABOUT
==================================================== */
function About() {
  return (
    <section className="px-6 md:px-12 lg:px-20 py-24 border-t border-[#F2EFE6]/10">
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <Reveal>
          <div className="aspect-[4/5] rounded-xl border border-[#284A3C] bg-[#0e1813] flex items-center justify-center text-[#F2EFE6]/20 text-sm">
            [Portrait — drop /public/img/juan.jpg]
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div>
            <h2 className="font-display text-[clamp(2rem,4vw,3rem)] mb-6">
              Who I am.
            </h2>
            <p className="text-[#F2EFE6]/75 leading-relaxed mb-4">
              I&apos;m a builder. I started a perfume company, took a health
              startup from zero to revenue, and ran growth inside a USC clinic
              without breaking a single compliance rule. I&apos;m AI-native —
              I&apos;d rather build the system than write the memo about
              building the system.
            </p>
            <p className="text-[#F2EFE6]/75 leading-relaxed mb-6">
              Scientific founders are brilliant at the science and stuck on
              go-to-market. That gap is where I live. I make the complexity
              disappear, and I fight like it&apos;s my own company. (Because
              I&apos;ve had my own — I know what&apos;s at stake.) When
              I&apos;m not building systems, I&apos;m on stage playing bass —
              same instinct, really: find the rhythm, make people feel
              something, ship it.
            </p>
            <p className="text-xs uppercase tracking-[0.25em] text-[#C9A24B] mb-3">
              Fun facts
            </p>
            <ul className="space-y-2 text-[#F2EFE6]/70">
              <li className="flex gap-2">
                <span className="text-[#9FC4AE] shrink-0">—</span>
                I play bass for the indie band Stoke Club — deep in LA&apos;s
                live music scene. (My original,{" "}
                <span className="italic">Polaroid</span>, drops in June.)
              </li>
              <li className="flex gap-2">
                <span className="text-[#9FC4AE] shrink-0">—</span>
                I&apos;ve founded two brands: Your Aura Fragrance and
                Tranquilísimo merch.
              </li>
              <li className="flex gap-2">
                <span className="text-[#9FC4AE] shrink-0">—</span>
                Bilingual and bicultural — I built a Spanish-language pipeline
                that grew an audience 50%.
              </li>
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ====================================================
   11. CTA
==================================================== */
function CTA() {
  return (
    <section
      id="contact"
      className="px-6 md:px-12 lg:px-20 py-28 border-t border-[#F2EFE6]/10 relative"
    >
      <div className="pointer-events-none absolute inset-0 bg-[#284A3C] opacity-[0.07]" />
      <div className="relative max-w-4xl mx-auto text-center">
        <Reveal>
          <h2 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-tight">
            I&apos;m the GTM/Ops partner{" "}
            <span className="italic text-[#9FC4AE]">your science needs.</span>
          </h2>
          <p className="mt-6 text-[#F2EFE6]/70 max-w-2xl mx-auto">
            USC honors. Companies I built myself. AI fluency most operators
            don&apos;t have. And a work ethic that&apos;s genuinely hard to match.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-10 flex flex-wrap gap-4 justify-center">
            <a
              href="mailto:juan.arenas.rec@gmail.com"
              className="rounded-full bg-[#C9A24B] text-[#13201A] px-8 py-4 text-sm uppercase tracking-widest font-medium hover:bg-[#d8b563] transition-colors"
            >
              Email me
            </a>
            <a
              href="https://linkedin.com/in/juanarenasmartin"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[#F2EFE6]/30 px-8 py-4 text-sm uppercase tracking-widest hover:border-[#C9A24B] transition-colors"
            >
              LinkedIn →
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ====================================================
   12. FOOTER
==================================================== */
function Footer() {
  return (
    <footer className="px-6 md:px-12 lg:px-20 py-10 border-t border-[#F2EFE6]/10 text-xs text-[#F2EFE6]/40 flex flex-col md:flex-row gap-2 justify-between">
      <span>Juan Arenas Martin · Los Angeles, CA</span>
      <span>
        (323) 775-3850 · juan.arenas.rec@gmail.com ·
        linkedin.com/in/juanarenasmartin
      </span>
    </footer>
  );
}
