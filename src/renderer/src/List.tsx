import { Listbox, ListboxGroup, ListboxGroupLabel, ListboxItem } from "@ui-sdk/react/listbox";
import { sections, useBuckets, useMark, useMove, useNames, useThreads, type Row } from "./data";
import { Icon } from "./Icon";
import { ContextMenu, type MenuEntry } from "./Menu";
import { go, removeDraft, useUI, useView } from "./state";
import { stamp } from "./time";

export function List() {
  const { box, thread, draft: open } = useView();
  const rows = useThreads();
  const buckets = useBuckets();
  const drafts = useUI((ui) => ui.drafts);
  const names = useNames();
  const mark = useMark();
  const move = useMove();
  const groups = sections(rows, box, buckets);
  const listed = groups.flatMap((group) => group.rows);
  const total = box === "drafts" ? drafts.length : listed.length;

  const entries = ({ threadId, inbox, bucketId }: Row): MenuEntry[] => [
    { label: "Open", run: () => go({ thread: threadId }) },
    "separator",
    inbox
      ? { label: "Done", run: () => void mark({ threadId, inbox: false }) }
      : { label: "Move to Buckets", run: () => void mark({ threadId, inbox: true }) },
    { label: "Mark Unread", run: () => void mark({ threadId, unread: true }) },
    "separator",
    ...buckets
      .filter((bucket) => bucket._id !== bucketId)
      .map((bucket) => ({
        label: `Move to ${bucket.name}`,
        run: () => void move({ threadId, bucketId: bucket._id }),
      })),
  ];
  const card = (row: Row) => (
    <ContextMenu key={row.threadId} entries={entries(row)}>
      <ListboxItem value={row.threadId} label={row.title} className="card">
        <span className="line">
          <b className="clip">{row.title}</b>
          {row.unread && <i className="unread" role="img" aria-label="Unread" />}
          <time>{stamp(row.activeAt)}</time>
        </span>
        <span className="preview clip">
          <b>{names.name(row.lastAuthorId)}</b> {names.text(row.lastBody)}
        </span>
      </ListboxItem>
    </ContextMenu>
  );

  return (
    <section className="list">
      {box === "drafts" ? (
        <Listbox
          aria-label="Drafts"
          className="scroll"
          value={open ?? null}
          onValueChange={(id) => id && go({ draft: id, thread: undefined })}
        >
          {drafts.map((draft) => (
            <ContextMenu
              key={draft.id}
              entries={[{ label: "Delete Draft", run: () => removeDraft(draft.id) }]}
            >
              <ListboxItem value={draft.id} className="card">
                <span className="line">
                  <b className="clip">{names.text(draft.text).split("\n")[0]}</b>
                  <time>{stamp(draft.at)}</time>
                </span>
              </ListboxItem>
            </ContextMenu>
          ))}
        </Listbox>
      ) : (
        <Listbox
          aria-label="Threads"
          className="scroll"
          value={thread ?? null}
          onValueChange={(threadId) => threadId && go({ thread: threadId })}
        >
          {groups.map((group) =>
            group.title ? (
              <ListboxGroup key={group.title}>
                <ListboxGroupLabel>
                  <Icon name="folder" color="var(--folder)" />
                  {group.title}
                  <small>{group.rows.length}</small>
                </ListboxGroupLabel>
                {group.rows.map(card)}
              </ListboxGroup>
            ) : (
              group.rows.map(card)
            ),
          )}
        </Listbox>
      )}
      {total === 0 && (
        <div className="empty">
          <Icon name="inbox" size={28} />
          <b>{box === "inbox" ? "All caught up" : "Nothing here"}</b>
          {box === "inbox" && "Nothing in your buckets needs you right now."}
        </div>
      )}
    </section>
  );
}
