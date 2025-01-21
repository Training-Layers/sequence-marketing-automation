/**
 * Data Resolution Task Schema
 * ========================
 * Main schema file that composes all data resolution schemas.
 */

import { z } from "zod";
import { genericTrampData } from "../generic/trampdata";
import { dataResolutionConfig } from "./config";
import { dataResolutionResult } from "./output";

// Task metadata schema
export const dataResolutionMetadata = z.object({
  processingTime: z.number()
    .describe("Time taken to process the data in ms"),
  processingSteps: z.array(z.string())
    .describe("Steps taken during resolution"),
  validationResults: z.object({
    passed: z.boolean(),
    errors: z.array(z.string()).optional()
  }).optional()
    .describe("Results of data validation"),
  matchingStats: z.object({
    totalAttempts: z.number(),
    successfulMatches: z.number(),
    failedMatches: z.number(),
    averageConfidence: z.number()
  }).optional()
    .describe("Statistics about matching attempts")
}).describe("Task execution metadata");

// Combined input schema
export const dataResolutionTask = z.object({
  // Required fields
  sourceRecordId: z.string()
    .describe("ID of the source record to resolve"),
  
  // Optional configuration
  config: dataResolutionConfig.optional()
    .describe("Resolution configuration options"),
  
  // Standard fields
  trampData: genericTrampData
}).describe("Data resolution task input");

// Task result schema
export const dataResolutionTaskResult = z.object({
  // Standard job information
  job: z.object({
    success: z.boolean(),
    taskName: z.literal("data-resolution"),
    runId: z.string(),
    input: z.object(dataResolutionTask.shape).omit({ trampData: true }),
    error: z.string().optional()
  }),
  
  // Task-specific results
  success: z.boolean()
    .describe("Whether the resolution was successful"),
  data: dataResolutionResult.nullable()
    .describe("Resolution result data"),
  error: z.string().optional()
    .describe("Error message if resolution failed"),
  
  // Execution metadata
  metadata: dataResolutionMetadata,
  
  // Preserved tramp data
  trampData: genericTrampData
}).describe("Data resolution task result");

// Validation helper
export const validateTaskInput = (input: unknown) => {
  return dataResolutionTask.safeParse(input);
};

// Export types
export type DataResolutionTask = z.infer<typeof dataResolutionTask>;
export type DataResolutionTaskResult = z.infer<typeof dataResolutionTaskResult>;
export type DataResolutionMetadata = z.infer<typeof dataResolutionMetadata>; 