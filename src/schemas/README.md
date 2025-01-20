# Schema Organization Guide

This directory contains all Zod schemas used for task validation. The schemas are organized in a way that promotes reuse and maintains clear separation of concerns.

## Directory Structure

```
src/schemas/
├── generic/           # Reusable schemas that apply across multiple tasks
│   ├── input.ts      # Common input patterns (e.g., URL inputs)
│   ├── storage.ts    # Storage-related schemas (e.g., R2 options)
│   └── cleanup.ts    # Cleanup and temp file handling
├── audiostripper/    # Task-specific schemas
│   ├── ffmpeg.ts     # FFmpeg options for audio stripping
│   ├── output.ts     # Output format options
│   └── task.ts       # Combined task schema
└── other-task/       # Other task-specific schemas
```

## Schema Organization Principles

1. **Generic vs. Specific**
   - Put schemas in `generic/` if they:
     - Are used by multiple tasks
     - Handle common patterns (URL inputs, file storage, cleanup)
     - Don't contain task-specific logic
   - Put schemas in task-specific directories if they:
     - Are unique to that task
     - Contain task-specific validation rules
     - Won't be reused elsewhere

2. **Schema File Organization**
   - Each schema file should export:
     - The Zod schema
     - TypeScript type derived from the schema
   - Example:
   ```typescript
   import { z } from "zod";
   
   export const mySchema = z.object({...});
   export type MySchema = z.infer<typeof mySchema>;
   ```

## How to Use Existing Schemas

1. **First, Search for Existing Schemas**
   ```typescript
   // Check generic schemas first
   import { genericUrlInput } from "../generic/input";
   import { genericR2Storage } from "../generic/storage";
   
   // Then task-specific schemas
   import { audiostripper_ffmpeg } from "./audiostripper/ffmpeg";
   ```

2. **Extending Generic Schemas**
   ```typescript
   // Example: Extending generic URL input with task-specific fields
   export const myTaskInput = genericUrlInput.extend({
     additionalField: z.string(),
     options: myTaskOptions
   });
   ```

3. **Combining Multiple Schemas**
   ```typescript
   // Example: Combining generic and specific schemas
   export const myTask = z.object({
     ...genericUrlInput.shape,
     ...genericR2Storage.shape,
     taskSpecific: myTaskSpecificSchema
   });
   ```

## Creating New Schemas

1. **Deciding Where to Put New Schemas**
   - Ask yourself:
     - Will this be used by multiple tasks?
     - Is this a common pattern?
     - Is this specific to one task?

2. **Creating Generic Schemas**
   ```typescript
   // src/schemas/generic/my-pattern.ts
   import { z } from "zod";
   
   export const genericMyPattern = z.object({
     // Common fields that will be reused
     field1: z.string(),
     field2: z.number()
   });
   
   export type GenericMyPattern = z.infer<typeof genericMyPattern>;
   ```

3. **Creating Task-Specific Schemas**
   ```typescript
   // src/schemas/my-task/specific.ts
   import { z } from "zod";
   import { genericMyPattern } from "../generic/my-pattern";
   
   export const myTask_specific = genericMyPattern.extend({
     // Task-specific fields
     taskField: z.boolean()
   });
   
   export type MyTaskSpecific = z.infer<typeof myTask_specific>;
   ```

## Naming Conventions

1. **Generic Schemas**
   - Prefix: `generic`
   - Format: camelCase
   - Example: `genericUrlInput`, `genericR2Storage`

2. **Task-Specific Schemas**
   - Prefix: task name
   - Separator: underscore
   - Suffix: purpose
   - Example: `audiostripper_ffmpeg`, `audiostripper_output`

3. **Combined Task Schemas**
   - Location: `task.ts` in task directory
   - Name: `taskname_task`
   - Example: `audiostripper_task`

## Example: Adding a New Task

1. **Check Existing Schemas**
   ```typescript
   // Can I use these?
   import { genericUrlInput } from "../generic/input";
   import { genericR2Storage } from "../generic/storage";
   ```

2. **Create Task Directory**
   ```
   mkdir src/schemas/my-new-task/
   ```

3. **Create Task-Specific Schemas**
   ```typescript
   // src/schemas/my-new-task/options.ts
   export const mynewtask_options = z.object({...});
   
   // src/schemas/my-new-task/task.ts
   export const mynewtask_task = genericUrlInput.extend({
     options: mynewtask_options,
     storage: genericR2Storage.optional()
   });
   ```

## Best Practices

1. **Schema Reuse**
   - Always check `generic/` first
   - Don't duplicate existing schemas
   - Consider making task-specific schemas generic if they could be reused

2. **Schema Organization**
   - One schema per file for specific purposes
   - Combined schemas in `task.ts`
   - Clear file and export names

3. **Type Safety**
   - Always export TypeScript types
   - Use `z.infer<typeof schema>`
   - Maintain strict type checking

4. **Documentation**
   - Comment complex validation rules
   - Explain why certain schemas are structured certain ways
   - Update this README when adding new patterns

5. **Testing**
   - Test schema validation
   - Include edge cases
   - Verify type inference

## Common Patterns

1. **URL Inputs**
   ```typescript
   import { genericUrlInput } from "../generic/input";
   ```

2. **R2 Storage**
   ```typescript
   import { genericR2Storage } from "../generic/storage";
   ```

3. **Cleanup Options**
   ```typescript
   import { genericCleanup } from "../generic/cleanup";
   ```

4. **Combining for Tasks**
   ```typescript
   export const mytask_task = genericUrlInput.extend({
     options: mytask_specific,
     storage: genericR2Storage.optional(),
     cleanup: genericCleanup.optional()
   });
   ```

## Generic Schemas

The `src/schemas/generic/` directory contains reusable schemas for common patterns:

1. **Input Schemas**
   ```typescript
   import { genericUrlInput } from "../generic/input";
   import { genericTrampData } from "../generic/trampdata";
   ```

2. **Storage Schemas**
   ```typescript
   import { genericR2Storage } from "../generic/storage";
   ```

3. **Cleanup Schemas**
   ```typescript
   import { genericCleanup } from "../generic/cleanup";
   ```

## Special Schemas

### Tramp Data

The tramp data schema (`src/schemas/generic/trampdata.ts`) provides a way to pass arbitrary data through tasks:

```typescript
import { genericTrampData } from "../generic/trampdata";

// In your task schema:
export const mytask_task = genericUrlInput.extend({
  trampData: genericTrampData,  // Optional field for arbitrary data
  // ... other fields
});
```

Key features:
- Uses `z.record(z.unknown())` to accept any JSON-serializable data
- Always optional (`.optional()`)
- No validation of contents
- Preserved through task execution
- Available in both input and output types

Common use cases:
1. Passing job IDs or correlation IDs
2. Including metadata about the request
3. Maintaining context in task chains
4. Adding custom fields without schema changes

// ... rest of the file ... 