import { useAuthActions } from "@convex-dev/auth/react";
import { usePreference } from "@ui-sdk/react/preferences";
import { registerShortcut } from "@ui-sdk/react/shortcuts";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import {
  api,
  sections,
  useBuckets,
  useCopyInvite,
  useDeleteWorkspace,
  useInvitations,
  useLeaveWorkspace,
  useMark,
  useMe,
  useWorkspaces,
  type Row,
} from "./data";
import {
  back,
  choices,
  forward,
  go,
  reset,
  resetScale,
  scaleBy,
  setDialog,
  switched,
  toggleSidebar,
  useView,
} from "./state";

export type Command = { label: string; run: () => unknown; keys: string[]; words?: string };

const command = (label: string, run: () => unknown, ...keys: string[]): Command => ({
  label,
  run,
  keys,
});

export function useCommands(rows: Row[]): Command[] {
  const me = useMe();
  const view = useView();
  const buckets = useBuckets();
  const workspaces = useWorkspaces();
  const { invitations, accept, decline } = useInvitations();
  const open = useMutation(api.workspace.open);
  const mark = useMark();
  const copyInvite = useCopyInvite();
  const leave = useLeaveWorkspace();
  const remove = useDeleteWorkspace();
  const { signOut } = useAuthActions();
  for (const { preference } of choices) usePreference(preference);

  const threadId = view.thread;
  const order = sections(rows, view.box, buckets).flatMap((section) => section.rows);
  const at = order.findIndex((row) => row.threadId === threadId);
  const openAt = (index: number) => {
    const row = order[Math.max(0, Math.min(order.length - 1, index))];
    if (row) go({ thread: row.threadId });
  };
  const box = (label: string, to: string, ...keys: string[]) =>
    command(`Go to ${label}`, () => go({ box: to, thread: undefined }), ...keys);

  return [
    command("Write a new message", () => setDialog("new"), ...(window.desktop ? ["mod+n"] : [])),
    command("Search threads", () => setDialog("find"), "mod+f"),
    box("All Threads", "all"),
    box("Sent", "sent"),
    box("Drafts", "drafts"),
    box("Buckets", "inbox"),
    ...buckets.map((bucket, index) =>
      box(bucket.name, bucket._id, ...(index < 9 ? [`mod+${index + 1}`] : [])),
    ),
    ...(threadId
      ? [
          command(
            "Mark done",
            () => {
              void mark({ threadId, inbox: false });
              go({ thread: (order[at + 1] ?? order[at - 1])?.threadId });
            },
            "e",
            "mod+e",
          ),
          command(
            "Mark unread",
            () => {
              go({ thread: undefined });
              void mark({ threadId, unread: true });
            },
            "u",
          ),
        ]
      : []),
    command("Next thread", () => openAt(at + 1), "j"),
    command("Previous thread", () => openAt(at - 1), "k"),
    command("Back", back, "mod+["),
    command("Forward", forward, "mod+]"),
    command("Show or hide the sidebar", toggleSidebar, "mod+\\"),
    command("Larger thread text", () => scaleBy(10), "mod+="),
    command("Smaller thread text", () => scaleBy(-10), "mod+-"),
    command("Actual size", resetScale, "mod+0"),
    command("Open Settings", () => setDialog("settings"), "mod+,"),
    ...choices.flatMap(({ label: setting, preference, options }) =>
      Object.entries(options)
        .filter(([value]) => value !== preference.get().value)
        .map(([value, [, label]]) => ({
          ...command(label, () => preference.set(value)),
          words: [setting, ...Object.values(options).flatMap(([name, , words]) => [name, words])]
            .filter(Boolean)
            .join(" "),
        })),
    ),
    command("Edit buckets", () => setDialog("settings", "Buckets")),
    command("Edit groups", () => setDialog("settings", "Groups")),
    ...workspaces
      .filter((workspace) => workspace._id !== me?.workspaceId)
      .map((workspace) =>
        command(`Switch to ${workspace.name}`, () =>
          open({ id: workspace._id }).then(() => switched()),
        ),
      ),
    ...invitations.flatMap((invitation) => [
      command(`Join ${invitation.workspace}`, () =>
        accept({ id: invitation._id }).then(() => switched()),
      ),
      command(`Decline the invite to ${invitation.workspace}`, () =>
        decline({ id: invitation._id }),
      ),
    ]),
    command("New workspace", () => setDialog("workspace", "start")),
    command("Invite people", () => setDialog("settings", "Workspaces")),
    command("Copy the invite link", copyInvite),
    ...(me?.role === "owner"
      ? [
          command("Rename the workspace", () => setDialog("settings", "Workspaces")),
          command("Delete the workspace", remove),
        ]
      : []),
    command("Leave the workspace", leave),
    command("Sign out", () => signOut().then(reset)),
  ];
}

export function useCommandKeys(commands: Command[]) {
  const latest = useRef(commands);
  latest.current = commands;
  const keyed = commands.flatMap(({ label, keys }) => keys.map((key) => `${key} ${label}`));
  useEffect(() => {
    const stops = latest.current.flatMap(({ label, keys }) =>
      keys.map((key) =>
        registerShortcut(key, () => void latest.current.find((it) => it.label === label)?.run(), {
          description: label,
        }),
      ),
    );
    return () => stops.forEach((stop) => stop());
  }, [keyed.join("\n")]);
}
