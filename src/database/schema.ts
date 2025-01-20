// src/db/schema.ts
import { pgTable, text, timestamp, boolean, json, index, integer, real } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// Source Records Table
export const sourceRecords = pgTable(
    'source_records',
    {
        id: text('id')
            .primaryKey()
            .notNull()
            .$defaultFn(() => createId()),
        createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),

        sourceType: text('source_type').notNull(),
        sourceId: text('source_id'),
        batchId: text('batch_id'),
        provider: text('provider'),

        rawData: json('raw_data').$type<Record<string, unknown>>().notNull(),
        normalizedData: json('normalized_data').$type<Record<string, unknown> | null>(),
        processingStatus: text('processing_status').notNull(),
        processingErrors: json('processing_errors').$type<Record<string, unknown> | null>(),
        processedAt: timestamp('processed_at', { mode: 'date' }),

        resolvedContactId: text('resolved_contact_id').references(() => contacts.id),
        resolvedPersonId: text('resolved_person_id').references(() => persons.id),
        resolvedOrgId: text('resolved_org_id').references(() => organizations.id),
    },
    (table) => ({
        sourceTypeIdx: index('source_type_idx').on(table.sourceType, table.sourceId),
        processingStatusIdx: index('processing_status_idx').on(table.processingStatus),
    }),
);

// Contacts Table
export const contacts = pgTable(
    'contacts',
    {
        id: text('id')
            .primaryKey()
            .notNull()
            .$defaultFn(() => createId()),
        createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),

        type: text('type').notNull(),
        value: text('value').notNull(),
        isPrimary: boolean('is_primary').default(false).notNull(),

        status: text('status').default('unverified').notNull(),
        quality: real('quality'),
        lastValidatedAt: timestamp('last_validated_at', { mode: 'date' }),
        validationData: json('validation_data').$type<Record<string, unknown> | null>(),

        isSubscribed: boolean('is_subscribed').default(true).notNull(),
        subscriptionStatus: text('subscription_status'),
        subscriptionSource: text('subscription_source'),
        subscribedAt: timestamp('subscribed_at', { mode: 'date' }),
        unsubscribedAt: timestamp('unsubscribed_at', { mode: 'date' }),
        lastEngagedAt: timestamp('last_engaged_at', { mode: 'date' }),

        personId: text('person_id')
            .notNull()
            .references(() => persons.id),
    },
    (table) => ({
        personTypeValueIdx: index('person_type_value_idx').on(table.personId, table.type, table.value),
        typeValueIdx: index('type_value_idx').on(table.type, table.value),
        statusIdx: index('status_idx').on(table.status),
    }),
);

// Persons Table
export const persons = pgTable(
    'persons',
    {
        id: text('id')
            .primaryKey()
            .notNull()
            .$defaultFn(() => createId()),
        createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),

        name: text('name'),
        firstName: text('first_name'),
        lastName: text('last_name'),

        type: text('type'),
        status: text('status'),
        lifecycle: text('lifecycle'),

        score: real('score'),
        scoreUpdatedAt: timestamp('score_updated_at', { mode: 'date' }),
        scoringData: json('scoring_data').$type<Record<string, unknown> | null>(),

        sourceType: text('source_type'),
        sourceId: text('source_id'),
        firstTouchSource: text('first_touch_source'),
        lastTouchSource: text('last_touch_source'),

        firstSeenAt: timestamp('first_seen_at', { mode: 'date' }).defaultNow().notNull(),
        lastSeenAt: timestamp('last_seen_at', { mode: 'date' }).defaultNow().notNull(),
        lastActivityAt: timestamp('last_activity_at', { mode: 'date' }),
        activityCount: integer('activity_count').default(0).notNull(),

        enrichmentStatus: text('enrichment_status'),
        lastEnrichedAt: timestamp('last_enriched_at', { mode: 'date' }),
        enrichmentData: json('enrichment_data').$type<Record<string, unknown> | null>(),

        marketingStatus: text('marketing_status'),
        marketingPreferences: json('marketing_preferences').$type<Record<string, unknown> | null>(),

        linkedInUrl: text('linked_in_url').$type<string | null>().default(null),
        twitterUrl: text('twitter_url').$type<string | null>().default(null),
        githubUrl: text('github_url').$type<string | null>().default(null),
        websiteUrl: text('website_url').$type<string | null>().default(null),

        tags: text('tags').array(),
        customFields: json('custom_fields').$type<Record<string, unknown> | null>(),
    },
    (table) => ({
        typeStatusIdx: index('type_status_idx').on(table.type, table.status),
        scoreIdx: index('score_idx').on(table.score),
    }),
);

// Organizations Table
export const organizations = pgTable(
    'organizations',
    {
        id: text('id')
            .primaryKey()
            .notNull()
            .$defaultFn(() => createId()),
        createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),

        name: text('name').notNull(),
        domain: text('domain'),
        website: text('website'),

        type: text('type'),
        status: text('status'),
        tier: text('tier'),

        industry: text('industry'),
        subIndustry: text('sub_industry'),
        employeeCount: integer('employee_count'),
        revenue: text('revenue'),
        founded: integer('founded'),
        headquarters: text('headquarters'),

        enrichmentStatus: text('enrichment_status'),
        lastEnrichedAt: timestamp('last_enriched_at', { mode: 'date' }),
        enrichmentData: json('enrichment_data').$type<Record<string, unknown> | null>(),

        technologies: json('technologies').$type<Record<string, unknown> | null>(),

        linkedInUrl: text('linked_in_url').$type<string | null>().default(null),
        twitterUrl: text('twitter_url').$type<string | null>().default(null),
        githubUrl: text('github_url').$type<string | null>().default(null),
        websiteUrl: text('website_url').$type<string | null>().default(null),

        score: real('score'),
        engagementLevel: text('engagement_level'),
        lastActivityAt: timestamp('last_activity_at', { mode: 'date' }),
        customFields: json('custom_fields').$type<Record<string, unknown> | null>(),
        tags: text('tags').array(),
    },
    (table) => ({
        domainIdx: index('domain_idx').on(table.domain),
        statusTypeIdx: index('status_type_idx').on(table.status, table.type),
    }),
);

