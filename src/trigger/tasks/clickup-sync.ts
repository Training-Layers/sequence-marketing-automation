// src/trigger/clickup_sync_scheduled.ts
import { schedules } from "@trigger.dev/sdk/v3";
import { db } from '../../database';
import { clickupTasks } from '../../database/schema';
import { eq, and, gt, desc } from 'drizzle-orm';
import { z } from 'zod';
import { clickupClient } from "../../services/clickup";

// Helper to fetch tasks from ClickUp API
async function fetchClickUpTasks() {
  // TODO: Replace with your ClickUp API client
  const clickup = clickupClient;
  
  // Get tasks updated since last sync
  const tasks = await clickup.getTasks();
  
  return tasks;
}

export const clickupSyncScheduled = schedules.task({
  id: "clickup-sync-scheduled",
  // Run every day at 1 AM in UTC
  cron: {
    pattern: "0 1 * * *",
    timezone: "UTC"
  },
  run: async (payload) => {
    try {
      console.log(`Starting ClickUp sync at ${payload.timestamp}`);
      console.log(`Next 5 runs: ${payload.upcoming.map(d => d.toISOString()).join(', ')}`);

      // Get last sync time if not first run
      let lastSyncedAt: Date | undefined;
      if (payload.lastTimestamp) {
        lastSyncedAt = payload.lastTimestamp;
      } else {
        const lastSyncedTask = await db
          .select({ lastSyncedAt: clickupTasks.lastSyncedAt })
          .from(clickupTasks)
          .orderBy((fields) => desc(fields.lastSyncedAt))
          .limit(1);
        
        lastSyncedAt = lastSyncedTask[0]?.lastSyncedAt;
      }

      // Fetch updated tasks from ClickUp
      const clickupTasksList = await fetchClickUpTasks();
      
      // Process tasks in batches
      const results = await db.transaction(async (tx) => {
        const updates = [];
        
        for (const task of clickupTasksList.tasks) {
          // Check if task exists
          const [existingTask] = await tx
            .select()
            .from(clickupTasks)
            .where(eq(clickupTasks.clickupId, task.id))
            .limit(1);
          
          if (existingTask) {
            // Update existing task
            updates.push(
              tx
                .update(clickupTasks)
                .set({
                  name: task.name,
                  description: task.description,
                  status: task.status.status,
                  priority: task.priority?.orderindex ? parseInt(task.priority.orderindex) : null,
                  dueDate: task.due_date ? new Date(task.due_date) : null,
                  assignees: task.assignees.map(assignee => assignee.username),
                  tags: task.tags.map(tag => tag.name),
                  customFields: task.custom_fields as unknown as Record<string, any>,
                  lastSyncedAt: payload.timestamp,
                  syncStatus: 'synced',
                  isClosed: !!task.date_closed,
                  closedAt: task.date_closed ? new Date(task.date_closed) : null,
                  updatedAt: payload.timestamp,
                })
                .where(eq(clickupTasks.clickupId, task.id))
            );
          }
        }
        
        // Execute all updates
        await Promise.all(updates);
        
        return {
          tasksProcessed: updates.length,
          lastSyncedAt: payload.timestamp,
          timezone: payload.timezone,
          scheduleId: payload.scheduleId
        };
      });

      return {
        success: true,
        data: {
          ...results,
          nextRuns: payload.upcoming
        }
      };
    } catch (error) {
      console.error('ClickUp sync failed:', error);
      
      // Log error with schedule context
      console.error('Schedule context:', {
        scheduleId: payload.scheduleId,
        timestamp: payload.timestamp,
        timezone: payload.timezone
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
});