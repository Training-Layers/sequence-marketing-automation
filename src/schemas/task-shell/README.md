# Task Shell Schemas

This directory contains the schema templates for creating new tasks. Use these as a starting point when implementing a new task's schemas.

## Directory Structure

```
task-shell/
├── task.ts     # Combined schema and type exports
├── config.ts   # Task-specific configuration options
└── output.ts   # Output and result structures
```

## Schema Organization

1. **task.ts**
   - Main task schema that extends `genericUrlInput`
   - Combines all task-specific schemas
   - Exports types and validation helpers
   - Follows standard task schema pattern

2. **config.ts**
   - Task-specific configuration options
   - Validation rules for task settings
   - Defaults and constraints

3. **output.ts**
   - Output format configuration
   - Result structure definition
   - File/item result schemas

## Usage

1. **Copy the Directory**
   ```bash
   cp -r src/schemas/task-shell src/schemas/your-task-name
   ```

2. **Update Schema Names**
   - Replace `taskshell_` prefix with your task name
   - Example: `yourtask_config`, `yourtask_output`

3. **Implement Schemas**
   - Add your specific validation rules
   - Define your configuration options
   - Structure your output format

4. **Extend Generic Schemas**
   ```typescript
   import { genericUrlInput } from "../generic/input";
   
   export const yourtask_task = genericUrlInput.extend({
     // Your extensions
   });
   ```

## Best Practices

1. **Schema Reuse**
   - Check `generic/` directory first
   - Use existing patterns when possible
   - Consider making common patterns generic

2. **Type Safety**
   - Export TypeScript types for all schemas
   - Use `z.infer<typeof schema>`
   - Maintain strict validation

3. **Documentation**
   - Comment complex validation rules
   - Explain schema structure
   - Document any special handling

4. **Validation**
   - Include all required fields
   - Set appropriate defaults
   - Use descriptive error messages

## Common Patterns

1. **Input Validation**
   ```typescript
   // Required fields
   tenantId: z.string(),
   projectId: z.string(),
   userId: z.string().optional(),
   
   // Task configuration
   config: yourtask_config.optional(),
   
   // Standard fields
   cleanup: genericCleanup.optional(),
   trampData: genericTrampData
   ```

2. **Output Structure**
   ```typescript
   // Result schema
   export const yourtask_result = z.object({
     job: z.object({
       success: z.boolean(),
       taskName: z.literal("your-task-name"),
       runId: z.string(),
       input: z.object(yourtask_task.shape).omit({ trampData: true }),
       error: z.string().optional()
     }),
     results: z.object({
       // Your result structure
     }),
     metadata: yourtask_metadata,
     trampData: genericTrampData
   });
   ```

3. **Configuration Options**
   ```typescript
   export const yourtask_config = z.object({
     // Common patterns:
     quality: z.number().int().min(1).max(100).default(80),
     format: z.enum(["format1", "format2"]).default("format1"),
     flags: z.array(z.string()).optional()
   });
   ```

## References

- [Schema Organization Guide](../README.md)
- [Task Implementation Guide](../../trigger/README.md)
- [Zod Documentation](https://github.com/colinhacks/zod) 