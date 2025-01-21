/**
 * Enrichment Task Schema
 * ====================
 * Schema for enrichment task input and output.
 */

import { z } from "zod";
import { genericTrampData } from "../generic/trampdata";
import { enrichmentConfig } from "./config";

// Enrichment result for a single field
export const enrichmentFieldResult = z.object({
  field: z.string(),
  enriched: z.boolean(),
  provider: z.string(),
  originalValue: z.unknown().optional(),
  enrichedValue: z.unknown().optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
  error: z.string().optional()
}).describe("Result of enriching a single field");

// Enrichment result for an entity
export const enrichmentEntityResult = z.object({
  entityType: z.enum(["person", "organization"]),
  entityId: z.string(),
  status: z.enum(["success", "partial", "failed", "skipped"]),
  fields: z.array(enrichmentFieldResult),
  providers: z.array(z.string()),
  startTime: z.date(),
  endTime: z.date(),
  duration: z.number(),
  error: z.string().optional(),
  metadata: z.object({
    totalFields: z.number(),
    enrichedFields: z.number(),
    failedFields: z.number(),
    skippedFields: z.number(),
    averageConfidence: z.number().optional()
  })
}).describe("Result of enriching an entity");

// Task input schema
export const enrichmentInput = z.object({
  sourceRecordId: z.string(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  config: enrichmentConfig.optional(),
  trampData: genericTrampData
}).describe("Input for enrichment task");

// Task output schema
export const enrichmentOutput = z.object({
  job: z.object({
    success: z.boolean(),
    taskName: z.literal("enrichment"),
    runId: z.string(),
    input: z.object({
      sourceRecordId: z.string(),
      config: enrichmentConfig.optional()
    }),
    error: z.string().optional()
  }),
  success: z.boolean(),
  data: z.object({
    person: enrichmentEntityResult.optional(),
    organization: enrichmentEntityResult.optional()
  }).optional(),
  error: z.string().optional(),
  metadata: z.object({
    processingTime: z.number(),
    processingSteps: z.array(z.string()),
    validationResults: z.object({
      passed: z.boolean(),
      errors: z.array(z.string()).optional()
    }),
    enrichmentStats: z.object({
      totalEntities: z.number(),
      successfulEntities: z.number(),
      failedEntities: z.number(),
      totalFields: z.number(),
      enrichedFields: z.number(),
      failedFields: z.number(),
      averageConfidence: z.number().optional()
    })
  }),
  trampData: genericTrampData
}).describe("Output from enrichment task");

// Export types
export type EnrichmentFieldResult = z.infer<typeof enrichmentFieldResult>;
export type EnrichmentEntityResult = z.infer<typeof enrichmentEntityResult>;
export type EnrichmentInput = z.infer<typeof enrichmentInput>;
export type EnrichmentOutput = z.infer<typeof enrichmentOutput>;