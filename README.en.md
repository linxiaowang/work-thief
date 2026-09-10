# WorkThief

[中文](README.md)

> macOS menu-bar TXT novel reader (v0.3.0)

Body text via `Tray.setTitle`. Book-wide fixed-length paging (`charsPerPage` / page_size). Chapters are optional jump targets only—not the main reading flow.

Local TXT · SQLite · optional folder watcher · global hotkeys · no EPUB / stocks / web / video.

Packaged builds hide the Dock; dev shows the Dock.

---

## Install

Requires: macOS, Node 20+, pnpm.

```bash
git clone https://github.com/linxiaowang/work-thief.git
cd work-thief
pnpm install
pnpm dev
```

On Apple Silicon, if `better-sqlite3` arch mismatches, see **Native modules** below.

## Verify steps

1. Launch; the menu-bar title appears on the **RIGHT** (near the clock). Empty shelf shows `WorkThief · 选 txt`.
2. Left-click the title when empty → pick a txt (or right-click → **选择小说…** / Choose novel).
3. Menu bar shows the current page body (optional page/total suffix).
4. Left-click pages immediately; right-click opens the menu.
5. Default hotkeys: ⌘⌥. next / ⌘⌥, prev / ⌘⌥M Boss (`CommandOrControl+Alt`). Customize via right-click → **快捷键**.
6. Boss: title switches to disguise text (default 「工作中」; empty → current `HH:mm`), then toggles back. Never blank-only.
7. Settings: watched path, chars per page, encoding auto/UTF-8/GBK, disguise text, show page #, and a **current shortcut summary**.

The tray stays on the right near the clock.

## Tray gestures

| Gesture | Action |
|---|---|
| Left click | Has book → next page; no book → file picker |
| Right click | Context menu (Settings / Choose novel / Bookshelf / Prev·Next / Chapter jump / Boss / Hotkeys / Quit) |

Do **not** use `tray.setContextMenu` (it steals left-click).

## Hotkeys

Needs Accessibility permission, then restart the app. On register failure: a Notification (the novel tray title is never overwritten).

### Defaults

| Accelerator | Action |
|---|---|
| `CommandOrControl+Alt+.` (⌘⌥.) | Next page |
| `CommandOrControl+Alt+,` (⌘⌥,) | Prev page |
| `CommandOrControl+Alt+M` (⌘⌥M) | Boss disguise toggle |

Chapter jump is **menu only** (no chapter hotkeys by default).

### Customize

1. Right-click tray → **快捷键**.
2. Each item shows the current accelerator (上一页 / 下一页 / Boss).
3. Click an item → tray title shows **等待按键…**; press the new combo.
4. **Esc** cancels. If the combo is already used by another of the three bindings (or OS register fails), a tip appears and the change is rejected (on conflict, recording stays active).
5. On success, the tray briefly shows **已设为 …** and a notification fires.
6. **恢复默认** restores ⌘⌥, / ⌘⌥. / ⌘⌥M.
7. Changes apply immediately and persist across restarts (SQLite settings).

## Watcher bonus

Still watches `~/Documents/WorkThief`. First-run uses the file picker, not only the watcher.

## Native modules (Apple Silicon)

`better-sqlite3` must match **Electron's** arch, not only Node's.

**Symptom:** after clone/pull on an arm64 Mac, DB fails or Electron reports:
`mach-o file, but is an incompatible architecture (have 'x86_64', need 'arm64')`
(or the reverse). Often caused by x86_64 Node/Rosetta producing the wrong `.node` binary.

**After clone or pull on an arm64 Mac:**

1. Confirm arm64 Node: `node -p process.arch` (expect `arm64`)
2. `pnpm install` (postinstall runs setup; soft-fails with a console hint if rebuild fails)
3. If DB still fails: `pnpm setup` or `pnpm rebuild`
4. Still broken: remove `node_modules`, then `pnpm install` and `pnpm setup` again

`pnpm setup` downloads Electron if needed, then `electron-builder install-app-deps` (fallback: `electron-rebuild`) so `better-sqlite3` matches Electron. `pnpm rebuild` is the native-only path.

## Limits

- Hotkeys need Accessibility
- Encoding: auto / UTF-8 / GBK
- macOS only
- Unsigned DMG (first open may require allowing in Privacy & Security)

## Packaging

```bash
pnpm dist
```

Artifacts land under `release/` (versioned subfolder, e.g. `release/0.3.0/`).

## Layout & data

`src/main`: tray, paging, hotkeys, settings, watcher; `resources`: icons + `settings.html`; `src/shared`: shared types.

Data: `~/Library/Application Support/WorkThief/library.db`. See `DESIGN.md`.

## License

MIT
