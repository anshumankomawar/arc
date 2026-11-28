import { useMutation } from "convex/react";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import { Button } from "@ui-sdk/react/button";
import { Dialog, DialogContent, DialogTitle } from "@ui-sdk/react/dialog";
import { formatFileSize } from "@ui-sdk/react/file-input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/react/menu";
import { usePreference } from "@ui-sdk/react/preferences";
import { useShortcut } from "@ui-sdk/react/shortcuts";
import { createTokenInputController } from "@ui-sdk/react/token-input";
import { Toolbar, ToolbarButton } from "@ui-sdk/react/toolbar";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  api,
  useEdit,
  useFiles,
  useMark,
  useMe,
  useNames,
  useReact,
  useRemoveMessage,
  useSend,
  type Attached,
  type Id,
  type Message,
} from "./data";
import { Face } from "./Face";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { ContextMenu, type MenuEntry } from "./Menu";
import { kindOf, MessageBox, typeOf } from "./MessageBox";
import { editDraft, go, previews, removeDraft, useUI, type Draft } from "./state";
import { clock, day, full } from "./time";

const PAGE = 30;
const GAP = 5 * 60_000;
const EMOJI = ["👍", "❤️", "😂", "🎉", "👀", "🙏", "✅", "🔥"];

type File = Message["files"][number];

function Shot(props: { id: Id<"files"> | Id<"links">; alt: string; style?: CSSProperties }) {
  const { bytes } = useFiles();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let made = "";
    let gone = false;
    void bytes(props.id).then(
      (loaded) => gone || setUrl((made = URL.createObjectURL(new Blob([loaded])))),
      () => {},
    );
    return () => {
      gone = true;
      URL.revokeObjectURL(made);
    };
  }, [props.id]);
  return url ? (
    <img className="shot" src={url} alt={props.alt} style={props.style} />
  ) : (
    <div className="shot" style={props.style} />
  );
}

function Viewer({ file, onClose }: { file: File; onClose: () => void }) {
  const { download } = useFiles();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="panel viewer">
        <header>
          <DialogTitle className="clip">{file.name}</DialogTitle>
          <small>{formatFileSize(file.size)}</small>
          <Button aria-label={`Download ${file.name}`} onClick={() => void download(file)}>
            <Icon name="download" />
          </Button>
          <Button aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </Button>
        </header>
        <Shot id={file._id} alt={file.name} />
      </DialogContent>
    </Dialog>
  );
}

