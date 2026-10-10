import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Non-secret marker inlined into browser code so direct Supabase Storage
  // writes can distinguish Vercel Preview from Production (both use
  // NODE_ENV=production). Locally, writes are fenced to Development.
  env: {
    NEXT_PUBLIC_NAVI_DEPLOYMENT_ENV: process.env.VERCEL_ENV ?? "local",
  },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
