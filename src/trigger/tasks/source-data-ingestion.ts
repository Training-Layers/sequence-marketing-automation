import { task, logger } from '@trigger.dev/sdk/v3';
import { db } from '../../database';
import { sourceRecords } from '../../database/schema';
import { SourceDataIngestionInput } from '../../schemas/source-data-ingestion/task';

/**
 * Task to ingest data from various sources and store in database
 * Creates a source record with raw data and initial processing status
 */
export const sourceDataIngestionTask = task({
  id: 'source-data-ingestion',
  maxDuration: 300, // 5 minutes
  
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },

  queue: {
    concurrencyLimit: 1,
  },

  run: async (payload: SourceDataIngestionInput) => {
    try {
      logger.info('Processing source data ingestion', {
        source: payload.source,
        hasData: !!payload.data,
      });

      // Create source record
      const [record] = await db
        .insert(sourceRecords)
        .values({
          sourceId: payload.source.externalId,
          sourceType: payload.source.type as string,
          provider: payload.source.provider || null,
          batchId: payload.source.batchId || null,
          rawData: payload.data as Record<string, unknown>,
          processingStatus: 'pending',
        })
        .returning();

      logger.info('Source record created', { recordId: record.id });

      return {
        success: true,
        data: {
          sourceRecordId: record.id,
          trampData: payload.trampData,
        },
      };
    } catch (error) {
      logger.error('Source data ingestion failed', { error });
      throw error; // Let Trigger.dev handle retries
    }
  },
}); 