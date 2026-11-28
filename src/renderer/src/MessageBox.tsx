import { Button } from "@ui-sdk/react/button";
import {
  createFileInputController,
  FileInput,
  FileInputDropzone,
  FileInputItem,
  FileInputItemRemove,
  FileInputList,
  FileInputTrigger,
  formatFileSize,
} from "@ui-sdk/react/file-input";
import {
  createTokenInputController,
  fromText,
  toText,
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
  type TokenCodec,
} from "@ui-sdk/react/token-input";
import {
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuItem,
  TriggerMenuList,
  type TriggerMenuDataItem,
} from "@ui-sdk/react/trigger-menu";
import { usePreference } from "@ui-sdk/react/preferences";
import { useShortcut } from "@ui-sdk/react/shortcuts";
import { useEffect, useMemo, useState } from "react";
import {
  FILE_LIMIT,
  mentions,
  parts,
  useDocuments,
  useGroups,
  useMe,
  useNames,
  usePeople,
  useUpload,
  type Attached,
} from "./data";
import { Icon, type IconName } from "./Icon";
import { Face } from "./Face";
import { sending, useUI } from "./state";

const KINDS: [IconName, string][] = [
  ["image", "png jpg jpeg gif webp heic svg bmp tiff"],
  ["video", "mp4 mov mkv webm avi"],
  ["audio", "mp3 wav m4a aac flac ogg"],
  ["doc", "pdf doc docx txt md rtf pages"],
  ["sheet", "csv tsv xls xlsx numbers"],
  ["zip", "zip gz tar rar 7z dmg"],
  ["code", "js jsx ts tsx json html css py go rs sh yml yaml swift"],
];
const TYPES: Record<string, string> = {
  pdf: "PDF",
  txt: "Plain Text",
  md: "Markdown",
  doc: "Word Document",
  docx: "Word Document",
  xls: "Excel Spreadsheet",
  xlsx: "Excel Spreadsheet",
  pages: "Pages Document",
  numbers: "Numbers Spreadsheet",
  zip: "Zip Archive",
};
const extensionOf = (name: string) =>
  name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
export const kindOf = (name: string) =>
  KINDS.find(([, extensions]) => extensions.split(" ").includes(extensionOf(name)))?.[0] ??
  "attach";
export const typeOf = (name: string) =>
  TYPES[extensionOf(name)] ?? (extensionOf(name).toUpperCase() || "File");
const KindIcon = ({ name, size }: { name: string; size?: number }) => {
  const kind = kindOf(name);
  return <Icon name={kind} size={size} color={`var(--${kind})`} />;
};

const FileLabel = ({ name, size }: { name: string; size: number }) => (
  <>
    <KindIcon name={name} size={13} />
    <span className="clip">{name}</span>
    <small>{formatFileSize(size)}</small>
  </>
);

