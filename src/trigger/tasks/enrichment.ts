/**
 * Enrichment Task
 * ==============
 * Task for enriching person and organization data using configured providers.
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import { db } from '../../database';
import { sourceRecords, persons, organizations } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { enrichPersonWithClay, enrichOrganizationWithClay } from '../../services/clay';
import { EnrichmentInput, EnrichmentOutput, EnrichmentEntityResult, EnrichmentFieldResult } from '../../schemas/enrichment/task';
import { EntityEnrichmentConfig, EnrichmentRule, EnrichmentConfig } from '../../schemas/enrichment/config';

// Type-safe field access
type PersonRecord = typeof persons.$inferSelect;
type OrganizationRecord = typeof organizations.$inferSelect;

interface DynamicRecord {
  [key: string]: unknown;
}

// Default global config
const defaultGlobalConfig: NonNullable<EnrichmentConfig["global"]> = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeout: 30000,
  concurrency: 5,
  logLevel: "info",
  dryRun: false
};

function getFieldValue(record: PersonRecord | OrganizationRecord, field: string): unknown {
  return (record as DynamicRecord)[field];
}

// Validation functions
function validateEntity(data: PersonRecord | OrganizationRecord, requiredFields: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const field of requiredFields) {
    if (!getFieldValue(data, field)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Rule evaluation
function evaluateRule(rule: EnrichmentRule, data: PersonRecord | OrganizationRecord): boolean {
  const value = getFieldValue(data, rule.field);
  
  switch (rule.condition) {
    case "missing":
      return value === undefined || value === null;
    case "empty":
      return !value || (typeof value === "string" && value.trim() === "");
    case "always":
      return true;
    case "never":
      return false;
    default:
      return false;
  }
}

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

  run: async (payload: EnrichmentInput, context): Promise<EnrichmentOutput> => {
    const startTime = Date.now();
    const processingSteps: string[] = [];
    const enrichmentResults: { person?: EnrichmentEntityResult; organization?: EnrichmentEntityResult } = {};
    const globalConfig = { ...defaultGlobalConfig, ...payload.config?.global };

    try {
      // Load source record
      processingSteps.push('load_source_record');
      const [sourceRecord] = await db
        .select()
        .from(sourceRecords)
        .where(eq(sourceRecords.id, payload.sourceRecordId))
        .limit(1);

      if (!sourceRecord) {
        throw new Error(`Source record ${payload.sourceRecordId} not found`);
      }

      // Enrich person if exists
      if (payload.personId) {
        processingSteps.push('enrich_person');
        const personResult = await enrichPerson(
          payload.personId,
          payload.config?.person ?? undefined,
          globalConfig
        );
        enrichmentResults.person = personResult;
      }

      // Enrich organization if exists
      if (payload.organizationId) {
        processingSteps.push('enrich_organization');
        const orgResult = await enrichOrganization(
          payload.organizationId,
          payload.config?.organization ?? undefined,
          globalConfig
        );
        enrichmentResults.organization = orgResult;
      }

      // Calculate overall stats
      const stats = calculateEnrichmentStats(enrichmentResults);
      const processingTime = Date.now() - startTime;

      return {
        job: {
          success: true,
          taskName: "enrichment",
          runId: context.ctx.run.id,
          input: {
            sourceRecordId: payload.sourceRecordId,
            config: payload.config
          }
        },
        success: true,
        data: enrichmentResults,
        metadata: {
          processingTime,
          processingSteps,
          validationResults: {
            passed: true
          },
          enrichmentStats: stats
        },
        trampData: payload.trampData
      };

    } catch (error) {
      logger.error('Enrichment failed', { error });
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        job: {
          success: false,
          taskName: "enrichment",
          runId: context.ctx.run.id,
          input: {
            sourceRecordId: payload.sourceRecordId,
            config: payload.config
          },
          error: errorMessage
        },
        success: false,
        error: errorMessage,
        metadata: {
          processingTime,
          processingSteps,
          validationResults: {
            passed: false,
            errors: [errorMessage]
          },
          enrichmentStats: {
            totalEntities: 0,
            successfulEntities: 0,
            failedEntities: 0,
            totalFields: 0,
            enrichedFields: 0,
            failedFields: 0
          }
        },
        trampData: payload.trampData
      };
    }
  }
});

// Helper functions
async function enrichPerson(
  personId: string,
  config?: EntityEnrichmentConfig,
  globalConfig?: NonNullable<EnrichmentConfig["global"]>
): Promise<EnrichmentEntityResult> {
  const startTime = new Date();
  
  try {
    // Load person
    const [person] = await db
      .select()
      .from(persons)
      .where(eq(persons.id, personId))
      .limit(1);

    if (!person) {
      throw new Error(`Person ${personId} not found`);
    }

    // Skip if not enabled
    if (config?.enabled === false) {
      return {
        entityType: "person",
        entityId: personId,
        status: "skipped",
        fields: [],
        providers: [],
        startTime,
        endTime: new Date(),
        duration: new Date().getTime() - startTime.getTime(),
        metadata: {
          totalFields: 0,
          enrichedFields: 0,
          failedFields: 0,
          skippedFields: 0
        }
      };
    }

    // Validate before enrichment if configured
    if (config?.validation?.validateBeforeEnrichment) {
      const validation = validateEntity(person, config.validation.requiredFields);
      if (!validation.valid) {
        return {
          entityType: "person",
          entityId: personId,
          status: "failed",
          fields: [],
          providers: [],
          startTime,
          endTime: new Date(),
          duration: new Date().getTime() - startTime.getTime(),
          error: `Validation failed: ${validation.errors.join(", ")}`,
          metadata: {
            totalFields: 0,
            enrichedFields: 0,
            failedFields: 0,
            skippedFields: 0
          }
        };
      }
    }

    // Check cache if enabled
    let enrichedFields: Record<string, EnrichmentFieldResult> = {};

    // Apply enrichment rules
    const fieldsToEnrich = config?.rules?.filter(rule => evaluateRule(rule, person)) ?? [];
    const providers = new Set<string>();

    // Enrich using configured data sources
    for (const rule of fieldsToEnrich) {
      const dataSource = config?.dataSources.find(ds => ds.provider === rule.provider);
      if (!dataSource) continue;

      try {
        const result = await enrichPersonWithClay(person, {
          dataSources: [dataSource],
          fieldMappings: config?.fieldMappings.filter(fm => fm.targetField === rule.field) ?? [],
          rules: [rule]
        });

        enrichedFields = { ...enrichedFields, ...result };
        providers.add(rule.provider);
      } catch (error) {
        logger.error(`Enrichment failed for field ${rule.field}`, { error });
        if (rule.fallback !== undefined) {
          enrichedFields[rule.field] = {
            field: rule.field,
            enriched: true,
            provider: rule.provider,
            originalValue: getFieldValue(person, rule.field),
            enrichedValue: rule.fallback,
            confidence: 0.5,
            metadata: { fromFallback: true }
          };
        }
      }
    }

    // Update person record
    if (!globalConfig?.dryRun) {
      await db
        .update(persons)
        .set({
          enrichmentStatus: 'enriched',
          lastEnrichedAt: new Date(),
          enrichmentData: enrichedFields
        })
        .where(eq(persons.id, personId));
    }

    // Calculate field stats
    const fieldResults = Object.values(enrichedFields);
    const enrichedCount = fieldResults.filter(f => f.enriched).length;
    const failedCount = fieldResults.filter(f => !f.enriched).length;

    return {
      entityType: "person",
      entityId: personId,
      status: failedCount === 0 ? "success" : enrichedCount > 0 ? "partial" : "failed",
      fields: fieldResults,
      providers: Array.from(providers),
      startTime,
      endTime: new Date(),
      duration: new Date().getTime() - startTime.getTime(),
      metadata: {
        totalFields: fieldResults.length,
        enrichedFields: enrichedCount,
        failedFields: failedCount,
        skippedFields: 0,
        averageConfidence: calculateAverageConfidence(fieldResults)
      }
    };

  } catch (error) {
    logger.error('Person enrichment failed', { error });
    return {
      entityType: "person",
      entityId: personId,
      status: "failed",
      fields: [],
      providers: [],
      startTime,
      endTime: new Date(),
      duration: new Date().getTime() - startTime.getTime(),
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        totalFields: 0,
        enrichedFields: 0,
        failedFields: 0,
        skippedFields: 0
      }
    };
  }
}

async function enrichOrganization(
  orgId: string,
  config?: EntityEnrichmentConfig,
  globalConfig?: NonNullable<EnrichmentConfig["global"]>
): Promise<EnrichmentEntityResult> {
  const startTime = new Date();
  
  try {
    // Load organization
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }

    // Skip if not enabled
    if (config?.enabled === false) {
      return {
        entityType: "organization",
        entityId: orgId,
        status: "skipped",
        fields: [],
        providers: [],
        startTime,
        endTime: new Date(),
        duration: new Date().getTime() - startTime.getTime(),
        metadata: {
          totalFields: 0,
          enrichedFields: 0,
          failedFields: 0,
          skippedFields: 0
        }
      };
    }

    // Validate before enrichment if configured
    if (config?.validation?.validateBeforeEnrichment) {
      const validation = validateEntity(org, config.validation.requiredFields);
      if (!validation.valid) {
        return {
          entityType: "organization",
          entityId: orgId,
          status: "failed",
          fields: [],
          providers: [],
          startTime,
          endTime: new Date(),
          duration: new Date().getTime() - startTime.getTime(),
          error: `Validation failed: ${validation.errors.join(", ")}`,
          metadata: {
            totalFields: 0,
            enrichedFields: 0,
            failedFields: 0,
            skippedFields: 0
          }
        };
      }
    }

    // Check cache if enabled
    let enrichedFields: Record<string, EnrichmentFieldResult> = {};

    // Apply enrichment rules
    const fieldsToEnrich = config?.rules?.filter(rule => evaluateRule(rule, org)) ?? [];
    const providers = new Set<string>();

    // Enrich using configured data sources
    for (const rule of fieldsToEnrich) {
      const dataSource = config?.dataSources.find(ds => ds.provider === rule.provider);
      if (!dataSource) continue;

      try {
        const result = await enrichOrganizationWithClay(org, {
          dataSources: [dataSource],
          fieldMappings: config?.fieldMappings.filter(fm => fm.targetField === rule.field) ?? [],
          rules: [rule]
        });

        enrichedFields = { ...enrichedFields, ...result };
        providers.add(rule.provider);
      } catch (error) {
        logger.error(`Enrichment failed for field ${rule.field}`, { error });
        if (rule.fallback !== undefined) {
          enrichedFields[rule.field] = {
            field: rule.field,
            enriched: true,
            provider: rule.provider,
            originalValue: getFieldValue(org, rule.field),
            enrichedValue: rule.fallback,
            confidence: 0.5,
            metadata: { fromFallback: true }
          };
        }
      }
    }

    // Update organization record
    if (!globalConfig?.dryRun) {
      await db
        .update(organizations)
        .set({
          enrichmentStatus: 'enriched',
          lastEnrichedAt: new Date(),
          enrichmentData: enrichedFields
        })
        .where(eq(organizations.id, orgId));
    }

    // Calculate field stats
    const fieldResults = Object.values(enrichedFields);
    const enrichedCount = fieldResults.filter(f => f.enriched).length;
    const failedCount = fieldResults.filter(f => !f.enriched).length;

    return {
      entityType: "organization",
      entityId: orgId,
      status: failedCount === 0 ? "success" : enrichedCount > 0 ? "partial" : "failed",
      fields: fieldResults,
      providers: Array.from(providers),
      startTime,
      endTime: new Date(),
      duration: new Date().getTime() - startTime.getTime(),
      metadata: {
        totalFields: fieldResults.length,
        enrichedFields: enrichedCount,
        failedFields: failedCount,
        skippedFields: 0,
        averageConfidence: calculateAverageConfidence(fieldResults)
      }
    };

  } catch (error) {
    logger.error('Organization enrichment failed', { error });
    return {
      entityType: "organization",
      entityId: orgId,
      status: "failed",
      fields: [],
      providers: [],
      startTime,
      endTime: new Date(),
      duration: new Date().getTime() - startTime.getTime(),
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        totalFields: 0,
        enrichedFields: 0,
        failedFields: 0,
        skippedFields: 0
      }
    };
  }
}

function calculateEnrichmentStats(results: { 
  person?: EnrichmentEntityResult; 
  organization?: EnrichmentEntityResult 
}): EnrichmentOutput["metadata"]["enrichmentStats"] {
  const entities = [results.person, results.organization].filter((r): r is EnrichmentEntityResult => r !== undefined);
  
  const totalEntities = entities.length;
  const successfulEntities = entities.filter(e => e.status === "success").length;
  const failedEntities = entities.filter(e => e.status === "failed").length;
  
  const totalFields = entities.reduce((sum, e) => sum + e.metadata.totalFields, 0);
  const enrichedFields = entities.reduce((sum, e) => sum + e.metadata.enrichedFields, 0);
  const failedFields = entities.reduce((sum, e) => sum + e.metadata.failedFields, 0);
  
  const confidenceValues = entities
    .flatMap(e => e.fields)
    .filter(f => f.enriched && f.confidence !== undefined)
    .map(f => f.confidence!);
  
  const averageConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length
    : undefined;

  return {
    totalEntities,
    successfulEntities,
    failedEntities,
    totalFields,
    enrichedFields,
    failedFields,
    averageConfidence
  };
}

function calculateAverageConfidence(fields: EnrichmentFieldResult[]): number | undefined {
  const confidenceValues = fields
    .filter(f => f.enriched && f.confidence !== undefined)
    .map(f => f.confidence!);
  
  return confidenceValues.length > 0
    ? confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length
    : undefined;
}
