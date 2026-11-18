import { useAuthActions } from "@convex-dev/auth/react";
import { confirm } from "@ui-sdk/react/alert-dialog";
import { Button } from "@ui-sdk/react/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@ui-sdk/react/combobox";
import { Dialog, DialogContent, DialogTitle } from "@ui-sdk/react/dialog";
import { Input } from "@ui-sdk/react/input";
import { Listbox, ListboxItem } from "@ui-sdk/react/listbox";
import { usePreference } from "@ui-sdk/react/preferences";
import { SegmentedControl, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { Textarea } from "@ui-sdk/react/textarea";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useRef, useState, type FocusEvent, type ReactNode } from "react";
import {
  api,
  useBuckets,
  useCopyInvite,
  useGroups,
  useMe,
  usePending,
  usePeople,
  useInvitations,
  useRemoveBucket,
  useWorkspaces,
  type Doc,
  type Id,
} from "./data";
import { Icon } from "./Icon";
import { Face } from "./Face";
import { previews, reset, setDialog, switched, theme, useUI } from "./state";

const saveOnLeave = (event: FocusEvent<HTMLFormElement>) => {
  if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.requestSubmit();
};

function Section(props: { title: string; hint: string; children: ReactNode }) {
  return (
    <TabsPanel value={props.title}>
      <h2>{props.title}</h2>
      <p>{props.hint}</p>
      {props.children}
    </TabsPanel>
  );
}

function Bucket({ bucket }: { bucket?: Doc<"buckets"> }) {
  const save = useMutation(api.workspace.saveBucket);
  const remove = useRemoveBucket();
  const of = bucket?.name ?? "a new bucket";
  return (
    <form
      className="row"
      onBlur={saveOnLeave}
      action={async (form) => {
        const name = String(form.get("name")).trim();
        const description = String(form.get("description")).trim();
        if (!name || (name === bucket?.name && description === bucket.description)) return;
        await save({ id: bucket?._id, name, description });
      }}
    >
      <Input
        name="name"
        className="name"
        aria-label={`Name of ${of}`}
        placeholder="Add a bucket"
        defaultValue={bucket?.name}
      />
      <Textarea
        name="description"
        rows={1}
        autoResize
        submitShortcut="enter"
        aria-label={`What belongs in ${of}`}
        placeholder="What belongs in it"
        defaultValue={bucket?.description}
      />
      {bucket && (
        <Button className="quiet" onClick={() => void remove(bucket)}>
          Delete
        </Button>
      )}
    </form>
  );
}

