// src/app/page.tsx — Juan Arenas portfolio v1
// Archetypes: MAGICIAN (complexity → systems that feel like magic) + HERO (scrappy, treats it like his own).
// Palette: ink #13201A · cream #F2EFE6 · forest #284A3C · sage #9FC4AE · gold #C9A24B
// Fonts: Fraunces (display) + Hanken Grotesk (body) — loaded in layout.tsx

"use client";

import Image from "next/image";
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
      {/* 1. Hero */}
      <Hero />
      {/* 2. Proof bar */}
      <MetricWall />
      <BrandStrip />
      {/* 3. Case studies */}
      <CaseStudies />
      {/* 4. How I help */}
      <Capabilities />
      {/* 5. About + CTA */}
      <AskMyClone />
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
  const videoRef = useRef<HTMLVideoElement>(null);

  // The bare autoPlay attribute is unreliable here (the muted bg video
  // intermittently stays at readyState 0 / paused on first load). Kick it
  // explicitly on mount and again once it can play, mirroring the project
  // videos which use the same .play() pattern and never stall.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const kick = () => video.play().catch(() => {});
    kick();
    video.addEventListener("canplay", kick);
    return () => video.removeEventListener("canplay", kick);
  }, []);

  return (
    <section className="relative isolate min-h-screen flex flex-col justify-end px-6 md:px-12 lg:px-20 pt-20 pb-16 sm:pb-24 overflow-hidden">
      {/* video bg + scrim */}
      <div className="absolute inset-0 -z-10">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          style={{ objectPosition: "center 30%" }}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/img/portfolio-hero-poster.jpg"
          src="/video/portfolio-hero.mp4"
        />
        {/* scrim: video stays clearly visible through the middle; darken only
            top (nav) and bottom (scroll cue / grounds into next section) */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#13201A]/75 via-[#13201A]/20 to-[#13201A]/95" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#13201A]/35 via-transparent to-[#13201A]/35" />
      </div>

      {/* nav */}
      <div className="absolute top-12 left-6 right-6 md:top-6 md:left-12 md:right-12 flex justify-between items-center text-sm">
        <Image
          src="/img/ja-logo.png"
          alt="JA monogram"
          width={40}
          height={40}
          className="rounded-xl"
          priority
        />
        <a
          href="#portfolio"
          className="rounded-full bg-[#C9A24B] text-[#13201A] px-5 py-2 uppercase tracking-widest text-xs font-medium hover:bg-[#d8b563] transition-colors"
        >
          Portfolio
        </a>
      </div>

      {/* headline */}
      <div
        className="max-w-6xl mx-auto w-full text-center"
        style={{ textShadow: "0 2px 28px rgba(8,14,11,0.85), 0 1px 4px rgba(8,14,11,0.7)" }}
      >
        <h1 className="font-display font-light leading-[0.95] text-[clamp(2.5rem,8vw,6.5rem)] tracking-tight">
          JUAN ARENAS
        </h1>
        <p className="mt-6 font-display italic text-[clamp(1rem,2.2vw,1.5rem)] text-[#C9A24B]">
          I turn complex science into revenue.
        </p>
        <div className="mt-12 flex justify-center">
          <a href="#portfolio" className="text-[#F2EFE6]/40 hover:text-[#F2EFE6]/70 transition-colors" aria-label="Scroll down">
            <svg
              width="36"
              height="22"
              viewBox="0 0 36 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: "chevron-drop 1.2s ease-in-out infinite" }}
            >
              <polyline points="2 2 18 20 34 2" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ====================================================
   2. METRIC WALL
==================================================== */
function MetricLogo({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="mt-4 h-8 w-auto object-contain" />
  );
}

function Metric({
  n,
  label,
  color,
}: {
  n: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <div>
      <div
        className={`font-display text-[clamp(2rem,4vw,3.2rem)] leading-none ${
          color === "gold"
            ? "text-[#C9A24B]"
            : color === "sage"
            ? "text-[#9FC4AE]"
            : "text-[#F2EFE6]"
        }`}
      >
        {n}
      </div>
      <div className="mt-3 text-xs uppercase tracking-widest text-[#F2EFE6]/50">
        {label}
      </div>
    </div>
  );
}

function MetricWall() {
  return (
    <section id="portfolio" className="px-6 md:px-12 lg:px-20 py-20 border-t border-[#F2EFE6]/10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <p className="font-display italic text-2xl text-[#F2EFE6]/60 mb-12">
            Outcomes
          </p>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <Reveal delay={0}>
            <Metric n={<CountUp to={400} suffix="+" />} label="creators activated" color="gold" />
            <MetricLogo src="/img/logos/superbiome.png" alt="Milieu Skin Microbiome" />
          </Reveal>

          <Reveal delay={80}>
            <Metric n={<CountUp to={30} prefix="+" suffix="%" />} label="sponsor revenue growth" color="" />
            <MetricLogo src="/img/logos/biotech-connection.png" alt="Biotech Connection LA" />
          </Reveal>

          <Reveal delay={160}>
            <div className="grid grid-cols-2 gap-6">
              <Metric n={<CountUp to={2} suffix="×" />} label="reach in 8 months" color="" />
              <Metric n={<CountUp to={100} suffix="%" />} label="HIPAA compliant" color="sage" />
            </div>
            <MetricLogo src="/img/logos/usc-brain.png" alt="USC Center for Personalized Brain Health" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ====================================================
   3. BRAND STRIP
==================================================== */

type BrandItem =
  | { kind: "img";  src: string; alt: string; rounded?: boolean; large?: boolean; href?: string }
  | { kind: "text"; label: string; href?: string };

function BrandStrip() {
  const aura:    BrandItem = { kind: "img", src: "/img/logos/aura-white.png",        alt: "Your Aura Fragrance",                     href: "https://youraurafragrance.com", large: true };
  const tranq:   BrandItem = { kind: "img", src: "/img/logos/tranquilisimo.png",     alt: "Tranquilísimo",                            href: "https://tranquilisimo.com" };
  const brain:   BrandItem = { kind: "img", src: "/img/logos/usc-brain.png",         alt: "USC Center for Personalized Brain Health", href: "https://keck.usc.edu/cpbh",     rounded: true };
  const bio:     BrandItem = { kind: "img", src: "/img/logos/biotech-connection.png",alt: "Biotech Connection LA",                    href: "https://bc-la.org",             rounded: true };
  const metaba:  BrandItem = { kind: "img", src: "/img/logos/metaba.png",            alt: "Metaba Health",                            href: "https://metabahealth.us",       rounded: true };
  const super_:  BrandItem = { kind: "img", src: "/img/logos/superbiome.png",        alt: "Milieu Skin Microbiome",                   href: "https://milieuskin.com",        rounded: true };

  const all: BrandItem[] = [
    aura, metaba, bio, super_, brain, aura,
    metaba, bio, brain, super_, tranq, metaba,
    bio, super_, aura, tranq,
  ];

  function tooltip(href: string) {
    const domain = href.replace(/^https?:\/\//, "");
    return (
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#284A3C] bg-[#0e1813] px-3 py-1 text-xs text-[#F2EFE6]/70 opacity-0 transition-opacity group-hover:opacity-100">
        go to {domain}
      </span>
    );
  }

  function renderItem(item: BrandItem, i: number) {
    if (item.kind === "text") {
      return (
        <span key={i} className="shrink-0 font-display text-lg text-[#F2EFE6]/40 flex items-center h-12">
          {item.label}
        </span>
      );
    }

    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.src}
        alt={item.alt}
        className="h-full w-auto object-contain"
      />
    );

    const inner = item.rounded ? (
      <div className="h-12 rounded-2xl overflow-hidden">{img}</div>
    ) : item.large ? (
      <div className="h-20 flex items-center">{img}</div>
    ) : (
      <div className="h-14 flex items-center">{img}</div>
    );

    if (item.href) {
      return (
        <div key={i} className="relative group shrink-0">
          <a href={item.href} target="_blank" rel="noopener noreferrer" className="block opacity-70 hover:opacity-100 transition-opacity">
            {inner}
          </a>
          {tooltip(item.href)}
        </div>
      );
    }

    return (
      <div key={i} className="shrink-0">
        {inner}
      </div>
    );
  }

  return (
    <section className="px-6 md:px-12 lg:px-20 py-14 border-t border-[#F2EFE6]/10 overflow-hidden">
      <div className="max-w-7xl mx-auto mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[#F2EFE6]/40">
          Built with &amp; for
        </p>
      </div>
      <div
        className="flex gap-x-14 items-center whitespace-nowrap"
        style={{ animation: "marquee 20s linear infinite" }}
      >
        {all.map((item, i) => renderItem(item, i))}
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
   SCROLL-TRIGGERED VIDEO — plays 2 s after entering view
==================================================== */
function ScrollVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.4 }
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <div className="rounded-3xl overflow-hidden border border-[#284A3C]">
      <video
        ref={videoRef}
        className="w-full"
        muted
        loop
        playsInline
        preload="none"
        poster="/img/hero_poster.jpg"
      >
        <source src="/video/hero.mp4" type="video/mp4" />
      </video>
    </div>
  );
}

/* ====================================================
   CASE ARTIFACT — media slot for each case study
==================================================== */
function CPBHVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.3 }
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);
  return (
    <div className="rounded-3xl overflow-hidden aspect-[4/3] bg-[#0e1813]">
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        className="w-full h-full object-contain"
      >
        <source src="/video/cpbh.mp4" type="video/mp4" />
      </video>
    </div>
  );
}

function MetabaVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.3 }
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);
  return (
    <div className="rounded-3xl overflow-hidden aspect-video bg-[#0e1813]">
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        className="w-full h-full object-cover"
        style={{ objectPosition: "center 65%", transform: "scale(1.01)" }}
      >
        <source src="/video/metaba.mp4" type="video/mp4" />
      </video>
    </div>
  );
}

function BCLAVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.3 }
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);
  return (
    <div className="rounded-3xl overflow-hidden aspect-[3/4] bg-[#0e1813]">
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        className="w-full h-full object-cover"
      >
        <source src="/video/bcla.mp4" type="video/mp4" />
      </video>
    </div>
  );
}

const NEWSLETTERS = [
  { pdf: "/pdfs/spanish-july.pdf",      thumb: "/img/newsletters/spanish-july.jpg",      label: "Julio 2025 · ES" },
  { pdf: "/pdfs/september-2025.pdf",    thumb: "/img/newsletters/september-2025.jpg",    label: "Sep 2025 · EN" },
  { pdf: "/pdfs/spanish-november.pdf",  thumb: "/img/newsletters/spanish-november.jpg",  label: "Nov 2025 · ES" },
  { pdf: "/pdfs/december-february.pdf", thumb: "/img/newsletters/december-february.jpg", label: "Feb 2026 · ES" },
];

