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
├── Right-click menu（书架 / 章节 / Boss Key / 设置 / 退出）；左键翻页
├── globalShortcut（翻页 / Boss Key；章节仅菜单）
├── chokidar watcher → importPaths
├── SQLite (better-sqlite3)
│   books / chapters / progress / settings
└── parsers：encoding → chapters → pagination
```

无 preload、无 renderer。electron.vite.config.ts 只打 src/main/index.ts → out/main/。

### 模块

| 文件 | 职责 |
|---|---|
| index.ts | 单实例、隐藏 Dock、启动顺序、右键 popUpContextMenu |
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

AppSettings：热键 + watchedFolder + charsPerPage + moyuText + showPageNumber + preferredEncoding。

进度：存全书字符比例；chapterIndex 仅服务可选跳转。

---

## 4. 阅读流

1. 启动 → ensureWatchedFolder + resumeWatching → initTray → 最近打开的书 switchToBook
2. loadBookPages：整书解码 → 按 charsPerPage 全书切页
3. Tray.setTitle(页正文 [+ 页码/总页])；过长约 80 字截断
4. 热键 / 菜单翻页（全书页）；章节跳转可选
5. Boss Key：小说 ↔ moyu_text 伪装（不 blank-only）

空书架：WorkThief · 选 txt；文件选择器选书。

---

## 5. 导入

- 监听目录默认 ~/Documents/WorkThief/（settings 可记路径）
- 仅 .txt；已在架跳过；编码 jschardet + BOM；分章正则（第×章 / Chapter N / 序章 等）
- 失败整本当单章

---

## 6. 热键默认（Thief-style）

| Accelerator | 动作 |
|---|---|
| CommandOrControl+Alt+. | 下一页 |
| CommandOrControl+Alt+, | 上一页 |
| CommandOrControl+Alt+M | Boss Key |

章节跳转仅右键菜单（默认不注册翻章热键）。

macOS 需辅助功能权限；注册失败时 Notification + 托盘标题提示「开 系统设置→隐私→辅助功能」。

托盘：左键翻页 / 无书选文件；右键 popUpContextMenu。禁止 setContextMenu（会抢走左键）。

翻页热路径：pages 常驻内存；next/prev 只改 pageIndex + setTitle；persistProgress 防抖 800ms；末页停止不回绕，标题可带「·完」。

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
