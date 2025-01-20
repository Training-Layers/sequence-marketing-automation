Concurrency & Queues
====================

Configure what you want to happen when there is more than one run at a time.

Controlling concurrency is useful when you have a task that can’t be run concurrently, or when you want to limit the number of runs to avoid overloading a resource.

[​](https://trigger.dev/docs/queue-concurrency#one-at-a-time)

One at a time
------------------------------------------------------------------------------

This task will only ever have a single run executing at a time. All other runs will be queued until the current run is complete.

/trigger/one-at-a-time.ts

```ts
export const oneAtATime = task({
  id: "one-at-a-time",
  queue: {
    concurrencyLimit: 1,
  },
  run: async (payload) => {
    //...
  },
});
```

[​](https://trigger.dev/docs/queue-concurrency#parallelism)

Parallelism
--------------------------------------------------------------------------

You can execute lots of tasks at once by combining high concurrency with [batch triggering](https://trigger.dev/docs/triggering) (or just triggering in a loop).

/trigger/parallelism.ts

```ts
export const parallelism = task({
  id: "parallelism",
  queue: {
    concurrencyLimit: 100,
  },
  run: async (payload) => {
    //...
  },
});
```

Be careful with high concurrency. If you’re doing API requests you might hit rate limits. If you’re hitting your database you might overload it.

Your organization has a maximum concurrency limit which depends on your plan. If you’re a paying customer you can request a higher limit by [contacting us](https://www.trigger.dev/contact).

[​](https://trigger.dev/docs/queue-concurrency#defining-a-queue)

Defining a queue
------------------------------------------------------------------------------------

As well as putting queue settings directly on a task, you can define a queue and reuse it across multiple tasks. This allows you to share the same concurrency limit:

/trigger/queue.ts

```ts
const myQueue = queue({
  name: "my-queue",
  concurrencyLimit: 1,
});

export const task1 = task({
  id: "task-1",
  queue: {
    name: "my-queue",
  },
  run: async (payload: { message: string }) => {
    // ...
  },
});

export const task2 = task({
  id: "task-2",
  queue: {
    name: "my-queue",
  },
  run: async (payload: { message: string }) => {
    // ...
  },
});
```

[​](https://trigger.dev/docs/queue-concurrency#setting-the-concurrency-when-you-trigger-a-run)

Setting the concurrency when you trigger a run
------------------------------------------------------------------------------------------------------------------------------------------------

When you trigger a task you can override the concurrency limit. This is really useful if you sometimes have high priority runs.

The task:

/trigger/override-concurrency.ts

```ts
const generatePullRequest = task({
  id: "generate-pull-request",
  queue: {
    //normally when triggering this task it will be limited to 1 run at a time
    concurrencyLimit: 1,
  },
  run: async (payload) => {
    //todo generate a PR using OpenAI
  },
});
```

Triggering from your backend and overriding the concurrency:

app/api/push/route.ts

```ts
import { generatePullRequest } from "~/trigger/override-concurrency";

export async function POST(request: Request) {
  const data = await request.json();

  if (data.branch === "main") {
    //trigger the task, with a different queue
    const handle = await generatePullRequest.trigger(data, {
      queue: {
        //the "main-branch" queue will have a concurrency limit of 10
        //this triggered run will use that queue
        name: "main-branch",
        concurrencyLimit: 10,
      },
    });

    return Response.json(handle);
  } else {
    //triggered with the default (concurrency of 1)
    const handle = await generatePullRequest.trigger(data);
    return Response.json(handle);
  }
}
```

[​](https://trigger.dev/docs/queue-concurrency#concurrency-keys-and-per-tenant-queuing)

Concurrency keys and per-tenant queuing
----------------------------------------------------------------------------------------------------------------------------------

If you’re building an application where you want to run tasks for your users, you might want a separate queue for each of your users. (It doesn’t have to be users, it can be any entity you want to separately limit the concurrency for.)

You can do this by using `concurrencyKey`. It creates a separate queue for each value of the key.

Your backend code:

app/api/pr/route.ts

```ts
import { generatePullRequest } from "~/trigger/override-concurrency";

export async function POST(request: Request) {
  const data = await request.json();

  if (data.isFreeUser) {
    //free users can only have 1 PR generated at a time
    const handle = await generatePullRequest.trigger(data, {
      queue: {
        //every free user gets a queue with a concurrency limit of 1
        name: "free-users",
        concurrencyLimit: 1,
      },
      concurrencyKey: data.userId,
    });

    //return a success response with the handle
    return Response.json(handle);
  } else {
    //trigger the task, with a different queue
    const handle = await generatePullRequest.trigger(data, {
      queue: {
        //every paid user gets a queue with a concurrency limit of 10
        name: "paid-users",
        concurrencyLimit: 10,
      },
      concurrencyKey: data.userId,
    });

    //return a success response with the handle
    return Response.json(handle);
  }
}
```