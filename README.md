# WorkThief

> 上班摸鱼专用 · macOS 菜单栏 TXT 阅读器

正文直接显示在菜单栏（Tray.setTitle）。无阅读窗口、无 Popover。右键托盘：书架 / 章节 / Boss Key / 打开监听文件夹 / 退出。

正式打包版仍隐藏 Dock（纯菜单栏）；dev 模式（pnpm dev）临时显示 Dock。

纯本地 TXT · SQLite 进度 · 文件夹监听 · 全局热键。不做 EPUB / 在线书源 / 账号。

---

## 安装与开发

需要：macOS、Node 20 或更高、pnpm 9 或更高

```bash
pnpm install && pnpm setup && pnpm dev
```

- `pnpm setup` — 下载 Electron 并编译 better-sqlite3
- `pnpm typecheck` / `pnpm test` / `pnpm build`
- `pnpm dist` — 打未签名 DMG

## 听文件夹

默认监听 `~/Documents/WorkThief/`（首次启动自动创建）。把 `.txt` 丢进去即自动入库；右键「打开监听文件夹」可跳转。

## 托盘行为

Menu-bar icon uses resources/icon.png and iconTemplate.png (teal book + W glyph).

| 状态 | 菜单栏标题 |
|---|---|
| 书架空 | `WorkThief · 放 txt` |
| 阅读中 | `章节号. 当前页正文`（约 80 字截断） |
| Boss Key 开 | 标题清空，图标保留 |

右键菜单：书架、当前书章节（含页码）、隐藏/显示文字、每页字数、打开监听文件夹、退出。

## 快捷键（全局）

需在 **系统设置 → 隐私与安全性 → 辅助功能** 授权后重启 App。

| 快捷键 | 功能 |
|---|---|
| `⌥⌘→` | 下一页 |
| `⌥⌘←` | 上一页 |
| `⌥⌘↓` | 下一章 |
| `⌥⌘↑` | 上一章 |
| `⌃⌥⌘M` | Boss Key（隐藏/显示标题文字） |

## Boss Key

一键清空菜单栏文字，图标还在。再按一次恢复。不会退出进程、不关托盘。

## 打包

```bash
pnpm dist
```

未签名，Gatekeeper 会拦：右键 → 打开 → 确认。公开发布需 Apple Developer 公证。

## 已知限制

1. 全局热键依赖辅助功能权限；未授权时注册会静默失败。
2. 编码靠启发式，极少数 GBK 文件可能乱码（可用 iconv 先转 UTF-8）。
3. 章节正则认不出时整本当 1 章。
4. 菜单栏标题长度受系统其他图标挤压，长句会被截断。
5. macOS only；DMG 未签名。

## 结构（main-only）

```
src/main/          Electron 主进程（托盘 / 分页 / 热键 / watcher）
  db/              SQLite（books / chapters / progress / settings）
  parsers/         TXT 编码探测 + 分章
src/shared/        共享类型
```

数据：`~/Library/Application Support/WorkThief/library.db`

详见 [`DESIGN.md`](./DESIGN.md)。

---

MIT · 摸鱼有风险，上班需谨慎。
