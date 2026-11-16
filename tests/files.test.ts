import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { FILE_LIMIT, personToken } from "../convex/text";
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
