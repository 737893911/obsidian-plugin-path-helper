# Path Helper

[English](README.md)

> 在 Obsidian 中一键处理文件路径：打开剪贴板里的文件/文件夹绝对路径、定位文件夹、打开同名文件夹笔记等。

## 简介

当你在 Windows 资源管理器中找到一个笔记文件或文件夹，想在 Obsidian 中打开它时，你手里只有一个**绝对路径**（如 `D:\Vaults\笔记库\项目\笔记.md`）。Obsidian 无法直接识别这种路径，需要先转换成 `obsidian://` 协议 URI 才能跳转。

本插件提供一个命令，自动完成「读取剪贴板路径 → 转换 → 打开」的全过程，无需切出 Obsidian 手动处理。未来还将扩展更多与路径相关的便捷功能。

## 功能

- 📋 **读取剪贴板绝对路径**，自动在 Obsidian 中打开对应文件
- 📁 **支持文件夹路径**：在文件管理器中定位并高亮该文件夹
- 📝 **同名文件夹笔记（Folder Note）**：打开文件夹时，优先打开 `文件夹名/文件夹名.md`，找不到则回退到定位文件夹
- 🔀 **自动区分当前 vault / 跨 vault**：
  - 当前 vault 内的文件 → 直接用 Obsidian API 打开（最可靠）
  - 其他 vault 的文件 → 转换为 `obsidian://` URI 通过系统协议打开
- ⚙️ 可配置：空格编码、去掉 `.md` 后缀、URI 动作（打开/搜索）、通知开关、Folder Note 开关
- 🔄 **一键同步到所有仓库**：在设置面板一键将本插件安装/更新到其他已注册的 Obsidian 仓库，自动启用插件

## 安装

### 手动安装

1. 从 GitHub Release 下载 `main.js`、`manifest.json` 和 `styles.css`
2. 在 vault 的插件目录中创建 `path-helper` 文件夹：
   ```
   <你的vault路径>\.obsidian\plugins\path-helper\
   ```
3. 将下载的文件放入该目录
4. 打开 Obsidian → 设置 → 第三方插件 → 开启 **Path Helper**

> 如果没有看到插件，请确认已关闭「安全模式」。

### 从源码构建

```bash
npm install
npm run build
```

构建产物为 `main.js`。

## 使用方法

1. 在 Windows 资源管理器中找到目标文件或文件夹
2. 复制其绝对路径：
   - 选中文件 → `Shift + 右键` → **复制为路径**
   - 或在地址栏复制路径
3. 切换到 Obsidian
4. 打开命令面板（`Ctrl + P`），执行命令：
   ```
   Open clipboard path in Obsidian
   ```
5. Obsidian 自动跳转到对应文件或文件夹

> 建议在 Obsidian 设置 → 快捷键中为该命令绑定一个常用快捷键（如 `Ctrl+Shift+L`）。

## 设置项

在 设置 → Path Helper 中可配置：

| 设置项 | 默认值 | 说明 |
|---|---|---|
| **URL-encode spaces** | 开启 | 将路径中的空格编码为 `%20`（仅影响跨 vault 的 URI） |
| **Strip .md extension** | 关闭 | 在生成的 URI 中去掉 `.md` 后缀 |
| **URI action** | `open` | 跨 vault 时的 URI 动作：`open`（打开笔记）/ `search`（搜索文件名） |
| **Show notification** | 开启 | 操作完成后显示右上角通知 |
| **Open folder note** | 关闭 | 打开文件夹时优先尝试打开同名笔记（`folder/folder.md`），找不到则回退到定位文件夹 |
| **Sync to all vaults** | — | 点击「选择仓库并同步」按钮，将本插件安装/更新到其他已注册仓库 |

## 一键同步到所有仓库（v0.1.8+）

当你在多个 Obsidian 仓库中使用本插件时，每次升级都要逐个仓库复制文件、启用插件，非常繁琐。v0.1.8 提供了一键同步功能。

### 使用方法

1. 打开 设置 → Path Helper
2. 点击底部的 **「选择仓库并同步」** 按钮
3. 在弹出的仓库列表中勾选需要同步的仓库（默认全部未勾选）
4. 点击 **「确认同步」**

### 同步行为

- **安装**：目标仓库未安装本插件时，复制 `main.js`、`manifest.json`、`styles.css`
- **更新**：目标仓库版本低于当前版本时，覆盖更新插件文件
- **跳过**：目标仓库版本 ≥ 当前版本时，不做任何操作
- **保留配置**：同步过程中**不触碰 `data.json`**，目标仓库的用户设置不会丢失
- **自动启用**：将 `path-helper` 追加到目标仓库的 `community-plugins.json`

### 仓库状态显示

弹窗中每个仓库会显示：
- **未安装** / **v0.1.x（可更新至 v0.1.11）** / **v0.1.11（最新）**
- **已启用** / **未启用**