function Current() {
  const me = useMe()!;
  const owner = me.role === "owner";
  const people = usePeople();
  const pending = usePending();
  const copyInvite = useCopyInvite();
  const invite = useMutation(api.workspace.invite);
  const revoke = useMutation(api.workspace.revoke);
  const rename = useMutation(api.workspace.rename);
  const removePerson = useMutation(api.workspace.removePerson);
  const leave = useMutation(api.workspace.leave);
  const removeWorkspace = useMutation(api.workspace.removeWorkspace);
  const [copied, setCopied] = useState("");
  const [already, setAlready] = useState<string[]>([]);
  const timer = useRef(0);
  const flash = (key: string) => {
    clearTimeout(timer.current);
    setCopied(key);
    timer.current = window.setTimeout(() => setCopied(""), 1500);
  };

  return (
    <>
      <div className="name">
        {owner ? (
          <form
            key={me.workspace}
            onBlur={saveOnLeave}
            action={async (form) => {
              const name = String(form.get("name")).trim();
              if (name && name !== me.workspace) await rename({ name });
            }}
          >
            <Input
              name="name"
              className="title"
              aria-label="Workspace name"
              defaultValue={me.workspace}
            />
          </form>
        ) : (
          <span className="clip title">{me.workspace}</span>
        )}
      </div>
      <form
        className="invite"
        action={async (form) => {
          const emails = String(form.get("emails"))
            .split(/[\s,;]+/)
            .filter(Boolean);
          if (emails.length) setAlready(await invite({ emails }));
        }}
      >
        <Input
          name="emails"
          type="email"
          multiple
          required
          aria-label="Email addresses to invite"
          placeholder="name@company.com"
          onChange={() => setAlready([])}
        />
        <Button type="submit">Invite</Button>
        <Button onClick={() => void copyInvite().then(() => flash("link"))}>
          {copied === "link" ? "Copied" : "Copy Link"}
        </Button>
      </form>
      {already.length > 0 && (
        <p role="alert">
          {already.join(", ")} {already.length === 1 ? "is" : "are"} already in {me.workspace} or
          invited.
        </p>
      )}
      <h3>Members</h3>
      <div className="members">
        {people.map((person) => (
          <div key={person._id} className="row">
            <Face id={person._id} size={20} />
            <span className="clip">{person.name}</span>
            {person.role === "owner" ? (
              <small>Owner</small>
            ) : (
              <Button
                className="email"
                aria-label={`Copy ${person.email}`}
                onClick={() =>
                  void navigator.clipboard.writeText(person.email).then(() => flash(person.email))
                }
              >
                {copied === person.email ? "Copied" : person.email}
              </Button>
            )}
            {owner && person._id !== me._id && (
              <Button
                className="remove"
                aria-label={`Remove ${person.name}`}
                onClick={async () => {
                  const yes = await confirm({
                    title: `Remove ${person.name}?`,
                    description: `They leave ${me.workspace} and its threads.`,
                    confirmLabel: "Remove",
                  });
                  if (yes) await removePerson({ userId: person._id });
                }}
              >
                <Icon name="trash" />
              </Button>
            )}
          </div>
        ))}
        {pending.map((invitation) => (
          <div key={invitation._id} className="row">
            <span className="clip">{invitation.email}</span>
            <small>Invited</small>
            <Button
              className="remove"
              aria-label={`Cancel the invite to ${invitation.email}`}
              onClick={() => void revoke({ id: invitation._id })}
            >
              <Icon name="trash" />
            </Button>
          </div>
        ))}
      </div>
      <footer>
        <Button
          className="text"
          onClick={async () => {
            const yes = await confirm({
              title: `Leave ${me.workspace}?`,
              description: "You can come back with an invite.",
              confirmLabel: "Leave",
            });
            if (yes) await leave({ id: me.workspaceId! }).then(() => switched("settings"));
          }}
        >
          Leave Workspace
        </Button>
        {owner && (
          <Button
            className="text danger"
            onClick={async () => {
              const yes = await confirm({
                title: `Delete ${me.workspace}?`,
                description: "Its threads, messages and files are deleted for everyone.",
                confirmLabel: "Delete",
              });
              if (yes) await removeWorkspace().then(() => switched("settings"));
            }}
          >
            Delete Workspace
          </Button>
        )}
      </footer>
    </>
  );
}

function Workspaces() {
  const me = useMe()!;
  const workspaces = useWorkspaces();
  const { invitations, accept, decline } = useInvitations();
  const open = useMutation(api.workspace.open);

  return (
    <TabsPanel value="Workspaces" className="split">
      <nav>
        <Listbox
          aria-label="Workspaces"
          value={me.workspaceId}
          onValueChange={(id) =>
            id &&
            id !== me.workspaceId &&
            void open({ id: id as Id<"workspaces"> }).then(() => switched("settings"))
          }
        >
          {workspaces.map((workspace) => (
            <ListboxItem key={workspace._id} value={workspace._id} label={workspace.name}>
              <span className="clip">{workspace.name}</span>
            </ListboxItem>
          ))}
        </Listbox>
        <Button className="add" onClick={() => setDialog("workspace", "start")}>
          <Icon name="plus" />
          <span>New Workspace</span>
        </Button>
      </nav>
      <div className="detail">
        {invitations.map((invitation) => (
          <div key={invitation._id} className="row">
            <span className="clip">
              {invitation.from} invited you to {invitation.workspace}
            </span>
            <Button className="text" onClick={() => void decline({ id: invitation._id })}>
              Decline
            </Button>
            <Button
              onClick={() => void accept({ id: invitation._id }).then(() => switched("settings"))}
            >
              Join
            </Button>
          </div>
        ))}
        <Current key={me.workspaceId} />
      </div>
    </TabsPanel>
  );
}

