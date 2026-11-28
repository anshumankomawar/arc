import { Button } from "@ui-sdk/react/button";
import type { ReactNode } from "react";
import { LINK, useFiles, useNames, type Id } from "./data";

const INLINE = new RegExp(
  [
    "`([^`\\n]+)`",
    "\\*\\*([^*\\n]+)\\*\\*",
    "~~([^~\\n]+)~~",
    "(?<![\\w*])\\*([^*\\s][^*\\n]*)\\*(?![\\w*])",
    "(?<!\\w)_([^_\\s][^_\\n]*)_(?!\\w)",
    "\\[\\[(person|group|file):(\\w+)\\]\\]",
    `(${LINK.source})`,
  ].join("|"),
  "g",
);

type Block = { kind: "p" | "quote" | "code" | "ul" | "ol"; lines: string[] };

function blocks(body: string) {
  const found: Block[] = [];
  const lines = body.split("\n");
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at];
    if (line.startsWith("```")) {
      const code: string[] = [];
      while (++at < lines.length && !lines[at].startsWith("```")) code.push(lines[at]);
      found.push({ kind: "code", lines: code });
      continue;
    }
    const kind = /^> ?/.test(line)
      ? "quote"
      : /^\s*[-*•] /.test(line)
        ? "ul"
        : /^\s*\d+[.)] /.test(line)
          ? "ol"
          : "p";
    const text = line.replace(
      kind === "quote" ? /^> ?/ : kind === "p" ? /^$/ : /^\s*([-*•]|\d+[.)]) /,
      "",
    );
    const last = found.at(-1);
    if (last?.kind === kind) last.lines.push(text);
    else found.push({ kind, lines: [text] });
  }
  return found;
}

export function Markdown({ body, after }: { body: string; after?: ReactNode }) {
  const { name } = useNames();
  const { download } = useFiles();
  const inline = (text: string): ReactNode[] => {
    const found: ReactNode[] = [];
    let at = 0;
    for (const match of text.matchAll(INLINE)) {
      const [whole, code, bold, strike, star, under, kind, id, url] = match;
      found.push(text.slice(at, match.index));
      at = match.index + whole.length;
      const key = match.index;
      found.push(
        code !== undefined ? (
          <code key={key}>{code}</code>
        ) : bold ? (
          <strong key={key}>{inline(bold)}</strong>
        ) : strike ? (
          <s key={key}>{inline(strike)}</s>
        ) : star || under ? (
          <em key={key}>{inline(star || under)}</em>
        ) : kind === "file" ? (
          <Button
            key={key}
            className="mention"
            onClick={() => void download({ _id: id as Id<"files">, name: name(id) })}
          >
            {name(id)}
          </Button>
        ) : kind ? (
          <span key={key} className="mention">
            @{name(id)}
          </span>
        ) : (
          <a key={key} href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
        ),
      );
    }
    found.push(text.slice(at));
    return found;
  };
  const all = blocks(body);

  return (
    <>
      {all.map(({ kind, lines }, index) =>
        kind === "code" ? (
          <pre key={index}>
            <code>{lines.join("\n")}</code>
          </pre>
        ) : kind === "quote" ? (
          <blockquote key={index}>{inline(lines.join("\n"))}</blockquote>
        ) : kind === "p" ? (
          <p key={index}>
            {inline(lines.join("\n"))}
            {index === all.length - 1 && after}
          </p>
        ) : (
          <List key={index} ordered={kind === "ol"}>
            {lines.map((line, at) => (
              <li key={at}>{inline(line)}</li>
            ))}
          </List>
        ),
      )}
      {all.at(-1)?.kind !== "p" && after}
    </>
  );
}

const List = ({ ordered, children }: { ordered: boolean; children: ReactNode }) =>
  ordered ? <ol>{children}</ol> : <ul>{children}</ul>;
