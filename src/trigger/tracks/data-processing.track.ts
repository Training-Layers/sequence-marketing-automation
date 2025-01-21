import { sourceDataIngestionTask } from '../tasks/source-data-ingestion';
import { dataResolutionTask } from '../tasks/data-resolution';
import { enrichment } from '../tasks/enrichment';
import { scoring } from '../tasks/scoring';
import { clickupCreateTask } from '../tasks/create-clickup-task';
import { SourceDataIngestionInput } from '../../schemas/source-data-ingestion/task';
import { task } from '@trigger.dev/sdk/v3';

export const dataProcessingTrack = task({
  id: 'data-processing',
  
  run: async (payload: SourceDataIngestionInput) => {
    // 1. Source Data Ingestion
    const ingestionResult = await sourceDataIngestionTask.triggerAndWait(payload);
    if (!ingestionResult.ok) {
      return {
        success: false,
        error: ingestionResult.error || 'Source data ingestion failed',
        trampData: payload.trampData,
      };
    }

    // 2. Data Resolution
    const resolutionResult = await dataResolutionTask.triggerAndWait({
      sourceRecordId: ingestionResult.output.data.sourceRecordId,
      trampData: payload.trampData,
    });
    if (!resolutionResult.ok) {
      return {
        success: false,
        error: resolutionResult.error || 'Data resolution failed',
        trampData: payload.trampData,
      };
    }

    // 3. Enrichment (if person or organization was resolved)
    const enrichmentResult = await enrichment.triggerAndWait({
      sourceRecordId: ingestionResult.output.data.sourceRecordId,
      personId: resolutionResult.output.data?.person?.id,
      organizationId: resolutionResult.output.data?.organization?.id,
      config: {
        forceReenrichOrganisation: false,
        forceReenrichPerson: false,
      },
      trampData: payload.trampData,
    });
    if (!enrichmentResult.ok) {
      return {
        success: false,
        error: enrichmentResult.error || 'Enrichment failed',
        trampData: payload.trampData,
      };
    }

    // 4. Scoring
    const scoringResult = await scoring.triggerAndWait({
      sourceRecordId: ingestionResult.output.data.sourceRecordId,
      personId: resolutionResult.output.data?.person?.id,
      organizationId: resolutionResult.output.data?.organization?.id,
      trampData: payload.trampData,
    });
    if (!scoringResult.ok) {
      return {
        success: false,
        error: scoringResult.error || 'Scoring failed',
        trampData: payload.trampData,
      };
    }

    // 5. Create ClickUp Tasks based on entity type
    const clickupTasks = [];

    if (resolutionResult.output.data?.person) {
      const personTaskResult = await clickupCreateTask.trigger({
        name: `Follow up with ${resolutionResult.output.data.person.name || 'Lead'}`,
        type: 'person_followup',
        source: payload.source.type as unknown as "enrichment" | "lead" | "scoring" | "manual",
        entityType: 'person',
        entityId: resolutionResult.output.data.person.id,
        personId: resolutionResult.output.data.person.id,
        organizationId: resolutionResult.output.data.organization?.id,
        sourceRecordId: ingestionResult.output.data.sourceRecordId,
        trampData: payload.trampData,
      });
      clickupTasks.push(personTaskResult);
    }

    if (resolutionResult.output.data?.organization) {
      const orgTaskResult = await clickupCreateTask.trigger({
        name: `Review ${resolutionResult.output.data.organization.name || 'Organization'}`,
        type: 'org_review',
        source: payload.source.type as unknown as "enrichment" | "lead" | "scoring" | "manual",
        entityType: 'organization',
        entityId: resolutionResult.output.data.organization.id,
        personId: resolutionResult.output.data.person?.id,
        organizationId: resolutionResult.output.data.organization.id,
        sourceRecordId: ingestionResult.output.data.sourceRecordId,
        trampData: payload.trampData,
      });
      clickupTasks.push(orgTaskResult);
    }

    // Return final results
    return {
      success: true,
      data: {
        sourceRecordId: ingestionResult.output.data.sourceRecordId,
        personId: resolutionResult.output.data?.person?.id,
        organizationId: resolutionResult.output.data?.organization?.id,
        enriched: enrichmentResult.output.data,
        scored: scoringResult.output.data,
        tasks: clickupTasks,
      },
      trampData: payload.trampData,
    };
  },
}); 