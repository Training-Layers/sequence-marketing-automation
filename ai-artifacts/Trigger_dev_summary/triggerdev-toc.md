# Trigger.dev Documentation Summary (Detailed)

This document provides a more detailed overview of each documentation file, enabling users to quickly identify the relevant information they need. Each summary includes a link to the full file for detailed reading. These files cover various aspects of Trigger.dev, from task definitions and triggering, to configurations and logging.

## File Summaries (Detailed):

1.  **[overview.md](overview.md)**:
    *   **Purpose:** This file serves as a foundational guide to understanding and using Tasks in Trigger.dev, which are resilient functions designed to run for extended durations.
    *   **Key Concepts:**
        *   **Task Definition:** The document explains how to define a task using the `task` function, emphasizing the need for unique IDs, and the structure of the `run` function which is the main body of the task which takes in a payload and ctx.
        *   **Task Triggering:** It illustrates two ways of triggering tasks: from the dashboard (using the "Test" feature) and via backend code using the `trigger` method.
        *   **Subtasks:** Mentions the need to export subtasks if they are nested in the same file.
        *   **Configuration Options:**
            *   `id`: Required and unique identifier for the task.
            *   `run`: An async function that executes the task's logic, accepting a payload and context.
            *   `retry`: Settings for retrying failed tasks, including `maxAttempts`, `factor`, `minTimeoutInMs`, `maxTimeoutInMs`, and `randomize`.
            *   `queue`: Options for controlling task concurrency using `concurrencyLimit`, allowing one-at-a-time or parallel executions, with advanced techniques.
            *   `machine`: Resource specifications, defining vCPUs and RAM using presets like "large-1x".
            *   `maxDuration`: Prevents tasks from running beyond the specified time.
        *   **Lifecycle Functions:**
            *   `init`: Called before each run attempt.
            *   `cleanup`: Executes after the `run` function, irrespective of success or failure.
            *   `middleware`: Wraps the `run` function, called before it to intercept execution.
            *   `onStart`: Triggered when a task run starts (once per run, not retry).
            *   `onSuccess`: Called upon successful task completion.
            *   `onFailure`: Triggered after all retries are exhausted, and the run has failed.
            *   `handleError`: Allows custom error handling and control over retries.
        *   **Triggering Tasks:** Shows an example of how to trigger tasks from backend code, and how to wait for the result.
        *   **Subtasks:** Mentions that subtasks should be exported so they can be registered.

2.  **[metadata.md](metadata.md)**:
    *   **Purpose:** This file explains how to use metadata to attach and update additional, structured information to a run, facilitating better tracking and management.
    *   **Key Concepts:**
        *   **Adding Metadata:** How to pass metadata as an object when using the `trigger` function.
        *   **Accessing Metadata:** Using `metadata.get()`, `metadata.current()` to access the full metadata object or specific keys within the run.
        *   **Scope:** Highlights that `metadata` methods work only inside the `run` function, and any called methods.
        *   **Updating Metadata:**
            *   `set`: Updates or sets a key-value pair in the metadata.
            *   `del`: Removes a key from the metadata.
            *   `replace`: Replaces the entire metadata object with a new object.
            *   `append`: Appends a value to an array in the metadata object.
            *   `remove`: Removes a value from an array in the metadata object.
            *   `increment`: Increases a numeric value in the metadata.
            *   `decrement`: Decreases a numeric value in the metadata.
            *   `stream`: Captures a stream of values to use with Realtime.
            *   `flush`: Persists metadata to the database immediately.
        *   **Type Safety:** Recommends using a validator like Zod for type safety, and also talks about automatic json serialization.
        *   **Inspecting Metadata:** How to view the metadata using the Trigger.dev dashboard, and the `runs.retrieve()` SDK method.
        *   **Size Limit:** Highlights the 4KB size limit of the metadata, with the option to increase this limit on self-hosted instances.
        *   **Metadata Propagation:** Metadata is NOT propagated to child tasks, it needs to be explicitly passed.

