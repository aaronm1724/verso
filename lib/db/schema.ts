import { char, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import type { TranslatedLyricLine } from "../translation/types";

export const translations = pgTable(
  "translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceFingerprint: char("source_fingerprint", { length: 64 }).notNull(),
    contextFingerprint: char("context_fingerprint", { length: 64 }).notNull(),
    targetLanguage: text("target_language").notNull(),
    model: text("model").notNull(),
    cacheVersion: text("cache_version").notNull(),
    sourceLineCount: integer("source_line_count").notNull(),
    sourceLanguage: text("source_language").notNull(),
    lines: jsonb("lines").$type<TranslatedLyricLine[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    unique("translations_cache_identity").on(
      table.sourceFingerprint,
      table.contextFingerprint,
      table.targetLanguage,
      table.model,
      table.cacheVersion,
    ),
  ],
);