function NewsletterFan() {
  return (
    <div className="flex gap-2 sm:gap-3">
      {NEWSLETTERS.map((n, i) => (
        <a
          key={i}
          href={n.pdf}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-0 group"
          title={n.label}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={n.thumb}
            alt={n.label}
            className="w-full rounded-md shadow-lg border border-[#284A3C] group-hover:border-[#C9A24B] transition-colors"
          />
          <p className="text-[9px] sm:text-[10px] text-[#F2EFE6]/40 mt-1 text-center truncate">{n.label}</p>
        </a>
      ))}
    </div>
  );
}

function CaseArtifact({ art }: { art: string }) {
  if (art === "aura-collage") {
    return (
      <div className="rounded-3xl overflow-hidden relative aspect-[4/3]">
        <Image
          src="/img/aura-founder.webp"
          alt="Juan Arenas as Founder at Your Aura Fragrance"
          fill
          className="object-cover"
          style={{ objectPosition: "center top" }}
          sizes="(max-width: 1024px) 100vw, 50vw"
        />
      </div>
    );
  }

  if (art === "n8n-video") {
    return <ScrollVideo />;
  }

  if (art === "bcla-video") {
    return <BCLAVideo />;
  }

  if (art === "Metaba Health — site / ops board") {
    return <MetabaVideo />;
  }

  if (art === "cpbh-video") {
    return <CPBHVideo />;
  }

  // default placeholder
  return (
    <div className="aspect-video rounded-3xl border border-[#284A3C] bg-[#0e1813] flex items-center justify-center text-[#F2EFE6]/20 text-sm px-6 text-center">
      {art}
    </div>
  );
}

/* ====================================================
   4. CASE STUDIES
==================================================== */
function SuitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#C9A24B]">
      <circle cx="12" cy="6" r="4"/>
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
      <path d="M10 13l2 3 2-3"/>
      <line x1="12" y1="16" x2="12" y2="20"/>
    </svg>
  );
}

function CaseBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <svg
        width="13"
        height="13"
        viewBox="0 0 14 14"
        fill="none"
        stroke="#C9A24B"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-[0.4em] shrink-0"
        aria-hidden="true"
      >
        <polyline points="4 2 10 7 4 12" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

