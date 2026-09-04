# WorkThief 设计方案

> 上班摸鱼专用 · Mac 状态栏小说阅读器

---

## 1. TL;DR

一个常驻 Mac 菜单栏的小说阅读器。**Popover 充当书架与控制中心**，点击书后弹出独立浮动阅读窗口；**全局 Boss Key 一键秒藏**。纯本地 TXT 导入，零联网，零账号，零数据上传。

**目标用户**：需要长时间面对电脑、文字工作者、阅读爱好者。
**核心价值**：随时随地开始阅读，瞬间消失，不留痕迹，不卡工作。

---

## 2. 产品定位

| 维度 | 决策 |
|---|---|
| 平台 | macOS only（MVP），架构预留跨平台 |
| 形态 | Menu Bar App（无 Dock 图标） |
| 内容来源 | 本地 TXT 导入（用户自备） |
| 网络 | 完全离线 |
| 账号系统 | 无 |
| 收费 | 免费（MVP 阶段） |
| 目标体积 | 安装包 < 100MB（MVP），理想 < 60MB |

**非目标**（明确不做）：
- ❌ EPUB / PDF / Mobi 支持
- ❌ 在线书源 / 爬虫
- ❌ 云同步 / 多端
- ❌ 社交 / 书评 / 笔记导出
- ❌ Windows / Linux 客户端（MVP）

---

## 3. 架构总览

### 3.1 双窗口模型

```
┌─────────────────────────────────────┐
│  macOS Menu Bar                     │
│  📖 ← 状态栏图标                      │
│   │                                  │
│   ▼ 点击                             │
│  ┌───────────────────────────┐      │
│  │  Popover (书架 + 控制)     │      │
│  │  ┌─────────────────────┐  │      │
│  │  │ 最近阅读             │  │      │
│  │  │  • 三体 (Ch.23, 45%) │  │      │
│  │  ├─────────────────────┤  │      │
│  │  │ 全部书籍             │  │      │
│  │  │  • 活着              │  │      │
│  │  │  • 百年孤独          │  │      │
│  │  │  ...                │  │      │
│  │  ├─────────────────────┤  │      │
│  │  │ [导入] [⚙️ 设置]    │  │      │
│  │  └─────────────────────┘  │      │
│  └───────────────────────────┘      │
└─────────────────────────────────────┘

点击书后弹出 ↓

┌──────────────────────────────┐
│  Floating Reader Window      │
│  ┌────────────────────────┐  │
│  │  第二十三章              │  │
│  │                        │  │
│  │  章北海按下按钮...      │  │
│  │  ...                   │  │
│  │                        │  │
│  │  ─── 45% ───            │  │
│  └────────────────────────┘  │
│  无边框 / 可拖 / 可调大小    │
└──────────────────────────────┘
```

### 3.2 窗口生命周期

| 窗口 | 创建时机 | 显示控制 |
|---|---|---|
| **Popover** | App 启动即创建，永久常驻 | 点击菜单栏图标 show/hide |
| **阅读窗口** | 首次点击书时 lazy 创建 | 跟随书的打开/关闭，关闭书时自动隐藏但不销毁（保留阅读位置） |

**两个窗口共享同一 Boss Key**：触发时同时隐藏。

---

## 4. 数据模型（SQLite）

文件位置：`~/Library/Application Support/WorkThief/library.db`