3.  **[config.md](config.md)**:
    *   **Purpose:** This document details the `trigger.config.ts` file and its various configuration options for a Trigger.dev project, including build configurations and global task lifecycle functions.
    *   **Key Concepts:**
        *   **Project Setup:** Describes how to set up the `project` identifier, and `dirs` to specify the trigger directories.
        *   **Lifecycle Hooks:** Explains adding global lifecycle hooks like `onSuccess`, `onFailure`, `onStart` and `init`.
        *   **Instrumentations:** Covers adding OpenTelemetry instrumentations for logging (e.g. Prisma, HTTP, OpenAI) for automatic tracing.
        *   **Runtime Options:** Supports specifying the Node.js or Bun runtime.
        *   **Default Configurations:** Setting a default machine and log level and max duration for all tasks.
        *   **Build Customizations:** Includes sections on externalizing packages, JSX configuration, conditions, and build extensions.
        *   **Build Extensions:**
            *   `additionalFiles`: Copies files to the build directory.
            *   `additionalPackages`: Adds extra packages to the build.
            *   `emitDecoratorMetadata`: Enables support for emitDecoratorMetadata in Typescript.
            *   `prismaExtension`: Manages Prisma setup, client generation, and migrations during deploy.
            *   `syncEnvVars`: Syncs environment variables for deployments.
            *   `syncVercelEnvVars`: Syncs environment variables from Vercel.
            *   `audioWaveform`: Installs the audio waveform utility.
            *   `puppeteer`: Setup for using Puppeteer for web scraping, this requires setting environment variable.
            *   `ffmpeg`: Installs the ffmpeg library.
            *   `esbuildPlugin`: Allows adding custom esbuild plugins.
             *   `aptGet`: Allows installing system packages.
        *  **Custom Extensions:** Explains how to create custom build extensions with lifecycle hooks.
         *  **Stripping out Build Config:** Points out that the build config is automatically removed from the bundle so imports within that config are tree shaken out.

4.  **[triggering.md](triggering.md)**:
    *   **Purpose:** This document explains the different methods and options for triggering tasks in Trigger.dev, from backend code or from within other tasks, and how to configure options when triggering.
    *   **Key Concepts:**
        *   **Triggering Functions (Backend):**
            *   `tasks.trigger()`: Triggers a single task run, accepts the task type as a generic argument, with optional options.
            *   `tasks.batchTrigger()`: Triggers multiple runs of a single task using multiple payloads, supports batch options.
            *   `tasks.triggerAndPoll()`: Triggers and polls a task until its completion (not recommended for web requests), this is useful if you just want the end result and dont need streaming.
            *    `batch.trigger()`: Triggers multiple runs of different tasks at once
        *   **Triggering Functions (Within Tasks):**
            *   `yourTask.trigger()`: Triggers a single task and returns a handle to monitor the task.
            *   `yourTask.batchTrigger()`: Triggers a task multiple times and provides a handle.
            *   `yourTask.triggerAndWait()`: Triggers and waits for a task's result. Includes error handling, and the `unwrap()` method.
            *   `yourTask.batchTriggerAndWait()`: Batch triggers a task and waits for results.
             *   `batch.triggerAndWait()`: Batch triggers multiple tasks and waits for results.
              *   `batch.triggerByTask()`: Batch triggers multiple tasks using the task instances.
              *  `batch.triggerByTaskAndWait()`: Batch triggers multiple tasks by instances and waits for results.
        *  **Triggering from frontend:** Provides a high level overview, linking to the react hooks documentation.
        *   **Triggering Options:**
            *   `delay`: Schedules the task to run at a later time.
            *   `ttl`: Sets a time-to-live for runs to ensure they don't run if they haven't started within that time.
            *   `idempotencyKey`: Ensures a task is only triggered once with the same key to help prevent duplicate task executions.
             *   `idempotencyKeyTTL`: Set a custom ttl for idempotency keys.
            *   `queue`: Overrides queue settings for high-priority runs.
            *   `concurrencyKey`: Creates separate queues per user or entity, with concurrency limits.
            *   `maxAttempts`: Set a max number of attempts that a run will try before failing.
            *   `tags`: Tag the runs.
             *  `metadata`: Pass metadata to the run.
             *  `maxDuration`: Set the max duration of the run.
        *   **Large Payloads:** Handles payloads over 512KB by storing them in an S3-compatible object store and limiting the maximum payload size.
        *  **Batch Triggering:**  The total size of all batch payloads cannot exceed 1MB, and the max batch size is 500 runs.

