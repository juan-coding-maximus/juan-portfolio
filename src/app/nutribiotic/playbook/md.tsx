/**
 * House-styled markdown for the playbook shelf. Server component; react-markdown
 * with GFM (the docs lean on tables). The first H1 is stripped by the caller,
 * PageHead owns the title. Relative .md links resolve to shelf slugs so the
 * docs cross-reference as pages, not as file paths.
 */

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { slugForMdLink } from "./manifest";

export function Markdown({ source, fromFile }: { source: string; fromFile: string }) {
  return (
    <div className="max-w-[76ch]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2 className="mt-9 mb-3 font-[family-name:var(--font-fraunces)] text-[21px] font-semibold tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h2 className="mt-9 mb-3 font-[family-name:var(--font-fraunces)] text-[19px] font-semibold tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-6 mb-2 font-[family-name:var(--font-fraunces)] text-[15.5px] font-semibold tracking-tight">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-3.5 text-[14px] leading-relaxed text-[#3D4A44]">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3.5 flex list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-[#3D4A44] marker:text-[#8A928C]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3.5 flex list-decimal flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-[#3D4A44] marker:text-[#8A928C]">
              {children}
            </ol>
          ),
          strong: ({ children }) => <strong className="font-semibold text-[#14201B]">{children}</strong>,
          a: ({ href, children }) => {
            const slug = href ? slugForMdLink(fromFile, href) : null;
            if (slug) {
              return (
                <Link
                  href={`/nutribiotic/playbook/${slug}`}
                  className="font-medium text-[#2C6A46] underline decoration-[#2C6A46]/40 underline-offset-2 hover:decoration-[#2C6A46]"
                >
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={href}
                className="font-medium text-[#2C6A46] underline decoration-[#2C6A46]/40 underline-offset-2 hover:decoration-[#2C6A46]"
              >
                {children}
              </a>
            );
          },
          code: ({ children }) => (
            <code className="rounded bg-[#F3F1EA] px-1 py-0.5 font-mono text-[12.5px] text-[#14201B]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-3.5 overflow-x-auto rounded-md border border-[#E2DFD5] bg-[#FBFAF6] p-4 font-mono text-[12px] leading-relaxed text-[#3D4A44] [&_code]:bg-transparent [&_code]:p-0">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3.5 border-l-2 border-[#2C6A46] pl-4 text-[#5B6560]">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-6 border-[#E2DFD5]" />,
          table: ({ children }) => (
            <div className="mb-4 overflow-x-auto rounded-md border border-[#E2DFD5]">
              <table className="w-full border-collapse text-[13px] leading-relaxed">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#FBFAF6] text-left text-[11.5px] uppercase tracking-[0.08em] text-[#5B6560]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-[#E2DFD5] px-3.5 py-2.5 font-medium">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-[#EEECE3] px-3.5 py-2.5 align-top text-[#3D4A44] last:border-b-0">
              {children}
            </td>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
