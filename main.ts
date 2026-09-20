// main.ts — 插件主入口

import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder, Modal } from 'obsidian';
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

interface InstalledPluginLocation {
	dir: string;
	manifest: Record<string, any>;
}

/**
 * 在仓库的配置目录中查找指定插件。
 * 优先使用标准目录，未命中时扫描 manifest.id，兼容带版本号等非标准文件夹名。
 */
function findInstalledPlugin(obsidianDir: string, pluginId: string): InstalledPluginLocation | null {
	const fs = require('fs');
	const path = require('path');
	const pluginsRoot = path.join(obsidianDir, 'plugins');

	const readMatchingPlugin = (dir: string): InstalledPluginLocation | null => {
		const manifestPath = path.join(dir, 'manifest.json');
		if (!fs.existsSync(manifestPath)) return null;

		try {
			const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
			return manifest?.id === pluginId ? { dir, manifest } : null;
		} catch {
			return null;
		}
	};

	const standardDir = path.join(pluginsRoot, pluginId);
	const standardHit = readMatchingPlugin(standardDir);
	if (standardHit) return standardHit;

	try {
		if (!fs.existsSync(pluginsRoot)) return null;
		const entries = fs.readdirSync(pluginsRoot, { withFileTypes: true })
			.filter((entry: any) => entry.isDirectory() && entry.name !== pluginId)
			.sort((a: any, b: any) => a.name.localeCompare(b.name));

		for (const entry of entries) {
			const hit = readMatchingPlugin(path.join(pluginsRoot, entry.name));
			if (hit) return hit;
		}
	} catch {
		// 目标仓库不可读时视为未找到，由同步流程给出具体错误
	}

	return null;
}

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

		const result = convertAbsolutePath(rawPath, options, vaultPaths.map((v) => v.path));

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
	 * 读取 Obsidian 注册表 obsidian.json，返回所有已注册 vault 的信息
	 * 包含路径和配置目录（.obsidian 或自定义 config 目录）
	 * 每次调用实时读取，不缓存（vault 可能增减）
	 */
	private getObsidianVaultPaths(): { path: string; configDir: string }[] {
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
				.map((v: any) => {
					const p = v?.path;
					if (typeof p !== 'string' || p.length === 0) return null;
					// obsidian.json 中 vault 条目可能有 config 字段指定自定义配置目录
					const configDir = typeof v?.config === 'string' && v.config.length > 0 ? v.config : '.obsidian';
					return { path: p, configDir };
				})
				.filter((v): v is { path: string; configDir: string } => v !== null);
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

	// ========== 一键同步到所有仓库 ==========

	/**
	 * 获取当前插件的版本号
	 */
	private getCurrentVersion(): string {
		return this.manifest.version || '0.0.0';
	}

	/**
	 * 获取当前插件所在目录的绝对路径
	 * 策略1（标准位置）+ 策略2（扫描 plugins 目录匹配 manifest id）
	 */
	private getPluginDir(): string {
		const path = require('path');
		const fs = require('fs');
		const pluginId = this.manifest.id;

		const tryDir = (dir: string): string | null => {
			if (dir && fs.existsSync(path.join(dir, 'main.js')) && fs.existsSync(path.join(dir, 'manifest.json'))) {
				return dir;
			}
			return null;
		};

		const vaultBase = this.getVaultBasePath();
		const configDir = (this.app.vault as any).configDir || '.obsidian';

		// 策略1：标准位置 <vault>/<configDir>/plugins/<id>
		const stdDir = path.join(vaultBase, configDir, 'plugins', pluginId);
		const stdHit = tryDir(stdDir);
		if (stdHit) {
			console.log('[Path Helper] 源目录策略1(标准位置):', stdHit);
			return stdHit;
		}

		// 策略2：扫描当前仓库 plugins 目录，找 manifest.json id 匹配的文件夹
		// （兼容文件夹名与 manifest id 不一致的情况，如开发时文件夹带版本号）
		try {
			const pluginsRoot = path.join(vaultBase, configDir, 'plugins');
			if (fs.existsSync(pluginsRoot)) {
				const entries = fs.readdirSync(pluginsRoot, { withFileTypes: true });
				for (const entry of entries) {
					if (!entry.isDirectory()) continue;
					const candidateDir = path.join(pluginsRoot, entry.name);
					const manifestPath = path.join(candidateDir, 'manifest.json');
					if (fs.existsSync(manifestPath)) {
						try {
							const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
							if (m.id === pluginId) {
								const hit = tryDir(candidateDir);
								if (hit) {
									console.log('[Path Helper] 源目录策略2(扫描匹配):', hit);
									return hit;
								}
							}
						} catch { /* ignore */ }
					}
				}
			}
		} catch { /* ignore */ }

		console.warn('[Path Helper] 未找到插件源目录，标准位置:', stdDir);
		// 兜底：返回标准位置（后续会因文件缺失而报错，提示用户）
		return stdDir;
	}

	/**
	 * 打开仓库选择弹窗，供用户勾选要同步的仓库
	 */
	openSyncVaultsModal() {
		const allVaults = this.getObsidianVaultPaths();
		const currentVaultPath = this.getVaultBasePath();

		// 规范化路径：统一分隔符、转小写、去末尾斜杠
		const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
		const currentNormalized = normalize(currentVaultPath);
		const isObsidianSandbox = (p: string) => {
			const normalized = normalize(p);
			const vaultName = normalized.split('/').pop() || '';
			return vaultName === 'obsidian sandbox';
		};

		// 排除当前仓库和 Obsidian 自带的测试仓库
		const otherVaults = allVaults.filter((v) =>
			normalize(v.path) !== currentNormalized && !isObsidianSandbox(v.path)
		);

		if (otherVaults.length === 0) {
			new Notice('没有其他已注册的 Obsidian 仓库');
			return;
		}

		new SyncToAllVaultsModal(this.app, otherVaults, this.manifest.id, this.getCurrentVersion(), (selected) => {
			this.syncToVaults(selected);
		}).open();
	}

	/**
	 * 将当前插件同步到指定的仓库列表
	 * - 版本比对：目标版本 < 当前版本才更新；目标版本 >= 当前版本则跳过
	 * - 只复制 main.js、manifest.json、styles.css，不碰 data.json（保留用户配置）
	 * - 启用插件：追加到 community-plugins.json
	 */
	private syncToVaults(targetVaults: { path: string; configDir: string }[]) {
		const fs = require('fs');
		const path = require('path');
		const currentVersion = this.getCurrentVersion();
		const pluginDir = this.getPluginDir();
		const pluginId = this.manifest.id;

		// 逐仓库结果明细
		const results: { vault: string; action: string; detail?: string }[] = [];

		for (const vault of targetVaults) {
			const vaultPath = vault.path;
			const vaultName = vaultPath.split(/[\\/]/).pop() || vaultPath;
			try {
				const obsidianDir = path.join(vaultPath, vault.configDir);
				const installedPlugin = findInstalledPlugin(obsidianDir, pluginId);
				const targetPluginDir = installedPlugin?.dir || path.join(obsidianDir, 'plugins', pluginId);

				// 版本比对
				const targetVersion = typeof installedPlugin?.manifest?.version === 'string'
					? installedPlugin.manifest.version
					: '';

				const shouldInstall = targetVersion === '';
				const shouldUpdate = targetVersion !== '' && this.compareVersions(targetVersion, currentVersion) < 0;

				if (!shouldInstall && !shouldUpdate) {
					results.push({
						vault: vaultName,
						action: '跳过',
						detail: targetVersion ? `已是最新 v${targetVersion}` : '版本不低于当前版本',
					});
					continue;
				}

				// 校验源文件存在（关键：避免静默失败）
				const srcMainJs = path.join(pluginDir, 'main.js');
				const srcManifest = path.join(pluginDir, 'manifest.json');
				const missing: string[] = [];
				if (!fs.existsSync(srcMainJs)) missing.push('main.js');
				if (!fs.existsSync(srcManifest)) missing.push('manifest.json');
				if (missing.length > 0) {
					results.push({
						vault: vaultName,
						action: '失败',
						detail: `源目录缺少 ${missing.join('、')}：${pluginDir}`,
					});
					continue;
				}

				// 确保目标插件目录存在
				if (!fs.existsSync(targetPluginDir)) {
					fs.mkdirSync(targetPluginDir, { recursive: true });
				}

				// 复制 main.js、manifest.json、styles.css（不碰 data.json）
				for (const fileName of ['main.js', 'manifest.json', 'styles.css']) {
					const srcFile = path.join(pluginDir, fileName);
					if (fs.existsSync(srcFile)) {
						fs.copyFileSync(srcFile, path.join(targetPluginDir, fileName));
					}
				}

				// 启用插件：追加到 community-plugins.json
				this.enablePluginInVault(obsidianDir, pluginId);


				if (shouldInstall) {
					results.push({
						vault: vaultName,
						action: '安装',
						detail: `v${currentVersion}`,
					});
				} else {
					results.push({
						vault: vaultName,
						action: '更新',
						detail: `v${targetVersion} → v${currentVersion}`,
					});
				}
			} catch (e) {
				results.push({
					vault: vaultName,
					action: '失败',
					detail: e instanceof Error ? e.message : String(e),
				});
			}
		}

		// 汇总通知
		const counts: Record<string, number> = { 安装: 0, 更新: 0, 跳过: 0, 失败: 0 };
		results.forEach((r) => {
			counts[r.action] = (counts[r.action] || 0) + 1;
		});

		const summaryParts: string[] = [];
		(['安装', '更新', '跳过', '失败'] as const).forEach((act) => {
			if (counts[act] > 0) summaryParts.push(`${act} ${counts[act]}`);
		});

		// 构建详细通知文本（多行，需手动设置 white-space）
		const detailLines = results
			.map((r) => `• ${r.vault}：${r.action}${r.detail ? '（' + r.detail + '）' : ''}`)
			.join('\n');

		const summary = `同步完成：${summaryParts.join('，')}`;

		const notice = new Notice('', 15000);
		notice.noticeEl.empty();
		notice.noticeEl.createEl('div', { text: summary });
		const detailEl = notice.noticeEl.createEl('div', { text: detailLines });
		detailEl.setCssProps({
			'white-space': 'pre-wrap',
			'font-size': '12px',
			'margin-top': '6px',
			opacity: '0.85',
		});

		// 同时输出到控制台便于排查
		console.log('[Path Helper] sync result:\n' + summary + '\n' + detailLines);
	}

	/**
	 * 比较两个语义化版本号
	 * 返回 -1 / 0 / 1
	 */
	private compareVersions(a: string, b: string): number {
		const pa = a.split('.').map(Number);
		const pb = b.split('.').map(Number);
		const len = Math.max(pa.length, pb.length);
		for (let i = 0; i < len; i++) {
			const na = pa[i] || 0;
			const nb = pb[i] || 0;
			if (na < nb) return -1;
			if (na > nb) return 1;
		}
		return 0;
	}

	/**
	 * 在指定仓库中启用本插件（追加到 community-plugins.json）
	 */
	private enablePluginInVault(obsidianDir: string, pluginId: string) {
		const fs = require('fs');
		const path = require('path');
		const filePath = path.join(obsidianDir, 'community-plugins.json');

		let plugins: string[] = [];
		if (fs.existsSync(filePath)) {
			try {
				const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
				if (Array.isArray(data)) {
					plugins = data;
				}
			} catch {
				plugins = [];
			}
		}

		if (!plugins.includes(pluginId)) {
			plugins.push(pluginId);
			fs.writeFileSync(filePath, JSON.stringify(plugins, null, '\t'), 'utf-8');
		}
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

		new Setting(containerEl)
			.setName('Path Helper 设置')
			.setHeading();

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

		new Setting(containerEl)
			.setName('Sync to all vaults')
			.setDesc('将当前版本的 Path Helper 安装/更新到其他已注册的 Obsidian 仓库（会自动启用插件）。建议先关闭其他仓库的 Obsidian 窗口再执行。')
			.addButton((button) =>
				button
					.setButtonText('选择仓库并同步')
					.setCta()
					.onClick(() => {
						this.plugin.openSyncVaultsModal();
					})
			);
	}
}

