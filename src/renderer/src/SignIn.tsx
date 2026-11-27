import { useSignInWithGoogle } from "@convex-dev/auth/methods/google/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@ui-sdk/react/button";
import { Dialog, DialogContent, DialogTitle } from "@ui-sdk/react/dialog";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api, useInvitations } from "./data";
import { Icon } from "./Icon";
import { invite, reset, setDialog, switched, useReady, useUI } from "./state";

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
const useRedirect = () => useSignInWithGoogle(api.auth).signIn;
const useGoogle = window.desktop ? useLoopback : useRedirect;

export function Welcome({ workspace }: { workspace?: string | null }) {
  const google = useGoogle();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const signIn = async () => {
    setBusy(true);
    setFailed(false);
    await google().catch(() => setFailed(true));
    setBusy(false);
  };
  const title = workspace ? `You’re invited to ${workspace}` : "Where decisions don’t get lost";

  return (
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
          ? "Sign in to accept the invite."
          : "Arc is team messaging in threads that sort themselves."}
      </p>
      <Button onClick={signIn} disabled={busy}>
        {busy ? <i /> : <Icon name="google" size={18} />}
        Continue with Google
      </Button>
      {failed && <p role="alert">Signing in with Google didn't finish.</p>}
      {workspace === null && <p role="alert">That invite link doesn't lead to a workspace.</p>}
    </div>
  );
}

export function SignIn() {
  const workspace = useQuery(api.workspace.invited, invite ? { invite } : "skip");
  const ready = useReady();
  return (
    <main className="welcome">
      {ready && (!invite || workspace !== undefined) && <Welcome workspace={workspace} />}
    </main>
  );
}

function Choice(props: { mode: string }) {
  const create = useMutation(api.workspace.create);
  const join = useMutation(api.workspace.join);
  const [mode, setMode] = useState(props.mode);
  const [failed, setFailed] = useState(false);
  const joining = mode === "join";
  const label = joining ? "Invite link" : "Workspace name";
  const enter = async (text: string) => {
    if (!joining) return void (await create({ name: text }), switched(), setDialog("settings"));
    const joined = await join({ link: text });
    setFailed(!joined);
    if (joined) switched();
  };

  return (
    <>
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
    </>
  );
}

export function AddWorkspace() {
  return (
    <Dialog open onOpenChange={(open) => !open && setDialog(null)}>
      <DialogContent className="panel welcome adding">
        <div>
          <DialogTitle render={<h1 />}>Add a workspace</DialogTitle>
          <Choice mode={useUI.getState().tab} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Start() {
  const { invitations, accept, decline } = useInvitations();
  const { signOut } = useAuthActions();

  return (
    <main className="welcome">
      <div>
        <h1>Welcome to Arc</h1>
        {invitations.map((invitation) => (
          <section key={invitation._id} className="invitation">
            <p>
              {invitation.from} invited you to {invitation.workspace}.
            </p>
            <Button onClick={() => void accept({ id: invitation._id })}>
              Join {invitation.workspace}
            </Button>
            <Button className="link" onClick={() => void decline({ id: invitation._id })}>
              Decline
            </Button>
          </section>
        ))}
        <Choice mode="start" />
        <Button className="link" onClick={() => void signOut().then(reset)}>
          Sign Out
        </Button>
      </div>
    </main>
  );
}
