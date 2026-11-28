import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { LINK } from "./text";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

export const urlsIn = (body: string) => [...new Set(body.match(LINK))].slice(0, 3);

const clean = (text: string | undefined, length: number) =>
  text
    ?.replace(/&(amp|lt|gt|quot|#39);/g, (_match, name: string) => ENTITIES[name])
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);

async function get(url: string, type: string, limit: number, whole: boolean) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { "User-Agent": "ArcLinkPreview/1.0", Range: `bytes=0-${limit - 1}` },
  });
  const sent = response.headers.get("Content-Type") ?? "";
  if (!response.ok || !sent.includes(type)) return null;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const reader = response.body!.getReader();
  for (let size = 0; size <= limit;) {
    const { done, value } = await reader.read();
    if (done) return new Blob(chunks, { type: sent });
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel();
  return whole ? null : new Blob(chunks, { type: sent });
}

export function describe(html: string, url: string) {
  const meta = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\s[^>]*>/gi)) {
    const key = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1].toLowerCase();
    const content = tag.match(/content=(?:"([^"]*)"|'([^']*)')/i);
    if (key && content && !meta.has(key)) meta.set(key, content[1] ?? content[2]);
  }
  const tagged = (name: string) => meta.get(`og:${name}`) ?? meta.get(`twitter:${name}`);
  const title = clean(tagged("title") ?? html.match(/<title[^>]*>([^<]*)/i)?.[1], 200);
  if (!title) return null;
  const image = clean(tagged("image"), 2000);
  const absolute = (path: string) => {
    try {
      return new URL(path, url).href;
    } catch {
      return undefined;
    }
  };
  return {
    title,
    description: clean(tagged("description") ?? meta.get("description"), 300) ?? "",
    site: clean(meta.get("og:site_name"), 80) || new URL(url).hostname,
    image: image && absolute(image),
  };
}

export const body = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => (await ctx.db.get(messageId))?.body,
});

export const save = internalMutation({
  args: {
    messageId: v.id("messages"),
    url: v.string(),
    title: v.string(),
    description: v.string(),
    site: v.string(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, link) => {
    const message = await ctx.db.get(link.messageId);
    const saved = await ctx.db
      .query("links")
      .withIndex("message", (q) => q.eq("messageId", link.messageId))
      .take(3);
    if (
      !message ||
      !urlsIn(message.body).includes(link.url) ||
      saved.some((row) => row.url === link.url)
    ) {
      if (link.storageId) await ctx.storage.delete(link.storageId);
      return;
    }
    const { workspaceId, threadId } = message;
    await ctx.db.insert("links", { workspaceId, threadId, ...link });
  },
});

export const unfurl = internalAction({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const text = await ctx.runQuery(internal.links.body, { messageId });
    for (const url of urlsIn(text ?? "")) {
      const html = await get(url, "text/html", 300_000, false).catch(() => null);
      const found = html && describe(await html.text(), url);
      if (!found) continue;
      const { image, ...link } = found;
      const picture =
        image?.startsWith("http") &&
        (await get(image, "image/", 3_000_000, true).catch(() => null));
      const storageId = picture ? await ctx.storage.store(picture) : undefined;
      await ctx.runMutation(internal.links.save, { messageId, url, ...link, storageId });
    }
  },
});
