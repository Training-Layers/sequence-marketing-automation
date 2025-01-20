# Trigger.dev Task System

A structured system for building, composing, and orchestrating Trigger.dev tasks with strong typing, consistent patterns, and robust error handling.

## System Architecture

```ascii
src/
├── trigger/                 # Task implementations
│   ├── tasks/              # Individual task definitions
│   │   └── task.shell.ts   # Template for new tasks
│   ├── tracks/             # Task sequences
│   │   └── track.shell.ts  # Template for new tracks
│   └── orchestrators/      # Parallel execution
│       └── orchestrator.shell.ts
├── schemas/                # Zod validation schemas
│   ├── generic/           # Reusable schemas
│   └── task-shell/        # Per-task schemas
├── orchestrator/          # Core system (don't modify)
│   ├── track.ts          # Track execution engine
│   └── orchestrator.ts   # Orchestration engine
└── registry/             # Task registration
    └── tasks.ts          # Auto-generated registry
```

## Core Concepts

### 1. Tasks
- Atomic units of work
- Strong input/output validation using Zod
- Consistent error handling and logging
- Example: Extract audio from video, process an image

```typescript
// Direct task invocation
const result = await client.tasks.trigger("task-id", {
  url: "https://example.com/file",
  tenantId: "tenant123",
  projectId: "project456"
});
```

### 2. Tracks
- Sequential execution of tasks
- Automatic data flow between tasks
- Input/output mapping
- Example: Process video → Extract audio → Generate transcript

```typescript
// Track combines multiple tasks
const mediaTrack: TrackDefinition = {
  name: "MEDIA_TRACK",
  tasks: [
    { taskName: "extract_audio" },
    { taskName: "generate_transcript" }
  ]
};
```

### 3. Orchestrators
- Parallel execution of tracks/tasks
- Complex workflows
- Result aggregation
- Example: Process multiple media files concurrently

```typescript
// Orchestrator runs tracks in parallel
const mediaOrchestrator: OrchestratorDefinition = {
  name: "MEDIA_ORCHESTRATOR",
  tracks: [
    { task: audioTrack },
    { task: videoTrack }
  ]
};
```

## Key Features

### 1. Schema Validation
- Zod schemas for all inputs/outputs
- Reusable generic schemas
- Per-task specific schemas
- See: [Schema Organization Guide](src/schemas/README.md)

### 2. Logging
- Use Trigger.dev logger instead of console
- Structured logging with context
- Optional Supabase logging
- Consistent operation tracking

```typescript
// Correct logging pattern
logger.info("Processing started", {
  task: "task_name",
  jobId: ctx.run.id,
  metadata: { ... }
});

// Don't use console.log
// console.log("Processing started"); ❌
```

### 3. Error Handling
- Custom error classes
- Consistent error structure
- Automatic cleanup
- Error propagation through tracks

### 4. Task Composition

#### Direct Tasks
- Single operation
- Immediate execution
- Good for simple workflows
```typescript
await client.tasks.trigger("task-id", input);
```

#### Track-Based Tasks
- Sequential operations
- Data flow between tasks
- Better for complex pipelines
```typescript
await client.tasks.trigger("track-id", input);
```

#### Orchestrated Tasks
- Parallel execution
- Resource optimization
- Best for batch processing
```typescript
await client.tasks.trigger("orchestrator-id", input);
```

## Getting Started

1. **Create a New Task**
   ```bash
   # 1. Create schema directory
   cp -r src/schemas/task-shell src/schemas/your-task

   # 2. Create task implementation
   cp src/trigger/task.shell.ts src/trigger/your-task.ts
   ```
   See: [Task Creation Guide](src/trigger/README.md)

2. **Create a New Track**
   ```bash
   cp src/trigger/tracks/track.shell.ts src/trigger/tracks/your-track.ts
   ```
   See: [Track Creation Guide](src/trigger/tracks/README.md)

3. **Create a New Orchestrator**
   ```bash
   cp src/trigger/orchestrators/orchestrator.shell.ts src/trigger/orchestrators/your-orchestrator.ts
   ```
   See: [Orchestrator Guide](src/trigger/orchestrators/README.md)

## Best Practices

1. **Schema Organization**
   - Check generic schemas first
   - Create task-specific schemas
   - Use consistent naming
   - See: [Schema Guide](src/schemas/README.md)

2. **Logging**
   - Use structured logging
   - Include context (taskId, jobId)
   - Log operations consistently
   - Use appropriate log levels

3. **Error Handling**
   - Create specific error classes
   - Handle cleanup in errors
   - Preserve trampData
   - Provide clear error messages

4. **Task Design**
   - Keep tasks atomic
   - Use clear input/output contracts
   - Handle resource cleanup
   - Follow naming conventions

## Key Documentation

- [Task Implementation Guide](src/trigger/README.md)
- [Schema Organization](src/schemas/README.md)
- [Track System](src/trigger/tracks/README.md)
- [Orchestration](src/trigger/orchestrators/README.md)

## Common Patterns

### 1. Task Input Structure
```typescript
{
  // Required base fields
  tenantId: string;
  projectId: string;
  userId?: string;
  
  // Task-specific fields
  url: string;
  config?: { ... };
  
  // Optional standard fields
  trampData?: Record<string, unknown>;
  cleanup?: { ... };
}
```

### 2. Task Output Structure
```typescript
{
  job: {
    success: boolean;
    taskName: string;
    runId: string;
    input: { ... };
    error?: string;
  },
  results: { ... },
  metadata: { ... },
  trampData?: Record<string, unknown>;
}
```

### 3. Track Task Sequence
```typescript
tasks: [
  {
    taskName: "first_task",
    // First task gets raw input
  },
  {
    taskName: "second_task",
    // Map previous output to input
    inputMapper: (prevOutput, originalInput) => ({ ... })
  }
]
```

## Development Workflow

1. **Plan Your Task**
   - Define input/output structure
   - Create schemas
   - Plan error handling
   - Design logging strategy

2. **Implement Components**
   - Create schema files
   - Implement task logic
   - Add to registry
   - Write tests

3. **Test and Deploy**
   - Test with various inputs
   - Verify error handling
   - Check logging output
   - Deploy and monitor

## References

- [Trigger.dev Documentation](https://trigger.dev/docs)
- [Zod Documentation](https://github.com/colinhacks/zod)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/) 