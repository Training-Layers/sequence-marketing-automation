// src/trigger/clickup_create_task.ts
import { task } from '@trigger.dev/sdk/v3';
import { db } from '../../database';
import { clickupTasks } from '../../database/schema';
import { z } from 'zod';

import { clickupTaskInput } from '../../schemas/create-clickup-task/task';
import { clickupClient } from '../../services/clickup';

export const clickupCreateTask = task({
  id: 'clickup_create_task',
  run: async (payload: z.infer<typeof clickupTaskInput>) => {
    try {
      // Create task in ClickUp
      const clickupTask = await clickupClient.createTask(payload);
      
      // Store task in database
      const [createdTask] = await db
        .insert(clickupTasks)
        .values({
          name: clickupTask.name || '',
          description: clickupTask.description,
          clickupId: clickupTask.id,
          listId: clickupTask.list.id,
          status: clickupTask.status.status,
          type: payload.type,
          lastSyncedAt: new Date(),
          syncStatus: 'synced',
          personId: payload.personId || null,
          orgId: payload.organizationId || null,
        })
        .returning();

      return {
        success: true,
        data: {
          taskId: createdTask.id,
          clickupId: createdTask.clickupId,
        },
      };
    } catch (error) {
      console.error('Failed to create ClickUp task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});