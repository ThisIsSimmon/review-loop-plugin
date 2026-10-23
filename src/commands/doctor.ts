/**
 * 導入の診断。review-loop を回す前提（Bun・Codex CLI・git・設定・権限の allow・lint とテスト・残った Run）を確かめて一覧にする。
 * Codex にレビューは出さない。Stop フックが効くか・ループ中に権限の確認が出ないかは Claude Code の中で回さないと
 * 確かめられないので、それは doctor スキルが案内する試運転に任せる。
 *
 *   bun dist/doctor.mjs [--run-commands]
 *
 * NG が 1 件でもあれば終了コード 1。
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
	describeConfig,
	loadConfig,
	PROJECT_CONFIG_PATH,
	type ReviewLoopConfig,
} from '../lib/config';
import { readTextIfExists } from '../lib/fs';
import { createGitRunner, findRepoRoot } from '../lib/git';
import { runProcess } from '../lib/process';
import {
	findActiveRuns,
	listRunStates,
	PHASE_LABELS,
	workspaceFor,
} from '../lib/state';
import { errorMessage, parseFlags, scriptCommand } from '../lib/util';

export const MIN_BUN_VERSION = '1.3.0';

/** lint・テストを実行して確かめるときの打ち切り時間 */
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

export type CheckStatus = 'ok' | 'warn' | 'fail';
export type CheckResult = {
	label: string;
	status: CheckStatus;
	detail: string;
	/** 対処の方法。ok では出さない */
	hint?: string;
};

const STATUS_MARKS: Record<CheckStatus, string> = {
	ok: '[OK]  ',
	warn: '[注意]',
	fail: '[NG]  ',
};

/** `1.3.0` 形式の比較。数字以外の部分（`-canary` など）は無視する */
export const isVersionAtLeast = (version: string, min: string): boolean => {
	const parse = (text: string) =>
		text.split('.').map((part) => Number.parseInt(part, 10) || 0);
	const a = parse(version);
	const b = parse(min);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const diff = (a[i] ?? 0) - (b[i] ?? 0);
		if (diff !== 0) return diff > 0;
	}
	return true;
};

const escapeRegExp = (text: string): string =>
	text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/**
 * Claude Code の Bash の allow 規則がコマンドに当てはまるか。`*` は任意の文字列、末尾の `:*` は前方一致の古い書き方。
 * 本物の判定（複合コマンドの分割など）までは真似しないので、doctor の目安として使う。
 */
export const matchesAllowRule = (rule: string, command: string): boolean => {
	if (rule === 'Bash') return true;
	const inner = /^Bash\((.*)\)$/s.exec(rule)?.[1];
	if (inner === undefined) return false;
	const pattern = inner.endsWith(':*') ? `${inner.slice(0, -2)}*` : inner;
	return new RegExp(
		`^${pattern.split('*').map(escapeRegExp).join('.*')}$`,
		's',
	).test(command);
};

export type SettingsFile = { path: string; text: string | null };

/**
 * 設定ファイルの permissions.allow から、コマンドに当てはまる最初の規則を探す。
 * 規則が見つかっても残りのファイルは読み、JSON として読めないものをすべて返す。
 */
export const findAllowRule = (
	files: readonly SettingsFile[],
	command: string,
): { match: { path: string; rule: string } | null; unreadable: string[] } => {
	const unreadable: string[] = [];
	let match: { path: string; rule: string } | null = null;
	for (const { path, text } of files) {
		if (text === null) continue;
		let allow: unknown;
		try {
			allow = JSON.parse(text)?.permissions?.allow;
		} catch {
			unreadable.push(path);
			continue;
		}
		if (match !== null || !Array.isArray(allow)) continue;
		const rule = allow.find(
			(item): item is string =>
				typeof item === 'string' && matchesAllowRule(item, command),
		);
		if (rule !== undefined) match = { path, rule };
	}
	return { match, unreadable };
};

export const checkBun = (version: string = Bun.version): CheckResult =>
	isVersionAtLeast(version, MIN_BUN_VERSION)
		? { label: 'Bun', status: 'ok', detail: version }
		: {
				label: 'Bun',
				status: 'fail',
				detail: `${version}（${MIN_BUN_VERSION} 以上が必要）`,
				hint: 'bun upgrade で更新する',
			};

