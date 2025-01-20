# Task Registry

This directory contains metadata files for all tasks in the system. Each task in `src/trigger/` should have a corresponding `.task.json` file here.

## File Naming Convention
- Task implementation: `src/trigger/my_task.ts`
- Task metadata: `src/task-registry/my_task.task.json`

## Task JSON Structure

```json
{
  "name": "Human readable name",
  "taskFile": "src/trigger/task_file.ts",
  "description": "Clear description of what the task does",
  "input": {
    "required": {
      "paramName": {
        "type": "string | number | boolean | object | array",
        "description": "What this parameter does"
      }
    },
    "optional": {
      "trampData": {
        "type": "record",
        "description": "Arbitrary data to pass through unchanged",
        "items": "any"
      },
      "groupName": {
        "type": "object",
        "description": "Description of this group of options",
        "properties": {
          "optionName": {
            "type": "string | number | boolean | enum | array",
            "description": "What this option does",
            "values": ["value1", "value2"],  // Only for enum types
            "items": "string"                // Only for array types
          }
        }
      }
    }
  },
  "output": {
    "trampData": {
      "type": "record",
      "description": "The same arbitrary data that was passed in, returned unchanged at the top level",
      "items": "any",
      "optional": true
    },
    "fieldName": {
      "type": "string | number | boolean | object",
      "description": "What this field contains",
      "optional": true  // Include if the field is optional
    }
  }
}
```

## Supported Types
- `string`: Text values
- `number`: Numeric values
- `boolean`: True/false values
- `enum`: Fixed set of values (include `values` array)
- `array`: List of items (include `items` type)
- `object`: Nested structure with properties

## Example

Here's a simplified example:

```json
{
  "name": "Image Resize",
  "taskFile": "src/trigger/image_resize.ts",
  "description": "Resizes an image to specified dimensions",
  "input": {
    "required": {
      "url": {
        "type": "string",
        "description": "URL of the image to resize"
      },
      "width": {
        "type": "number",
        "description": "Target width in pixels"
      }
    },
    "optional": {
      "options": {
        "type": "object",
        "description": "Resize options",
        "properties": {
          "format": {
            "type": "enum",
            "values": ["jpg", "png", "webp"],
            "description": "Output format"
          },
          "quality": {
            "type": "number",
            "description": "Output quality (1-100)"
          }
        }
      }
    }
  },
  "output": {
    "success": {
      "type": "boolean",
      "description": "Whether the operation succeeded"
    },
    "url": {
      "type": "string",
      "description": "URL of the resized image"
    },
    "error": {
      "type": "string",
      "description": "Error message if failed",
      "optional": true
    }
  }
}
```

## Validation

The task registry generator will validate your JSON files against this structure. Common validation rules:

1. All required fields must be present
2. Types must be valid
3. Enum types must include values array
4. Array types must specify item type
5. File paths must be correct
6. All parameters must have descriptions

## Tips

1. Keep descriptions clear and concise
2. Group related options together
3. Use enums when there's a fixed set of values
4. Mark optional output fields
5. Include all possible error states
6. Document any special formats or constraints 

## Special Fields

### Tramp Data

Tramp data is a special field that allows passing arbitrary data through a task without validation. This is useful for:

1. **Context Preservation**: Pass context from the caller through to the result
2. **Metadata**: Include additional metadata that doesn't affect task execution
3. **Integration**: Help integrate tasks into larger workflows

The tramp data field:
- Is always optional in input
- Will be returned unchanged in output if provided
- Can contain any JSON-serializable data
- Is not validated or modified by the task
- Is stored at the top level of both input and output

Example usage:
```json
{
  "input": {
    "url": "https://example.com/video.mp4",
    "trampData": {
      "jobId": "123",
      "metadata": {
        "source": "user_upload",
        "timestamp": "2024-01-04T12:00:00Z"
      }
    }
  }
}
```

The same tramp data will be available in the output:
```json
{
  "success": true,
  "results": { ... },
  "trampData": {
    "jobId": "123",
    "metadata": {
      "source": "user_upload",
      "timestamp": "2024-01-04T12:00:00Z"
    }
  }
}
``` 