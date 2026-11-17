import { Button } from "@ui-sdk/react/button";
import { Listbox, ListboxItem } from "@ui-sdk/react/listbox";
import { inBox, useBuckets, useMe, useRemoveBucket, useThreads } from "./data";
import { Icon, type IconName } from "./Icon";
import { Identicon } from "./Identicon";
import { ContextMenu, type MenuEntry } from "./Menu";
import { go, setDialog, useView, type Box } from "./state";

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
