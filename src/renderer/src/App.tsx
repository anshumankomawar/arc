import { OverlayHost } from "@ui-sdk/react/overlays";
import { Resizable, ResizableHandle, ResizablePanel } from "@ui-sdk/react/resizable";
import { useShortcut } from "@ui-sdk/react/shortcuts";
import { Toolbar, ToolbarButton, ToolbarGroup } from "@ui-sdk/react/toolbar";
import { useEffect } from "react";
import { useCommandKeys, useCommands } from "./commands";
import { sections, useBuckets, useMe, useRows } from "./data";
import { Icon } from "./Icon";
import { List } from "./List";
import { NewMessage, Search } from "./Palette";
import { Settings } from "./Settings";
import { AddWorkspace } from "./SignIn";
import { Sidebar } from "./Sidebar";
import { back, forward, go, setDialog, show, toggleSidebar, useUI, useView } from "./state";
import { DraftView, Thread } from "./Thread";

export function App() {
  const me = useMe();
  const view = useView();
  const { at, history, sidebar, dialog, drafts } = useUI();
  const draft = drafts.find(({ id }) => id === view.draft);
  const listed = useRows(view.box);
  const buckets = useBuckets();
  const commands = useCommands(listed.rows);
  const first = sections(listed.rows, view.box, buckets)[0]?.rows[0]?.threadId;
  useEffect(() => {
    if (first && !view.thread && !view.draft) show(first);
  }, [view.box, !first]);
  useCommandKeys(commands);
  useShortcut("mod+k", () => setDialog("search"), { description: "Search" });
  useShortcut(
    "escape",
    () => {
      const focused = document.activeElement as HTMLElement | null;
      if (focused?.isContentEditable) focused.blur();
      else go({ thread: undefined });
    },
    { allowInInput: true, description: "Close" },
  );
  useEffect(() => {
    const onMouseUp = ({ button }: MouseEvent) =>
      button === 3 ? back() : button === 4 && forward();
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);
  if (!me) return null;

  return (
    <>
      <Toolbar className="topbar" aria-label="Window">
        <ToolbarGroup>
          <ToolbarButton aria-label="Sidebar" onClick={toggleSidebar}>
            <Icon name="layout" />
          </ToolbarButton>
          <ToolbarButton aria-label="Back" disabled={at === 0} onClick={back}>
            <Icon name="nav-back" />
          </ToolbarButton>
          <ToolbarButton
            aria-label="Forward"
            disabled={at === history.length - 1}
            onClick={forward}
          >
            <Icon name="nav-forward" />
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarButton
          data-search
          className="search"
          data-hidden={dialog === "search" || dialog === "find" || undefined}
          onClick={() => setDialog("search")}
        >
          <Icon name="search" />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </ToolbarButton>
        <ToolbarGroup>
          <ToolbarButton aria-label="Settings" onClick={() => setDialog("settings")}>
            <Icon name="settings" />
          </ToolbarButton>
        </ToolbarGroup>
      </Toolbar>
      <Resizable className="columns" autoSaveId="sidebar">
        {sidebar && (
          <>
            <ResizablePanel id="sidebar" defaultSize="242px" minSize="200px" maxSize="350px">
              <Sidebar />
            </ResizablePanel>
            <ResizableHandle aria-label="Resize sidebar" />
          </>
        )}
        <ResizablePanel id="main">
          <Resizable className="columns" autoSaveId="list">
            <ResizablePanel id="list" defaultSize="374px" minSize="310px" maxSize="660px">
              <List {...listed} />
            </ResizablePanel>
            <ResizableHandle aria-label="Resize list" />
            <ResizablePanel id="thread">
              {draft ? (
                <DraftView draft={draft} />
              ) : (
                view.thread && <Thread threadId={view.thread} />
              )}
            </ResizablePanel>
          </Resizable>
        </ResizablePanel>
      </Resizable>
      <OverlayHost />
      {dialog === "new" && <NewMessage />}
      {dialog === "settings" && <Settings />}
      {dialog === "workspace" && <AddWorkspace />}
      {(dialog === "search" || dialog === "find") && (
        <Search threadsOnly={dialog === "find"} commands={commands} />
      )}
    </>
  );
}
