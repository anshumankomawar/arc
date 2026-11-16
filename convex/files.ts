import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { membership, mutation, query } from "./functions";

export const uploadUrl = mutation({
  args: {},
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});

export const stored = query({
  args: { id: v.id("files") },
  handler: async (ctx, { id }) => {
    const file = await ctx.db.get(id);
    if (file?.workspaceId !== ctx.me.workspaceId) throw new ConvexError("Not found");
    await membership(ctx, file.threadId);
    return file.storageId;
  },
});

export const download = action({
  args: { id: v.id("files") },
  handler: async (ctx, { id }): Promise<ArrayBuffer> => {
    const storageId = await ctx.runQuery(api.files.stored, { id });
    return (await ctx.storage.get(storageId))!.arrayBuffer();
  },
});
