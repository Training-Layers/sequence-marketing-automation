/**
 * Source Data Ingestion Task
 * =========================
 * Processes and ingests data from various sources into the system.
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { db } from "../../database";
import { sourceRecords } from "../../database/schema";
import { 
  validateTaskInput,
  type SourceDataIngestionTask,
  type SourceDataIngestionTaskResult,
  type SourceDataIngestionMetadata
} from "../../schemas/source-data-ingestion/task";
import { validateOutput } from "../../schemas/source-data-ingestion/output";

// Main task function
async function runTask(
  payload: SourceDataIngestionTask,
  logger: Console
): Promise<SourceDataIngestionTaskResult> {
  const startTime = Date.now();
  const processingSteps: string[] = [];

  // 1. Validate input
  const validationResult = validateTaskInput(payload);
  if (!validationResult.success) {
    logger.error("Invalid input payload", validationResult.error.format());
    return {
      job: {
        success: false,
        taskName: "source-data-ingestion",
        runId: "validation-failed",
        input: { source: payload.source, data: payload.data },
        error: "Invalid input: " + validationResult.error.message
      },
      results: {
        sourceRecordId: "validation-failed",
        sourceType: payload.source.type,
        provider: payload.source.provider,
        processingStatus: "failed",
        processedAt: new Date(),
        rawData: payload.data as Record<string, unknown>,
        processingErrors: [{
          message: validationResult.error.message,
          timestamp: new Date()
        }]
      },
      metadata: {
        processingTime: Date.now() - startTime,
        sourceFormat: "unknown",
        processingSteps: ["input-validation-failed"]
      },
      trampData: payload.trampData
    };
  }

  try {
    // 2. Process the data
    processingSteps.push("starting-processing");
    logger.info("Processing source data", { 
      type: payload.source.type,
      provider: payload.source.provider 
    });

    // 3. Handle output preferences
    const outputConfig = payload.output ?? { 
      normalizeData: true,
      includeMetadata: true,
      errorHandling: "fail" 
    };
    const outputValidation = validateOutput(outputConfig);
    if (!outputValidation.success) {
      throw new Error("Invalid output configuration");
    }

    // 4. Create source record
    processingSteps.push("creating-source-record");
    const sourceRecord = await db.insert(sourceRecords).values({
      sourceType: payload.source.type,
      sourceId: payload.source.externalId,
      batchId: payload.source.batchId,
      provider: payload.source.provider,
      rawData: payload.data as Record<string, unknown>,
      normalizedData: outputConfig.normalizeData ? normalizeData(payload.data) : null,
      processingStatus: "pending",
      processingErrors: null,
      processedAt: new Date()
    }).returning();

    const record = sourceRecord[0];
    if (!record) {
      throw new Error("Failed to create source record");
    }

    processingSteps.push("completed-successfully");

    // 5. Return success result
    return {
      job: {
        success: true,
        taskName: "source-data-ingestion",
        runId: record.id,
        input: { source: payload.source, data: payload.data }
      },
      results: {
        sourceRecordId: record.id,
        sourceType: record.sourceType,
        provider: record.provider ?? undefined,
        processingStatus: record.processingStatus as "pending" | "processed" | "failed",
        processedAt: record.processedAt ?? new Date(),
        rawData: record.rawData,
        normalizedData: record.normalizedData ?? undefined,
        metadata: outputConfig.includeMetadata ? {
          batchId: record.batchId ?? undefined,
          externalId: record.sourceId ?? undefined
        } : undefined
      },
      metadata: {
        processingTime: Date.now() - startTime,
        sourceFormat: detectSourceFormat(payload.data),
        processingSteps
      },
      trampData: payload.trampData
    };
  } catch (error) {
    // 6. Handle errors
    processingSteps.push("processing-failed");
    logger.error("Task failed", error);
    
    return {
      job: {
        success: false,
        taskName: "source-data-ingestion",
        runId: "error",
        input: { source: payload.source, data: payload.data },
        error: error instanceof Error ? error.message : String(error)
      },
      results: {
        sourceRecordId: "error",
        sourceType: payload.source.type,
        provider: payload.source.provider,
        processingStatus: "failed",
        processedAt: new Date(),
        rawData: payload.data as Record<string, unknown>,
        processingErrors: [{
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date()
        }]
      },
      metadata: {
        processingTime: Date.now() - startTime,
        sourceFormat: detectSourceFormat(payload.data),
        processingSteps
      },
      trampData: payload.trampData
    };
  }
}

// Helper functions
function normalizeData(data: unknown): Record<string, unknown> {
  // TODO: Implement data normalization logic
  return data as Record<string, unknown>;
}

function detectSourceFormat(data: unknown): string {
  // TODO: Implement source format detection logic
  return "json";
}

// Task export
export const sourceDataIngestionTask = task({
  id: "source-data-ingestion",
  maxDuration: 300, // 5 minutes
  run: async (payload: SourceDataIngestionTask) => {
    return runTask(payload, console);
  }
}); 