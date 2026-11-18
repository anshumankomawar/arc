import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache";
import { Button } from "@ui-sdk/react/button";
import { usePreference } from "@ui-sdk/react/preferences";
import { useShortcut } from "@ui-sdk/react/shortcuts";
import { createTokenInputController } from "@ui-sdk/react/token-input";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  api,
  LINK,
  parts,
  useFiles,
  useMark,
  useMe,
  useNames,
  useSend,
  type Attached,
  type Id,
} from "./data";
import { Identicon } from "./Identicon";
import { ContextMenu } from "./Menu";
import { FileLabel, MessageBox } from "./MessageBox";
import { editDraft, go, previews, removeDraft, useUI, type Draft } from "./state";
import { ago } from "./time";

const PAGE = 30;

type Message = FunctionReturnType<typeof api.threads.messages>["page"][number];

function Body({ body }: { body: string }) {
  const { name } = useNames();
  const { download } = useFiles();
  return parts(body).map((part, index) =>
    typeof part === "string" ? (
      part.split(new RegExp(`(${LINK.source})`)).map((piece, at) =>
        at % 2 ? (
          <a key={at} href={piece} target="_blank" rel="noreferrer">
            {piece}
          </a>
        ) : (
          piece
        ),
      )
    ) : part.kind === "file" ? (
      <Button
        key={index}
        className="mention"
        onClick={() => void download({ _id: part.id as Id<"files">, name: name(part.id) })}
      >
        {name(part.id)}
      </Button>
    ) : (
      <span key={index} className="mention">
        @{name(part.id)}
      </span>
    ),
  );
}

function Shot(props: { id: Id<"files"> | Id<"links">; alt: string; style?: CSSProperties }) {
  const { bytes } = useFiles();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let made = "";
    void bytes(props.id).then(
      (loaded) => setUrl((made = URL.createObjectURL(new Blob([loaded])))),
      () => {},
    );
    return () => URL.revokeObjectURL(made);
  }, [props.id]);
  return url ? (
    <img className="shot" src={url} alt={props.alt} style={props.style} />
  ) : (
    <div className="shot" style={props.style} />
  );
}

function Sent({ file, shown }: { file: Message["files"][number]; shown: boolean }) {
  const { preview, download } = useFiles();
  const { width = 1, height = 1 } = file.thumb ?? {};
  const wide = Math.min(360, width, (240 * width) / height);
  const card = (
    <Button className="file" onClick={() => void download(file)}>
      <FileLabel {...file} />
    </Button>
  );
  return (
    <ContextMenu
      entries={[
        ...(window.desktop ? [{ label: "Preview", run: () => void preview(file) }] : []),
        { label: "Download", run: () => void download(file) },
        { label: "Copy Name", run: () => void navigator.clipboard.writeText(file.name) },
      ]}
    >
      {shown && (file.thumb || file.snippet) ? (
        <figure className="pictured" style={{ width: file.thumb ? Math.max(wide + 5, 180) : 360 }}>
          <Button
            className={file.thumb ? "look" : "look snippet"}
            aria-label={`Preview ${file.name}`}
            onClick={() => void preview(file)}
          >
            {file.thumb ? (
              <Shot
                id={file.thumb.id}
                alt=""
                style={{ width: wide, aspectRatio: `${width} / ${height}` }}
              />
            ) : (
              file.snippet
            )}
          </Button>
          {card}
        </figure>
      ) : (
        card
      )}
    </ContextMenu>
  );
}

function Compose(props: Parameters<typeof MessageBox>[0]) {
  const me = useMe()!;
  return (
    <section className="turn">
      <Identicon seed={me._id} />
      <div>
        <div className="meta">
          <b>{me.name}</b>
        </div>
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
          placeholder="Write a message, @mention who it's for, ⌘↵ to send"
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
  const unread = useQuery(api.threads.row, { threadId })?.unread;
  const height = useRef(0);
  const { name } = useNames();
  const send = useSend();
  const mark = useMark();
  const shown = usePreference(previews).value === "on";
  const [reply] = useState(createTokenInputController);
  const turns = messages.reduce<(typeof messages)[]>((turns, message) => {
    if (turns.at(-1)?.[0].authorId === message.authorId) turns.at(-1)!.push(message);
    else turns.push([message]);
    return turns;
  }, []);
  const scroller = useRef<HTMLElement>(null);

  useShortcut("r", () => reply.focus(), { description: "Reply" });
  useEffect(() => {
    if (unread) void mark({ threadId, unread: false });
  }, [threadId, unread, mark]);
  useEffect(() => {
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

  return (
    <main ref={scroller} className="thread">
      <article style={{ zoom: `${useUI((ui) => ui.scale)}%` }}>
        {status === "CanLoadMore" && (
          <Button className="earlier" onClick={earlier}>
            Earlier Messages
          </Button>
        )}
        {turns.map((turn) => (
          <section key={turn[0]._id} className="turn">
            <Identicon seed={turn[0].authorId} />
            <div>
              <div className="meta">
                <b>{name(turn[0].authorId)}</b>
                <time>{ago(turn[0]._creationTime)}</time>
              </div>
              {turn.map((message) => (
                <Fragment key={message._id}>
                  {message.body && (
                    <p className="text">
                      <Body body={message.body} />
                    </p>
                  )}
                  {message.files.length > 0 && (
                    <div className="files">
                      {message.files.map((file) => (
                        <Sent key={file._id} file={file} shown={shown} />
                      ))}
                    </div>
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
                </Fragment>
              ))}
            </div>
          </section>
        ))}
        <Compose
          key={threadId}
          input={reply}
          label="Reply"
          placeholder="Reply, @mention someone to bring them in, ⌘↵ to send"
          onSend={(body, files) => void send({ threadId, body, files })}
        />
      </article>
    </main>
  );
}
