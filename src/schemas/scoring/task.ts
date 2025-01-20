import { z } from 'zod';
import { genericTrampData } from '../generic/trampdata';

// Input schema
export const scoringInput = z.object({
  sourceRecordId: z.string(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  config: z.object({
    forceRescore: z.boolean().optional().default(false),
  }).optional(),
  trampData: genericTrampData,
});

// Output schema
export const scoringResult = z.object({
  success: z.boolean(),
  data: z.object({
    personScored: z.boolean().optional(),
    personScore: z.number().optional(),
    organizationScored: z.boolean().optional(),
    organizationScore: z.number().optional(),
    scoringData: z.record(z.unknown()).optional(),
  }).optional(),
  error: z.string().optional(),
  trampData: genericTrampData,
});

// Export types
export type ScoringInput = z.infer<typeof scoringInput>;
export type ScoringResult = z.infer<typeof scoringResult>; 