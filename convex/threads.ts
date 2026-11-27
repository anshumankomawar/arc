import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { joined, memberOf, membership, mutation, query, titled, type Ctx } from "./functions";
import { urlsIn } from "./links";
import schema from "./schema";
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
    return user && (await memberOf(ctx, workspaceId, user._id)) ? [user._id] : [];
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
  for (const { storageId, name, thumb, snippet } of files)
    await claim(storageId, name, {
      thumb: thumb && {
        id: await claim(thumb.storageId, name, { hidden: true }),
        width: thumb.width,
        height: thumb.height,
      },
      snippet: snippet?.slice(0, 1500),
    });
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
        sent: userId === authorId,
      }));
    if (userId === authorId) {
      await ctx.db.patch(memberId, { activeAt, unread: false });
      continue;
    }
    await ctx.db.patch(memberId, { activeAt, inbox: true, unread: true });
    if (!row?.bucketId) await ctx.scheduler.runAfter(0, internal.ai.sort, { memberId });
  }
}

async function rowOf(ctx: Ctx, row: Doc<"members">) {
  const { threadId, activeAt, inbox, unread, sent, bucketId } = row;
  const { title, lastAuthorId, lastBody } = (await ctx.db.get(threadId))!;
  return { threadId, activeAt, inbox, unread, sent, bucketId, title, lastAuthorId, lastBody };
}

export type Row = Awaited<ReturnType<typeof rowOf>>;

export const row_ = schema
  .doc("members")
  .pick("threadId", "activeAt", "inbox", "unread", "sent", "bucketId")
  .extend(schema.doc("threads").pick("title", "lastAuthorId", "lastBody").fields);
export const hit = schema.doc("messages").extend({ title: v.string() });
const shown = schema.doc("messages").extend({
  links: v.array(
    schema
      .doc("links")
      .pick("_id", "url", "title", "description", "site")
      .extend({ image: v.boolean() }),
  ),
  files: v.array(schema.doc("files").pick("_id", "name", "size", "thumb", "snippet")),
});

export const inbox = query({
  args: {},
  returns: v.array(row_),
  handler: async (ctx) => {
    const { _id, workspaceId } = ctx.me;
    const rows = await ctx.db
      .query("members")
      .withIndex("inbox", (q) =>
        q.eq("userId", _id).eq("workspaceId", workspaceId).eq("inbox", true),
      )
      .order("desc")
      .take(200);
    return Promise.all(rows.map((row) => rowOf(ctx, row)));
  },
});

export const list = query({
  args: { sent: v.boolean(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(row_),
  handler: async (ctx, { sent, paginationOpts }) => {
    const { _id, workspaceId } = ctx.me;
    const mine = ctx.db.query("members");
    const result = await (
      sent
        ? mine.withIndex("sent", (q) =>
            q.eq("userId", _id).eq("workspaceId", workspaceId).eq("sent", true),
          )
        : mine.withIndex("user", (q) => q.eq("userId", _id).eq("workspaceId", workspaceId))
    )
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: await Promise.all(result.page.map((row) => rowOf(ctx, row))) };
  },
});

export const row = query({
  args: { threadId: v.id("threads") },
  returns: row_,
  handler: async (ctx, { threadId }) => rowOf(ctx, await membership(ctx, threadId)),
});

export const found = query({
  args: { threadIds: v.array(v.string()) },
  returns: v.array(row_),
  handler: async (ctx, { threadIds }) => {
    const rows = await Promise.all(
      threadIds.slice(0, 20).map(async (id) => {
        const threadId = ctx.db.normalizeId("threads", id);
        const mine = threadId && (await membership(ctx, threadId).catch(() => null));
        return mine ? [await rowOf(ctx, mine)] : [];
      }),
    );
    return rows.flat();
  },
});

export const messages = query({
  args: { threadId: v.id("threads"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(shown),
  handler: async (ctx, { threadId, paginationOpts }) => {
    await membership(ctx, threadId);
    const result = await ctx.db
      .query("messages")
      .withIndex("thread", (q) => q.eq("threadId", threadId))
      .order("desc")
      .paginate(paginationOpts);
    const page = await Promise.all(
      result.page.map(async (message) => {
        const files = await ctx.db
          .query("files")
          .withIndex("message", (q) => q.eq("messageId", message._id))
          .take(64);
        const links = await ctx.db
          .query("links")
          .withIndex("message", (q) => q.eq("messageId", message._id))
          .take(3);
        return {
          ...message,
          links: links.map(({ _id, url, title, description, site, storageId }) => ({
            _id,
            url,
            title,
            description,
            site,
            image: !!storageId,
          })),
          files: files
            .filter((file) => !file.hidden)
            .map(({ _id, name, size, thumb, snippet }) => ({ _id, name, size, thumb, snippet })),
        };
      }),
    );
    return { ...result, page };
  },
});

export const search = query({
  args: { text: v.string() },
  returns: v.array(hit),
  handler: async (ctx, { text }) => {
    const hits = await ctx.db
      .query("messages")
      .withSearchIndex("search", (q) =>
        q.search("body", text).eq("workspaceId", ctx.me.workspaceId),
      )
      .take(50);
    const open = await joined(
      ctx,
      hits.map((hit) => hit.threadId),
    );
    return titled(ctx, hits.filter((hit) => open.has(hit.threadId)).slice(0, 20));
  },
});

export async function begin(ctx: MutationCtx & Ctx, body: string, files?: Attached) {
  const threadId = await ctx.db.insert("threads", {
    workspaceId: ctx.me.workspaceId,
    title: titleOf(body),
    lastAuthorId: ctx.me._id,
    lastBody: body,
  });
  await post(ctx, threadId, body, files);
  return threadId;
}

export const start = mutation({
  args: { body: v.string(), files: v.optional(attached) },
  returns: v.id("threads"),
  handler: (ctx, { body, files }) => begin(ctx, body, files),
});

export const send = mutation({
  args: { threadId: v.id("threads"), body: v.string(), files: v.optional(attached) },
  returns: v.null(),
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
  returns: v.null(),
  handler: async (ctx, { threadId, ...state }) => {
    const row = await membership(ctx, threadId);
    await ctx.db.patch(row._id, state);
  },
});

export const move = mutation({
  args: { threadId: v.id("threads"), bucketId: v.optional(v.id("buckets")) },
  returns: v.null(),
  handler: async (ctx, { threadId, bucketId }) => {
    const row = await membership(ctx, threadId);
    const bucket = bucketId && (await ctx.db.get(bucketId));
    if (bucketId && bucket?.userId !== ctx.me._id) throw new ConvexError("Not found");
    await ctx.db.patch(row._id, { bucketId });
  },
});
