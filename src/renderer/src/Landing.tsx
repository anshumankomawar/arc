import { Button } from "@ui-sdk/react/button";
import { Listbox, ListboxGroup, ListboxGroupLabel, ListboxItem } from "@ui-sdk/react/listbox";
import { usePreference } from "@ui-sdk/react/preferences";
import { Icon, type IconName } from "./Icon";
import { Identicon } from "./Identicon";
import { useReady, Welcome } from "./SignIn";
import { theme } from "./state";

const boxes: [string, IconName, number?, boolean?][] = [
  ["All Threads", "archive"],
  ["Drafts", "draft"],
  ["Buckets", "inbox", 5],
  ["Needs Reply", "folder", 2, true],
  ["Decisions", "folder", 2, true],
  ["Updates", "folder", 1, true],
];
const groups = [
  {
    title: "Needs Reply",
    rows: [
      ["Annual discount on the pricing page", "Priya Shah", "Done, it's on staging.", "9:41"],
      ["Who owns the onboarding emails?", "Tom Becker", "I can take them from Friday.", "Tue"],
    ],
  },
  {
    title: "Decisions",
    rows: [
      ["Move the launch to the 14th", "Maya Okafor", "Agreed, the 14th. Closing this.", "Mon"],
      ["Drop the legacy import", "Daniel Reyes", "Nobody has used it since March.", "Nov 6"],
    ],
  },
  {
    title: "Updates",
    rows: [["Hiring: design lead", "Ines Duarte", "Two finalists, onsites next week.", "Nov 4"]],
  },
];
const turns = [
  [
    "Maya Okafor",
    "2d",
    <>
      <span className="mention">@Daniel</span> we need to settle the annual discount before the
      pricing page ships on Thursday. Finance is fine with anything up to 20%.
    </>,
  ],
  [
    "Daniel Reyes",
    "2d",
    "17% is what we already give on sales calls, so nobody gets a worse deal by buying online. I'd round it to two months free: it's easier to say.",
  ],
  [
    "Maya Okafor",
    "1d",
    <>
      Two months free it is. <span className="mention">@Priya</span> can you update the page?
    </>,
  ],
  ["Priya Shah", "9:41", "Done, it's on staging."],
] as const;

function Shot() {
  return (
    <figure className="window" inert>
      <div className="topbar">
        <div>
          <Icon name="layout" />
        </div>
        <div className="search">
          <Icon name="search" />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </div>
        <div>
          <Icon name="compose" />
          <Icon name="settings" />
        </div>
      </div>
      <div className="panes">
        <aside className="sidebar">
          <Listbox aria-label="Mailboxes" value="Needs Reply">
            {boxes.map(([label, icon, count, nested]) => (
              <ListboxItem key={label} value={label} className={nested ? "box nested" : "box"}>
                <Icon name={icon} color={`var(--${icon})`} />
                <span className="clip">{label}</span>
                {count && <span className="count">{count}</span>}
              </ListboxItem>
            ))}
          </Listbox>
        </aside>
        <section className="list">
          <Listbox aria-label="Threads" className="scroll" value={groups[0].rows[0][0]}>
            {groups.map((group) => (
              <ListboxGroup key={group.title}>
                <ListboxGroupLabel>
                  <Icon name="folder" color="var(--folder)" />
                  {group.title}
                  <small>{group.rows.length}</small>
                </ListboxGroupLabel>
                {group.rows.map(([title, author, text, time]) => (
                  <ListboxItem key={title} value={title} className="card">
                    <span className="line">
                      <b className="clip">{title}</b>
                      <time>{time}</time>
                    </span>
                    <span className="preview clip">
                      <b>{author}</b> {text}
                    </span>
                  </ListboxItem>
                ))}
              </ListboxGroup>
            ))}
          </Listbox>
        </section>
        <div className="thread">
          <article>
            {turns.map(([author, time, text]) => (
              <section key={author + time} className="turn">
                <Identicon seed={author} />
                <div>
                  <div className="meta">
                    <b>{author}</b>
                    <time>{time}</time>
                  </div>
                  <p className="text">{text}</p>
                </div>
              </section>
            ))}
          </article>
        </div>
      </div>
    </figure>
  );
}

export function Landing() {
  const { value } = usePreference(theme);
  const other = value === "dark" ? "light" : "dark";
  const icon = { light: "sun", dark: "moon" } as const;
  return (
    <main className="landing">
      {useReady() && (
        <>
          <header>
            Arc
            <Button aria-label={`Switch to ${other} theme`} onClick={() => theme.set(other)}>
              <Icon name={icon[value]} />
              <Icon name={icon[other]} />
            </Button>
          </header>
          <section className="welcome">
            <Welcome />
          </section>
          <Shot />
        </>
      )}
    </main>
  );
}
