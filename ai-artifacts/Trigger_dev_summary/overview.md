Tasks: Overview
===============

Tasks are functions that can run for a long time and provide strong resilience to failure.

There are different types of tasks including regular tasks and [scheduled tasks](https://trigger.dev/docs/tasks/scheduled).

[​](https://trigger.dev/docs/tasks/overview#hello-world-task-and-how-to-trigger-it)

Hello world task and how to trigger it
-----------------------------------------------------------------------------------------------------------------------------

Here’s an incredibly simple task:

/trigger/hello-world.ts

```ts
import { task } from "@trigger.dev/sdk/v3";

//1. You need to export each task, even if it's a subtask
export const helloWorld = task({
  //2. Use a unique id for each task
  id: "hello-world",
  //3. The run function is the main function of the task
  run: async (payload: { message: string }) => {
    //4. You can write code that runs for a long time here, there are no timeouts
    console.log(payload.message);
  },
});
```

You must `export` each task, even subtasks inside the same file. When exported they are accessible so their configuration can be registered with the platform.

You can trigger this in two ways:

1.  From the dashboard [using the “Test” feature](https://trigger.dev/docs/run-tests).
2.  Trigger it from your backend code. See the [full triggering guide here](https://trigger.dev/docs/triggering).

Here’s how to trigger a single run from elsewhere in your code:

Your backend code

```ts
import { helloWorld } from "./trigger/hello-world";

async function triggerHelloWorld() {
  //This triggers the task and returns a handle
  const handle = await helloWorld.trigger({ message: "Hello world!" });

  //You can use the handle to check the status of the task, cancel and retry it.
  console.log("Task is running with handle", handle.id);
}
```

You can also [trigger a task from another task](https://trigger.dev/docs/triggering), and wait for the result.

[​](https://trigger.dev/docs/tasks/overview#defining-a-task)

Defining a `task`
---------------------------------------------------------------------------------

The task function takes an object with the following fields.

### 

[​](https://trigger.dev/docs/tasks/overview#the-id-field)

The `id` field

This is used to identify your task so it can be triggered, managed, and you can view runs in the dashboard. This must be unique in your project – we recommend making it descriptive and unique.

### 

[​](https://trigger.dev/docs/tasks/overview#the-run-function)

The `run` function

Your custom code inside `run()` will be executed when your task is triggered. It’s an async function that has two arguments:

1.  The run payload - the data that you pass to the task when you trigger it.
2.  An object with `ctx` about the run (Context), and any output from the optional `init` function that runs before every run attempt.

Anything you return from the `run` function will be the result of the task. Data you return must be JSON serializable: strings, numbers, booleans, arrays, objects, and null.

### 

[​](https://trigger.dev/docs/tasks/overview#retry-options)

`retry` options

A task is retried if an error is thrown, by default we retry 3 times.

You can set the number of retries and the delay between retries in the `retry` field:

/trigger/retry.ts

```ts
export const taskWithRetries = task({
  id: "task-with-retries",
  retry: {
    maxAttempts: 10,
    factor: 1.8,
    minTimeoutInMs: 500,
    maxTimeoutInMs: 30_000,
    randomize: false,
  },
  run: async (payload: any, { ctx }) => {
    //...
  },
});
```

For more information read [the retrying guide](https://trigger.dev/docs/errors-retrying).

It’s also worth mentioning that you can [retry a block of code](https://trigger.dev/docs/errors-retrying) inside your tasks as well.

### 

[​](https://trigger.dev/docs/tasks/overview#queue-options)

`queue` options

Queues allow you to control the concurrency of your tasks. This allows you to have one-at-a-time execution and parallel executions. There are also more advanced techniques like having different concurrencies for different sets of your users. For more information read [the concurrency & queues guide](https://trigger.dev/docs/queue-concurrency).

/trigger/one-at-a-time.ts

```ts
export const oneAtATime = task({
  id: "one-at-a-time",
  queue: {
    concurrencyLimit: 1,
  },
  run: async (payload: any, { ctx }) => {
    //...
  },
});
```

### 

[​](https://trigger.dev/docs/tasks/overview#machine-options)

`machine` options

Some tasks require more vCPUs or GBs of RAM. You can specify these requirements in the `machine` field. For more information read [the machines guide](https://trigger.dev/docs/machines).

/trigger/heavy-task.ts

```ts
export const heavyTask = task({
  id: "heavy-task",
  machine: {
    preset: "large-1x", // 4 vCPU, 8 GB RAM
  },
  run: async (payload: any, { ctx }) => {
    //...
  },
});
```

### 

[​](https://trigger.dev/docs/tasks/overview#maxduration-option)

`maxDuration` option

By default tasks can execute indefinitely, which can be great! But you also might want to set a `maxDuration` to prevent a task from running too long. You can set the `maxDuration` on a task, and all runs of that task will be stopped if they exceed the duration.

/trigger/long-task.ts

```ts
export const longTask = task({
  id: "long-task",
  maxDuration: 300, // 300 seconds or 5 minutes
  run: async (payload: any, { ctx }) => {
    //...
  },
});
```

See our [maxDuration guide](https://trigger.dev/docs/runs/max-duration) for more information.

[​](https://trigger.dev/docs/tasks/overview#lifecycle-functions)

Lifecycle functions
---------------------------------------------------------------------------------------

### 

[​](https://trigger.dev/docs/tasks/overview#init-function)

`init` function

This function is called before a run attempt:

/trigger/init.ts

```ts
export const taskWithInit = task({
  id: "task-with-init",
  init: async (payload, { ctx }) => {
    //...
  },
  run: async (payload: any, { ctx }) => {
    //...
  },
});
```

You can also return data from the `init` function that will be available in the params of the `run`, `cleanup`, `onSuccess`, and `onFailure` functions.

/trigger/init-return.ts

```ts
export const taskWithInitReturn = task({
  id: "task-with-init-return",
  init: async (payload, { ctx }) => {
    return { someData: "someValue" };
  },
  run: async (payload: any, { ctx, init }) => {
    console.log(init.someData); // "someValue"
  },
});
```

Errors thrown in the `init` function are ignored.

### 

[​](https://trigger.dev/docs/tasks/overview#cleanup-function)

`cleanup` function

This function is called after the `run` function is executed, regardless of whether the run was successful or not. It’s useful for cleaning up resources, logging, or other side effects.

/trigger/cleanup.ts

```ts
export const taskWithCleanup = task({
  id: "task-with-cleanup",
  cleanup: async (payload, { ctx }) => {
    //...
  },
  run: async (payload: any, { ctx }) => {
    //...
  },
});
```

Errors thrown in the `cleanup` function will fail the attempt.

### 

[​](https://trigger.dev/docs/tasks/overview#middleware-function)

`middleware` function

This function is called before the `run` function, it allows you to wrap the run function with custom code.

An error thrown in `middleware` is just like an uncaught error in the run function: it will propagate through to `handleError()` and then will fail the attempt (causing a retry).

### 

[​](https://trigger.dev/docs/tasks/overview#onstart-function)

`onStart` function

When a task run starts, the `onStart` function is called. It’s useful for sending notifications, logging, and other side effects. This function will only be called one per run (not per retry). If you want to run code before each retry, use the `init` function.

/trigger/on-start.ts

```ts
export const taskWithOnStart = task({
  id: "task-with-on-start",
  onStart: async (payload, { ctx }) => {
    //...
  },
  run: async (payload: any, { ctx }) => {
    //...
  },
});
```

You can also define an `onStart` function in your `trigger.config.ts` file to get notified when any task starts.

trigger.config.ts

```ts
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_1234",
  onStart: async (payload, { ctx }) => {
    console.log("Task started", ctx.task.id);
  },
});
```

Errors thrown in the `onStart` function are ignored.

### 

[​](https://trigger.dev/docs/tasks/overview#onsuccess-function)

`onSuccess` function

When a task run succeeds, the `onSuccess` function is called. It’s useful for sending notifications, logging, syncing state to your database, or other side effects.

/trigger/on-success.ts

```ts
export const taskWithOnSuccess = task({
  id: "task-with-on-success",
  onSuccess: async (payload, output, { ctx }) => {
    //...
  },
  run: async (payload: any, { ctx }) => {
    //...
  },
});
```

You can also define an `onSuccess` function in your `trigger.config.ts` file to get notified when any task succeeds.

trigger.config.ts

```ts
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_1234",
  onSuccess: async (payload, output, { ctx }) => {
    console.log("Task succeeded", ctx.task.id);
  },
});
```

Errors thrown in the `onSuccess` function are ignored.

### 

[​](https://trigger.dev/docs/tasks/overview#onfailure-function)

`onFailure` function

When a task run fails, the `onFailure` function is called. It’s useful for sending notifications, logging, or other side effects. It will only be executed once the task run has exhausted all its retries.

/trigger/on-failure.ts

```ts
export const taskWithOnFailure = task({
  id: "task-with-on-failure",
  onFailure: async (payload, error, { ctx }) => {
    //...
  },
  run: async (payload: any, { ctx }) => {
    //...
  },
});
```

You can also define an `onFailure` function in your `trigger.config.ts` file to get notified when any task fails.

trigger.config.ts

```ts
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_1234",
  onFailure: async (payload, error, { ctx }) => {
    console.log("Task failed", ctx.task.id);
  },
});
```

Errors thrown in the `onFailure` function are ignored.

### 

[​](https://trigger.dev/docs/tasks/overview#handleerror-functions)

`handleError` functions

You can define a function that will be called when an error is thrown in the `run` function, that allows you to control how the error is handled and whether the task should be retried.

Read more about `handleError` in our [Errors and Retrying guide](https://trigger.dev/docs/errors-retrying).

Uncaught errors will throw a special internal error of the type `HANDLE_ERROR_ERROR`.