function CaseStudies() {
  const cases: {
    tag: string; title: string; body: React.ReactNode; result?: string;
    art: string; newsletters?: boolean; role?: string;
  }[] = [
    {
      tag: "HIPAA COMPLIANT MARKETING",
      role: "Marketing & Revenue Operations Lead",
      title: "I joined a world‑class Alzheimer's center to get their science out of the journals and into the world, loud and clear.",
      body: (
        <ul className="space-y-3">
          <CaseBullet>
            Led the cross‑functional marketing engine of an Alzheimer&apos;s Lab &amp; Brain Health Clinic: content, email, social, and web, all HIPAA‑compliant and on‑brand.
          </CaseBullet>
          <CaseBullet>
            <strong className="text-[#C9A24B] font-medium">2× newsletter and social reach in 8 months</strong>
            , growing a pipeline of engaged patients and caregivers.
          </CaseBullet>
          <CaseBullet>
            Launched and scaled a Spanish‑language newsletter, expanding the addressable LA market.
          </CaseBullet>
        </ul>
      ),
      art: "cpbh-video",
      newsletters: true,
    },
    {
      tag: "0→1 · OPERATIONS · GO-TO-MARKET",
      role: "Founding Operator",
      title: "I helped build a diagnostics startup from zero to revenue.",
      body: (
        <ul className="space-y-3">
          <CaseBullet>
            Shaped the founders&apos; vision into a v1 deck and built the website.
          </CaseBullet>
          <CaseBullet>
            Designed the operational workflows behind the diagnostics service, strategic and hands-on.
          </CaseBullet>
          <CaseBullet>
            Warmed B2B relationships with LA&apos;s longevity clinics,{" "}
            <strong className="text-[#C9A24B] font-medium">zero to first revenue</strong>.
          </CaseBullet>
        </ul>
      ),
      art: "Metaba Health — site / ops board",
    },
    {
      tag: "0→1 · EMBEDDED AI · DTC PRODUCTS",
      role: "Founder",
      title: "I bootstrapped a personalized perfume company into 5 figures of revenue.",
      body: (
        <>
          <ul className="space-y-3">
            <CaseBullet>
              Toxicology research at USC showed me some perfume ingredients are endocrine disruptors, so I started formulating my own cologne with all-natural essential oils.
            </CaseBullet>
            <CaseBullet>
              Grew the hobby into a startup delivering personalized perfume as a service:{" "}
              <strong className="text-[#C9A24B] font-medium">5 figures of revenue</strong>.
            </CaseBullet>
            <CaseBullet>
              <strong className="text-[#C9A24B] font-medium">200+ unique perfumes for 200 unique customers</strong>
              ; with{" "}
              <a href="https://youraurafragrance.com" target="_blank" rel="noopener noreferrer" className="text-[#C9A24B] hover:underline">Your Aura</a>
              , anyone can design their own scent, safe by formulation.
            </CaseBullet>
          </ul>
          <p className="mt-4 text-sm italic text-[#F2EFE6]/50">
            Ever-grateful to{" "}
            <a href="https://www.linkedin.com/in/tommyknapp1/" target="_blank" rel="noopener noreferrer" className="text-[#C9A24B]/80 hover:underline">Prof. Tommy Knapp</a>
            {" "}for keeping me curious and pushing me toward better product-market fit.
          </p>
        </>
      ),
      art: "aura-collage",
    },
    {
      tag: "LEAD GENERATION · B2B · AI ORCHESTRATION",
      role: "Growth & Automation Lead",
      title: "I built an AI-native pipeline that engaged thousands of influencers.",
      body: (
        <ul className="space-y-3">
          <CaseBullet>
            Go-to-market plan for Milieu Skin, the first personalized prebiotic skincare brand: activate TikTokers to create hundreds of product videos, promote the best performers as ads.
          </CaseBullet>
          <CaseBullet>
            Built the flow in this video: high-volume automation, AI orchestration, human touch when it matters.
          </CaseBullet>
          <CaseBullet>
            <strong className="text-[#C9A24B] font-medium">Hundreds of qualified inbound leads each week</strong>.
          </CaseBullet>
        </ul>
      ),
      art: "n8n-video",
    },
    {
      tag: "PARTNERSHIPS · COMMUNITY · EVENTS",
      role: "B2B Partnerships Associate",
      title: "I grew partnerships for LA's Biotech nonprofit, lifting revenue 30% YoY.",
      body: (
        <ul className="space-y-3">
          <CaseBullet>
            Ran partnerships end to end for Biotech Connection LA: cold outreach, pre-event promotion, live event-day interviews, post-event follow-ups.
          </CaseBullet>
          <CaseBullet>
            <strong className="text-[#C9A24B] font-medium">30% lift in sponsorship revenue YoY</strong>
            {" "}through consistent sponsor communication.
          </CaseBullet>
          <CaseBullet>
            Brought bigger names, Amgen and USC Keck, onto the sponsor list.
          </CaseBullet>
        </ul>
      ),
      art: "bcla-video",
    },
  ];

  return (
    <section id="work" className="px-6 md:px-12 lg:px-20 py-16 md:py-24 border-t border-[#F2EFE6]/10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] mb-8 md:mb-16">
            What I&apos;ve built.
          </h2>
        </Reveal>
        <div className="space-y-24 lg:space-y-32">
          {cases.map((c, i) => (
            <div key={i} className={i === 2 ? "lg:!mt-56" : ""}>
            <Reveal delay={100}>
              <article>
                <div className="grid lg:grid-cols-2 gap-10 items-center">
                  <div className={i % 2 ? "lg:order-2" : ""}>
                    <p className="text-xs tracking-[0.25em] text-[#C9A24B] uppercase mb-3">
                      {c.tag}
                    </p>
                    {c.role && (
                      <div className="flex items-center gap-2 mb-4">
                        <SuitIcon />
                        <span className="text-sm text-[#F2EFE6]/60">{c.role}</span>
                      </div>
                    )}
                    <h3 className="font-display text-2xl md:text-3xl leading-snug mb-5">
                      {c.title}
                    </h3>
                    <div className="text-[#F2EFE6]/70 leading-relaxed mb-5">{c.body}</div>
                    {c.result && <p className="text-[#9FC4AE] italic">{c.result}</p>}
                  </div>
                  <div className={i % 2 ? "lg:order-1" : ""}>
                    <CaseArtifact art={c.art} />
                  </div>
                </div>
                {c.newsletters && (
                  <div className="mt-10 pt-6 border-t border-[#284A3C]/50">
                    <p className="text-xs uppercase tracking-widest text-[#F2EFE6]/40 mb-4">
                      A few of my newsletters
                    </p>
                    <NewsletterFan />
                  </div>
                )}
              </article>
            </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ====================================================
   5. CAPABILITIES
==================================================== */
function CapIcon({ shape }: { shape: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shape === "flask" && (
        <>
          <path d="M10 3h4" />
          <path d="M10 3v6L4.5 18.5A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.8-2.5L14 9V3" />
          <path d="M7.5 15h9" />
        </>
      )}
      {shape === "nodes" && (
        <>
          <circle cx="5" cy="6" r="2.5" />
          <circle cx="19" cy="6" r="2.5" />
          <circle cx="12" cy="18" r="2.5" />
          <path d="M7.5 6h9" />
          <path d="M6.2 8.2l4.6 7.6" />
          <path d="M17.8 8.2l-4.6 7.6" />
        </>
      )}
      {shape === "trajectory" && (
        <>
          <path d="M3 20c5 0 10-3 15-12" />
          <path d="M13 7h5.5v5.5" />
          <circle cx="3.5" cy="20" r="1.5" />
        </>
      )}
      {shape === "link" && (
        <>
          <path d="M9 15l6-6" />
          <path d="M11 6.5l2-2a4 4 0 0 1 5.7 5.7l-2 2" />
          <path d="M13 17.5l-2 2a4 4 0 0 1-5.7-5.7l2-2" />
        </>
      )}
      {shape === "pin" && (
        <>
          <path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z" />
          <circle cx="12" cy="10.5" r="2.5" />
        </>
      )}
    </svg>
  );
}

function Capabilities() {
  const caps: { num: string; icon: string; title: string; desc: string }[] = [
    {
      num: "01",
      icon: "flask",
      title: "Science-fluent growth",
      desc: "I speak lab and clinic. HIPAA-compliant campaigns that ship fast without breaking the rules that matter.",
    },
    {
      num: "02",
      icon: "nodes",
      title: "AI-native operations",
      desc: "Workflows that qualify, personalize, and follow up while you sleep. I build the engine, not just the ads.",
    },
    {
      num: "03",
      icon: "trajectory",
      title: "0→1 go-to-market",
      desc: "Find your first customers, prove what works, then make the motion repeatable.",
    },
    {
      num: "04",
      icon: "link",
      title: "B2B pipeline & partnerships",
      desc: "Outbound, KOL, and sponsor motions that move qualified opportunities.",
    },
    {
      num: "05",
      icon: "pin",
      title: "A deployable network",
      desc: "Trusted LA design, merch, and SEO/AIO/GEO talent on day one, no hiring cycle.",
    },
  ];

  return (
    <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24 border-t border-[#F2EFE6]/10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] mb-3">
            How I help your team.
          </h2>
          <p className="font-display italic text-lg text-[#F2EFE6]/55 mb-8 md:mb-12">
            The route from complex science to revenue, end to end.
          </p>
        </Reveal>
        {/* Olympic rings layout: 3 on top, 2 offset below (lg+). Mobile: 1-col, sm: 2-col */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-5">
          {caps.map((cap, i) => {
            const colClass =
              i === 3 ? "lg:col-start-2 lg:col-span-2" :
              i === 4 ? "lg:col-start-4 lg:col-span-2" :
              "lg:col-span-2";
            return (
              <Reveal key={i} delay={i * 60} className={colClass}>
                <div className="group rounded-2xl border border-[#284A3C] p-6 bg-[#0e1813] hover:bg-[#284A3C] transition-colors h-full">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-[#C9A24B] group-hover:text-[#F2EFE6] transition-colors">
                      <CapIcon shape={cap.icon} />
                    </span>
                    <span className="font-display text-sm text-[#F2EFE6]/35 group-hover:text-[#F2EFE6]/60 transition-colors">
                      {cap.num}
                    </span>
                  </div>
                  <p className="font-display text-xl text-[#C9A24B] group-hover:text-[#F2EFE6] mb-2 transition-colors">
                    {cap.title}
                  </p>
                  <p className="text-sm text-[#F2EFE6]/70 group-hover:text-[#F2EFE6]/90 leading-relaxed transition-colors">
                    {cap.desc}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ====================================================
   6. ASK MY CLONE
==================================================== */
type Message = { role: "user" | "assistant"; content: string };


function AskMyClone() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [extraContext, setExtraContext] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollChatToBottom = () => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    if (messages.length > 0) scrollChatToBottom();
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const trimmed = text.trim();

    // "I am Juan — ..." updates the AI's live context for this session
    if (/^i am juan\b/i.test(trimmed)) {
      const memo = trimmed.replace(/^i am juan[\s\-–—]*/i, "").trim();
      if (memo) {
        setExtraContext(prev => prev ? `${prev}\n${memo}` : memo);
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: `✓ Got it, context updated.` },
        ]);
      }
      setInput("");
      return;
    }

    const userMsg: Message = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    // placeholder for streaming text
    setMessages([...next, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s hard timeout

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, extraContext }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No stream body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: full }]);
      }

      // if we got nothing at all, show fallback
      if (!full.trim()) throw new Error("Empty response");

    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      setMessages([
        ...next,
        {
          role: "assistant",
          content: isTimeout
            ? "Took too long. Try again or email juan.arenas.rec@gmail.com."
            : "Couldn't reach the AI. Email me directly: juan.arenas.rec@gmail.com.",
        },
      ]);
    } finally {
      clearTimeout(timeout);
      setStreaming(false);
    }
  }

  return (
    <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24 border-t border-[#F2EFE6]/10">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-4 gap-6 items-stretch">

        {/* Left — primary contact */}
        <Reveal className="lg:col-span-2 flex flex-col h-full">
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] mb-10">
            Ask me anything.
          </h2>
          <div className="flex-1" />
          <div className="flex gap-4 sm:gap-10 items-end">
            {/* LinkedIn */}
            <a
              href="https://linkedin.com/in/juanarenasmartin"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-3 text-[#F2EFE6]/35 hover:text-[#0A66C2] transition-all duration-300"
            >
              <svg
                viewBox="0 0 24 24" fill="currentColor"
                className="w-16 h-16 sm:w-24 sm:h-24 transition-all duration-300 group-hover:scale-125 group-hover:[filter:drop-shadow(0_0_14px_#0A66C2)]"
              >
                <path d="M20.447 20.452H16.89v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a1.975 1.975 0 1 1 0-3.95 1.975 1.975 0 0 1 0 3.95zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              <span className="text-xs uppercase tracking-widest">LinkedIn</span>
            </a>
            {/* iMessage */}
            <a
              href="sms:+13237753850"
              className="group flex flex-col items-center gap-3 text-[#F2EFE6]/35 hover:text-[#34C759] transition-all duration-300"
            >
              <svg
                viewBox="0 0 24 24" fill="currentColor"
                className="w-16 h-16 sm:w-24 sm:h-24 transition-all duration-300 group-hover:scale-125 group-hover:[filter:drop-shadow(0_0_14px_#34C759)]"
              >
                <path d="M12 2C6.477 2 2 6.477 2 12c0 2.1.644 4.05 1.747 5.667L2 22l4.333-1.747A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
              </svg>
              <span className="text-xs uppercase tracking-widest">iMessage</span>
            </a>
            {/* Email */}
            <a
              href="mailto:juan.arenas.rec@gmail.com"
              className="group flex flex-col items-center gap-3 transition-all duration-300"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-16 h-16 sm:w-24 sm:h-24 transition-all duration-300 group-hover:scale-125 group-hover:[filter:drop-shadow(0_0_14px_rgba(255,255,255,0.5))]"
              >
                {/* envelope body */}
                <path
                  d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"
                  className="fill-[#F2EFE6]/35 group-hover:fill-white transition-colors duration-300"
                />
                {/* V flap */}
                <path
                  d="M20 8l-8 5-8-5V6l8 5 8-5v2z"
                  className="fill-[#F2EFE6]/35 group-hover:fill-[#FF3B30] transition-colors duration-300"
                />
              </svg>
              <span className="text-xs uppercase tracking-widest text-[#F2EFE6]/35 group-hover:text-white transition-colors duration-300">Email</span>
            </a>
          </div>
        </Reveal>

        {/* Right — AI sidekick */}
        <Reveal delay={100} className="lg:col-span-2">
          {/* alien mascot + label */}
          <div className="flex items-center gap-3 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/img/claude-robot.png"
              alt="AI assistant"
              width={44}
              height={44}
              style={{ mixBlendMode: "screen" }}
              className="object-contain"
            />
            <p className="text-sm text-[#F2EFE6]/55 italic">
              I trained this chatbot to answer like me. Try it out!
            </p>
          </div>
          <div className="rounded-2xl border border-[#284A3C] bg-[#0e1813] flex flex-col overflow-hidden">
            {/* message thread */}
            <div ref={containerRef} className="flex-1 overflow-y-auto min-h-[200px] max-h-[340px] p-5 space-y-4">
              {messages.length === 0 ? null : (
                messages.map((m, i) => {
                  const hasText = m.role === "assistant" && m.content.includes("[TEXT_ME_BUTTON]");
                  const hasEmail = m.role === "assistant" && m.content.includes("[EMAIL_ME_BUTTON]");
                  const hasLinkedIn = m.role === "assistant" && m.content.includes("[LINKEDIN_ME_BUTTON]");
                  const displayContent = m.content
                    .replace("[TEXT_ME_BUTTON]", "")
                    .replace("[EMAIL_ME_BUTTON]", "")
                    .replace("[LINKEDIN_ME_BUTTON]", "")
                    .trimEnd();
                  return (
                    <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          m.role === "user"
                            ? "bg-[#284A3C] text-[#F2EFE6]"
                            : "bg-[#1a2e24] text-[#F2EFE6]/90 font-display text-base"
                        }`}
                      >
                        <span className="whitespace-pre-wrap">{displayContent}</span>
                        {m.role === "assistant" && streaming && i === messages.length - 1 && m.content === "" && (
                          <span className="inline-block w-2 h-4 bg-[#C9A24B] ml-1 animate-pulse rounded-sm" />
                        )}
                        {m.role === "assistant" && streaming && i === messages.length - 1 && m.content !== "" && (
                          <span className="inline-block w-1.5 h-4 bg-[#C9A24B]/70 ml-0.5 animate-pulse rounded-sm align-middle" />
                        )}
                      </div>
                      {(hasText || hasEmail || hasLinkedIn) && !streaming && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {hasText && (
                            <a
                              href="sms:+13237753850"
                              className="inline-block rounded-full bg-[#C9A24B] text-[#13201A] px-5 py-2 text-xs font-medium uppercase tracking-widest hover:bg-[#d8b563] transition-colors"
                            >
                              Text me
                            </a>
                          )}
                          {hasEmail && (
                            <a
                              href="mailto:juan.arenas.rec@gmail.com"
                              className="inline-block rounded-full border border-[#C9A24B] text-[#C9A24B] px-5 py-2 text-xs font-medium uppercase tracking-widest hover:bg-[#C9A24B]/10 transition-colors"
                            >
                              Email me
                            </a>
                          )}
                          {hasLinkedIn && (
                            <a
                              href="https://linkedin.com/in/juanarenasmartin"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block rounded-full border border-[#9FC4AE] text-[#9FC4AE] px-5 py-2 text-xs font-medium uppercase tracking-widest hover:bg-[#9FC4AE]/10 transition-colors"
                            >
                              LinkedIn
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* input bar */}
            <div className="border-t border-[#284A3C] px-4 py-3 flex gap-3 items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
                placeholder="Ask AI Juan here:"
                disabled={streaming}
                className="flex-1 bg-transparent text-base sm:text-sm text-[#F2EFE6] placeholder-[#F2EFE6]/30 outline-none disabled:opacity-50"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || streaming}
                className="rounded-full bg-[#C9A24B] text-[#13201A] px-4 py-1.5 text-xs font-medium uppercase tracking-widest hover:bg-[#d8b563] transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {streaming ? "…" : "Send"}
              </button>
            </div>
          </div>
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
    <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24 border-t border-[#F2EFE6]/10">
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <Reveal>
          <div className="aspect-[4/4.25] rounded-3xl border border-[#284A3C] overflow-hidden relative">
            <div className="absolute left-0 right-0 bottom-0 h-[135%]">
              <Image
                src="/img/juan-usc.png"
                alt="Juan Arenas at USC"
                fill
                className="object-cover object-top"
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            </div>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div>
            <h2 className="font-display text-[clamp(2rem,4vw,3rem)] mb-6">
              Who I am.
            </h2>
            <p className="text-[#F2EFE6] text-lg font-medium leading-relaxed mb-4">
              My background is researching pharmacology; my day‑to‑day is
              delivering growth.
            </p>
            <p className="text-[#F2EFE6]/75 leading-relaxed mb-4">
              I started in the lab and moved toward where decisions get made.
              <br />
              Over time I went from Alzheimer&apos;s and toxicology research into
              sales and marketing work, closer to real decisions, real teams,
              and real outcomes.
            </p>
            <p className="text-[#F2EFE6]/75 leading-relaxed mb-4">
              I like connecting operators and leadership to push for the few
              goals that matter. I cut through the noise to make progress
              visible.
            </p>
            <p className="text-[#F2EFE6]/75 leading-relaxed mb-8">
              I work best with people who care about clarity. I&apos;m here to
              scale business operations and improve health outcomes.
            </p>
            <div className="flex gap-8 items-end">
              {/* LinkedIn */}
              <a
                href="https://linkedin.com/in/juanarenasmartin"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col items-center gap-2 text-[#F2EFE6]/35 hover:text-[#0A66C2] transition-all duration-300"
              >
                <svg
                  width="44" height="44" viewBox="0 0 24 24" fill="currentColor"
                  className="transition-all duration-300 group-hover:scale-125 group-hover:[filter:drop-shadow(0_0_10px_#0A66C2)]"
                >
                  <path d="M20.447 20.452H16.89v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a1.975 1.975 0 1 1 0-3.95 1.975 1.975 0 0 1 0 3.95zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                <span className="text-xs uppercase tracking-widest">LinkedIn</span>
              </a>
              {/* iMessage */}
              <a
                href="sms:+13237753850"
                className="group flex flex-col items-center gap-2 text-[#F2EFE6]/35 hover:text-[#34C759] transition-all duration-300"
              >
                <svg
                  width="44" height="44" viewBox="0 0 24 24" fill="currentColor"
                  className="transition-all duration-300 group-hover:scale-125 group-hover:[filter:drop-shadow(0_0_10px_#34C759)]"
                >
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 2.1.644 4.05 1.747 5.667L2 22l4.333-1.747A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
                </svg>
                <span className="text-xs uppercase tracking-widest">iMessage</span>
              </a>
              {/* Email */}
              <a
                href="mailto:juan.arenas.rec@gmail.com"
                className="group flex flex-col items-center gap-2 transition-all duration-300"
              >
                <svg
                  width="44" height="44" viewBox="0 0 24 24"
                  className="transition-all duration-300 group-hover:scale-125 group-hover:[filter:drop-shadow(0_0_10px_rgba(255,255,255,0.5))]"
                >
                  <path
                    d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"
                    className="fill-[#F2EFE6]/35 group-hover:fill-white transition-colors duration-300"
                  />
                  <path
                    d="M20 8l-8 5-8-5V6l8 5 8-5v2z"
                    className="fill-[#F2EFE6]/35 group-hover:fill-[#FF3B30] transition-colors duration-300"
                  />
                </svg>
                <span className="text-xs uppercase tracking-widest text-[#F2EFE6]/35 group-hover:text-white transition-colors duration-300">Email</span>
              </a>
            </div>
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
      className="px-6 md:px-12 lg:px-20 py-20 md:py-28 border-t border-[#F2EFE6]/10 relative"
    >
      <div className="pointer-events-none absolute inset-0 bg-[#284A3C] opacity-[0.07]" />
      <div className="relative max-w-4xl mx-auto text-center">
        <Reveal>
          <h2 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-tight">
            I turn complex science{" "}
            <span className="italic text-[#9FC4AE]">into revenue.</span>
          </h2>
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
    <footer className="px-6 md:px-12 lg:px-20 py-10 border-t border-[#F2EFE6]/10 text-xs text-[#F2EFE6]/40 flex flex-col md:flex-row gap-4 justify-between items-center">
      <div className="flex items-center gap-3">
        <Image
          src="/img/ja-logo.png"
          alt="JA monogram"
          width={32}
          height={32}
          className="rounded-sm opacity-80"
        />
        <span>Juan Arenas Martin · Los Angeles, CA</span>
      </div>
      <span>
        (323) 775-3850 · juan.arenas.rec@gmail.com ·
        linkedin.com/in/juanarenasmartin
      </span>
    </footer>
  );
}