export function MessageBox(props: {
  label: string;
  placeholder: string;
  defaultText?: string;
  input?: ReturnType<typeof createTokenInputController>;
  mustMention?: boolean;
  modal?: boolean;
  onSend: (body: string, files: Attached[]) => void;
  onChange?: (text: string) => void;
  onCancel?: () => void;
}) {
  const me = useMe();
  const people = usePeople();
  const groups = useGroups();
  const documents = useDocuments();
  const { name } = useNames();
  const [own] = useState(createTokenInputController);
  const input = props.input ?? own;
  const dialog = useUI((ui) => ui.dialog);
  const send = usePreference(sending).value;
  const key = send === "enter" ? "↵" : "⌘↵";
  const editing = !!props.onCancel;
  const [files] = useState(createFileInputController);
  const upload = useUpload();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const deliver = async (body: string) => {
    setBusy(true);
    setNote("");
    try {
      props.onSend(body, await Promise.all(files.getValue().map(upload)));
      input.clear();
      files.clear();
    } catch {
      setNote("A file didn't upload. Send again to retry.");
    }
    setBusy(false);
  };
  useShortcut(editing ? "escape" : null, () => props.onCancel?.(), {
    allowInInput: true,
    description: "Cancel editing",
  });
  useEffect(() => {
    if (editing) input.focus({ at: "end" });
  }, []);
  const reaches = (body: string) =>
    mentions(body, "person").some((id) => id !== me?._id) ||
    mentions(body, "group").some((id) =>
      groups.find((group) => group._id === id)?.userIds.some((userId) => userId !== me?._id),
    );

  const codec = useMemo<TokenCodec>(
    () => ({
      format: (token) => `[[${token.value}]]`,
      parse: (text) =>
        parts(text).map((part) =>
          typeof part === "string"
            ? part
            : {
                type: part.kind === "file" ? "file" : "mention",
                value: `${part.kind}:${part.id}`,
                label: name(part.id),
              },
        ),
    }),
    [name],
  );
  const mentionable = [
    ...people
      .filter((person) => person._id !== me?._id)
      .map((person) => ({ value: `person:${person._id}`, label: person.name })),
    ...groups.map((group) => ({ value: `group:${group._id}`, label: group.name })),
  ];

  return (
    <FileInput
      multiple
      disabled={editing}
      maxSize={FILE_LIMIT}
      controller={files}
      onReject={() => setNote(`Files can be up to ${formatFileSize(FILE_LIMIT)}.`)}
    >
      <FileInputDropzone
        className="compose"
        target={!editing && (props.modal || !dialog) ? "document" : undefined}
        data-busy={busy || undefined}
      >
        <TokenInput
          controller={input}
          codec={codec}
          defaultValue={fromText(props.defaultText ?? "", codec)}
          submitShortcut={send}
          onValueChange={(value) => {
            setNote("");
            props.onChange?.(toText(value, codec));
          }}
          onSubmit={(value) => {
            const body = toText(value, codec).trim();
            if ((!body && !files.getValue().length) || busy) return;
            if (props.mustMention && !reaches(body))
              return setNote(
                mentions(body, "group").length
                  ? "Nobody else is in that group yet. Add people to it in Settings."
                  : "@mention someone to send this to.",
              );
            void deliver(body);
          }}
          renderToken={(token) => (
            <TokenInputToken className="mention">
              {token.type === "file" ? "" : "@"}
              {token.label}
            </TokenInputToken>
          )}
        >
          <TokenInputEditor
            className="editor"
            aria-label={props.label}
            placeholder={`${props.placeholder}, ${key} to ${editing ? "save" : "send"}`}
          />
          <TriggerMenu
            triggers={[
              { char: "@", type: "mention", items: mentionable },
              ...(editing
                ? []
                : [
                    {
                      char: "/",
                      boundary: "word" as const,
                      type: "file",
                      items: documents.map((file) => ({
                        value: `file:${file._id}`,
                        label: file.name,
                      })),
                    },
                  ]),
            ]}
          >
            <TriggerMenuContent className="panel options" sideOffset={6}>
              <TriggerMenuList>
                {(state) =>
                  (state.items as TriggerMenuDataItem<string>[]).map((item) => (
                    <TriggerMenuItem key={item.value} value={item.value} label={item.label}>
                      {item.value.startsWith("file:") ? (
                        <KindIcon name={item.label} />
                      ) : (
                        <Face id={item.value.split(":")[1]} name={item.label} size={18} />
                      )}
                      {item.label}
                    </TriggerMenuItem>
                  ))
                }
              </TriggerMenuList>
            </TriggerMenuContent>
          </TriggerMenu>
        </TokenInput>
        {!editing && (
          <FileInputTrigger aria-label="Attach files">
            <Icon name="attach" />
          </FileInputTrigger>
        )}
        <FileInputList aria-label="Attachments" className="files">
          <FileInputItem className="file">
            {({ file }) => (
              <>
                <Button
                  className="open"
                  onClick={async () => window.desktop?.preview(file.name, await file.arrayBuffer())}
                >
                  <FileLabel name={file.name} size={file.size} />
                </Button>
                <FileInputItemRemove>×</FileInputItemRemove>
              </>
            )}
          </FileInputItem>
        </FileInputList>
      </FileInputDropzone>
      {editing && <small className="hint">esc to cancel, {key} to save</small>}
      {note && (
        <p className="alone" role="alert">
          {note}
        </p>
      )}
    </FileInput>
  );
}
