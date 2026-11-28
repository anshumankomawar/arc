import { useAuthToken } from "@convex-dev/auth/react";
import { confirm } from "@ui-sdk/react/alert-dialog";
import {
  insertAtTop,
  optimisticallyUpdateValueInPaginatedQuery,
  useMutation,
  usePaginatedQuery,
} from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { plain } from "../../../convex/text";
import type { Box } from "./state";

export { api };
export { FILE_LIMIT, LINK, mentions, parts } from "../../../convex/text";
export type { Doc, Id };
export type Row = FunctionReturnType<typeof api.threads.inbox>[number];
export type Message = FunctionReturnType<typeof api.threads.messages>["page"][number];
export type Attached = NonNullable<FunctionArgs<typeof api.threads.send>["files"]>[number];

const EMPTY: never[] = [];
const PAGE = 40;
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
  const size = { width: full.width, height: full.height };
  const scale = Math.min(1, 720 / Math.max(size.width, size.height));
  const small = await createImageBitmap(full, {
    resizeWidth: Math.round(size.width * scale),
    resizeHeight: Math.round(size.height * scale),
    resizeQuality: "high",
  });
  full.close();
  const canvas = new OffscreenCanvas(small.width, small.height);
  canvas.getContext("2d")!.drawImage(small, 0, 0);
  small.close();
  return { blob: await canvas.convertToBlob({ type: "image/webp", quality: 0.9 }), size };
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
  const token = useAuthToken();
  type Sent = { _id: Id<"files">; name: string };
  const bytes = async (id: Id<"files"> | Id<"links">) => {
    const response = await fetch(`${import.meta.env.VITE_CONVEX_SITE_URL}/file?id=${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`File answered ${response.status}`);
    return response.arrayBuffer();
  };
  const download = async ({ _id, name }: Sent) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([await bytes(_id)]));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  };
  const look = async ({ _id, name }: Sent) => {
    if (opening.has(_id)) return;
    opening.add(_id);
    await bytes(_id)
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
export const useInbox = () => useQuery(api.threads.inbox) ?? EMPTY;
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
  rows.filter((row) => (box === "inbox" ? row.bucketId : row.bucketId === box));

export function useRows(box: Box) {
  const inbox = useInbox();
  const paged = box === "all" || box === "sent";
  const { results, status, loadMore } = usePaginatedQuery(
    api.threads.list,
    paged ? { sent: box === "sent" } : "skip",
    { initialNumItems: PAGE },
  );
  return {
    rows: paged ? results : inBox(inbox, box),
    more: status === "CanLoadMore" ? () => loadMore(PAGE) : undefined,
  };
}

export function sections(listed: Row[], box: Box, buckets: Doc<"buckets">[]) {
  if (box !== "inbox") return [{ title: "", rows: listed }];
  return buckets
    .map((bucket) => ({
      title: bucket.name,
      rows: listed.filter((row) => row.bucketId === bucket._id),
    }))
    .filter((section) => section.rows.length > 0);
}

function patchRow(store: OptimisticLocalStore, threadId: Id<"threads">, change: Partial<Row>) {
  const patch = (row: Row) => (row.threadId === threadId ? { ...row, ...change } : row);
  const inbox = store.getQuery(api.threads.inbox, {});
  if (inbox)
    store.setQuery(
      api.threads.inbox,
      {},
      inbox.map(patch).filter((row) => row.inbox),
    );
  const row = store.getQuery(api.threads.row, { threadId });
  if (row) store.setQuery(api.threads.row, { threadId }, patch(row));
  for (const sent of [true, false])
    optimisticallyUpdateValueInPaginatedQuery(store, api.threads.list, { sent }, patch);
}

export const useMark = () =>
  useMutation(api.threads.mark).withOptimisticUpdate((store, { threadId, ...state }) =>
    patchRow(store, threadId, state),
  );

export const useMove = () =>
  useMutation(api.threads.move).withOptimisticUpdate((store, { threadId, bucketId }) =>
    patchRow(store, threadId, { bucketId }),
  );

function patchMessages(store: OptimisticLocalStore, change: (page: Message[]) => Message[]) {
  for (const { args, value } of store.getAllQueries(api.threads.messages))
    if (value) store.setQuery(api.threads.messages, args, { ...value, page: change(value.page) });
}

export const useEdit = () =>
  useMutation(api.threads.edit).withOptimisticUpdate((store, { messageId, body }) =>
    patchMessages(store, (page) =>
      page.map((message) =>
        message._id === messageId ? { ...message, body, editedAt: Date.now() } : message,
      ),
    ),
  );

export function useRemoveMessage() {
  const remove = useMutation(api.threads.remove).withOptimisticUpdate((store, { messageId }) =>
    patchMessages(store, (page) => page.filter((message) => message._id !== messageId)),
  );
  return async (messageId: Id<"messages">) => {
    const sure = await confirm({
      title: "Delete this message?",
      description: "It's removed for everyone in the thread. This can't be undone.",
      confirmLabel: "Delete",
    });
    if (sure) await remove({ messageId });
  };
}

export const useSend = () =>
  useMutation(api.threads.send).withOptimisticUpdate((store, { threadId, body, files = [] }) => {
    const me = store.getQuery(api.workspace.me, {});
    if (!me?.workspaceId) return;
    insertAtTop({
      paginatedQuery: api.threads.messages,
      argsToMatch: { threadId },
      localQueryStore: store,
      item: {
        _id: crypto.randomUUID() as Id<"messages">,
        _creationTime: Date.now(),
        workspaceId: me.workspaceId,
        threadId,
        authorId: me._id,
        body,
        files: files.map(({ storageId, name, thumb, snippet }) => ({
          _id: storageId as string as Id<"files">,
          name,
          snippet,
          size: sizes.get(storageId) ?? 0,
          thumb: thumb && { ...thumb, id: thumb.storageId as string as Id<"files"> },
        })),
        links: [],
      },
    });
    patchRow(store, threadId, {
      lastAuthorId: me._id,
      lastBody: body || files.map((file) => file.name).join(", "),
      activeAt: Date.now(),
    });
  });
