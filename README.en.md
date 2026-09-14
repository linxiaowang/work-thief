# WorkThief

[简体中文](README.md)

Read local **TXT novels** from the macOS **menu bar**—no extra window, low profile; left-click to turn pages, one hotkey for a “busy at work” decoy.

<p align="center">
  <img src="./resources/icon.png" width="96" height="96" alt="WorkThief icon">
</p>

Library, reading progress, chapter jumps, and global hotkeys. macOS only; download below to get started.

---

## Download

<p align="center">
  <a href="https://github.com/linxiaowang/work-thief/releases/latest/download/WorkThief-Mac.dmg">
    <img src="https://img.shields.io/badge/macOS-Download%20DMG-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download macOS">
  </a>
</p>

| Platform | Notes |
|----------|--------|
| Apple Silicon (M series) | [WorkThief-Mac.dmg](https://github.com/linxiaowang/work-thief/releases/latest/download/WorkThief-Mac.dmg) → drag to Applications |
| Intel Mac | Check [Releases](https://github.com/linxiaowang/work-thief/releases/latest) for an Intel build if listed |

Version notes and older builds: [Releases](https://github.com/linxiaowang/work-thief/releases/latest).

### Won’t open or “app is damaged”

The app is **not Apple-notarized**. macOS may block the first launch—the file is not corrupt.

1. Click **Cancel** (don’t move to Trash).
2. In Terminal (adjust the path if needed):

```bash
xattr -cr /Applications/WorkThief.app
```

3. Open again, or **Right-click → Open → Open anyway**. Allow in **System Settings → Privacy & Security** if prompted.

Updates are manual via GitHub Releases (no in-app updater).

---

## Quick start

1. Launch WorkThief; text appears on the **right** of the menu bar (near the clock). With no book loaded, it prompts you to pick a txt.
2. **Left-click** the text → choose a `.txt`; or **right-click** → **Choose novel…**.
3. **Left-click** → next page; **right-click** → menu (settings, library, prev/next, chapters, Boss, hotkeys, quit).
4. **Right-click** → **Settings…** for chars per page, Chinese encoding, page numbers, Boss decoy text, watch folder, etc.

The icon stays on the right side of the menu bar.

## Hotkeys

Global hotkeys need **Accessibility** permission; **restart WorkThief** after granting.

| Keys | Action |
|------|--------|
| ⌘⌥. | Next page |
| ⌘⌥, | Previous page |
| ⌘⌥M | Boss: swap menu bar to decoy text (e.g. “工作中”); press again to resume |

Change bindings via **Right-click → Hotkeys**; **Esc** cancels recording; **Restore defaults** resets the table.

Chapter jumps are in the **right-click menu** only (no default chapter hotkeys).

## Folder watch (optional)

Drop `.txt` files into **Documents/WorkThief** (path configurable in settings) to add them to the library. You can also import via **Choose novel** only.

## FAQ

- **TXT only**—no EPUB, etc.
- **Garbled Chinese**: try UTF-8 or GBK in settings, or Auto.
- **Hotkeys dead**: confirm Accessibility + restart the app.
- **Where data lives**: on your Mac under `~/Library/Application Support/WorkThief`; delete that folder to wipe library/progress after uninstalling.

## Developers

Node 20+ and [pnpm](https://pnpm.io/): `git clone` → `pnpm install` → `pnpm dev`. Use arm64 Node on Apple Silicon; run `pnpm setup` if startup fails. Package: `pnpm dist`. Maintainers: push a `v*` tag to trigger CI—see [`.github/workflows/release.yml`](./.github/workflows/release.yml). Design notes: [`DESIGN.md`](./DESIGN.md).

## License

MIT
