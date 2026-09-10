# WorkThief

[English](README.en.md)

> macOS 菜单栏 TXT 摸鱼阅读器（v0.3.0）

正文走 `Tray.setTitle`，按全书定长分页（`charsPerPage` / page_size）。章节只用于菜单跳转，不是主阅读流。

本地 TXT · SQLite · 可选文件夹监听 · 全局热键 · 无 EPUB / 股票 / 网页 / 视频。

打包后隐藏 Dock；开发模式显示 Dock。

---

## 安装

需要：macOS、Node 20+、pnpm。

```bash
git clone https://github.com/linxiaowang/work-thief.git
cd work-thief
pnpm install
pnpm dev
```

Apple Silicon 上若 `better-sqlite3` 架构不对，见下方 **原生模块**。

## 验证步骤

1. 启动后，菜单栏**右侧**（靠近时钟）出现标题；空书架时提示 `WorkThief · 选 txt`。
2. 空书架时左键标题 → 选 txt；或右键 → **选择小说…**。
3. 菜单栏显示当前页正文（可选页码后缀）。
4. 左键立即翻下一页；右键打开菜单。
5. 默认热键：⌘⌥. 下一页 / ⌘⌥, 上一页 / ⌘⌥M Boss（`CommandOrControl+Alt`）。可在右键 → **快捷键** 里改。
6. Boss：标题切到伪装文案（默认「工作中」；留空则显示当前 `HH:mm`），再按切回。不会只留空白。
7. 设置里可改：监听路径、每页字数、编码 auto/UTF-8/GBK、伪装文案、是否显示页码，以及**当前快捷键摘要**。

托盘固定在菜单栏右侧。

## 托盘手势

| 手势 | 行为 |
|---|---|
| 左键 | 有书 → 下一页；无书 → 打开文件选择 |
| 右键 | 弹出菜单（打开设置 / 选择小说 / 书架 / 上一页·下一页 / 跳转章节 / Boss / 快捷键 / 退出） |

**不要**调用 `tray.setContextMenu`（会抢走左键）。

## 热键

需要「辅助功能」权限，授权后请重启应用。注册失败时发系统通知，**不会**用提示覆盖小说正文标题。

### 默认

| Accelerator | 作用 |
|---|---|
| `CommandOrControl+Alt+.`（⌘⌥.） | 下一页 |
| `CommandOrControl+Alt+,`（⌘⌥,） | 上一页 |
| `CommandOrControl+Alt+M`（⌘⌥M） | Boss 伪装开关 |

章节跳转**仅菜单**（默认不注册章节热键）。

### 自定义

1. 右键托盘 → **快捷键**。
2. 每一项显示当前组合键（上一页 / 下一页 / Boss）。
3. 点某一项 → 托盘标题变为 **等待按键…**，按下新组合。
4. **Esc** 取消。若与另外两个绑定冲突，或系统注册失败，会提示并拒绝本次修改（冲突时仍停留在等待按键）。
5. 成功时托盘短暂显示 **已设为 …**，并弹出通知。
6. **恢复默认** 还原为 ⌘⌥, / ⌘⌥. / ⌘⌥M。
7. 立即生效，写入 SQLite settings，重启后保留。

## 监听文件夹（加分项）

仍会监听 `~/Documents/WorkThief`。首次使用以文件选择器为主，不只依赖监听。

## 原生模块（Apple Silicon）

`better-sqlite3` 必须匹配 **Electron** 的架构，而不只是本机 Node。

**现象：** 在 arm64 Mac 上 clone/pull 后数据库失败，或 Electron 报：
`mach-o file, but is an incompatible architecture (have 'x86_64', need 'arm64')`
（或相反）。常见原因是 x86_64 Node / Rosetta 编出了错误的 `.node`。

**arm64 Mac 上 clone 或 pull 之后：**

1. 确认 arm64 Node：`node -p process.arch`（应为 `arm64`）
2. `pnpm install`（postinstall 会跑 setup；失败时控制台有软提示）
3. 若数据库仍失败：`pnpm setup` 或 `pnpm rebuild`
4. 仍不行：删掉 `node_modules`，再 `pnpm install` 与 `pnpm setup`

`pnpm setup` 会先下载 Electron（如需），再 `electron-builder install-app-deps`（回退 `electron-rebuild`），让 `better-sqlite3` 对齐 Electron。`pnpm rebuild` 只走原生重建。

## 限制

- 热键需要辅助功能权限
- 编码：auto / UTF-8 / GBK
- 仅 macOS
- 未签名 DMG（首次打开可能需在「隐私与安全性」里允许）

## 打包

```bash
pnpm dist
```

产物在 `release/`（按版本分子目录，如 `release/0.3.0/`）。

## 目录与数据

`src/main`：托盘、分页、热键、设置、监听；`resources`：图标与 `settings.html`；`src/shared`：共享类型。

数据：`~/Library/Application Support/WorkThief/library.db`。细节见 `DESIGN.md`。

## 许可证

MIT
