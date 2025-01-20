/**
 * Task Configuration Schema
 * =======================
 * Define configuration options specific to this task.
 * 
 * @fileoverview [EDIT REQUIRED] Describe what configuration options this task accepts
 * 
 * Example Usage:
 * ```typescript
 * const config = {
 *   quality: 80,
 *   format: "format1",
 *   flags: ["flag1", "flag2"]
 * };
 * const result = taskshell_config.safeParse(config);
 * ```
 */

import { z } from "zod";

// [EDIT REQUIRED] Task configuration schema
// This defines the available configuration options for the task
export const taskshell_config = z.object({
  // Add your task-specific configuration options
  // Common patterns:
  
  // Quality settings
  // quality: z.number().int().min(1).max(100).default(80)
  //   .describe("Quality level for processing (1-100)"),
  
  // Format selection
  // format: z.enum(["format1", "format2", "format3"])
  //   .default("format1")
  //   .describe("Output format to use"),
  
  // Processing flags
  // flags: z.array(z.string())
  //   .min(1)
  //   .max(10)
  //   .optional()
  //   .describe("Optional processing flags"),
  
  // Nested options
  // advanced: z.object({
  //   setting1: z.boolean().default(false),
  //   setting2: z.number().optional()
  // }).optional()
  //   .describe("Advanced configuration options")
}).describe("Task configuration options");

// Export the configuration type
export type TaskShellConfig = z.infer<typeof taskshell_config>;

// Optional: Export validation helper
export const validateConfig = (config: unknown) => {
  return taskshell_config.safeParse(config);
}; 