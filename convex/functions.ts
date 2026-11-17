import { getAuthUserId } from "@convex-dev/auth/server";
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation as rawMutation, query as rawQuery, type QueryCtx } from "./_generated/server";

export async function signedIn(ctx: QueryCtx) {
  const id = await getAuthUserId(ctx);
  const me = id && (await ctx.db.get(id));
  if (!me) throw new ConvexError("Signed out");
  return me;
}

export const memberOf = (ctx: QueryCtx, workspaceId: Id<"workspaces">, userId: Id<"users">) =>
  ctx.db
    .query("memberships")
    .withIndex("workspace", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .unique();

async function inWorkspace(ctx: QueryCtx) {
  const { workspaceId, ...me } = await signedIn(ctx);
  const member = workspaceId && (await memberOf(ctx, workspaceId, me._id));
  if (!member) throw new ConvexError("No workspace");
  return { me: { ...me, workspaceId: member.workspaceId } };
}

export const query = customQuery(rawQuery, customCtx(inWorkspace));
export const mutation = customMutation(rawMutation, customCtx(inWorkspace));

export type Ctx = QueryCtx & Awaited<ReturnType<typeof inWorkspace>>;

export async function membership(ctx: Ctx, threadId: Id<"threads">) {
  const row = await ctx.db
    .query("members")
    .withIndex("thread", (q) => q.eq("threadId", threadId).eq("userId", ctx.me._id))
    .unique();
  if (!row) throw new ConvexError("Not found");
  return row;
}
