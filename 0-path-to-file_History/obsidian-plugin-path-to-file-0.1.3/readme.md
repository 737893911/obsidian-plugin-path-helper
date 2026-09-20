# Path to URI

> 在 Obsidian 中一键打开剪贴板里的文件/文件夹绝对路径。

## 简介

当你在 Windows 资源管理器中找到一个笔记文件或文件夹，想在 Obsidian 中打开它时，你手里只有一个**绝对路径**（如 `D:\LJCdisk\笔记库\项目\笔记.md`）。Obsidian 无法直接识别这种路径，需要先转换成 `obsidian://` 协议 URI 才能跳转。

本插件提供一个命令，自动完成「读取剪贴板路径 → 转换 → 打开」的全过程，无需切出 Obsidian 手动处理。

## 功能

- 📋 **读取剪贴板绝对路径**，自动在 Obsidian 中打开对应文件
- 📁 **支持文件夹路径**：在文件管理器中定位并高亮该文件夹
- 📝 **同名文件夹笔记（Folder Note）**：打开文件夹时，优先打开 `文件夹名/文件夹名.md`，找不到则回退到定位文件夹
- 🔀 **自动区分当前 vault / 跨 vault**：
  - 当前 vault 内的文件 → 直接用 Obsidian API 打开（最可靠）
  - 其他 vault 的文件 → 转换为 `obsidian://` URI 通过系统协议打开
- ⚙️ 可配置：空格编码、去掉 `.md` 后缀、URI 动作（打开/搜索）、通知开关、Folder Note 开关

## 安装

### 手动安装

1. 下载或克隆本项目
2. 将 `obsidian-plugin-path-to-file-0.1.3` 文件夹复制到你的 vault 插件目录：
   ```
   <你的vault路径>\.obsidian\plugins\obsidian-plugin-path-to-file\
   ```
   （建议重命名为 `obsidian-plugin-path-to-file`）
3. 确保目录下包含 `main.js`、`manifest.json`
4. 打开 Obsidian → 设置 → 第三方插件 → 开启 **Path to URI**

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

在 设置 → Path to URI 中可配置：

| 设置项 | 默认值 | 说明 |
|---|---|---|
| **URL-encode spaces** | 开启 | 将路径中的空格编码为 `%20`（仅影响跨 vault 的 URI） |
| **Strip .md extension** | 关闭 | 在生成的 URI 中去掉 `.md` 后缀 |
| **URI action** | `open` | 跨 vault 时的 URI 动作：`open`（打开笔记）/ `search`（搜索文件名） |
| **Show notification** | 开启 | 操作完成后显示右上角通知 |
| **Open folder note** | 关闭 | 打开文件夹时优先尝试打开同名笔记（`folder/folder.md`），找不到则回退到定位文件夹 |

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
obsidian-plugin-path-to-file-0.1.3/
├── main.ts              # 插件主入口：命令注册、设置面板、剪贴板读取、打开逻辑
├── pathConverter.ts     # 路径转换核心：绝对路径 → obsidian:// URI
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
- vault 名检测采用「盘符后第一个文件夹」策略，因此 vault 需直接位于盘符根目录下（如 `D:\MyVault\...`）

## License

MIT
