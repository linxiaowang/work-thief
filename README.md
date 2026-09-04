# WorkThief

> macOS menu-bar TXT reader

Body via tray title. Book-wide char paging (page_size). Chapters optional jump only.

Local TXT. SQLite. Optional watcher. Hotkeys. No EPUB/stocks/web/video.

Packaged hides Dock. Dev shows Dock.

---

## Install
Need: macOS Node 20+

## Verify steps

1. Launch; menu bar RIGHT title (empty shelf hint).
2. Tray menu Choose novel, or click title when empty; pick txt.
3. Menu bar shows novel text (optional page/total).
4. Prev/Next page via menu or hotkeys.
5. Boss: title becomes disguise (default Hello); toggle back. Never blank-only.
6. Settings: path, page_size, encoding auto/UTF-8/GBK, moyu_text, show page#.

Tray sits on the RIGHT near the clock.

## Tray menu

Open Settings, Choose novel, Bookshelf, Prev/Next, Chapter jump, Boss, Quit

## Hotkeys

Need Accessibility permission, then restart.

Alt+Cmd+Right/Left = page. Alt+Cmd+Down/Up = chapter. Ctrl+Alt+Cmd+M = Boss.

## Watcher bonus

Still watches Documents/WorkThief. First-run uses file picker, not only the watcher.

## Limits

Hotkeys need Accessibility. Encoding auto/UTF-8/GBK. macOS only. Unsigned DMG.

## Layout

src/main tray pages hotkeys settings watcher; resources icons + settings.html; shared types.

Data under Application Support/WorkThief/library.db. See DESIGN.md.

MIT
