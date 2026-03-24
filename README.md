# Vite Dynamic Workers Preview

A minimal proof of concept that turns a Vite dev session into a live Cloudflare preview URL.

Every successful save:

- builds the React app with Vite
- bundles a tiny edge API from `src/edge.ts`
- uploads the snapshot to a preview host Worker
- points a stable public URL at the latest Dynamic Worker version

The result is a tweetable demo: a local Vite project that keeps shipping a real public preview on every change.

## What is in here

- `packages/vite-plugin-dynamic-workers-preview` , a Vite plugin that watches local changes and pushes new snapshots to Cloudflare
- `apps/preview-host` , a small Worker with a Durable Object and the Worker Loader binding
- `apps/demo` , a React SPA that shows the current preview version and calls a tiny edge API

## How it works

1. `vite-plugin-dynamic-workers-preview` runs during `vite dev`.
2. On startup and on code changes, it triggers a production `vite build` into `.dynamic-workers-preview/dist`.
3. It base64-encodes the built assets, bundles `src/edge.ts` with `esbuild`, hashes the result, and `POST`s it to the preview host.
4. The preview host stores the latest versions inside a Durable Object.
5. Public requests to `/preview/:project/*` go through that Durable Object:
   - static assets are served from stored build artifacts
   - `/api/*` routes execute inside a Dynamic Worker loaded with `env.LOADER.get(versionId, ...)`
6. The preview URL stays fixed while the underlying Dynamic Worker version changes.

This repo intentionally keeps storage simple by using Durable Object storage for assets. For larger apps, the obvious next step is moving assets into R2 while keeping the same control plane.

## Quick start

```bash
npm install
```

### 1. Run the preview host locally

```bash
cp apps/preview-host/.dev.vars.example apps/preview-host/.dev.vars
```

Set a token in `apps/preview-host/.dev.vars`, then run:

```bash
cd apps/preview-host
npx wrangler dev --local --port 8787
```

### 2. Point the demo app at that host

```bash
cp apps/demo/.env.example apps/demo/.env.local
```

Set:

- `CF_PREVIEW_HOST=http://127.0.0.1:8787`
- `CF_PREVIEW_TOKEN=<same token as the host>`

Then run:

```bash
npm run dev:demo
```

Open the local app, then open the public preview URL shown in the Vite terminal.

## Deploy the host for a real public demo

1. Deploy the preview host once.
2. Set a real deploy token as a Worker secret.
3. Point the Vite app at that Workers URL.

```bash
cd apps/preview-host
npx wrangler secret put PREVIEW_DEPLOY_TOKEN
npx wrangler deploy
```

Then set `apps/demo/.env.local` to:

```bash
CF_PREVIEW_HOST=https://<your-worker>.workers.dev
CF_PREVIEW_TOKEN=<the same deploy token>
```

Run `npm run dev:demo` and edit either:

- `apps/demo/src/App.tsx`
- `apps/demo/src/edge.ts`

The stable public preview lives at:

```text
https://<your-worker>.workers.dev/preview/react-edge-live/
```

## Good demo flow for a tweet

1. Start `npm run dev:demo`.
2. Show the public preview URL loading the React app.
3. Edit `apps/demo/src/edge.ts` and save.
4. Refresh or wait for the preview to auto-refresh.
5. Hit `/api/message` from the UI and show the new version ID.

That makes the point quickly: Vite is acting like a live deploy switch for Dynamic Workers.

## Useful commands

```bash
npm run typecheck
npm run build
npm run dev:demo
npm run deploy:host
```

## Notes

- This is a POC, not a production deployment system.
- Assets are stored in the Durable Object for simplicity.
- Authentication is a single bearer token.
- The stable URL model is the point of the demo, not multi-user tenancy.
