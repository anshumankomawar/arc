# Arc

Team messaging in threads: a Mac app, the same app as a website at arcteams.chat, and an iPhone app, all on one
Convex backend.

## Get started

You need a Mac, [Bun](https://bun.sh) and a [Convex](https://convex.dev) account. Ask to be added to the Convex team
that owns Arc if you'll deploy the shared backend, and to the Cloudflare account if you'll publish the website.

```sh
bun install
bun run convex   # the backend: signs you in to Convex, creates your own dev deployment, writes .env.local, watches convex/
bun run dev      # the desktop app, against that dev deployment
```

Your dev deployment needs a few settings before you can sign in. Run these once, in another terminal while
`bun run convex` is running:

```sh
bunx convex env set SITE_URL http://localhost:5173   # where invite links point, and where Google may return to
bunx convex env set AUTH_GOOGLE_CLIENT_ID ...
bunx convex env set AUTH_GOOGLE_CLIENT_SECRET ...
```

The Google id and secret come from a Google Cloud OAuth client (Web application) whose redirect URI is your deployment's
site URL (`VITE_CONVEX_SITE_URL` in `.env.local`) followed by `/oauth/google/callback`. Convex Auth signs its sessions
with the deployment's own key, so nothing else is needed to sign in.

Two keys are optional. Without `ANTHROPIC_API_KEY`, new threads are never sorted into buckets (they show only in All
Threads) and Search can't ask a model which threads a question is about (Ask Arc). Without `VOYAGE_API_KEY`, Search
finds messages by their words only, not by meaning:

```sh
bunx convex env set ANTHROPIC_API_KEY ...
bunx convex env set VOYAGE_API_KEY ...
```

People sign in with Google. A new account has no workspace: it creates one, or joins one through the invite link
a member copied from Settings. Google returns the desktop app its sign-in through `http://127.0.0.1:47201`, which the
app listens on only while you sign in.

To try the app with a team that talks back, sign in, create a workspace, then fill it with four simulated teammates who
post into threads every 20 seconds:

```sh
bunx convex run simulate:start '{"email":"you@example.com"}'
```

## The website

arcteams.chat is the same app, built from `src/renderer` for the browser: sign-in, `/join/<code>` (where an invite link
leads and where signing in joins the workspace), then the workspace itself. Signed out, `/` is the landing page
(`Landing.tsx`): the sign-in screen over a picture of the app, drawn from its own components. The interface asks one
question about where it runs, whether `window.desktop` exists. Only the desktop has it, for signing in through the
system browser, the native theme and Quick Look.

```sh
bun run web   # http://localhost:5173, against your dev deployment
```

`bun run deploy:web` builds the site against the shared deployment and publishes it to Cloudflare with the `cf` CLI
(`cloudflare.config.ts` names it and sends every path to `index.html`).

## The iOS app

`ios/` is a SwiftUI app on the shared deployment, with what the desktop has: buckets, threads, replies with @mentions
and attachments, Sent, drafts, search, workspaces with invitations, and settings. Open
`ios/Arc.xcodeproj` in Xcode and run it. Google returns its sign-in through the same `http://127.0.0.1:47201` as the
desktop.

## The shared deployment

`bun run dev` talks to your own dev deployment, where you can break things. The built app and the website talk to the
one everyone shares, so that is where real conversations live. Its addresses go in `.env.production` (gitignored),
which you create once:

```sh
VITE_CONVEX_URL=https://uncommon-ibis-769.convex.cloud
VITE_CONVEX_SITE_URL=https://uncommon-ibis-769.convex.site
```

Then:

```sh
bun run build && bunx electron-vite preview   # the app, on the shared deployment
bunx convex deploy                            # the backend in convex/, to the shared deployment
```

Deploy the backend when `convex/` changes on the `convex` branch. Its keys are set with `bunx convex env set --prod`.

## Releasing the Mac app

Arc is downloaded from the website, not the App Store. A release is signed with the team's Developer ID, notarized by
Apple, and uploaded to the `arc-downloads` R2 bucket, which https://downloads.arcteams.chat serves:
`https://downloads.arcteams.chat/Arc.dmg` is the download, and `latest-mac.yml` with its zip is what installed copies
check every few hours and install when they quit (`electron-updater`).

Once, on the Mac that releases:

1. A **Developer ID Application** certificate in the login keychain (Xcode, Settings, Accounts, Manage Certificates;
   only the team's Account Holder can create one).
2. Credentials for notarizing: an **app-specific password** for the developer account's Apple ID
   (appleid.apple.com, Sign-In and Security) and the **Team ID** (developer.apple.com, Membership). An App Store
   Connect API key (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`) works instead.
3. An **R2 API token** with Object Read & Write on `arc-downloads` (Cloudflare, R2, Manage API tokens).
4. `.env.release` in the repo root (it's gitignored):

   ```sh
   APPLE_ID=you@example.com
   APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
   APPLE_TEAM_ID=XXXXXXXXXX
   AWS_ACCESS_KEY_ID=...       # the R2 token's Access Key ID
   AWS_SECRET_ACCESS_KEY=...   # and its Secret Access Key
   ```

Each release: raise `version` in `package.json`, then

```sh
bun run release:mac
```

It builds against the shared deployment, makes one universal app for Apple silicon and Intel, signs, notarizes and
uploads it, and clears the cached `Arc.dmg` so the download link gives the new one. Copies already installed update
themselves.

## Check it

```sh
bun run test     # the backend's rules (delivery, access, files, links), against an in-memory Convex
bun run build    # types, then the app
bun run format   # Prettier, which every file follows
```

## Where things are

- `convex/` is the backend: the schema, `threads.ts` (what a message does), `workspace.ts`, `auth.ts`, `ai.ts`
  (sorting into buckets), `search.ts` (search by meaning, Ask Arc) and `files.ts` (attachments: uploaded to Convex
  storage, and downloaded only through the `/file` route in `http.ts`, which checks the caller is in the thread and lets
  the browser cache the bytes) and `links.ts` (a link in a
  message is fetched once, from Convex, for its title, description and image).
- `src/main` is the Electron window and `src/preload` the few things it lends the page (`window.desktop`).
  `src/renderer` is the interface, for the desktop and the website alike, built from ui-sdk components (see
  `AGENTS.md`). `commands.ts` is every command, with its keys; the palette, the shortcuts and their hints all read it.
  `state.ts` holds the settings and where you are; `data.ts` the queries, mutations and their optimistic updates.
- `tests/` runs the backend against an in-memory Convex. `ios/` is the iPhone app.
