Runs - Trigger.dev
Runs
====

Understanding the lifecycle of task run execution in Trigger.dev

In Trigger.dev, the concepts of runs and attempts are fundamental to understanding how tasks are executed and managed. This article explains these concepts in detail and provides insights into the various states a run can go through during its lifecycle.

[​](https://trigger.dev/docs/runs#what-are-runs)

What are runs?
------------------------------------------------------------------

A run is created when you trigger a task (e.g. calling `yourTask.trigger({ foo: "bar" })`). It represents a single instance of a task being executed and contains the following key information:

*   A unique run ID
*   The current status of the run
*   The payload (input data) for the task
*   Lots of other metadata

[​](https://trigger.dev/docs/runs#the-run-lifecycle)

The run lifecycle
-------------------------------------------------------------------------

A run can go through **various** states during its lifecycle. The following diagram illustrates a typical state transition where a single run is triggered and completes successfully:

Runs can also find themselves in lots of other states depending on what’s happening at any given time. The following sections describe all the possible states in more detail.

### 

[​](https://trigger.dev/docs/runs#initial-states)

Initial States

**Waiting for deploy**: If a task is triggered before it has been deployed, the run enters this state and waits for the task to be deployed.

**Delayed**: When a run is triggered with a delay, it enters this state until the specified delay period has passed.

**Queued**: The run is ready to be executed and is waiting in the queue.

### 

[​](https://trigger.dev/docs/runs#execution-states)

Execution States

**Executing**: The task is currently running.

**Reattempting**: The task has failed and is being retried.

**Waiting**: You have used a [triggerAndWait()](https://trigger.dev/docs/triggering#yourtask-triggerandwait), [batchTriggerAndWait()](https://trigger.dev/docs/triggering#yourtask-batchtriggerandwait) or a [wait function](https://trigger.dev/docs/wait). When the wait is complete, the task will resume execution.

### 

[​](https://trigger.dev/docs/runs#final-states)

Final States

**Completed**: The task has successfully finished execution.

**Canceled**: The run was manually canceled by the user.

**Failed**: The task has failed to complete successfully.

**Timed out**: Task has failed because it exceeded its `maxDuration`.

**Crashed**: The worker process crashed during execution (likely due to an Out of Memory error).

**Interrupted**: In development mode, when the CLI is disconnected.

**System failure**: An unrecoverable system error has occurred.

**Expired**: The run’s Time-to-Live (TTL) has passed before it could start executing.

[​](https://trigger.dev/docs/runs#attempts)

Attempts
-------------------------------------------------------

An attempt represents a single execution of a task within a run. A run can have one or more attempts, depending on the task’s retry settings and whether it fails. Each attempt has:

*   A unique attempt ID
*   A status
*   An output (if successful) or an error (if failed)

When a task fails, it will be retried according to its retry settings, creating new attempts until it either succeeds or reaches the retry limit.

[​](https://trigger.dev/docs/runs#run-completion)

Run completion
-------------------------------------------------------------------

A run is considered finished when:

1.  The last attempt succeeds, or
2.  The task has reached its retry limit and all attempts have failed

At this point, the run will have either an output (if successful) or an error (if failed).

[​](https://trigger.dev/docs/runs#advanced-run-features)

Advanced run features
---------------------------------------------------------------------------------

### 

[​](https://trigger.dev/docs/runs#idempotency-keys)

Idempotency Keys

When triggering a task, you can provide an idempotency key to ensure the task is executed only once, even if triggered multiple times. This is useful for preventing duplicate executions in distributed systems.

```ts
await yourTask.trigger({ foo: "bar" }, { idempotencyKey: "unique-key" });
```

*   If a run with the same idempotency key is already in progress, the new trigger will be ignored.
*   If the run has already finished, the previous output or error will be returned.

See our [Idempotency docs](https://trigger.dev/docs/idempotency) for more information.

### 

[​](https://trigger.dev/docs/runs#canceling-runs)

Canceling runs

You can cancel an in-progress run using the API or the dashboard:

```ts
await runs.cancel(runId);
```

When a run is canceled:

– The task execution is stopped

– The run is marked as canceled

– The task will not be retried

– Any in-progress child runs are also canceled

### 

[​](https://trigger.dev/docs/runs#time-to-live-ttl)

Time-to-live (TTL)

You can set a TTL when triggering a run:

```ts
await yourTask.trigger({ foo: "bar" }, { ttl: "10m" });
```

If the run hasn’t started within the specified TTL, it will automatically expire. This is useful for time-sensitive tasks. Note that dev runs automatically have a 10-minute TTL.

### 

[​](https://trigger.dev/docs/runs#delayed-runs)

Delayed runs

You can schedule a run to start after a specified delay:

```ts
await yourTask.trigger({ foo: "bar" }, { delay: "1h" });
```

This is useful for tasks that need to be executed at a specific time in the future.

### 

[​](https://trigger.dev/docs/runs#replaying-runs)

Replaying runs

You can create a new run with the same payload as a previous run:

```ts
await runs.replay(runId);
```

This is useful for re-running a task with the same input, especially for debugging or recovering from failures. The new run will use the latest version of the task.

You can also replay runs from the dashboard using the same or different payload. Learn how to do this [here](https://trigger.dev/docs/replaying).

### 

[​](https://trigger.dev/docs/runs#waiting-for-runs)

Waiting for runs

#### 

[​](https://trigger.dev/docs/runs#triggerandwait)

triggerAndWait()

The `triggerAndWait()` function triggers a task and then lets you wait for the result before continuing. [Learn more about triggerAndWait()](https://trigger.dev/docs/triggering#yourtask-triggerandwait).

#### 

[​](https://trigger.dev/docs/runs#batchtriggerandwait)

batchTriggerAndWait()

Similar to `triggerAndWait()`, the `batchTriggerAndWait()` function lets you batch trigger a task and wait for all the results [Learn more about batchTriggerAndWait()](https://trigger.dev/docs/triggering#yourtask-batchtriggerandwait).

### 

[​](https://trigger.dev/docs/runs#runs-api)

Runs API

#### 

[​](https://trigger.dev/docs/runs#runs-list)

runs.list()

List runs in a specific environment. You can filter the runs by status, created at, task identifier, version, and more:

```ts
import { runs } from "@trigger.dev/sdk/v3";

// Get the first page of runs, returning up to 20 runs
let page = await runs.list({ limit: 20 });

for (const run of page.data) {
  console.log(run);
}

// Keep getting the next page until there are no more runs
while (page.hasNextPage()) {
  page = await page.getNextPage();
  // Do something with the next page of runs
}
```

You can also use an Async Iterator to get all runs:

```ts
import { runs } from "@trigger.dev/sdk/v3";

for await (const run of runs.list({ limit: 20 })) {
  console.log(run);
}
```

You can provide multiple filters to the `list()` function to narrow down the results:

```ts
import { runs } from "@trigger.dev/sdk/v3";

const response = await runs.list({
  status: ["QUEUED", "EXECUTING"], // Filter by status
  taskIdentifier: ["my-task", "my-other-task"], // Filter by task identifier
  from: new Date("2024-04-01T00:00:00Z"), // Filter by created at
  to: new Date(),
  version: "20241127.2", // Filter by deployment version,
  tag: ["tag1", "tag2"], // Filter by tags
  batch: "batch_1234", // Filter by batch ID
  schedule: "sched_1234", // Filter by schedule ID
});
```

#### 

[​](https://trigger.dev/docs/runs#runs-retrieve)

runs.retrieve()

Fetch a single run by it’s ID:

```ts
import { runs } from "@trigger.dev/sdk/v3";

const run = await runs.retrieve(runId);
```

You can provide the type of the task to correctly type the `run.payload` and `run.output`:

```ts
import { runs } from "@trigger.dev/sdk/v3";
import type { myTask } from "./trigger/myTask";

const run = await runs.retrieve<typeof myTask>(runId);

console.log(run.payload.foo); // string
console.log(run.output.bar); // string
```

If you have just triggered a run, you can pass the entire response object to `retrieve()` and the response will already be typed:

```ts
import { runs, tasks } from "@trigger.dev/sdk/v3";
import type { myTask } from "./trigger/myTask";

const response = await tasks.trigger<typeof myTask>({ foo: "bar" });
const run = await runs.retrieve(response);

console.log(run.payload.foo); // string
console.log(run.output.bar); // string
```

#### 

[​](https://trigger.dev/docs/runs#runs-cancel)

runs.cancel()

Cancel a run:

```ts
import { runs } from "@trigger.dev/sdk/v3";

await runs.cancel(runId);
```

#### 

[​](https://trigger.dev/docs/runs#runs-replay)

runs.replay()

Replay a run:

```ts
import { runs } from "@trigger.dev/sdk/v3";

await runs.replay(runId);
```

#### 

[​](https://trigger.dev/docs/runs#runs-reschedule)

runs.reschedule()

Updates a delayed run with a new delay. Only valid when the run is in the DELAYED state.

```ts
import { runs } from "@trigger.dev/sdk/v3";

await runs.reschedule(runId, { delay: "1h" });
```

### 

[​](https://trigger.dev/docs/runs#real-time-updates)

Real-time updates

Subscribe to changes to a specific run in real-time:

```ts
import { runs } from "@trigger.dev/sdk/v3";

for await (const run of runs.subscribeToRun(runId)) {
  console.log(run);
}
```

Similar to `runs.retrieve()`, you can provide the type of the task to correctly type the `run.payload` and `run.output`:

```ts
import { runs } from "@trigger.dev/sdk/v3";
import type { myTask } from "./trigger/myTask";

for await (const run of runs.subscribeToRun<typeof myTask>(runId)) {
  console.log(run.payload.foo); // string
  console.log(run.output?.bar); // string | undefined
}
```

For more on real-time updates, see the [Realtime](https://trigger.dev/docs/realtime) documentation.

### 

[​](https://trigger.dev/docs/runs#triggering-runs-for-undeployed-tasks)

Triggering runs for undeployed tasks

It’s possible to trigger a run for a task that hasn’t been deployed yet. The run will enter the “Waiting for deploy” state until the task is deployed. Once deployed, the run will be queued and executed normally. This feature is particularly useful in CI/CD pipelines where you want to trigger tasks before the deployment is complete.

