import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation as rawMutation,
  query as rawQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { memberOf, mutation, query, signedIn, type Ctx } from "./functions";
import schema from "./schema";

const role = v.union(v.literal("owner"), v.literal("member"));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const membershipsOf = (ctx: QueryCtx, userId: Id<"users">) =>
  ctx.db
    .query("memberships")
    .withIndex("user", (q) => q.eq("userId", userId))
    .collect();

export const membersIn = async (ctx: QueryCtx, workspaceId: Id<"workspaces">) =>
  (
    await ctx.db
      .query("memberships")
      .withIndex("workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect()
  ).sort((a, b) => a._creationTime - b._creationTime);

const invitationTo = (ctx: QueryCtx, workspaceId: Id<"workspaces">, email: string) =>
  ctx.db
    .query("invitations")
    .withIndex("workspace", (q) => q.eq("workspaceId", workspaceId).eq("email", email))
    .unique();

const invitationsTo = (ctx: QueryCtx, workspaceId: Id<"workspaces">) =>
  ctx.db
    .query("invitations")
    .withIndex("workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();

export const groupsIn = (ctx: QueryCtx, workspaceId: Id<"workspaces">) =>
  ctx.db
    .query("groups")
    .withIndex("workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();

const invitedTo = (ctx: QueryCtx, invite: string) =>
  ctx.db
    .query("workspaces")
    .withIndex("invite", (q) => q.eq("invite", invite))
    .unique();

async function invitationFor(ctx: QueryCtx, id: Id<"invitations">) {
  const me = await signedIn(ctx);
  const invitation = await ctx.db.get(id);
  if (invitation?.email !== me.email.toLowerCase()) throw new ConvexError("Not found");
  return { me, invitation };
}

async function removeOwn(ctx: MutationCtx & Ctx, id: Id<"invitations"> | Id<"groups">) {
  if ((await ctx.db.get(id))?.workspaceId !== ctx.me.workspaceId)
    throw new ConvexError("Not found");
  await ctx.db.delete(id);
}

async function owner(ctx: Ctx) {
  if ((await memberOf(ctx, ctx.me.workspaceId, ctx.me._id))?.role !== "owner")
    throw new ConvexError("Only an owner can do that");
}

async function enter(
  ctx: MutationCtx,
  me: Doc<"users">,
  workspaceId: Id<"workspaces">,
  role: "owner" | "member" = "member",
) {
  if (!(await memberOf(ctx, workspaceId, me._id))) {
    await ctx.db.insert("memberships", { userId: me._id, workspaceId, role });
    const { people } = (await ctx.db.get(workspaceId))!;
    await ctx.db.patch(workspaceId, { people: people + 1 });
  }
  const invitation = await invitationTo(ctx, workspaceId, me.email.toLowerCase());
  if (invitation) await ctx.db.delete(invitation._id);
  await ctx.db.patch(me._id, { workspaceId });
}

async function moveOut(ctx: MutationCtx, userId: Id<"users">, workspaceId: Id<"workspaces">) {
  if ((await ctx.db.get(userId))?.workspaceId !== workspaceId) return;
  const [next] = await membershipsOf(ctx, userId);
  await ctx.db.patch(userId, { workspaceId: next?.workspaceId });
}

async function remove(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  for (const row of await membersIn(ctx, workspaceId)) {
    await ctx.db.delete(row._id);
    await moveOut(ctx, row.userId, workspaceId);
  }
  for (const invitation of await invitationsTo(ctx, workspaceId))
    await ctx.db.delete(invitation._id);
  await ctx.db.delete(workspaceId);
  await ctx.scheduler.runAfter(0, internal.workspace.purge, { workspaceId });
}

async function depart(ctx: MutationCtx, workspaceId: Id<"workspaces">, userId: Id<"users">) {
  const rows = await membersIn(ctx, workspaceId);
  const leaving = rows.find((row) => row.userId === userId);
  if (!leaving) throw new ConvexError("Not found");
  const rest = rows.filter((row) => row !== leaving);
  if (!rest.length) return remove(ctx, workspaceId);
  await ctx.db.delete(leaving._id);
  await ctx.db.patch(workspaceId, { people: rest.length });
  if (!rest.some((row) => row.role === "owner")) await ctx.db.patch(rest[0]._id, { role: "owner" });
  await moveOut(ctx, userId, workspaceId);
}

export const me = rawQuery({
  args: {},
  returns: schema
    .doc("users")
    .extend({ workspace: v.optional(v.string()), role: v.optional(role) }),
  handler: async (ctx) => {
    const { workspaceId, ...me } = await signedIn(ctx);
    const member = workspaceId && (await memberOf(ctx, workspaceId, me._id));
    const workspace = member && (await ctx.db.get(member.workspaceId));
    return {
      ...me,
      workspaceId: member?.workspaceId,
      workspace: workspace?.name,
      role: member?.role,
    };
  },
});

export const workspaces = rawQuery({
  args: {},
  returns: v.array(v.object({ _id: v.id("workspaces"), name: v.string(), people: v.number() })),
  handler: async (ctx) => {
    const rows = await membershipsOf(ctx, (await signedIn(ctx))._id);
    return Promise.all(
      rows.map(async (row) => {
        const { _id, name, people } = (await ctx.db.get(row.workspaceId))!;
        return { _id, name, people };
      }),
    );
  },
});

export const invitations = rawQuery({
  args: {},
  returns: v.array(v.object({ _id: v.id("invitations"), workspace: v.string(), from: v.string() })),
  handler: async (ctx) => {
    const me = await signedIn(ctx);
    const rows = await ctx.db
      .query("invitations")
      .withIndex("email", (q) => q.eq("email", me.email.toLowerCase()))
      .collect();
    return Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        workspace: (await ctx.db.get(row.workspaceId))!.name,
        from: (await ctx.db.get(row.invitedBy))?.name ?? "Someone",
      })),
    );
  },
});

