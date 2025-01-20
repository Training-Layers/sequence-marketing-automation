Logging and tracing - Trigger.dev

Writing tasks

Logging and tracing
===================

How to use the built-in logging and tracing system.

The run log shows you exactly what happened in every run of your tasks. It is comprised of logs, traces and spans.

[​](https://trigger.dev/docs/logging#logs)

Logs
--------------------------------------------------

You can use `console.log()`, `console.error()`, etc as normal and they will be shown in your run log. This is the standard function so you can use it as you would in any other JavaScript or TypeScript code. Logs from any functions/packages will also be shown.

### 

[​](https://trigger.dev/docs/logging#logger)

logger

We recommend that you use our `logger` object which creates structured logs. Structured logs will make it easier for you to search the logs to quickly find runs.

/trigger/logging.ts

```ts
import { task, logger } from "@trigger.dev/sdk/v3";

export const loggingExample = task({
  id: "logging-example",
  run: async (payload: { data: Record<string, string> }) => {
    //the first parameter is the message, the second parameter must be a key-value object (Record<string, unknown>)
    logger.debug("Debug message", payload.data);
    logger.log("Log message", payload.data);
    logger.info("Info message", payload.data);
    logger.warn("You've been warned", payload.data);
    logger.error("Error message", payload.data);
  },
});


​

Tracing and spans

Tracing is a way to follow the flow of your code. It’s very useful for debugging and understanding how your code is working, especially with long-running or complex tasks.

Trigger.dev uses OpenTelemetry tracing under the hood. With automatic tracing for many things like task triggering, task attempts, HTTP requests, and more.

Name	Description
Task triggers	Task triggers.
Task attempts	Task attempts.
HTTP requests	HTTP requests made by your code.

​

Adding instrumentations

You can add instrumentations. The Prisma one above will automatically trace all Prisma queries.

​

Add custom traces

If you want to add custom traces to your code, you can use the logger.trace function. It will create a new OTEL trace and you can set attributes on it.

import { logger, task } from "@trigger.dev/sdk/v3";

export const customTrace = task({
  id: "custom-trace",
  run: async (payload) => {
    //you can wrap code in a trace, and set attributes
    const user = await logger.trace("fetch-user", async (span) => {
      span.setAttribute("user.id", "1");

      //...do stuff

      //you can return a value
      return {
        id: "1",
        name: "John Doe",
        fetchedAt: new Date(),
      };
    });

    const usersName = user.name;
  },
});
