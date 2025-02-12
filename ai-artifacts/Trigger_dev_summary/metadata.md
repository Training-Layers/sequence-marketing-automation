Run metadata - Trigger.dev

Writing tasks

Run metadata
============

Attach a small amount of data to a run and update it as the run progresses.

You can attach up to 4KB (4,096 bytes) of metadata to a run, which you can then access from inside the run function, via the API, and in the dashboard. You can use metadata to store additional, structured information on a run. For example, you could store your user’s full name and corresponding unique identifier from your system on every task that is associated with that user.

[​](https://trigger.dev/docs/runs/metadata#usage)

Usage
----------------------------------------------------------

Add metadata to a run by passing it as an object to the `trigger` function:

```ts
const handle = await myTask.trigger(
  { message: "hello world" },
  { metadata: { user: { name: "Eric", id: "user_1234" } } }
);


You can get the current metadata at any time by calling metadata.get() or metadata.current() (only inside a run):

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    // Get the whole metadata object
    const currentMetadata = metadata.current();
    console.log(currentMetadata);

    // Get a specific key
    const user = metadata.get("user");
    console.log(user.name); // "Eric"
  },
});


Any of these methods can be called anywhere “inside” the run function, or a function called from the run function:

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    doSomeWork();
  },
});

async function doSomeWork() {
  metadata.set("progress", 0.5);
}


If you call any of the metadata methods outside of the run function, they will have no effect:

import { metadata } from "@trigger.dev/sdk/v3";

// Somewhere outside of the run function
function doSomeWork() {
  metadata.set("progress", 0.5); // This will do nothing
}


This means it’s safe to call these methods anywhere in your code, and they will only have an effect when called inside the run function.

Calling metadata.current() or metadata.get() outside of the run function will always return undefined.

These methods also work inside any task lifecycle hook, either attached to the specific task or the global hooks defined in your trigger.config.ts file.

​

Updates API

One of the more powerful features of metadata is the ability to update it as the run progresses. This is useful for tracking the progress of a run, storing intermediate results, or storing any other information that changes over time. (Combining metadata with Realtime can give you a live view of the progress of your runs.)

All metadata update methods (accept for flush and stream) are synchronous and will not block the run function. We periodically flush metadata to the database in the background, so you can safely update the metadata inside a run as often as you need to, without worrying about impacting the run’s performance.

​

set

Set the value of a key in the metadata object:

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    // Do some work
    metadata.set("progress", 0.1);

    // Do some more work
    metadata.set("progress", 0.5);

    // Do even more work
    metadata.set("progress", 1.0);
  },
});


​

del

Delete a key from the metadata object:

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    // Do some work
    metadata.set("progress", 0.1);

    // Do some more work
    metadata.set("progress", 0.5);

    // Remove the progress key
    metadata.del("progress");
  },
});


​

replace

Replace the entire metadata object with a new object:

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    // Do some work
    metadata.set("progress", 0.1);

    // Replace the metadata object
    metadata.replace({ user: { name: "Eric", id: "user_1234" } });
  },
});


​

append

Append a value to an array in the metadata object:

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    // Do some work
    metadata.set("progress", 0.1);

    // Append a value to an array
    metadata.append("logs", "Step 1 complete");

    console.log(metadata.get("logs")); // ["Step 1 complete"]
  },
});


​

remove

Remove a value from an array in the metadata object:

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    // Do some work
    metadata.set("progress", 0.1);

    // Append a value to an array
    metadata.append("logs", "Step 1 complete");

    // Remove a value from the array
    metadata.remove("logs", "Step 1 complete");

    console.log(metadata.get("logs")); // []
  },
});


​

increment

Increment a numeric value in the metadata object:

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    // Do some work
    metadata.set("progress", 0.1);

    // Increment a value
    metadata.increment("progress", 0.4);

    console.log(metadata.get("progress")); // 0.5
  },
});


​

decrement

Decrement a numeric value in the metadata object:

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    // Do some work
    metadata.set("progress", 0.5);

    // Decrement a value
    metadata.decrement("progress", 0.4);

    console.log(metadata.get("progress")); // 0.1
  },
});


​

stream

Capture a stream of values and make the stream available when using Realtime. See our Realtime streams documentation for more information.

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    const readableStream = new ReadableStream({
      start(controller) {
        controller.enqueue("Step 1 complete");
        controller.enqueue("Step 2 complete");
        controller.enqueue("Step 3 complete");
        controller.close();
      },
    });

    // IMPORTANT: you must await the stream method
    const stream = await metadata.stream("logs", readableStream);

    // You can read from the returned stream locally
    for await (const value of stream) {
      console.log(value);
    }
  },
});


metadata.stream accepts any AsyncIterable or ReadableStream object. The stream will be captured and made available in the Realtime API. So for example, you could pass the body of a fetch response to metadata.stream to capture the response body and make it available in Realtime:

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { url: string }) => {
    logger.info("Streaming response", { url });

    const response = await fetch(url);

    if (!response.body) {
      throw new Error("Response body is not readable");
    }

    const stream = await metadata.stream(
      "fetch",
      response.body.pipeThrough(new TextDecoderStream())
    );

    let text = "";

    for await (const chunk of stream) {
      logger.log("Received chunk", { chunk });

      text += chunk;
    }

    return { text };
  },
});


Or the results of a streaming call to the OpenAI SDK:

import { task, metadata } from "@trigger.dev/sdk/v3";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const myTask = task({
  id: "my-task",
  run: async (payload: { prompt: string }) => {
    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: payload.prompt }],
      model: "gpt-3.5-turbo",
      stream: true,
    });

    const stream = await metadata.stream("openai", completion);

    let text = "";

    for await (const chunk of stream) {
      logger.log("Received chunk", { chunk });

      text += chunk.choices.map((choice) => choice.delta?.content).join("");
    }

    return { text };
  },
});


​

flush

Flush the metadata to the database. The SDK will automatically flush the metadata periodically, so you don’t need to call this method unless you need to ensure that the metadata is persisted immediately.

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    // Do some work
    metadata.set("progress", 0.1);

    // Flush the metadata to the database
    await metadata.flush();
  },
});


​

Metadata propagation

Metadata is NOT propagated to child tasks. If you want to pass metadata to a child task, you must do so explicitly:

import { task, metadata } from "@trigger.dev/sdk/v3";

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    await metadata.set("progress", 0.5);
    await childTask.trigger(payload, { metadata: metadata.current() });
  },
});


​

Type-safe metadata

The metadata APIs are currently loosely typed, accepting any object that is JSON-serializable:

// ❌ You can't pass a top-level array
const handle = await myTask.trigger(
  { message: "hello world" },
  { metadata: [{ user: { name: "Eric", id: "user_1234" } }] }
);

// ❌ You can't pass a string as the entire metadata:
const handle = await myTask.trigger(
  { message: "hello world" },
  { metadata: "this is the metadata" }
);

// ❌ You can't pass in a function or a class instance
const handle = await myTask.trigger(
  { message: "hello world" },
  { metadata: { user: () => "Eric", classInstance: new HelloWorld() } }
);

// ✅ You can pass in dates and other JSON-serializable objects
const handle = await myTask.trigger(
  { message: "hello world" },
  { metadata: { user: { name: "Eric", id: "user_1234" }, date: new Date() } }
);


If you pass in an object like a Date, it will be serialized to a string when stored in the metadata. That also means that when you retrieve it using metadata.get() or metadata.current(), you will get a string back. You will need to deserialize it back to a Date object if you need to use it as a Date.

We recommend wrapping the metadata API in a Zod schema (or your validator library of choice) to provide type safety:

import { task, metadata } from "@trigger.dev/sdk/v3";
import { z } from "zod";

const Metadata = z.object({
  user: z.object({
    name: z.string(),
    id: z.string(),
  }),
  date: z.coerce.date(), // Coerce the date string back to a Date object
});

type Metadata = z.infer<typeof Metadata>;

// Helper function to get the metadata object in a type-safe way
// Note: you would probably want to use .safeParse instead of .parse in a real-world scenario
function getMetadata() {
  return Metadata.parse(metadata.current());
}

export const myTask = task({
  id: "my-task",
  run: async (payload: { message: string }) => {
    const metadata = getMetadata();
    console.log(metadata.user.name); // "Eric"
    console.log(metadata.user.id); // "user_1234"
    console.log(metadata.date); // Date object
  },
});


​

Inspecting metadata

​

Dashboard

You can view the metadata for a run in the Trigger.dev dashboard. The metadata will be displayed in the run details view:

​

API

You can use the runs.retrieve() SDK function to get the metadata for a run:

import { runs } from "@trigger.dev/sdk/v3";

const run = await runs.retrieve("run_1234");

console.log(run.metadata);


See the API reference for more information.

​

Size limit

The maximum size of the metadata object is 4KB. If you exceed this limit, the SDK will throw an error. If you are self-hosting Trigger.dev, you can increase this limit by setting the TASK_RUN_METADATA_MAXIMUM_SIZE environment variable. For example, to increase the limit to 16KB, you would set TASK_RUN_METADATA_MAXIMUM_SIZE=16384.