export const invited = rawQuery({
  args: { invite: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { invite }) => (await invitedTo(ctx, invite))?.name ?? null,
});

export const create = rawMutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    if (!name.trim()) throw new ConvexError("A workspace needs a name");
    const me = await signedIn(ctx);
    await enter(
      ctx,
      me,
      await ctx.db.insert("workspaces", { name: name.trim(), people: 0 }),
      "owner",
    );
  },
});

export const join = rawMutation({
  args: { link: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { link }) => {
    const me = await signedIn(ctx);
    const invite = link.trim().split("/").pop();
    const workspace = invite && (await invitedTo(ctx, invite));
    if (workspace) await enter(ctx, me, workspace._id);
    return !!workspace;
  },
});

export const accept = rawMutation({
  args: { id: v.id("invitations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { me, invitation } = await invitationFor(ctx, id);
    await enter(ctx, me, invitation.workspaceId);
  },
});

export const decline = rawMutation({
  args: { id: v.id("invitations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await invitationFor(ctx, id);
    await ctx.db.delete(id);
  },
});

export const open = rawMutation({
  args: { id: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const me = await signedIn(ctx);
    if (!(await memberOf(ctx, id, me._id))) throw new ConvexError("Not found");
    await ctx.db.patch(me._id, { workspaceId: id });
  },
});

export const inviteLink = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const workspace = (await ctx.db.get(ctx.me.workspaceId))!;
    const invite = workspace.invite ?? crypto.randomUUID();
    if (!workspace.invite) await ctx.db.patch(workspace._id, { invite });
    return `${process.env.SITE_URL}/join/${invite}`;
  },
});

export const invite = mutation({
  args: { emails: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, { emails }) => {
    const { workspaceId, _id } = ctx.me;
    const members = await Promise.all(
      (await membersIn(ctx, workspaceId)).map((row) => ctx.db.get(row.userId)),
    );
    const taken = new Set(members.map((user) => user?.email.toLowerCase()));
    const already = [];
    for (const email of new Set(emails.map((email) => email.trim().toLowerCase()))) {
      if (!EMAIL.test(email)) continue;
      if (taken.has(email) || (await invitationTo(ctx, workspaceId, email))) already.push(email);
      else await ctx.db.insert("invitations", { workspaceId, email, invitedBy: _id });
    }
    return already;
  },
});

export const pending = query({
  args: {},
  returns: v.array(schema.doc("invitations")),
  handler: (ctx) => invitationsTo(ctx, ctx.me.workspaceId),
});

export const revoke = mutation({
  args: { id: v.id("invitations") },
  returns: v.null(),
  handler: (ctx, { id }) => removeOwn(ctx, id),
});

