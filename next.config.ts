import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoids Next's auto-generated AGENTS.md/CLAUDE.md, which would duplicate .cursorrules.
  agentRules: false,
};

export default nextConfig;
