import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { listOf, world } from "./world";

test("a new account has buckets and no workspace until it creates one", async () => {
  const { signIn } = world();
  const ada = await signIn("ada");
  expect(await ada.query(api.workspace.me)).not.toHaveProperty("workspaceId");
  await expect(ada.query(api.threads.inbox)).rejects.toThrow();

  await ada.mutation(api.workspace.create, { name: "Acme" });
  expect(await ada.query(api.workspace.me)).toMatchObject({ workspace: "Acme" });
  expect(await ada.query(api.workspace.buckets)).toMatchObject([
    { name: "Reviews" },
    { name: "Requests" },
    { name: "Social" },
  ]);
});

test("an invite link brings someone into its workspace, and nothing else does", async () => {
  const { t, signIn, signUp } = world();
  const ada = await signUp("ada");
  const grace = await signUp("grace", ada);
  expect(grace.workspaceId).toBe(ada.workspaceId);
  expect(await ada.as.query(api.workspace.people)).toMatchObject([
    { name: "ada" },
    { name: "grace" },
  ]);

  const link = await ada.as.mutation(api.workspace.inviteLink);
  expect(await t.query(api.workspace.invited, { invite: link.split("/").pop()! })).toBe(
    "ada's workspace",
  );
  expect(await t.query(api.workspace.invited, { invite: "guess" })).toBeNull();

  const linus = await signIn("linus");
  expect(await linus.mutation(api.workspace.join, { link: "arc://join/guess" })).toBe(false);
  expect(await linus.mutation(api.workspace.join, { link: "" })).toBe(false);
  expect(await linus.query(api.workspace.me)).not.toHaveProperty("workspaceId");
});

test("someone can be in several workspaces and switch between them", async () => {
  const { signUp } = world();
  const ada = await signUp("ada");
  const eve = await signUp("eve");
  await eve.as.mutation(api.workspace.join, {
    link: await ada.as.mutation(api.workspace.inviteLink),
  });
  expect(await eve.as.query(api.workspace.me)).toMatchObject({ workspace: "ada's workspace" });
  expect(await eve.as.query(api.workspace.workspaces)).toMatchObject([
    { name: "eve's workspace", people: 1 },
    { name: "ada's workspace", people: 2 },
  ]);

  await eve.as.mutation(api.workspace.open, { id: eve.workspaceId! });
  expect(await eve.as.query(api.workspace.me)).toMatchObject({ workspace: "eve's workspace" });
  expect(await eve.as.query(api.workspace.people)).toMatchObject([{ name: "eve" }]);
  await expect(ada.as.mutation(api.workspace.open, { id: eve.workspaceId! })).rejects.toThrow();
});

test("an invitation by email waits for that person, who joins or declines it", async () => {
  const { signUp } = world();
  const ada = await signUp("ada");
  const eve = await signUp("eve");
  const linus = await signUp("linus");
  await ada.as.mutation(api.workspace.invite, {
    emails: ["Eve@acme.com", "linus@acme.com", "ada@acme.com", "not an email"],
  });
  expect(await ada.as.query(api.workspace.pending)).toMatchObject([
    { email: "eve@acme.com" },
    { email: "linus@acme.com" },
  ]);

  const [invitation] = await eve.as.query(api.workspace.invitations);
  expect(invitation).toMatchObject({ workspace: "ada's workspace", from: "ada" });
  await expect(linus.as.mutation(api.workspace.accept, { id: invitation._id })).rejects.toThrow();
  await eve.as.mutation(api.workspace.accept, { id: invitation._id });
  expect(await eve.as.query(api.workspace.me)).toMatchObject({ workspace: "ada's workspace" });

  const [other] = await linus.as.query(api.workspace.invitations);
  await linus.as.mutation(api.workspace.decline, { id: other._id });
  expect(await ada.as.query(api.workspace.pending)).toEqual([]);
  expect(await ada.as.query(api.workspace.people)).toMatchObject([
    { name: "ada", role: "owner" },
    { name: "eve", role: "member" },
  ]);
});

test("leaving or being removed takes someone out, and the last one out deletes it", async () => {
  const { signUp } = world();
  const ada = await signUp("ada");
  const grace = await signUp("grace", ada);
  const linus = await signUp("linus", ada);
  await expect(
    grace.as.mutation(api.workspace.removePerson, { userId: linus._id }),
  ).rejects.toThrow();
  await ada.as.mutation(api.workspace.removePerson, { userId: linus._id });
  await expect(linus.as.mutation(api.workspace.leave, { id: ada.workspaceId! })).rejects.toThrow();
  await expect(listOf(linus)).rejects.toThrow();

  await ada.as.mutation(api.workspace.leave, { id: ada.workspaceId! });
  expect(await ada.as.query(api.workspace.me)).not.toHaveProperty("workspaceId");
  expect(await grace.as.query(api.workspace.people)).toMatchObject([
    { name: "grace", role: "owner" },
  ]);
  expect(await grace.as.query(api.workspace.workspaces)).toMatchObject([{ people: 1 }]);

  await grace.as.mutation(api.workspace.removeWorkspace);
  expect(await grace.as.query(api.workspace.workspaces)).toEqual([]);
});
