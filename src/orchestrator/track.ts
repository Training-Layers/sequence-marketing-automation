/**
 * Track System for Trigger.dev Tasks
 * 
 * This module provides a system for organizing and executing multiple Trigger.dev tasks
 * in a sequential pipeline. It handles task chaining, data flow between tasks, and logging.
 * 
 * Key Features:
 * - Sequential task execution
 * - Automatic data flow between tasks
 * - Standardized logging (both Trigger.dev and optional Supabase)
 * - Error handling and task failure management
 * - Preservation of trampData through the pipeline
 * 
 * Usage Example:
 * ```typescript
 * const myTrack: TrackDefinition = {
 *   name: "MY_TRACK",
 *   enableSupabaseLogging: true,
 *   tasks: [
 *     {
 *       taskName: "first_task",
 *       // First task gets raw input
 *     },
 *     {
 *       taskName: "second_task",
 *       // Map previous output to this task's input
 *       inputMapper: (prevOutput, originalInput) => ({
 *         someField: prevOutput.result,
 *         trampData: prevOutput.trampData
 *       })
 *     }
 *   ]
 * };
 * 
 * // Create a Trigger.dev task to run the track
 * export const runMyTrack = task({
 *   id: "MY_TRACK",
 *   run: async (payload, { ctx }) => {
 *     const result = await runTrack(myTrack, payload, ctx);
 *     return {
 *       job: { success: true, ... },
 *       results: { trackOutput: result },
 *       metadata: { ... },
 *       trampData: payload.trampData
 *     };
 *   }
 * });
 * ```
 * 
 * Required Input Fields:
 * - tenantId: string
 * - projectId: string
 * - userId?: string
 * - trampData?: Record<string, unknown>
 * 
 * @module Track
 */

import { logger, tasks } from "@trigger.dev/sdk/v3";

// Track output structure interfaces
export interface TrackTaskOutput {
  results?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface TrackOutput<TTrackResults = Record<string, unknown>, TTrackMetadata = Record<string, unknown>> {
  job: {
    success: boolean;
    taskName: string;
    runId: string;
    input: Record<string, unknown>;
    error?: string;
  };
  results: {
    track: TTrackResults;
    tasks: Record<string, TrackTaskOutput>;
  };
  metadata: {
    track: TTrackMetadata & {
      name: string;
      taskCount: number;
      tasks: string[];
    };
    tasks: Record<string, Record<string, unknown>>;
  };
  trampData?: Record<string, unknown>;
}

// Helper to create standardized track output
export function createTrackOutput<TTrackResults, TTrackMetadata>(
  params: {
    trackDef: TrackDefinition;
    runId: string;
    input: Record<string, unknown>;
    trackResults: TTrackResults;
    trackMetadata: TTrackMetadata;
    taskResults: Record<string, TrackTaskOutput>;
    trampData?: Record<string, unknown>;
  }
): TrackOutput<TTrackResults, TTrackMetadata> {
  return {
    job: {
      success: true,
      taskName: params.trackDef.name,
      runId: params.runId,
      input: params.input
    },
    results: {
      track: params.trackResults,
      tasks: params.taskResults
    },
    metadata: {
      track: {
        name: params.trackDef.name,
        taskCount: params.trackDef.tasks.length,
        tasks: params.trackDef.tasks.map(t => t.taskName),
        ...params.trackMetadata
      },
      tasks: Object.fromEntries(
        Object.entries(params.taskResults).map(([key, value]) => [key, value.metadata || {}])
      )
    },
    trampData: params.trampData
  };
}

// Helper to create error output
export function createTrackErrorOutput<TTrackResults, TTrackMetadata>(
  params: {
    trackDef: TrackDefinition;
    runId: string;
    input: Record<string, unknown>;
    error: unknown;
    trampData?: Record<string, unknown>;
  }
): TrackOutput<TTrackResults, TTrackMetadata> {
  const errorMessage = params.error instanceof Error ? params.error.message : String(params.error);
  
  return {
    job: {
      success: false,
      taskName: params.trackDef.name,
      runId: params.runId,
      input: params.input,
      error: errorMessage
    },
    results: {
      track: {} as TTrackResults,
      tasks: {}
    },
    metadata: {
      track: {
        name: params.trackDef.name,
        taskCount: params.trackDef.tasks.length,
        tasks: params.trackDef.tasks.map(t => t.taskName)
      } as TTrackMetadata & {
        name: string;
        taskCount: number;
        tasks: string[];
      },
      tasks: {}
    },
    trampData: params.trampData
  };
}

// Define the operation type
type TaskOperation = {
  task_name: string;
  status: "started" | "completed" | "failed";
  message: string;
  attributes?: Record<string, unknown>;
  error?: string;
};

// Task Operation Definitions
const TaskOperations = {
  TRACK: {
    START: { task_name: "track_execution", status: "started" as const, message: "🚀 Starting track execution" },
    COMPLETE: { task_name: "track_execution", status: "completed" as const, message: "✅ Track execution completed" },
    FAILED: { task_name: "track_execution", status: "failed" as const, message: "❌ Track execution failed" }
  }
} as const;

// Log data type for Supabase
type LogData = {
  task: string;
  task_name: string;
  status: "started" | "completed" | "failed";
  task_category: string;
  message: string;
  tenantid: string;
  projectid: string;
  userid?: string;
  jobid: string;
  tags?: string[];
  operation?: string;
  error?: string;
  attributes?: Record<string, unknown>;
};

export class TrackLogger {
  constructor(
    private readonly supabaseUrl: string,
    private readonly supabaseKey: string,
    private readonly task: string,
    private readonly jobId: string,
    private readonly tenantId: string,
    private readonly projectId: string,
    private readonly userId?: string,
    private readonly enableSupabase: boolean = false
  ) {}

