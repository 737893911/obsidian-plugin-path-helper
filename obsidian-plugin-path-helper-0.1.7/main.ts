// main.ts — 插件主入口

import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder } from 'obsidian';
import { convertAbsolutePath, ConvertOptions } from './pathConverter';

interface PluginSettings {
	urlEncodeSpaces: boolean;
	stripMdExtension: boolean;
	action: 'open' | 'search';
	showNotification: boolean;
	openFolderNote: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
	urlEncodeSpaces: true,
	stripMdExtension: false,
	action: 'open',
	showNotification: true,
	openFolderNote: false,
};

export default class PathHelperPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		// 核心命令：读取剪贴板路径 → 转换为 URI → 打开
		this.addCommand({
			id: 'open-clipboard-path',
			name: 'Open clipboard path in Obsidian',
			callback: () => this.openClipboardPath(),
		});

		// 接力方案：注册自定义 URI 处理器，接收来自其他 vault 的打开/定位请求
		// 当其他 vault 发送 obsidian://path-helper-reveal?vault=本仓库&file=相对路径 或 &folder=相对路径 时，
		// 本处理器被触发：文件则打开并在文件管理器中定位，文件夹则直接定位
		this.registerObsidianProtocolHandler('path-helper-reveal', async (params) => {
			const filePath = params.file;
			const folderPath = params.folder;

			const fileExplorer = (this.app as any).internalPlugins?.plugins?.['file-explorer']?.instance;

			if (filePath) {
				// 文件：打开并定位
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					try {
						await this.app.workspace.getLeaf().openFile(file);
					} catch {
						// ignore open error
					}
					if (fileExplorer && typeof fileExplorer.revealInFolder === 'function') {
						try {
							fileExplorer.revealInFolder(file);
						} catch {
							// ignore
						}
					}
				}
			} else if (folderPath) {
				// 文件夹：定位
				const folder = this.app.vault.getAbstractFileByPath(folderPath);
				if (folder instanceof TFolder) {
					if (fileExplorer && typeof fileExplorer.revealInFolder === 'function') {
						try {
							fileExplorer.revealInFolder(folder);
						} catch {
							// ignore
						}
					}
				}
			}
		});

		this.addSettingTab(new PathHelperSettingTab(this.app, this));
	}

	/**
	 * 核心功能：读取剪贴板中的绝对路径，在 Obsidian 中打开对应笔记
	 *
	 * 策略：
	 * 1. 若文件在当前 vault 内 → 直接用 Obsidian API 打开（最可靠）
	 * 2. 若文件在其他 vault   → 转换为 obsidian:// URI，用 shell.openExternal 打开
	 */
	private async openClipboardPath() {
		const rawPath = this.readClipboard();

		if (!rawPath.trim()) {
			new Notice('剪贴板为空，请先复制文件路径');
			return;
		}

		const currentVaultPath = this.getVaultBasePath();
		const currentVaultName = this.app.vault.getName();

		// 统一分隔符，便于路径比较
		const normalizedPath = rawPath.trim().replace(/\\/g, '/').replace(/^["']|["']$/g, '');
		const normalizedVaultBase = currentVaultPath.replace(/\\/g, '/').replace(/\/$/, '');

		// 判断是否属于当前 vault
		const isInCurrentVault = normalizedVaultBase
			&& normalizedPath.toLowerCase().startsWith(normalizedVaultBase.toLowerCase());

		if (isInCurrentVault) {
			// 策略 1：直接在当前 vault 中打开（区分文件和文件夹）
			const relativePath = normalizedPath.slice(normalizedVaultBase.length).replace(/^\/+/, '');
			await this.openInCurrentVault(relativePath, normalizedPath);
		} else {
			// 策略 2：从 obsidian.json 读取已注册 vault 列表，匹配后构建 URI 打开
			this.openViaRegisteredVault(rawPath);
		}
	}

	/**
	 * 在当前 vault 中打开文件或定位文件夹
	 */
	private async openInCurrentVault(relativePath: string, originalPath: string) {
		const file = this.app.vault.getAbstractFileByPath(relativePath);

		if (file instanceof TFile) {
			// 文件：打开并在文件管理器中定位
			try {
				await this.app.workspace.getLeaf().openFile(file);
				this.revealFileInExplorer(file);
				if (this.settings.showNotification) {
					new Notice('已打开：' + relativePath);
				}
			} catch (e) {
				new Notice('打开失败：' + (e as Error).message);
			}
		} else if (file instanceof TFolder) {
			// 文件夹：根据设置选择行为
			if (this.settings.openFolderNote) {
				this.openFolderNote(file, relativePath);
			} else {
				this.revealFolderInExplorer(file, relativePath);
			}
		} else {
			// 路径在 vault 目录下但不在 Obsidian 索引中
			try {
				await this.app.workspace.openLinkText(relativePath, '');
				if (this.settings.showNotification) {
					new Notice('已打开：' + relativePath);
				}
			} catch {
				new Notice('当前 vault 中找不到该路径：' + originalPath.slice(0, 50));
			}
		}
	}

	/**
	 * 打开"同名文件夹笔记"（Folder Note）
	 * 如果文件夹下有一个和文件夹同名的笔记（如 folder/folder.md），就打开它；
	 * 否则回退到正常的文件夹定位行为（在文件管理器中定位该文件夹）。
	 */
	private async openFolderNote(folder: TFolder, relativePath: string) {
		const folderNotePath = `${relativePath}/${folder.name}.md`;
		const folderNote = this.app.vault.getAbstractFileByPath(folderNotePath);

		if (folderNote instanceof TFile) {
			try {
				await this.app.workspace.getLeaf().openFile(folderNote);
				if (this.settings.showNotification) {
					new Notice('已打开文件夹笔记：' + folderNotePath);
				}
			} catch (e) {
				new Notice('打开失败：' + (e as Error).message);
			}
		} else {
			// 没有同名笔记，回退到正常文件夹定位
			this.revealFolderInExplorer(folder, relativePath);
		}
	}

	/**
	 * 在 Obsidian 文件管理器中定位并高亮文件夹
	 * 使用文件管理器插件的 revealInFolder 内部 API
	 */
	private revealFolderInExplorer(folder: TFolder, displayPath: string) {
		const fileExplorer = (this.app as any).internalPlugins?.plugins?.['file-explorer']?.instance;

		if (fileExplorer && typeof fileExplorer.revealInFolder === 'function') {
			try {
				fileExplorer.revealInFolder(folder);
				if (this.settings.showNotification) {
					new Notice('已定位到文件夹：' + displayPath);
				}
			} catch (e) {
				// revealInFolder 失败时，fallback 到 URI 方式
				this.fallbackOpenFolderViaUri(displayPath);
			}
		} else {
			// 文件管理器插件未启用，fallback 到 URI 方式
			this.fallbackOpenFolderViaUri(displayPath);
		}
	}

	/**
	 * Fallback：通过 obsidian:// URI 打开文件夹（当文件管理器不可用时）
	 */
	private fallbackOpenFolderViaUri(relativePath: string) {
		const vaultName = this.app.vault.getName();
		const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relativePath)}`;
		try {
			require('electron').shell.openExternal(uri);
			if (this.settings.showNotification) {
				new Notice('正在打开文件夹：' + relativePath);
			}
		} catch (e) {
			new Notice('打开失败：' + (e as Error).message);
		}
	}

	/**
	 * 在 Obsidian 文件管理器中定位并高亮文件
	 * revealInFolder 同时支持 TFile 和 TFolder
	 */
	private revealFileInExplorer(file: TFile) {
		const fileExplorer = (this.app as any).internalPlugins?.plugins?.['file-explorer']?.instance;
		if (fileExplorer && typeof fileExplorer.revealInFolder === 'function') {
			try {
				fileExplorer.revealInFolder(file);
			} catch {
				// ignore
			}
		}
	}

	/**
	 * 跨 vault 场景：读取 obsidian.json 中的已注册 vault 列表，匹配后构建接力 URI 打开
	 *
	 * 文件和文件夹均使用自定义接力 URI obsidian://path-helper-reveal，
	 * 由目标 vault 的插件负责打开文件 / 定位文件夹，并在文件管理器中定位。
	 * 要求目标 vault 也安装了本插件。
	 */
	private openViaRegisteredVault(rawPath: string) {
		const vaultPaths = this.getObsidianVaultPaths();

		if (vaultPaths.length === 0) {
			new Notice('Obsidian 中未注册任何仓库，无法解析路径');
			return;
		}

		const options: ConvertOptions = {
			urlEncodeSpaces: this.settings.urlEncodeSpaces,
			stripMdExtension: this.settings.stripMdExtension,
			action: this.settings.action,
		};

		const result = convertAbsolutePath(rawPath, options, vaultPaths);

		if (!result) {
			new Notice('未找到匹配的 Obsidian 仓库：' + rawPath.trim().slice(0, 50));
			return;
		}

		// 判断路径是文件还是文件夹
		const isDirectory = this.isPathDirectory(rawPath);

		// 文件：传 file 参数（打开+定位）；文件夹：传 folder 参数（定位）
		const paramKey = isDirectory ? 'folder' : 'file';
		const uri = `obsidian://path-helper-reveal?vault=${encodeURIComponent(result.vault)}&${paramKey}=${encodeURIComponent(result.file)}`;
		const noticeText = isDirectory
			? '正在定位文件夹：' + result.file + '\n（目标仓库需安装 Path Helper 插件）'
			: '正在打开：' + result.file + '\n（目标仓库需安装 Path Helper 插件）';

		try {
			require('electron').shell.openExternal(uri);
			if (this.settings.showNotification) {
				new Notice(noticeText);
			}
		} catch (e) {
			new Notice('打开失败：' + (e as Error).message);
		}
	}

	/**
	 * 判断给定的绝对路径是否为文件夹
	 */
	private isPathDirectory(absolutePath: string): boolean {
		try {
			const fs = require('fs');
			const cleanPath = absolutePath.trim().replace(/^["']|["']$/g, '');
			return fs.existsSync(cleanPath) && fs.statSync(cleanPath).isDirectory();
		} catch {
			return false;
		}
	}

	/**
	 * 读取 Obsidian 注册表 obsidian.json，返回所有已注册 vault 的绝对路径列表
	 * 每次调用实时读取，不缓存（vault 可能增减）
	 */
	private getObsidianVaultPaths(): string[] {
		try {
			const fs = require('fs');
			const path = require('path');

			// 定位 obsidian.json 所在目录
			// 优先用 Electron app.getPath('userData')（主进程模块，渲染进程可能不可用）
			// 不可用时用环境变量构造（渲染进程中始终可用）
			let obsidianDir = '';
			try {
				const electronApp = require('electron').app;
				if (electronApp && typeof electronApp.getPath === 'function') {
					obsidianDir = electronApp.getPath('userData');
				}
			} catch {
				// ignore
			}

			if (!obsidianDir) {
				if (process.platform === 'win32' && process.env.APPDATA) {
					obsidianDir = path.join(process.env.APPDATA, 'obsidian');
				} else if (process.platform === 'darwin' && process.env.HOME) {
					obsidianDir = path.join(process.env.HOME, 'Library', 'Application Support', 'obsidian');
				} else if (process.env.HOME) {
					obsidianDir = path.join(process.env.HOME, '.config', 'obsidian');
				}
			}

			if (!obsidianDir) {
				return [];
			}

			const obsidianJsonPath = path.join(obsidianDir, 'obsidian.json');

			if (!fs.existsSync(obsidianJsonPath)) {
				return [];
			}

			const data = JSON.parse(fs.readFileSync(obsidianJsonPath, 'utf-8'));
			const vaults = data?.vaults || {};

			return Object.values(vaults)
				.map((v: any) => v?.path)
				.filter((p: any): p is string => typeof p === 'string' && p.length > 0);
		} catch {
			return [];
		}
	}

	/**
	 * 获取当前 vault 的绝对路径
	 */
	private getVaultBasePath(): string {
		try {
			const adapter = this.app.vault.adapter as any;
			if (adapter && typeof adapter.getBasePath === 'function') {
				return adapter.getBasePath();
			}
		} catch {
			// ignore
		}
		return '';
	}

	/**
	 * 读取剪贴板文本
	 * 优先使用 Electron clipboard（桌面端无权限问题），fallback 到 navigator.clipboard
	 */
	private readClipboard(): string {
		try {
			const { clipboard } = require('electron');
			return clipboard.readText();
		} catch {
			// navigator.clipboard 为异步，此处返回空字符串，由调用方处理
			// 实际在 Obsidian 桌面端 electron clipboard 始终可用
			return '';
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// 设置面板
class PathHelperSettingTab extends PluginSettingTab {
	plugin: PathHelperPlugin;

	constructor(app: App, plugin: PathHelperPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Path Helper 设置' });

		new Setting(containerEl)
			.setName('URL-encode spaces')
			.setDesc('将路径中的空格编码为 %20')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.urlEncodeSpaces)
					.onChange(async (value) => {
						this.plugin.settings.urlEncodeSpaces = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Strip .md extension')
			.setDesc('在 URI 中去掉 .md 后缀')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stripMdExtension)
					.onChange(async (value) => {
						this.plugin.settings.stripMdExtension = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('URI action')
			.setDesc('URI 打开方式')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('open', '打开笔记')
					.addOption('search', '搜索文件名')
					.setValue(this.plugin.settings.action)
					.onChange(async (value) => {
						this.plugin.settings.action = value as 'open' | 'search';
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Show notification')
			.setDesc('操作完成后显示通知')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showNotification)
					.onChange(async (value) => {
						this.plugin.settings.showNotification = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Open folder note')
			.setDesc('打开文件夹时，优先尝试打开同名笔记（如 folder/folder.md）；找不到则回退到在文件管理器中定位该文件夹。关闭时直接定位文件夹。')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openFolderNote)
					.onChange(async (value) => {
						this.plugin.settings.openFolderNote = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
