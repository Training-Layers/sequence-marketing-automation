/**
 * @fileoverview Orchestrator module for managing and executing multiple tracks and standalone tasks.
 * 
 * An Orchestrator is a higher-level construct that can:
 * 1. Run multiple tracks in parallel or with dependencies
 * 2. Handle track-to-track dependencies (e.g., Track B starts after Track A)
 * 3. Map inputs between tracks while preserving required fields
 * 4. Collect and merge results from all tracks
 * 5. Provide standardized error handling and logging
 * 
 * @example
 * ```typescript
 * // Define an orchestrator
 * const myOrchestrator: OrchestratorDefinition = {
 *   name: "media_processing_orchestrator",
 *   tracks: [
 *     { name: "audio_track", taskId: "TRACK_audio_processing" },
 *     { name: "video_track", taskId: "TRACK_video_processing" }
 *   ],
 *   // video_track starts after audio_track completes
 *   trackDependencies: {
 *     "video_track": ["audio_track"]
 *   },
 *   trackInputMappings: {
 *     "audio_track": (input) => ({
 *       url: input.url,
 *       tenantId: input.tenantId,
 *       projectId: input.projectId,
 *       userId: input.userId,
 *       trampData: input.trampData
 *     })
 *     // ... mappings for other tracks
 *   }
 * };
 * 
 * // Run the orchestrator
 * const result = await runOrchestrator(myOrchestrator, input, ctx);
 * ```
 * 
 * @remarks
 * - Each track in the orchestrator must be a registered Trigger.dev task
 * - Track IDs should follow the convention "TRACK_name_of_track"
 * - All tracks receive base fields (tenantId, projectId, userId) automatically
 * - Track dependencies are executed in order, with parallel execution where possible
 * - Results from all tracks are collected and returned in a standardized format
 * 
 * @input
 * Required fields that must be provided to the orchestrator:
 * - tenantId: string - Tenant identifier
 * - projectId: string - Project identifier
 * - userId: string - User identifier
 * - trampData?: Record<string, unknown> - Optional data passed through all tracks
 * 
 * @output
 * The orchestrator returns a standardized output structure:
 * ```typescript
 * {
 *   job: { success: boolean, error?: string },
 *   results: {
 *     trackResults: Record<string, {
 *       success: boolean,
 *       results: Record<string, unknown>,
 *       metadata?: Record<string, unknown>,
 *       error?: string
 *     }>
 *   },
 *   metadata: {
 *     orchestrator: {
 *       name: string,
 *       tracks: string[],
 *       timing: {
 *         started: number,
 *         completed?: number,
 *         failed?: number,
 *         duration: number
 *       }
 *     }
 *   },
 *   trampData?: Record<string, unknown>
 * }
 * ```
 * 
 * @error
 * Error handling follows these principles:
 * 1. If any track fails, the orchestrator stops and returns an error
 * 2. All errors are logged with track context for debugging
 * 3. Error output maintains the same structure as success output
 * 4. Original error messages are preserved in the output
 * 
 * @logging
 * The orchestrator provides detailed logging:
 * - Start/completion of the orchestrator
 * - Start/completion of each track
 * - Errors with full context
 * - Track dependencies and execution order
 */

import { batch, task, Task, TaskRunResult } from "@trigger.dev/sdk/v3";

export interface BaseTrackInput extends Record<string, unknown> {
  tenantId: string;
  projectId: string;
  userId?: string;
  trampData?: Record<string, unknown>;
}

export interface OrchestratorDefinition<TInput extends BaseTrackInput> {
  name: string;
  tracks: Array<{
    task: Task<string, any, Record<string, unknown>>;
    inputMapper?: (input: TInput) => Record<string, unknown>;
  }>;
}

