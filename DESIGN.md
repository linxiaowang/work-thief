# WorkThief 设计（与代码一致）

> macOS 菜单栏摸鱼阅读器 · main-only Electron · Tray.setTitle 出字

---

## 1. 产品边界

| 做 | 不做 |
|---|---|
| 菜单栏标题显示当前页 TXT | Dock / 阅读窗口 / Popover / 浮动窗 |
| 右键托盘导航 | Vue renderer / 主题系统 / 章内搜索 |
| ~/Documents/WorkThief 监听导入 | EPUB / PDF / 在线书源 / 账号 / 云同步 |
| SQLite 本地库 + 进度 | Windows / Linux（暂） |
| 全局热键 + Boss Key | |

形态：无窗口 Menu Bar App（packaged: app.dock.hide(); dev: app.dock.show()）。

---

## 2. 架构

```
Electron Main only
├── Tray (+ setTitle 出正文)
├── Context menu（书架 / 章节 / Boss Key / 字数 / 文件夹 / 退出）
├── globalShortcut（翻页 / 翻章 / Boss Key）
├── chokidar watcher → importPaths
├── SQLite (better-sqlite3)
│   books / chapters / progress / settings
└── parsers：encoding → chapters → pagination
```

无 preload、无 renderer。electron.vite.config.ts 只打 src/main/index.ts → out/main/。

### 模块

| 文件 | 职责 |
|---|---|
| index.ts | 单实例、隐藏 Dock、启动顺序、挂右键菜单 |
| menuBar.ts | Tray、阅读状态、分页缓存、进度持久化、Boss Key |
| menuBuilder.ts | 右键菜单模板 |
| pagination.ts | 按 charsPerPage 切页，优先句号/段落 |
| shortcuts.ts | 注册/注销全局热键 |
| watcher.ts | 默认监听文件夹，.txt add/change → 导入 |
| ipc.ts | 仅 importPaths / refreshMissingFlags（给 watcher，非 renderer IPC） |
| db/* | SQLite repos |
| parsers/* | 编码探测、分章、封面色 hash |

---

## 3. 数据

路径：~/Library/Application Support/WorkThief/library.db

```sql
books(id, title, file_path UNIQUE, encoding, chapter_count, total_chars, …, missing)
chapters(book_id, idx, title, start_offset, char_count)
progress(book_id PK, chapter_index, chapter_progress /*0..1*/, last_read_at)
settings(key, value /* JSON AppSettings */)
```

AppSettings：热键五键 + watchedFolder + charsPerPage（默认 40，钳制 20–80）。

进度：存章内字符比例，切回书时用 selectPageForOffset 近似还原页码。

---

## 4. 阅读流

1. 启动 → ensureWatchedFolder + resumeWatching → initTray → 最近打开的书 switchToBook
2. loadCurrentChapterPages：读文件 → 解码 → 按章节 offset 切片 → paginate(charsPerPage)
3. Tray.setTitle(章节号 + 页正文)；过长截到约 80 字
4. 热键 / 菜单翻页；跨章自动接上；末章末页绕回首章
5. Boss Key：hidden=true → setTitle("")，图标保留

空书架：标题显示短提示「WorkThief · 放 txt」。

---

## 5. 导入

- 监听目录默认 ~/Documents/WorkThief/（settings 可记路径）
- 仅 .txt；已在架跳过；编码 jschardet + BOM；分章正则（第×章 / Chapter N / 序章 等）
- 失败整本当单章

---

## 6. 热键默认

| Accelerator | 动作 |
|---|---|
| Alt+Cmd+Right | 下一页 |
| Alt+Cmd+Left | 上一页 |
| Alt+Cmd+Down | 下一章 |
| Alt+Cmd+Up | 上一章 |
| Ctrl+Alt+Cmd+M | Boss Key |

macOS 需辅助功能权限，否则 globalShortcut.register 静默失败。

---

## 7. 打包

- electron-builder mac dmg arm64+x64，未签名
- 入口 out/main/index.js；资源 resources/iconTemplate.png（托盘 template）
- 不做 App Sandbox（热键 + 任意路径 TXT）

---

## 8. 明确删掉的旧设想

以下曾写在旧 DESIGN / README，与当前代码无关，已废弃：

- Vue Popover 书架、浮动阅读窗、windowManager.ts
- 四套阅读主题 / 字体行距 / 窗口透明度
- 章内搜索、阅读窗内翻页键
- preload / renderer / tsconfig.web.json
