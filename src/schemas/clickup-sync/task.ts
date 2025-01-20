import { z } from "zod";

import { genericTrampData } from "../generic/trampdata";

export const clickupSyncOutput = z.object({
    success: z.boolean(),
    data: z.object({
        tasksProcessed: z.number(),
        lastSyncedAt: z.date(),
        nextRuns: z.array(z.date())
    }).optional(),
    error: z.string().optional(),
    trampData: genericTrampData
});

// Schema for scheduled sync
export const clickupSyncInput = z.object({
    forceFullSync: z.boolean().optional().default(false),
    trampData: genericTrampData
});

export type ClickUpSyncOutput = z.infer<typeof clickupSyncOutput>;
export type ClickUpSyncInput = z.infer<typeof clickupSyncInput>;