function Groups() {
  const people = usePeople();
  const groups = useGroups();
  const save = useMutation(api.workspace.saveGroup);
  const remove = useMutation(api.workspace.removeGroup);
  const [selected, setSelected] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const group = drafting ? undefined : (groups.find(({ _id }) => _id === selected) ?? groups[0]);
  const members = people.filter((person) => group?.userIds.includes(person._id));
  const others = people.filter((person) => !group?.userIds.includes(person._id));
  const setMembers = (userIds: Id<"users">[]) =>
    group && void save({ id: group._id, name: group.name, userIds });
  const fail = (failure: unknown) =>
    void setError(failure instanceof ConvexError ? String(failure.data) : "That didn't save.");
  const open = (id: string, draft = false) => {
    setSelected(id);
    setDrafting(draft);
    setError("");
    setQuery("");
  };
  const nameError = error && (
    <p role="alert" className="error">
      {error}
    </p>
  );

  return (
    <TabsPanel value="Groups" className="split">
      <nav>
        <Listbox
          aria-label="Groups"
          value={group?._id ?? null}
          onValueChange={(id) => id && open(id)}
        >
          {groups.map((group) => (
            <ListboxItem key={group._id} value={group._id} label={group.name}>
              <span className="clip">{group.name}</span>
            </ListboxItem>
          ))}
        </Listbox>
        <Button
          className="add"
          data-active={drafting || undefined}
          onClick={() => open(selected, true)}
        >
          <Icon name="plus" />
          <span>New Group</span>
        </Button>
      </nav>
      <div className="detail">
        {drafting ? (
          <>
            <div className="name">
              <form
                onBlur={saveOnLeave}
                onSubmit={async (event) => {
                  event.preventDefault();
                  const name = String(new FormData(event.currentTarget).get("name")).trim();
                  if (!name) return setDrafting(false);
                  const id = await save({ name, userIds: [] }).catch(fail);
                  if (id) open(id);
                }}
              >
                <Input
                  name="name"
                  className="title"
                  aria-label="Group name"
                  placeholder="Group name"
                  autoFocus
                  onChange={() => setError("")}
                />
              </form>
            </div>
            {nameError}
            <p>Name the group, then add people to it.</p>
          </>
        ) : group ? (
          <>
            <div className="name">
              <form
                key={group._id + group.name}
                onBlur={saveOnLeave}
                action={async (form) => {
                  const name = String(form.get("name")).trim();
                  if (name && name !== group.name)
                    await save({
                      id: group._id,
                      name,
                      userIds: members.map(({ _id }) => _id),
                    }).catch(fail);
                }}
              >
                <Input
                  name="name"
                  className="title"
                  aria-label="Group name"
                  defaultValue={group.name}
                  onChange={() => setError("")}
                />
              </form>
            </div>
            {nameError}
            <div className="invite">
              <Combobox
                autoHighlight
                value={null}
                query={query}
                onQueryChange={(next, { reason }) =>
                  setQuery(reason === "input-change" ? next : "")
                }
                onValueChange={(id) =>
                  id && setMembers([...members.map(({ _id }) => _id), id as Id<"users">])
                }
                onOpenChange={(open, details) =>
                  !open && details.reason === "item-press" && details.cancel()
                }
              >
                <ComboboxInput
                  aria-label={`Add people to ${group.name}`}
                  placeholder="Add people"
                />
                <ComboboxContent className="panel menu picker" align="start" sideOffset={4}>
                  <ComboboxEmpty>
                    {others.length ? "Nobody by that name" : "Everyone is in this group"}
                  </ComboboxEmpty>
                  <ComboboxList>
                    {others.map((person) => (
                      <ComboboxItem key={person._id} value={person._id} label={person.name}>
                        <Face id={person._id} size={16} />
                        {person.name}
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <h3>Members</h3>
            <div className="members">
              {members.map((person) => (
                <div key={person._id} className="row">
                  <Face id={person._id} size={20} />
                  <span className="clip">{person.name}</span>
                  <small>{person.email}</small>
                  <Button
                    className="remove"
                    aria-label={`Remove ${person.name} from ${group.name}`}
                    onClick={async () => {
                      const yes = await confirm({
                        title: `Remove ${person.name} from ${group.name}?`,
                        description:
                          "They stay in threads they're already in, and mentioning the group won't bring them in again.",
                        confirmLabel: "Remove",
                      });
                      if (yes)
                        setMembers(
                          members.filter(({ _id }) => _id !== person._id).map(({ _id }) => _id),
                        );
                    }}
                  >
                    <Icon name="trash" />
                  </Button>
                </div>
              ))}
              {!members.length && (
                <p>Add people, then mention {group.name} in a thread to bring them all in.</p>
              )}
            </div>
            <footer>
              <Button
                className="text danger"
                onClick={async () => {
                  const yes = await confirm({
                    title: `Delete ${group.name}?`,
                    description: "Threads it was mentioned in keep everyone already in them.",
                    confirmLabel: "Delete",
                  });
                  if (yes) await remove({ id: group._id }).then(() => open(""));
                }}
              >
                Delete Group
              </Button>
            </footer>
          </>
        ) : (
          <p>Mention a group to bring everyone in it into a thread. Create one to start.</p>
        )}
      </div>
    </TabsPanel>
  );
}

export function Settings() {
  const me = useMe()!;
  const buckets = useBuckets();
  const { value } = usePreference(theme);
  const shown = usePreference(previews).value;
  const { signOut } = useAuthActions();

  return (
    <Dialog open onOpenChange={(open) => !open && setDialog(null)}>
      <DialogContent className="panel settings">
        <DialogTitle className="hidden">Settings</DialogTitle>
        <Tabs defaultValue={useUI.getState().tab} orientation="vertical">
          <TabsList aria-label="Settings">
            {["Workspaces", "Account", "Appearance", "Buckets", "Groups"].map((title) => (
              <TabsTab key={title} value={title}>
                {title}
              </TabsTab>
            ))}
          </TabsList>

          <Workspaces />

          <Section title="Account" hint="Signed in with Google.">
            <div className="row">
              <Face id={me._id} size={20} />
              <span className="clip">{me.name}</span>
              <small>{me.email}</small>
              <Button onClick={() => void signOut().then(reset)}>Sign Out</Button>
            </div>
          </Section>

          <Section
            title="Appearance"
            hint={`How Arc looks ${window.desktop ? "on this Mac" : "in this browser"}.`}
          >
            <div className="row">
              <span className="clip">Theme</span>
              <SegmentedControl
                aria-label="Theme"
                value={value}
                onValueChange={(next) => next && theme.set(next as typeof value)}
              >
                <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
                <SegmentedControlItem value="light">Light</SegmentedControlItem>
              </SegmentedControl>
            </div>
            <div className="row">
              <span className="clip">Previews of images and links</span>
              <SegmentedControl
                aria-label="Previews of images and links"
                value={shown}
                onValueChange={(next) => next && previews.set(next as typeof shown)}
              >
                <SegmentedControlItem value="on">On</SegmentedControlItem>
                <SegmentedControlItem value="off">Off</SegmentedControlItem>
              </SegmentedControl>
            </div>
          </Section>

          <Section
            title="Buckets"
            hint="A new thread goes to the bucket whose description fits it best."
          >
            {buckets.map((bucket) => (
              <Bucket key={bucket._id} bucket={bucket} />
            ))}
            <Bucket key={buckets.length} />
          </Section>

          <Groups />
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
