# Changelog

All notable changes to Doca will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-13

### Added

- Each workspace owns one browser window, with a pinned Doca tab at the first position that lists your workspaces and the tabs of the window.
- Workspaces are stored only in the browser, work offline and need no account.
- A workspace has one of 8 colours, picked in the New workspace and Edit workspace dialogs, and shown as a dot in the sidebar, the page heading and the workspace pickers.
- The Doca tab switches between workspaces in the same window, and opens a workspace in a second window from its menu or with a modifier click.
- The toolbar popup, opened with the `Alt+Shift+W` shortcut, moves the current tab to an existing or a new workspace, or saves all the tabs of a window that has no workspace.
- Tabs move to another workspace from the Doca tab with the Move to picker or by drag and drop onto the sidebar.
- A message with an Undo button shows after tabs move or a workspace is deleted. Deleting the workspace of the current window closes its Doca tab and has no undo.
- The `doca` address bar keyword switches to a workspace by name.
- The Doca tab shows an empty state with a New workspace button when no workspace exists, and a loading state while it loads.
- The tab suspender discards idle tabs after a number of minutes that you set for all workspaces, and skips the active tab, pinned tabs, tabs that play sound, the Doca tab and hosts on the allowlist.
- Settings are in the Doca tab and on the extension settings page. They ask Save changes? when you close them with unsaved edits, and the settings page warns before you leave it.
- Export writes all workspaces to a JSON file, and import adds the workspaces of such a file without replacing any workspace.
- Workspaces return to their windows after a browser restart, and a workspace that opens loads its first tab and keeps the other tabs suspended until you click them.
- The interface follows the light or dark colour scheme of the system.

[Unreleased]: https://github.com/s3rgiosan/Doca/compare/1.0.0...HEAD
[1.0.0]: https://github.com/s3rgiosan/Doca/releases/tag/1.0.0