// 仓库选择弹窗：列出所有其他仓库，用户勾选后确认同步
interface VaultInfo {
	path: string;
	configDir: string;
}

class SyncToAllVaultsModal extends Modal {
	vaults: VaultInfo[];
	selected: Set<string>; // 存储 vault path 作为标识
	onConfirm: (selected: VaultInfo[]) => void;
	pluginId: string;
	currentVersion: string;

	constructor(app: App, vaults: VaultInfo[], pluginId: string, currentVersion: string, onConfirm: (selected: VaultInfo[]) => void) {
		super(app);
		this.vaults = vaults;
		this.pluginId = pluginId;
		this.currentVersion = currentVersion;
		this.selected = new Set(); // 默认取消全选，由用户手动勾选
		this.onConfirm = onConfirm;
	}

	/**
	 * 读取指定仓库中本插件的安装状态、版本号、是否启用
	 */
	private getVaultPluginInfo(vault: VaultInfo): {
		installed: boolean;
		version: string;
		isLatest: boolean;
		enabled: boolean;
	} {
		const fs = require('fs');
		const path = require('path');
		const obsidianDir = path.join(vault.path, vault.configDir);
		const installedPlugin = findInstalledPlugin(obsidianDir, this.pluginId);

		let installed = false;
		let version = '';
		let isLatest = false;
		let enabled = false;

		try {
			if (installedPlugin) {
				version = typeof installedPlugin.manifest.version === 'string' ? installedPlugin.manifest.version : '';
				installed = true;
				isLatest = this.compareVersionStrings(version, this.currentVersion) >= 0;
			}
		} catch {
			// 读取 manifest 失败，视为未安装
		}

		// 检查是否已启用（community-plugins.json）
		try {
			const cpPath = path.join(obsidianDir, 'community-plugins.json');
			if (fs.existsSync(cpPath)) {
				const list = JSON.parse(fs.readFileSync(cpPath, 'utf-8'));
				if (Array.isArray(list) && list.includes(this.pluginId)) {
					enabled = true;
				}
			}
		} catch {
			// ignore
		}


            return { installed, version, isLatest, enabled };
	}

