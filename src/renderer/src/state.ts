import { createLocalStorage, createPreference } from "@ui-sdk/core";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Id } from "../../../convex/_generated/dataModel";

export type Box = "inbox" | "all" | "sent" | "drafts" | (string & {});
type View = { box: Box; thread?: Id<"threads">; draft?: string };
export type Draft = { id: string; text: string; at: number };
export type Dialog = "search" | "find" | "new" | "settings" | "workspace";

export const theme = createPreference({
  values: ["dark", "light"],
  defaultValue: "light",
  attribute: "data-theme",
  global: true,
  storage: createLocalStorage("theme"),
});

export const previews = createPreference({
  values: ["on", "off"],
  defaultValue: "on",
  attribute: "data-previews",
  global: true,
  storage: createLocalStorage("previews"),
});

type UI = {
  history: View[];
  at: number;
  sidebar: boolean;
  scale: number;
  drafts: Draft[];
  dialog: Dialog | null;
  tab: string;
};

export const useUI = create<UI>()(
  persist(
    (): UI => ({
      history: [{ box: "inbox" }],
      at: 0,
      sidebar: true,
      scale: 100,
      drafts: [],
      dialog: null,
      tab: "Workspaces",
    }),
    { name: "ui", partialize: ({ sidebar, scale, drafts }) => ({ sidebar, scale, drafts }) },
  ),
);

const set = useUI.setState;
export const reset = () => set({ history: [{ box: "inbox" }], at: 0, drafts: [], dialog: null });

export const switched = (dialog: Dialog | null = null) =>
  set({ history: [{ box: "inbox" }], at: 0, dialog });

export const useView = () => useUI((ui) => ui.history[ui.at]);

export function go(view: Partial<View>) {
  const { history, at } = useUI.getState();
  const here = history[at];
  const next = { ...here, draft: undefined, ...view };
  const same = next.box === here.box && next.thread === here.thread && next.draft === here.draft;
  if (same) return set({ dialog: null });
  set({ history: [...history.slice(0, at + 1), next], at: at + 1, dialog: null });
}
export const show = (thread: Id<"threads">) =>
  set(({ history, at }) => ({
    history: history.map((view, index) => (index === at ? { ...view, thread } : view)),
  }));
export const back = () => set(({ at }) => ({ at: Math.max(0, at - 1) }));
export const forward = () =>
  set(({ at, history }) => ({ at: Math.min(history.length - 1, at + 1) }));

export const setDialog = (dialog: Dialog | null, tab = "Workspaces") => set({ dialog, tab });
export const toggleSidebar = () => set(({ sidebar }) => ({ sidebar: !sidebar }));
export const scaleBy = (step: number) =>
  set(({ scale }) => ({ scale: Math.min(160, Math.max(80, scale + step)) }));
export const resetScale = () => set({ scale: 100 });

export const addDraft = (text: string) =>
  set(({ drafts }) => ({ drafts: [{ id: crypto.randomUUID(), text, at: Date.now() }, ...drafts] }));
export const editDraft = (id: string, text: string) =>
  set(({ drafts }) => ({
    drafts: drafts.map((draft) => (draft.id === id ? { id, text, at: Date.now() } : draft)),
  }));
export const removeDraft = (id: string) =>
  set(({ drafts }) => ({ drafts: drafts.filter((draft) => draft.id !== id) }));
