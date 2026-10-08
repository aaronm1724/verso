import { and, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { translations } from "../db/schema";
import { createDevLogger } from "../dev";
import { validateAlignment } from "./alignment";
import { LyricsTranslationSchema } from "./schema";
import type { TranslatedLyricLine, TranslationResult } from "./types";

const { devLog } = createDevLogger("translationCache");

export type TranslationCacheIdentity = {
  sourceFingerprint: string;
  contextFingerprint: string;
  targetLanguage: string;
  model: string;
  cacheVersion: string;
};

export type TranslationCacheRow = {
  targetLanguage: string;
  sourceLanguage: string;
  sourceLineCount: number;
  lines: unknown;
};

export type TranslationCachePayload = {
  sourceLanguage: string;
  sourceLineCount: number;
  lines: TranslatedLyricLine[];
};

export type TranslationCacheStore = {
  read(identity: TranslationCacheIdentity): Promise<TranslationCacheRow | null>;
  upsert(identity: TranslationCacheIdentity, payload: TranslationCachePayload): Promise<void>;
};

export type CacheLookup =
  | { status: "hit"; result: TranslationResult }
  | { status: "miss"; malformed: boolean }
  | { status: "read_failed" }
  | { status: "disabled" };

function cacheMeta(identity: TranslationCacheIdentity, sourceLineCount: number) {
  return {
    sourceFingerprintPrefix: identity.sourceFingerprint.slice(0, 8),
    contextFingerprintPrefix: identity.contextFingerprint.slice(0, 8),
    targetLanguage: identity.targetLanguage,
    model: identity.model,
    cacheVersion: identity.cacheVersion,
    sourceLineCount,
  };
}

// Driver errors can embed the connection string. Keep the name and code only.
function safeErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown };
    return {
      name: error.name,
      code: typeof withCode.code === "string" ? withCode.code : undefined,
    };
  }
  return { name: "UnknownThrownValue" };
}

function validateCachedRow(
  row: TranslationCacheRow,
  sourceLines: readonly string[],
  targetLanguage: string,
): TranslationResult | null {
  if (row.targetLanguage !== targetLanguage || row.sourceLineCount !== sourceLines.length) {
    return null;
  }

  const parsed = LyricsTranslationSchema.safeParse({
    sourceLanguage: row.sourceLanguage,
    lines: row.lines,
  });
  if (!parsed.success) {
    return null;
  }

  const lines = validateAlignment(sourceLines.length, parsed.data);
  if (!lines) {
    return null;
  }

  return {
    sourceLanguage: parsed.data.sourceLanguage,
    targetLanguage,
    lines,
  };
}

function createDrizzleTranslationCacheStore(): TranslationCacheStore {
  return {
    async read(identity) {
      const db = getDb();
      if (!db) {
        return null;
      }

      const rows = await db
        .select({
          targetLanguage: translations.targetLanguage,
          sourceLanguage: translations.sourceLanguage,
          sourceLineCount: translations.sourceLineCount,
          lines: translations.lines,
        })
        .from(translations)
        .where(
          and(
            eq(translations.sourceFingerprint, identity.sourceFingerprint),
            eq(translations.contextFingerprint, identity.contextFingerprint),
            eq(translations.targetLanguage, identity.targetLanguage),
            eq(translations.model, identity.model),
            eq(translations.cacheVersion, identity.cacheVersion),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    },
    async upsert(identity, payload) {
      const db = getDb();
      if (!db) {
        throw new Error("Translation cache store is unavailable");
      }

      await db
        .insert(translations)
        .values({
          sourceFingerprint: identity.sourceFingerprint,
          contextFingerprint: identity.contextFingerprint,
          targetLanguage: identity.targetLanguage,
          model: identity.model,
          cacheVersion: identity.cacheVersion,
          sourceLineCount: payload.sourceLineCount,
          sourceLanguage: payload.sourceLanguage,
          lines: payload.lines,
        })
        .onConflictDoUpdate({
          target: [
            translations.sourceFingerprint,
            translations.contextFingerprint,
            translations.targetLanguage,
            translations.model,
            translations.cacheVersion,
          ],
          set: {
            lines: payload.lines,
            sourceLanguage: payload.sourceLanguage,
            sourceLineCount: payload.sourceLineCount,
          },
        });
    },
  };
}

export function getTranslationCacheStore(): TranslationCacheStore | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  return createDrizzleTranslationCacheStore();
}

export async function loadCachedTranslation(
  store: TranslationCacheStore | null,
  input: { identity: TranslationCacheIdentity; sourceLines: readonly string[] },
): Promise<CacheLookup> {
  const meta = cacheMeta(input.identity, input.sourceLines.length);
  if (!store) {
    devLog("disabled", meta);
    return { status: "disabled" };
  }

  try {
    const row = await store.read(input.identity);
    if (!row) {
      devLog("miss", meta);
      return { status: "miss", malformed: false };
    }

    const result = validateCachedRow(row, input.sourceLines, input.identity.targetLanguage);
    if (!result) {
      devLog("miss", meta);
      return { status: "miss", malformed: true };
    }

    devLog("hit", meta);
    return { status: "hit", result };
  } catch (error) {
    devLog("read_failed", { ...meta, ...safeErrorDetails(error) });
    return { status: "read_failed" };
  }
}

export async function saveCachedTranslation(
  store: TranslationCacheStore | null,
  input: {
    identity: TranslationCacheIdentity;
    payload: TranslationCachePayload;
    repair: boolean;
  },
): Promise<void> {
  if (!store) {
    return;
  }

  const meta = cacheMeta(input.identity, input.payload.sourceLineCount);
  try {
    await store.upsert(input.identity, input.payload);
    if (input.repair) {
      devLog("repaired", meta);
    }
  } catch (error) {
    devLog("write_failed", { ...meta, ...safeErrorDetails(error) });
  }
}
