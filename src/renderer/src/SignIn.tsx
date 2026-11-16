import { useSignInWithGoogle } from "@convex-dev/auth/methods/google/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "./data";
import { Icon } from "./Icon";
import { reset } from "./state";

const loaded = Promise.race([
  Promise.all([
    document.fonts.load('300 36px "Fraunces"'),
    document.fonts.load('400 14px "Hanken Grotesk"'),
  ]),
  new Promise((resolve) => setTimeout(resolve, 1000)),
]);

export const invite = location.pathname.match(/^\/join\/([\w-]+)/)?.[1];

function useLoopback() {
  const { setSession } = useAuthActions();
  const start = useMutation(api.auth.startSignInWithGoogle);
  const complete = useMutation(api.auth.completeSignInWithGoogle);
  return async () => {
    const { redirect, state } = await start({ redirectTo: "http://127.0.0.1:47201/" });
    const code = await window.desktop!.google(redirect);
    const result = code ? await complete({ code, state }) : undefined;
    if (result?.status !== "complete") throw new Error("Not signed in");
    await setSession(result.tokens);
  };
}
function useRedirect() {
  const { signIn } = useSignInWithGoogle(api.auth);
  return () => signIn();
}
const useGoogle = window.desktop ? useLoopback : useRedirect;

export function SignIn() {
  const google = useGoogle();
  const workspace = useQuery(api.workspace.invited, invite ? { invite } : "skip");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void loaded.then(() => setReady(true));
  }, []);

  const signIn = async () => {
    setBusy(true);
    setFailed(false);
    await google().catch(() => setFailed(true));
    setBusy(false);
  };
  const title = workspace ? `You’re invited to ${workspace}` : "Where decisions don’t get lost";

  return (
    <main className="welcome">
      {ready && (!invite || workspace !== undefined) && (
        <div>
          <h1>
            {title.split(" ").map((word, index) => (
              <span key={index} style={{ animationDelay: `${80 + index * 80}ms` }}>
                {word}{" "}
              </span>
            ))}
          </h1>
          <p>
            {workspace
              ? "Sign in with your Google account to accept the invite."
              : "Arc is team messaging in threads that sort themselves. Sign in with your Google account."}
          </p>
          <Button onClick={signIn} disabled={busy}>
            {busy ? <i /> : <Icon name="google" size={18} />}
            Continue with Google
          </Button>
          {failed && <p role="alert">Signing in with Google didn't finish.</p>}
          {workspace === null && <p role="alert">That invite link doesn't lead to a workspace.</p>}
        </div>
      )}
    </main>
  );
}

export function Start() {
  const create = useMutation(api.workspace.create);
  const join = useMutation(api.workspace.join);
  const { signOut } = useAuthActions();
  const [mode, setMode] = useState("start");
  const [failed, setFailed] = useState(false);
  const joining = mode === "join";
  const label = joining ? "Invite link" : "Workspace name";
  const enter = async (text: string) => {
    if (joining) setFailed(!(await join({ link: text })));
    else await create({ name: text.trim() });
  };

  return (
    <main className="welcome">
      <div>
        <h1>Welcome to Arc</h1>
        <p>
          {joining
            ? "Paste the invite link a teammate sent you."
            : "Start a workspace for your team."}
        </p>
        <SegmentedControl
          aria-label="Start or join"
          value={mode}
          onValueChange={(next) => (setMode(next ?? mode), setFailed(false))}
        >
          <SegmentedControlIndicator />
          <SegmentedControlItem value="start">Start</SegmentedControlItem>
          <SegmentedControlItem value="join">Join</SegmentedControlItem>
        </SegmentedControl>
        <form action={(form) => enter(String(form.get("text")))}>
          <Field key={mode} name="text">
            <FieldLabel className="hidden">{label}</FieldLabel>
            <Input placeholder={label} required autoFocus />
          </Field>
          <Button type="submit">{joining ? "Join Workspace" : "Create Workspace"}</Button>
        </form>
        {failed && <p role="alert">That link doesn't lead to a workspace.</p>}
        <Button className="link" onClick={() => void signOut().then(reset)}>
          Sign Out
        </Button>
      </div>
    </main>
  );
}
