// main.ts — 插件主入口

import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder } from 'obsidian';
import { convertAbsolutePath, ConvertOptions } from './pathConverter';

interface PluginSettings {
	urlEncodeSpaces: boolean;
	stripMdExtension: boolean;
	action: 'open' | 'search';
	showNotification: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
	urlEncodeSpaces: true,
	stripMdExtension: false,
	action: 'open',
	showNotification: true,
};

export default class PathToUriPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		// 核心命令：读取剪贴板路径 → 转换为 URI → 打开
		this.addCommand({
			id: 'open-clipboard-path',
			name: 'Open clipboard path in Obsidian',
			callback: () => this.openClipboardPath(),
		});

		this.addSettingTab(new PathToUriSettingTab(this.app, this));
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
			// 策略 2：转换为 obsidian:// URI，通过系统协议打开（跨 vault，文件和文件夹均支持）
			this.openViaUri(rawPath, currentVaultPath, currentVaultName);
		}
	}

	/**
	 * 在当前 vault 中打开文件或定位文件夹
	 */
	private async openInCurrentVault(relativePath: string, originalPath: string) {
		const file = this.app.vault.getAbstractFileByPath(relativePath);

		if (file instanceof TFile) {
			// 文件：直接打开
			try {
				await this.app.workspace.getLeaf().openFile(file);
				if (this.settings.showNotification) {
					new Notice('已打开：' + relativePath);
				}
			} catch (e) {
				new Notice('打开失败：' + (e as Error).message);
			}
		} else if (file instanceof TFolder) {
			// 文件夹：在文件管理器中定位并展开
			this.revealFolderInExplorer(file, relativePath);
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
	 * 转换为 obsidian:// URI 并通过系统协议打开（用于跨 vault 场景）
	 */
	private openViaUri(rawPath: string, currentVaultPath: string, currentVaultName: string) {
		const options: ConvertOptions = {
			urlEncodeSpaces: this.settings.urlEncodeSpaces,
			stripMdExtension: this.settings.stripMdExtension,
			action: this.settings.action,
		};

		const result = convertAbsolutePath(
			rawPath,
			options,
			currentVaultPath,
			currentVaultName
		);

		if (!result) {
			new Notice('无法解析路径：' + rawPath.trim().slice(0, 50));
			return;
		}

		// 使用 shell.openExternal 打开自定义协议（openWithDefaultApp 会把 URI 当文件路径）
		try {
			require('electron').shell.openExternal(result.uri);
			if (this.settings.showNotification) {
				new Notice('正在打开：' + result.file);
			}
		} catch (e) {
			new Notice('打开失败：' + (e as Error).message);
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
class PathToUriSettingTab extends PluginSettingTab {
	plugin: PathToUriPlugin;

	constructor(app: App, plugin: PathToUriPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Path to URI 设置' });

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
	}
}
