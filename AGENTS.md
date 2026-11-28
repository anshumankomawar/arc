# Arc

Team messaging in threads: an Electron desktop app and the same interface as a website, React 19 on Convex, plus a
SwiftUI app in `ios/`. `README.md` has how to set it up, run it, check it and ship it.

## Before you change the interface

The interface is built from ui-sdk (`@ui-sdk/react`, with `@ui-sdk/core` under it). Don't hand-roll what it ships.

1. Follow the ui-sdk skill. It's in this repository at `.claude/skills/ui-sdk`, so Claude Code loads it on its own; any
   other agent should read `.claude/skills/ui-sdk/SKILL.md` first. `npx skills experimental_install` restores it from
   `skills-lock.json`.
2. Read `node_modules/@ui-sdk/react/docs/llms.txt`, then only the pages of the components you use, in
   `node_modules/@ui-sdk/react/docs/components/`.
3. To build a component ui-sdk doesn't ship, search `node_modules/@ui-sdk/react/docs/core.md` by heading (it's large)
   and read `rendering.md` next to it.

What's already in use, and where:

| For                                         | Component                                         | In                                       |
| ------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| Reply and New Message, with @mentions       | Token Input, Trigger Menu, File Input             | `MessageBox.tsx`                         |
| Mailboxes and the thread list               | Listbox                                           | `Sidebar.tsx`, `List.tsx`, `Landing.tsx` |
| ⌘K, ⌘F and New Message                      | Command, Dialog                                   | `Palette.tsx`                            |
| Every command and its keys                  | `registerShortcut`, `useShortcut`                 | `commands.ts`                            |
| Right-click menus, the workspace picker     | Menu                                              | `Menu.tsx`, `Sidebar.tsx`                |
| A message's hover toolbar, reactions, image | Toolbar, Menu, Dialog                             | `Thread.tsx`                             |
| People in a group                           | Combobox                                          | `Settings.tsx`                           |
| A person's picture                          | Avatar                                            | `Face.tsx`                               |
| Columns                                     | Resizable                                         | `App.tsx`                                |
| Theme, layout, previews and the send key    | `createPreference`                                | `state.ts` (`choices`)                   |
| Settings popup                              | Dialog, Tabs                                      | `Settings.tsx`                           |
| Confirming a delete                         | `confirm`, Overlay Host                           | `data.ts`, `App.tsx`                     |
| Settings and the first-run screens          | Input, Textarea, Segmented Control, Field, Button | `Settings.tsx`, `SignIn.tsx`             |
| Adding a workspace                          | Dialog                                            | `SignIn.tsx`                             |

Styles are plain CSS in `src/renderer/src/app.css`, on class names and ui-sdk's `data-slot` and state attributes
(`data-selected`, `data-highlighted`, `data-open`). Every size (text, row and control heights, padding, gaps, radii)
reads a variable set on `:root`, and the compact layout (`:root[data-density="compact"]`) only gives those variables
smaller values. Size a new rule with the variables; never add a compact-only override for one element.

## Rules

- Write the least code that does the job, and no comments in code.
- No backwards compatibility: change what's there instead of adding a second way beside it.
- Nothing in the interface shows "…" or "...": not in placeholders or labels, and not from truncation (text that
  doesn't fit is clipped).
- Every Convex function is made with `query` and `mutation` from `convex/functions.ts`, never the ones in
  `_generated/server`: they sign the caller in and give you `ctx.me`. Read and write only inside `ctx.me.workspaceId`,
  and reach a thread through `membership`. The only exceptions are the ones in `convex/workspace.ts` that someone
  with no workspace open must reach (`me`, `workspaces`, `invitations`, `invited`, `create`, `join`, `accept`,
  `decline`, `open`, `leave`); they call `signedIn` themselves, except `invited`, which names a workspace from its
  invite link before anyone signs in.
- A thread's access check (`membership`) reads `thread_members`, which only changes when someone joins the thread.
  Per-person state that changes on every message (`activeAt`, `unread`, `seenAt`, the bucket) lives in
  `inbox_entries`, read through `stateOf`. Keep them apart so a new message doesn't re-run every open thread for
  everyone.
- Tables are named for what they hold: `workspace_members` (who is in a workspace, and their role), `open_workspaces`
  (which one each person has open), `workspace_invitations`, `mention_groups`, `thread_members` (who is in a thread),
  `inbox_entries` (one person's state for one thread), `inbox_buckets`, `messages` (with their reactions and how many
  attachments they have), `attachments`, `link_previews` and `message_embeddings`.
- An action has no `ctx.me`: it reaches data only through those queries and mutations (`convex/search.ts`).
- A message's delivery lives in `post` in `convex/threads.ts`. Change it with its tests, in `tests/`.
- A file's bytes leave storage only through the `/file` route in `convex/http.ts`, which checks membership (`stored`
  in `convex/files.ts`) and lets the browser cache them. Never give a
  client a storage URL (`ctx.storage.getUrl`): anyone holding one can fetch the file without signing in.
