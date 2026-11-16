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
import { useMemo, useState } from "react";
import {
  FILE_LIMIT,
  mentions,
  parts,
  useGroups,
  useMe,
  useNames,
  usePeople,
  useUpload,
  type Attached,
} from "./data";
import { Icon } from "./Icon";
import { Identicon } from "./Identicon";

export const FileLabel = ({ name, size }: { name: string; size: number }) => (
  <>
    <Icon name="attach" size={13} />
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
  onSend: (body: string, files: Attached[]) => void;
  onChange?: (text: string) => void;
}) {
  const me = useMe();
  const people = usePeople();
  const groups = useGroups();
  const { name } = useNames();
  const [own] = useState(createTokenInputController);
  const input = props.input ?? own;
  const [files] = useState(createFileInputController);
  const upload = useUpload();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (body: string) => {
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
            : { type: "mention", value: `${part.kind}:${part.id}`, label: name(part.id) },
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
      maxSize={FILE_LIMIT}
      controller={files}
      onReject={() => setNote(`Files can be up to ${formatFileSize(FILE_LIMIT)}.`)}
    >
      <FileInputDropzone className="compose" data-busy={busy || undefined}>
        <TokenInput
          controller={input}
          codec={codec}
          defaultValue={fromText(props.defaultText ?? "", codec)}
          submitShortcut="mod+enter"
          onValueChange={(value) => {
            setNote("");
            props.onChange?.(toText(value, codec));
          }}
          onSubmit={(value) => {
            const body = toText(value, codec).trim();
            if (!body || busy) return;
            if (props.mustMention && !reaches(body))
              return setNote("@mention someone to send this to.");
            void send(body);
          }}
          renderToken={(token) => (
            <TokenInputToken className="mention">@{token.label}</TokenInputToken>
          )}
        >
          <TokenInputEditor
            className="editor"
            aria-label={props.label}
            placeholder={props.placeholder}
          />
          <TriggerMenu triggers={[{ char: "@", type: "mention", items: mentionable }]}>
            <TriggerMenuContent className="panel options" sideOffset={6}>
              <TriggerMenuList>
                {(state) =>
                  (state.items as TriggerMenuDataItem<string>[]).map((item) => (
                    <TriggerMenuItem key={item.value} value={item.value} label={item.label}>
                      <Identicon seed={item.value.split(":")[1]} size={18} />
                      {item.label}
                    </TriggerMenuItem>
                  ))
                }
              </TriggerMenuList>
            </TriggerMenuContent>
          </TriggerMenu>
        </TokenInput>
        <FileInputTrigger aria-label="Attach files">
          <Icon name="attach" />
        </FileInputTrigger>
        <FileInputList aria-label="Attachments" className="files">
          <FileInputItem className="file">
            {({ file }) => (
              <>
                <span
                  className="open"
                  onClick={async () => window.desktop.preview(file.name, await file.arrayBuffer())}
                >
                  <FileLabel name={file.name} size={file.size} />
                </span>
                <FileInputItemRemove>×</FileInputItemRemove>
              </>
            )}
          </FileInputItem>
        </FileInputList>
      </FileInputDropzone>
      {note && (
        <p className="alone" role="alert">
          {note}
        </p>
      )}
    </FileInput>
  );
}