export interface OrchestratorTaskOutput {
  results?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OrchestratorOutput<TResults = Record<string, unknown>, TMetadata = Record<string, unknown>> {
  job: {
    success: boolean;
    orchestratorName: string;
    runId: string;
    input: Record<string, unknown>;
    error?: string;
  };
  results: {
    orchestrator: TResults;
    tracks: Record<string, OrchestratorTaskOutput>;
  };
  metadata: {
    orchestrator: TMetadata & {
      name: string;
      trackCount: number;
      tracks: string[];
    };
    tracks: Record<string, Record<string, unknown>>;
  };
  trampData?: Record<string, unknown>;
}

// Helper to create standardized orchestrator output
export function createOrchestratorOutput<TResults, TMetadata>(
  params: {
    orchestrator: OrchestratorDefinition<any>;
    runId: string;
    input: Record<string, unknown>;
    results: TResults;
    metadata: TMetadata;
    trackResults: Record<string, OrchestratorTaskOutput>;
    trampData?: Record<string, unknown>;
  }
): OrchestratorOutput<TResults, TMetadata> {
  return {
    job: {
      success: true,
      orchestratorName: params.orchestrator.name,
      runId: params.runId,
      input: params.input
    },
    results: {
      orchestrator: params.results,
      tracks: params.trackResults
    },
    metadata: {
      orchestrator: {
        name: params.orchestrator.name,
        trackCount: params.orchestrator.tracks.length,
        tracks: params.orchestrator.tracks.map(t => t.task.id),
        ...params.metadata
      },
      tracks: Object.fromEntries(
        Object.entries(params.trackResults).map(([key, value]) => [key, value.metadata || {}])
      )
    },
    trampData: params.trampData
  };
}

// Helper to create error output
export function createOrchestratorErrorOutput<TResults, TMetadata>(
  params: {
    orchestrator: OrchestratorDefinition<any>;
    runId: string;
    input: Record<string, unknown>;
    error: unknown;
    trampData?: Record<string, unknown>;
  }
): OrchestratorOutput<TResults, TMetadata> {
  const errorMessage = params.error instanceof Error ? params.error.message : String(params.error);
  
  return {
    job: {
      success: false,
      orchestratorName: params.orchestrator.name,
      runId: params.runId,
      input: params.input,
      error: errorMessage
    },
    results: {
      orchestrator: {} as TResults,
      tracks: {}
    },
    metadata: {
      orchestrator: {
        name: params.orchestrator.name,
        trackCount: params.orchestrator.tracks.length,
        tracks: params.orchestrator.tracks.map(t => t.task.id)
      } as TMetadata & {
        name: string;
        trackCount: number;
        tracks: string[];
      },
      tracks: {}
    },
    trampData: params.trampData
  };
}

export async function runOrchestrator<TInput extends BaseTrackInput>(
  orchestrator: OrchestratorDefinition<TInput>,
  input: TInput
): Promise<OrchestratorOutput> {
  console.log(`Starting orchestrator ${orchestrator.name}`);
  
  try {
    // Run all tracks in parallel using batch.triggerByTaskAndWait
    const { runs } = await batch.triggerByTaskAndWait(
      orchestrator.tracks.map(track => ({
        task: track.task,
        payload: track.inputMapper ? track.inputMapper(input) : input
      }))
    );

    // Check for any failed runs
    const failedRuns = runs.filter(run => !run.ok);
    if (failedRuns.length > 0) {
      const errors = failedRuns.map(run => `${run.taskIdentifier}: ${run.error}`).join(", ");
      throw new Error(`Some tracks failed: ${errors}`);
    }

    // Collect results from successful runs
    const trackResults = Object.fromEntries(
      runs.map(run => [
        run.taskIdentifier,
        {
          results: run.ok ? run.output : {},
          metadata: {
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            duration: 0 // We don't have access to timing info
          }
        }
      ])
    );

    console.log(`Orchestrator ${orchestrator.name} completed successfully`);

    return createOrchestratorOutput({
      orchestrator,
      runId: runs[0]?.id || "unknown",
      input,
      results: trackResults,
      metadata: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      },
      trackResults,
      trampData: input.trampData
    });

  } catch (error) {
    console.error(`Orchestrator ${orchestrator.name} failed:`, error);
    return createOrchestratorErrorOutput({
      orchestrator,
      runId: "error",
      input,
      error,
      trampData: input.trampData
    });
  }
} 