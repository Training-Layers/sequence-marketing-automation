import { z } from 'zod';
import { genericTrampData } from '../generic/trampdata';

export const sourceDataInput = z.object({
  // Source Metadata
  source: z.object({
    type: z.enum([
      'lead_form',
      'ad_platform',
      'google_analytics',
      'mixpanel',
      'postgres_import',
      'app_signup',
      'manual_entry',
      'enrichment',
      'api',
    ]),
    provider: z.string().optional(),
    batchId: z.string().optional(),
    externalId: z.string().optional(),
  }),

  // Raw data - accept any structure
  data: z.unknown(),

  trampData: genericTrampData.optional(),
});

export type SourceDataIngestionInput = z.infer<typeof sourceDataInput>; 