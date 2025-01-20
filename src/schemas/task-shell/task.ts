/**
 * Task Schema Shell
 * ================
 * Main schema file that composes all task-specific schemas.
 * Copy this directory to create schemas for a new task.
 * 
 * @fileoverview [EDIT REQUIRED] Brief description of what this task does
 * 
 * Example Usage:
 * ```typescript
 * const input = {
 *   url: "https://example.com/file",
 *   config: {
 *     // your config options
 *   }
 * };
 * const result = validateTaskInput(input);
 * ```
 */

import { z } from "zod";
import { genericUrlInput } from "../generic/input";
import { genericTrampData } from "../generic/trampdata";
import { genericCleanup } from "../generic/cleanup";
import { genericR2Storage } from "../generic/storage";

// Import task-specific schemas
import { taskshell_config } from "./config";
import { taskshell_output, taskshell_file_result } from "./output";

// [EDIT REQUIRED] Task metadata schema
// This defines what metadata is collected during task execution
export const taskshell_metadata = z.object({
  // Add metadata fields specific to your task
  // Example:
  // processingTime: z.number(),
  // sourceFormat: z.string(),
  // outputFormat: z.string(),
  // processingSteps: z.array(z.string())
});

// [EDIT REQUIRED] Combined input schema
// This extends the generic URL input with task-specific fields
export const taskshell_task = genericUrlInput.extend({
  // Required fields that all tasks need
  tenantId: z.string(),
  projectId: z.string(),
  userId: z.string().optional(),
  
  // Task-specific configuration
  config: taskshell_config.optional(),
  output: taskshell_output.optional(),
  
  // Storage configuration (if task stores files)
  storage: genericR2Storage.optional(),
  
  // Standard optional fields
  cleanup: genericCleanup.optional(),
  trampData: genericTrampData
});

// [EDIT REQUIRED] Task result schema
// This defines the structure of the task's output
export const taskshell_result = z.object({
  // Standard job information
  job: z.object({
    success: z.boolean(),
    taskName: z.literal("task-shell"), // Update with your task name
    runId: z.string(),
    input: z.object(taskshell_task.shape).omit({ trampData: true }),
    error: z.string().optional()
  }),
  // Task-specific results
  results: z.object({
    files: z.array(taskshell_file_result)
  }),
  // Execution metadata
  metadata: taskshell_metadata,
  // Preserved tramp data
  trampData: genericTrampData
});

/**
 * Validates the input payload against the task schema
 * @param input - The input payload to validate
 * @returns A SafeParseResult containing either the validated input or validation errors
 */
export const validateTaskInput = (input: unknown) => {
  return taskshell_task.safeParse(input);
};

// Export types for use in the task implementation
export type TaskShellTask = z.infer<typeof taskshell_task>;
export type TaskShellResult = z.infer<typeof taskshell_result>;
export type TaskShellMetadata = z.infer<typeof taskshell_metadata>; 