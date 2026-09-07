# WorkThief

> macOS menu-bar TXT reader

Body via tray title. Book-wide char paging (page_size). Chapters optional jump only.

Local TXT. SQLite. Optional watcher. Hotkeys. No EPUB/stocks/web/video.

Packaged hides Dock. Dev shows Dock.

---

## Install
Need: macOS Node 20+

On Apple Silicon after clone/pull, see **Native modules** (setup / rebuild if arch mismatches).

## Verify steps

1. Launch; menu bar RIGHT title (empty shelf hint).
2. Left-click title when empty → pick txt (or right-click → Choose novel).
3. Menu bar shows novel text (optional page/total).
4. Left-click pages immediately; right-click opens menu.
5. Hotkeys: ⌘⌥. next / ⌘⌥, prev / ⌘⌥M Boss (macOS; CommandOrControl+Alt). Customize via right-click → 快捷键.
6. Boss: title becomes disguise (default 「工作中」); toggle back. Never blank-only.
7. Settings: path, page_size, encoding auto/UTF-8/GBK, moyu_text, show page#, **current shortcut copy**.

Tray sits on the RIGHT near the clock.

## Tray gestures

| Gesture | Action |
|---|---|
| Left click | Has book → next page; no book → file picker |
| Right click | Context menu (Settings / Choose / Bookshelf / Prev·Next / Chapter jump / Boss / 快捷键 / Quit) |

Do **not** use `tray.setContextMenu` (that would steal left-click).

## Hotkeys

Need Accessibility permission, then restart. On register failure: Notification (tray novel title is not overwritten).

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
4. **Esc** cancels. If the combo is already used by another of the three bindings (or OS register fails), a tip appears and the change is rejected.
5. **恢复默认** restores ⌘⌥, / ⌘⌥. / ⌘⌥M.
6. Changes apply immediately and persist across restarts (SQLite settings).

## Watcher bonus

Still watches Documents/WorkThief. First-run uses file picker, not only the watcher.

## Native modules (Apple Silicon)

`better-sqlite3` must match **Electron's** arch, not only Node's.

**Symptom:** after clone/pull on an arm64 Mac, DB fails or Electron reports:
`mach-o file, but is an incompatible architecture (have 'x86_64', need 'arm64')`
(or the reverse). Often caused by x86_64 Node/Rosetta producing the wrong `.node` binary.

**After clone or pull on arm64 Mac:**

1. Confirm arm64 Node: `node -p process.arch` (expect `arm64`)
2. `pnpm install` (postinstall runs setup; soft-fails with a console hint if rebuild fails)
3. If DB still fails: `pnpm setup` or `pnpm rebuild`
4. Still broken: remove `node_modules`, then `pnpm install` and `pnpm setup` again

`pnpm setup` downloads Electron if needed, then `electron-builder install-app-deps` (fallback: `electron-rebuild`) so `better-sqlite3` matches Electron. `pnpm rebuild` is the native-only path.

## Limits

Hotkeys need Accessibility. Encoding auto/UTF-8/GBK. macOS only. Unsigned DMG.

## Layout

src/main tray pages hotkeys settings watcher; resources icons + settings.html; shared types.

Data under Application Support/WorkThief/library.db. See DESIGN.md.

MIT
