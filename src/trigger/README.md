# Creating New Tasks

This guide explains how to create new tasks in a consistent way. Follow these steps and patterns to ensure your task integrates well with the system.

## Task Implementation Checklist

1. **Plan Your Task Structure**
   - Identify required and optional inputs
   - Define expected outputs
   - Consider what generic components you can reuse

2. **Create Schema Files**
   ```
   src/schemas/your_task/
   ├── task.ts           # Combined schema
   ├── specific1.ts      # Task-specific schema 1
   └── specific2.ts      # Task-specific schema 2
   ```
   See: [Schema Organization Guide](../schemas/README.md)

3. **Create Task Registry Entry**
   ```
   src/task-registry/your_task.task.json
   ```
   See: [Task Registry Guide](../registry/README.md)

4. **Implement Task File**
   ```
   src/trigger/your_task.ts
   ```

5. **Update Registry**
   ```bash
   # From project root
   npm run generate-registry
   # Or directly:
   npx ts-node scripts/generate-registry.ts
   ```
   This will:
   - Scan for all task files
   - Read their registry JSON files
   - Update src/registry/tasks.ts
   - Show any validation errors

## Task Implementation Template

```typescript
// src/trigger/your_task.ts
import { task } from "@trigger.dev/sdk/v3";
import { validateYourTaskInput, type YourTaskInput } from "../schemas/your_task/task";

interface TaskResult {
  success: boolean;
  // ... other result fields
}

// Main task function
async function runTask(
  payload: YourTaskInput,
  logger: Console
): Promise<TaskResult> {
  // 1. Validate input
  const validationResult = validateYourTaskInput(payload);
  if (!validationResult.success) {
    logger.error("Invalid input payload", validationResult.error.format());
    return {
      success: false,
      error: "Invalid input: " + validationResult.error.message
    };
  }

  try {
    // 2. Your task implementation here
    
    // 3. Return success result
    return {
      success: true,
      // ... other result fields
    };
  } catch (error) {
    // 4. Handle errors
    logger.error("Task failed", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Task export
export const yourTask = task({
  id: "your_task_id",
  machine: {
    preset: "medium-1x",  // Adjust based on needs
  },
  run: async (payload: YourTaskInput, { ctx }) => {
    return runTask(payload, console);
  }
});
```

## Schema Organization

1. **Generic Schemas** - Check these first!
   ```typescript
   import { genericUrlInput } from "../schemas/generic/input";
   import { genericR2Storage } from "../schemas/generic/storage";
   import { genericCleanup } from "../schemas/generic/cleanup";
   ```

2. **Task-Specific Schemas**
   ```typescript
   // src/schemas/your_task/specific.ts
   import { z } from "zod";
   
   export const yourtask_specific = z.object({
     // Your specific validation rules
   });
   ```

3. **Combined Task Schema**
   ```typescript
   // src/schemas/your_task/task.ts
   import { z } from "zod";
   import { genericUrlInput } from "../generic/input";
   import { yourtask_specific } from "./specific";
   
   export const yourtask_task = genericUrlInput.extend({
     specific: yourtask_specific.optional(),
     // ... other options
   });
   ```

## Task Registry Entry

```json
{
  "name": "Your Task Name",
  "file": "src/trigger/your_task.ts",
  "description": "Clear description of what your task does",
  "input": {
    "required": {
      "url": {
        "type": "string",
        "description": "What this URL is for"
      }
    },
    "optional": {
      "specific": {
        "type": "object",
        "description": "Task-specific options",
        "properties": {
          // Your specific options
        }
      }
    }
  },
  "output": {
    "success": {
      "type": "boolean",
      "description": "Whether the task succeeded"
    }
    // ... other output fields
  }
}
```

## Best Practices

1. **Input Validation**
   - Always validate inputs using Zod schemas
   - Use generic schemas where possible
   - Keep validation logic in schema files

2. **Error Handling**
   - Catch and log all errors
   - Return meaningful error messages
   - Clean up resources in error cases

3. **Resource Management**
   - Use cleanup options for temporary files
   - Close connections and streams
   - Handle timeouts appropriately

4. **Logging**
   - Log important operations
   - Include relevant context in logs
   - Use appropriate log levels

5. **Testing**
   - Test with various inputs
   - Test error cases
   - Verify cleanup works

## Common Patterns

1. **File Downloads**
   ```typescript
   const response = await fetch(url);
   const buffer = await response.arrayBuffer();
   await writeFile(tempPath, Buffer.from(buffer));
   ```

2. **R2 Storage**
   ```typescript
   if (!payload.storage?.skipR2Upload) {
     const upload = new Upload({
       client: s3Client,
       params: {
         Bucket: process.env.R2_BUCKET ?? "",
         Key: r2Key,
         Body: createReadStream(outputPath)
       }
     });
     await upload.done();
   }
   ```

3. **Cleanup**
   ```typescript
   if (payload.cleanup?.cleanupStrategy !== "none") {
     await unlink(tempPath);
   }
   ```

## References

- [Schema Organization Guide](../schemas/README.md)
- [Task Registry Guide](../registry/README.md)
- [Zod Documentation](https://github.com/colinhacks/zod)
- [Trigger.dev SDK Documentation](https://trigger.dev/docs/sdk)

## Task Implementation

### Input Handling

Tasks can receive arbitrary data through the tramp data field:

```typescript
interface TaskInput {
  url: string;
  trampData?: Record<string, unknown>;  // Optional arbitrary data
  // ... other fields
}

export async function runTask(
  payload: TaskInput,
  logger: Console
): Promise<TaskOutput> {
  // Validate input
  const validationResult = validateInput(payload);
  if (!validationResult.success) {
    return {
      success: false,
      error: validationResult.error.message,
      trampData: payload.trampData  // Return tramp data unchanged
    };
  }

  // Extract tramp data before processing
  const { trampData, ...input } = payload;

  try {
    // Process the task...
    const results = await processTask(input);

    // Return results with tramp data
    return {
      success: true,
      results,
      trampData  // Include original tramp data
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      trampData  // Include tramp data even on error
    };
  }
}

### Best Practices for Tramp Data

1. **Always Preserve**
   - Return tramp data unchanged in all cases
   - Include in both success and error responses

2. **Type Safety**
   - Use `Record<string, unknown>` for type safety
   - Don't assume any structure in the tramp data

3. **Separation**
   - Keep tramp data separate from task logic
   - Don't modify or validate tramp data contents

4. **Documentation**
   - Document that tramp data is available
   - Show examples of common use cases

// ... rest of the file ... 