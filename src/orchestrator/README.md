# Trigger.dev Track Orchestrator

The Track Orchestrator is a system for organizing and executing multiple Trigger.dev tasks in a sequential pipeline. It provides a structured way to chain tasks together while handling data flow, logging, and error management.

## Core Components

### `track.ts`
The core module that provides the track execution system. It handles:
- Sequential task execution
- Data flow between tasks
- Standardized logging (Trigger.dev + optional Supabase)
- Error handling
- trampData preservation

### Example Tracks
- `media-processing.track.ts`: A track for processing media files (video/audio operations)

## Creating a New Track

1. Create a new file `your-track-name.track.ts` in this directory
2. Define your track using the `TrackDefinition` interface:
```typescript
const yourTrack: TrackDefinition = {
  name: "YOUR_TRACK_NAME",
  enableSupabaseLogging: true, // Optional
  tasks: [
    {
      taskName: "first_task",
      // First task gets raw input
    },
    {
      taskName: "second_task",
      inputMapper: (prevOutput, originalInput) => ({
        // Map previous output to this task's input
        someField: prevOutput.result,
        // Always preserve trampData
        trampData: prevOutput.trampData
      })
    }
  ]
};
```

3. Create a Trigger.dev task to run your track:
```typescript
export const runYourTrack = task({
  id: "YOUR_TRACK_NAME",
  run: async (payload, { ctx }) => {
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

## Best Practices

1. **Input Validation**
   - Ensure your track's input requirements are clearly documented
   - All tracks must receive `tenantId`, `projectId`, and optionally `userId`
   - Preserve `trampData` through all task transitions

2. **Task Chaining**
   - Use `inputMapper` to transform data between tasks
   - Keep transformations simple and focused
   - Document expected input/output formats

3. **Error Handling**
   - Tasks should handle their own errors
   - The track system will catch and log task failures
   - Failed tasks will stop track execution

4. **Logging**
   - Use `enableSupabaseLogging` when you need persistent logs
   - Track execution progress is automatically logged
   - Task transitions and errors are tracked

## Example Usage

```typescript
// Trigger the track
await client.tasks.trigger("YOUR_TRACK_NAME", {
  // Required fields
  tenantId: "tenant123",
  projectId: "project456",
  
  // Track-specific fields
  someField: "value",
  
  // Optional fields
  userId: "user789",
  trampData: {
    jobId: "job123"
  }
});
```

## Testing

1. Create a test payload with required fields
2. Trigger your track from the Trigger.dev dashboard
3. Monitor execution in the dashboard
4. Check logs in Supabase if enabled

## Contributing

When adding new tracks:
1. Follow the naming convention: `feature-name.track.ts`
2. Add comprehensive JSDoc documentation
3. Update this README if adding new patterns or best practices
4. Test thoroughly before deployment 