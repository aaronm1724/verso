CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_fingerprint" char(64) NOT NULL,
	"context_fingerprint" char(64) NOT NULL,
	"target_language" text NOT NULL,
	"model" text NOT NULL,
	"cache_version" text NOT NULL,
	"source_line_count" integer NOT NULL,
	"source_language" text NOT NULL,
	"lines" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translations_cache_identity" UNIQUE("source_fingerprint","context_fingerprint","target_language","model","cache_version")
);
