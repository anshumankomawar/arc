import { Button } from "@ui-sdk/react/button";
import { Listbox, ListboxItem } from "@ui-sdk/react/listbox";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/react/menu";
import { useMutation } from "convex/react";
import {
  api,
  inBox,
  useBuckets,
  useInvitations,
  useMe,
  useRemoveBucket,
  useInbox,
  useMark,
  useWorkspaces,
  type Id,
} from "./data";
import { Icon, type IconName } from "./Icon";
import { Face } from "./Face";
import { ContextMenu, type MenuEntry } from "./Menu";
import { go, setDialog, switched, useView, type Box } from "./state";

function Switcher() {
  const me = useMe()!;
  const workspaces = useWorkspaces();
  const { invitations, accept, decline } = useInvitations();
  const open = useMutation(api.workspace.open);
  const run = (value: string) => {
    const [action, id] = value.split(" ");
    if (action === "open") void open({ id: id as Id<"workspaces"> }).then(() => switched());
    if (action === "accept") void accept({ id: id as Id<"invitations"> }).then(() => switched());
    if (action === "decline") void decline({ id: id as Id<"invitations"> });
  };

  const others = workspaces.filter((workspace) => workspace._id !== me.workspaceId);
  if (!others.length && !invitations.length)
    return <span className="switcher clip">{me.workspace}</span>;

  return (
    <Menu onAction={run}>
      <MenuTrigger render={<Button className="switcher" />}>
        <span className="clip">{me.workspace}</span>
        {invitations.length > 0 && <span className="count">{invitations.length}</span>}
        <Icon name="chevron" />
      </MenuTrigger>
      <MenuContent
        className="panel menu workspaces"
        align="start"
        sideOffset={0}
        collisionPadding={0}
      >
        {others.map((workspace) => (
          <MenuItem key={workspace._id} value={`open ${workspace._id}`} label={workspace.name}>
            <span className="clip">{workspace.name}</span>
          </MenuItem>
        ))}
        {invitations.map((invitation, index) => (
          <MenuGroup key={invitation._id}>
            {(index > 0 || others.length > 0) && <MenuSeparator />}
            <MenuGroupLabel>
              {invitation.from} invited you to {invitation.workspace}
            </MenuGroupLabel>
            <MenuItem value={`accept ${invitation._id}`}>Join {invitation.workspace}</MenuItem>
            <MenuItem value={`decline ${invitation._id}`}>Decline</MenuItem>
          </MenuGroup>
        ))}
      </MenuContent>
    </Menu>
  );
}

export function Sidebar() {
  const me = useMe()!;
  const view = useView();
  const rows = useInbox();
  const buckets = useBuckets();
  const removeBucket = useRemoveBucket();
  const mark = useMark();
  const compose: MenuEntry[] = [{ label: "New Message", run: () => setDialog("new") }];
  const editBuckets: MenuEntry = {
    label: "Edit Buckets",
    run: () => setDialog("settings", "Buckets"),
  };
  const markRead = (box: Box): MenuEntry[] => {
    const unread = inBox(rows, box).filter((row) => row.unread);
    if (!unread.length) return [];
    const run = () => unread.forEach(({ threadId }) => void mark({ threadId, unread: false }));
    return [{ label: "Mark All as Read", run }, "separator"];
  };

  const row = (
    box: Box,
    label: string,
    icon: IconName,
    count: number | undefined,
    entries: MenuEntry[],
    nested = false,
  ) => (
    <ContextMenu key={box} entries={entries}>
      <ListboxItem value={box} label={label} className={nested ? "box nested" : "box"}>
        <Icon name={icon} color={`var(--${icon})`} />
        <span className="clip">{label}</span>
        {count !== undefined && <span className="count">{count}</span>}
      </ListboxItem>
    </ContextMenu>
  );
  const count = (box: Box) => inBox(rows, box).length;

  return (
    <aside className="sidebar">
      <div className="head">
        <Switcher />
        <Button className="compose" aria-label="New Message" onClick={() => setDialog("new")}>
          <Icon name="compose" />
        </Button>
      </div>
      <Listbox
        aria-label="Mailboxes"
        value={view.box}
        onValueChange={(box) => box && go({ box, thread: undefined })}
      >
        {row("all", "All Threads", "archive", undefined, compose)}
        {row("sent", "Sent", "sent", undefined, compose)}
        {row("drafts", "Drafts", "draft", undefined, compose)}
        {row("inbox", "Buckets", "inbox", count("inbox"), [...markRead("inbox"), editBuckets])}
        {buckets.map((bucket) =>
          row(
            bucket._id,
            bucket.name,
            "folder",
            count(bucket._id),
            [
              ...markRead(bucket._id),
              editBuckets,
              "separator",
              { label: "Delete Bucket", run: () => void removeBucket(bucket) },
            ],
            true,
          ),
        )}
      </Listbox>
      <Button className="profile" onClick={() => setDialog("settings")}>
        <Face id={me._id} size={20} />
        <span className="clip">{me.name}</span>
      </Button>
    </aside>
  );
}
