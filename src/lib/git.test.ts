import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	createGitRunner,
	getDiffStat,
	getStatusShort,
	hasDiff,
	isIgnored,
	listChangedPaths,
	type RunGit,
	readTreeFile,
	revParse,
	runGitOrThrow,
	snapshotWorkingTree,
	writeIndexTree,
} from './git';
import { TEST_GIT_ENV } from '../test-support/fixtures';

describe('snapshotWorkingTree', () => {
	let dir: string;
	let git: RunGit;

	// テストごとに、a.txt（one）だけをコミットした一時リポジトリから始める
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'review-loop-git-'));
		git = createGitRunner(dir, TEST_GIT_ENV);
		await runGitOrThrow(git, ['init', '-q', '-b', 'main']);
		await writeFile(join(dir, 'a.txt'), 'one\n');
		await runGitOrThrow(git, ['add', 'a.txt']);
		await runGitOrThrow(git, ['commit', '-q', '-m', 'init']);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test('変更が無ければ HEAD のツリーと同じで、差分も無い', async () => {
		const tree = await snapshotWorkingTree(git);
		expect(tree).toBe(await revParse(git, 'HEAD^{tree}'));
		expect(await hasDiff(git, 'HEAD', tree)).toBe(false);
	});

	test('未追跡ファイルと変更を含むツリーを作り、本物の index は触らない。前回のツリーとの差分で「差分のみ」が切り出せる', async () => {
		await writeFile(join(dir, 'a.txt'), 'two\n');
		await writeFile(join(dir, 'b.txt'), 'new\n');
		const tree = await snapshotWorkingTree(git);
		expect(tree).not.toBe(await revParse(git, 'HEAD^{tree}'));
		expect(await hasDiff(git, 'HEAD', tree)).toBe(true);
		expect(await getDiffStat(git, 'HEAD', tree)).toContain('b.txt');
		expect(await getStatusShort(git)).toBe(' M a.txt\n?? b.txt');
		expect(await snapshotWorkingTree(git)).toBe(tree);

		await writeFile(join(dir, 'c.txt'), 'later\n');
		const next = await snapshotWorkingTree(git);
		const stat = await getDiffStat(git, tree, next);
		expect(stat).toContain('c.txt');
		expect(stat).not.toContain('b.txt');
		expect(await hasDiff(git, tree, next)).toBe(true);
	});

	test('.gitignore のファイルはスナップショットに入らない', async () => {
		await writeFile(join(dir, '.gitignore'), 'ignored.txt\n');
		await writeFile(join(dir, 'ignored.txt'), 'x\n');
		const tree = await snapshotWorkingTree(git);
		const stat = await getDiffStat(git, 'HEAD', tree);
		expect(stat).toContain('.gitignore');
		expect(stat).not.toContain('ignored.txt');
	});

	test('変更パスを列挙でき、git add -f された無視ファイルは本物の index だけに残ってスナップショットと食い違う', async () => {
		await writeFile(join(dir, '.gitignore'), 'ignored.txt\n');
		await writeFile(join(dir, 'ignored.txt'), 'x\n');
		await writeFile(join(dir, 'a.txt'), 'two\n');
		await writeFile(join(dir, 'b.txt'), 'new\n');
		const before = await snapshotWorkingTree(git);
		expect(await listChangedPaths(git, 'HEAD', before)).toEqual([
			'.gitignore',
			'a.txt',
			'b.txt',
		]);
		await runGitOrThrow(git, ['add', '-f', 'ignored.txt']);
		await runGitOrThrow(git, ['add', '-A']);
		const staged = await writeIndexTree(git);
		expect(staged).not.toBe(before);
		expect(await snapshotWorkingTree(git)).toBe(before);
		expect(await listChangedPaths(git, before, staged)).toEqual([
			'ignored.txt',
		]);
	});

	test('ツリー内のファイルを読め、無いパスは null になる', async () => {
		await writeFile(join(dir, 'a.txt'), 'two\n');
		await writeFile(join(dir, 'b.txt'), 'new\n');
		const tree = await snapshotWorkingTree(git);
		expect(await readTreeFile(git, tree, 'a.txt')).toBe('two\n');
		expect(await readTreeFile(git, tree, 'missing.txt')).toBeNull();
		expect(await readTreeFile(git, 'HEAD^{tree}', 'b.txt')).toBeNull();
	});
});

describe('isIgnored', () => {
	test('作業用ディレクトリの .gitignore（中身 *）だけで、その中のファイルが無視される', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'review-loop-ignore-'));
		try {
			const git = createGitRunner(dir, TEST_GIT_ENV);
			await runGitOrThrow(git, ['init', '-q', '-b', 'main']);
			await mkdir(join(dir, '.tmp', 'review-loop'), { recursive: true });
			await writeFile(join(dir, '.tmp', 'review-loop', '.gitignore'), '*\n');
			expect(await isIgnored(git, '.tmp/review-loop/x/state.json')).toBe(true);
			expect(await isIgnored(git, '.tmp/review-loop/.gitignore')).toBe(true);
			expect(await isIgnored(git, '.tmp/other.txt')).toBe(false);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
