# Path Helper

[简体中文](README.zh-CN.md)

Path Helper opens files and folders from absolute paths copied to the clipboard. It can resolve paths in the current vault or another registered vault, reveal the destination in the file explorer, and synchronize Path Helper across selected vaults.

## Features

- Open an absolute file or folder path copied from the system file manager.
- Resolve paths in the current vault and other registered vaults.
- Reveal opened files and folders in the file explorer.
- Optionally open a folder note named after its parent folder.
- Install or update Path Helper in selected vaults without overwriting their settings.
- Detect installations whose plugin directory name differs from the manifest ID.
- Exclude the built-in Obsidian Sandbox vault from synchronization targets.

## Requirements

- Obsidian 1.4.0 or later.
- Desktop only. Clipboard access, vault discovery, and synchronization use Electron and Node.js APIs.

## Installation

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the matching GitHub release.
2. Create `<vault-config-dir>/plugins/path-helper/` inside your vault.
3. Copy the downloaded files into that directory.
4. Open **Settings → Community plugins** and enable **Path Helper**.

The default vault configuration directory is `.obsidian`, but Path Helper also supports vaults that use a custom configuration directory.

### Build from source

```bash
npm install
npm run build
```

The production build creates `main.js`.

## Usage

1. Copy an absolute file or folder path from the system file manager.
2. Open the Obsidian command palette.
3. Run **Open clipboard path in Obsidian**.
4. Path Helper opens the matching file or reveals the matching folder.

You can assign a hotkey to this command in Obsidian's hotkey settings.

### Current-vault paths

Files in the current vault are opened through the Obsidian API and revealed in the file explorer. Folders are revealed directly, or Path Helper can first look for a matching folder note such as `Projects/Projects.md`.

### Paths in another vault

Path Helper reads the local Obsidian vault registry and chooses the registered vault with the longest matching path. It then sends an `obsidian://` URI to that vault. Cross-vault folder reveal requires Path Helper to be installed and enabled in the destination vault.

## Settings

| Setting | Default | Description |
|---|---:|---|
| URL-encode spaces | On | Encodes spaces as `%20` in cross-vault URIs. |
| Strip .md extension | Off | Removes the `.md` extension from generated URIs. |
| URI action | `open` | Uses the `open` or `search` URI action. |
| Show notification | On | Shows a notice after an operation. |
| Open folder note | Off | Opens a matching folder note before falling back to folder reveal. |
| Sync to all vaults | — | Opens a dialog for selecting vaults to install or update. |

## Synchronize across vaults

Open **Settings → Path Helper**, select **Sync to all vaults**, and choose the destination vaults. No vault is selected by default.

For each selected vault, Path Helper:

- installs the files when the plugin is not present;
- updates the existing plugin directory when its version is older;
- skips an equal or newer version;
- preserves `data.json` and the destination vault's plugin settings;
- adds `path-helper` to `community-plugins.json` when needed;
- copies `main.js`, `manifest.json`, and `styles.css` when available.

Close the destination vault windows before synchronization so a running Obsidian instance does not overwrite configuration files. Restricted Mode must still be managed manually in every destination vault.

## Privacy and filesystem access

Path Helper performs all work locally and does not send notes, paths, clipboard contents, or telemetry to remote services.

- The clipboard is read only when the user runs the open-path command.
- The local Obsidian vault registry is read to resolve paths across registered vaults.
- Files are written to another vault only after the user selects that vault and confirms synchronization.
- Synchronization can copy plugin release files and update `community-plugins.json`; it does not modify notes or `data.json`.

These capabilities require direct local filesystem, clipboard, and Electron access, which is why the plugin is desktop-only.

## Development

```bash
npm install
npm run typecheck
npm run build
```

Project structure:

```text
obsidian-plugin-path-helper/
├── main.ts
├── pathConverter.ts
├── styles.css
├── manifest.json
├── versions.json
├── package.json
└── main.js
```

## Release notes

### 0.1.11 (unreleased)

- Moved fixed interface styles into `styles.css` for compatibility with the community plugin guidelines.
- Removed the redundant plugin-name heading from the settings tab.
- Added complete English documentation and retained the Chinese guide separately.
- Cleaned up an unhandled promise and several unused debug statements.

### 0.1.10

- Updated the manifest description for the community directory.
- Updated settings headings to use the Obsidian `Setting` API.
- Added an English overview and privacy disclosure.

### 0.1.9

- Fixed detection when Path Helper is installed in a non-standard directory.
- Reused the detected directory during synchronization to avoid duplicate installations.
- Excluded the built-in Obsidian Sandbox vault from synchronization targets.

## License

[MIT](LICENSE)