```sql
-- 书籍表
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,           -- 显示名（默认取文件名）
  file_path TEXT NOT NULL UNIQUE, -- TXT 文件绝对路径
  file_size INTEGER,
  encoding TEXT,                  -- 探测到的编码 (utf-8 / gbk / utf-16le ...)
  chapter_count INTEGER,
  total_chars INTEGER,
  imported_at INTEGER NOT NULL,   -- ms timestamp
  last_opened_at INTEGER,
  cover_color TEXT                -- 自动生成的封面底色（按 hash）
);

-- 章节表（TXT 解析后写入）
CREATE TABLE chapters (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL,
  index INTEGER NOT NULL,         -- 章节序号（0-based）
  title TEXT NOT NULL,            -- 章节标题（解析得到）
  start_offset INTEGER NOT NULL,  -- 在原文中的字符偏移
  char_count INTEGER,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  UNIQUE(book_id, index)
);

-- 进度表
CREATE TABLE progress (
  book_id INTEGER PRIMARY KEY,
  chapter_index INTEGER NOT NULL,
  chapter_progress REAL NOT NULL, -- 0~1
  last_read_at INTEGER NOT NULL,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

-- 设置表（key-value）
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**索引**：
- `chapters(book_id, index)` 用于章节列表查询
- `books(last_opened_at DESC)` 用于"最近阅读"排序

---

## 5. TXT 解析

### 5.1 编码检测

使用 `chardet` 或 `jschardet` 库。优先级：

```
1. 检测 BOM (UTF-8 / UTF-16LE / UTF-16BE)
2. 用 chardet 探测
3. 默认尝试 UTF-8 → GBK → Big5（中文 TXT 三大常见编码）
```

**失败处理**：导入时显示编码错误，给出"以 GBK 强制打开"的兜底选项。

### 5.2 章节识别

正则优先级（命中即用）：

```javascript
const PATTERNS = [
  /^第\s*[0-9一二三四五六七八九十百千万零〇两壹贰叁肆伍陆柒捌玖拾]+\s*[章回节卷集部篇]/m,
  /^[【《]\s*第?[0-9一二三四五六七八九十]+\s*[章回节卷]\s*[】》]/m,
  /^\s*Chapter\s+\d+/im,
  /^\s*CHAPTER\s+[IVXLCDM]+/im,
  /^={3,}\s*第?[0-9一二三四五六七八九十]+\s*[章回节卷]/m,
];
```

**无法识别的 TXT**：整本书视作 1 章，允许用户在设置里**手动添加章节分隔点**（输入章节标题 + 字符偏移）。

---

## 6. UX 流程

### 6.1 首次启动

```
状态栏出现 📖 图标
  ↓ 点击
Popover 打开
  ↓
显示空状态："拖拽 TXT 文件到此处，或点击 [导入]"
  ↓ 用户拖入 / 点击导入
解析进度条 → 入库完成
  ↓
自动打开第一本书的阅读窗口
```

### 6.2 日常阅读循环

```
工作累了 → ⌥⌘Space 唤起 Popover
  ↓ 点最近阅读的书
阅读窗口出现（上次位置）
  ↓ 读完一段
⌘→ 翻下一段 / 滚轮 / 滑动
  ↓ 老板来了
⌃⌥⌘M 瞬时隐藏（两个窗口同时消失）
  ↓ 老板走了
⌥⌘Space 唤回
```

### 6.3 导入流程

支持三种方式（用户上一轮选了"三种都要"）：

| 方式 | 触发 | 行为 |
|---|---|---|
| **拖拽** | 拖 TXT 进 popover | 批量解析入库 |
| **文件关联** | Finder 双击 .txt | 单本导入并打开阅读 |
| **文件夹监控** | 设置里指定监听目录 | 新增/修改自动入库 |

**TXT 文件本身不被移动/复制**，只记录路径。用户删除原文件时，DB 标记为"丢失"并给出提示。

---

## 7. 快捷键

### 7.1 默认绑定

| 快捷键 | 作用域 | 功能 |
|---|---|---|
| `⌥⌘Space` | 全局 | Popover show/hide 切换 |
| `⌃⌥⌘M` | 全局 | 瞬时隐藏（按一下藏，再按显示） |
| `⌘W` | 阅读窗口 | 关闭当前阅读窗口 |
| `⌘[` | 阅读窗口 | 上一章 |
| `⌘]` | 阅读窗口 | 下一章 |
| `⌘↑` | 阅读窗口 | 滚到顶部 |
| `⌘↓` | 阅读窗口 | 滚到底部 |
| `⌘F` | 阅读窗口 | 章节内搜索 |
| `⌘,` | App | 打开设置 |
| `Esc` | 阅读窗口 | 隐藏阅读窗口（保留在 dock 内存） |

### 7.2 冲突说明

- `⌥⌘Space` 与 Spotlight / Raycast 可能冲突。设置页提供"录制快捷键"功能，用户可一键改。
- 全局热键在 Electron 中需用 `globalShortcut.register`，且 macOS 上首次注册会触发系统授权弹窗。

---

## 8. 阅读主题系统

### 8.1 预设主题（4 套）

| 主题 | 背景 | 文字 | 适用场景 |
|---|---|---|---|
| **默认亮** | `#FFFFFF` | `#1A1A1A` | 白天 / 强光环境 |
| **深色** | `#1C1C1E` | `#E8E8E8` | 晚上 / 弱光 |
| **护眼米黄** | `#F5EFD8` | `#3D3520` | 长时间阅读 |
| **羊皮纸** | `#F4ECD8` | `#5C4B37` | 沉浸 / 古典文学 |

