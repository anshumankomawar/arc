import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { membership, mutation, query } from "./functions";

export const uploadUrl = mutation({
  args: {},
  handler: (ctx) => ctx.storage.generateUploadUrl(),
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
