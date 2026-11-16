import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { FILE_LIMIT, fileToken, personToken } from "../convex/text";
import { world } from "./world";

async function setup() {
  const { t, signUp } = world();
  const ada = await signUp("ada");
  const grace = await signUp("grace", ada);
  const linus = await signUp("linus", ada);
  const eve = await signUp("eve");
  const store = (bytes: BlobPart) => t.run((ctx) => ctx.storage.store(new Blob([bytes])));
  return { ada, grace, linus, eve, store };
}

test("a file goes with its message to the thread's members and nobody else", async () => {
  const { ada, grace, linus, eve, store } = await setup();
  const threadId = await ada.as.mutation(api.threads.start, {
    body: `${personToken(grace._id)} the plan`,
    files: [{ storageId: await store("secret"), name: "plan.txt" }],
  });

  const [message] = await grace.as.query(api.threads.messages, { threadId });
  expect(message.files).toMatchObject([{ name: "plan.txt", size: 6 }]);
  const { _id: id } = message.files[0];
  const bytes = await grace.as.action(api.files.download, { id });
  expect(new TextDecoder().decode(bytes)).toBe("secret");

  for (const outsider of [linus, eve]) {
    await expect(outsider.as.query(api.files.stored, { id })).rejects.toThrow();
    await expect(outsider.as.action(api.files.download, { id })).rejects.toThrow();
  }
});

test("a thumbnail is kept with its file, and can't be someone else's file", async () => {
  const { ada, grace, linus, store } = await setup();
  const secret = await store("secret");
  const threadId = await ada.as.mutation(api.threads.start, {
    body: `${personToken(grace._id)} photo`,
    files: [
      {
        storageId: secret,
        name: "a.png",
        thumb: { storageId: await store("small"), width: 4, height: 3 },
      },
    ],
  });
  await ada.as.mutation(api.threads.send, {
    threadId,
    body: "notes",
    files: [{ storageId: await store("x"), name: "notes.md", snippet: "a".repeat(2000) }],
  });
  const [{ files }, notes] = await grace.as.query(api.threads.messages, { threadId });
  expect(notes.files[0].snippet).toHaveLength(1500);
  expect(files).toMatchObject([{ name: "a.png", thumb: { width: 4, height: 3 } }]);
  const small = await grace.as.action(api.files.download, { id: files[0].thumb!.id });
  expect(new TextDecoder().decode(small)).toBe("small");

  await expect(
    linus.as.mutation(api.threads.start, {
      body: `${personToken(grace._id)} mine`,
      files: [
        {
          storageId: await store("x"),
          name: "x.png",
          thumb: { storageId: secret, width: 1, height: 1 },
        },
      ],
    }),
  ).rejects.toThrow();
});

test("referencing a file shares it with the new thread, if the sender can open it", async () => {
  const { ada, grace, linus, eve, store } = await setup();
  const first = await ada.as.mutation(api.threads.start, {
    body: `${personToken(grace._id)} the plan`,
    files: [
      {
        storageId: await store("secret"),
        name: "plan.png",
        thumb: { storageId: await store("small"), width: 4, height: 3 },
      },
    ],
  });
  const [{ files }] = await grace.as.query(api.threads.messages, { threadId: first });
  const [plan] = files;
  expect(await grace.as.query(api.files.mine)).toMatchObject([{ _id: plan._id, name: "plan.png" }]);
  expect(await linus.as.query(api.files.mine)).toEqual([]);

  const refer = (who: typeof ada, id: string) =>
    who.as.mutation(api.threads.start, { body: `${personToken(grace._id)} see ${fileToken(id)}` });
  await expect(refer(linus, plan._id)).rejects.toThrow();
  await expect(refer(eve, plan._id)).rejects.toThrow();
  await expect(refer(ada, plan.thumb!.id)).rejects.toThrow();

  const second = await grace.as.mutation(api.threads.start, {
    body: `${personToken(linus._id)} see ${fileToken(plan._id)}`,
  });
  const [message] = await linus.as.query(api.threads.messages, { threadId: second });
  const [shared] = message.files;
  expect(shared).toMatchObject({ name: "plan.png" });
  expect(shared._id).not.toBe(plan._id);
  expect(message.body).toContain(fileToken(shared._id));
  const read = async (id: typeof plan._id) =>
    new TextDecoder().decode(await linus.as.action(api.files.download, { id }));
  expect(await read(shared._id)).toBe("secret");
  expect(await read(shared.thumb!.id)).toBe("small");
  await expect(read(plan._id)).rejects.toThrow();
  expect(await linus.as.query(api.threads.list)).toMatchObject([
    { lastBody: expect.stringContaining("see plan.png") },
  ]);
  expect(await grace.as.query(api.files.mine)).toHaveLength(1);
});

test("a stored file can be attached once, and only if it is small enough", async () => {
  const { ada, grace, linus, store } = await setup();
  const storageId = await store("secret");
  const send = (who: typeof ada, to: typeof ada, id = storageId) =>
    who.as.mutation(api.threads.start, {
      body: `${personToken(to._id)} here`,
      files: [{ storageId: id, name: "plan.txt" }],
    });
  await send(ada, grace);
  await expect(send(linus, grace)).rejects.toThrow();
  await expect(send(ada, grace, await store(new Uint8Array(FILE_LIMIT + 1)))).rejects.toThrow();
  expect(await linus.as.query(api.threads.list)).toEqual([]);
});
