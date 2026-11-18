import { useAuthActions } from "@convex-dev/auth/react";
import { confirm } from "@ui-sdk/react/alert-dialog";
import { Button } from "@ui-sdk/react/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@ui-sdk/react/combobox";
import { Dialog, DialogContent, DialogTitle } from "@ui-sdk/react/dialog";
import { Input } from "@ui-sdk/react/input";
import { usePreference } from "@ui-sdk/react/preferences";
import { SegmentedControl, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { Textarea } from "@ui-sdk/react/textarea";
import { useMutation } from "convex/react";
import { useState, type FocusEvent, type ReactNode } from "react";
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
import { Identicon } from "./Identicon";
import { previews, reset, setDialog, switched, theme, useUI } from "./state";

const saveOnLeave = (event: FocusEvent<HTMLFormElement>) => {
  if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.requestSubmit();
};

function Section(props: {
  title: string;
  heading?: string;
  hint: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <TabsPanel value={props.title}>
      <header>
        <h2>{props.heading ?? props.title}</h2>
        {props.actions}
      </header>
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

export function Members(props: {
  of: string;
  people: { _id: Id<"users">; name: string }[];
  defaultValue: Id<"users">[];
  autoFocus?: boolean;
  onChange: (userIds: Id<"users">[]) => void;
}) {
  const [userIds, setUserIds] = useState(props.defaultValue);
  return (
    <Combobox
      multiple
      autoHighlight
      value={userIds}
      itemToLabel={(id) => props.people.find((person) => person._id === id)?.name ?? ""}
      onValueChange={(next) => {
        setUserIds(next as Id<"users">[]);
        props.onChange(next as Id<"users">[]);
      }}
    >
      <ComboboxChips className="chips">
        <ComboboxValue>
          {(state) =>
            (state.value as Id<"users">[]).map((id, index) => (
              <ComboboxChip key={id} value={id}>
                {state.labels[index]}
                <ComboboxChipRemove aria-label={`Remove ${state.labels[index]} from ${props.of}`}>
                  ×
                </ComboboxChipRemove>
              </ComboboxChip>
            ))
          }
        </ComboboxValue>
        <ComboboxInput
          aria-label={`Add people to ${props.of}`}
          placeholder="Add people"
          autoFocus={props.autoFocus}
        />
      </ComboboxChips>
      <ComboboxContent className="panel menu" align="start" sideOffset={4}>
        <ComboboxEmpty>Nobody by that name</ComboboxEmpty>
        <ComboboxList>
          {props.people
            .filter((person) => !userIds.includes(person._id))
            .map((person) => (
              <ComboboxItem key={person._id} value={person._id} label={person.name}>
                <Identicon seed={person._id} size={16} />
                {person.name}
              </ComboboxItem>
            ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

const count = (people: number) => (people === 1 ? "1 person" : `${people} people`);

function Current(props: { people: number }) {
  const me = useMe()!;
  const owner = me.role === "owner";
  const people = usePeople();
  const pending = usePending();
  const copyInvite = useCopyInvite();
  const resetLink = useMutation(api.workspace.resetLink);
  const invite = useMutation(api.workspace.invite);
  const revoke = useMutation(api.workspace.revoke);
  const rename = useMutation(api.workspace.rename);
  const removePerson = useMutation(api.workspace.removePerson);
  const leave = useMutation(api.workspace.leave);
  const removeWorkspace = useMutation(api.workspace.removeWorkspace);
  const [copied, setCopied] = useState("");

  return (
    <section className="current">
      <div className="row">
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
        <small>Current · {count(props.people)}</small>
      </div>
      <form
        className="row"
        action={async (form) => {
          const emails = String(form.get("emails"))
            .split(/[\s,;]+/)
            .filter(Boolean);
          if (emails.length) await invite({ emails });
        }}
      >
        <Input
          name="emails"
          aria-label="Email addresses to invite"
          placeholder="name@company.com"
        />
        <Button type="submit">Invite</Button>
      </form>
      {people.map((person) => (
        <div key={person._id} className="row">
          <Identicon seed={person._id} size={20} />
          <span className="clip">{person.name}</span>
          <small>{person.role === "owner" ? "Owner" : person.email}</small>
          {owner && person._id !== me._id && (
            <Button
              className="quiet"
              onClick={async () => {
                const yes = await confirm({
                  title: `Remove ${person.name}?`,
                  description: `They leave ${me.workspace} and its threads.`,
                  confirmLabel: "Remove",
                });
                if (yes) await removePerson({ userId: person._id });
              }}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      {pending.map((invitation) => (
        <div key={invitation._id} className="row">
          <span className="clip">{invitation.email}</span>
          <small>Invited</small>
          <Button className="quiet" onClick={() => void revoke({ id: invitation._id })}>
            Revoke
          </Button>
        </div>
      ))}
      <div className="row">
        <span className="clip">Invite link</span>
        {owner && (
          <Button className="text" onClick={() => void resetLink().then(() => setCopied(""))}>
            Reset
          </Button>
        )}
        <Button onClick={() => void copyInvite().then(() => setCopied(me.workspaceId!))}>
          {copied === me.workspaceId ? "Copied" : "Copy Link"}
        </Button>
      </div>
      <div className="row">
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
      </div>
    </section>
  );
}

function Workspaces() {
  const me = useMe()!;
  const workspaces = useWorkspaces();
  const { invitations, accept, decline } = useInvitations();
  const open = useMutation(api.workspace.open);
  const actions = (
    <>
      <Button className="text" onClick={() => setDialog("workspace", "start")}>
        Create
      </Button>
      <Button className="text" onClick={() => setDialog("workspace", "join")}>
        Join
      </Button>
    </>
  );

  return (
    <Section title="Workspaces" hint="Your workspaces. Open one to switch to it." actions={actions}>
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
      {workspaces.map((workspace) =>
        workspace._id === me.workspaceId ? (
          <Current key={workspace._id} people={workspace.people} />
        ) : (
          <Button
            key={workspace._id}
            className="row workspace"
            onClick={() => void open({ id: workspace._id }).then(() => switched("settings"))}
          >
            <span className="clip">{workspace.name}</span>
            <small>{count(workspace.people)}</small>
          </Button>
        ),
      )}
    </Section>
  );
}

function Group(props: { group?: Doc<"groups">; added?: boolean; onAdd?: (name: string) => void }) {
  const { group } = props;
  const people = usePeople();
  const save = useMutation(api.workspace.saveGroup);
  const remove = useMutation(api.workspace.removeGroup);
  const of = group?.name ?? "a new group";
  return (
    <form
      className="row"
      onBlur={saveOnLeave}
      action={async (form) => {
        const name = String(form.get("name")).trim();
        if (!name || name === group?.name) return;
        props.onAdd?.(name);
        await save({ id: group?._id, name, userIds: group?.userIds ?? [] });
      }}
    >
      <Input
        name="name"
        className="name"
        aria-label={`Name of ${of}`}
        placeholder="Add a group"
        defaultValue={group?.name}
      />
      {group && (
        <>
          <Members
            of={of}
            people={people}
            defaultValue={group.userIds}
            autoFocus={props.added}
            onChange={(userIds) => void save({ id: group._id, name: group.name, userIds })}
          />
          <Button className="quiet" onClick={() => void remove({ id: group._id })}>
            Delete
          </Button>
        </>
      )}
    </form>
  );
}

export function Settings() {
  const me = useMe()!;
  const groups = useGroups();
  const buckets = useBuckets();
  const { value } = usePreference(theme);
  const shown = usePreference(previews).value;
  const [added, setAdded] = useState("");
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
              <Identicon seed={me._id} size={20} />
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

          <Section
            title="Groups"
            hint="Mention a group to bring everyone in it into a thread. A new group starts empty."
          >
            {groups.map((group) => (
              <Group key={group._id} group={group} added={group.name === added} />
            ))}
            <Group key={groups.length} onAdd={setAdded} />
          </Section>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
