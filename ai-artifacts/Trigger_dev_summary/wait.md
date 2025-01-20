Wait: Overview - Trigger.dev

Wait

Wait: Overview
==============

During your run you can wait for a period of time or for something to happen.

Waiting allows you to write complex tasks as a set of async code, without having to scheduled another task or poll for changes.

In the Trigger.dev Cloud we automatically pause execution of tasks when they are waiting for longer than a few seconds. You are not charged when execution is paused.

| Function | What it does |
| --- | --- |
| [wait.for()](https://trigger.dev/docs/wait-for) | Waits for a specific period of time, e.g. 1 day. |
| [wait.until()](https://trigger.dev/docs/wait-until) | Waits until the provided `Date`. |
| [wait.forRequest()](https://trigger.dev/docs/wait-for-request) | Waits until a matching HTTP request is received, and gives you the data to continue with. |
| [waitForEvent()](https://trigger.dev/docs/wait-for-event) | Waits for a matching event, like in the example above. |

Wait for - Trigger.dev

Wait for
========

Wait for a period of time, then continue execution.

Inside your tasks you can wait for a period of time before you want execution to continue.

/trigger/long-task.ts

```ts
export const veryLongTask = task({
  id: "very-long-task",
  run: async (payload) => {
    await wait.for({ seconds: 5 });

    await wait.for({ minutes: 10 });

    await wait.for({ hours: 1 });

    await wait.for({ days: 1 });

    await wait.for({ weeks: 1 });

    await wait.for({ months: 1 });

    await wait.for({ years: 1 });
  },
});


This allows you to write linear code without having to worry about the complexity of scheduling or managing cron jobs.

In the Trigger.dev Cloud we automatically pause execution of tasks when they are waiting for longer than a few seconds. You are not charged when execution is paused.

Wait until - Trigger.dev

Wait

Wait until
==========

Wait until a date, then continue execution.

This example sends a reminder email to a user at the specified datetime.

/trigger/reminder-email.ts

```ts
export const sendReminderEmail = task({
  id: "send-reminder-email",
  run: async (payload: { to: string; name: string; date: string }) => {
    //wait until the date
    await wait.until({ date: new Date(payload.date) });

    //todo send email
    const { data, error } = await resend.emails.send({
      from: "hello@trigger.dev",
      to: payload.to,
      subject: "Don't forget…",
      html: `<p>Hello ${payload.name},</p><p>...</p>`,
    });
  },
});


This allows you to write linear code without having to worry about the complexity of scheduling or managing cron jobs.

In the Trigger.dev Cloud we automatically pause execution of tasks when they are waiting for longer than a few seconds. You are not charged when execution is paused.

​

throwIfInThePast

You can optionally throw an error if the date is already in the past when the function is called:

await wait.until({ date: new Date(date), throwIfInThePast: true });


You can of course use try/catch if you want to do something special in this case.

