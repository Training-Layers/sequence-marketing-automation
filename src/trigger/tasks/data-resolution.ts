/**
 * Data Resolution Task
 * ==================
 * Task for resolving and processing data from source records.
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import { db } from '../../database';
import { sourceRecords } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { DataResolutionTask, DataResolutionTaskResult, dataResolutionMetadata } from '../../schemas/data-resolution/task';
import { DatabaseResolver } from '../../lib/data-resolution/db-resolver';
import { dataResolutionConfig } from '../../schemas/data-resolution/config';

export const dataResolutionTask = task({
  id: 'data-resolution',
  maxDuration: 300, // 5 minutes
  
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },

  queue: {
    concurrencyLimit: 1,
  },

  run: async (payload: DataResolutionTask, context): Promise<DataResolutionTaskResult> => {
    const startTime = Date.now();
    const processingSteps: string[] = [];

    try {
      // 1. Load source record
      processingSteps.push('load_source_record');
      const [sourceRecord] = await db
        .select()
        .from(sourceRecords)
        .where(eq(sourceRecords.id, payload.sourceRecordId))
        .limit(1);

      if (!sourceRecord) {
        throw new Error(`Source record ${payload.sourceRecordId} not found`);
      }

      // 2. Create resolver with configuration
      processingSteps.push('initialize_resolver');
      const config = payload.config ?? dataResolutionConfig.parse({});
      const resolver = new DatabaseResolver(config);

      // 3. Process data
      processingSteps.push('resolve_data');
      const result = await resolver.resolve({
        type: sourceRecord.sourceType,
        data: sourceRecord.rawData
      });

      // 4. Update source record with results
      processingSteps.push('update_record');
      await db
        .update(sourceRecords)
        .set({
          processingStatus: result.status === 'resolved' ? 'processed' : 'failed',
          processedAt: new Date(),
          resolvedContactId: result.match?.recordType === 'person' ? result.match.recordId : null,
          resolvedPersonId: result.match?.recordType === 'person' ? result.match.recordId : null,
          resolvedOrgId: result.match?.recordType === 'organization' ? result.match.recordId : null,
          normalizedData: {
            status: result.status,
            match: result.match,
            error: result.error,
            metadata: result.metadata
          },
          processingErrors: result.error ? {
            message: result.error.message,
            timestamp: result.error.timestamp
          } : null
        })
        .where(eq(sourceRecords.id, sourceRecord.id));

      // 5. Return result
      const success = result.status === 'resolved';
      const processingTime = Date.now() - startTime;

      return {
        job: {
          success,
          taskName: 'data-resolution',
          runId: context.ctx.run.id,
          input: {
            sourceRecordId: payload.sourceRecordId,
            config: payload.config
          }
        },
        success,
        data: result,
        metadata: {
          processingTime,
          processingSteps,
          validationResults: {
            passed: !result.error,
            errors: result.error ? [result.error.message] : undefined
          },
          matchingStats: {
            totalAttempts: result.metadata?.attempts ?? 0,
            successfulMatches: success ? 1 : 0,
            failedMatches: success ? 0 : 1,
            averageConfidence: result.match?.confidence ?? 0
          }
        },
        trampData: payload.trampData
      };

    } catch (error) {
      logger.error('Data resolution failed', { error });
      const processingTime = Date.now() - startTime;

      // Update source record with error
      await db
        .update(sourceRecords)
        .set({
          processingStatus: 'failed',
          processingErrors: {
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
          },
        })
        .where(eq(sourceRecords.id, payload.sourceRecordId));

      // Return error result
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        job: {
          success: false,
          taskName: 'data-resolution',
          runId: context.ctx.run.id,
          input: {
            sourceRecordId: payload.sourceRecordId,
            config: payload.config
          },
          error: errorMessage
        },
        success: false,
        data: null,
        error: errorMessage,
        metadata: {
          processingTime,
          processingSteps,
          validationResults: {
            passed: false,
            errors: [errorMessage]
          },
          matchingStats: {
            totalAttempts: 0,
            successfulMatches: 0,
            failedMatches: 1,
            averageConfidence: 0
          }
        },
        trampData: payload.trampData
      };
    }
  }
});