	private compareVersionStrings(a: string, b: string): number {
		const pa = a.split('.').map(Number);
		const pb = b.split('.').map(Number);
		const len = Math.max(pa.length, pb.length);
		for (let i = 0; i < len; i++) {
			const na = pa[i] || 0;
			const nb = pb[i] || 0;
			if (na < nb) return -1;
			if (na > nb) return 1;
		}
		return 0;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '同步 Path Helper 到其他仓库' });
		contentEl.createEl('p', {
			text: '勾选需要同步的仓库。同步会安装/更新插件并启用插件。建议先关闭这些仓库的 Obsidian 窗口。',
		});

		// 全选 / 取消全选
		const selectAllDiv = contentEl.createDiv({ cls: 'path-helper-select-all' });
		const selectAllBtn = selectAllDiv.createEl('button', { text: '全选' });
		const deselectAllBtn = selectAllDiv.createEl('button', { text: '取消全选' });
		selectAllBtn.addEventListener('click', () => {
			this.selected = new Set(this.vaults.map((v) => v.path));
			this.refreshCheckboxes();
		});
		deselectAllBtn.addEventListener('click', () => {
			this.selected.clear();
			this.refreshCheckboxes();
		});

		// 仓库列表 + 复选框（显示安装状态、版本、启用情况）
		this.vaults.forEach((vault) => {
			const vaultPath = vault.path;
			const vaultName = vaultPath.split(/[\\/]/).pop() || vaultPath;
			const info = this.getVaultPluginInfo(vault);

			// 状态描述行
			const statusParts: string[] = [];
			if (!info.installed) {
				statusParts.push('未安装');
			} else if (info.isLatest) {
				statusParts.push(`v${info.version}（最新）`);
			} else {
				statusParts.push(`v${info.version}（可更新至 v${this.currentVersion}）`);
			}
			if (info.installed) {
				statusParts.push(info.enabled ? '已启用' : '未启用');
			}

			new Setting(contentEl)
				.setName(vaultName)
				.setDesc(vaultPath + '\n' + statusParts.join('　'))
				.addToggle((toggle) =>
					toggle
						.setValue(this.selected.has(vaultPath))
						.onChange((checked) => {
							if (checked) this.selected.add(vaultPath);
							else this.selected.delete(vaultPath);
						})
				);

			// 让描述中的换行生效
			const descEl = contentEl.querySelector('.setting-item-description:last-of-type') as HTMLElement | null;
			if (descEl) {
				descEl.setCssProps({ 'white-space': 'pre-wrap' });
			}
		});

		// 确认按钮
		const footer = contentEl.createDiv({ cls: 'modal-button-container' });
		const confirmBtn = footer.createEl('button', { text: '确认同步', cls: 'mod-cta' });
		confirmBtn.addEventListener('click', () => {
			const selectedVaults = this.vaults.filter((v) => this.selected.has(v.path));
			this.onConfirm(selectedVaults);
			this.close();
		});
	}

	private refreshCheckboxes() {
		const toggles = this.contentEl.querySelectorAll('.setting-item .checkbox-container');
		toggles.forEach((el, i) => {
			const vault = this.vaults[i];
			if (vault) {
				if (this.selected.has(vault.path)) {
					el.addClass('is-enabled');
				} else {
					el.removeClass('is-enabled');
				}
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
