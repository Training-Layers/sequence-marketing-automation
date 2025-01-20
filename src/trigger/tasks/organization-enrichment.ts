// src/trigger/organization_enrichment.ts
import { task, logger } from '@trigger.dev/sdk/v3';
import { db } from '../../database';
import { organizations } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { OrganizationEnrichmentInput } from '../../schemas/organization-enrichment/task';
import { enrichOrganizationWithClay } from '../../services/clay';
export const organizationEnrichment = task({
  id: 'organization_enrichment',
  run: async (payload: OrganizationEnrichmentInput) => {
    try {
      // 1. Load organization
      const [organization] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, payload.organizationId))
        .limit(1);

      if (!organization) {
        throw new Error(`Organization ${payload.organizationId} not found`);
      }

      // 2. Check if enrichment needed
      if (!payload.forceReenrich && organization.enrichmentStatus === 'enriched') {
        return {
          success: true,
          data: { enriched: false, reason: 'already_enriched' },
        };
      }

      // 3. Call Clay API
      const enrichedData = await enrichOrganizationWithClay(organization);

      // 4. Update organization with enriched data
      const [updatedOrg] = await db
        .update(organizations)
        .set({
          enrichmentStatus: 'enriched',
          lastEnrichedAt: new Date(),
          enrichmentData: enrichedData,
        })
        .where(eq(organizations.id, organization.id))
        .returning();

      return {
        success: true,
        data: { enriched: true, organization: updatedOrg },
      };
    } catch (error) {
      logger.error('Organization enrichment failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});
