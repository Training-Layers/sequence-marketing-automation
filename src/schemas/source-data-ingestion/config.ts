/**
 * Source Data Ingestion Configuration Schema
 * ========================================
 * Define configuration options for source data ingestion.
 */

import { z } from "zod";

// Source types enum
export const sourceTypes = z.enum([
  "lead_form",
  "ad_platform",
  "google_analytics",
  "mixpanel",
  "postgres_import",
  "app_signup",
  "manual_entry",
  "enrichment",
  "api"
]);

// Source configuration schema
export const sourceDataIngestionConfig = z.object({
  // Source metadata
  source: z.object({
    type: sourceTypes,
    provider: z.string().optional()
      .describe("Provider or platform name"),
    batchId: z.string().optional()
      .describe("Batch identifier for grouped records"),
    externalId: z.string().optional()
      .describe("External identifier from the source system"),
  }).describe("Source metadata information"),

  // Processing options
  validation: z.object({
    skipValidation: z.boolean().default(false)
      .describe("Skip data validation"),
    strictMode: z.boolean().default(true)
      .describe("Enforce strict schema validation"),
  }).optional().describe("Data validation options"),

  // Deduplication options
  deduplication: z.object({
    enabled: z.boolean().default(true)
      .describe("Enable deduplication checks"),
    strategy: z.enum(["skip", "update", "create_new"]).default("update")
      .describe("How to handle duplicate records"),
  }).optional().describe("Deduplication configuration"),
}).describe("Source data ingestion configuration");

// Export types
export type SourceTypes = z.infer<typeof sourceTypes>;
export type SourceDataIngestionConfig = z.infer<typeof sourceDataIngestionConfig>;

// Validation helper
export const validateConfig = (config: unknown) => {
  return sourceDataIngestionConfig.safeParse(config);
}; 