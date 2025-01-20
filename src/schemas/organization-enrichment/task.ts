import { z } from "zod";

import { genericTrampData } from "../generic/trampdata";

export const organizationEnrichmentInput = z.object({
    organizationId: z.string(),
    forceReenrich: z.boolean().optional().default(false),
    trampData: genericTrampData,
  });

  export type OrganizationEnrichmentInput = z.infer<typeof organizationEnrichmentInput>;