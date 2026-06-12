# Update Time

[中文说明](./README-ZH.md) | [与源仓库的关系](./README_OBSIDIAN.md)

Event-driven Obsidian plugin that keeps front matter `created` and `updated` timestamps in sync with the file system — **without hash tables, polling, or bulk operations**.

## Features

- **Event-driven**: reacts to `create`, `rename`, `modify` (file system) and `file-open` (workspace) events — no polling.
- **No hash tables**: unlike the [original plugin](https://github.com/beaussan/update-time-on-edit), this fork does **not** compute or store SHA-256 hashes of your files. `data.json` only holds user settings (a few hundred bytes).
- **Threshold guard**: during active editing, updates are deferred. A configurable threshold (default 5 min) prevents excessive writes.
- **Close finalization**: when you switch away from a file, its system `mtime` is written to front matter — capturing the true last-edit time.
- **Manual command**: "Update current file modification time" can be bound to a hotkey or triggered via Commander / QuickAdd / Button.
- **Chinese localization**: all settings are displayed in Simplified Chinese when Obsidian language is set to Chinese.
- **Safe by design**: no batch-update-all-files button. Every action targets a single file.

## Installation

### From BRAT
Add `AiurArtanis/obsidian-update-time` via the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.

### Manual
1. Download `main.js`, `manifest.json`, `styles.css` from [Releases](https://github.com/AiurArtanis/obsidian-update-time/releases).
2. Place them in `{vault}/.obsidian/plugins/obsidian-update-time/`.
3. Enable the plugin in **Settings → Community Plugins**.

## How it works

| Event | Front matter updated |
|-------|---------------------|
| File **created** | `created` ← file ctime; `updated` ← now |
| File **renamed / moved** | `updated` ← now |
| File **modified** (vault detect) | `updated` ← file mtime, **only if** mtime is older than the threshold (default 5 min before now) |
| **Switch away** from a file | `updated` ← file mtime (overwrite) |
| **Command** "Update current file modification time" | `updated` ← now |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Date format | `yyyy-MM-dd'T'HH:mm` | `date-fns` format string |
| Enable number property type | off | Use numeric values (Unix timestamps) instead of strings |
| Modification threshold (min) | 5 | File mtime must be older than now by this many minutes before auto-updating |
| Updated property name | `updated` | Front matter key for modification time |
| Enable created time | on | Auto-write `created` when missing |
| Created property name | `created` | Front matter key for creation time |
| Exclude folders | — | Files in these folders are never touched |

## Migration from update-time-on-edit

1. Disable (don't uninstall) the old plugin.
2. Install this plugin — it uses a different plugin ID (`obsidian-update-time`), so settings are separate.
3. The old `data.json` (with `fileHashMap`) is **not** imported. Only user-facing settings need to be reconfigured once.

## Development

```bash
npm install
npm run dev    # watch mode, auto-copies to vault if OBSIDIAN_VAULT env is set
npm run build  # production build
```

## License

MIT — forked from [beaussan/update-time-on-edit](https://github.com/beaussan/update-time-on-edit).
