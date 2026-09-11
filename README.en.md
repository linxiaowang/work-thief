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

On Apple Silicon: **always use arm64 Node** (`node -p process.arch` → `arm64`). If `better-sqlite3` arch mismatches, see **Native modules** below.

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

> **Always use arm64 Node on Apple Silicon.** Do not use Rosetta / x86_64 Node — that repeatedly causes:
> `mach-o file, but is an incompatible architecture (have 'x86_64', need 'arm64')`.

**Symptom:** after clone / pull / `pnpm install`, the DB fails or Electron reports the arch error above. Common cause: x86_64 Node (Rosetta) produced the wrong `.node`, or postinstall rebuild failed and left the wrong binary.

**After every clone or pull on an arm64 Mac:**

1. **Confirm arm64 Node (required):**
   ```bash
   node -p process.arch
   ```
   Must print `arm64`. If `x64`: install [Node.js macOS ARM64](https://nodejs.org/), or open an arm64 shell first:
   ```bash
   arch -arm64 zsh
   # then install / switch to arm64 Node and reopen the terminal
   ```
2. Clean install:
   ```bash
   rm -rf node_modules
   pnpm install
   ```
3. Rebuild natives for Electron:
   ```bash
   pnpm setup
   ```
   (`pnpm rebuild` is the native-only path.)
4. Optional verify:
   ```bash
   find node_modules -name better_sqlite3.node -exec file {} \;
   ```
   Expect `arm64` (not a lone `x86_64`).
5. Launch: `pnpm dev`

`pnpm setup` / postinstall: download Electron if needed → `electron-builder install-app-deps` (fallback `electron-rebuild`) → best-effort arch check on the `.node`. If Node itself is x64, the script prints the steps above and soft-fails (install continues), **but the app still cannot load the DB until you switch to arm64 Node and repeat steps 2–3.**


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
