import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { groupToken, personToken } from "../convex/text";
import { listOf, messagesOf, world } from "./world";

async function setup() {
  const { t, signUp } = world();
  const ada = await signUp("ada");
  const grace = await signUp("grace", ada);
  const linus = await signUp("linus", ada);
  const eve = await signUp("eve");
  const inbox = async (who: typeof ada) => who.as.query(api.threads.inbox);
  return { t, ada, grace, linus, eve, inbox };
}

test("a new thread reaches who it mentions, not who wrote it", async () => {
  const { ada, grace, linus, inbox } = await setup();
  await ada.as.mutation(api.threads.start, { body: `${personToken(grace._id)} lunch?\nat noon` });

  expect(await inbox(ada)).toEqual([]);
  expect(await listOf(ada)).toMatchObject([{ title: "lunch?", unread: false }]);
  expect(await inbox(grace)).toMatchObject([{ title: "lunch?", unread: true }]);
  expect(await listOf(linus)).toEqual([]);
});

test("sent lists the threads you started", async () => {
  const { ada, grace } = await setup();
  const sent = async (who: typeof ada) => (await listOf(who, true)).map((row) => row.title);
  const threadId = await ada.as.mutation(api.threads.start, {
    body: `${personToken(grace._id)} lunch?`,
  });
  await grace.as.mutation(api.threads.send, { threadId, body: "yes" });

  expect(await sent(ada)).toEqual(["lunch?"]);
  expect(await sent(grace)).toEqual([]);
});

test("messages come a page at a time, newest first", async () => {
  const { ada, grace } = await setup();
  const threadId = await ada.as.mutation(api.threads.start, {
    body: `${personToken(grace._id)} one`,
  });
  for (const body of ["two", "three"])
    await grace.as.mutation(api.threads.send, { threadId, body });
  const page = (cursor: string | null) =>
    ada.as.query(api.threads.messages, { threadId, paginationOpts: { numItems: 2, cursor } });

  const latest = await page(null);
  expect(latest.page.map((message) => message.body)).toEqual(["three", "two"]);
  const rest = await page(latest.continueCursor);
  expect(rest.page).toMatchObject([{ body: expect.stringContaining("one") }]);
  expect(await ada.as.query(api.threads.row, { threadId })).toMatchObject({ unread: true });
  expect(
    await ada.as.query(api.threads.found, { threadIds: [threadId, "nonsense"] }),
  ).toMatchObject([{ title: "one", sent: true }]);
});

test("a thread needs someone besides its author", async () => {
  const { ada, grace } = await setup();
  const start = (body: string) => ada.as.mutation(api.threads.start, { body });
  await expect(start("note to self")).rejects.toThrow();
  await expect(start(`${personToken(ada._id)} note to self`)).rejects.toThrow();
  expect(await listOf(ada)).toEqual([]);
  await start(`${personToken(grace._id)} hi`);
  expect(await listOf(ada)).toHaveLength(1);
});

test("a message reaches everyone in the thread but its author", async () => {
  const { ada, grace, inbox } = await setup();
  const threadId = await ada.as.mutation(api.threads.start, {
    body: `${personToken(grace._id)} hi`,
  });
  await grace.as.mutation(api.threads.send, { threadId, body: "hello" });

  expect(await inbox(ada)).toMatchObject([{ unread: true, lastBody: "hello" }]);
  expect(await inbox(grace)).toMatchObject([{ unread: false }]);
});

test("done keeps a thread out of the inbox until its next message", async () => {
  const { ada, grace, inbox } = await setup();
  const threadId = await ada.as.mutation(api.threads.start, {
    body: `${personToken(grace._id)} hi`,
  });
  await grace.as.mutation(api.threads.mark, { threadId, inbox: false });
  expect(await inbox(grace)).toEqual([]);

  await ada.as.mutation(api.threads.send, { threadId, body: "still there?" });
  expect(await inbox(grace)).toHaveLength(1);
});

test("mentioning a group brings in everyone in it", async () => {
  const { t, ada, grace, linus, inbox } = await setup();
  await ada.as.mutation(api.workspace.saveGroup, {
    name: "design",
    userIds: [grace._id, linus._id],
  });
  const [group] = await t.run((ctx) => ctx.db.query("groups").collect());
  await ada.as.mutation(api.threads.start, { body: `${groupToken(group._id)} review?` });

  expect(await inbox(grace)).toHaveLength(1);
  expect(await inbox(linus)).toHaveLength(1);
});

test("threads stay inside their workspace and their members", async () => {
  const { ada, grace, linus, eve } = await setup();
  const threadId = await ada.as.mutation(api.threads.start, {
    body: `${personToken(grace._id)} ${personToken(eve._id)} secret plans`,
  });

  expect(await listOf(eve)).toEqual([]);
  await expect(messagesOf(eve, threadId)).rejects.toThrow();
  await expect(messagesOf(linus, threadId)).rejects.toThrow();
  await expect(linus.as.mutation(api.threads.send, { threadId, body: "hi" })).rejects.toThrow();
  expect(await linus.as.query(api.threads.search, { text: "secret" })).toEqual([]);
  expect(await grace.as.query(api.threads.search, { text: "secret" })).toHaveLength(1);
});