> 注意：Obsidian 1.13.7 将受限模式（安全模式）存储在内部数据库中，无法从外部文件读取或修改。同步不处理受限模式，请确保目标仓库已在 Obsidian 中手动关闭受限模式，否则插件虽已安装但不会加载。

### 通知明细

同步完成后，右上角会显示逐仓库的处理结果，例如：

```
同步完成：安装 2，更新 1，跳过 1
• 仓库A：安装（v0.1.11）
• 仓库B：更新（v0.1.10 → v0.1.11）
• 仓库C：跳过（已是最新 v0.1.11）
```

### 注意事项

- 建议先**关闭目标仓库的 Obsidian 窗口**再执行同步，避免 Obsidian 在运行中覆盖写入的配置文件
- 仅支持已在 Obsidian 中打开过的仓库（即 `obsidian.json` 注册表中有记录的仓库）
- 支持自定义配置目录的仓库（会读取 `obsidian.json` 中的 `config` 字段）

## 工作原理

### 路径判断流程

```
剪贴板绝对路径
    │
    ▼
是否属于当前 vault？
    ├─ 是 → 直接用 Obsidian API 处理
    │         ├─ 文件 → openFile() 打开
    │         └─ 文件夹 → 根据设置：
    │                    ├─ Open folder note 开启 → 找同名笔记，找不到则定位文件夹
    │                    └─ Open folder note 关闭 → 在文件管理器中定位文件夹
    │
    └─ 否 → 转换为 obsidian:// URI，用 shell.openExternal 打开
              （文件和文件夹路径均支持）
```

### 当前 vault 内的文件夹定位

调用 Obsidian 文件管理器插件的内部 API `revealInFolder(folder)`，自动展开父级目录、滚动到该文件夹并高亮选中。若文件管理器插件被禁用，则 fallback 到 `obsidian://open` URI。

### 跨 vault 的路径转换

1. 优先尝试匹配当前 vault 的绝对路径前缀
2. 匹配失败时，从路径中解析 vault 名（盘符后的第一个文件夹）
3. 生成 `obsidian://open?vault=<vault名>&file=<相对路径>` URI
4. 通过 Electron 的 `shell.openExternal()` 打开（而非 `openWithDefaultApp`，后者会把 URI 当成本地文件路径）

### 路径编码策略

- 空格：根据设置项决定是否编码为 `%20`
- 特殊字符 `# ? & % +`：**强制编码**（否则会破坏 URI 的 query 参数解析）
- 中文字符：保持原样不编码（Obsidian 原生支持）

## 项目结构

```
obsidian-plugin-path-helper/
├── main.ts              # 插件主入口：命令注册、设置面板、剪贴板读取、打开逻辑、同步功能
├── pathConverter.ts     # 路径转换核心：绝对路径 → obsidian:// URI
├── styles.css           # 插件界面样式
├── manifest.json        # 插件清单
├── package.json         # 依赖与脚本
├── tsconfig.json        # TypeScript 配置
├── esbuild.config.mjs   # 构建配置
└── main.js              # 构建产物
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化自动构建）
npm run dev

# 生产构建
npm run build

# 类型检查
npm run typecheck
```

## 技术栈

- TypeScript
- Obsidian Plugin API
- esbuild（打包）
- Electron clipboard / shell（桌面端）

## 注意事项

- 本插件为**桌面端专用**（`isDesktopOnly: true`），依赖 Electron 的剪贴板和协议打开能力
- 跨 vault 场景依赖 `obsidian://` 协议已在系统中正确注册（安装 Obsidian 时默认注册）
- 跨 vault 的路径解析依赖本地 `obsidian.json` 注册表，仅支持已被 Obsidian 打开过的仓库

## 权限与隐私

- 只有在用户主动执行打开路径命令时，插件才会读取系统剪贴板中的文本
- 为了识别跨仓库路径，插件会读取 Obsidian 的本地 `obsidian.json` 仓库注册表
- 仅当用户在同步弹窗中勾选目标仓库并确认后，插件才会在这些仓库的 `.obsidian` 目录中复制插件文件并更新 `community-plugins.json`
- 插件不上传数据、不使用遥测，也不向任何远程服务发送笔记、路径或剪贴板内容

## License

MIT

---

## 更新日志

### v0.1.11（未发布）

- 将固定界面样式移动到 `styles.css`，符合社区插件规范
- 移除设置页顶部重复的插件名称标题
- 默认 README 改为完整英文版，并单独保留中文版
- 修复一个未等待的 Promise，移除未使用变量和调试日志

### v0.1.10

**Obsidian Community 审核兼容性修复**

- 调整 manifest 描述，符合社区目录文案要求
- 将直接样式赋值改为 Obsidian `setCssProps` API
- 设置页标题改用 `Setting.setHeading()`
- README 新增英文功能概述与隐私说明

### v0.1.9

**修复其他仓库中的插件版本检测**

