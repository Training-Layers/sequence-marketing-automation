/**
 * Task Output Schema
 * =================
 * Define the output format and result structure for this task.
 * 
 * @fileoverview [EDIT REQUIRED] Describe the output structure and format options
 * 
 * Example Usage:
 * ```typescript
 * const output = {
 *   format: "json",
 *   compression: "none"
 * };
 * const result = taskshell_output.safeParse(output);
 * ```
 */

import { z } from "zod";

// [EDIT REQUIRED] Task output configuration schema
// This defines how the task should format its output
export const taskshell_output = z.object({
  // Define how the task should format its output
  // Common patterns:
  
  // Output format
  // format: z.enum(["json", "text", "binary"])
  //   .default("json")
  //   .describe("Format of the output data"),
  
  // Compression options
  // compression: z.enum(["none", "gzip", "zip"])
  //   .default("none")
  //   .describe("Compression to apply to output"),
  
  // Output location
  // destination: z.object({
  //   bucket: z.string().optional(),
  //   prefix: z.string().optional()
  // }).optional()
  //   .describe("Where to store the output")
}).describe("Output configuration options");

// [EDIT REQUIRED] Task result schema
// This defines the structure of each processed file/item result
export const taskshell_file_result = z.object({
  // Define the structure of each processed file/item result
  // Common patterns:
  
  // File information
  // url: z.string().url()
  //   .describe("URL where the file can be accessed"),
  // size: z.number()
  //   .describe("Size of the file in bytes"),
  // format: z.string()
  //   .describe("Format of the processed file"),
  
  // Processing information
  // duration: z.number().optional()
  //   .describe("Processing duration in milliseconds"),
  // steps: z.array(z.string()).optional()
  //   .describe("Processing steps completed"),
  
  // Metadata
  // metadata: z.record(z.unknown()).optional()
  //   .describe("Additional file metadata")
}).describe("Individual file/item result");

// Export types
export type TaskShellOutput = z.infer<typeof taskshell_output>;
export type TaskShellFileResult = z.infer<typeof taskshell_file_result>;

// Optional: Export validation helpers
export const validateOutput = (output: unknown) => {
  return taskshell_output.safeParse(output);
};

export const validateFileResult = (result: unknown) => {
  return taskshell_file_result.safeParse(result);
}; 