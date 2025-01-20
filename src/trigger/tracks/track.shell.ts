/**
 * Track Shell Template
 * ===================
 * A template for creating new tracks that orchestrate multiple tasks.
 * 
 * [EDIT REQUIRED] Replace this description with your track's purpose
 * 
 * Current Pipeline:
 * 1. first_task: [EDIT REQUIRED] Description of first task
 *    - Input: [What this task expects]
 *    - Output: [What this task produces]
 * 
 * 2. second_task: [EDIT REQUIRED] Description of second task
 *    - Input: [What this task expects]
 *    - Output: [What this task produces]
 * 
 * Input Requirements:
 * ```typescript
 * {
 *   // Required fields
 *   url: string;           // URL of the input to process
 *   tenantId: string;      // Tenant identifier
 *   projectId: string;     // Project identifier
 *   
 *   // Optional fields
 *   userId?: string;       // User identifier
 *   trampData?: {         // Data that flows through all tasks
 *     [key: string]: unknown;
 *   };
 *   
 *   // [EDIT REQUIRED] Track-specific options
 *   config?: {
 *     setting1?: boolean;
 *     setting2?: string;
 *   };
 * }
 * ```
 */

import { task } from "@trigger.dev/sdk/v3";
import { 
  TrackDefinition, 
  runTrack, 
  type TrackOutput,
  type TrackTaskOutput 
} from "../../orchestrator/track";

// [EDIT REQUIRED] Define track-specific input type
type TrackInput = {
  // Required base fields
  url: string;
  tenantId: string;
  projectId: string;
  userId?: string;
  trampData?: Record<string, unknown>;
  
  // [EDIT REQUIRED] Track-specific fields
  config?: {
    setting1?: boolean;
    setting2?: string;
  };
};

// [EDIT REQUIRED] Define your track
const trackShell: TrackDefinition = {
  name: "TRACK_SHELL", // [EDIT REQUIRED] Update with your track name
  enableSupabaseLogging: true,
  tasks: [
    {
      taskName: "first_task",
      // First task gets raw input
      inputMapper: (_prevOutput: Record<string, unknown>, originalInput: Record<string, unknown>) => ({
        url: (originalInput as TrackInput).url,
        tenantId: (originalInput as TrackInput).tenantId,
        projectId: (originalInput as TrackInput).projectId,
        userId: (originalInput as TrackInput).userId,
        // [EDIT REQUIRED] Map any additional fields
        config: (originalInput as TrackInput).config,
        // Always preserve trampData
        trampData: (originalInput as TrackInput).trampData
      })
    },
    {
      taskName: "second_task",
      // Subsequent tasks can use previous output
      inputMapper: (prevOutput: TrackTaskOutput, originalInput: Record<string, unknown>) => ({
        // [EDIT REQUIRED] Map previous output to this task's input
        url: (prevOutput.results as { outputUrl: string })?.outputUrl, // Example mapping
        tenantId: (originalInput as TrackInput).tenantId,
        projectId: (originalInput as TrackInput).projectId,
        userId: (originalInput as TrackInput).userId,
        // Always preserve trampData from original input
        trampData: (originalInput as TrackInput).trampData
      })
    }
  ]
};

// Export the track runner
export const runTrackShell = task({
  id: "track-shell", // [EDIT REQUIRED] Update with your track ID
  run: async (payload: TrackInput, { ctx }) => {
    return runTrack(trackShell, payload, ctx);
  }
}); 