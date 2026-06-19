import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El Departamento case study lives in its own Vercel project
  // (eldepartamento.vercel.app, gated by `investegas`). We surface it under
  // /eldepartamento on the portfolio via a proxy so there is a single source.
  // skipTrailingSlashRedirect stops Next from 308-stripping /eldepartamento/
  // (which otherwise loops against the redirect below).
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      { source: "/eldepartamento", destination: "/eldepartamento/", permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/eldepartamento/:path*",
        destination: "https://eldepartamento.vercel.app/:path*",
      },
    ];
  },
};

export default nextConfig;
