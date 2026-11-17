import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { membership, mutation, query, type Ctx } from "./functions";
import { urlsIn } from "./links";
import { FILE_LIMIT, fileToken, mentions, titleOf } from "./text";

const attached = v.array(
  v.object({
    storageId: v.id("_storage"),
    name: v.string(),
    snippet: v.optional(v.string()),
    thumb: v.optional(
      v.object({ storageId: v.id("_storage"), width: v.number(), height: v.number() }),
    ),
  }),
);
type Attached = typeof attached.type;

export async function post(
  ctx: MutationCtx & Ctx,
  threadId: Id<"threads">,
  body: string,
  files: Attached = [],
) {
  const { _id: authorId, workspaceId } = ctx.me;
  const activeAt = Date.now();

  const colleague = async (id: string) => {
    const userId = ctx.db.normalizeId("users", id);
    const user = userId && (await ctx.db.get(userId));
    return user?.workspaceId === workspaceId ? [user._id] : [];
  };
  const groups = await Promise.all(
    mentions(body, "group").map((id) => {
      const groupId = ctx.db.normalizeId("groups", id);
      return groupId && ctx.db.get(groupId);
    }),
  );
  const mentioned = [
    ...mentions(body, "person"),
    ...groups.flatMap((group) => (group?.workspaceId === workspaceId ? group.userIds : [])),
  ];
  const rows = await ctx.db
    .query("members")
    .withIndex("thread", (q) => q.eq("threadId", threadId))
    .collect();
  const existing = new Map(rows.map((row) => [row.userId, row]));
  const everyone = new Set([
    authorId,
    ...existing.keys(),
    ...(await Promise.all(mentioned.map(colleague))).flat(),
  ]);
  if (everyone.size < 2) throw new ConvexError("Nobody to send it to");

  const messageId = await ctx.db.insert("messages", { workspaceId, threadId, authorId, body });
  await ctx.scheduler.runAfter(0, internal.search.index, { messageId });
  if (urlsIn(body).length) await ctx.scheduler.runAfter(0, internal.links.unfurl, { messageId });
  const claim = async (
    storageId: Id<"_storage">,
    name: string,
    more: Pick<Doc<"files">, "hidden" | "thumb" | "snippet">,
  ) => {
    const stored = await ctx.db.system.get(storageId);
    const taken = await ctx.db
      .query("files")
      .withIndex("storage", (q) => q.eq("storageId", storageId))
      .first();
    if (!stored || taken || stored.size > FILE_LIMIT) throw new ConvexError("Not found");
    const { size } = stored;
    return ctx.db.insert("files", {
      workspaceId,
      threadId,
      messageId,
      storageId,
      name,
      size,
      ...more,
    });
  };
  for (const { storageId, name, thumb, snippet } of files) {
    const id = thumb && (await claim(thumb.storageId, name, { hidden: true }));
    const { width = 0, height = 0 } = thumb ?? {};
    await claim(storageId, name, {
      thumb: id && { id, width, height },
      snippet: snippet?.slice(0, 1500),
    });
  }
  let text = body;
  let shown = body;
  for (const id of new Set(mentions(body, "file"))) {
    const fileId = ctx.db.normalizeId("files", id);
    const source = fileId && (await ctx.db.get(fileId));
    if (!source || source.hidden || source.workspaceId !== workspaceId)
      throw new ConvexError("Not found");
    await membership(ctx, source.threadId);
    shown = shown.replaceAll(fileToken(id), source.name);
    if (source.threadId === threadId) continue;
    const copy = ({ _id, _creationTime, ...row }: Doc<"files">) =>
      ctx.db.insert("files", { ...row, threadId, messageId });
    const small = source.thumb && (await ctx.db.get(source.thumb.id));
    const thumb = source.thumb && small ? { ...source.thumb, id: await copy(small) } : undefined;
    text = text.replaceAll(fileToken(id), fileToken(await copy({ ...source, thumb })));
  }
  if (text !== body) await ctx.db.patch(messageId, { body: text });
  await ctx.db.patch(threadId, {
    lastAuthorId: authorId,
    lastBody: shown || files.map((file) => file.name).join(", "),
  });

  for (const userId of everyone) {
    const row = existing.get(userId);
    const memberId =
      row?._id ??
      (await ctx.db.insert("members", {
        workspaceId,
        threadId,
        userId,
        activeAt,
        inbox: false,
        unread: false,
      }));
    if (userId === authorId) {
      await ctx.db.patch(memberId, { activeAt, unread: false });
      continue;
    }
    await ctx.db.patch(memberId, { activeAt, inbox: true, unread: true });
    if (!row?.bucketId) await ctx.scheduler.runAfter(0, internal.ai.sort, { memberId });
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("members")
      .withIndex("user", (q) => q.eq("userId", ctx.me._id).eq("workspaceId", ctx.me.workspaceId))
      .order("desc")
      .take(500);
    return Promise.all(
      rows.map(async ({ threadId, activeAt, inbox, unread, bucketId }) => {
        const { title, ownerId, lastAuthorId, lastBody } = (await ctx.db.get(threadId))!;
        const sent = ownerId === ctx.me._id;
        return { threadId, activeAt, inbox, unread, bucketId, title, sent, lastAuthorId, lastBody };
      }),
    );
  },
});

