# Path Helper - Obsidian 路径助手

> 一键打开剪贴板中的绝对路径，支持跨仓库跳转、文件夹定位、同名文件夹笔记，以及一键同步到所有仓库。

[![Version](https://img.shields.io/badge/version-0.1.8.1-blue)](https://github.com/737893911/obsidian-plugin-path-helper)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.4.0+-purple)](https://obsidian.md)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

## 为什么需要这个插件？

当你在 Windows 资源管理器中找到一个笔记文件或文件夹，想在 Obsidian 中打开它时，你手里只有一个**绝对路径**（如 `D:\Obsidian知识库\项目\笔记.md`）。Obsidian 无法直接识别这种路径，需要先转换成 `obsidian://` 协议 URI 才能跳转。

**Path Helper** 自动完成「读取剪贴板路径 → 智能匹配仓库 → 转换 → 打开」的全过程，无需手动处理。

## 核心功能

- **剪贴板路径秒开** - 复制文件/文件夹绝对路径，一个命令在 Obsidian 中打开
- **智能跨仓库跳转** - 自动识别路径属于哪个仓库，无缝切换
- **文件夹定位高亮** - 不只是打开，还在文件管理器中定位并高亮目标
- **Folder Note 支持** - 打开文件夹时优先打开同名笔记（如 `项目/项目.md`）
- **一键同步所有仓库** - 升级插件不再逐个仓库复制，一键搞定
- **跨仓库接力定位** - 自定义 URI 协议，实现多仓库间的文件夹精确定位

## 快速开始

### 安装

1. 下载最新版本的 [Release](https://github.com/737893911/obsidian-plugin-path-helper/releases)
2. 解压到 vault 的插件目录：
   ```
   <你的vault路径>\.obsidian\plugins\path-helper\
   ```
3. 确保目录下包含 `main.js`、`manifest.json`
4. 打开 Obsidian → 设置 → 第三方插件 → 开启 **Path Helper**

> 如果没有看到插件，请确认已关闭「安全模式」。

### 使用

1. 在资源管理器中复制文件/文件夹的绝对路径
   - 选中文件 → `Shift + 右键` → **复制为路径**
   - 或在地址栏复制路径
2. 切换到 Obsidian
3. 打开命令面板（`Ctrl + P`），执行：
   ```
   Open clipboard path in Obsidian
   ```
4. 自动跳转！

> 建议绑定快捷键（如 `Ctrl+Shift+L`）提高效率。

## 工作原理

```
剪贴板绝对路径
    │
    ▼
是否属于当前 vault？
    ├─ 是 → 直接用 Obsidian API 打开
    │         ├─ 文件 → 打开 + 在文件管理器中定位
    │         └─ 文件夹 → 根据设置：
    │                    ├─ Folder Note 开启 → 打开同名笔记
    │                    └─ Folder Note 关闭 → 定位文件夹
    │
    └─ 否 → 读取 obsidian.json 匹配目标仓库
              → 生成 obsidian://path-helper-reveal URI
              → 目标仓库的插件接收并处理
```

## 设置项

| 设置项 | 默认 | 说明 |
|--------|------|------|
| URL-encode spaces | 开启 | 空格编码为 `%20` |
| Strip .md extension | 关闭 | URI 中去掉 `.md` 后缀 |
| URI action | `open` | 跨仓库时：打开笔记 / 搜索文件名 |
| Show notification | 开启 | 操作完成后显示通知 |
| Open folder note | 关闭 | 文件夹优先打开同名笔记 |
| Sync to all vaults | — | 一键同步到其他仓库 |

## 一键同步功能 (v0.1.8+)

管理多个仓库的插件版本不再痛苦：

1. 设置 → Path Helper → 点击 **「选择仓库并同步」**
2. 勾选需要同步的仓库
3. 点击 **「确认同步」**

同步行为：
- **安装** - 目标仓库未安装时自动安装
- **更新** - 版本低于当前版本时自动更新
- **跳过** - 版本已是最新时跳过
- **保留配置** - 不触碰 `data.json`，用户设置不丢失
- **自动启用** - 自动添加到已启用插件列表

## 项目结构

本仓库包含 Path Helper 的所有历史版本：

```
Path Helper-Obsidian插件版/
├── readme.md                                    # 本文件
├── 0-path-to-file_History/                      # 早期版本存档
│   ├── obsidian-plugin-path-to-file-0.1.0/
│   ├── obsidian-plugin-path-to-file-0.1.1/
│   ├── obsidian-plugin-path-to-file-0.1.2/
│   └── obsidian-plugin-path-to-file-0.1.3/
├── obsidian-plugin-path-helper-0.1.4/
├── obsidian-plugin-path-helper-0.1.5/           # 跨仓库 obsidian.json 解析
├── obsidian-plugin-path-helper-0.1.6/           # 跨仓库文件夹接力定位
├── obsidian-plugin-path-helper-0.1.7/           # 文件打开时自动定位
├── obsidian-plugin-path-helper-0.1.8/           # 一键同步所有仓库
└── obsidian-plugin-path-helper-0.1.8.1/         # 最新版本
```

每个版本目录都是完整的可独立构建的插件源码。

## 开发

```bash
# 进入任意版本目录
cd obsidian-plugin-path-helper-0.1.8.1

# 安装依赖
npm install

# 开发模式（监听变化自动构建）
npm run dev

# 生产构建
npm run build
```

## 更新日志

### v0.1.8.1 (最新)
- 移除安全模式相关功能（Obsidian 1.13.7 不再从 `app.json` 读取该状态）

### v0.1.8
- 新增一键同步到所有仓库功能
- 仓库选择弹窗，显示安装状态和版本信息
- 版本比对，只升级不降级
- 自动启用插件

### v0.1.7
- 文件打开时自动在文件管理器中定位
- 跨仓库接力处理器扩展

### v0.1.6
- 跨仓库文件夹定位：接力方案
- 自定义 URI 协议 `path-helper-reveal`

### v0.1.5
- 跨仓库路径解析改用 `obsidian.json` 注册表
- 支持任意嵌套的仓库路径

### v0.1.0 - v0.1.4
- 基础功能：剪贴板路径打开
- 文件夹定位
- Folder Note 支持

## 技术栈

- TypeScript
- Obsidian Plugin API
- esbuild（打包）
- Electron clipboard / shell（桌面端）

## 注意事项

- 本插件为**桌面端专用**（依赖 Electron 的剪贴板和协议打开能力）
- 跨仓库场景依赖 `obsidian://` 协议已在系统中正确注册
- 跨仓库路径解析依赖本地 `obsidian.json`，仅支持已打开过的仓库

## License

MIT

---

如果这个插件对你有帮助，欢迎给个 Star！