function Attachments(props: {
  files: File[];
  shown: boolean;
  entries: MenuEntry[];
  onView: (file: File) => void;
}) {
  const { preview, download } = useFiles();
  const images = props.shown ? props.files.filter((file) => file.thumb) : [];
  const others = props.files.filter((file) => !images.includes(file));
  const entries = (file: File): MenuEntry[] => [
    ...(window.desktop ? [{ label: "Preview", run: () => void preview(file) }] : []),
    { label: "Download", run: () => void download(file) },
    { label: "Copy Name", run: () => void navigator.clipboard.writeText(file.name) },
    ...props.entries,
  ];

  return (
    <>
      {images.length > 0 && (
        <div className="gallery" data-single={images.length === 1 || undefined}>
          {images.map((file) => (
            <ContextMenu key={file._id} entries={entries(file)}>
              <Button
                className="look"
                aria-label={`View ${file.name}`}
                onClick={() => props.onView(file)}
              >
                <Shot
                  id={file.thumb!.id}
                  alt=""
                  style={
                    images.length === 1
                      ? { aspectRatio: `${file.thumb!.width} / ${file.thumb!.height}` }
                      : undefined
                  }
                />
              </Button>
            </ContextMenu>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="cards">
          {others.map((file) => (
            <ContextMenu key={file._id} entries={entries(file)}>
              <div className="attachment" title={`${file.name}, ${formatFileSize(file.size)}`}>
                {props.shown && file.snippet && <pre className="snippet">{file.snippet}</pre>}
                <Button className="open" onClick={() => void preview(file)}>
                  <span className="kind" style={{ color: `var(--${kindOf(file.name)})` }}>
                    <Icon name={kindOf(file.name)} size={18} />
                  </span>
                  <span className="clip">
                    <b className="clip">{file.name}</b>
                    <small>{typeOf(file.name)}</small>
                  </span>
                </Button>
                <Toolbar className="actions" aria-label="File actions">
                  <ToolbarButton
                    aria-label={`Download ${file.name}`}
                    onClick={() => void download(file)}
                  >
                    <Icon name="download" />
                  </ToolbarButton>
                </Toolbar>
              </div>
            </ContextMenu>
          ))}
        </div>
      )}
    </>
  );
}

function Compose({ above, ...props }: Parameters<typeof MessageBox>[0] & { above?: ReactNode }) {
  const me = useMe()!;
  return (
    <section className="turn">
      <Face id={me._id} />
      <div>
        <div className="meta">
          <b>{me.name}</b>
        </div>
        {above}
        <MessageBox {...props} />
      </div>
    </section>
  );
}

export function DraftView({ draft }: { draft: Draft }) {
  const start = useMutation(api.threads.start);
  const send = async (body: string, files: Attached[]) => {
    removeDraft(draft.id);
    go({ thread: await start({ body, files }) });
  };
  return (
    <main className="thread">
      <article style={{ zoom: `${useUI((ui) => ui.scale)}%` }}>
        <Compose
          key={draft.id}
          label="Draft"
          mustMention
          placeholder="Write a message, @mention who it's for"
          defaultText={draft.text}
          onSend={(body, files) => void send(body, files)}
          onChange={(text) => editDraft(draft.id, text)}
        />
      </article>
    </main>
  );
}

export function Thread({ threadId }: { threadId: Id<"threads"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.threads.messages,
    { threadId },
    { initialNumItems: PAGE },
  );
  const messages = [...results].reverse();
  const row = useQuery(api.threads.row, { threadId });
  const [since, setSince] = useState<{ threadId: Id<"threads">; at?: number }>();
  if (row && since?.threadId !== threadId)
    setSince({ threadId, at: row.unread ? (row.seenAt ?? 0) : undefined });
  const height = useRef(0);
  const { name, text } = useNames();
  const send = useSend();
  const edit = useEdit();
  const react = useReact();
  const removeMessage = useRemoveMessage();
  const me = useMe();
  const [editing, setEditing] = useState<Id<"messages">>();
  const [viewing, setViewing] = useState<File>();
  const [arming, setArming] = useState<Id<"messages">>();
  const [replying, setReplying] = useState<Message>();
  if (replying && replying.threadId !== threadId) setReplying(undefined);
  const [flashed, setFlashed] = useState<Id<"messages">>();
  const answer = (message: Message) => {
    setReplying(message);
    reply.focus();
  };
  const jump = (id: Id<"messages">) => {
    document.getElementById(`m-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashed(id);
    setTimeout(() => setFlashed((now) => (now === id ? undefined : now)), 1600);
  };
  const mark = useMark();
  const shown = usePreference(previews).value === "on";
  const [reply] = useState(createTokenInputController);
  const scroller = useRef<HTMLElement>(null);

  const unseen = (message: Message) =>
    since?.at !== undefined && message._creationTime > since.at && message.authorId !== me?._id;
  const firstNew = messages.find(unseen);
  const turns = messages.reduce<{ messages: Message[]; day?: string; fresh: boolean }[]>(
    (turns, message, index) => {
      const previous = messages[index - 1];
      const today = day(message._creationTime);
      const newDay = !previous || day(previous._creationTime) !== today;
      const fresh = message === firstNew;
      if (
        newDay ||
        fresh ||
        previous.authorId !== message.authorId ||
        message._creationTime - previous._creationTime > GAP
      )
        turns.push({ messages: [message], day: newDay ? today : undefined, fresh });
      else turns.at(-1)!.messages.push(message);
      return turns;
    },
    [],
  );

  useShortcut("r", () => reply.focus(), { description: "Reply" });
  useShortcut(arming ? "escape" : null, () => setArming(undefined), {
    allowInInput: true,
    description: "Cancel delete",
  });
  useEffect(() => {
    if (row?.unread) void mark({ threadId, unread: false });
  }, [threadId, row?.unread, mark]);
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [threadId, results[0]?._id]);
  useLayoutEffect(() => {
    const thread = scroller.current;
    if (thread && height.current) thread.scrollTop += thread.scrollHeight - height.current;
    height.current = 0;
  }, [results.length]);
  const earlier = () => {
    height.current = scroller.current!.scrollHeight;
    loadMore(PAGE);
  };

  const own = (message: Message) => message.authorId === me?._id;
  const editable = (message: Message) => own(message) && !!message.body;
  const removable = (message: Message) =>
    own(message) && (messages.length > 1 || status === "CanLoadMore");
  const mine = (message: Message): MenuEntry[] =>
    own(message)
      ? [
          "separator",
          ...(editable(message)
            ? [{ label: "Edit Message", run: () => setEditing(message._id) }]
            : []),
          ...(removable(message)
            ? [{ label: "Delete Message", run: () => setArming(message._id) }]
            : []),
        ]
      : [];
  const toggle = (message: Message, emoji: string) => void react({ messageId: message._id, emoji });

  const scale = useUI((ui) => ui.scale);
  if (status === "LoadingFirstPage") return <main className="thread" />;

  return (
    <main ref={scroller} className="thread">
      <article style={{ zoom: `${scale}%` }}>
        {status === "CanLoadMore" && (
          <Button className="earlier" onClick={earlier}>
            Earlier Messages
          </Button>
        )}
        {turns.map((turn) => (
          <div key={turn.messages[0]._id} className="group">
            {turn.day && (
              <div className="divider">
                <span>{turn.day}</span>
              </div>
            )}
            {turn.fresh && (
              <div className="divider new">
                <span>New</span>
              </div>
            )}
            <section className="turn">
              <Face id={turn.messages[0].authorId} />
              <div>
                <div className="meta">
                  <b>{name(turn.messages[0].authorId)}</b>
                  <time title={full(turn.messages[0]._creationTime)}>
                    {clock(turn.messages[0]._creationTime)}
                  </time>
                </div>
                {turn.messages.map((message, index) => (
                  <div
                    key={message._id}
                    id={`m-${message._id}`}
                    className="message"
                    data-editing={editing === message._id || undefined}
                    data-flashed={flashed === message._id || undefined}
                    onMouseLeave={() => arming === message._id && setArming(undefined)}
                  >
                    {index > 0 && (
                      <time className="stamp" title={full(message._creationTime)}>
                        {clock(message._creationTime)}
                      </time>
                    )}
                    {message.replyTo && (
                      <Button
                        className="quote"
                        disabled={!message.quoted}
                        onClick={() => message.quoted && jump(message.quoted._id)}
                      >
                        <Icon name="reply" size={13} />
                        {message.quoted ? (
                          <>
                            <b>{name(message.quoted.authorId)}</b>
                            <span className="clip">{text(message.quoted.body)}</span>
                          </>
                        ) : (
                          <span className="clip">The original message was deleted</span>
                        )}
                      </Button>
                    )}
                    {editing === message._id ? (
                      <MessageBox
                        label="Edit Message"
                        placeholder="Edit message"
                        defaultText={message.body}
                        onCancel={() => setEditing(undefined)}
                        onSend={(body) => {
                          setEditing(undefined);
                          void edit({ messageId: message._id, body });
                        }}
                      />
                    ) : (
                      message.body && (
                        <ContextMenu
                          entries={[
                            {
                              label: "Copy",
                              run: () =>
                                void navigator.clipboard.writeText(
                                  getSelection()?.toString() || text(message.body),
                                ),
                            },
                            { label: "Reply", run: () => answer(message) },
                            {
                              label: "Add Reaction",
                              items: EMOJI.map((emoji) => ({
                                label: emoji,
                                run: () => toggle(message, emoji),
                              })),
                            },
                            ...mine(message),
                          ]}
                        >
                          <div className="text">
                            <Markdown
                              body={message.body}
                              after={message.editedAt && <small className="edited">(edited)</small>}
                            />
                          </div>
                        </ContextMenu>
                      )
                    )}
                    {message.files.length > 0 && (
                      <Attachments
                        files={message.files}
                        shown={shown}
                        entries={mine(message)}
                        onView={setViewing}
                      />
                    )}
                    {shown &&
                      message.links.map((link) => (
                        <a
                          key={link._id}
                          className="unfurl"
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <small>{link.site}</small>
                          <b>{link.title}</b>
                          {link.description}
                          {link.image && <Shot id={link._id} alt="" />}
                        </a>
                      ))}
                    {message.reactions.length > 0 && (
                      <div className="reactions">
                        {message.reactions.map(({ emoji, userIds }) => (
                          <Button
                            key={emoji}
                            className="reaction"
                            aria-pressed={userIds.includes(me!._id)}
                            title={userIds.map(name).join(", ")}
                            onClick={() => toggle(message, emoji)}
                          >
                            {emoji}
                            <small>{userIds.length}</small>
                          </Button>
                        ))}
                      </div>
                    )}
                    {editing !== message._id && (
                      <Toolbar className="actions" aria-label="Message actions">
                        <Menu onAction={(emoji) => toggle(message, emoji)}>
                          <MenuTrigger render={<ToolbarButton aria-label="Add Reaction" />}>
                            <Icon name="smile" />
                          </MenuTrigger>
                          <MenuContent className="panel menu emoji" align="end" sideOffset={4}>
                            {EMOJI.map((emoji) => (
                              <MenuItem key={emoji} value={emoji} label={emoji}>
                                {emoji}
                              </MenuItem>
                            ))}
                          </MenuContent>
                        </Menu>
                        <ToolbarButton aria-label="Reply" onClick={() => answer(message)}>
                          <Icon name="reply" />
                        </ToolbarButton>
                        {editable(message) && (
                          <ToolbarButton
                            aria-label="Edit Message"
                            onClick={() => setEditing(message._id)}
                          >
                            <Icon name="pencil" />
                          </ToolbarButton>
                        )}
                        {removable(message) && (
                          <ToolbarButton
                            className="delete"
                            data-armed={arming === message._id || undefined}
                            aria-label={
                              arming === message._id ? "Confirm Delete" : "Delete Message"
                            }
                            ref={(button) => {
                              if (arming === message._id) button?.focus();
                            }}
                            onClick={() => {
                              if (arming !== message._id) return setArming(message._id);
                              setArming(undefined);
                              void removeMessage({ messageId: message._id });
                            }}
                          >
                            <Icon name="trash" />
                            <span className="confirm">Delete</span>
                          </ToolbarButton>
                        )}
                      </Toolbar>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        ))}
        <Compose
          key={threadId}
          input={reply}
          label="Reply"
          placeholder="Reply, @mention someone to bring them in"
          above={
            replying && (
              <div className="replying">
                <Button className="quote" onClick={() => jump(replying._id)}>
                  <Icon name="reply" size={13} />
                  Replying to <b>{name(replying.authorId)}</b>
                  <span className="clip">{text(replying.body)}</span>
                </Button>
                <Button aria-label="Cancel Reply" onClick={() => setReplying(undefined)}>
                  <Icon name="close" size={13} />
                </Button>
              </div>
            )
          }
          onSend={(body, files) => {
            setReplying(undefined);
            void send({ threadId, body, files, replyTo: replying?._id });
          }}
        />
      </article>
      {viewing && <Viewer file={viewing} onClose={() => setViewing(undefined)} />}
    </main>
  );
}