export const checkCodex = async (cwd: string): Promise<CheckResult[]> => {
	let version: string;
	try {
		const result = await runProcess('codex', ['--version'], { cwd });
		if (result.exitCode !== 0) {
			const output = `${result.stdout}${result.stderr}`.trim();
			return [
				{
					label: 'Codex CLI',
					status: 'fail',
					detail: `codex --version が失敗しました（exit ${result.exitCode}）${output ? `: ${output}` : ''}`,
					hint: 'codex を入れ直すか更新する（npm i -g @openai/codex など、入れたときと同じ方法で）',
				},
			];
		}
		version = result.stdout.trim();
	} catch {
		return [
			{
				label: 'Codex CLI',
				status: 'fail',
				detail: 'codex が PATH にありません',
				hint: 'https://github.com/openai/codex の手順で入れる',
			},
		];
	}
	const login = await runProcess('codex', ['login', 'status'], { cwd });
	const loginText = `${login.stdout}${login.stderr}`.trim();
	return [
		{ label: 'Codex CLI', status: 'ok', detail: version },
		login.exitCode === 0
			? { label: 'Codex のログイン', status: 'ok', detail: loginText }
			: {
					label: 'Codex のログイン',
					status: 'fail',
					detail: loginText || `exit ${login.exitCode}`,
					hint: 'codex login を実行する',
				},
	];
};

const checkHead = async (root: string): Promise<CheckResult> => {
	const result = await createGitRunner(root)(['rev-parse', '--verify', 'HEAD']);
	return result.exitCode === 0
		? { label: 'git', status: 'ok', detail: root }
		: {
				label: 'git',
				status: 'fail',
				detail: `${root}（コミットが 1 つもありません。Run は HEAD を起点にする）`,
				hint: '最初のコミットを作る',
			};
};

const checkConfig = async (
	root: string,
): Promise<{ result: CheckResult; config: ReviewLoopConfig | null }> => {
	try {
		const config = await loadConfig(root);
		const exists = (await readTextIfExists(join(root, PROJECT_CONFIG_PATH))) !== null;
		return {
			config,
			result: {
				label: '設定',
				status: 'ok',
				detail: [
					exists ? PROJECT_CONFIG_PATH : `${PROJECT_CONFIG_PATH} なし（既定値）`,
					...describeConfig(config),
				].join('\n'),
			},
		};
	} catch (error) {
		return {
			config: null,
			result: {
				label: '設定',
				status: 'fail',
				detail: errorMessage(error),
				hint: `${PROJECT_CONFIG_PATH} を直す`,
			},
		};
	}
};

/** ユーザー設定の置き場所。CLAUDE_CONFIG_DIR があればそちら */
const userSettingsPath = (): string =>
	join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'settings.json');

const checkAllowRule = async (root: string): Promise<CheckResult> => {
	const label = '権限の allow';
	// dist の外（開発中の bun src/...）からはプラグインのキャッシュの場所が分からない
	const sample = scriptCommand('start-run');
	if (sample.includes('${CLAUDE_PLUGIN_ROOT}')) {
		return {
			label,
			status: 'warn',
			detail: 'dist の外から実行されたので、script の場所が分からず確かめていません',
		};
	}
	const paths = [
		join(root, '.claude', 'settings.local.json'),
		join(root, '.claude', 'settings.json'),
		userSettingsPath(),
	];
	const files = await Promise.all(
		paths.map(async (path) => ({ path, text: await readTextIfExists(path) })),
	);
	const { match, unreadable } = findAllowRule(files, `${sample} --task x`);
	const notes = unreadable.map((path) => `JSON として読めません: ${path}`);
	// 読めない設定ファイルは Claude Code にも無視され、そこに書いた権限も効かない
	const fixUnreadable = `JSON の書き間違い（末尾のカンマ・引用符の閉じ忘れなど）を直す: ${unreadable.join(', ')}`;
	if (match !== null) {
		return unreadable.length > 0
			? {
					label,
					status: 'warn',
					detail: [`${match.rule}（${match.path}）`, ...notes].join('\n'),
					hint: fixUnreadable,
				}
			: { label, status: 'ok', detail: `${match.rule}（${match.path}）` };
	}
	return {
		label,
		status: 'warn',
		detail: [
			`script の実行を許可する規則が見つかりません（ループの途中で確認が出ます）: ${sample}`,
			...notes,
		].join('\n'),
		hint: [
			`.claude/settings.json か .claude/settings.local.json の permissions.allow に "Bash(bun */.claude/plugins/cache/review-loop/review-loop/*/dist/*)" を足す`,
			...(unreadable.length > 0 ? [fixUnreadable] : []),
		].join('。'),
	};
};

