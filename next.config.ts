import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Verso uses .cursorrules as the single source of agent guidance;
  // disable Next.js's own generated AGENTS.md/CLAUDE.md to avoid duplicates.
  agentRules: false,
};

export default nextConfig;
