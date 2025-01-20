# Task Registry

This directory contains the task registry (`tasks.ts`) which serves as a central catalog of all available tasks in the system. The registry is automatically generated from task metadata files.

## Important Note

**DO NOT EDIT `tasks.ts` DIRECTLY!**

The `tasks.ts` file is auto-generated. Any manual changes will be overwritten when the generator runs.

## How to Update the Registry

1. **Add/Update Task Metadata**
   - Create/edit the task's JSON file in `src/task-registry/`
   - Example: `src/task-registry/my_task.task.json`
   - See the task-registry README for JSON format details

2. **Run the Generator**
   ```bash
   # From project root
   npm run generate-registry
   ```

3. **Verify the Changes**
   - Check `tasks.ts` to ensure your task appears correctly
   - Verify all fields are present and formatted properly

## Registry Structure

The registry exports a `tasks` object with this structure:
```typescript
export const tasks = {
  task_name: {
    name: "Human Readable Name",
    file: "src/trigger/task_file.ts",
    description: "What the task does",
    input: {
      // Required parameters with descriptions
      requiredParam: "Description of the parameter",
      
      // Optional parameters grouped by purpose
      optionGroup: {
        option1: "Description of option 1",
        option2: "Description of option 2"
      }
    },
    output: {
      // Output fields with descriptions
      field1: "Description of output field 1",
      field2: "Description of output field 2"
    }
  }
}
```

## Example: Adding a New Task

1. **Create Task Metadata**
   ```json
   // src/task-registry/image_resize.task.json
   {
     "name": "Image Resize",
     "file": "src/trigger/image_resize.ts",
     "description": "Resizes images to specified dimensions",
     "input": {
       "required": {
         "url": {
           "type": "string",
           "description": "URL of image to resize"
         }
       },
       "optional": {
         "dimensions": {
           "type": "object",
           "description": "Size options",
           "properties": {
             "width": {
               "type": "number",
               "description": "Target width in pixels"
             }
           }
         }
       }
     },
     "output": {
       "url": {
         "type": "string",
         "description": "URL of resized image"
       }
     }
   }
   ```

2. **Generate Registry**
   ```bash
   npm run generate-registry
   ```

3. **Result in Registry**
   ```typescript
   export const tasks = {
     image_resize: {
       name: "Image Resize",
       file: "src/trigger/image_resize.ts",
       description: "Resizes images to specified dimensions",
       input: {
         url: "URL of image to resize",
         dimensions: {
           width: "Target width in pixels"
         }
       },
       output: {
         url: "URL of resized image"
       }
     }
   }
   ```

## Common Issues

1. **Task Not Appearing**
   - Check the task JSON file name matches the pattern: `taskname.task.json`
   - Verify JSON is valid
   - Check console output for generator errors

2. **Missing Fields**
   - Ensure all required fields are present in JSON
   - Check JSON structure matches expected format
   - Verify field types are correct

3. **Generator Errors**
   - Check JSON syntax
   - Verify file paths exist
   - Ensure all referenced files are present

## Maintenance

1. **Regular Updates**
   - Run generator after adding/modifying tasks
   - Commit both JSON and generated registry
   - Keep task descriptions up to date

2. **Validation**
   - Generator validates JSON format
   - Check console for warnings/errors
   - Verify registry output matches expectations

3. **Documentation**
   - Keep descriptions clear and concise
   - Document any special parameters
   - Update examples when adding new patterns

## Tips

1. **Task Names**
   - Use snake_case for task names
   - Keep names descriptive but concise
   - Follow existing naming patterns

2. **Descriptions**
   - Be clear about what the task does
   - Include any important caveats
   - Mention key features/options

3. **Parameters**
   - Group related options together
   - Document all possible values
   - Explain any defaults 