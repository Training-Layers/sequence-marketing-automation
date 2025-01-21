/**
 * Data Resolution Output Schema
 * ==========================
 * Defines the output format and result structure for data resolution.
 */

import { z } from "zod";
import { resolutionStrategy } from "./config";

// Resolution status enum
export const resolutionStatus = z.enum([
  "pending",      // Resolution not yet attempted
  "in_progress",  // Resolution is currently running
  "resolved",     // Successfully resolved
  "failed",       // Resolution failed
  "skipped"       // Resolution was skipped
]).describe("Status of the resolution process");

// Resolution error schema
export const resolutionError = z.object({
  message: z.string()
    .describe("Error message"),
  code: z.string()
    .describe("Error code for categorization"),
  details: z.record(z.unknown()).optional()
    .describe("Additional error details"),
  timestamp: z.string().datetime()
    .describe("When the error occurred")
}).describe("Resolution error information");

// Resolution match schema
export const resolutionMatch = z.object({
  recordId: z.string()
    .describe("ID of the matched record"),
  recordType: z.enum(["person", "organization"])
    .describe("Type of the matched record"),
  confidence: z.number().min(0).max(1)
    .describe("Match confidence score"),
  matchedFields: z.array(z.string())
    .describe("Fields that contributed to the match"),
  strategy: resolutionStrategy
    .describe("Strategy used for this match")
}).describe("Information about a successful match");

// Main result schema
export const dataResolutionResult = z.object({
  // Resolution status
  status: resolutionStatus
    .describe("Current status of resolution"),
  resolvedAt: z.string().datetime().optional()
    .describe("When resolution was completed"),
  
  // Match information (if successful)
  match: resolutionMatch.optional()
    .describe("Match details if resolution was successful"),
  
  // Error information (if failed)
  error: resolutionError.optional()
    .describe("Error details if resolution failed"),
  
  // Resolution metadata
  metadata: z.object({
    attempts: z.number()
      .describe("Number of resolution attempts"),
    processingTime: z.number()
      .describe("Time taken for resolution in ms"),
    strategy: resolutionStrategy
      .describe("Strategy used for resolution")
  }).optional()
}).describe("Data resolution result");

// Validation helper
export const validateResult = (result: unknown) => {
  return dataResolutionResult.safeParse(result);
};

// Export types
export type ResolutionStatus = z.infer<typeof resolutionStatus>;
export type ResolutionError = z.infer<typeof resolutionError>;
export type ResolutionMatch = z.infer<typeof resolutionMatch>;
export type DataResolutionResult = z.infer<typeof dataResolutionResult>; 