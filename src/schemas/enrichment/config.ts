/**
 * Enrichment Configuration Schema
 * ============================
 * Defines configuration options for data enrichment, including data sources,
 * matching strategies, and enrichment rules.
 */

import { z } from "zod";

// Data source configuration
export const enrichmentDataSource = z.object({
  provider: z.enum(["clay", "clearbit", "apollo", "custom"]),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  options: z.record(z.unknown()).optional(),
  rateLimits: z.object({
    requestsPerSecond: z.number().positive().default(2),
    maxConcurrent: z.number().positive().default(5),
    cooldownMs: z.number().nonnegative().default(1000)
  }).optional()
}).describe("Configuration for an enrichment data source");

// Field mapping configuration
export const fieldMapping = z.object({
  sourceField: z.string(),
  targetField: z.string(),
  transform: z.function()
    .args(z.unknown())
    .returns(z.unknown())
    .optional(),
  required: z.boolean().default(false)
}).describe("Mapping between source and target fields");

// Enrichment rules
export const enrichmentRule = z.object({
  field: z.string(),
  condition: z.enum(["missing", "empty", "always", "never"]).default("missing"),
  priority: z.number().int().min(1).max(100).default(50),
  provider: z.string(),
  fallback: z.unknown().optional()
}).describe("Rule for when and how to enrich a field");

// Entity-specific enrichment configuration
export const entityEnrichmentConfig = z.object({
  enabled: z.boolean().default(true),
  dataSources: z.array(enrichmentDataSource),
  fieldMappings: z.array(fieldMapping),
  rules: z.array(enrichmentRule),
  validation: z.object({
    validateBeforeEnrichment: z.boolean().default(true),
    validateAfterEnrichment: z.boolean().default(true),
    requiredFields: z.array(z.string()).default([])
  }),
  caching: z.object({
    enabled: z.boolean().default(true),
    ttlSeconds: z.number().positive().default(86400), // 24 hours
    strategy: z.enum(["memory", "redis", "database"]).default("memory")
  }).optional(),
  deduplication: z.object({
    enabled: z.boolean().default(true),
    fields: z.array(z.string()),
    threshold: z.number().min(0).max(1).default(0.8)
  }).optional()
}).describe("Entity-specific enrichment configuration");

// Main enrichment configuration
export const enrichmentConfig = z.object({
  person: entityEnrichmentConfig.optional(),
  organization: entityEnrichmentConfig.optional(),
  global: z.object({
    maxRetries: z.number().nonnegative().default(3),
    retryDelayMs: z.number().nonnegative().default(1000),
    timeout: z.number().positive().default(30000),
    concurrency: z.number().positive().default(5),
    logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
    dryRun: z.boolean().default(false)
  }).optional()
}).describe("Global enrichment configuration");

// Export types
export type EnrichmentDataSource = z.infer<typeof enrichmentDataSource>;
export type FieldMapping = z.infer<typeof fieldMapping>;
export type EnrichmentRule = z.infer<typeof enrichmentRule>;
export type EntityEnrichmentConfig = z.infer<typeof entityEnrichmentConfig>;
export type EnrichmentConfig = z.infer<typeof enrichmentConfig>; 