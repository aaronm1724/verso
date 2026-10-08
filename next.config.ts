import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip Next's generated AGENTS.md / CLAUDE.md. Project rules live in .cursor/rules.
  agentRules: false,
};

export default nextConfig;
