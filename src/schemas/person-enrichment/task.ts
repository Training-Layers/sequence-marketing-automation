// src/schemas/enrichment/task.ts
import { z } from 'zod';
import { genericTrampData } from '../generic/trampdata';

export const enrichmentInput = z.object({
  sourceRecordId: z.string(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  config: z.object({
    forceReenrichOrganisation: z.boolean().optional().default(false),
    forceReenrichPerson: z.boolean().optional().default(false),
  }),
  trampData: genericTrampData,
});

export const personEnrichmentInput = z.object({
  personId: z.string(),
  forceReenrich: z.boolean().optional().default(false),
  trampData: genericTrampData,
});

export type PersonEnrichmentInput = z.infer<typeof personEnrichmentInput>;
