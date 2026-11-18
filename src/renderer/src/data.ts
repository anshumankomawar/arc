import { confirm } from "@ui-sdk/react/alert-dialog";
import { useAction, useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { useQuery } from "convex-helpers/react/cache";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { mentions, plain } from "../../../convex/text";
import type { Box } from "./state";

export { api };
export { FILE_LIMIT, LINK, mentions, parts } from "../../../convex/text";
export type { Doc, Id };
export type Row = ReturnType<typeof useThreads>[number];
export type Attached = NonNullable<FunctionArgs<typeof api.threads.send>["files"]>[number];

const EMPTY: never[] = [];
const sizes = new Map<string, number>();
const opening = new Set<string>();
const TEXT =
  /\.(txt|md|csv|tsv|log|json|js|jsx|ts|tsx|html|css|py|go|rs|sh|yml|yaml|toml|xml|swift)$/i;

export const useMe = () => useQuery(api.workspace.me);
export function useCopyInvite() {
  const link = useMutation(api.workspace.inviteLink);
  return async () => navigator.clipboard.writeText(await link());
}
export function useRemoveBucket() {
  const remove = useMutation(api.workspace.removeBucket);
  return async ({ _id, name }: Doc<"buckets">) => {
    const sure = await confirm({
      title: `Delete ${name}?`,
      description: "Its threads stay in All Threads.",
      confirmLabel: "Delete",
    });
    if (sure) await remove({ id: _id });
  };
}
async function thumbnail(file: File) {
  const full = await createImageBitmap(file).catch(() => null);
  if (!full) return;
  const scale = Math.min(1, 720 / Math.max(full.width, full.height));
  const small = await createImageBitmap(full, {
    resizeWidth: Math.round(full.width * scale),
    resizeHeight: Math.round(full.height * scale),
    resizeQuality: "high",
  });
  const canvas = new OffscreenCanvas(small.width, small.height);
  canvas.getContext("2d")!.drawImage(small, 0, 0);
  return {
    blob: await canvas.convertToBlob({ type: "image/webp", quality: 0.9 }),
    size: { width: full.width, height: full.height },
  };
}
export function useUpload() {
  const uploadUrl = useMutation(api.files.uploadUrl);
  const put = async (body: Blob): Promise<Id<"_storage">> => {
    const response = await fetch(await uploadUrl(), { method: "POST", body });
    if (!response.ok) throw new Error(`Upload answered ${response.status}`);
    return (await response.json()).storageId;
  };
  return async (file: File): Promise<Attached> => {
    const storageId = await put(file);
    sizes.set(storageId, file.size);
    const small = await thumbnail(file);
    const thumb = small && { ...small.size, storageId: await put(small.blob) };
    const text = TEXT.test(file.name) ? await file.slice(0, 4000).text() : "";
    const snippet = text.split("\n").slice(0, 12).join("\n").slice(0, 1500) || undefined;
    return { storageId, name: file.name, thumb, snippet };
  };
}
export function useFiles() {
  const bytes = useAction(api.files.download);
  type Sent = { _id: Id<"files">; name: string };
  const download = async ({ _id, name }: Sent) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([await bytes({ id: _id })]));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  };
  const look = async ({ _id, name }: Sent) => {
    if (opening.has(_id)) return;
    opening.add(_id);
    await bytes({ id: _id })
      .then((loaded) => window.desktop!.preview(name, loaded))
      .finally(() => opening.delete(_id));
  };
  return { bytes, download, preview: window.desktop ? look : download };
}
export const useWorkspaces = () => useQuery(api.workspace.workspaces) ?? EMPTY;
export function useInvitations() {
  const invitations = useQuery(api.workspace.invitations) ?? EMPTY;
  const accept = useMutation(api.workspace.accept);
  const decline = useMutation(api.workspace.decline);
  return { invitations, accept, decline };
}
export const usePending = () => useQuery(api.workspace.pending) ?? EMPTY;
export const usePeople = () => useQuery(api.workspace.people) ?? EMPTY;
export const useGroups = () => useQuery(api.workspace.groups) ?? EMPTY;
export const useBuckets = () => useQuery(api.workspace.buckets) ?? EMPTY;
export const useThreads = () => useQuery(api.threads.list) ?? EMPTY;
export const useDocuments = () => useQuery(api.files.mine) ?? EMPTY;

export function useNames() {
  const people = usePeople();
  const groups = useGroups();
  const documents = useDocuments();
  return useMemo(() => {
    const named = [...people, ...groups, ...documents];
    const names = new Map<string, string>(named.map((it) => [it._id, it.name]));
    const name = (id: string) => names.get(id) ?? "someone";
    return { name, text: (body: string) => plain(body, (_kind, id) => name(id)) };
  }, [people, groups, documents]);
}

export const inBox = (rows: Row[], box: Box) =>
  box === "all"
    ? rows
    : box === "sent"
      ? rows.filter((row) => row.sent)
      : rows.filter((row) => row.inbox && (box === "inbox" ? row.bucketId : row.bucketId === box));

export function sections(rows: Row[], box: Box, buckets: Doc<"buckets">[]) {
  const listed = inBox(rows, box);
  if (box !== "inbox") return [{ title: "", rows: listed }];
  return buckets
    .map((bucket) => ({
      title: bucket.name,
      rows: listed.filter((row) => row.bucketId === bucket._id),
    }))
    .filter((section) => section.rows.length > 0);
}

function patchRow(store: OptimisticLocalStore, threadId: Id<"threads">, change: Partial<Row>) {
  const rows = store.getQuery(api.threads.list, {});
  if (!rows) return;
  store.setQuery(
    api.threads.list,
    {},
    rows.map((row) => (row.threadId === threadId ? { ...row, ...change } : row)),
  );
}

export const useMark = () =>
  useMutation(api.threads.mark).withOptimisticUpdate((store, { threadId, ...state }) =>
    patchRow(store, threadId, state),
  );

export const useMove = () =>
  useMutation(api.threads.move).withOptimisticUpdate((store, { threadId, bucketId }) =>
    patchRow(store, threadId, { bucketId }),
  );

export const useSend = () =>
  useMutation(api.threads.send).withOptimisticUpdate((store, { threadId, body, files = [] }) => {
    const me = store.getQuery(api.workspace.me, {});
    const messages = store.getQuery(api.threads.messages, { threadId });
    if (!me?.workspaceId || !messages) return;
    const here = new Set(messages.flatMap((message) => message.files.map((file) => file._id)));
    const referred = (store.getQuery(api.files.mine, {}) ?? []).filter(
      (file) => mentions(body, "file").includes(file._id) && !here.has(file._id),
    );
    const sent = {
      _id: crypto.randomUUID() as Id<"messages">,
      _creationTime: Date.now(),
      workspaceId: me.workspaceId,
      threadId,
      authorId: me._id,
      body,
      files: [
        ...files.map(({ storageId, name, thumb, snippet }) => ({
          _id: storageId as string as Id<"files">,
          name,
          snippet,
          size: sizes.get(storageId) ?? 0,
          thumb: thumb && { ...thumb, id: thumb.storageId as string as Id<"files"> },
        })),
        ...referred.map((file) => ({ ...file, snippet: undefined, thumb: undefined })),
      ],
      links: [],
    };
    store.setQuery(api.threads.messages, { threadId }, [...messages, sent]);
    patchRow(store, threadId, {
      lastAuthorId: me._id,
      lastBody: body || files.map((file) => file.name).join(", "),
      activeAt: Date.now(),
    });
  });