### 8.2 可调参数

- 字体（系统字体列表：Songti SC / Heiti SC / KaiTi / 苹方 等）
- 字号（12 ~ 32）
- 行距（1.2 ~ 2.4）
- 段间距（0 ~ 32px）
- 首行缩进（0 / 1 / 2 字符）
- 字重（300 ~ 700）
- 窗口宽度（影响每行字数）
- 窗口透明度（0.5 ~ 1.0） ← 摸鱼专用

### 8.3 存储

主题配置存在 `settings` 表，**全局一套**（MVP）。未来可扩展为"每本书独立配置"。

---

## 9. 技术栈

### 9.1 选型

| 层 | 选型 | 理由 |
|---|---|---|
| **运行时** | Electron 28+ | 用户决定 |
| **菜单栏框架** | `menubar` (npm) | 最成熟的 Electron menu bar 封装 |
| **数据库** | `better-sqlite3` | 同步 API，性能高，迁移简单 |
| **编码检测** | `jschardet` | 纯 JS，无 native 依赖 |
| **TXT 解析** | 自写（~200 行） | 逻辑简单，无需库 |
| **状态管理** | Pinia 或纯 composables | Popover 内 UI 状态简单 |
| **UI 框架** | Vue 3 + TypeScript + `<script setup>` | 生态成熟、单人项目心智负担小 |
| **样式** | Tailwind CSS | 快 |
| **打包** | `electron-builder` | DMG 输出，签名/公证支持 |
| **热键** | Electron `globalShortcut` | 内置 |
| **自动更新** | `electron-updater`（可选） | 后续迭代再加 |

### 9.2 进程划分

```
Main Process (Node.js)
├── App Lifecycle
├── Tray (菜单栏图标)
├── Popover Window 管理
├── Reader Window 管理
├── IPC Handlers（文件 I/O / DB / TXT 解析）
└── GlobalShortcut 注册

Renderer: Popover
├── Vue 3 + Tailwind
└── 书架 UI、导入 UI、设置 UI

Renderer: Reader
├── Vue 3 + Tailwind
└── 章节渲染、进度跟踪、主题应用
```

---

## 10. 目录结构

```
work-thief/
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── vite.config.ts                 # Vite 打包 renderer
├── tailwind.config.js
├── src/
│   ├── main/                      # Main process
│   │   ├── index.ts               # 入口
│   │   ├── tray.ts                # 菜单栏图标 + Popover 控制
│   │   ├── windows/
│   │   │   ├── popover.ts
│   │   │   └── reader.ts
│   │   ├── ipc/
│   │   │   ├── books.ts           # 导入、列表、删除
│   │   │   ├── chapters.ts        # 章节解析与读取
│   │   │   ├── progress.ts        # 进度读写
│   │   │   └── settings.ts        # 设置读写
│   │   ├── parsers/
│   │   │   ├── encoding.ts        # 编码探测
│   │   │   ├── chapters.ts        # 章节正则
│   │   │   └── txt.ts             # TXT 主解析
│   │   ├── db/
│   │   │   ├── client.ts          # better-sqlite3 单例
│   │   │   ├── schema.sql
│   │   │   └── migrations.ts
│   │   ├── shortcuts/
│   │   │   └── global.ts          # globalShortcut 注册
│   │   └── utils/
│   │       └── pathWatcher.ts     # 文件夹监控
│   ├── preload/
│   │   └── index.ts               # contextBridge 暴露 API
│   ├── renderer-popover/          # Popover renderer
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── components/
│   │   │   ├── BookList.vue
│   │   │   ├── BookItem.vue
│   │   │   ├── ImportZone.vue
│   │   │   ├── SettingsPanel.vue
│   │   │   └── EmptyState.vue
│   │   ├── stores/
│   │   │   └── library.ts         # Pinia store 或 composable
│   │   └── composables/
│   │       └── useLibrary.ts
│   └── renderer-reader/           # Reader renderer
│       ├── index.html
│       ├── main.ts
│       ├── App.vue
│       ├── components/
│       │   ├── ChapterView.vue
│       │   ├── ProgressBar.vue
│       │   ├── ChapterNav.vue
│       │   └── SearchBar.vue
│       ├── themes/
│       │   └── presets.ts
│       ├── stores/
│       │   └── reader.ts
│       └── composables/
│           ├── useChapter.ts
│           └── useProgress.ts
└── resources/
    ├── icon.png                   # 状态栏图标（模板，建议 22x22 @2x）
    └── entitlements/
        └── macos.plist
```

