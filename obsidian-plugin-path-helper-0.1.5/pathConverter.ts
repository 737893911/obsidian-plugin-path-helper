// pathConverter.ts — 路径转换核心逻辑
// 负责将文件绝对路径转换为 obsidian:// URI

export interface ConvertOptions {
	urlEncodeSpaces: boolean;
	stripMdExtension: boolean;
	action: 'open' | 'search';
}

export interface ConvertResult {
	vault: string;
	file: string;
	uri: string;
}

/**
 * 从绝对路径转换为 Obsidian URI（用于剪贴板场景）
 *
 * 通过与已注册的 vault 绝对路径列表做最长前缀匹配，确定文件所属的 vault。
 *
 * @param absolutePath 文件绝对路径，如 D:\Obsidian知识库\hehe仓库\笔记.md
 * @param options 转换选项
 * @param vaultPaths 所有已注册 vault 的绝对路径列表（来自 obsidian.json）
 * @returns 转换结果，无法解析时返回 null
 */
export function convertAbsolutePath(
	absolutePath: string,
	options: ConvertOptions,
	vaultPaths: string[]
): ConvertResult | null {
	// 预处理：trim、去引号
	let path = absolutePath.trim().replace(/^["']|["']$/g, '');
	if (!path) return null;

	// 统一路径分隔符为正斜杠
	path = path.replace(/\\/g, '/');

	// 在所有 vault 中找最长前缀匹配
	let bestVaultPath: string | null = null;

	for (const vp of vaultPaths) {
		const normalizedVp = vp.replace(/\\/g, '/').replace(/\/$/, '');
		if (
			path.toLowerCase().startsWith(normalizedVp.toLowerCase()) &&
			(bestVaultPath === null || normalizedVp.length > bestVaultPath.length)
		) {
			bestVaultPath = normalizedVp;
		}
	}

	if (bestVaultPath === null) {
		// 没有任何 vault 匹配该路径
		return null;
	}

	// vault 名 = vault 路径的文件夹名（basename）
	const vault = bestVaultPath.split('/').pop() || bestVaultPath;
	// file 相对路径 = 去掉 vault 路径前缀后的剩余部分
	let filePath = path.slice(bestVaultPath.length).replace(/^\/+/, '');

	if (!filePath) return null;

	return buildResult(vault, filePath, options);
}

/**
 * 根据 vault 名和 file 相对路径构建最终结果
 */
function buildResult(vault: string, filePath: string, options: ConvertOptions): ConvertResult {
	// 可选：去掉 .md 后缀
	if (options.stripMdExtension && filePath.toLowerCase().endsWith('.md')) {
		filePath = filePath.slice(0, -3);
	}

	// URL 编码
	const encodedFile = encodePath(filePath, options);

	// 拼装 URI
	let uri: string;
	if (options.action === 'search') {
		const fileName = filePath.split('/').pop() || filePath;
		uri = `obsidian://search?vault=${encodeURIComponent(vault)}&query=${encodeURIComponent(fileName)}`;
	} else {
		uri = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodedFile}`;
	}

	return { vault, file: filePath, uri };
}

/**
 * 对文件路径进行 URL 编码
 * - 空格：根据设置项决定是否编码为 %20
 * - 特殊字符 # ? & % +：必须编码（会破坏 URI query 解析）
 * - 中文：保持原样不编码（Obsidian 原生支持）
 */
function encodePath(filePath: string, options: ConvertOptions): string {
	let result = '';
	for (const ch of filePath) {
		if (ch === ' ') {
			result += options.urlEncodeSpaces ? '%20' : ' ';
		} else if ('#?&%+'.includes(ch)) {
			result += encodeURIComponent(ch);
		} else {
			result += ch;
		}
	}
	return result;
}
