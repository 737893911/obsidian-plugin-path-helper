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
 * @param absolutePath 文件绝对路径，如 D:\LJCdisk\folder\note.md
 * @param options 转换选项
 * @param currentVaultBasePath 当前 vault 的绝对路径（用于优先匹配）
 * @param currentVaultName 当前 vault 名称
 * @returns 转换结果，无法解析时返回 null
 */
export function convertAbsolutePath(
	absolutePath: string,
	options: ConvertOptions,
	currentVaultBasePath?: string,
	currentVaultName?: string
): ConvertResult | null {
	// 预处理：trim、去引号
	let path = absolutePath.trim().replace(/^["']|["']$/g, '');
	if (!path) return null;

	// 统一路径分隔符为正斜杠
	path = path.replace(/\\/g, '/');

	let vault: string;
	let filePath: string;

	// 步骤 1：优先匹配当前 vault
	if (currentVaultBasePath && currentVaultName) {
		const normalizedBase = currentVaultBasePath.replace(/\\/g, '/').replace(/\/$/, '');
		if (path.toLowerCase().startsWith(normalizedBase.toLowerCase())) {
			vault = currentVaultName;
			filePath = path.slice(normalizedBase.length).replace(/^\/+/, '');
			return buildResult(vault, filePath, options);
		}
	}

	// 步骤 2：Fallback — 从路径中解析 vault 名
	// 去掉盘符根（如 D:/），取第一个文件夹作为 vault 名
	const driveMatch = path.match(/^[a-zA-Z]:\//);
	let rest = driveMatch ? path.slice(driveMatch[0].length) : path;

	// 找第一个正斜杠，分隔 vault 名和 file 路径
	const firstSlash = rest.indexOf('/');
	if (firstSlash < 0) {
		// 路径中没有子目录，无法提取 vault
		return null;
	}

	vault = rest.slice(0, firstSlash);
	filePath = rest.slice(firstSlash + 1);

	if (!vault || !filePath) return null;

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
