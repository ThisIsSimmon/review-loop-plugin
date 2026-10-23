import { dirname } from 'node:path';
import * as v from 'valibot';

export const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export const formatIssues = (issues: readonly v.BaseIssue<unknown>[]): string =>
	issues
		.map((issue) => {
			const path = v.getDotPath(issue);
			return path ? `${path}: ${issue.message}` : issue.message;
		})
		.join('; ');

export const parseJsonWith = <TSchema extends v.GenericSchema>(
	schema: TSchema,
	text: string,
	label: string,
): v.InferOutput<TSchema> => {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (error) {
		throw new Error(
			`${label} を JSON として読めません: ${errorMessage(error)}`,
		);
	}
	const result = v.safeParse(schema, data);
	if (!result.success) {
		throw new Error(
			`${label} の形式が不正です: ${formatIssues(result.issues)}`,
		);
	}
	return result.output;
};

/**
 * 次の工程として LLM に示すコマンド。ビルド済みの `dist/<name>.mjs` から実行されていれば同じディレクトリの
 * 絶対パスを示す（プラグインのキャッシュの場所は環境ごとに違うので、決め打ちせずに実行中のファイルから求める）。
 * パスは空白などを含むときだけ引用符で囲む（権限の allow 規則 `Bash(bun <パス> *)` と同じ形に保つ）。
 */
export const scriptCommand = (name: string): string => {
	const entry = process.argv[1];
	const distDir =
		entry?.endsWith('.mjs') === true
			? dirname(entry)
			: '${CLAUDE_PLUGIN_ROOT}/dist';
	const path = `${distDir}/${name}.mjs`;
	return /^[\w@%+=:,./-]+$/.test(path)
		? `bun ${path}`
		: `bun '${path.replaceAll("'", "'\\''")}'`;
};

export type FlagSpec = {
	valueFlags: readonly string[];
	switchFlags?: readonly string[];
	usage: string;
};
export type ParsedFlags = {
	values: Map<string, string>;
	switches: Set<string>;
};

/** `--flag value` と `--switch` だけを受け付ける。位置引数・重複・値の欠落は使い方のエラーにする */
export const parseFlags = (
	args: readonly string[],
	spec: FlagSpec,
): ParsedFlags => {
	const values = new Map<string, string>();
	const switches = new Set<string>();
	for (let index = 0; index < args.length; index += 1) {
		const flag = args[index];
		if (flag === undefined) break;
		if (spec.switchFlags?.includes(flag)) {
			if (switches.has(flag)) throw new Error(spec.usage);
			switches.add(flag);
			continue;
		}
		if (!spec.valueFlags.includes(flag)) {
			throw new Error(`${spec.usage}\n不明な引数: ${flag}`);
		}
		const value = args[index + 1];
		if (value === undefined || value.startsWith('--') || values.has(flag)) {
			throw new Error(spec.usage);
		}
		values.set(flag, value);
		index += 1;
	}
	return { values, switches };
};

export const parsePositiveInteger = (
	value: string | undefined,
	label: string,
): number | undefined => {
	if (value === undefined) return undefined;
	if (!/^\d+$/.test(value) || Number(value) < 1) {
		throw new Error(`${label} は 1 以上の整数で指定してください: ${value}`);
	}
	return Number(value);
};

export const parseBooleanValue = (
	value: string | undefined,
	label: string,
): boolean | undefined => {
	if (value === undefined) return undefined;
	if (value === 'true') return true;
	if (value === 'false') return false;
	throw new Error(`${label} は true か false で指定してください: ${value}`);
};

/** CLI の入口。失敗はメッセージだけを stderr に出し、終了コード 1 にする */
export const runMain = async (main: () => Promise<void>): Promise<void> => {
	try {
		await main();
	} catch (error) {
		console.error(errorMessage(error));
		process.exitCode = 1;
	}
};
