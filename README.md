# WorkThief 📖

> 上班摸鱼专用 · macOS 菜单栏小说阅读器

一个常驻 Mac 菜单栏的小说阅读器。Popover 充当书架与控制中心，点击书后弹出独立浮动阅读窗口；全局 Boss Key 一键秒藏。纯本地 TXT 导入，零联网，零账号。

![WorkThief screenshot placeholder](resources/icon.png)

---

## ✨ 特性

- 🍎 **菜单栏常驻** — 不占 Dock、不抢焦点
- 📚 **本地 TXT 导入** — 拖拽、文件选择、文件夹监控三合一
- 🔍 **自动编码识别** — UTF-8 / UTF-16 / GBK / Big5 智能探测
- 📖 **智能分章** — 正则匹配 `第一章`、`Chapter 1`、`序章` 等多种格式
- 🎨 **4 套主题** — 默认亮 / 深色 / 护眼米黄 / 羊皮纸，字体字号行距全可调
- ⌨️ **全局 Boss Key** — `⌃⌥⌘M` 一键秒藏，`⌥⌘Space` 唤起 / 隐藏 popover
- 💾 **本地进度跟踪** — 章节百分比定位，字体改了也不会丢位置
- 🔦 **章节内搜索** — `⌘F` 即时高亮

---

## 🚀 快速开始

### 环境要求

- macOS 10.15+
- Node.js 20+
- pnpm 9+（或 npm 10+）

### 安装依赖

```bash
pnpm install
```

> 如果 `better-sqlite3` 编译失败，运行：`pnpm rebuild` 或 `npx electron-rebuild -f -w better-sqlite3`

### 开发模式（热重载）

```bash
pnpm dev
```

### 类型检查

```bash
pnpm typecheck
```

### 跑单测

```bash
pnpm test
```

### 打包 DMG（未签名）

```bash
pnpm dist
```

产物在 `release/0.1.0/` 目录下。

> ⚠️ 未签名的 DMG 会被 Gatekeeper 拦截。首次打开请右键 → 打开 → 确认。

---

## ⌨️ 快捷键

### 全局（在任何 App 中都能用）

| 快捷键 | 功能 |
|---|---|
| `⌥⌘Space` | 唤起 / 隐藏 Popover（书架） |
| `⌃⌥⌘M` | 瞬时隐藏所有窗口（Boss Key） |

### 阅读窗口内

| 快捷键 | 功能 |
|---|---|
| `⌘F` | 章节内搜索 |
| `⌘[` | 上一章 |
| `⌘]` | 下一章 |
| `⌘↑` | 滚到章首 |
| `⌘↓` | 滚到章尾 |
| `Space` / `PageDown` | 向下翻页 |
| `PageUp` | 向上翻页 |
| `Esc` | 关闭搜索 / 隐藏阅读窗口 |

---

## 🏗️ 架构

```
Main Process (Node.js)
├── Tray (菜单栏图标)
├── Window Manager (Popover + Reader)
├── IPC Handlers
│   ├── Books / Chapters / Progress / Settings
│   └── TXT Parser (编码 + 章节)
├── DB (SQLite via better-sqlite3)
└── Global Shortcuts

Popover Renderer (Vue 3)
├── 书架列表
├── 拖拽导入
└── 设置面板

Reader Renderer (Vue 3)
├── 章节视图
├── 进度条
├── 主题系统
├── 章节导航
└── 搜索高亮
```

数据存储位置：`~/Library/Application Support/WorkThief/library.db`

---

## 📂 目录结构

```
work-thief/
├── src/
│   ├── main/                  # Main process
│   │   ├── index.ts           # 入口
│   │   ├── windowManager.ts   # 窗口管理
│   │   ├── ipc.ts             # IPC handlers
│   │   ├── shortcuts.ts       # 全局快捷键
│   │   ├── watcher.ts         # 文件夹监控
│   │   ├── db/                # SQLite repos
│   │   └── parsers/           # TXT 解析
│   ├── preload/               # contextBridge
│   │   └── index.ts
│   ├── shared/                # 跨进程共享类型
│   │   ├── types.ts
│   │   └── ipc.ts
│   └── renderer/              # Vue 3 renderer
│       ├── popover.html
│       ├── reader.html
│       └── src/
│           ├── App.vue        # Popover 根
│           ├── Reader.vue     # Reader 根
│           ├── components/    # Popover 组件
│           ├── reader-components/
│           └── stores/
├── resources/
│   ├── icon.png               # 普通图标
│   ├── iconTemplate.png       # 菜单栏模板图标
│   └── entitlements/macos.plist
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

---

## 🧪 测试

```bash
pnpm test           # 跑所有 vitest
pnpm test:watch     # watch 模式
```

测试覆盖：
- TXT 编码探测（BOM / UTF-8 / UTF-16 / GBK）
- 章节正则匹配（5 种主要模式）
- TXT 解析器端到端
- 封面色 hash 稳定性
- SQLite books / chapters / progress / settings repos

---

## 🆘 故障排除

### `pnpm dev` 报 `Error: Electron uninstall`

Electron 的二进制没下到。最常见的原因是 `pnpm install` 用了 `--ignore-scripts`。修复：

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install      # 这次不要带 --ignore-scripts
pnpm dev
```

### 菜单栏图标不出现

检查 `系统设置 → 控制中心 → 菜单栏额外项 → WorkThief` 是否启用（部分 macOS 版本需要手动显示）。

### `⌃⌥⌘M` Boss Key 不工作

必须去 `系统设置 → 隐私与安全性 → 辅助功能` 给 WorkThief 授权。授权后**重启 app**（不是仅重启 Mac）。

### 导入 TXT 后内容乱码

在「设置 → 阅读主题」下方（TODO：将在 Phase 2 加入「以 GBK 强制打开」兜底选项）。临时方案：用 `iconv -f GBK -t UTF-8 input.txt > output.txt` 转码后再导入。

### `pnpm test` 跳过 14 个 DB 测试

说明 `better-sqlite3` 的 native binding 没装好。重新编译：

```bash
pnpm rebuild
# 或
npx electron-rebuild -f -w better-sqlite3
```

### 首次启动慢 / 第二次秒开

首次启动会跑 SQLite migrations 和初始化 chokidar 文件监控，预期 ~500ms。后续启动复用 userData 目录秒开。

---

## ⚠️ 已知限制

1. **首次注册全局热键**需要 macOS 辅助功能权限。系统会自动弹窗引导。
2. **DMG 未签名**，仅适合个人 / 小圈子使用。要公开发布需要 Apple Developer 账号 + 公证（notarization）。
3. **TXT 编码识别有边角案例**：极个别 GBK 文件识别错误时会乱码，提供"以其他编码打开"的兜底（在设置面板，TODO）。
4. **章节识别失败的 TXT**：整本书视为 1 章，可以手动标记章节（TODO）。
5. **Popover 高度限制**：阅读主体在独立窗口，popover 仅作书架。
6. **不支持 Windows**（MVP 阶段）。架构上未写 macOS-only 的黑魔法，未来可拓展。

---

## 🗺️ 路线图

- [x] Phase 1 — MVP：菜单栏 + 书架 + 导入 + 阅读 + Boss Key
- [ ] Phase 2 — 体验打磨：搜索优化、文件夹监控完善、更多主题
- [ ] Phase 3 — 质感提升：阅读统计、笔记、划线、自动更新
- [ ] Phase 4 — 跨平台：Windows / Linux

详细见 [`DESIGN.md`](./DESIGN.md)。

---

## 📜 许可证

MIT

---

> 摸鱼有风险，上班需谨慎。本工具仅供学习与个人使用。
