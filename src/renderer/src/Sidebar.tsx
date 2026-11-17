import { Button } from "@ui-sdk/react/button";
import { Listbox, ListboxItem } from "@ui-sdk/react/listbox";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
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
  useThreads,
  useWorkspaces,
  type Id,
} from "./data";
import { Icon, type IconName } from "./Icon";
import { Identicon } from "./Identicon";
import { ContextMenu, type MenuEntry } from "./Menu";
import { go, setDialog, switched, useView, type Box } from "./state";

function Switcher() {
  const me = useMe()!;
  const workspaces = useWorkspaces();
  const invitations = useInvitations();
  const open = useMutation(api.workspace.open);
  const accept = useMutation(api.workspace.accept);
  const decline = useMutation(api.workspace.decline);
  const run = (value: string) => {
    const [action, id] = value.split(" ") as [string, Id<"invitations">];
    if (action === "accept") void accept({ id }).then(() => switched());
    if (action === "decline") void decline({ id });
  };

  return (
    <Menu onAction={run}>
      <MenuTrigger render={<Button className="switcher" />}>
        <span className="clip">{me.workspace}</span>
        {invitations.length > 0 && <span className="dot" />}
      </MenuTrigger>
      <MenuContent className="panel menu" align="start" sideOffset={4}>
        <MenuRadioGroup
          value={me.workspaceId}
          onValueChange={(id) => void open({ id: id as Id<"workspaces"> }).then(() => switched())}
        >
          <MenuGroupLabel>Workspaces</MenuGroupLabel>
          {workspaces.map((workspace) => (
            <MenuRadioItem key={workspace._id} value={workspace._id}>
              <span className="clip">{workspace.name}</span>
              <MenuItemIndicator>✓</MenuItemIndicator>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        {invitations.length > 0 && (
          <MenuGroup>
            <MenuSeparator />
            <MenuGroupLabel>Invitations · {invitations.length}</MenuGroupLabel>
            {invitations.map((invitation) => (
              <MenuSub key={invitation._id}>
                <MenuSubTrigger>
                  <span className="clip">{invitation.workspace}</span>
                  <small>from {invitation.from}</small>
                </MenuSubTrigger>
                <MenuSubContent className="panel menu">
                  <MenuItem value={`accept ${invitation._id}`}>Join</MenuItem>
                  <MenuItem value={`decline ${invitation._id}`}>Decline</MenuItem>
                </MenuSubContent>
              </MenuSub>
            ))}
          </MenuGroup>
        )}
      </MenuContent>
    </Menu>
  );
}

export function Sidebar() {
  const me = useMe()!;
  const view = useView();
  const rows = useThreads();
  const buckets = useBuckets();
  const removeBucket = useRemoveBucket();
  const editBuckets: MenuEntry = {
    label: "Edit Buckets",
    run: () => setDialog("settings", "Buckets"),
  };

  const row = (
    box: Box,
    label: string,
    icon: IconName,
    count?: number,
    entries: MenuEntry[] = [editBuckets],
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
      <Switcher />
      <Listbox
        aria-label="Mailboxes"
        value={view.box}
        onValueChange={(box) => box && go({ box, thread: undefined })}
      >
        {row("all", "All Threads", "archive")}
        {row("sent", "Sent", "sent")}
        {row("drafts", "Drafts", "draft")}
        {row("inbox", "Buckets", "inbox", count("inbox"))}
        {buckets.map((bucket) =>
          row(
            bucket._id,
            bucket.name,
            "folder",
            count(bucket._id),
            [
              editBuckets,
              "separator",
              { label: "Delete Bucket", run: () => void removeBucket(bucket) },
            ],
            true,
          ),
        )}
      </Listbox>
      <Button className="profile" onClick={() => setDialog("settings")}>
        <Identicon seed={me._id} size={20} />
        <span className="clip">{me.name}</span>
      </Button>
    </aside>
  );
}
