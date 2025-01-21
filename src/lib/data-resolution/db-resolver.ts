/**
 * Database-backed Data Resolution Implementation
 * =========================================
 * Concrete implementation of data resolution using database tables.
 */

import { eq, and, or, sql, isNull } from 'drizzle-orm';
import { db } from '../../database';
import { persons, contacts, organizations, sourceRecords } from '../../database/schema';
import { DataResolver, MatchResult } from './resolver';
import { enrichPersonWithClay, enrichOrganizationWithClay } from '../../services/clay';
import { calculatePersonScore } from '../../services/scoring';

interface DbRecord {
  type: 'person' | 'organization';
  data: Record<string, unknown>;
}

export class DatabaseResolver extends DataResolver {
  /**
   * Validate input data against schema
   */
  protected async validateData(data: unknown): Promise<boolean> {
    if (typeof data !== 'object' || !data) {
      return false;
    }

    const record = data as DbRecord;
    
    // Basic structure validation
    if (!record.type || !record.data) {
      return false;
    }

    // Type-specific validation
    switch (record.type) {
      case 'person':
        return this.validatePersonData(record.data);
      case 'organization':
        return this.validateOrganizationData(record.data);
      default:
        return false;
    }
  }

  /**
   * Check if record is already resolved
   */
  protected async isAlreadyResolved(data: unknown): Promise<boolean> {
    const record = data as DbRecord;
    const recordId = record.data.id?.toString();
    
    // Check source records table
    const existingRecord = await db
      .select()
      .from(sourceRecords)
      .where(and(
        eq(sourceRecords.sourceType, record.type),
        eq(sourceRecords.processingStatus, 'processed'),
        recordId 
          ? record.type === 'person'
            ? eq(sourceRecords.resolvedPersonId, recordId)
            : eq(sourceRecords.resolvedOrgId, recordId)
          : sql`false`
      ))
      .limit(1);

    return existingRecord.length > 0;
  }

  /**
   * Find exact match in database
   */
  protected async findExactMatch(data: unknown): Promise<MatchResult | null> {
    const record = data as DbRecord;
    
    switch (record.type) {
      case 'person':
        return this.findExactPersonMatch(record.data);
      case 'organization':
        return this.findExactOrganizationMatch(record.data);
      default:
        return null;
    }
  }

  /**
   * Find fuzzy match in database
   */
  protected async findFuzzyMatch(data: unknown, threshold: number): Promise<MatchResult | null> {
    const record = data as DbRecord;
    
    switch (record.type) {
      case 'person':
        return this.findFuzzyPersonMatch(record.data, threshold);
      case 'organization':
        return this.findFuzzyOrganizationMatch(record.data, threshold);
      default:
        return null;
    }
  }

  /**
   * Merge records in database
   */
  protected async mergeRecords(recordId: string, data: unknown): Promise<{ id: string }> {
    const record = data as DbRecord;
    
    switch (record.type) {
      case 'person':
        return this.mergePersonRecords(recordId, record.data);
      case 'organization':
        return this.mergeOrganizationRecords(recordId, record.data);
      default:
        throw new Error(`Unsupported record type: ${record.type}`);
    }
  }

  /**
   * Create new record in database
   */
  protected async createRecord(data: unknown): Promise<{ id: string; type: "person" | "organization" }> {
    const record = data as DbRecord;
    
    switch (record.type) {
      case 'person':
        const person = await this.createPerson(record.data);
        return { id: person.id, type: 'person' };
      case 'organization':
        const org = await this.createOrganization(record.data);
        return { id: org.id, type: 'organization' };
      default:
        throw new Error(`Unsupported record type: ${record.type}`);
    }
  }

  // Helper methods for person records
  private validatePersonData(data: Record<string, unknown>): boolean {
    // Required fields
    if (!data.firstName && !data.lastName && !data.email) {
      return false;
    }

    // Email format if present
    if (data.email && typeof data.email === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        return false;
      }
    }

