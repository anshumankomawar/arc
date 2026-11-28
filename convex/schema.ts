import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    image: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
  }).index("email", ["email"]),

  workspaces: defineTable({
    name: v.string(),
    people: v.number(),
    invite: v.optional(v.string()),
  }).index("invite", ["invite"]),

  memberships: defineTable({
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
    role: v.union(v.literal("owner"), v.literal("member")),
  })
    .index("user", ["userId"])
    .index("workspace", ["workspaceId", "userId"]),

  invitations: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    invitedBy: v.id("users"),
  })
    .index("email", ["email"])
    .index("workspace", ["workspaceId", "email"]),

  groups: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    userIds: v.array(v.id("users")),
  }).index("workspace", ["workspaceId"]),

  threads: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    lastAuthorId: v.id("users"),
    lastBody: v.string(),
  }).index("workspace", ["workspaceId"]),

  messages: defineTable({
    workspaceId: v.id("workspaces"),
    threadId: v.id("threads"),
    authorId: v.id("users"),
    body: v.string(),
    replyTo: v.optional(v.id("messages")),
    editedAt: v.optional(v.number()),
  })
    .index("thread", ["threadId"])
    .searchIndex("search", { searchField: "body", filterFields: ["workspaceId"] }),

  files: defineTable({
    workspaceId: v.id("workspaces"),
    threadId: v.id("threads"),
    messageId: v.id("messages"),
    storageId: v.id("_storage"),
    name: v.string(),
    size: v.number(),
    hidden: v.optional(v.boolean()),
    snippet: v.optional(v.string()),
    thumb: v.optional(v.object({ id: v.id("files"), width: v.number(), height: v.number() })),
  })
    .index("thread", ["threadId"])
    .index("message", ["messageId"])
    .index("storage", ["storageId"])
    .index("workspace", ["workspaceId"]),

  links: defineTable({
    workspaceId: v.id("workspaces"),
    threadId: v.id("threads"),
    messageId: v.id("messages"),
    url: v.string(),
    title: v.string(),
    description: v.string(),
    site: v.string(),
    storageId: v.optional(v.id("_storage")),
  })
    .index("thread", ["threadId"])
    .index("message", ["messageId"]),

  vectors: defineTable({
    workspaceId: v.id("workspaces"),
    threadId: v.id("threads"),
    messageId: v.id("messages"),
    vector: v.array(v.float64()),
  })
    .index("thread", ["threadId"])
    .index("message", ["messageId"])
    .vectorIndex("near", {
      vectorField: "vector",
      dimensions: 1024,
      filterFields: ["workspaceId"],
    }),

  members: defineTable({
    workspaceId: v.id("workspaces"),
    threadId: v.id("threads"),
    userId: v.id("users"),
    activeAt: v.number(),
    inbox: v.boolean(),
    unread: v.boolean(),
    sent: v.boolean(),
    seenAt: v.optional(v.number()),
    bucketId: v.optional(v.id("buckets")),
  })
    .index("user", ["userId", "workspaceId", "activeAt"])
    .index("inbox", ["userId", "workspaceId", "inbox", "activeAt"])
    .index("sent", ["userId", "workspaceId", "sent", "activeAt"])
    .index("bucket", ["bucketId"])
    .index("thread", ["threadId", "userId"]),

  reactions: defineTable({
    workspaceId: v.id("workspaces"),
    threadId: v.id("threads"),
    messageId: v.id("messages"),
    userId: v.id("users"),
    emoji: v.string(),
  })
    .index("thread", ["threadId"])
    .index("message", ["messageId", "emoji", "userId"]),

  buckets: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.string(),
  }).index("user", ["userId"]),
});
