export const FILE_LIMIT = 15_000_000;
export const LINK = /https?:\/\/[^\s<>"']+/g;

const TOKEN = /\[\[(person|group|file):(\w+)\]\]/g;

type Kind = "person" | "group" | "file";
type Part = string | { kind: Kind; id: string };

export const personToken = (id: string) => `[[person:${id}]]`;
export const groupToken = (id: string) => `[[group:${id}]]`;
export const fileToken = (id: string) => `[[file:${id}]]`;

export function parts(body: string): Part[] {
  const found: Part[] = [];
  let at = 0;
  for (const match of body.matchAll(TOKEN)) {
    if (match.index > at) found.push(body.slice(at, match.index));
    found.push({ kind: match[1] as Kind, id: match[2] });
    at = match.index + match[0].length;
  }
  if (at < body.length) found.push(body.slice(at));
  return found;
}

export const mentions = (body: string, kind: Kind) =>
  parts(body).flatMap((part) => (typeof part !== "string" && part.kind === kind ? [part.id] : []));

const unmark = (text: string) =>
  text
    .replace(/^```.*$/gm, "")
    .replace(/^> ?/gm, "")
    .replace(/\*\*|~~|`/g, "");

export const plain = (body: string, name: (kind: Kind, id: string) => string) =>
  parts(unmark(body))
    .map((part) =>
      typeof part === "string"
        ? part
        : (part.kind === "file" ? "" : "@") + name(part.kind, part.id),
    )
    .join("");

export const titleOf = (body: string) =>
  unmark(body.replace(TOKEN, "")).trim().split("\n")[0].replace(/\s+/g, " ").slice(0, 80) ||
  "New thread";
