# Trigger.dev Tracks

This directory contains track definitions that orchestrate multiple tasks into cohesive workflows. Each track is a specialized pipeline that handles a specific type of processing or workflow.

## Available Tracks

### Media Processing Track
- **File**: `media-processing.track.ts`
- **Purpose**: Process media files (video/audio) through multiple steps
- **Tasks**: 
  1. Extract audio from video
  2. Generate thumbnail from video
- **Usage**: See file documentation for detailed input/output specifications

## Creating a New Track

1. **File Naming**
   - Use kebab-case: `feature-name.track.ts`
   - Always include `.track.ts` suffix
   - Place in this directory

2. **Track Structure**
   ```typescript
   import { task } from "@trigger.dev/sdk/v3";
   import { TrackDefinition, runTrack } from "../../orchestrator/track";
   
   // Define track-specific input type
   type TrackInput = {
     // Required fields from base track
     tenantId: string;
     projectId: string;
     userId?: string;
     trampData?: Record<string, unknown>;
     
     // Track-specific fields
     yourField: string;
     options?: {
       setting1?: boolean;
       setting2?: string;
     };
   };
   
   // Define your track
   const yourTrack: TrackDefinition = {
     name: "YOUR_TRACK_NAME",
     enableSupabaseLogging: true,
     tasks: [
       {
         taskName: "task_one",
         // First task gets raw input
       },
       {
         taskName: "task_two",
         inputMapper: (prevOutput, originalInput) => ({
           // Map fields from previous output
           field: prevOutput.result,
           // Use original input when needed
           originalField: originalInput.yourField,
           // Always preserve trampData
           trampData: prevOutput.trampData
         })
       }
     ]
   };
   
   // Export the track as a Trigger.dev task
   export const runYourTrack = task({
     id: "YOUR_TRACK_NAME",
     run: async (payload: TrackInput, { ctx }) => {
       const result = await runTrack(yourTrack, payload, ctx);
       return {
         job: { success: true },
         results: { trackOutput: result },
         metadata: {},
         trampData: payload.trampData
       };
     }
   });
   ```

3. **Documentation Requirements**
   - Comprehensive JSDoc header explaining track purpose
   - Input/output type definitions with comments
   - Usage examples with both client and HTTP API
   - Error handling and logging details

4. **Best Practices**
   - Keep tasks focused and single-purpose
   - Use clear, descriptive task names
   - Document data flow between tasks
   - Handle errors appropriately
   - Test with various input combinations
   - Consider edge cases and failure modes

5. **Testing Your Track**
   - Create test payloads for common scenarios
   - Test error conditions
   - Verify logging works as expected
   - Check data preservation through tasks
   - Monitor performance and resource usage

## Common Patterns

1. **Data Flow**
   ```typescript
   // Preserve fields between tasks
   inputMapper: (prevOutput, originalInput) => ({
     ...prevOutput,           // Keep previous results
     newField: "value",       // Add new fields
     trampData: prevOutput.trampData  // Always preserve
   })
   ```

2. **Error Handling**
   ```typescript
   // Tasks handle their own errors
   // Track system provides logging and cleanup
   if (!result.success) {
     throw new Error(`Task failed: ${result.error}`);
   }
   ```

3. **Logging**
   ```typescript
   // Enable Supabase logging for persistence
   enableSupabaseLogging: true,
   // Track system handles logging automatically
   // Check Supabase logs for detailed execution history
   ```

## Contributing

1. Follow the file structure and naming conventions
2. Add comprehensive documentation
3. Test thoroughly before submitting
4. Update this README when adding new patterns
5. Consider backwards compatibility

## Resources

- [Track System Documentation](../../orchestrator/README.md)
- [Trigger.dev Documentation](https://trigger.dev/docs)
- [Example Tracks](./examples/) 