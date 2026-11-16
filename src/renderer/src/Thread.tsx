import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { Button } from "@ui-sdk/react/button";
import { formatFileSize } from "@ui-sdk/react/file-input";
import { useShortcut } from "@ui-sdk/react/shortcuts";
import { createTokenInputController } from "@ui-sdk/react/token-input";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  api,
  parts,
  useDownload,
  useMark,
  useMe,
  useNames,
  useSend,
  useThreads,
  type Attached,
  type Id,
} from "./data";
import { Icon } from "./Icon";
import { Identicon } from "./Identicon";
import { MessageBox } from "./MessageBox";
import { editDraft, go, removeDraft, useUI, type Draft } from "./state";
import { ago } from "./time";

function Body({ body }: { body: string }) {
  const { name } = useNames();
  return parts(body).map((part, index) =>
    typeof part === "string" ? (
      part
    ) : (
      <span key={index} className="mention">
        @{name(part.id)}
      </span>
    ),
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
  const messages = useQuery(api.threads.messages, { threadId }) ?? [];
  const unread = useThreads().find((row) => row.threadId === threadId)?.unread;
  const { name } = useNames();
  const send = useSend();
  const mark = useMark();
  const download = useDownload();
  const [reply] = useState(createTokenInputController);
  const turns = messages.reduce<(typeof messages)[]>((turns, message) => {
    if (turns.at(-1)?.[0].authorId === message.authorId) turns.at(-1)!.push(message);
    else turns.push([message]);
    return turns;
  }, []);
  const end = useRef<HTMLDivElement>(null);

  useShortcut("r", () => reply.focus(), { description: "Reply" });
  useEffect(() => {
    if (unread) void mark({ threadId, unread: false });
  }, [threadId, unread, mark]);
  useEffect(() => {
    void end.current?.scrollIntoView({ block: "end" });
  }, [threadId, messages.length]);

  return (
    <main className="thread">
      <article style={{ zoom: `${useUI((ui) => ui.scale)}%` }}>
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
                  <p className={message === messages[0] ? "text title" : "text"}>
                    <Body body={message.body} />
                  </p>
                  {message.files.map((file) => (
                    <Button key={file._id} className="file" onClick={() => void download(file)}>
                      <Icon name="attach" />
                      <span className="clip">{file.name}</span>
                      <small>{formatFileSize(file.size)}</small>
                    </Button>
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
        <div ref={end} />
      </article>
    </main>
  );
}