5.  **[logging.md](logging.md)**:
    *   **Purpose:** Describes how to effectively use logging and tracing within Trigger.dev tasks for better debugging and monitoring.
    *   **Key Concepts:**
        *   **Console Logging:** Regular `console.log()`, `console.error()`, etc are supported.
        *   **Structured Logging:** Using the `logger` object to create structured logs, with methods like `logger.debug()`, `logger.log()`, `logger.info()`, `logger.warn()`, and `logger.error()`.
        *   **Tracing:** It explains tracing using OpenTelemetry, which automatically tracks key activities, and includes setting up instrumentations.
         *   **Custom Traces:** You can create custom traces using `logger.trace()`, which has a code block which is wrapped in a trace.

6.  **[wait.md](wait.md)**:
     *  **Purpose:** Describes how to pause task execution within Trigger.dev, enabling developers to build complex workflows without continuous resource consumption.
     * **Key Concepts:**
        * **`wait.for()`**: This method allows pausing execution for a specific period using a variety of time units such as seconds, minutes, hours, days, weeks, months, and years.
        * **`wait.until()`**: This method pauses execution until the specified date, and allows setting a `throwIfInThePast` option to throw an error if the date is in the past when calling the function.
       * **Automatic Pausing**: The Trigger.dev Cloud pauses task execution automatically when waiting for an extended time to avoid unnecessary costs.

7.  **[queue-concurrency.md](queue-concurrency.md)**:
    *   **Purpose:** This document focuses on how to configure concurrency and queues within Trigger.dev to manage the execution of tasks effectively and avoid overloading resources.
    *   **Key Concepts:**
        *   **One-at-a-time Execution:** Limiting a task to only one concurrent run using `concurrencyLimit: 1`.
        *   **Parallel Execution:** Configuring tasks for parallel execution by setting a higher `concurrencyLimit`.
        *   **Queue Definitions:** Defining reusable queues using the `queue` function, and setting the concurrency limit.
        *  **Overriding Concurrency:** Overriding concurrency limits when triggering a task to handle high-priority runs with the `queue` property when triggering a run.
        *   **Concurrency Keys:** Creating separate queues per user or entity using the `concurrencyKey` option, ideal for per-tenant queuing.

8.  **[runs.md](runs.md)**:
    *  **Purpose**: Provides a detailed understanding of task runs in Trigger.dev, including lifecycle, various states, attempts, and advanced features.
    *   **Key Concepts**:
         *  **Runs:** Describes that a run is created when a task is triggered, and has a unique id and status.
         *  **Run lifecycle**: Describes the various states of the run, which are "Waiting for deploy", "Delayed", "Queued", "Executing", "Reattempting", "Waiting", "Completed", "Canceled", "Failed", "Timed out", "Crashed", "Interrupted", "System failure", and "Expired".
         *   **Attempts:** Each run can have multiple attempts due to retry configurations.
         *  **Run completion**: A run is considered finished when it has succeeded or exhausted all of its retries, with a result (output) or an error.
         *   **Advanced Features**:
                *   **Idempotency Keys:** Used to ensure a task is executed only once even when triggered multiple times.
                *   **Canceling Runs:** Manually cancel a run using the dashboard or API.
                *   **Time-to-Live (TTL):** Setting a time limit for how long a run can be pending before it's expired.
                *  **Delayed Runs:** Scheduling a run to start at a later time.
                *   **Replaying Runs:** Create a new run with the same payload as a previous run.
                *   **Waiting for runs:** Use `triggerAndWait()` and `batchTriggerAndWait()` in tasks.
         *   **Runs API**:
                 *   `runs.list()`: Get a list of runs, using various filters, including Async Iterators.
                 *    `runs.retrieve()`: Get details about a single run using it's id, with type safety when passing the generic type parameter or passing the response of `task.trigger()`.
                 *    `runs.cancel()`: Cancel an ongoing run.
                 *    `runs.replay()`: Replay a previously executed run.
                 *  `runs.reschedule()`: Update the delay of a delayed run.
         * **Real-time updates**: Use `runs.subscribeToRun` to get real time updates of a run.
        * **Triggering runs for undeployed tasks**: Tasks that are triggered before being deployed go into the "Waiting for deploy" state.