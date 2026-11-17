import { useAuthActions } from "@convex-dev/auth/react";
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
  ComboboxItemIndicator,
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
  usePeople,
  useRemoveBucket,
  type Doc,
  type Id,
} from "./data";
import { Identicon } from "./Identicon";
import { previews, reset, setDialog, theme, useUI } from "./state";

const saveOnLeave = (event: FocusEvent<HTMLFormElement>) => {
  if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.requestSubmit();
};

function Section(props: { title: string; heading?: string; hint: string; children: ReactNode }) {
  return (
    <TabsPanel value={props.title}>
      <h2>{props.heading ?? props.title}</h2>
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
  return (
    <Combobox
      multiple
      autoHighlight
      defaultValue={props.defaultValue}
      itemToLabel={(id) => props.people.find((person) => person._id === id)?.name ?? ""}
      onValueChange={(userIds, details) =>
        details.reason !== "reset" && props.onChange(userIds as Id<"users">[])
      }
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
          {props.people.map((person) => (
            <ComboboxItem key={person._id} value={person._id} label={person.name}>
              <Identicon seed={person._id} size={16} />
              <span className="clip">{person.name}</span>
              <ComboboxItemIndicator>✓</ComboboxItemIndicator>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
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
  const people = usePeople();
  const groups = useGroups();
  const buckets = useBuckets();
  const { value } = usePreference(theme);
  const shown = usePreference(previews).value;
  const copyInvite = useCopyInvite();
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState("");
  const { signOut } = useAuthActions();

  return (
    <Dialog open onOpenChange={(open) => !open && setDialog(null)}>
      <DialogContent className="panel settings">
        <DialogTitle className="hidden">Settings</DialogTitle>
        <Tabs defaultValue={useUI.getState().tab} orientation="vertical">
          <TabsList aria-label="Settings">
            {["Workspace", "Account", "Appearance", "Buckets", "Groups"].map((title) => (
              <TabsTab key={title} value={title}>
                {title}
              </TabsTab>
            ))}
          </TabsList>

          <Section
            title="Workspace"
            heading={me.workspace}
            hint="Everyone in this workspace. Anyone you send the invite link to can join."
          >
            <div className="people">
              {people.map((person) => (
                <div key={person._id} className="row">
                  <Identicon seed={person._id} size={20} />
                  <span className="clip">{person.name}</span>
                  <small>{person.email}</small>
                </div>
              ))}
            </div>
            <div className="row">
              <span className="clip">Invite people</span>
              <Button onClick={() => void copyInvite().then(() => setCopied(true))}>
                {copied ? "Copied" : "Copy Invite Link"}
              </Button>
            </div>
          </Section>

          <Section title="Account" hint="Signed in with Google.">
            <div className="row">
              <Identicon seed={me._id} size={20} />
              <span className="clip">{me.name}</span>
              <small>{me.email}</small>
              <Button onClick={() => void signOut().then(reset)}>Sign Out</Button>
            </div>
          </Section>

          <Section title="Appearance" hint="How Arc looks on this Mac.">
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
