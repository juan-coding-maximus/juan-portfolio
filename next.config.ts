import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every deploy otherwise generates a fresh Server Actions encryption key, so
  // any tab left open across a deploy gets "Failed to find Server Action" on
  // its next click (confirmed 2026-08-19: Outbound's Mark sent). Vercel sets
  // VERCEL_GIT_COMMIT_SHA at build time (a 40-char full SHA; Vercel caps
  // deploymentId at 32, hence the slice); pairing that with a stable
  // NEXT_SERVER_ACTIONS_ENCRYPTION_KEY (set in Vercel env, not here) lets
  // Server Actions keep working across a deploy when their code didn't
  // change, and turns the cases that DO mismatch into an automatic hard
  // reload instead of a dead click. See self-hosting.md's Version Skew section.
  deploymentId: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 32),
  // The playbook pages read their markdown from src/.../playbook/content at
  // request time (fs.readFile on a manifest-driven path), which the static
  // tracer cannot see. Without this, the files exist locally and 404 on Vercel.
  outputFileTracingIncludes: {
    "/nutribiotic/playbook*": ["src/app/nutribiotic/playbook/content/**/*.md"],
  },
  // El Departamento case study is shipped as a static asset under
  // public/eldepartamento/ (generated from agency repo
  // projects/el-departamento-rebrand/demo, see DEPLOY.md). Each page has a
  // <base href="/eldepartamento/"> so relative assets resolve under the subpath.
  // This rewrite serves index.html for the bare /eldepartamento URL.
  async rewrites() {
    return [
      { source: "/eldepartamento", destination: "/eldepartamento/index.html" },
      // Agency-of-agents portfolio (portfolio-agency.html in the agency repo),
      // shipped as a static asset under public/stack/.
      { source: "/stack", destination: "/stack/index.html" },
    ];
  },
};

export default nextConfig;
