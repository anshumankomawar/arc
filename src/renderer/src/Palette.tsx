import { useAsyncOptions } from "@ui-sdk/react/async-options";
import { fuzzyScore } from "@ui-sdk/core/text-match";
import { Command, CommandInput, CommandItem, CommandList } from "@ui-sdk/react/command";
import { Dialog, DialogContent, DialogTitle } from "@ui-sdk/react/dialog";
import { formatShortcut, useShortcut } from "@ui-sdk/react/shortcuts";
import { useAction, useConvex, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Command as Action } from "./commands";
import { api, useNames, useInbox, type Attached, type Row } from "./data";
import { Icon } from "./Icon";
import { MessageBox } from "./MessageBox";
import { addDraft, go, setDialog } from "./state";

const GROW = { duration: 260, easing: "cubic-bezier(0.32, 0.72, 0, 1)" };

function Modal(props: {
  title: string;
  grow?: boolean;
  busy?: boolean;
  onClose?: () => void;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const close = () => {
    props.onClose?.();
    setDialog(null);
  };
  useShortcut(props.onClose ? "mod+s" : null, close, { layer: content, description: "Save draft" });
  useLayoutEffect(() => {
    const panel = content.current;
    const field = props.grow && document.querySelector("[data-search]")?.getBoundingClientRect();
    if (!panel || !field) return;
    panel.style.left = `${field.left}px`;
    panel.style.top = `${field.top}px`;
    panel.style.width = `${field.width}px`;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const below = panel.getBoundingClientRect().height - field.height;
    panel.animate({ clipPath: [`inset(0 0 ${below}px 0)`, "inset(0 0 0 0)"] }, GROW);
  }, [props.grow]);

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        ref={content}
        className={props.grow ? "panel palette grow" : "panel palette"}
        data-busy={props.busy || undefined}
        initialFocus="input, [contenteditable]"
      >
        <DialogTitle className="hidden">{props.title}</DialogTitle>
        {props.children}
      </DialogContent>
    </Dialog>
  );
}

type Item = { value: string; label: string; hint?: string; words?: string; run: () => unknown };
type Hit = FunctionReturnType<typeof api.threads.search>[number];

export function Search({ threadsOnly, commands }: { threadsOnly?: boolean; commands: Action[] }) {
  const [text, setText] = useState("");
  const rows = useInbox();
  const names = useNames();
  const query = text.trim();
  const convex = useConvex();
  const related = useAction(api.search.related);
  const near = useAsyncOptions<Hit>(async (text) => {
    if (text.length < 2) return [];
    const worded = convex.query(api.threads.search, { text });
    return [...(await worded), ...(await related({ text }).catch(() => []))];
  });
  const ask = useAction(api.search.ask);
  const [found, setFound] = useState<Row[] | "asking">();
  const [highlight, setHighlight] = useState<string | null>(null);
  const asked = useRef("");

  const consult = async () => {
    asked.current = query;
    setFound("asking");
    const answer = await ask({ question: query }).catch(() => null);
    if (asked.current === query) setFound(answer ?? []);
  };

  const actions = commands.map(({ label, run, keys, words }): Item => ({
    value: label,
    label,
    hint: keys[0] && formatShortcut(keys[0]),
    words,
    run,
  }));
  const thread = (row: Row): Item => ({
    value: row.threadId,
    label: row.title,
    hint: names.text(row.lastBody),
    run: () => go({ thread: row.threadId }),
  });
  const threads = rows.map(thread);
  const hits = new Map(near.items.map((hit) => [hit._id, hit]));
  const messages = [...hits.values()].map((hit) => ({
    value: hit._id,
    label: names.text(hit.body),
    hint: hit.title,
    run: () => go({ thread: hit.threadId }),
  }));
  const local = threadsOnly ? threads : actions;
  const scored = local
    .map((item) => ({
      item,
      score: Math.max(
        fuzzyScore(item.label, query),
        item.words ? fuzzyScore(item.words, query) * 0.9 : 0,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
  const picked = Array.isArray(found) ? found.map(thread) : [];
  const items: Item[] = picked.length
    ? picked
    : !query
      ? local
      : threadsOnly
        ? [...scored, ...messages]
        : scored;
  const empty =
    threadsOnly && query.length > 1 && near.status === "idle" && !items.length && !found;
  useEffect(() => {
    if (!empty) return;
    const soon = setTimeout(consult, 400);
    return () => clearTimeout(soon);
  }, [empty, query]);

  return (
    <Modal grow title="Search" busy={found === "asking"}>
      <Command
        filter={false}
        status={near.status}
        value={
          items.some((item) => item.value === highlight) ? highlight : (items[0]?.value ?? null)
        }
        onValueChange={setHighlight}
        onQueryChange={(next, details) => {
          if (details.reason === "escape-key") return setDialog(null);
          setHighlight(null);
          asked.current = "";
          setFound(undefined);
          setText(next);
          if (threadsOnly) near.setQuery(next.trim());
        }}
        onAction={(value) => {
          setDialog(null);
          void items.find((item) => item.value === value)?.run();
        }}
      >
        <label className="field">
          <Icon name="search" />
          <CommandInput aria-label="Search" placeholder="Search" />
        </label>
        <CommandList className="options">
          {items.map((item) => (
            <CommandItem key={item.value} value={item.value} label={item.label}>
              <span className="label clip">{item.label}</span>
              <span className="detail clip">{item.hint}</span>
            </CommandItem>
          ))}
        </CommandList>
        {Array.isArray(found) && !picked.length && <p className="none">No threads found</p>}
      </Command>
    </Modal>
  );
}

export function NewMessage() {
  const start = useMutation(api.threads.start);
  const written = useRef("");

  const keep = () => {
    if (written.current.trim()) addDraft(written.current);
  };
  const send = async (body: string, files: Attached[]) => {
    setDialog(null);
    go({ thread: await start({ body, files }) });
  };

  return (
    <Modal title="New Message" onClose={keep}>
      <MessageBox
        label="New Message"
        mustMention
        modal
        placeholder="Write a message, @mention who it's for"
        onSend={(body, files) => void send(body, files)}
        onChange={(text) => (written.current = text)}
      />
    </Modal>
  );
}