    return true;
  }

  private async findExactPersonMatch(data: Record<string, unknown>): Promise<MatchResult | null> {
    // Try to match by email first
    if (data.email) {
      const [contact] = await db
        .select()
        .from(contacts)
        .where(and(
          eq(contacts.type, 'email'),
          eq(contacts.value, data.email as string)
        ))
        .limit(1);

      if (contact) {
        const [person] = await db
          .select()
          .from(persons)
          .where(eq(persons.id, contact.personId))
          .limit(1);

        if (person) {
          return {
            confidence: 1,
            matchedFields: ['email'],
            recordId: person.id,
            recordType: 'person'
          };
        }
      }
    }

    // Then try name match if available
    if (data.firstName && data.lastName) {
      const [person] = await db
        .select()
        .from(persons)
        .where(and(
          eq(persons.firstName, data.firstName as string),
          eq(persons.lastName, data.lastName as string)
        ))
        .limit(1);

      if (person) {
        return {
          confidence: 0.9, // Slightly lower than email match
          matchedFields: ['firstName', 'lastName'],
          recordId: person.id,
          recordType: 'person'
        };
      }
    }

    return null;
  }

  private async findFuzzyPersonMatch(data: Record<string, unknown>, threshold: number): Promise<MatchResult | null> {
    // Use similarity for name matching
    if (data.firstName || data.lastName) {
      const [person] = await db
        .select()
        .from(persons)
        .where(
          sql`(
            similarity(${persons.firstName}, ${data.firstName || ''}) > ${threshold}
            OR similarity(${persons.lastName}, ${data.lastName || ''}) > ${threshold}
          )`
        )
        .limit(1);

      if (person) {
        const confidence = Math.max(
          data.firstName ? similarity(person.firstName || '', data.firstName as string) : 0,
          data.lastName ? similarity(person.lastName || '', data.lastName as string) : 0
        );

        return {
          confidence,
          matchedFields: ['name'],
          recordId: person.id,
          recordType: 'person'
        };
      }
    }

    return null;
  }

  private async mergePersonRecords(personId: string, data: Record<string, unknown>): Promise<{ id: string }> {
    // Update person record
    const [updated] = await db
      .update(persons)
      .set({
        ...data,
        updatedAt: new Date()
      } as typeof persons.$inferInsert)
      .where(eq(persons.id, personId))
      .returning();

    // Enrich if configured
    if (this.context.config.options?.enrichAfterMerge) {
      const enrichedData = await enrichPersonWithClay(updated);
      await db
        .update(persons)
        .set({
          enrichmentData: enrichedData,
          enrichmentStatus: 'completed',
          lastEnrichedAt: new Date()
        })
        .where(eq(persons.id, personId));
    }

    return { id: updated.id };
  }

  private async createPerson(data: Record<string, unknown>): Promise<{ id: string }> {
    // Insert person
    const [person] = await db
      .insert(persons)
      .values({
        ...data,
        type: 'lead',
        status: 'new'
      } as typeof persons.$inferInsert)
      .returning();

    // Create contact if email provided
    if (data.email) {
      await db
        .insert(contacts)
        .values({
          type: 'email',
          value: data.email as string,
          isPrimary: true,
          personId: person.id
        });
    }

    // Enrich if configured
    if (this.context.config.options?.enrichAfterCreate) {
      const enrichedData = await enrichPersonWithClay(person);
      await db
        .update(persons)
        .set({
          enrichmentData: enrichedData,
          enrichmentStatus: 'completed',
          lastEnrichedAt: new Date()
        })
        .where(eq(persons.id, person.id));
    }

    return { id: person.id };
  }

  // Helper methods for organization records
  private validateOrganizationData(data: Record<string, unknown>): boolean {
    // Required fields
    if (!data.name || !data.domain) {
      return false;
    }

    // Domain format
    if (typeof data.domain === 'string') {
      const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
      if (!domainRegex.test(data.domain)) {
        return false;
      }
    }

    return true;
  }

  private async findExactOrganizationMatch(data: Record<string, unknown>): Promise<MatchResult | null> {
    // Try domain match first
    if (data.domain) {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.domain, data.domain as string))
        .limit(1);

      if (org) {
        return {
          confidence: 1,
          matchedFields: ['domain'],
          recordId: org.id,
          recordType: 'organization'
        };
      }
    }

    // Then try exact name match
    if (data.name) {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.name, data.name as string))
        .limit(1);

      if (org) {
        return {
          confidence: 0.9, // Slightly lower than domain match
          matchedFields: ['name'],
          recordId: org.id,
          recordType: 'organization'
        };
      }
    }

    return null;
  }

  private async findFuzzyOrganizationMatch(data: Record<string, unknown>, threshold: number): Promise<MatchResult | null> {
    if (data.name) {
      const [org] = await db
        .select()
        .from(organizations)
        .where(sql`similarity(${organizations.name}, ${data.name}) > ${threshold}`)
        .limit(1);

      if (org) {
        const confidence = similarity(org.name, data.name as string);
        return {
          confidence,
          matchedFields: ['name'],
          recordId: org.id,
          recordType: 'organization'
        };
      }
    }

    return null;
  }

  private async mergeOrganizationRecords(orgId: string, data: Record<string, unknown>): Promise<{ id: string }> {
    // Update organization record
    const [updated] = await db
      .update(organizations)
      .set({
        ...data,
        updatedAt: new Date()
      } as typeof organizations.$inferInsert)
      .where(eq(organizations.id, orgId))
      .returning();

    // Enrich if configured
    if (this.context.config.options?.enrichAfterMerge) {
      const enrichedData = await enrichOrganizationWithClay(updated);
      await db
        .update(organizations)
        .set({
          enrichmentData: enrichedData,
          enrichmentStatus: 'completed',
          lastEnrichedAt: new Date()
        })
        .where(eq(organizations.id, orgId));
    }

    return { id: updated.id };
  }

  private async createOrganization(data: Record<string, unknown>): Promise<{ id: string }> {
    // Insert organization
    const [org] = await db
      .insert(organizations)
      .values({
        ...data,
        type: 'prospect',
        status: 'new'
      } as typeof organizations.$inferInsert)
      .returning();

    // Enrich if configured
    if (this.context.config.options?.enrichAfterCreate) {
      const enrichedData = await enrichOrganizationWithClay(org);
      await db
        .update(organizations)
        .set({
          enrichmentData: enrichedData,
          enrichmentStatus: 'completed',
          lastEnrichedAt: new Date()
        })
        .where(eq(organizations.id, org.id));
    }

    return { id: org.id };
  }
}

// Helper function to calculate string similarity
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) {
    return 1.0;
  }
  
  const costs = new Array();
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[shorter.length] = lastValue;
    }
  }
  
  return (longer.length - costs[shorter.length]) / longer.length;
} 