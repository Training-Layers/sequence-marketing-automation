// src/schemas/clickup/task.ts
import { z } from "zod";
import { genericTrampData } from "../generic/trampdata";

// Enums for task types and statuses
export const clickupTaskType = z.enum([
  "person_followup",
  "org_review"
]);

export const clickupTaskSource = z.enum([
  "lead",
  "enrichment",
  "scoring",
  "manual"
]);

// Base schema for ClickUp task creation
export const clickupTaskInput = z.object({
  name: z.string(),
  description: z.string().optional(),
  priority: z.number().optional(),
  dueDate: z.string().datetime().optional(),
  type: clickupTaskType,
  source: clickupTaskSource,
  organizationId: z.string().optional(),
  personId: z.string().optional(),
  sourceRecordId: z.string().optional(),
  entityType: z.enum(["person", "organization"]),
  entityId: z.string(),
  assignees: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
  trampData: genericTrampData
});

// Output schemas
export const clickupTaskOutput = z.object({
  success: z.boolean(),
  data: z.object({
    taskId: z.string(),
    clickupId: z.string(),
    entityType: z.enum(["person", "organization"]),
    entityId: z.string()
  }).optional(),
  error: z.string().optional(),
  trampData: genericTrampData
});

// Type exports
export type ClickUpTaskInput = z.infer<typeof clickupTaskInput>;
export type ClickUpTaskOutput = z.infer<typeof clickupTaskOutput>;
