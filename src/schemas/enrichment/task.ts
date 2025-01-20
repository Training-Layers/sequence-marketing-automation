import { z } from "zod";

import { genericTrampData } from "../generic/trampdata";

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

export type EnrichmentInput = z.infer<typeof enrichmentInput>;