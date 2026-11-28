import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Preferences, usePreference } from "@ui-sdk/react/preferences";
import { Authenticated, ConvexReactClient, Unauthenticated, useMutation } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import { Component, StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { api, useMe } from "./data";
import { Landing } from "./Landing";
import { SignIn, Start } from "./SignIn";
import { choices, density, invite, switched, theme } from "./state";
import "./app.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
document.documentElement.toggleAttribute("data-desktop", !!window.desktop);

const kept = (change: () => void) => (change(), window.desktop?.saved());
const storage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => kept(() => localStorage.setItem(key, value)),
  removeItem: (key: string) => kept(() => localStorage.removeItem(key)),
};

class UntilSignedOut extends Component<{ children: ReactNode }> {
  state = { over: false };
  static getDerivedStateFromError = () => ({ over: true });
  render = () => (this.state.over ? null : this.props.children);
}

function Theme() {
  const { value } = usePreference(theme);
  const compact = usePreference(density).value === "compact";
  useEffect(() => window.desktop?.setTheme(value), [value]);
  useEffect(() => window.desktop?.setCompact(compact), [compact]);
  return null;
}

function Home() {
  const me = useMe();
  const join = useMutation(api.workspace.join);
  const [joined, setJoined] = useState(false);
  const joining = !joined && me && invite;
  useEffect(() => {
    if (joining)
      void join({ link: joining }).then(() => {
        history.replaceState(null, "", "/");
        switched();
        setJoined(true);
      });
  }, [joining]);
  return me && !joining && (me.workspaceId ? <App /> : <Start />);
}

const root = createRoot(document.getElementById("root")!);
import.meta.hot?.dispose(() => {
  root.unmount();
  void convex.close();
});
root.render(
  <StrictMode>
    <main className="welcome soon">
      <div>
        <h1>Mobile app coming soon</h1>
        <p>For now, open Arc on a computer.</p>
      </div>
    </main>
    <ConvexAuthProvider client={convex} api={api.auth} storage={storage}>
      <ConvexQueryCacheProvider>
        <Preferences preferences={choices.map((choice) => choice.preference)}>
          <Theme />
          <Unauthenticated>{window.desktop || invite ? <SignIn /> : <Landing />}</Unauthenticated>
          <Authenticated>
            <UntilSignedOut>
              <Home />
            </UntilSignedOut>
          </Authenticated>
        </Preferences>
      </ConvexQueryCacheProvider>
    </ConvexAuthProvider>
  </StrictMode>,
);
