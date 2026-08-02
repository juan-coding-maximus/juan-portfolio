/**
 * One playbook document, read from ./content at request time and rendered in
 * house style. The first H1 is stripped: PageHead owns the title. The footer
 * names the source file so nobody ever wonders which copy is canonical.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { promises as fs } from "fs";
import path from "path";
import { PageHead, Ico } from "../../lib/ui";
import { DOCS, docBySlug } from "../manifest";
import { Markdown } from "../md";

export async function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const doc = docBySlug((await params).slug);
  return { title: doc ? `${doc.title} · NutriBiotic OS` : "Playbook · NutriBiotic OS" };
}

function stripLeadingH1(md: string): string {
  return md.replace(/^#\s[^\n]*\n+/, "");
}

export default async function PlaybookDoc({ params }: { params: Promise<{ slug: string }> }) {
  const doc = docBySlug((await params).slug);
  if (!doc) notFound();

  let source: string;
  try {
    source = await fs.readFile(
      path.join(process.cwd(), "src/app/nutribiotic/playbook/content", doc.file),
      "utf8",
    );
  } catch {
    /* The manifest promised a file the deploy does not carry. Say so instead of
       rendering an empty page that looks like an empty document. */
    return (
      <>
        <PageHead title={doc.title} />
        <p className="text-[14px] text-[#9C4A1C]">
          This document is in the manifest but its file did not ship with the deploy. Nothing is
          shown rather than something guessed. Source expected at playbook/content/{doc.file}.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="mb-4">
        <Link
          href="/nutribiotic/playbook"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#5B6560] transition-colors hover:text-[#14201B]"
        >
          <Ico name="book" size={13} />
          Playbook
        </Link>
      </div>

      <PageHead title={doc.title} sub={doc.blurb} />

      <Markdown source={stripLeadingH1(source)} fromFile={doc.file} />

      <p className="mt-8 max-w-[70ch] border-t border-[#E2DFD5] pt-4 text-[12px] leading-relaxed text-[#8A928C]">
        Rendered from playbook/content/{doc.file}, the canonical copy. Edits land through the repo
        and ship on deploy; the Desktop bundle&apos;s copy is derived and disposable.
      </p>
    </>
  );
}
