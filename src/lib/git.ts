/**
 * git の実行と、レビュー対象をラウンドごとに固定するためのツリー スナップショット。
 *
 * 一時 index に `read-tree HEAD` → `add -A` → `write-tree` して、未追跡ファイルを含む作業ツリーの内容を
 * ツリー オブジェクトとして記録する。本物の index（ステージ状態）は触らない。「2 回目以降は差分のみ」は
 * `git diff <前回のツリー> <今回のツリー>` で切り出す。ステージ状態で境界を表す案は、新規ファイルが
 * `git diff` に出ず、途中の `git add` で境界が消えるので採らない。
 * ツリー オブジェクトはどこからも参照されないので、git gc の猶予（既定 2 週間）を過ぎると消え得る。
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from './process';

/**
 * 呼び出し元（git のフックなど）から受け継ぐと、cwd ではなく別のリポジトリ・index を操作してしまう環境変数。
 * cwd のリポジトリを操作するときはこれらを外す（githooks(5) の DESCRIPTION と同じ手順）。
 */
const GIT_LOCAL_ENV_VARS = new Set([
	'GIT_ALTERNATE_OBJECT_DIRECTORIES',
	'GIT_CONFIG',
	'GIT_CONFIG_PARAMETERS',
	'GIT_CONFIG_COUNT',
	'GIT_OBJECT_DIRECTORY',
	'GIT_DIR',
	'GIT_WORK_TREE',
	'GIT_IMPLICIT_WORK_TREE',
	'GIT_GRAFT_FILE',
	'GIT_INDEX_FILE',
	'GIT_NO_REPLACE_OBJECTS',
	'GIT_REPLACE_REF_BASE',
	'GIT_PREFIX',
	'GIT_SHALLOW_FILE',
	'GIT_COMMON_DIR',
]);

/** env から GIT_LOCAL_ENV_VARS を除き、git が cwd からリポジトリを探すようにする */
export const withoutGitLocalEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
	Object.fromEntries(
		Object.entries(env).filter(([name]) => !GIT_LOCAL_ENV_VARS.has(name)),
	);

export type GitCommandResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};
export type RunGit = (
	args: readonly string[],
	env?: Record<string, string>,
) => Promise<GitCommandResult>;

/** cwd のリポジトリで git を実行する。呼び出し元の GIT_DIR 等は外し、呼び出しごとの env を重ねる */
export const createGitRunner =
	(cwd: string, baseEnv: Record<string, string> = {}): RunGit =>
	async (args, env = {}) => {
		const result = await runProcess('git', args, {
			cwd,
			env: { ...withoutGitLocalEnv(process.env), ...baseEnv, ...env },
		});
		// シグナルで終わったときは失敗として扱う
		return {
			exitCode: result.exitCode ?? 1,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	};

export const runGitOrThrow = async (
	git: RunGit,
	args: readonly string[],
	env?: Record<string, string>,
): Promise<string> => {
	const result = await git(args, env);
	if (result.exitCode !== 0) {
		throw new Error(
			`git ${args.join(' ')} が失敗しました（exit ${result.exitCode}）: ${result.stderr.trim()}`,
		);
	}
	return result.stdout;
};

/** cwd を含む作業ツリーのルート。git リポジトリの外なら null */
export const findRepoRoot = async (cwd: string): Promise<string | null> => {
	try {
		const result = await createGitRunner(cwd)(['rev-parse', '--show-toplevel']);
		return result.exitCode === 0 ? result.stdout.trim() : null;
	} catch {
		// cwd が存在しないなど、git を起動できない
		return null;
	}
};

/** 作業ツリー（未追跡ファイル含む。.gitignore は尊重）のツリー オブジェクト名を返す */
export const snapshotWorkingTree = async (git: RunGit): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'review-loop-index-'));
	const env = { GIT_INDEX_FILE: join(dir, 'index') };
	try {
		await runGitOrThrow(git, ['read-tree', 'HEAD'], env);
		await runGitOrThrow(git, ['add', '-A'], env);
		return (await runGitOrThrow(git, ['write-tree'], env)).trim();
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

export const hasDiff = async (
	git: RunGit,
	from: string,
	to: string,
): Promise<boolean> => {
	const result = await git(['diff', '--quiet', from, to]);
	if (result.exitCode === 0) return false;
	if (result.exitCode === 1) return true;
	throw new Error(
		`git diff --quiet ${from} ${to} が失敗しました（exit ${result.exitCode}）: ${result.stderr.trim()}`,
	);
};

export const getDiffStat = async (
	git: RunGit,
	from: string,
	to: string,
): Promise<string> =>
	(await runGitOrThrow(git, ['diff', '--stat', from, to])).trimEnd();

export const revParse = async (git: RunGit, ref: string): Promise<string> =>
	(await runGitOrThrow(git, ['rev-parse', '--verify', ref])).trim();

export const getStatusShort = async (git: RunGit): Promise<string> =>
	(
		await runGitOrThrow(git, ['status', '--short', '--untracked-files=all'])
	).trimEnd();

/** from → to で変わったパス（リポジトリルートからの相対）。-z で日本語パスも引用符なしで受け取る */
export const listChangedPaths = async (
	git: RunGit,
	from: string,
	to: string,
): Promise<string[]> =>
	(
		await runGitOrThrow(git, [
			'diff',
			'--name-only',
			'--no-renames',
			'-z',
			from,
			to,
		])
	)
		.split('\0')
		.filter((path) => path !== '');

/** 本物の index の内容をツリー オブジェクトにする（コミット直前に、レビュー済みのツリーと突き合わせる） */
export const writeIndexTree = async (git: RunGit): Promise<string> =>
	(await runGitOrThrow(git, ['write-tree'])).trim();

/** ツリー内のファイルの内容。そのパスが無ければ null（git は exit 128 で「Not a valid object name」を返す） */
export const readTreeFile = async (
	git: RunGit,
	tree: string,
	path: string,
): Promise<string | null> => {
	const result = await git(['cat-file', 'blob', `${tree}:${path}`]);
	if (result.exitCode === 0) return result.stdout;
	if (result.exitCode === 128) return null;
	throw new Error(
		`git cat-file blob ${tree}:${path} が失敗しました（exit ${result.exitCode}）: ${result.stderr.trim()}`,
	);
};

/** パスが .gitignore で無視されるか（作業用ファイルがスナップショットとコミットに入らないことの確認に使う） */
export const isIgnored = async (git: RunGit, path: string): Promise<boolean> => {
	const result = await git(['check-ignore', '-q', '--no-index', path]);
	if (result.exitCode === 0) return true;
	if (result.exitCode === 1) return false;
	throw new Error(
		`git check-ignore ${path} が失敗しました（exit ${result.exitCode}）: ${result.stderr.trim()}`,
	);
};