const checkCommand = async (
	label: string,
	command: string | null,
	root: string,
	run: boolean,
): Promise<CheckResult> => {
	if (command === null) {
		return { label, status: 'ok', detail: '未設定（規約ファイルの決まりに従う）' };
	}
	if (!run) {
		return {
			label,
			status: 'ok',
			detail: `${command}（実行はしていません。--run-commands で実行して確かめる）`,
		};
	}
	const result = await runProcess('sh', ['-c', command], {
		cwd: root,
		timeoutMs: COMMAND_TIMEOUT_MS,
	});
	if (result.exitCode === 0) {
		return { label, status: 'ok', detail: `${command}（成功）` };
	}
	const tail = `${result.stdout}${result.stderr}`
		.trimEnd()
		.split('\n')
		.slice(-10)
		.map((line) => `    ${line}`);
	return {
		label,
		status: 'fail',
		detail: [
			`${command}（${result.timedOut ? '打ち切り' : `exit ${result.exitCode}`}）`,
			...tail,
		].join('\n'),
		hint: 'コマンドか、それが失敗する原因を直す（Run 中も実装と修正のたびに実行される）',
	};
};

const checkRuns = async (workDir: string): Promise<CheckResult> => {
	const label = '残っている Run';
	const { states, invalid } = await listRunStates(workDir);
	if (invalid.length > 0) {
		return {
			label,
			status: 'fail',
			detail: `読めない状態ファイルがあります（新しい Run を始められません）: ${invalid.join(', ')}`,
			hint: 'ファイルを直すか退避する',
		};
	}
	const active = findActiveRuns(states);
	if (active.length > 0) {
		return {
			label,
			status: 'warn',
			detail: `進行中の Run があります（終えるまで新しい Run を始められません）: ${active
				.map((state) => `${state.runId}（${PHASE_LABELS[state.phase]}）`)
				.join(', ')}`,
			hint: `続けるか、${scriptCommand('finish-run')} --run <run-id> --abort で中止する`,
		};
	}
	return { label, status: 'ok', detail: 'なし' };
};

export const formatReport = (results: readonly CheckResult[]): string => {
	const lines = ['review-loop doctor'];
	for (const { label, status, detail, hint } of results) {
		const [first = '', ...rest] = detail.split('\n');
		lines.push(`${STATUS_MARKS[status]} ${label}: ${first}`);
		lines.push(...rest.map((line) => `        ${line}`));
		if (hint !== undefined && status !== 'ok') lines.push(`        → ${hint}`);
	}
	const count = (status: CheckStatus) =>
		results.filter((result) => result.status === status).length;
	lines.push(
		'',
		`結果: NG ${count('fail')} 件 / 注意 ${count('warn')} 件 / OK ${count('ok')} 件`,
	);
	return lines.join('\n');
};

export const main = async (args: readonly string[]): Promise<void> => {
	const { switches } = parseFlags(args, {
		valueFlags: [],
		switchFlags: ['--run-commands'],
		usage: `Usage: ${scriptCommand('doctor')} [--run-commands]`,
	});
	const cwd = process.cwd();
	const results: CheckResult[] = [checkBun(), ...(await checkCodex(cwd))];
	const root = await findRepoRoot(cwd);
	if (root === null) {
		results.push({
			label: 'git',
			status: 'fail',
			detail: `git リポジトリの外です（${cwd}）。設定・権限・Run は確かめていません`,
			hint: '対象のリポジトリの中で実行する',
		});
	} else {
		results.push(await checkHead(root));
		const { result, config } = await checkConfig(root);
		results.push(result, await checkAllowRule(root));
		if (config !== null) {
			const run = switches.has('--run-commands');
			results.push(
				await checkCommand('lint', config.lintCommand, root, run),
				await checkCommand('テスト', config.testCommand, root, run),
			);
		}
		results.push(await checkRuns(workspaceFor(root).workDir));
	}
	console.log(formatReport(results));
	if (results.some((result) => result.status === 'fail')) process.exitCode = 1;
};
