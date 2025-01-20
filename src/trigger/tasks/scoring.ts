// src/trigger/scoring.ts
import { task, logger } from '@trigger.dev/sdk/v3';
import { db } from '../../database';
import { persons, organizations, sourceRecords } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { ScoringInput } from '../../schemas/scoring/task';
import {
  calculateOrganizationScore,
  calculatePersonScore,
  determineEngagementLevel,
} from '../../services/scoring';

export const scoring = task({
  id: 'scoring',
  maxDuration: 300, // 5 minutes
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  queue: {
    concurrencyLimit: 1,
  },
  run: async (payload: ScoringInput) => {
    try {
      // 1. Load records with enriched data
      const [sourceRecord] = await db
        .select()
        .from(sourceRecords)
        .where(eq(sourceRecords.id, payload.sourceRecordId))
        .limit(1);

      if (!sourceRecord) {
        throw new Error(`Source record ${payload.sourceRecordId} not found`);
      }

      // 2. Calculate person score if exists
      if (sourceRecord.resolvedPersonId) {
        const [person] = await db
          .select()
          .from(persons)
          .where(eq(persons.id, sourceRecord.resolvedPersonId))
          .limit(1);

        if (person) {
          const personScore = calculatePersonScore(person);
          await db
            .update(persons)
            .set({
              score: personScore.score,
              scoreUpdatedAt: new Date(),
              scoringData: personScore.factors,
            })
            .where(eq(persons.id, person.id));
        }
      }

      // 3. Calculate organization score if exists
      if (sourceRecord.resolvedOrgId) {
        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, sourceRecord.resolvedOrgId))
          .limit(1);

        if (org) {
          const orgScore = calculateOrganizationScore(org);
          await db
            .update(organizations)
            .set({
              score: orgScore.score,
              engagementLevel: determineEngagementLevel(orgScore.score),
            })
            .where(eq(organizations.id, org.id));
        }
      }

      return {
        success: true,
        data: {
          personScored: !!sourceRecord.resolvedPersonId,
          organizationScored: !!sourceRecord.resolvedOrgId,
        },
      };
    } catch (error) {
      logger.error('Scoring failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});
