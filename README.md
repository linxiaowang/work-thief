# WorkThief

[English](README.en.md)

在 macOS **菜单栏**里读本地 **TXT 小说**：不占窗口、不显眼，左键翻页，一键切到「工作中」伪装。

<p align="center">
  <img src="./resources/icon.png" width="96" height="96" alt="WorkThief 图标">
</p>

支持书架、阅读进度、章节目录跳转、全局快捷键。仅 macOS；安装包从下方下载即可使用。

---

## 下载

<p align="center">
  <a href="https://github.com/linxiaowang/work-thief/releases/latest/download/WorkThief-Mac.dmg">
    <img src="https://img.shields.io/badge/macOS-下载%20DMG-000000?style=for-the-badge&logo=apple&logoColor=white" alt="下载 macOS 版">
  </a>
</p>

| 平台 | 说明 |
|------|------|
| Apple Silicon（M 系列） | 下载 [WorkThief-Mac.dmg](https://github.com/linxiaowang/work-thief/releases/latest/download/WorkThief-Mac.dmg)，打开后拖入「应用程序」 |
| Intel 芯片 | 到 [Releases](https://github.com/linxiaowang/work-thief/releases/latest) 查看是否有 Intel 专用安装包 |

更多版本说明与历史包：[Releases 页面](https://github.com/linxiaowang/work-thief/releases/latest)。

### 打不开或提示「已损坏」

安装包**未做苹果开发者签名**，首次打开可能被系统拦截，**不是文件坏了**。

1. 弹窗点 **取消**（不要移到废纸篓）。
2. 终端执行（路径按实际安装位置修改）：

```bash
xattr -cr /Applications/WorkThief.app
```

3. 再双击打开，或 **右键图标 → 打开 → 仍要打开**。必要时在 **系统设置 → 隐私与安全性** 里允许。

更新请留意 GitHub Releases，应用内暂无自动更新。

---

## 快速上手

1. 打开 WorkThief，菜单栏**右侧**（靠近时钟）会出现文字；还没有书时会提示选 txt。
2. **左键**文字区域 → 选一本 `.txt`；或 **右键** → **选择小说…**。
3. **左键** → 下一页；**右键** → 菜单（设置、书架、上一页/下一页、章节、Boss、快捷键、退出）。
4. 右键 → **打开设置…** 可改：每页字数、中文编码、是否显示页码、Boss 伪装文案、监听文件夹等。

图标会固定在菜单栏右侧，不会跑到左边。

## 快捷键

全局快捷键需要 **辅助功能** 权限：系统会提示，授权后**重启一次** WorkThief。

| 按键 | 作用 |
|------|------|
| ⌘⌥. | 下一页 |
| ⌘⌥, | 上一页 |
| ⌘⌥M | Boss：菜单栏改成「工作中」等伪装；再按一次恢复阅读 |

可在 **右键 → 快捷键** 里改成别的组合键；**Esc** 取消录制；**恢复默认** 可还原上表。

章节跳转在 **右键菜单** 里选，没有默认章节快捷键。

## 文件夹自动导入（可选）

把 `.txt` 放进 **文稿/WorkThief**（可在设置里改路径），新文件会自动进书架。第一次用也可以只用「选择小说」选文件。

## 常见问题

- **只支持 TXT**，不支持 EPUB 等格式。
- **中文乱码**：设置里把编码改成 UTF-8 或 GBK，或选「自动」。
- **热键没反应**：确认已给辅助功能权限并重启应用。
- **阅读记录在哪**：保存在本机用户目录，卸载应用后若要清数据，可删除  
  `~/Library/Application Support/WorkThief` 文件夹。

## 开发者

从源码运行需要 Node 20+ 与 [pnpm](https://pnpm.io/)：`git clone` → `pnpm install` → `pnpm dev`。Apple Silicon 请用 arm64 版 Node；异常时可执行 `pnpm setup`。打包：`pnpm dist`。维护者打 `v*` 标签会触发 GitHub Actions 发版，见 [`.github/workflows/release.yml`](./.github/workflows/release.yml)。设计与实现细节见 [`DESIGN.md`](./DESIGN.md)。

## 许可证

MIT
