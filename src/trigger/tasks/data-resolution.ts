// src/trigger/data_resolution.ts
import { task, logger } from '@trigger.dev/sdk/v3';
import { db } from '../../database';
import { sourceRecords, contacts, persons, organizations } from '../../database/schema';
import { eq } from 'drizzle-orm';
import { DataResolutionInput } from '../../schemas/data-resolution/task';

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

  run: async (payload: DataResolutionInput) => {
    try {
      // 1. Load source record
      const [sourceRecord] = await db
        .select()
        .from(sourceRecords)
        .where(eq(sourceRecords.id, payload.sourceRecordId))
        .limit(1);

      if (!sourceRecord) {
        throw new Error(`Source record ${payload.sourceRecordId} not found`);
      }

      // 2. Process in transaction
      const result = await db.transaction(async (tx) => {
        const rawData = sourceRecord.rawData as any;
        let resolvedContact = null;
        let resolvedPerson = null;
        let resolvedOrg = null;

        // 3. Process Contact if exists
        if (rawData.contact?.type && rawData.contact?.value) {
          // Create person first
          const [tempPerson] = await tx
            .insert(persons)
            .values({
              type: 'lead',
              status: 'new',
            })
            .returning();

          // Upsert contact
          const [contact] = await tx
            .insert(contacts)
            .values({
              type: rawData.contact.type,
              value: rawData.contact.value,
              isPrimary: true,
              status: 'unverified',
              personId: tempPerson.id,
            })
            .onConflictDoUpdate({
              target: [contacts.type, contacts.value, contacts.personId],
              set: {
                updatedAt: new Date(),
              },
            })
            .returning();

          resolvedContact = contact;
        }

        // 4. Process Person
        if (rawData.person || resolvedContact) {
          const [person] = await tx
            .insert(persons)
            .values({
              ...rawData.person,
              type: rawData.person?.type ?? 'lead',
              status: rawData.person?.status ?? 'new',
            })
            .onConflictDoUpdate({
              target: [persons.id],
              set: rawData.person || {},
            })
            .returning();

          resolvedPerson = person;
        }

        // 5. Process Organization
        if (rawData.organization) {
          const [org] = await tx
            .insert(organizations)
            .values({
              name: rawData.organization.name,
              domain: rawData.organization.domain,
              website: rawData.organization.website,
            })
            .onConflictDoUpdate({
              target: [organizations.domain],
              set: {
                name: rawData.organization.name,
                website: rawData.organization.website,
                updatedAt: new Date(),
              },
            })
            .returning();

          resolvedOrg = org;
        }

        // 6. Update source record
        await tx
          .update(sourceRecords)
          .set({
            processingStatus: 'processed',
            processedAt: new Date(),
            resolvedContactId: resolvedContact?.id,
            resolvedPersonId: resolvedPerson?.id,
            resolvedOrgId: resolvedOrg?.id,
            normalizedData: {
              contact: resolvedContact,
              person: resolvedPerson,
              organization: resolvedOrg,
            },
          })
          .where(eq(sourceRecords.id, sourceRecord.id));

        return {
          contact: resolvedContact,
          person: resolvedPerson,
          organization: resolvedOrg,
        };
      });

      return {
        success: true,
        data: result,
        trampData: payload.trampData,
      };
    } catch (error) {
      logger.error('Data resolution failed', { error });

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

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: null,
        trampData: payload.trampData,
      };
    }
  },
});