export const rename = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    await owner(ctx);
    if (name.trim()) await ctx.db.patch(ctx.me.workspaceId, { name: name.trim() });
  },
});

export const leave = rawMutation({
  args: { id: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, { id }) => depart(ctx, id, (await signedIn(ctx))._id),
});

export const removePerson = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await owner(ctx);
    if (userId === ctx.me._id) throw new ConvexError("Leave the workspace instead");
    await depart(ctx, ctx.me.workspaceId, userId);
  },
});

export const removeWorkspace = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await owner(ctx);
    await remove(ctx, ctx.me.workspaceId);
  },
});

export const purge = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    if (!thread) {
      const groups = await ctx.db
        .query("groups")
        .withIndex("workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect();
      for (const group of groups) await ctx.db.delete(group._id);
      return;
    }
    const inThread = (
      table: "messages" | "links" | "members" | "vectors" | "files" | "reactions",
    ) =>
      ctx.db
        .query(table)
        .withIndex("thread", (q) => q.eq("threadId", thread._id))
        .collect();
    for (const table of ["messages", "links", "members", "vectors", "files", "reactions"] as const)
      for (const row of await inThread(table)) {
        if ("storageId" in row && row.storageId)
          await ctx.storage.delete(row.storageId).catch(() => {});
        await ctx.db.delete(row._id);
      }
    await ctx.db.delete(thread._id);
    await ctx.scheduler.runAfter(0, internal.workspace.purge, { workspaceId });
  },
});

export const people = query({
  args: {},
  returns: v.array(schema.doc("users").extend({ role })),
  handler: async (ctx) =>
    Promise.all(
      (await membersIn(ctx, ctx.me.workspaceId)).map(async (row) => ({
        ...(await ctx.db.get(row.userId))!,
        role: row.role,
      })),
    ),
});

export const groups = query({
  args: {},
  returns: v.array(schema.doc("groups")),
  handler: (ctx) => groupsIn(ctx, ctx.me.workspaceId),
});

export const saveGroup = mutation({
  args: { id: v.optional(v.id("groups")), name: v.string(), userIds: v.array(v.id("users")) },
  returns: v.union(v.id("groups"), v.null()),
  handler: async (ctx, { id, ...group }) => {
    const { workspaceId } = ctx.me;
    const members = await Promise.all(
      group.userIds.map((userId) => memberOf(ctx, workspaceId, userId)),
    );
    if (members.some((member) => !member)) throw new ConvexError("Not found");
    const named = await groupsIn(ctx, workspaceId);
    const lower = group.name.toLowerCase();
    if (named.some((other) => other._id !== id && other.name.toLowerCase() === lower))
      throw new ConvexError(`There's already a group called ${group.name}.`);
    if (!id) return await ctx.db.insert("groups", { workspaceId, ...group });
    if ((await ctx.db.get(id))?.workspaceId !== workspaceId) throw new ConvexError("Not found");
    await ctx.db.patch(id, group);
  },
});

export const removeGroup = mutation({
  args: { id: v.id("groups") },
  returns: v.null(),
  handler: (ctx, { id }) => removeOwn(ctx, id),
});

export const buckets = query({
  args: {},
  returns: v.array(schema.doc("buckets")),
  handler: (ctx) =>
    ctx.db
      .query("buckets")
      .withIndex("user", (q) => q.eq("userId", ctx.me._id))
      .collect(),
});

export const saveBucket = mutation({
  args: { id: v.optional(v.id("buckets")), name: v.string(), description: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, ...bucket }) => {
    if (!id) return void (await ctx.db.insert("buckets", { userId: ctx.me._id, ...bucket }));
    if ((await ctx.db.get(id))?.userId !== ctx.me._id) throw new ConvexError("Not found");
    await ctx.db.patch(id, bucket);
  },
});

export const removeBucket = mutation({
  args: { id: v.id("buckets") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if ((await ctx.db.get(id))?.userId !== ctx.me._id) throw new ConvexError("Not found");
    await ctx.db.delete(id);
    const rows = await ctx.db
      .query("members")
      .withIndex("bucket", (q) => q.eq("bucketId", id))
      .collect();
    for (const row of rows) {
      await ctx.db.patch(row._id, { bucketId: undefined });
      await ctx.scheduler.runAfter(0, internal.ai.sort, { memberId: row._id });
    }
  },
});