  async logOperation(
    operation: TaskOperation,
    tags?: string[],
    additionalOperation?: string
  ) {
    // Always log to Trigger.dev
    if (operation.status === "failed") {
      logger.error(operation.message, {
        task: this.task,
        task_name: operation.task_name,
        status: operation.status,
        jobId: this.jobId,
        error: operation.error,
        ...operation.attributes
      });
    } else {
      logger.info(operation.message, {
        task: this.task,
        task_name: operation.task_name,
        status: operation.status,
        jobId: this.jobId,
        ...operation.attributes
      });
    }

    // Only log to Supabase if enabled and configured
    if (this.enableSupabase && this.supabaseUrl && this.supabaseKey) {
      try {
        const logData: LogData = {
          task: this.task,
          task_name: operation.task_name,
          status: operation.status,
          task_category: "track_execution",
          message: operation.message,
          tenantid: this.tenantId,
          projectid: this.projectId,
          userid: this.userId,
          jobid: this.jobId,
          tags: tags,
          operation: additionalOperation,
          error: operation.error,
          attributes: operation.attributes
        };

        await this.logToSupabase(logData);
      } catch (error) {
        // Log Supabase error to Trigger.dev but don't fail the operation
        logger.warn("Failed to log to Supabase", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private async logToSupabase(logData: LogData) {
    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/task_logs`, {
        method: "POST",
        headers: {
          "apikey": this.supabaseKey,
          "Authorization": `Bearer ${this.supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(logData)
      });

      if (!response.ok) {
        throw new Error(`Failed to log to Supabase: ${response.statusText}`);
      }
    } catch (error) {
      throw new Error(`Error logging to Supabase: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export interface TrackDefinition {
  name: string;
  tasks: Array<{
    taskName: string;
    inputMapper?: (
      prevOutput: Record<string, unknown>,
      originalInput: Record<string, unknown>
    ) => Record<string, unknown>;
  }>;
  enableSupabaseLogging?: boolean;
}

export interface TrackRunResult {
  taskResults: Record<string, TrackTaskOutput>;
  finalOutput: Record<string, unknown>;
}

export async function runTrack(
  trackDef: TrackDefinition,
  input: Record<string, unknown> & {
    tenantId: string;
    projectId: string;
    userId?: string;
  },
  ctx?: { run: { id: string } }
): Promise<TrackRunResult> {
  const trackLogger = new TrackLogger(
    process.env.SUPABASE_URL || "",
    process.env.SUPABASE_API_KEY || "",
    trackDef.name,
    ctx?.run?.id || "unknown",
    input.tenantId,
    input.projectId,
    input.userId,
    trackDef.enableSupabaseLogging
  );

  try {
    await trackLogger.logOperation(TaskOperations.TRACK.START, ["track"]);

    let prevOutput = input;
    const taskResults: Record<string, TrackTaskOutput> = {};

    for (const task of trackDef.tasks) {
      // Prepare input for current task
      const taskInput = task.inputMapper ? task.inputMapper(prevOutput, input) : prevOutput;

      // Execute task and wait for result
      const result = await tasks.triggerAndWait(task.taskName, taskInput);
      
      if (!result.ok) {
        throw new Error(`Task ${task.taskName} failed: ${result.error}`);
      }

      // Store task results
      taskResults[task.taskName] = {
        results: result.output || {},
        metadata: {
          status: "completed",
          taskId: result.id,
          taskIdentifier: result.taskIdentifier
        }
      };

      // Merge result with required fields for next task
      prevOutput = {
        ...(result.output ?? {}),
        tenantId: input.tenantId,
        projectId: input.projectId,
        userId: input.userId
      };

      await trackLogger.logOperation({
        task_name: "task_execution",
        status: "completed",
        message: `✅ Completed task: ${task.taskName}`,
        attributes: {
          taskName: task.taskName
        }
      }, ["track", "task"]);
    }

    await trackLogger.logOperation({
      ...TaskOperations.TRACK.COMPLETE,
      attributes: {
        taskCount: trackDef.tasks.length,
        trackName: trackDef.name
      }
    }, ["track"]);

    return {
      taskResults,
      finalOutput: prevOutput
    };

  } catch (error) {
    await trackLogger.logOperation({
      ...TaskOperations.TRACK.FAILED,
      error: error instanceof Error ? error.message : String(error)
    }, ["track", "error"]);
    throw error;
  }
} 