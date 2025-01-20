import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';

interface TaskData {
  name: string;
  taskFile: string;
  description: string;
  input: {
    required: Record<string, { type: string; description: string }>;
    optional: Record<string, { type: string; description: string; properties: Record<string, { type: string; description: string }> }>;
  };
  output: Record<string, { type: string; description: string; properties: Record<string, { type: string; description: string }> }>;
}

// Helper functions
async function readIgnoreList(): Promise<string[]> {
  try {
    const content = await readFile('src/task-registry/.taskignore', 'utf-8');
    return content.split('\n').filter(line => line.trim() !== '');
  } catch {
    return [];
  }
}

async function appendToIgnoreList(filename: string): Promise<void> {
  await writeFile('src/task-registry/.taskignore', `${filename}\n`, { flag: 'a' });
}

async function promptToIgnore(filename: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`\n❓ Add ${filename} to ignore list? (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function generateRegistry() {
  console.log('🔍 Scanning for task files...');
  const triggerFiles = await readdir('src/trigger');
  const taskFiles = triggerFiles.filter(file => file.endsWith('.ts'));
  console.log(`Found ${taskFiles.length} task files:`, taskFiles);

  // Load ignore list
  const ignoredFiles = await readIgnoreList();
  console.log('Ignored files:', ignoredFiles.length ? ignoredFiles : 'none');

  // Build registry
  const registry: Record<string, TaskData> = {};
  let processedCount = 0;
  
  for (const taskFile of taskFiles) {
    // Skip ignored files
    if (ignoredFiles.includes(taskFile)) {
      console.log(`⏭️  Skipping ignored file: ${taskFile}`);
      continue;
    }

    const taskName = basename(taskFile, '.ts');
    const registryFile = join('src/task-registry', `${taskName}.task.json`);
    
    try {
      console.log(`Processing ${taskName}...`);
      const taskJson = await readFile(registryFile, 'utf-8');
      const taskData = JSON.parse(taskJson) as TaskData;
      registry[taskName] = taskData;
      processedCount++;
      console.log(`✅ Added ${taskName} to registry`);
    } catch (err) {
      if (err instanceof Error) {
        console.warn(`⚠️  Warning: Could not process ${registryFile} - ${err.message}`);
      }
      
      // Prompt to ignore
      const shouldIgnore = await promptToIgnore(taskFile);
      if (shouldIgnore) {
        await appendToIgnoreList(taskFile);
        console.log(`📝 Added ${taskFile} to ignore list`);
      }
    }
  }

  // Write registry file
  console.log('\n📝 Writing registry file...');
  const fileContent = `/**
 * Task Registry
 * 
 * A simple registry of all available tasks in the system.
 * Each entry contains the essential information needed to understand and use the task.
 * 
 * THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
 * Edit the corresponding .task.json files in the task-registry directory instead.
 */

export const tasks = ${JSON.stringify(registry, null, 2)} as const;

export type TaskRegistry = typeof tasks;
export type TaskName = keyof TaskRegistry;
`;

  await writeFile('src/registry/tasks.ts', fileContent);
  console.log('Done!');
  console.log(`\nSummary:`);
  console.log(`- Tasks processed: ${processedCount}`);
  console.log(`- Tasks ignored: ${ignoredFiles.length}`);
  console.log(`- Tasks missing registry: ${taskFiles.length - processedCount - ignoredFiles.length}`);
}

generateRegistry().catch(console.error); 