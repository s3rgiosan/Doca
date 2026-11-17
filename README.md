<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/doca-dark.png">
    <img src="assets/doca.png" alt="Doca icon" width="128" height="128">
  </picture>
</p>

# Doca

Workspaces that dock in their own window.

Doca is a browser extension for Chromium-based browsers. It is tested in Chrome and Brave. Each workspace owns one browser window. A pinned Doca tab at the first position of that window lists your workspaces and the tabs of the window.

Doca works offline and needs no account. It stores your workspaces only in this browser. Use the export file to keep a backup.

## Use

- Click the Doca toolbar button, or press `Alt+Shift+W`, to move the current tab to another workspace. Type to find the workspace, or type a new name to make one.
- In a window with no workspace, the same popup saves all the tabs of the window to a new or an existing workspace.
- In the Doca tab, click **New workspace** to make a workspace. Pick a name and one of 8 colours. A workspace shows its colour as a dot in the sidebar, in the page heading and in the workspace lists. Use **Rename** in the ⋯ menu to change the name and the colour.
- Click a workspace to switch to it in the same window. Doca saves the current workspace and closes its tabs first. The new tabs load when you click them. To open a workspace in a second window, use **Open in new window** in its ⋯ menu.
- To move tabs, select them and use **Move to…**, or drag one tab onto a workspace in the sidebar. **Move to…** can also make a new workspace for the tabs. A message shows after the move, with an **Undo** button.
- To delete a workspace, use **Delete** in its ⋯ menu. A message shows after the delete, with an **Undo** button. If you delete the workspace of the window you are in, Doca closes this Doca tab and shows no message, so the delete has no undo. The tabs of the window stay open.
- Type `doca`, a space and a workspace name in the address bar to go to that workspace.
- With no workspace, the Doca tab shows **New workspace**. Until Doca loads, it shows a loading message.

## Settings

Open **Settings** at the bottom of the sidebar. You can also open the settings page of the extension from the browser extensions page.

- **Tab suspender.** Set the minutes after which an idle tab is suspended. `0` means never. The setting is the same for all workspaces. Doca does not suspend the active tab, pinned tabs, tabs that play sound, and the Doca tab.
- **Allowlist.** List the hosts whose tabs Doca never suspends, one per line. A host also covers its subdomains.
- **Backup.** **Export** downloads your workspaces as a JSON file. **Import** reads such a file and adds its workspaces. Import never replaces a workspace. A workspace that already exists is added again with "(imported)" after its name.

When you close the settings in the Doca tab with edits that are not saved, Doca asks **Save changes?**. The settings page asks the browser to confirm before you leave it with edits that are not saved.

Export your workspaces from time to time. The export file is your only backup.

## Install

1. Download `doca-<version>-chrome.zip` from the [latest release](https://github.com/s3rgiosan/doca/releases/latest).
2. Unzip it to a folder that you keep. The browser loads Doca from that folder.
3. Open the extensions page of your browser, for example `chrome://extensions` in Chrome or `brave://extensions` in Brave.
4. Turn on Developer mode.
5. Click **Load unpacked** and select the unzipped folder.

To update, unzip the new release into the same folder and click the reload button of Doca on the extensions page.

## Requirements

- Node 22.12 or later
- A Chromium-based browser. Doca is tested in Chrome and Brave.

## Build

1. Install the packages:

   ```bash
   npm install
   ```

2. Build the extension:

   ```bash
   npm run build
   ```

3. Open the extensions page of your browser, for example `chrome://extensions` in Chrome or `brave://extensions` in Brave.
4. Turn on Developer mode.
5. Click **Load unpacked** and select `.output/chrome-mv3`.
6. Click the Doca toolbar button. The popup opens.

Run the unit tests with `npm test`. Record the manual checks in `docs/local-release-checks.md`.

To make a zip file for the browser store, run `npx wxt zip`.

## Release

1. Update the version in `package.json` and add its section to `CHANGELOG.md`.
2. Commit, then push a tag with the version, for example `1.0.2`.

The release workflow runs the type check and the tests, builds the zip and publishes a GitHub release with the zip and the changelog section.

## License

Doca is released under the [MIT License](LICENSE).
