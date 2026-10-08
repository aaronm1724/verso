import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd(), true, {
  info() {},
  error() {},
});

const url = process.env.DATABASE_URL_DIRECT;
if (!url) {
  throw new Error("Missing required environment variable: DATABASE_URL_DIRECT");
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
