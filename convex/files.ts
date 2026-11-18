import { ConvexError, v } from "convex/values";
import { joined, membership, mutation, query } from "./functions";

export const uploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});

export const mine = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("files"), name: v.string(), size: v.number() })),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("files")
      .withIndex("workspace", (q) => q.eq("workspaceId", ctx.me.workspaceId))
      .order("desc")
      .take(400);
    const open = await joined(
      ctx,
      rows.map((row) => row.threadId),
    );
    const seen = new Set<string>();
    const found = [];
    for (const { _id, name, size, threadId, storageId, hidden } of rows) {
      if (hidden || seen.has(storageId) || !open.has(threadId)) continue;
      seen.add(storageId);
      found.push({ _id, name, size });
    }
    return found.slice(0, 200);
  },
});

const kept = { id: v.union(v.id("files"), v.id("links")) };

export const stored = query({
  args: kept,
  returns: v.id("_storage"),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row?.workspaceId !== ctx.me.workspaceId || !row.storageId)
      throw new ConvexError("Not found");
    await membership(ctx, row.threadId);
    return row.storageId;
  },
});
