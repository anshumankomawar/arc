import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { describe } from "../convex/links";
import { personToken } from "../convex/text";
import { bytesOf, listOf, messagesOf, world } from "./world";

const PAGE = `<html><head><title>Fallback</title>
  <meta content="Launch &amp; pricing" property="og:title">
  <meta name="twitter:image" content="/card.png">
  <meta name="description" content='What we ship,
    and when.'></head></html>`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", async (url: string) =>
    url.includes("broken")
      ? new Response("no", { status: 500 })
      : url.endsWith(".png")
        ? new Response("pixels", { headers: { "Content-Type": "image/png" } })
        : new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a page is described by its tags, or not at all", () => {
  expect(describe(PAGE, "https://acme.com/launch")).toEqual({
    title: "Launch & pricing",
    description: "What we ship, and when.",
    site: "acme.com",
    image: "https://acme.com/card.png",
  });
  expect(describe("<p>nothing</p>", "https://acme.com")).toBeNull();
});

test("a link in a message gets a preview that only the thread's members see", async () => {
  const { t, signUp } = world();
  const ada = await signUp("ada");
  const grace = await signUp("grace", ada);
  const linus = await signUp("linus", ada);
  const threadId = await ada.as.mutation(api.threads.start, {
    body: `${personToken(grace._id)} see https://acme.com/launch and https://broken.example`,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const [message] = await messagesOf(grace, threadId);
  expect(message.links).toMatchObject([
    { url: "https://acme.com/launch", title: "Launch & pricing", image: true },
  ]);
  const { _id: id } = message.links[0];
  expect(new TextDecoder().decode(await bytesOf(grace, id))).toBe("pixels");
  await expect(messagesOf(linus, threadId)).rejects.toThrow();
  await expect(bytesOf(linus, id)).rejects.toThrow();
});

test("a message can be only its files", async () => {
  const { t, signUp } = world();
  const ada = await signUp("ada");
  const grace = await signUp("grace", ada);
  const threadId = await ada.as.mutation(api.threads.start, {
    body: `${personToken(grace._id)} hi`,
  });
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
  await grace.as.mutation(api.threads.send, {
    threadId,
    body: "",
    files: [{ storageId, name: "plan.txt" }],
  });
  expect(await listOf(ada)).toMatchObject([{ lastBody: "plan.txt" }]);
});