- A `[[file:id]]` in a message shares that file with the thread: `post` copies its row there, after checking the sender
  is in the thread it came from.
- After adding or removing a dependency, restart `bun run dev`: a running dev server keeps its old bundle of them.

## How to work here

What the owner asks for again and again in reviews. Treat a request for a cleanup or an audit as all of it.

Code

- No code debt. Before you finish, reread your whole diff and take out what isn't needed: dead logic, unused exports,
  styles and variables, comments, extra layers, and anything kept for old data or old versions.
- One source of truth. Look for what exists before you write something, and share it instead of copying it. Settings
  come from `choices` in `state.ts`, and commands, shortcuts and their hints from `commands.ts`; add to those lists
  rather than beside them. The desktop app and the website are one interface; the only fork is `window.desktop`, for
  what only the desktop can do.
- Use the same technology everywhere unless there's a specific reason, and say what it is.
- Name things plainly for what they are (tables, functions, classes), so a reader knows what something holds from its
  name.
- Migrations are temporary: run them, then delete them. Wiping or backfilling dev data is fine; never leave a
  compatibility layer behind.
- Look up what you don't know (the docs in `node_modules`, the types, a small test, the web) instead of guessing.
- Use the right tool or don't do it: nothing faked or approximated, like noise standing in for a texture.
- Keep data confined: nothing crosses workspaces, and inside one a person reaches only the threads they're in. Don't
  add a permission model nobody asked for.
- For Convex, follow its skills (`.claude/skills/convex-*`, such as optimize and launch-readiness) and its guidelines.
  Every client query goes through `convex-helpers/react/cache`. When speed is the question, measure how often queries
  re-run and how long views take to switch; don't guess.

Interface

- Consistent everywhere: edges, icons and text line up across columns, lists, menus and dialogs, with equal spacing on
  every side. Fix an inconsistency at its source (a variable, a shared component), never with a one-off override.
- Every rule works in both layouts, comfortable and compact, through the size variables.
- Buttons, rows and cards don't change color on hover.
- Where Arc doesn't handle something, keep the platform's own behavior: the native right-click menu, native drag and
  drop, Quick Look.
- The website uses the desktop's ⌘ shortcuts, as Notion does. One a browser keeps for itself works only on the desktop,
  with a visible button instead; no single-letter stand-ins.
- Quiet secondary detail: shadows, dividers and badges stay light, and bold text uses one medium weight.
- Prefer acting in place (the delete button that turns into its own confirmation) to a centered dialog. Where an
  established app has settled a pattern (Slack for messages and files, Notion for keys), follow it.
- Nothing shifts or flickers as a view loads, and nothing appears after the rest.
- Words people read are short and plain: "Arc" everywhere, "Layout" rather than "density", and commands worded as
  the existing ones are ("Switch to the dark theme"), searchable by the words people actually type.

Checking

- Fix things in code, then confirm them in the running app: screenshots of every view you touched, light and dark,
  both layouts, and measurements where alignment matters. Find every instance of a problem, not just the one reported.
- Keep the app working at every step; a broken intermediate edit shows up as a blank window.
- Report what you checked and what you didn't. A typecheck isn't a check of the interface.

Working together

- When the task is clear, plan it and do all of it without asking. Ask only about decisions that are the owner's.
- Commit, push and deploy only when asked, and confirm each action on production. Before pushing, squash the churn into
  a few commits, each a plain sentence of what changed ("An attachment's icon shows what kind of file it is").
- More than one agent may work in this tree at once: commit only your own changes, and tell the other agent before you
  edit a file it's in.
- Answers are short and concrete.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
