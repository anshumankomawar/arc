import {
  Menu,
  MenuContent,
  MenuContextTrigger,
  MenuItems,
  type MenuData,
} from "@ui-sdk/react/menu";
import type { ReactElement } from "react";

export type MenuEntry =
  { label: string; run: () => void } | { label: string; items: MenuEntry[] } | "separator";

const build = (entries: MenuEntry[], runs: (() => void)[]): MenuData =>
  entries.map((entry) =>
    entry === "separator"
      ? { type: "separator" }
      : "items" in entry
        ? { type: "submenu", label: entry.label, items: build(entry.items, runs) }
        : { value: String(runs.push(entry.run) - 1), label: entry.label },
  );

export function ContextMenu(props: {
  entries: MenuEntry[];
  children: ReactElement<Record<string, unknown>>;
}) {
  const runs: (() => void)[] = [];
  const items = build(props.entries, runs);
  return (
    <Menu items={items} onAction={(value) => runs[Number(value)]?.()}>
      <MenuContextTrigger render={props.children} />
      <MenuContent className="panel menu">
        <MenuItems items={items} />
      </MenuContent>
    </Menu>
  );
}