export const messages = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    await membership(ctx, threadId);
    const messages = await ctx.db
      .query("messages")
      .withIndex("thread", (q) => q.eq("threadId", threadId))
      .collect();
    const files = await ctx.db
      .query("files")
      .withIndex("thread", (q) => q.eq("threadId", threadId))
      .collect();
    const links = await ctx.db
      .query("links")
      .withIndex("thread", (q) => q.eq("threadId", threadId))
      .collect();
    return messages.map((message) => ({
      ...message,
      links: links
        .filter((link) => link.messageId === message._id)
        .map(({ _id, url, title, description, site, storageId }) => ({
          _id,
          url,
          title,
          description,
          site,
          image: !!storageId,
        })),
      files: files
        .filter((file) => file.messageId === message._id && !file.hidden)
        .map(({ _id, name, size, thumb, snippet }) => ({ _id, name, size, thumb, snippet })),
    }));
  },
});

export const search = query({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const hits = await ctx.db
      .query("messages")
      .withSearchIndex("search", (q) =>
        q.search("body", text).eq("workspaceId", ctx.me.workspaceId),
      )
      .take(50);
    const mine = await Promise.all(
      hits.map((hit) =>
        membership(ctx, hit.threadId).then(
          () => [hit],
          () => [],
        ),
      ),
    );
    return mine.flat().slice(0, 20);
  },
});

export async function begin(ctx: MutationCtx & Ctx, body: string, files?: Attached) {
  const threadId = await ctx.db.insert("threads", {
    workspaceId: ctx.me.workspaceId,
    title: titleOf(body),
    ownerId: ctx.me._id,
    lastAuthorId: ctx.me._id,
    lastBody: body,
  });
  await post(ctx, threadId, body, files);
  return threadId;
}

export const start = mutation({
  args: { body: v.string(), files: v.optional(attached) },
  handler: (ctx, { body, files }) => begin(ctx, body, files),
});

export const send = mutation({
  args: { threadId: v.id("threads"), body: v.string(), files: v.optional(attached) },
  handler: async (ctx, { threadId, body, files }) => {
    await membership(ctx, threadId);
    await post(ctx, threadId, body, files);
  },
});

export const mark = mutation({
  args: {
    threadId: v.id("threads"),
    inbox: v.optional(v.boolean()),
    unread: v.optional(v.boolean()),
  },
  handler: async (ctx, { threadId, ...state }) => {
    const row = await membership(ctx, threadId);
    await ctx.db.patch(row._id, state);
  },
});

export const move = mutation({
  args: { threadId: v.id("threads"), bucketId: v.optional(v.id("buckets")) },
  handler: async (ctx, { threadId, bucketId }) => {
    const row = await membership(ctx, threadId);
    const bucket = bucketId && (await ctx.db.get(bucketId));
    if (bucketId && bucket?.userId !== ctx.me._id) throw new ConvexError("Not found");
    await ctx.db.patch(row._id, { bucketId });
  },
});
