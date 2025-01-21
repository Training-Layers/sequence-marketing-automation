/**
 * Source Data Ingestion Output Schema
 * =================================
 * Define the output format and result structure for source data ingestion.
 */

import { z } from "zod";

// Output configuration schema
export const sourceDataIngestionOutput = z.object({
  // Processing preferences
  normalizeData: z.boolean().default(true)
    .describe("Whether to normalize the raw data"),
  includeMetadata: z.boolean().default(true)
    .describe("Include processing metadata in output"),
  errorHandling: z.enum(["fail", "skip", "partial"])
    .default("fail")
    .describe("How to handle processing errors"),
}).describe("Output configuration options");

// Processing result schema
export const sourceDataIngestionResult = z.object({
  // Record information
  sourceRecordId: z.string()
    .describe("ID of the created source record"),
  sourceType: z.string()
    .describe("Type of the source"),
  provider: z.string().optional()
    .describe("Provider name if applicable"),
  
  // Processing information
  processingStatus: z.enum(["pending", "processed", "failed"])
    .describe("Status of data processing"),
  processedAt: z.date().optional()
    .describe("When the record was processed"),
  
  // Data
  rawData: z.record(z.unknown())
    .describe("Original raw data"),
  normalizedData: z.record(z.unknown()).optional()
    .describe("Normalized data if processing succeeded"),
  
  // Error handling
  processingErrors: z.array(z.object({
    message: z.string(),
    code: z.string().optional(),
    timestamp: z.date(),
  })).optional()
    .describe("Any errors encountered during processing"),
  
  // Metadata
  metadata: z.record(z.unknown()).optional()
    .describe("Additional processing metadata"),
}).describe("Individual source record result");

// Export types
export type SourceDataIngestionOutput = z.infer<typeof sourceDataIngestionOutput>;
export type SourceDataIngestionResult = z.infer<typeof sourceDataIngestionResult>;

// Validation helpers
export const validateOutput = (output: unknown) => {
  return sourceDataIngestionOutput.safeParse(output);
};

export const validateResult = (result: unknown) => {
  return sourceDataIngestionResult.safeParse(result);
}; 