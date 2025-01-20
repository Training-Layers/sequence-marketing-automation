/**
 * Sample orchestrator demonstrating parallel execution of a track and a standalone task.
 * 
 * This file provides a practical example of using the orchestrator to:
 * 1. Run multiple operations in parallel (a media processing track and a hello world task)
 * 2. Handle input mapping between tasks
 * 3. Collect and merge results from parallel operations
 * 
 * Example usage:
 * 
 * const result = await runSampleOrchestrator.run({
 *   url: "https://example.com/video.mp4",
 *   tenantId: "tenant123",
 *   projectId: "project456",
 *   userId: "user789",
 *   settings: {
 *     ffmpeg: {},
 *     output: {},
 *     storage: {}
 *   }
 * });
 * 
 * Parallel vs Serial Execution:
 * 
 * 1. Parallel Execution (Current Implementation):
 *    - Tasks in the tracks array run concurrently
 *    - No dependencies between tasks
 *    - Faster overall execution
 *    - Suitable when tasks are independent
 * 
 * 2. Serial Execution (Alternative Pattern):
 *    - To run tasks in series, create separate orchestrators
 *    - Chain them using task dependencies
 *    - Example structure:
 *      {
 *        tracks: [
 *          { task: taskOne },
 *          { task: taskTwo, dependencies: ["taskOne"] }
 *        ]
 *      }
 * 
 * Input Requirements:
 * - url: string - URL of the media file to process
 * - tenantId: string - Tenant identifier
 * - projectId: string - Project identifier
 * - userId: string - User identifier
 * - settings?: Object - Optional processing settings
 * 
 * Output Structure:
 * Returns a standardized output containing:
 * - Results from the media processing track
 * - Results from the hello world task
 * - Metadata about execution timing and task completion
 */

import { task, type Task } from "@trigger.dev/sdk/v3";
import { 
  OrchestratorDefinition, 
  runOrchestrator, 
  BaseTrackInput,
  type OrchestratorOutput
} from "../../orchestrator/orchestrator";

// Define input type for our sample orchestrator
interface SampleOrchestratorInput extends BaseTrackInput {
  url: string;
  settings?: {
    ffmpeg?: Record<string, unknown>;
    output?: Record<string, unknown>;
    storage?: Record<string, unknown>;
  };
}

// Import the tasks we'll use
const helloWorldTask = task({
  id: "hello-world",
  run: async (payload: { message: string }) => {
    return { message: payload.message };
  }
});

// Define the orchestrator
const sampleOrchestrator: OrchestratorDefinition<SampleOrchestratorInput> = {
  name: "sample_orchestrator",
  tracks: [
    {
      task: task({
        id: "TRACK_media_processing",
        run: async (payload: SampleOrchestratorInput) => {
          return payload; // This will be replaced by the actual media processing track
        }
      }),
      inputMapper: (input: SampleOrchestratorInput) => ({
        url: input.url,
        tenantId: input.tenantId,
        projectId: input.projectId,
        userId: input.userId,
        trampData: input.trampData,
        ffmpeg: input.settings?.ffmpeg,
        output: input.settings?.output,
        storage: input.settings?.storage
      })
    },
    {
      task: helloWorldTask,
      inputMapper: () => ({ message: "Running alongside media processing track!" })
    }
  ]
};

// Export the orchestrator as a Trigger.dev task
export const runSampleOrchestrator = task({
  id: "sample_orchestrator",
  run: async (payload: SampleOrchestratorInput): Promise<OrchestratorOutput> => {
    return runOrchestrator(sampleOrchestrator, payload);
  }
}); 