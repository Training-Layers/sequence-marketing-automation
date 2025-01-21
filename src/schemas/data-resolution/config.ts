/**
 * Data Resolution Configuration Schema
 * ================================
 * Defines configuration options for data resolution.
 */

import { z } from "zod";

// Resolution strategy enum
export const resolutionStrategy = z.enum([
  "exact_match",  // Only match if fields match exactly
  "fuzzy_match",  // Allow fuzzy matching with confidence threshold
  "merge",        // Merge with existing record if found
  "create_new"    // Always create new record
]).describe("Strategy for resolving data");

// Main configuration schema
export const dataResolutionConfig = z.object({
  // Resolution preferences
  strategy: resolutionStrategy.default("fuzzy_match")
    .describe("Primary resolution strategy"),
  
  // Matching configuration
  matching: z.object({
    threshold: z.number().min(0).max(1).default(0.8)
      .describe("Confidence threshold for fuzzy matching"),
    fields: z.array(z.string()).optional()
      .describe("Specific fields to use for matching"),
    caseSensitive: z.boolean().default(false)
      .describe("Whether matching should be case sensitive"),
    ignoreFields: z.array(z.string()).optional()
      .describe("Fields to ignore during matching")
  }).optional(),

  // Resolution options
  options: z.object({
    createMissing: z.boolean().default(true)
      .describe("Create new records if no match found"),
    updateExisting: z.boolean().default(true)
      .describe("Update existing records when matched"),
    mergeArrays: z.boolean().default(false)
      .describe("Merge array fields instead of replacing"),
    skipResolved: z.boolean().default(false)
      .describe("Skip already resolved records"),
    enrichAfterCreate: z.boolean().default(false)
      .describe("Enrich records after creation"),
    enrichAfterMerge: z.boolean().default(false)
      .describe("Enrich records after merging")
  }).optional(),

  // Validation options
  validation: z.object({
    validateBeforeResolution: z.boolean().default(true)
      .describe("Validate data before attempting resolution"),
    strictValidation: z.boolean().default(false)
      .describe("Enforce strict validation rules")
  }).optional()
}).describe("Data resolution configuration");

// Validation helper
export const validateConfig = (config: unknown) => {
  return dataResolutionConfig.safeParse(config);
};

// Export types
export type ResolutionStrategy = z.infer<typeof resolutionStrategy>;
export type DataResolutionConfig = z.infer<typeof dataResolutionConfig>; 