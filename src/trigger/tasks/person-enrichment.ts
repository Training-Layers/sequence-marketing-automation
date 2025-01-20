// src/trigger/person_enrichment.ts
import { task, logger } from '@trigger.dev/sdk/v3';
import { db } from '../../database';
import { persons } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { PersonEnrichmentInput } from '../../schemas/person-enrichment/task';
import { enrichPersonWithClay } from '../../services/clay';

export const personEnrichment = task({
  id: 'person_enrichment',
  run: async (payload: PersonEnrichmentInput) => {
    try {
      // 1. Load person
      const [person] = await db
        .select()
        .from(persons)
        .where(eq(persons.id, payload.personId))
        .limit(1);

      if (!person) {
        throw new Error(`Person ${payload.personId} not found`);
      }

      // 2. Check if enrichment needed
      if (!payload.forceReenrich && person.enrichmentStatus === 'enriched') {
        return {
          success: true,
          data: { enriched: false, reason: 'already_enriched' },
        };
      }

      // 3. Call Clay API
      const enrichedData = await enrichPersonWithClay(person);

      // 4. Update person with enriched data
      const [updatedPerson] = await db
        .update(persons)
        .set({
          enrichmentStatus: 'enriched',
          lastEnrichedAt: new Date(),
          enrichmentData: enrichedData,
        })
        .where(eq(persons.id, person.id))
        .returning();

      return {
        success: true,
        data: { enriched: true, person: updatedPerson },
      };
    } catch (error) {
      logger.error('Person enrichment failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});