---

## 11. 开发路线图

### Phase 1 — MVP（2~3 周）

- [ ] Electron + menubar 项目骨架
- [ ] 状态栏图标 + Popover 弹出
- [ ] TXT 导入（拖拽 + 文件选择器）
- [ ] TXT 解析（编码 + 章节）
- [ ] 书架 UI（列表、最近阅读置顶）
- [ ] 阅读窗口（基础渲染、滚动、进度条）
- [ ] SQLite 持久化（books / chapters / progress）
- [ ] Boss Key 全局热键（`⌃⌥⌘M`）
- [ ] Popover 热键（`⌥⌘Space`）
- [ ] 4 套预设主题 + 字号/行距可调
- [ ] 章节内百分比进度跟踪
- [ ] DMG 打包（无公证，开发者自用或小范围分发）

### Phase 2 — 体验打磨（1~2 周）

- [ ] 文件夹监控导入
- [ ] Finder 文件关联
- [ ] 章节内搜索（⌘F）
- [ ] 快捷键自定义
- [ ] 完整设置面板（透明度 / 字体 / 主题编辑）
- [ ] 进度同步（窗口 resize 后位置保持准确）
- [ ] 启动优化（冷启动 < 500ms）

### Phase 3 — 质感提升（后续）

- [ ] 自动更新
- [ ] 多套主题编辑器
- [ ] 阅读统计（每日时长 / 本数）
- [ ] 笔记 / 划线（local-only）
- [ ] AppleScript 集成（可被其他 app 控制）
- [ ] 国际化（英文 UI）

### Phase 4 — 跨平台（远期）

- [ ] Windows 版本（需要解决任务栏集成 + 测试）
- [ ] Linux 支持

---

## 12. 风险与决策日志

| 风险 | 等级 | 缓解 |
|---|---|---|
| **macOS 公证 / 签名** | 中 | Phase 1 不做公证，DMG 提示"未知开发者"，自用 OK |
| **Electron 包体积** | 中 | 接受 80~100MB，使用 `electron-builder` 的 asar 压缩 |
| **TXT 编码探测误判** | 高 | 提供"以其他编码打开"兜底，用户可手动覆盖 |
| **章节识别失败** | 高 | 整本书作 1 章 + 提供手动标记章节的工具 |
| **全局热键与系统冲突** | 中 | 默认值已避开主流占用；提供录制自定义 |
| **Popover 高度限制** | 低 | 阅读在独立窗口，popover 只需装得下书架 |
| **TXT 文件被用户删除** | 低 | DB 保留条目，标记"文件丢失"，提供重新定位 |
| **Mac 屏幕录制权限** | 低 | 不需要，纯前端 |
| **macOS 辅助功能权限** | 中 | 全局热键需要首次授权；UI 引导用户去系统设置开启 |

### 决策记录

- ❓ **为什么不用 SwiftUI**：用户决定用 Electron。尊重选择，标注 trade-off。
- ❓ **为什么用 Vue 3 而不是 React**：单人项目，Vue 的 Composition API + `<script setup>` 心智负担更小，模板更直观。Electron + Vue 生态成熟，无任何架构影响。
- ❓ **为什么不做 EPUB**：用户选择极简 TXT 路线。避免 2~4 周额外工作量。
- ❓ **为什么用百分比记录进度**：抗字体/窗口尺寸变化，永远准确。
- ❓ **为什么 Boss Key 默认双热键**：show/hide 切换 + 瞬时隐藏分开，避免误触和心智负担。

---

## 13. 下一步建议

1. **立即可做**：用 Figma / 纸笔画 3 张关键页面草图
   - Popover 书架页（含导入区）
   - 阅读窗口（含主题切换对比）
   - 设置页（主题编辑器 + 快捷键录制）

2. **接着**：在仓库里建 `src/` 骨架，`pnpm init` + 装依赖，跑通"Electron + menubar + 空白 popover"hello world

3. **验证里程碑**：1 周内跑出"导入 TXT → 书架显示 → 点开能看 → Boss Key 能藏"完整链路
