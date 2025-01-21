/**
 * Clay Enrichment Service
 * =====================
 * Service for enriching person and organization data using Clay API.
 */

import { persons, organizations } from '../database/schema';
import { EnrichmentDataSource, FieldMapping, EnrichmentRule } from '../schemas/enrichment/config';
import { EnrichmentFieldResult } from '../schemas/enrichment/task';
import { logger } from '@trigger.dev/sdk/v3';

interface ClayEnrichmentOptions {
  dataSources: EnrichmentDataSource[];
  fieldMappings: FieldMapping[];
  rules: EnrichmentRule[];
}

// Rate limiting and request management
class ClayRateLimiter {
  private lastRequest: number = 0;
  private queue: Array<() => Promise<void>> = [];
  private processing: boolean = false;

  constructor(private options: { requestsPerSecond: number; cooldownMs: number }) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequest;
          if (timeSinceLastRequest < this.options.cooldownMs) {
            await new Promise(r => setTimeout(r, this.options.cooldownMs - timeSinceLastRequest));
          }
          this.lastRequest = Date.now();
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) await task();
    }
    this.processing = false;
  }
}

// Clay API client
class ClayClient {
  private rateLimiter: ClayRateLimiter;

  constructor(private config: EnrichmentDataSource) {
    this.rateLimiter = new ClayRateLimiter({
      requestsPerSecond: config.rateLimits?.requestsPerSecond ?? 2,
      cooldownMs: config.rateLimits?.cooldownMs ?? 1000
    });
  }

  private async makeRequest(endpoint: string, data: any): Promise<any> {
    return this.rateLimiter.execute(async () => {
      const response = await fetch(`${this.config.baseUrl ?? 'https://api.clay.com/v1'}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`Clay API error: ${response.statusText}`);
      }

      return response.json();
    });
  }

  async enrichPerson(person: any): Promise<Record<string, unknown>> {
    try {
      const enrichedData = await this.makeRequest('/enrich/person', {
        name: person.name,
        email: person.email,
        company: person.company,
        title: person.title,
        location: person.location
      });

      return enrichedData;
    } catch (error) {
      logger.error('Clay person enrichment failed', { error });
      throw error;
    }
  }

  async enrichOrganization(org: any): Promise<Record<string, unknown>> {
    try {
      const enrichedData = await this.makeRequest('/enrich/organization', {
        name: org.name,
        domain: org.domain,
        location: org.location
      });

      return enrichedData;
    } catch (error) {
      logger.error('Clay organization enrichment failed', { error });
      throw error;
    }
  }
}

// Helper functions
function applyFieldMapping(data: any, mapping: FieldMapping): EnrichmentFieldResult {
  try {
    const originalValue = data[mapping.sourceField];
    let enrichedValue = originalValue;

    if (mapping.transform) {
      enrichedValue = mapping.transform(originalValue);
    }

    return {
      field: mapping.targetField,
      enriched: true,
      provider: 'clay',
      originalValue,
      enrichedValue,
      confidence: 1.0,
      metadata: {
        transformApplied: !!mapping.transform
      }
    };
  } catch (error) {
    return {
      field: mapping.targetField,
      enriched: false,
      provider: 'clay',
      originalValue: data[mapping.sourceField],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Main enrichment functions
export async function enrichPersonWithClay(
  person: typeof persons.$inferSelect,
  options?: ClayEnrichmentOptions
): Promise<Record<string, EnrichmentFieldResult>> {
  const results: Record<string, EnrichmentFieldResult> = {};
  
  try {
    // Initialize Clay client with first data source
    const dataSource = options?.dataSources.find(ds => ds.provider === 'clay');
    if (!dataSource) {
      throw new Error('No Clay data source configured');
    }
    
    const client = new ClayClient(dataSource);
    const enrichedData = await client.enrichPerson(person);

    // Apply field mappings
    for (const mapping of options?.fieldMappings ?? []) {
      results[mapping.targetField] = applyFieldMapping(enrichedData, mapping);
    }

    return results;
  } catch (error) {
    logger.error('Person enrichment failed', { error });
    throw error;
  }
}

export async function enrichOrganizationWithClay(
  org: typeof organizations.$inferSelect,
  options?: ClayEnrichmentOptions
): Promise<Record<string, EnrichmentFieldResult>> {
  const results: Record<string, EnrichmentFieldResult> = {};
  
  try {
    // Initialize Clay client with first data source
    const dataSource = options?.dataSources.find(ds => ds.provider === 'clay');
    if (!dataSource) {
      throw new Error('No Clay data source configured');
    }
    
    const client = new ClayClient(dataSource);
    const enrichedData = await client.enrichOrganization(org);

    // Apply field mappings
    for (const mapping of options?.fieldMappings ?? []) {
      results[mapping.targetField] = applyFieldMapping(enrichedData, mapping);
    }

    return results;
  } catch (error) {
    logger.error('Organization enrichment failed', { error });
    throw error;
  }
}
