/**
 * Source Data Ingestion Task Schema
 * ===============================
 * Main schema file that composes all source data ingestion schemas.
 * 
 * @fileoverview Defines schemas for ingesting data from various sources into the system
 */

import { z } from 'zod';
import { genericTrampData } from '../generic/trampdata';
import { sourceDataIngestionConfig } from "./config";
import { sourceDataIngestionOutput, sourceDataIngestionResult } from "./output";

// Task metadata schema
export const sourceDataIngestionMetadata = z.object({
  processingTime: z.number()
    .describe("Time taken to process the data in ms"),
  sourceFormat: z.string()
    .describe("Format of the source data"),
  validationResults: z.object({
    passed: z.boolean(),
    errors: z.array(z.string()).optional(),
  }).optional()
    .describe("Results of data validation"),
  processingSteps: z.array(z.string())
    .describe("Steps taken during processing"),
}).describe("Task execution metadata");

// Combined input schema
export const sourceDataIngestionTask = z.object({
  // Required fields
  source: sourceDataIngestionConfig.shape.source,
  data: z.unknown()
    .describe("Raw data from the source"),

  // Optional configuration
  config: sourceDataIngestionConfig.omit({ source: true }).optional(),
  output: sourceDataIngestionOutput.optional(),
  
  // Standard fields
  trampData: genericTrampData,
}).describe("Source data ingestion task input");

// Task result schema
export const sourceDataIngestionTaskResult = z.object({
  // Standard job information
  job: z.object({
    success: z.boolean(),
    taskName: z.literal("source-data-ingestion"),
    runId: z.string(),
    input: z.object(sourceDataIngestionTask.shape).omit({ trampData: true }),
    error: z.string().optional(),
  }),
  
  // Task-specific results
  results: sourceDataIngestionResult,
  
  // Execution metadata
  metadata: sourceDataIngestionMetadata,
  
  // Preserved tramp data
  trampData: genericTrampData,
}).describe("Source data ingestion task result");

// Validation helper
export const validateTaskInput = (input: unknown) => {
  return sourceDataIngestionTask.safeParse(input);
};

// Export types
export type SourceDataIngestionTask = z.infer<typeof sourceDataIngestionTask>;
export type SourceDataIngestionTaskResult = z.infer<typeof sourceDataIngestionTaskResult>;
export type SourceDataIngestionMetadata = z.infer<typeof sourceDataIngestionMetadata>; 