- 修复目标仓库的 Path Helper 安装目录不是标准 `plugins/path-helper` 时，同步弹窗误报“未安装”的问题
- 目标仓库检测改为：优先检查标准目录，未命中时扫描插件目录并通过 `manifest.id` 识别 Path Helper
- 弹窗状态检测和实际同步共用同一套插件定位逻辑
- 对已安装在带版本号等非标准文件夹中的插件，同步时直接更新原目录，避免创建重复的 `path-helper` 目录
- 插件启用状态检测改为使用当前 manifest 中的插件 ID，不再写死 `path-helper`
- 同步仓库列表中自动排除 Obsidian 自带的 `Obsidian Sandbox` 测试库

### v0.1.8.1

**移除安全模式相关功能**

Obsidian 1.13.7 将受限模式（安全模式）的状态存储在内部数据库（IndexedDB）中，**既不读取也不写入 `app.json`**。因此从外部文件既无法检测也无法修改受限模式状态。

- **移除安全模式状态显示**：弹窗中不再显示"安全模式开/关"（之前显示的信息与实际不符，具有误导性）
- **移除自动关闭安全模式**：同步时不再写入 `restrictedMode: false` 到 `app.json`（该操作对 Obsidian 1.13.7 无效）

**影响**：同步仍会安装/更新插件文件并追加到 `community-plugins.json`，但目标仓库需在 Obsidian 中**手动关闭受限模式**后插件才会加载。

### v0.1.8

**一键同步到所有仓库**

- 新增「Sync to all vaults」设置项，点击「选择仓库并同步」按钮可将本插件安装/更新到其他已注册的 Obsidian 仓库
- 仓库选择弹窗：
  - 列出所有其他已注册仓库，显示安装状态（未安装 / 版本号 / 可更新 / 最新）、是否启用
  - 默认全部未勾选，支持全选/取消全选
- 同步行为：
  - **版本比对**：目标版本 < 当前版本才更新；目标版本 ≥ 当前版本则跳过（不降级）
  - **文件复制**：仅复制 `main.js`、`manifest.json`、`styles.css`，**不触碰 `data.json`**（保留用户配置）
  - **自动启用**：追加到 `community-plugins.json`
  - ~~关闭安全模式~~（v0.1.8.1 移除：Obsidian 1.13.7 不从此字段读取，写入无效）
- 同步完成后显示逐仓库明细通知（安装/更新/跳过/失败及具体原因）
- 支持自定义配置目录的仓库（读取 `obsidian.json` 中的 `config` 字段）
- 源插件目录探测：优先标准位置 `<vault>/.obsidian/plugins/<id>`，未命中时扫描 plugins 目录匹配 manifest id（兼容文件夹名与 id 不一致的情况）

### v0.1.7

**文件打开时自动在文件管理器中定位**

- 问题：无论是本仓库还是跨仓库，打开文件后只是在编辑区显示文件，左侧文件管理器不会定位到该文件（不像文件夹那样会高亮）
- 本仓库：打开文件后调用 `revealInFolder(file)` 在文件管理器中定位（`revealInFolder` 同时支持 TFile 和 TFolder）
- 跨仓库：统一使用接力 URI，文件传 `&file=` 参数，目标仓库的插件负责打开文件并定位
- 接力处理器扩展为同时处理 `file`（打开+定位）和 `folder`（定位）两种参数


### v0.1.6

**跨 vault 文件夹定位：接力方案**

- 问题：跨 vault 时，文件可通过 `obsidian://open?vault=X&file=...` 正常打开，但文件夹路径只能切换到目标 vault，无法定位到具体文件夹（Obsidian URI 协议没有"定位文件夹"动作）
- 方案：利用 Obsidian 插件的 `registerObsidianProtocolHandler` 注册自定义 URI 动作 `path-helper-reveal`，实现两个 vault 之间的接力定位
- 流程：
  1. 源 vault 识别到跨 vault 文件夹路径后，生成 `obsidian://path-helper-reveal?vault=目标仓库&folder=相对路径`
  2. 通过 `shell.openExternal` 发出该 URI
  3. Obsidian 切换到目标 vault
  4. 目标 vault 中本插件（onload 时已注册处理器）接收 `folder` 参数，调用 `revealInFolder` 在文件管理器中定位该文件夹
- 前提：**两个 vault 都需要安装并启用本插件**（v0.1.6+）
- 提示：跨 vault 文件夹定位时，通知会附带"目标仓库需安装 Path Helper 插件"的说明

### v0.1.5

**跨 vault 路径解析改用 obsidian.json 注册表**

- 旧方案：跨 vault 时用「盘符后第一个文件夹」猜测 vault 名，仅支持 vault 直接位于盘符根目录的场景（如 `D:\MyVault\...`），嵌套 vault（如 `D:\Vaults\my-vault\...`）会解析错误
- 新方案：读取 Obsidian 本地注册表 `%APPDATA%\obsidian\obsidian.json`，获取所有已注册 vault 的绝对路径，通过**最长前缀匹配**确定文件所属的 vault
- 优势：无论 vault 嵌套多深都能正确识别；不再依赖启发式猜测
- 注意：仅支持已在 Obsidian 中打开过的仓库（obsidian.json 中有记录的）
