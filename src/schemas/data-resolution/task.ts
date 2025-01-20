import { z } from 'zod';
import { genericTrampData } from '../generic/trampdata';

// Input schema matching our Prisma models
export const dataResolutionInput = z.object({
  sourceRecordId: z.string(),
  // We don't need to pass data since it's in the source record
  trampData: genericTrampData,
});

export type DataResolutionInput = z.infer<typeof dataResolutionInput>; 