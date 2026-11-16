import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { membership, mutation, query } from "./functions";

export const uploadUrl = mutation({
  args: {},
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("files")
      .withIndex("workspace", (q) => q.eq("workspaceId", ctx.me.workspaceId))
      .order("desc")
      .take(400);
    const open = new Map<string, boolean>();
    const seen = new Set<string>();
    const found = [];
    for (const { _id, name, size, threadId, storageId, hidden } of rows) {
      if (hidden || seen.has(storageId)) continue;
      if (!open.has(threadId))
        open.set(
          threadId,
          await membership(ctx, threadId).then(
            () => true,
            () => false,
          ),
        );
      if (!open.get(threadId)) continue;
      seen.add(storageId);
      found.push({ _id, name, size });
    }
    return found.slice(0, 200);
  },
});

const kept = { id: v.union(v.id("files"), v.id("links")) };

export const stored = query({
  args: kept,
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row?.workspaceId !== ctx.me.workspaceId || !row.storageId)
      throw new ConvexError("Not found");
    await membership(ctx, row.threadId);
    return row.storageId;
  },
});

export const download = action({
  args: kept,
  handler: async (ctx, { id }): Promise<ArrayBuffer> => {
    const storageId = await ctx.runQuery(api.files.stored, { id });
    return (await ctx.storage.get(storageId))!.arrayBuffer();
  },
});
