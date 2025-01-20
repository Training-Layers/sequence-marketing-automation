/**
 * Orchestrator Shell Template
 * ==========================
 * A template for creating new orchestrators that manage parallel execution
 * of tracks and standalone tasks.
 * 
 * [EDIT REQUIRED] Replace this description with your orchestrator's purpose
 * 
 * Example usage:
 * ```typescript
 * const result = await runOrchestratorShell.run({
 *   url: "https://example.com/input.file",
 *   tenantId: "tenant123",
 *   projectId: "project456",
 *   userId: "user789",
 *   config: {
 *     // Your configuration
 *   }
 * });
 * ```
 * 
 * Execution Pattern:
 * 1. [EDIT REQUIRED] Describe first parallel operation
 * 2. [EDIT REQUIRED] Describe second parallel operation
 * 
 * Input Requirements:
 * - url: string - URL of the input to process
 * - tenantId: string - Tenant identifier
 * - projectId: string - Project identifier
 * - userId?: string - Optional user identifier
 * - config?: Object - Optional processing settings
 */

import { task, type Task } from "@trigger.dev/sdk/v3";
import { 
  OrchestratorDefinition, 
  runOrchestrator,
  BaseTrackInput 
} from "../../orchestrator/orchestrator";

// [EDIT REQUIRED] Define orchestrator-specific input type
interface OrchestratorInput extends BaseTrackInput {
  // Required base fields
  url: string;
  
  // [EDIT REQUIRED] Orchestrator-specific fields
  config?: {
    setting1?: boolean;
    setting2?: string;
  };
}

// [EDIT REQUIRED] Define placeholder tasks
// Replace these with actual imported tasks
const firstTrack = task({
  id: "TRACK_first_task",
  run: async (payload: OrchestratorInput) => {
    return payload; // Replace with actual track
  }
});

const secondTrack = task({
  id: "TRACK_second_task",
  run: async (payload: OrchestratorInput) => {
    return payload; // Replace with actual track
  }
});

// [EDIT REQUIRED] Define your orchestrator
const orchestratorShell: OrchestratorDefinition<OrchestratorInput> = {
  name: "ORCHESTRATOR_SHELL", // [EDIT REQUIRED] Update with your orchestrator name
  tracks: [
    {
      // First parallel track
      task: firstTrack,
      inputMapper: (input: OrchestratorInput) => ({
        url: input.url,
        tenantId: input.tenantId,
        projectId: input.projectId,
        userId: input.userId,
        // [EDIT REQUIRED] Map any additional fields
        config: input.config,
        // Always preserve trampData
        trampData: input.trampData
      })
    },
    {
      // Second parallel track
      task: secondTrack,
      inputMapper: (input: OrchestratorInput) => ({
        // [EDIT REQUIRED] Map input to this track's requirements
        url: input.url,
        tenantId: input.tenantId,
        projectId: input.projectId,
        userId: input.userId,
        trampData: input.trampData
      })
    }
  ]
};

// Export the orchestrator runner
export const runOrchestratorShell = task({
  id: "orchestrator-shell", // [EDIT REQUIRED] Update with your orchestrator ID
  run: async (payload: OrchestratorInput, { ctx }) => {
    return runOrchestrator(orchestratorShell, payload);
  }
}); 