// Organization Members Table
export const organizationMembers = pgTable(
    'organization_members',
    {
        id: text('id')
            .primaryKey()
            .notNull()
            .$defaultFn(() => createId()),
        createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),

        role: text('role'),
        title: text('title'),
        department: text('department'),
        isPrimary: boolean('is_primary').default(false).notNull(),

        status: text('status'),
        type: text('type'),

        isProspect: boolean('is_prospect').default(false).notNull(),
        leadStatus: text('lead_status'),
        leadSource: text('lead_source'),

        startDate: timestamp('start_date', { mode: 'date' }),
        endDate: timestamp('end_date', { mode: 'date' }),

        personId: text('person_id')
            .notNull()
            .references(() => persons.id),
        organizationId: text('organization_id')
            .notNull()
            .references(() => organizations.id),
    },
    (table) => ({
        personOrgIdx: index('org_members_person_org_idx').on(table.personId, table.organizationId),
        personIdx: index('org_members_person_idx').on(table.personId),
        orgIdx: index('org_members_org_idx').on(table.organizationId),
    }),
);

// ClickUp Tasks Table
export const clickupTasks = pgTable(
    'clickup_tasks',
    {
        id: text('id')
            .primaryKey()
            .notNull()
            .$defaultFn(() => createId()),
        clickupId: text('clickup_id').notNull(),
        listId: text('list_id').notNull(),
        name: text('name').notNull(),
        description: text('description'),
        status: text('status').notNull(),
        priority: integer('priority'),
        dueDate: timestamp('due_date', { mode: 'date' }),

        type: text('type').notNull(),
        personId: text('person_id').references(() => persons.id),
        orgId: text('org_id').references(() => organizations.id),
        lastSyncedAt: timestamp('last_synced_at', { mode: 'date' }).notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
        syncStatus: text('sync_status').notNull().default('pending'),
        syncError: json('sync_error').$type<{ message: string; timestamp: Date } | null>(),

        // Task State
        isArchived: boolean('is_archived').default(false).notNull(),
        isClosed: boolean('is_closed').default(false).notNull(),
        closedAt: timestamp('closed_at', { mode: 'date' }),

        assignees: text('assignees').array(), // ClickUp user IDs
        tags: text('tags').array(),
        customFields: json('custom_fields').$type<Record<string, unknown>>(),

        // Tracking
        lastActivityAt: timestamp('last_activity_at', { mode: 'date' }),
        activityCount: integer('activity_count').default(0).notNull(),
    },
    (table) => ({
        typePersonIdx: index('type_person_idx').on(table.type, table.personId),
        typeOrgIdx: index('type_org_idx').on(table.type, table.orgId),
        personIdx: index('person_idx').on(table.personId),
        orgIdx: index('org_idx').on(table.orgId),
    }),
);

// Relations remain the same since they don't depend on ID types
export const sourceRecordsRelations = relations(sourceRecords, ({ one }) => ({
    contact: one(contacts, {
        fields: [sourceRecords.resolvedContactId],
        references: [contacts.id],
        relationName: 'sourceRecord_contact',
    }),
    person: one(persons, {
        fields: [sourceRecords.resolvedPersonId],
        references: [persons.id],
        relationName: 'sourceRecord_person',
    }),
    organization: one(organizations, {
        fields: [sourceRecords.resolvedOrgId],
        references: [organizations.id],
        relationName: 'sourceRecord_organization',
    }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
    person: one(persons, {
        fields: [contacts.personId],
        references: [persons.id],
        relationName: 'contact_person',
    }),
}));

export const personsRelations = relations(persons, ({ many }) => ({
    contacts: many(contacts, { relationName: 'contact_person' }),
    memberships: many(organizationMembers, { relationName: 'person_membership' }),
    sourceRecords: many(sourceRecords, { relationName: 'sourceRecord_person' }),
    clickupTasks: many(clickupTasks, { relationName: 'person_task' }),
}));

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
    members: many(organizationMembers, { relationName: 'org_membership' }),
    sourceRecords: many(sourceRecords, { relationName: 'sourceRecord_organization' }),
    clickupTasks: many(clickupTasks, { relationName: 'org_task' }),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
    person: one(persons, {
        fields: [organizationMembers.personId],
        references: [persons.id],
        relationName: 'person_membership',
    }),
    organization: one(organizations, {
        fields: [organizationMembers.organizationId],
        references: [organizations.id],
        relationName: 'org_membership',
    }),
}));

export const clickupTasksRelations = relations(clickupTasks, ({ one }) => ({
    person: one(persons, {
        fields: [clickupTasks.personId],
        references: [persons.id],
        relationName: 'person_task',
    }),
    organization: one(organizations, {
        fields: [clickupTasks.orgId],
        references: [organizations.id],
        relationName: 'org_task',
    }),
}));
