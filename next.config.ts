import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
