// src/trigger/enrichment.ts
import { task, logger } from '@trigger.dev/sdk/v3';
import { db } from '../../database';
import { sourceRecords, persons, organizations } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { enrichPersonWithClay, enrichOrganizationWithClay } from '../../services/clay';
import { EnrichmentInput } from '../../schemas/enrichment/task';

export const enrichment = task({
  id: 'enrichment',
  maxDuration: 300, // 5 minutes
  
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },

  queue: {
    concurrencyLimit: 1,
  },
  run: async (payload: EnrichmentInput) => {
    try {

      if (payload.personId) {
        const [person] = await db
          .select()
          .from(persons)
          .where(eq(persons.id, payload.personId))
          .limit(1);

        if (!person) {
          throw new Error(`Person record ${payload.personId} not found`);
        }
        const enrichedPerson = await enrichPersonWithClay(person);

        logger.log('Enriched person', { enrichedPerson });

        await db
          .update(persons)
          .set({
            enrichmentStatus: 'enriched',
            lastEnrichedAt: new Date(),
            enrichmentData: enrichedPerson,
          })
          .where(eq(persons.id, person.id));
      }

      if (payload.organizationId) {
        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, payload.organizationId))
          .limit(1);

        if (org) {
          const enrichedOrg = await enrichOrganizationWithClay(org);

          await db
            .update(organizations)
            .set({
              enrichmentStatus: 'enriched',
              lastEnrichedAt: new Date(),
              enrichmentData: enrichedOrg,
            })
            .where(eq(organizations.id, org.id));
        }
      }

      // 3. Enrich Organization if exists

      return {
        success: true,
        data: {
          personEnriched: !!payload.personId,
          organizationEnriched: !!payload.organizationId,
        },
        trampData: payload.trampData,
      };

    } catch (error) {
      logger.error('Enrichment failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: null,
        trampData: payload.trampData,
      };
    }
  },
});
