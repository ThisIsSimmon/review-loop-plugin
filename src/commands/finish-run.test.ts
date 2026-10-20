import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	checkFinishable,
	describePushState,
	isAppendOnlyChange,
	isOnlyOutOfScopeRecordChange,
	stageReviewedTree,
	validateCommitMessage,
} from './finish-run';
import {
	createGitRunner,
	type RunGit,
	revParse,
	runGitOrThrow,
	snapshotWorkingTree,
} from '../lib/git';
import { TEST_GIT_ENV } from '../test-support/fixtures';

describe('validateCommitMessage', () => {
	test('件名だけ、または件名・空行・本文の形を通す', () => {
		expect(validateCommitMessage('feat(loop): add loop\n')).toEqual([]);
		expect(validateCommitMessage('fix: x\n\n本文\n')).toEqual([]);
		// 件名はちょうど 72 文字まで通す
		expect(validateCommitMessage('a'.repeat(72))).toEqual([]);
	});

	test('空の件名・72 文字超・本文との空行無しを個別に挙げる', () => {
		expect(validateCommitMessage('')).toEqual(['件名（1 行目）が空です']);
		expect(validateCommitMessage('a'.repeat(73))).toEqual([
			'件名が 72 文字を超えています（73 文字）',
		]);
		expect(validateCommitMessage('fix: x\n本文')).toEqual([
			'件名と本文の間に空行が必要です',
		]);
	});
});

describe('isOnlyOutOfScopeRecordChange', () => {
	const TODO = 'docs/out-of-scope-todo.md';

	test('範囲外の記録ファイルだけの変更は通し、他が混ざれば通さない。変更無しは対象外', () => {
		expect(
			isOnlyOutOfScopeRecordChange([TODO], TODO),
		).toBe(true);
		expect(isOnlyOutOfScopeRecordChange([TODO, 'src/a.ts'], TODO)).toBe(
			false,
		);
		expect(isOnlyOutOfScopeRecordChange(['notes/todo.md'], TODO)).toBe(false);
		expect(isOnlyOutOfScopeRecordChange([], TODO)).toBe(false);
	});
});

describe('isAppendOnlyChange', () => {
	test('レビュー済みの本文を先頭に保った末尾への追記だけを通す', () => {
		const before = '| OOS-1 | ... |\n';
		expect(isAppendOnlyChange(before, `${before}| OOS-2 | ... |\n`)).toBe(true);
		expect(isAppendOnlyChange('', before)).toBe(true);
		// 変更なし・削除・既存行の書き換え
		expect(isAppendOnlyChange(before, before)).toBe(false);
		expect(isAppendOnlyChange(before, '')).toBe(false);
		expect(
			isAppendOnlyChange(before, '| OOS-1 | 対応済み |\n| OOS-2 | ... |\n'),
		).toBe(false);
	});
});

describe('checkFinishable', () => {
	const runId = '2026-10-16.183005';

	test.each([
		['ready_to_finish', false, false],
		['ready_to_finish', true, true],
		['awaiting_confirmation', true, false],
	] as const)('%s で --commit %s・autoCommit %s なら締められる', (phase, commit, autoCommit) => {
		expect(checkFinishable({ runId, phase, commit, autoCommit })).toBeNull();
	});

	test('autoCommit=false の Run は、確認待ちを経ずに --commit できない', () => {
		expect(
			checkFinishable({
				runId,
				phase: 'ready_to_finish',
				commit: true,
				autoCommit: false,
			}),
		).toBe(
			'autoCommit=false の Run は確認待ちを経ずにコミットできません。先に --commit 無しで実行し、依頼者の承認を得てください',
		);
	});

	test.each([
		['fixing', false],
		['triaging', true],
		['awaiting_confirmation', false],
	] as const)('%s（--commit %s）は締められない', (phase, commit) => {
		expect(
			checkFinishable({ runId, phase, commit, autoCommit: true }),
		).toContain('のため締められません');
	});
});

describe('describePushState', () => {
	const head = 'c'.repeat(40);
	test('upstream の有無と HEAD との一致を報告する', () => {
		expect(describePushState({ exitCode: 1, stdout: '' }, head)).toContain(
			'upstream が未設定',
		);
		expect(describePushState({ exitCode: 0, stdout: `${head}\n` }, head)).toBe(
			'push 済み（upstream が HEAD と一致）',
		);
		expect(
			describePushState({ exitCode: 0, stdout: 'd'.repeat(40) }, head),
		).toContain('push されていない可能性');
	});
});

describe('stageReviewedTree', () => {
	let dir: string;
	let git: RunGit;

	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), 'review-loop-finish-'));
		git = createGitRunner(dir, TEST_GIT_ENV);
		await runGitOrThrow(git, ['init', '-q', '-b', 'main']);
		await writeFile(join(dir, '.gitignore'), 'ignored.txt\n');
		await writeFile(join(dir, 'a.txt'), 'one\n');
		await runGitOrThrow(git, ['add', '-A']);
		await runGitOrThrow(git, ['commit', '-q', '-m', 'init']);
	});

	afterAll(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test('レビュー済みのツリーと同じ内容ならステージし、git add -f された無視ファイルが index にあれば止める', async () => {
		await writeFile(join(dir, 'a.txt'), 'two\n');
		const tree = await snapshotWorkingTree(git);
		await stageReviewedTree(git, tree);

		await writeFile(join(dir, 'ignored.txt'), 'secret\n');
		await runGitOrThrow(git, ['add', '-f', 'ignored.txt']);
		const head = await revParse(git, 'HEAD');
		await expect(stageReviewedTree(git, tree)).rejects.toThrow(
			'がレビュー済みのツリー',
		);
		expect(await revParse(git, 'HEAD')).toBe(head);
	});
});
